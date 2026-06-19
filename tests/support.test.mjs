import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { loadDotEnv, hasDatabase } from './scenarios/helpers.mjs';

loadDotEnv();

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadFeedback() {
  const constants = readFileSync(join(repoRoot, 'extension/src/constants.js'), 'utf8');
  const g = { globalThis: {}, URL, fetch: globalThis.fetch };
  vm.runInNewContext(constants, g);
  vm.runInNewContext(readFileSync(join(repoRoot, 'extension/src/feedback.js'), 'utf8'), g);
  return g.globalThis.GoldspireFeedback;
}

test('buildTicketPayload captures diagnostics without secrets', () => {
  const fb = loadFeedback();
  const payload = fb.buildTicketPayload('bug', 'Copilot blocked my name field', {
    version: '1.2.7',
    browser: 'Microsoft Edge',
    profile: 'organization',
    copilot: true,
    orgName: 'AyoTestInc',
    orgId: 'org_abc',
    pageUrl: 'https://mail.google.com/mail/u/0/',
    policyPackId: 'engineering',
    dlpEnabled: true,
    deviceHint: 'abcd1234',
  }, { source: 'extension_popup' });

  assert.equal(payload.kind, 'bug');
  assert.equal(payload.source, 'extension_popup');
  assert.equal(payload.pageHost, 'mail.google.com');
  assert.equal(payload.diagnostics.version, '1.2.7');
  assert.equal(payload.diagnostics.orgId, 'org_abc');
  assert.match(payload.message, /name field/);
});

test('createSupportTicket stores ticket and logs ops event', { skip: !hasDatabase() }, async () => {
  const { createSupportTicket, getSupportTicket, updateSupportTicket } = await import('../api/src/support-service.mjs');
  const { getPool, closePool } = await import('../api/src/db.mjs');

  const result = await createSupportTicket({
    kind: 'bug',
    message: 'Test ticket from automated test — safe message only.',
    source: 'portal',
    contactEmail: 'test@scenario.veil',
    extensionVersion: '1.2.7',
    browser: 'Chrome',
    profile: 'personal',
    diagnostics: { version: '1.2.7', copilot: true },
  }, {});

  assert.match(result.ticketRef, /^VLT-[0-9A-F]{8}$/);

  const detail = await getSupportTicket(result.ticketRef);
  assert.equal(detail.ticket.kind, 'bug');
  assert.ok(detail.ticket.message.includes('automated test'));

  const updated = await updateSupportTicket(result.ticketRef, {
    status: 'resolved',
    resolutionNotes: 'Fixed in test.',
  });
  assert.equal(updated.ticket.status, 'resolved');

  const pool = getPool();
  const opsRow = await pool.query(
    `SELECT kind, code FROM platform_ops_events WHERE kind = 'support_ticket' AND code = $1 LIMIT 1`,
    [result.ticketRef],
  );
  assert.equal(opsRow.rows[0]?.kind, 'support_ticket');

  await pool.query('DELETE FROM support_tickets WHERE ticket_ref = $1', [result.ticketRef]);
  await closePool();
});
