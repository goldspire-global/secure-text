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

  async function applyPasteAction(actionId, {
    text,
    target,
    context,
    detections,
    settings,
    caret,
    alreadyInserted = false,
    fieldState = null,
    match = null,
    selectionContext = null,
    allowScope = 'session',
  }) {
    const request = {
      text,
      context,
      detections,
      settings,
      allowScope,
    };

    if (actionId === 'ignore') {
      let nextFieldState = fieldState;
      if (!alreadyInserted && text) {
        const existing = fieldState?.text
          ?? global.GoldspirePasteInsert?.readFieldState?.(target)?.text
          ?? '';
        if (!existing.includes(text)) {
          if (target) {
            global.GoldspirePasteInsert?.insertIntoTarget?.(target, text, caret, { collapseCaret: true });
          } else {
            global.GoldspirePasteInsert?.insertAtCaret?.({ ...caret, collapseCaret: true }, text);
          }
          nextFieldState = global.GoldspirePasteInsert?.readFieldState?.(target) || fieldState;
        }
      }
      await global.GoldspireVeilAllowMemory?.recordAllow?.({
        host: context.host,
        text,
        match,
        fieldState: nextFieldState,
        detections,
        context,
        scope: request.allowScope === 'site' ? 'site' : 'session',
      });
      await runAction('ignore', request);
      return { ok: true, inserted: text };
    }

    if (actionId === 'mask') {
      const masked = global.GoldspireVeilMask?.maskWithPreservedWhitespace?.(text, context)
        || global.GoldspireVeilMask?.maskSensitiveText?.(text, context)
        || text;
      let nextSelection = selectionContext;
      if (alreadyInserted && fieldState && match?.raw) {
        nextSelection = global.GoldspirePasteInsert?.replaceFieldMatch?.(fieldState, match.raw, masked);
      } else {
        nextSelection = global.GoldspirePasteInsert?.insertAtCaret?.(caret, masked);
      }
      await runAction('mask', { ...request, selectionContext: nextSelection, text: masked });
      return { ok: true, inserted: masked };
    }

    if (actionId === 'encrypt') {
      let nextSelection = selectionContext;
      if (!nextSelection) {
        if (alreadyInserted && fieldState && match?.raw) {
          nextSelection = global.GoldspirePasteInsert?.buildSelectionForMatch?.(fieldState, match);
        } else {
          nextSelection = global.GoldspirePasteInsert?.insertAtCaret?.(caret, text);
        }
      }
      if (nextSelection?.selectedText?.trim()) {
        global.GoldspireSelection?.rememberSelection?.(nextSelection);
      }
      const result = await runAction('encrypt', {
        ...request,
        selectionContext: nextSelection,
        options: { showSecureOptions: false, silent: false },
      });
      return result;
    }

    if (actionId === 'tokenize') {
      let nextSelection = selectionContext;
      if (!nextSelection) {
        if (alreadyInserted && fieldState && match?.raw) {
          nextSelection = global.GoldspirePasteInsert?.buildSelectionForMatch?.(fieldState, match);
        } else {
          nextSelection = global.GoldspirePasteInsert?.insertAtCaret?.(caret, text);
        }
      }
      return runAction('tokenize', {
        ...request,
        selectionContext: nextSelection,
        fieldState,
        match,
        alreadyInserted,
      });
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
    alreadyInserted = false,
  }) {
    const actions = listCopilotActions(context, settings, detections);
    const recommendedId = recommendAction(context, settings, detections);
    global.GoldspireVeilCopilotUI?.showVeilCopilot?.({
      title,
      subtitle,
      detections,
      context,
      actions,
      recommendedId,
      onAction,
      onDismiss,
      variant,
      alreadyInserted,
    });
    void global.GoldspireWeeklyDigest?.record?.('copilot');
  }

  async function handlePolicyEnforcement({
    policyResult,
    text,
    target,
    context,
    detections,
    settings,
    caret,
    alreadyInserted = false,
    fieldState = null,
    match = null,
  }) {
    const action = policyResult.action;
    const actionArgs = {
      text,
      target,
      context,
      detections,
      settings,
      caret,
      alreadyInserted,
      fieldState,
      match,
    };

    if (action === 'block' && policyResult.enforced) {
      if (!alreadyInserted) {
        await applyPasteAction('block', actionArgs);
      } else if (fieldState && match?.raw) {
        global.GoldspirePasteInsert?.replaceFieldMatch?.(fieldState, match.raw, '');
        global.GoldspireSecureUI?.showToast?.('Sensitive text removed by policy.', 'error');
      } else {
        global.GoldspireSecureUI?.showToast?.('Paste blocked by policy.', 'error');
      }
      return { handled: true, blocked: true };
    }

    if (action === 'auto_mask' && policyResult.enforced) {
      await applyPasteAction('mask', actionArgs);
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
      if (!alreadyInserted) {
        global.GoldspirePasteInsert?.insertIntoTarget?.(target, text, caret, { collapseCaret: true })
          || global.GoldspirePasteInsert?.insertAtCaret?.({ ...caret, collapseCaret: true }, text);
      }
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
