import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { repoRoot } from './helpers.mjs';

function loadSelectionHarness() {
  const g = {
    globalThis: null,
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
    window: null,
    document: {
      activeElement: null,
      addEventListener() {},
    },
  };
  g.globalThis = g;
  g.window = g;
  g.window.getSelection = () => null;

  class HTMLElement {}
  class HTMLTextAreaElement extends HTMLElement {
    constructor(value = '') {
      super();
      this.value = value;
      this.selectionStart = 0;
      this.selectionEnd = 0;
      this.readOnly = false;
      this.disabled = false;
      this.isConnected = true;
    }

    focus() {}

    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    }
  }

  class HTMLInputElement extends HTMLElement {}

  g.HTMLElement = HTMLElement;
  g.HTMLTextAreaElement = HTMLTextAreaElement;
  g.HTMLInputElement = HTMLInputElement;

  vm.runInNewContext(readFileSync(join(repoRoot, 'extension/src/selection.js'), 'utf8'), g);
  return { g, HTMLTextAreaElement };
}

test('selection cache survives collapsed selection within grace window', () => {
  const { g, HTMLTextAreaElement } = loadSelectionHarness();
  const textarea = new HTMLTextAreaElement('prefix sk-practice-demo suffix');
  const start = textarea.value.indexOf('sk-practice');
  textarea.setSelectionRange(start, start + 11);
  g.document.activeElement = textarea;

  const sel = g.GoldspireSelection;
  sel.captureSelection();

  const cached = sel.getActiveSelection();
  assert.ok(cached?.selectedText?.startsWith('sk-practice'));

  textarea.setSelectionRange(0, 0);
  sel.captureSelection();

  const restored = sel.getActiveSelection();
  assert.equal(restored?.selectedText, cached.selectedText);
});

test('practice page uses compose intent not admin portal', () => {
  const g = { globalThis: {} };
  g.globalThis = g;
  g.GoldspireConstants = { PORTAL_HOST: 'veil.goldspireventures.com', API_HOST: 'veil-api.goldspireventures.com' };
  g.GoldspireIntentConfig = {
    partnerAdminHostPattern: '$^',
    adminPathPattern: '$^',
    formPathPattern: '$^',
    mailHostPattern: '$^',
    formHostPattern: '$^',
    piiAutocomplete: [],
  };
  vm.runInNewContext(readFileSync(join(repoRoot, 'extension/src/detection/intent.js'), 'utf8'), g);

  const intent = g.GoldspireDetectionIntent.inferIntent(
    { tagName: 'TEXTAREA' },
    {
      host: 'veil.goldspireventures.com',
      path: '/practice.html',
      editorKind: 'textarea',
    },
  );
  assert.equal(intent.intent, 'compose_outbound');
  assert.ok(intent.signals.includes('practice_page'));
});
