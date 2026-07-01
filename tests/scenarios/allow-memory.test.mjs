import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadExtensionModule, repoRoot } from './helpers.mjs';
import vm from 'node:vm';

function loadAllowMemory(extra = {}) {
  const storage = { local: {} };
  const g = loadExtensionModule('extension/src/learning/safety.js');
  vm.runInNewContext(readFileSync(join(repoRoot, 'extension/src/copilot/snooze.js'), 'utf8'), g);
  g.GoldspireBrowser = {
    storageGet: async (_area, keys) => {
      const out = {};
      for (const key of Object.keys(keys)) {
        out[key] = storage.local[key] ?? keys[key];
      }
      return out;
    },
    storage: {
      local: {
        set: (obj) => {
          Object.assign(storage.local, obj);
        },
      },
    },
  };
  g.GoldspireVeilDecisions = { logChoice: () => {} };
  vm.runInNewContext(readFileSync(join(repoRoot, 'extension/src/copilot/allow-memory.js'), 'utf8'), g);
  return { g, storage };
}

test('filterPromptableDetections drops site-allowed non-secret categories', async () => {
  const { g, storage } = loadAllowMemory();
  storage.local.gstSiteAllowRules = [
    { host: 'chatgpt.com', category: 'iban', intent: 'ai_prompt', createdAt: Date.now() },
  ];
  await g.GoldspireVeilAllowMemory.loadSiteAllowRules();

  const detections = [
    { category: 'iban', confidence: 80 },
    { category: 'email', confidence: 70 },
  ];
  const filtered = g.GoldspireVeilAllowMemory.filterPromptableDetections(
    detections,
    'chatgpt.com',
    { intent: 'ai_prompt' },
  );

  assert.deepEqual(filtered.map((d) => d.category), ['email']);
});

test('canRememberSiteAllow is false for secret categories', () => {
  const { g } = loadAllowMemory();
  assert.equal(g.GoldspireVeilAllowMemory.canRememberSiteAllow([{ category: 'api_key' }]), false);
  assert.equal(g.GoldspireVeilAllowMemory.canRememberSiteAllow([{ category: 'iban' }]), true);
});

test('recordAllow with site scope persists rules and skips secrets', async () => {
  const { g, storage } = loadAllowMemory();
  await g.GoldspireVeilAllowMemory.recordAllow({
    host: 'mail.google.com',
    text: 'DE89370400440532013000',
    detections: [
      { category: 'iban', confidence: 90 },
      { category: 'password', confidence: 95 },
    ],
    context: { intent: 'compose' },
    scope: 'site',
  });

  const rules = storage.local.gstSiteAllowRules || [];
  assert.equal(rules.length, 1);
  assert.equal(rules[0].host, 'mail.google.com');
  assert.equal(rules[0].category, 'iban');
  assert.equal(rules[0].intent, 'compose');
});

test('site allow rules respect intent wildcard', async () => {
  const { g, storage } = loadAllowMemory();
  storage.local.gstSiteAllowRules = [
    { host: 'example.com', category: 'phone', intent: '*', createdAt: Date.now() },
  ];
  await g.GoldspireVeilAllowMemory.loadSiteAllowRules();

  const filtered = g.GoldspireVeilAllowMemory.filterPromptableDetections(
    [{ category: 'phone', confidence: 80 }],
    'example.com',
    { intent: 'form' },
  );
  assert.equal(filtered.length, 0);
});
