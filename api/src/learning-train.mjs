import { getPool } from './db.mjs';
import {
  SCHEMA_VERSION,
  SECRET_CATEGORIES,
  canAutoApplyHint,
  clampAdjust,
  featureFieldSemantic,
  featureIntent,
  registrableHost,
} from './learning-feature-schema.mjs';
import {
  refreshLearningQueue,
  generateLearningProposals,
  updateLearningProposal,
  getLearningSummary,
} from './learning-service.mjs';
import { publishLearningBundle } from './learning-bundle.mjs';

function bucketKey(row) {
  return [
    row.host || '',
    row.category || '',
    featureIntent(row.features || {}),
    featureFieldSemantic(row.features || {}),
  ].map((v) => String(v).toLowerCase()).join('|');
}

async function loadLabeledSamples(days = 30, orgId = '') {
  const pool = getPool();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const orgFilter = orgId ? 'AND org_id = $2' : '';
  const params = orgId ? [since, orgId] : [since];

  const orgRows = await pool.query(
    `SELECT host, category, action, outcome, confidence, features, event_at
     FROM security_events
     WHERE event_type = 'decision' AND event_at >= $1 ${orgFilter}`,
    params,
  );

  const personalRows = orgId
    ? { rows: [] }
    : await pool.query(
      `SELECT host, category, action, outcome, confidence, features, event_at
       FROM platform_decision_events
       WHERE event_type = 'decision' AND event_at >= $1`,
      [since],
    );

  const samples = [];
  for (const row of [...orgRows.rows, ...personalRows.rows]) {
    const features = typeof row.features === 'object' && row.features ? row.features : {};
    const isOverride = row.outcome === 'overrode' || String(row.action || '').startsWith('ignore');
    const isDismiss = row.action === 'dismiss' || row.outcome === 'ignored';
    if (row.action === 'prompt') continue;

    samples.push({
      host: row.host || '',
      registrableHost: registrableHost(row.host),
      category: row.category || '',
      intent: featureIntent(features),
      fieldSemantic: featureFieldSemantic(features),
      confidence: Number(row.confidence) || 0,
      label: isOverride ? 1 : isDismiss ? 0.5 : 0,
      features,
    });
  }
  return samples;
}

function buildBucketStats(samples) {
  const buckets = new Map();
  for (const sample of samples) {
    const key = bucketKey({
      host: sample.host,
      category: sample.category,
      features: {
        intent: sample.intent,
        fieldSemantics: sample.fieldSemantic ? [sample.fieldSemantic] : [],
      },
    });
    if (!buckets.has(key)) {
      buckets.set(key, {
        host: sample.host,
        registrableHost: sample.registrableHost,
        category: sample.category,
        intent: sample.intent,
        fieldSemantic: sample.fieldSemantic,
        overrides: 0,
        agrees: 0,
        dismissals: 0,
        total: 0,
      });
    }
    const b = buckets.get(key);
    b.total += 1;
    if (sample.label >= 1) b.overrides += 1;
    else if (sample.label >= 0.5) b.dismissals += 1;
    else b.agrees += 1;
  }

  return [...buckets.values()].map((b) => {
    const decisions = b.overrides + b.agrees + b.dismissals;
    const overridePct = decisions > 0 ? Math.round((1000 * b.overrides) / decisions) / 10 : 0;
    return { ...b, overridePct, prompts: decisions };
  });
}

function buildHintsFromBuckets(buckets) {
  const hints = [];
  for (const bucket of buckets) {
    if (bucket.prompts < 3 || bucket.overridePct < 30) continue;
    const adjust = clampAdjust(bucket.overridePct >= 60 ? -25 : bucket.overridePct >= 45 ? -18 : -12);
    const suppress = bucket.overridePct >= 70
      && bucket.prompts >= 12
      && !SECRET_CATEGORIES.has(bucket.category);

    hints.push({
      key: `${bucket.host}|${bucket.category}|${bucket.intent}|${bucket.fieldSemantic}`,
      hostPattern: bucket.host || bucket.registrableHost || '*',
      category: bucket.category,
      fieldSemantic: bucket.fieldSemantic || '',
      intent: bucket.intent || '',
      adjustConfidence: adjust,
      suppress,
      active: true,
      evidence: {
        overridePct: bucket.overridePct,
        samples: bucket.prompts,
      },
    });
  }
  return hints;
}

