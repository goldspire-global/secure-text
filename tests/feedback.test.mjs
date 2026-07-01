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

test('portal feedback fills diagnostics when query params are missing', () => {
  const g = {
    window: {
      location: { search: '', pathname: '/feedback.html', origin: 'https://veil.example.com' },
      GoldspirePortal: { EXTENSION_VERSION: '1.3.3', SUPPORT_EMAIL: 'support@example.com' },
      GoldspirePortalApp: { loadAdminSession: () => null },
    },
    navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0' },
    document: { referrer: '' },
    URLSearchParams,
  };
  g.globalThis = g.window;
  vm.runInNewContext(readFileSync(join(repoRoot, 'portal/feedback.js'), 'utf8'), g);
  const fb = g.window.GoldspirePortalFeedback;
  const resolved = fb.resolveParams(fb.readParams());
  const diag = fb.buildDiagnostics(resolved);
  assert.match(diag, /1\.3\.3/);
  assert.match(diag, /Chrome/);
  assert.match(diag, /Portal visitor/);
  assert.doesNotMatch(diag, /unknown/);
});

test('feedback page URL carries extension metadata', () => {
  const fb = loadFeedback();
  const url = fb.feedbackPageUrl(
    { ORG_PORTAL_URL: 'https://veil.goldspireventures.com/join.html' },
    { v: '1.2.3', browser: 'Chrome', kind: 'falsePositive' },
  );
  assert.equal(url, 'https://veil.goldspireventures.com/feedback.html?v=1.2.3&browser=Chrome&kind=falsePositive');
});
