/**
 * Paste handler — observe, copilot prompt, and DLP enforcement.
 */
(function (global) {
  const DEDUPE_MS = 2000;
  const MIN_CONFIDENCE = 50;
  let lastPaste = { key: '', at: 0 };

  function isVeilObserveEnabled(settings) {
    if (global.GoldspireVeilEvents?.isEnabled?.(settings)) return true;
    return global.GoldspireSettings?.isVeilActive?.(settings) === true;
  }

  async function logDetections(results, context) {
    if (!global.GoldspireVeilEvents?.emit) return;
    for (const hit of results || []) {
      if (!global.GoldspireObserveContext?.shouldLogDetection?.(hit, MIN_CONFIDENCE)) continue;
      await global.GoldspireVeilEvents.emit({
        type: 'detection',
        category: hit.category,
        severity: hit.severity,
        host: context.host || '',
        source: context.source || 'paste',
        action: 'observe',
        confidence: hit.confidence,
      });
    }
  }

  async function showPasteCopilot({
    text,
    target,
    caret,
    context,
    detections,
    settings,
    subtitle,
  }) {
    return new Promise((resolve) => {
      global.GoldspireVeilCopilot?.showCopilotPrompt?.({
        title: 'Sensitive data pasted',
        subtitle,
        detections,
        context,
        settings,
        onDismiss: () => resolve({ dismissed: true }),
        onAction: async (actionId) => {
          const result = await global.GoldspireVeilCopilot?.applyPasteAction?.(actionId, {
            text,
            target,
            caret,
            context,
            detections,
            settings,
          });
          resolve({ actionId, ...result });
        },
      });
    });
  }

  async function handlePaste(event, getSettings) {
    const settings = await getSettings();
    if (!isVeilObserveEnabled(settings)) return;

    const clipboard = event.clipboardData;
    const text = clipboard?.getData?.('text/plain') || '';
    const trimmed = text.trim();
    if (!trimmed || trimmed.length < 4) return;

    const context = global.GoldspireObserveContext?.contextFromTarget?.(event.target, {
      source: 'paste',
    }) || { source: 'paste', host: location.hostname || '' };

    if (global.GoldspireVeilSnooze?.isSnoozed?.(context.host)) return;

    const dedupeKey = global.GoldspireObserveContext?.pasteDedupeKey?.(trimmed, context.host) || trimmed;
    const now = Date.now();
    if (dedupeKey === lastPaste.key && now - lastPaste.at < DEDUPE_MS) return;
    lastPaste = { key: dedupeKey, at: now };

    const results = global.GoldspireDetection?.analyze?.(trimmed, context) || [];
    const detections = results.filter((hit) => hit.confidence >= MIN_CONFIDENCE);
    if (detections.length === 0) return;

    const policyResult = global.GoldspirePolicyEngine?.evaluate?.(detections, context, settings) || {
      action: 'allow',
    };

    const intercept = global.GoldspireVeilCopilot?.shouldIntercept?.(settings);
    const caret = global.GoldspirePasteInsert?.getCaretState?.(event.target);

    if (!intercept) {
      await logDetections(detections, context);
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const enforcement = await global.GoldspireVeilCopilot?.handlePolicyEnforcement?.({
      policyResult,
      text: trimmed,
      target: event.target,
      context,
      detections,
      settings,
      caret,
    });

    if (enforcement?.handled) {
      if (!enforcement.blocked) await logDetections(detections, context);
      return;
    }

    if (enforcement?.showCopilot || (settings.copilotEnabled && detections.length)) {
      await showPasteCopilot({
        text: trimmed,
        target: event.target,
        caret,
        context,
        detections,
        settings,
        subtitle: enforcement?.subtitle || policyResult.message || '',
      });
      return;
    }

    await logDetections(detections, context);
    global.GoldspirePasteInsert?.insertAtCaret?.(caret, trimmed);
  }

  function initPasteObserve({ getSettings, runSafe }) {
    if (!getSettings || !runSafe) return;

    document.addEventListener(
      'paste',
      (event) => {
        runSafe(handlePaste(event, getSettings));
      },
      true,
    );
  }

  global.GoldspirePasteObserve = {
    initPasteObserve,
    handlePaste,
    isVeilObserveEnabled,
    MIN_CONFIDENCE,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
