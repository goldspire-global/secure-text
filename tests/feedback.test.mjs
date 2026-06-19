import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadFeedback() {
  const constants = readFileSync(join(repoRoot, 'extension/src/constants.js'), 'utf8');
  const g = { globalThis: {}, URL };
  vm.runInNewContext(constants, g);
  vm.runInNewContext(readFileSync(join(repoRoot, 'extension/src/feedback.js'), 'utf8'), g);
  return g.globalThis.GoldspireFeedback;
}

test('feedback builds mailto with diagnostics and no secrets in template', () => {
  const fb = loadFeedback();
  const support = fb.supportEmail();
  const mailto = fb.buildMailtoUrl('bug', {
    diagnostics: fb.buildDiagnostics({
      version: '1.2.3',
      browser: 'Microsoft Edge',
      profile: 'organization',
      copilot: true,
      pageUrl: 'https://mail.google.com/mail/u/0',
    }),
  });
  assert.ok(mailto.startsWith(`mailto:${support}?`));
  assert.match(mailto, /Veil%20issue%20report/);
  assert.match(mailto, /1\.2\.3/);
  assert.match(mailto, /Microsoft%20Edge/);
});

test('feedback sanitizes page URLs to origin and path only', () => {
  const fb = loadFeedback();
  assert.equal(
    fb.sanitizePageUrl('https://mail.google.com/mail/u/0/?tab=rm#inbox'),
    'https://mail.google.com/mail/u/0/',
  );
  assert.equal(fb.sanitizePageUrl('chrome-extension://abc/popup.html'), '');
});

test('feedback page URL carries extension metadata', () => {
  const fb = loadFeedback();
  const url = fb.feedbackPageUrl(
    { ORG_PORTAL_URL: 'https://join-veil.goldspireventures.com/join.html' },
    { v: '1.2.3', browser: 'Chrome', kind: 'falsePositive' },
  );
  assert.equal(url, 'https://join-veil.goldspireventures.com/feedback.html?v=1.2.3&browser=Chrome&kind=falsePositive');
});
