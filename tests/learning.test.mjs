import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import {
  ingestPlatformDecisions,
  refreshLearningQueue,
  generateLearningProposals,
  getActiveLearningHints,
  updateLearningProposal,
  runLearningAnalysis,
} from '../api/src/learning-service.mjs';
import { signBundlePayload, verifyBundleSignature, publishLearningBundle } from '../api/src/learning-bundle.mjs';
import { buildBundleArtifact } from '../api/src/learning-train.mjs';
import { createOrganization } from '../api/src/admin-service.mjs';
import { joinWithCode } from '../api/src/org-service.mjs';
import { ingestExtensionEvents } from '../api/src/events-service.mjs';

const TEAM_PASS = 'learning-test-passphrase-16chars';

function mockAdminReq(token) {
  return { headers: { authorization: `Bearer ${token}` } };
}

function mockIngestReq(key = '') {
  return { headers: { 'x-ops-ingest-key': key } };
}

test('learning bundle signs and verifies', () => {
  const env = { LEARNING_BUNDLE_SECRET: 'test-secret-for-bundle-signing' };
  const payload = {
    schemaVersion: 1,
    bundleVersion: 'test.1',
    hints: [],
    scorers: [],
  };
  const sig = signBundlePayload(payload, env);
  assert.ok(sig.length >= 64);
  assert.equal(verifyBundleSignature(payload, sig, env), true);
  assert.equal(verifyBundleSignature(payload, 'bad', env), false);
});

test('platform decisions ingest stores metadata only', async () => {
  const env = { OPS_CLIENT_INGEST_KEY: '' };
  const result = await ingestPlatformDecisions(env, mockIngestReq(''), {
    events: [{
      at: Date.now(),
      type: 'decision',
      category: 'swift_bic',
      host: 'signup.example.com',
      action: 'ignore',
      outcome: 'overrode',
      source: 'rec:mask',
      confidence: 72,
      features: { intent: 'form_data_entry', fieldSemantics: ['person_name'] },
      deviceHash: 'anon-device-hash',
      extensionVersion: '1.2.9',
      browser: 'chrome',
      profile: 'personal',
    }],
  });
  assert.equal(result.ingested, 1);
});

test('learning analysis builds queue and proposals from decisions', async () => {
  const created = await createOrganization({
    displayName: `Learning ${randomBytes(3).toString('hex')}`,
    teamPassphrase: TEAM_PASS,
    settings: { membershipPolicy: 'open', productAnalytics: true },
  });

  const deviceId = `learn-dev-${randomBytes(4).toString('hex')}`;
  const joined = await joinWithCode(created.joinCode, deviceId, 'learn@test.veil');

  const host = `forms-${randomBytes(4).toString('hex')}.example.com`;
  const now = Date.now();
  await ingestExtensionEvents(joined.provisionToken, deviceId, {
    events: [
      {
        at: now,
        type: 'decision',
        category: 'swift_bic',
        host,
        action: 'prompt',
        confidence: 80,
        features: { intent: 'form_data_entry', fieldSemantics: ['person_name'] },
      },
      {
        at: now + 1,
        type: 'decision',
        category: 'swift_bic',
        host,
        action: 'ignore',
        outcome: 'overrode',
        source: 'rec:mask',
        confidence: 80,
        features: { intent: 'form_data_entry', fieldSemantics: ['person_name'] },
      },
      {
        at: now + 2,
        type: 'decision',
        category: 'swift_bic',
        host,
        action: 'ignore',
        outcome: 'overrode',
        source: 'rec:mask',
        confidence: 80,
        features: { intent: 'form_data_entry', fieldSemantics: ['person_name'] },
      },
      {
        at: now + 3,
        type: 'decision',
        category: 'swift_bic',
        host,
        action: 'ignore',
        outcome: 'overrode',
        source: 'rec:mask',
        confidence: 80,
        features: { intent: 'form_data_entry', fieldSemantics: ['person_name'] },
      },
    ],
  });

  const refreshed = await refreshLearningQueue(30);
  assert.ok(refreshed.upserted >= 1);

  const generated = await generateLearningProposals({ days: 30, minOverridePct: 30, minPrompts: 1 });
  assert.ok(generated.created >= 1);

  const ref = generated.proposals[0].proposal_ref;
  const approved = await updateLearningProposal(ref, { status: 'approved', reviewer: 'test' });
  assert.equal(approved.status, 'approved');

  const hints = await getActiveLearningHints();
  assert.ok(hints.length >= 1);
  assert.equal(hints[0].category, 'swift_bic');

  const analysis = await runLearningAnalysis(30);
  assert.ok(analysis.summary);

  const artifact = await buildBundleArtifact({ days: 30 });
  assert.ok(Array.isArray(artifact.hints));
  assert.ok(Array.isArray(artifact.scorers));

  const published = await publishLearningBundle({
    payload: artifact,
    changelog: 'test bundle',
    sampleCount: artifact.sampleCount,
    env: { LEARNING_BUNDLE_SECRET: 'test-secret-for-bundle-signing' },
  });
  assert.ok(published.bundleVersion);
});
