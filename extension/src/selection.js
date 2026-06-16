/**
 * Reliable selection capture for inputs, textareas, and contenteditable editors.
 * Caches the last selection so popup / context-menu actions still work after focus changes.
 */
(function (global) {
  const CACHE_TTL_MS = 60_000;
  let cached = null;

  function isEditableElement(element) {
    if (!element) return false;
    if (element instanceof HTMLInputElement) {
      return !element.readOnly && !element.disabled && /^(?:text|password|search|email|url|tel)$/i.test(element.type || 'text');
    }
    if (element instanceof HTMLTextAreaElement) {
      return !element.readOnly && !element.disabled;
    }
    if (element.isContentEditable) return true;
    return element.getAttribute?.('contenteditable') === 'true';
  }

  function readInputSelection(element) {
    const start = element.selectionStart ?? 0;
    const end = element.selectionEnd ?? 0;
    const selectedText = element.value.slice(start, end);
    if (!selectedText || start === end) return null;
    return {
      kind: 'input',
      element,
      selectedText,
      start,
      end,
    };
  }

  function readRangeSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

    const selectedText = selection.toString();
    if (!selectedText.trim()) return null;

    const range = selection.getRangeAt(0);
    const editableRoot =
      range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement;

    return {
      kind: 'range',
      selection,
      range: range.cloneRange(),
      selectedText,
      editableRoot: editableRoot?.closest?.('[contenteditable=""], [contenteditable="true"]') || null,
    };
  }

  function buildSelectionContext() {
    const active = document.activeElement;

    if (active && isEditableElement(active)) {
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        const inputSelection = readInputSelection(active);
        if (inputSelection) return inputSelection;
      }
    }

    const rangeSelection = readRangeSelection();
    if (rangeSelection) return rangeSelection;

    if (active && isEditableElement(active) && active instanceof HTMLElement) {
      const nested = readRangeSelection();
      if (nested) return nested;
    }

    return null;
  }

  // Insertion context (caret) for contenteditable and inputs with no selection.
  function buildInsertionContext() {
    const active = document.activeElement;

    if (active && isEditableElement(active)) {
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        const start = active.selectionStart ?? active.value.length;
        const end = active.selectionEnd ?? start;
        return {
          kind: 'input',
          element: active,
          selectedText: active.value.slice(start, end) || '',
          start,
          end,
        };
      }
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    const editableRoot =
      range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement;
    return {
      kind: 'range',
      selection,
      range: range.cloneRange(),
      selectedText: selection.toString() || '',
      editableRoot: editableRoot?.closest?.('[contenteditable=""], [contenteditable="true"]') || null,
    };
  }

  function remember(context) {
    if (!context?.selectedText?.trim()) return null;

    if (context.kind === 'input') {
      cached = {
        at: Date.now(),
        context: {
          kind: 'input',
          selectedText: context.selectedText,
          start: context.start,
          end: context.end,
          element: context.element,
        },
      };
      return context;
    }

    cached = {
      at: Date.now(),
      context: {
        kind: 'range',
        selectedText: context.selectedText,
        range: context.range.cloneRange(),
      },
    };
    return context;
  }

  function restoreCached() {
    if (!cached || Date.now() - cached.at > CACHE_TTL_MS) return null;

    const stored = cached.context;
    if (stored.kind === 'input') {
      const { element, start, end, selectedText } = stored;
      if (!element?.isConnected) return null;
      const current = element.value.slice(start, end);
      if (current !== selectedText) {
        const index = element.value.indexOf(selectedText);
        if (index === -1) return null;
        return {
          kind: 'input',
          element,
          selectedText,
          start: index,
          end: index + selectedText.length,
        };
      }
      element.focus();
      element.setSelectionRange(start, end);
      return { kind: 'input', element, selectedText, start, end };
    }

    return {
      kind: 'range',
      selectedText: stored.selectedText,
      range: stored.range.cloneRange(),
      selection: window.getSelection(),
    };
  }

  function clearCache() {
    cached = null;
  }

  function captureSelection() {
    const live = buildSelectionContext();
    if (live?.selectedText?.trim()) return remember(live);
    clearCache();
    return null;
  }

  function getLivePreview() {
    return buildSelectionContext()?.selectedText?.trim() || '';
  }

  function getActiveSelection(options = {}) {
    const live = buildSelectionContext();
    if (live?.selectedText?.trim()) return remember(live);

    if (options.allowCached !== false) {
      const restored = restoreCached();
      if (restored?.selectedText?.trim()) return restored;
    }

    if (options.fallbackText?.trim()) {
      return {
        kind: 'fallback',
        selectedText: options.fallbackText,
      };
    }

    return null;
  }

  function initSelectionTracking() {
    document.addEventListener('selectionchange', () => {
      captureSelection();
    });

    document.addEventListener('mouseup', () => {
      window.setTimeout(captureSelection, 0);
    });

    document.addEventListener('keyup', () => {
      captureSelection();
    });

    document.addEventListener(
      'contextmenu',
      () => {
        captureSelection();
      },
      true,
    );
  }

  global.GoldspireSelection = {
    captureSelection,
    getActiveSelection,
    buildSelectionContext,
    buildInsertionContext,
    initSelectionTracking,
    clearCache,
    getLivePreview,
    getCachedPreview() {
      return cached?.context?.selectedText?.trim() || '';
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
