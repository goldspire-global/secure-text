/**
 * Intent-aware gating — contextual copilot (1.2.3).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import {
  attachCopilotSpy,
  loadExtensionModule,
  loadVeilStack,
  mockTextarea,
  polyfillBrowserGlobals,
  repoRoot,
} from './helpers.mjs';
import { stripeLiveSample } from './fixtures.mjs';

function loadIntentStack() {
  const g = polyfillBrowserGlobals({
    location: { hostname: 'example.com', pathname: '/signup' },
    document: {
      querySelector() { return null; },
      querySelectorAll() { return []; },
    },
  });
  for (const file of [
    'extension/src/detection/intent-config.js',
    'extension/src/detection/context.js',
    'extension/src/detection/intent.js',
    'extension/src/detection/gating.js',
    'extension/src/observe/context.js',
  ]) {
    vm.runInNewContext(readFileSync(join(repoRoot, file), 'utf8'), g);
  }
  return g;
}

function mockSignupField() {
  const form = {
    tagName: 'FORM',
    querySelectorAll() {
      return [
        { autocomplete: 'given-name', placeholder: 'First name', name: 'firstName', getAttribute: (k) => (k === 'autocomplete' ? 'given-name' : '') },
        { autocomplete: 'bday', placeholder: 'Date of birth', name: 'dob', getAttribute: (k) => (k === 'autocomplete' ? 'bday' : '') },
        { autocomplete: 'email', placeholder: 'Email', name: 'email', getAttribute: (k) => (k === 'autocomplete' ? 'email' : '') },
      ];
    },
  };
  return {
    tagName: 'INPUT',
    type: 'email',
    autocomplete: 'email',
    placeholder: 'Email',
    name: 'email',
    parentElement: form,
    closest(sel) {
      return sel === 'form' ? form : null;
    },
    getAttribute(key) {
      if (key === 'autocomplete') return 'email';
      return '';
    },
  };
}

test('intent: signup form infers form_data_entry with expected PII', () => {
  const g = loadIntentStack();
  g.location = { hostname: 'jobs.example.com', pathname: '/signup' };
  const field = mockSignupField();
  const intent = g.GoldspireDetectionIntent.inferIntent(field, {
    host: 'jobs.example.com',
    path: '/signup',
    source: 'type',
    fieldType: 'email',
    isEmailField: true,
    editorKind: 'input',
  });
  assert.equal(intent.intent, 'form_data_entry');
  assert.equal(intent.expectsPii, true);
});

test('gating: typing email on signup form does not prompt', async () => {
  const g = loadVeilStack();
  g.location = { hostname: 'jobs.example.com', pathname: '/signup' };
  const calls = attachCopilotSpy(g);

  const field = mockSignupField();
  field.value = 'jane.doe@company.com';
  field.dispatchEvent = () => {};

  const on = { copilotEnabled: true, dlpMode: 'off' };
  await g.GoldspirePasteObserve.scanTypedField(
    field,
    async () => on,
    () => on,
    () => true,
  );
  assert.equal(calls.length, 0);
});

test('gating: typing sk_live on signup form still prompts', async () => {
  const g = loadVeilStack();
  g.location = { hostname: 'jobs.example.com', pathname: '/signup' };
  const calls = attachCopilotSpy(g);

  const field = mockSignupField();
  field.tagName = 'TEXTAREA';
  field.value = stripeLiveSample();
  field.dispatchEvent = () => {};

  const on = { copilotEnabled: true, dlpMode: 'off' };
  await g.GoldspirePasteObserve.scanTypedField(
    field,
    async () => on,
    () => on,
    () => true,
  );
  assert.equal(calls.length, 1);
});

test('gating: partner admin portal suppresses typing email', async () => {
  const g = loadVeilStack();
  g.location = { hostname: 'partner.microsoft.com', pathname: '/dashboard/listing' };
  const calls = attachCopilotSpy(g);

  const field = mockTextarea('support@goldspireventures.com');
  const on = { copilotEnabled: true, dlpMode: 'off' };
  await g.GoldspirePasteObserve.scanTypedField(
    field,
    async () => on,
    () => on,
    () => true,
  );
  assert.equal(calls.length, 0);
});

test('SWIFT detector rejects name-like false positives', () => {
  const libPath = join(repoRoot, 'extension/src/detection/lib-bundle.js');
  const ctx = { globalThis: {} };
  vm.runInNewContext(readFileSync(libPath, 'utf8'), ctx);
  const lib = ctx.globalThis.GoldspireDetectionLib;

  assert.equal(lib.findSwiftBics('Olaniyan').length, 0);
  assert.equal(lib.findSwiftBics('Goldspire').length, 0);
  assert.ok(lib.findSwiftBics('Bank SWIFT BOFAUS3N').length > 0);
});

test('category snooze after Allow suppresses repeat prompts', async () => {
  const g = loadVeilStack();
  const snooze = loadExtensionModule('extension/src/copilot/snooze.js');
  snooze.GoldspireVeilSnooze.snoozeCategory('partner.microsoft.com', 'api_key');

  const gated = snooze.GoldspireVeilSnooze.isCategorySnoozed('partner.microsoft.com', 'api_key');
  assert.equal(gated, true);
});

test('intent: mail host textarea is compose_outbound', () => {
  const g = loadIntentStack();
  g.location = { hostname: 'mail.google.com', pathname: '/mail/u/0' };
  const field = mockTextarea('');
  const intent = g.GoldspireDetectionIntent.inferIntent(field, {
    host: 'mail.google.com',
    path: '/mail/u/0',
    source: 'paste',
    editorKind: 'textarea',
    fieldType: 'textarea',
  });
  assert.equal(intent.intent, 'compose_outbound');
  assert.equal(intent.outboundRisk, 'high');
});
