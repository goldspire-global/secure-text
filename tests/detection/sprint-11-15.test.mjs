import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function loadLib() {
  const g = {};
  vm.runInNewContext(readFileSync(join(root, 'extension/src/detection/lib-bundle.js'), 'utf8'), {
    globalThis: g,
  });
  return g.GoldspireDetectionLib;
}

function loadCompliance() {
  const g = {};
  vm.runInNewContext(readFileSync(join(root, 'extension/src/detection/compliance.js'), 'utf8'), {
    globalThis: g,
  });
  return g.GoldspireCompliance;
}

test('findSsns detects formatted SSN', () => {
  const lib = loadLib();
  const hits = lib.findSsns('employee SSN 078-05-1120 on file');
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].category, 'ssn');
});

test('findIbans validates check digits', () => {
  const lib = loadLib();
  const hits = lib.findIbans('pay DE89370400440532013000 today');
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].category, 'iban');
});

test('findIbans detects spaced IBAN', () => {
  const lib = loadLib();
  const hits = lib.findIbans('pay DE89 3704 0044 0532 0130 00 today');
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].category, 'iban');
});

test('findMedicalRecordNumbers detects MRN prefix', () => {
  const lib = loadLib();
  const hits = lib.findMedicalRecordNumbers('MRN: 123456789');
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].category, 'medical_record_number');
});

test('findInternalCompanyRefs detects ticket ids', () => {
  const lib = loadLib();
  const hits = lib.findInternalCompanyRefs('see TICKET-ABC123 for details');
  assert.ok(hits.length >= 1);
});

test('compliance maps medical record to HIPAA', () => {
  const compliance = loadCompliance();
  const frameworks = compliance.frameworksFor('medical_record_number');
  assert.ok(frameworks.includes('HIPAA'));
});

test('compliance attaches to detection results', () => {
  const compliance = loadCompliance();
  const enriched = compliance.attachCompliance({ category: 'credit_card', confidence: 90 });
  assert.ok(enriched.compliance.includes('PCI DSS'));
});

test('AI framework registers gemini and perplexity', () => {
  const g = { GoldspireAiFramework: { register() {}, getAdapters: () => [] } };
  g.GoldspireAiFramework.register = (adapter) => {
    g._adapters = g._adapters || [];
    g._adapters.push(adapter);
  };
  g.GoldspireAiFramework.matchAdapter = (loc) =>
    (g._adapters || []).find((a) => a.matches(loc));

  vm.runInNewContext(readFileSync(join(root, 'extension/src/ai/gemini.js'), 'utf8'), { globalThis: g });
  vm.runInNewContext(readFileSync(join(root, 'extension/src/ai/perplexity.js'), 'utf8'), { globalThis: g });

  assert.equal(g.GoldspireAiFramework.matchAdapter({ hostname: 'gemini.google.com' })?.id, 'gemini');
  assert.equal(g.GoldspireAiFramework.matchAdapter({ hostname: 'www.perplexity.ai' })?.id, 'perplexity');
});

test('tokenize placeholder format parses token id', () => {
  const g = {};
  vm.runInNewContext(readFileSync(join(root, 'extension/src/tokens/format.js'), 'utf8'), { globalThis: g });
  const placeholder = g.GoldspireVeilTokenFormat.formatPlaceholder('vt_test123');
  assert.equal(placeholder, '[veil:vt_test123]');
  const parsed = g.GoldspireVeilTokenFormat.parsePlaceholder(placeholder);
  assert.equal(parsed.tokenId, 'vt_test123');
});

test('team DLP overlay merges into policyFromSettings', () => {
  const g = {
    GoldspireSettings: { normalizeDlpMode: (v) => v },
  };
  vm.runInNewContext(readFileSync(join(root, 'extension/src/policy/schema.js'), 'utf8'), { globalThis: g });
  const policy = g.GoldspireDlpSchema.policyFromSettings({
    dlpMode: 'enforce',
    dlpPolicy: { enabled: true, defaultAction: 'warn' },
    teamDlpPolicy: {
      enabled: true,
      categories: { api_key: { action: 'block', minSeverity: 'high' } },
    },
  });
  assert.equal(policy.categories.api_key.action, 'block');
});
