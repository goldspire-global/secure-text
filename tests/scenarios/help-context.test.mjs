import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function loadHelpContext() {
  const g = { globalThis: {} };
  vm.runInNewContext(readFileSync(join(repoRoot, 'extension/src/copy.js'), 'utf8'), g);
  vm.runInNewContext(readFileSync(join(repoRoot, 'extension/src/help-context.js'), 'utf8'), g);
  return g.globalThis.GoldspireHelpContext;
}

test('help context explains smart hints and missing pill', () => {
  const help = loadHelpContext();
  const ctx = help.build(
    { securityProfile: 'personal', selectionUiMode: 'smart', copilotEnabled: true },
    { passphraseReady: true },
  );

  assert.match(ctx.summary, /Personal/);
  assert.match(ctx.summary, /Smart hints/);
  assert.ok(ctx.behaviors.some((item) => item.title.includes('Smart')));
  assert.ok(ctx.troubleshooting.some((item) => item.question.includes('no pill')));
});

test('help context flags quiet mode and copilot off', () => {
  const help = loadHelpContext();
  const quiet = help.build(
    { securityProfile: 'personal', selectionUiMode: 'quiet', copilotEnabled: false },
    { passphraseReady: false },
  );

  assert.match(quiet.summary, /Hints off/);
  assert.match(quiet.summary, /Copilot off/);
  assert.ok(quiet.troubleshooting.some((item) => item.action === 'settings-hints'));
  assert.ok(quiet.troubleshooting.some((item) => item.action === 'settings-copilot'));
  assert.ok(quiet.settingsHints.hints.includes('Off'));
});

test('help context detects snoozed active host', () => {
  const help = loadHelpContext();
  const ctx = help.build(
    { securityProfile: 'organization', selectionUiMode: 'always', copilotEnabled: true, dlpMode: 'off' },
    { snoozedHosts: ['outlook.live.com'], activeHost: 'outlook.live.com', passphraseReady: true },
  );

  assert.ok(ctx.troubleshooting.some((item) => item.question.includes('outlook.live.com')));
});