function buildScorersFromBuckets(buckets) {
  const scorers = [];
  for (const bucket of buckets) {
    if (bucket.prompts < 8 || bucket.overridePct < 40) continue;
    if (SECRET_CATEGORIES.has(bucket.category) && bucket.overridePct < 55) continue;

    const rate = Math.min(0.95, bucket.overridePct / 100);
    const logit = Math.log(rate / Math.max(0.05, 1 - rate));
    const intentKey = bucket.intent
      ? `intent_${bucket.intent.replace(/[^a-z0-9_]/gi, '_')}`
      : '';
    const semKey = bucket.fieldSemantic
      ? `sem_${bucket.fieldSemantic.replace(/[^a-z0-9_]/gi, '_')}`
      : '';

    const weights = {
      bias: logit,
      confidence: -0.02,
    };
    if (intentKey) weights[intentKey] = 0.35;
    if (semKey) weights[semKey] = 0.45;
    if (bucket.registrableHost) weights.host_match = 0.25;

    scorers.push({
      id: `risk_${bucket.category}_${bucket.fieldSemantic || 'any'}`,
      category: bucket.category,
      hostPattern: bucket.registrableHost || bucket.host || '',
      threshold: 0.52,
      action: bucket.overridePct >= 65 && !SECRET_CATEGORIES.has(bucket.category) ? 'adjust' : 'adjust',
      adjust: clampAdjust(bucket.overridePct >= 60 ? -22 : -15),
      weights,
      evidence: { overridePct: bucket.overridePct, samples: bucket.prompts },
    });
  }
  return scorers;
}

export async function autoApproveSafeProposals() {
  const pool = getPool();
  const pending = await pool.query(
    `SELECT proposal_ref, suggested_patch, evidence FROM learning_proposals WHERE status = 'pending'`,
  );

  let approved = 0;
  for (const row of pending.rows) {
    const patch = row.suggested_patch || {};
    const evidence = row.evidence || {};
    if (!canAutoApplyHint(patch, evidence)) continue;
    await updateLearningProposal(row.proposal_ref, {
      status: 'approved',
      reviewer: 'auto-train',
      reviewNotes: 'Auto-approved: safe confidence adjust within policy rails.',
    });
    approved += 1;
  }
  return { approved };
}

export async function buildBundleArtifact({ days = 30, orgId = '' } = {}) {
  const samples = await loadLabeledSamples(days, orgId);
  const buckets = buildBucketStats(samples);
  const hints = buildHintsFromBuckets(buckets);
  const scorers = buildScorersFromBuckets(buckets);

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
  const suffix = orgId ? `org-${orgId.slice(0, 8)}` : 'global';
  const bundleVersion = `${stamp}.${suffix}.${samples.length}`;

  const changelog = buckets
    .filter((b) => b.overridePct >= 35)
    .slice(0, 12)
    .map((b) => `${b.host}/${b.category}/${b.fieldSemantic || '*'}: ${b.overridePct}% (n=${b.prompts})`);

  return {
    schemaVersion: SCHEMA_VERSION,
    bundleVersion,
    trainedAt: new Date().toISOString(),
    sampleCount: samples.length,
    hints,
    scorers,
    gatingOverrides: [],
    changelog,
    orgId: orgId || '',
  };
}

export async function trainOrgPrivateBundles(days = 30, env = {}) {
  const pool = getPool();
  const orgs = await pool.query(
    `SELECT id FROM organizations
     WHERE (settings->>'learningPrivate')::boolean = true
       AND COALESCE((settings->>'learningOptOut')::boolean, false) = false`,
  );

  const published = [];
  for (const row of orgs.rows) {
    const artifact = await buildBundleArtifact({ days, orgId: row.id });
    if (artifact.sampleCount < 10) continue;
    const result = await publishLearningBundle({
      payload: artifact,
      orgId: row.id,
      changelog: artifact.changelog.join('\n'),
      sampleCount: artifact.sampleCount,
      env,
    });
    published.push({ orgId: row.id, ...result });
  }
  return { published: published.length, bundles: published };
}

export async function runFullLearningTrain(days = 30, env = {}, options = {}) {
  const publish = options.publish !== false;
  const minPublishSamples = Math.max(0, Number(options.minPublishSamples) || 0);

  const refreshed = await refreshLearningQueue(days);
  const generated = await generateLearningProposals({ days, minOverridePct: 30, minPrompts: 2 });
  const autoApproved = await autoApproveSafeProposals();

  const globalArtifact = await buildBundleArtifact({ days });
  let globalPublish = null;
  let publishSkipped = false;

  if (publish && globalArtifact.sampleCount >= minPublishSamples) {
    globalPublish = await publishLearningBundle({
      payload: globalArtifact,
      changelog: globalArtifact.changelog.join('\n'),
      sampleCount: globalArtifact.sampleCount,
      env,
    });
  } else if (publish) {
    publishSkipped = true;
  }

  const orgPrivate = publish && globalArtifact.sampleCount >= minPublishSamples
    ? await trainOrgPrivateBundles(days, env)
    : { published: 0, bundles: [] };
  const summary = await getLearningSummary(days);

  return {
    ...refreshed,
    proposalsGenerated: generated.created,
    autoApproved: autoApproved.approved,
    globalBundle: globalPublish,
    publishSkipped,
    orgPrivate,
    summary,
    artifact: {
      hints: globalArtifact.hints.length,
      scorers: globalArtifact.scorers.length,
      samples: globalArtifact.sampleCount,
    },
  };
}
