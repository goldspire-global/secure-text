import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function loadBus() {
  const sandbox = {
    globalThis: {
      GoldspireSettings: {
        load: async () => ({ copilotEnabled: true, dlpMode: 'observe' }),
        isVeilActive: () => true,
      },
      GoldspireBrowser: {
        storageGet: async (_area, defaults) => defaults,
        storage: {
          local: {
            set: (data, cb) => {
              sandbox._stored = data;
              cb?.();
            },
          },
        },
      },
    },
  };
  vm.runInNewContext(readFileSync(join(root, 'extension/src/events/bus.js'), 'utf8'), sandbox);
  return { bus: sandbox.globalThis.GoldspireVeilEvents, sandbox };
}

function loadObserveContext() {
  const sandbox = {
    globalThis: {
      GoldspireDetectionContext: {
        createContext: (partial) => ({ ...partial }),
      },
    },
  };
  vm.runInNewContext(readFileSync(join(root, 'extension/src/detection/context.js'), 'utf8'), sandbox);
  vm.runInNewContext(readFileSync(join(root, 'extension/src/observe/context.js'), 'utf8'), sandbox);
  return sandbox.globalThis.GoldspireObserveContext;
}

test('VeilEvents.isEnabled respects copilot and dlp modes', () => {
  const { bus } = loadBus();
  assert.equal(bus.isEnabled({ copilotEnabled: false, dlpMode: 'off' }), false);
  assert.equal(bus.isEnabled({ copilotEnabled: true, dlpMode: 'off' }), true);
  assert.equal(bus.isEnabled({ copilotEnabled: false, dlpMode: 'observe' }), true);
  assert.equal(bus.isEnabled({ copilotEnabled: false, dlpMode: 'enforce' }), true);
});

test('VeilEvents.emit stores metadata without matched content', async () => {
  const { bus, sandbox } = loadBus();
  await bus.emit({
    type: 'detection',
    category: 'credit_card',
    severity: 'high',
    host: 'mail.google.com',
    source: 'paste',
    action: 'observe',
    confidence: 98,
    matchedText: 'should-not-persist',
  });

  const stored = sandbox._stored.gstVeilEvents[0];
  assert.equal(stored.category, 'credit_card');
  assert.equal(stored.source, 'paste');
  assert.equal(stored.matchedText, undefined);
});

test('VeilEvents.sanitizeEntry keeps safe decision features', () => {
  const { bus } = loadBus();
  const entry = bus.sanitizeEntry({
    type: 'decision',
    action: 'ignore',
    outcome: 'overrode',
    features: {
      intent: 'form_data_entry',
      fieldSemantics: ['person_name'],
      categories: ['swift_bic'],
      labelText: 'must-not-appear',
    },
  });
  assert.equal(entry.type, 'decision');
  assert.equal(entry.outcome, 'overrode');
  assert.deepEqual(entry.features.fieldSemantics, ['person_name']);
  assert.equal(entry.features.labelText, 'must-not-appear');
});

test('ObserveContext builds password field context', () => {
  const observe = loadObserveContext();
  const meta = observe.fieldMeta({ tagName: 'INPUT', type: 'password' });
  assert.equal(meta.isPasswordField, true);
  assert.equal(meta.fieldType, 'password');
});

test('shouldLogDetection enforces minimum confidence', () => {
  const observe = loadObserveContext();
  assert.equal(observe.shouldLogDetection({ category: 'jwt', confidence: 90 }), true);
  assert.equal(observe.shouldLogDetection({ category: 'jwt', confidence: 40 }), false);
});
