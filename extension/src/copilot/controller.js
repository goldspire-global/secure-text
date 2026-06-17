/**
 * Veil copilot orchestration — paste, selection, and action dispatch.
 */
(function (global) {
  const MIN_CONFIDENCE = 50;

  function isCopilotEnabled(settings) {
    return settings?.copilotEnabled === true;
  }

  function isVeilActive(settings) {
    return global.GoldspireSettings?.isVeilActive?.(settings) === true;
  }

  function shouldIntercept(settings) {
    if (!isVeilActive(settings)) return false;
    if (isCopilotEnabled(settings)) return true;
    const mode = String(settings.dlpMode || 'off').toLowerCase();
    return mode === 'enforce';
  }

  function isSnoozed() {
    const host = typeof location !== 'undefined' ? location.hostname || '' : '';
    return global.GoldspireVeilSnooze?.isSnoozed?.(host) === true;
  }

  function listCopilotActions(context, settings, detections) {
    const actions = global.GoldspireVeilActionRegistry?.listAvailable?.(context, settings, detections) || [];
    if (context.source === 'ai_prompt' || context.isAiSurface) {
      return actions
        .filter((a) => ['mask', 'block', 'ignore'].includes(a.id) || a.stub)
        .map((a) => {
          if (a.id === 'mask') {
            return { ...a, label: 'Sanitize', description: 'Mask sensitive values before sending' };
          }
          if (a.id === 'ignore') {
            return { ...a, label: 'Continue', description: 'Send without changes' };
          }
          return a;
        });
    }
    return actions.filter((a) => ['encrypt', 'mask', 'tokenize', 'ignore'].includes(a.id) || a.stub);
  }

  function recommendAction(context, settings, detections) {
    if (context.source === 'ai_prompt' || context.isAiSurface) {
      const primary = global.GoldspireVeilActionRegistry?.recommendPrimary?.(detections, context, settings);
      if (primary === 'mask') return 'mask';
      if (primary === 'block') return 'block';
      return 'ignore';
    }
    return global.GoldspireVeilActionRegistry?.recommendPrimary?.(detections, context, settings) || 'ignore';
  }

  async function runAction(actionId, request) {
    if (actionId === 'tokenize') {
      return global.GoldspireVeilActions?.execute?.('tokenize', request);
    }
    return global.GoldspireVeilActions?.execute?.(actionId, request);
  }

  async function applyPasteAction(actionId, { text, target, context, detections, settings, caret }) {
    const request = {
      text,
      context,
      detections,
      settings,
    };

    if (actionId === 'ignore') {
      global.GoldspirePasteInsert?.insertAtCaret?.(caret, text);
      await runAction('ignore', request);
      return { ok: true, inserted: text };
    }

    if (actionId === 'mask') {
      const masked = global.GoldspireVeilMask?.maskSensitiveText?.(text, context) || text;
      const selectionContext = global.GoldspirePasteInsert?.insertAtCaret?.(caret, masked);
      await runAction('mask', { ...request, selectionContext, text: masked });
      return { ok: true, inserted: masked };
    }

    if (actionId === 'encrypt') {
      const selectionContext = global.GoldspirePasteInsert?.insertAtCaret?.(caret, text);
      global.GoldspireSelection?.captureSelection?.();
      const result = await runAction('encrypt', {
        ...request,
        selectionContext,
        options: { silent: false },
      });
      return result;
    }

    if (actionId === 'block') {
      await runAction('block', request);
      global.GoldspireSecureUI?.showToast?.('Paste blocked by policy.', 'error');
      return { ok: true, blocked: true };
    }

    return runAction(actionId, request);
  }

  function showCopilotPrompt({
    title,
    subtitle,
    detections,
    context,
    settings,
    onAction,
    onDismiss,
    variant,
  }) {
    const actions = listCopilotActions(context, settings, detections);
    const recommendedId = recommendAction(context, settings, detections);
    global.GoldspireVeilCopilotUI?.showVeilCopilot?.({
      title,
      subtitle,
      detections,
      actions,
      recommendedId,
      onAction,
      onDismiss,
      variant,
    });
  }

  async function handlePolicyEnforcement({
    policyResult,
    text,
    target,
    context,
    detections,
    settings,
    caret,
  }) {
    const action = policyResult.action;

    if (action === 'block' && policyResult.enforced) {
      await applyPasteAction('block', { text, target, context, detections, settings, caret });
      return { handled: true, blocked: true };
    }

    if (action === 'auto_mask' && policyResult.enforced) {
      await applyPasteAction('mask', { text, target, context, detections, settings, caret });
      global.GoldspireSecureUI?.showToast?.(policyResult.message || 'Masked by policy.', 'info');
      return { handled: true, autoMasked: true };
    }

    if (action === 'warn' || (isCopilotEnabled(settings) && detections.length)) {
      return { handled: false, showCopilot: true, subtitle: policyResult.message || '' };
    }

    if (action === 'allow') {
      if (isCopilotEnabled(settings) && detections.length) {
        return { handled: false, showCopilot: true };
      }
      global.GoldspirePasteInsert?.insertAtCaret?.(caret, text);
      return { handled: true, allowed: true };
    }

    return { handled: false };
  }

  global.GoldspireVeilCopilot = {
    MIN_CONFIDENCE,
    isCopilotEnabled,
    isVeilActive,
    shouldIntercept,
    isSnoozed,
    listCopilotActions,
    recommendAction,
    runAction,
    applyPasteAction,
    showCopilotPrompt,
    handlePolicyEnforcement,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
