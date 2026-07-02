/**
 * Practice page — upgrade legacy textarea to contenteditable so [redacted] inserts as a real link.
 */
(function (global) {
  function isPracticePath() {
    return /\/practice(?:\.html)?$/.test(location.pathname || '');
  }

  function upgradeComposeBody(preserveSelection) {
    const el = document.getElementById('practice-body');
    if (!el || el.dataset.gstPracticeUpgraded === '1') return el;
    if (!(el instanceof HTMLTextAreaElement)) {
      if (el.isContentEditable) el.dataset.gstPracticeUpgraded = '1';
      return el;
    }

    const start = preserveSelection ? (el.selectionStart ?? 0) : 0;
    const end = preserveSelection ? (el.selectionEnd ?? start) : el.value.length;
    const selectedText = el.value.slice(start, end);

    const ce = document.createElement('div');
    ce.id = 'practice-body';
    ce.className = `${el.className} gst-practice-compose`.trim();
    ce.contentEditable = 'true';
    ce.setAttribute('role', 'textbox');
    ce.setAttribute('aria-multiline', 'true');
    ce.setAttribute('aria-label', el.getAttribute('aria-label') || 'Message body');
    ce.spellcheck = false;
    ce.textContent = el.value;
    ce.dataset.gstPracticeUpgraded = '1';
    el.replaceWith(ce);

    if (preserveSelection && selectedText.trim()) {
      const text = ce.textContent || '';
      const index = text.indexOf(selectedText);
      if (index >= 0) {
        ce.focus();
        const walker = document.createTreeWalker(ce, NodeFilter.SHOW_TEXT);
        let pos = 0;
        let node = walker.nextNode();
        while (node) {
          const len = node.textContent.length;
          if (pos + len > index) {
            const range = document.createRange();
            const offset = index - pos;
            range.setStart(node, offset);
            range.setEnd(node, Math.min(len, offset + selectedText.length));
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
            break;
          }
          pos += len;
          node = walker.nextNode();
        }
      }
    }

    return ce;
  }

  function rangeForOffsets(root, start, end) {
    if (!root || typeof start !== 'number' || typeof end !== 'number' || end <= start) return null;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let pos = 0;
    let startNode = null;
    let startOffset = 0;
    let endNode = null;
    let endOffset = 0;
    let node = walker.nextNode();
    while (node) {
      const len = node.textContent.length;
      if (!startNode && pos + len > start) {
        startNode = node;
        startOffset = start - pos;
      }
      if (pos + len >= end) {
        endNode = node;
        endOffset = end - pos;
        break;
      }
      pos += len;
      node = walker.nextNode();
    }
    if (!startNode || !endNode) return null;
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    return range;
  }

  function applyRangeToSelection(range) {
    if (!range) return null;
    const sel = window.getSelection();
    sel?.removeAllRanges?.();
    sel?.addRange?.(range);
    return sel;
  }

  function normalizeInputContext(context) {
    const body = upgradeComposeBody(true);
    if (!body?.isContentEditable || !context?.selectedText?.trim()) return context;

    const selectedText = context.selectedText;
    let start = context.start;
    let end = context.end;
    const fullText = body.textContent || '';

    if (typeof start !== 'number' || typeof end !== 'number' || fullText.slice(start, end) !== selectedText) {
      const index = fullText.indexOf(selectedText);
      if (index < 0) return context;
      start = index;
      end = index + selectedText.length;
    }

    const range = rangeForOffsets(body, start, end);
    if (!range) return context;

    const selection = applyRangeToSelection(range);
    return {
      kind: 'range',
      range,
      selection,
      selectedText,
      editableRoot: body,
    };
  }

  function ensurePlainPhraseLine() {
    const el = document.getElementById('practice-body');
    if (!el) return;
    const text = el instanceof HTMLTextAreaElement
      ? el.value
      : (el.textContent || '');
    if (text.includes('Thanks for your help')) return;
    const suffix = '\n\nThanks for your help on the project.';
    if (el instanceof HTMLTextAreaElement) {
      el.value = `${text.trim()}${suffix}`;
    } else {
      el.appendChild(document.createTextNode(suffix));
    }
  }

  function init() {
    if (!isPracticePath()) return;
    upgradeComposeBody(false);
    ensurePlainPhraseLine();
    document.documentElement.classList.add('gst-practice-page');
    initPracticeBridge();
    maybeAutostartPracticeTour();
  }

  let tourAssetsPromise = null;

  function injectPracticeTourAssets() {
    if (tourAssetsPromise) return tourAssetsPromise;
    const runtime = global.chrome?.runtime;
    if (!runtime?.getURL) {
      tourAssetsPromise = Promise.resolve();
      return tourAssetsPromise;
    }

    tourAssetsPromise = new Promise((resolve) => {
      if (!document.getElementById('gst-practice-tour-css')) {
        const css = document.createElement('link');
        css.id = 'gst-practice-tour-css';
        css.rel = 'stylesheet';
        css.href = runtime.getURL('practice/practice-tour.css');
        document.head.appendChild(css);
      }

      const stalePortalTour = document.querySelector('script[src*="portal/practice-tour.js"], script[src*="practice-tour.js"]:not(#gst-practice-tour-js)');
      stalePortalTour?.remove();

      if (document.getElementById('gst-practice-tour-js')) {
        global.setTimeout(resolve, 250);
        return;
      }

      const script = document.createElement('script');
      script.id = 'gst-practice-tour-js';
      script.src = runtime.getURL('practice/practice-tour.js');
      script.onload = () => resolve();
      script.onerror = () => resolve();
      (document.head || document.documentElement).appendChild(script);
    });
    return tourAssetsPromise;
  }

  function startPracticeTour({ force = false } = {}) {
    const run = () => injectPracticeTourAssets().then(() => {
      document.dispatchEvent(new CustomEvent('veil-practice-start-tour', {
        detail: { force: force === true },
      }));
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
      run();
    }
    return Promise.resolve();
  }

  function maybeAutostartPracticeTour() {
    if (new URLSearchParams(location.search).get('tour') === '1') {
      startPracticeTour({ force: true });
      return;
    }
    const storage = global.chrome?.storage?.sync;
    if (!storage) return;
    storage.get(['practiceTourPending'], (result) => {
      if (global.chrome?.runtime?.lastError) return;
      if (result?.practiceTourPending !== true) return;
      storage.set({ practiceTourPending: false });
      startPracticeTour({ force: true });
    });
  }

  function initPracticeBridge() {
    document.addEventListener('veil-practice-bridge', async (event) => {
      const { requestId, action, payload } = event.detail || {};
      const respond = (data) => {
        document.dispatchEvent(new CustomEvent('veil-practice-bridge-result', {
          detail: { requestId, ...data },
        }));
      };

      const storage = global.chrome?.storage?.sync;
      if (!storage) {
        respond({ ok: false, error: 'extension_unavailable' });
        return;
      }

      try {
        if (action === 'getSettings') {
          const result = await storage.get(['selectionUiMode', 'copilotEnabled']);
          respond({
            ok: true,
            selectionUiMode: result.selectionUiMode || 'smart',
            copilotEnabled: result.copilotEnabled !== false,
          });
          return;
        }
        if (action === 'setHintsMode') {
          const mode = payload?.mode;
          if (!['smart', 'always', 'quiet'].includes(mode)) {
            respond({ ok: false, error: 'invalid_mode' });
            return;
          }
          await storage.set({ selectionUiMode: mode });
          respond({ ok: true, selectionUiMode: mode });
          document.dispatchEvent(new CustomEvent('veil-practice-hints-changed', {
            detail: { mode },
          }));
          return;
        }
        if (action === 'ensureCopilot') {
          await storage.set({ copilotEnabled: true, copilotUserSet: true });
          respond({ ok: true, copilotEnabled: true });
          return;
        }
        if (action === 'openOptionsSheet') {
          document.dispatchEvent(new CustomEvent('veil-practice-open-options'));
          respond({ ok: true });
          return;
        }
        if (action === 'clearSelection') {
          document.dispatchEvent(new CustomEvent('veil-practice-clear-selection'));
          respond({ ok: true });
          return;
        }
      } catch (error) {
        respond({ ok: false, error: error?.message || 'bridge_failed' });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  global.GoldspirePracticeHost = {
    isPracticePath,
    upgradeComposeBody,
    rangeForOffsets,
    applyRangeToSelection,
    normalizeInputContext,
    startPracticeTour,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
