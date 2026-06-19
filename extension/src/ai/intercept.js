/**
 * Shared AI prompt interception helpers.
 */
(function (global) {
  function readPromptText(getPromptRoot) {
    const root = getPromptRoot?.();
    if (!root) return '';
    if (root instanceof HTMLTextAreaElement || root instanceof HTMLInputElement) {
      return root.value || '';
    }
    return root.innerText || root.textContent || '';
  }

  function setPromptText(getPromptRoot, text) {
    const root = getPromptRoot?.();
    if (!root) return false;
    if (root instanceof HTMLTextAreaElement || root instanceof HTMLInputElement) {
      root.value = text;
      root.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    root.textContent = text;
    root.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  async function interceptSubmit({
    getPromptRoot,
    getSubmitControl,
    getSettings,
    runSafe,
    adapterId,
  }) {
    const settings = await getSettings?.();
    if (!global.GoldspireSettings?.isVeilActive?.(settings)) return;

    const text = readPromptText(getPromptRoot).trim();
    if (!text || text.length < 4) return;

    const context = global.GoldspireAiFramework?.buildAiContext?.({ id: adapterId }) || {
      source: 'ai_prompt',
      isAiSurface: true,
      host: location.hostname || '',
    };
    if (settings?.learningHints) context.learningHints = settings.learningHints;
    if (settings?.learningBundle) context.learningBundle = settings.learningBundle;

    const detections = (global.GoldspireDetection?.analyze?.(text, context) || [])
      .filter((hit) => hit.confidence >= (global.GoldspireVeilCopilot?.MIN_CONFIDENCE || 50));

    if (detections.length === 0) return;

    const policyResult = global.GoldspirePolicyEngine?.evaluate?.(detections, context, settings) || {
      action: 'warn',
    };

    if (policyResult.enforced && policyResult.action === 'block') {
      global.GoldspireSecureUI?.showToast?.(
        policyResult.message || 'Organization policy blocked this prompt.',
        'error',
      );
      await global.GoldspireVeilEvents?.emit?.({
        type: 'policy_block',
        category: policyResult.category || detections[0]?.category || '',
        severity: policyResult.severity || detections[0]?.severity || '',
        host: context.host,
        source: 'ai_prompt',
        action: 'block',
        confidence: detections[0]?.confidence || 0,
      });
      return { blocked: true };
    }

    if (policyResult.enforced && policyResult.action === 'auto_mask') {
      const masked = global.GoldspireVeilMask?.maskSensitiveText?.(text, context) || text;
      setPromptText(getPromptRoot, masked);
      global.GoldspireSecureUI?.showToast?.('Prompt sanitized by policy.', 'info');
      return { autoMasked: true, text: masked };
    }

    if (!settings.copilotEnabled && !policyResult.enforced) {
      for (const hit of detections) {
        await global.GoldspireVeilEvents?.emit?.({
          type: 'detection',
          category: hit.category,
          severity: hit.severity,
          host: context.host,
          source: 'ai_prompt',
          action: 'observe',
          confidence: hit.confidence,
        });
      }
      return { observed: true };
    }

    const recommended = global.GoldspireVeilCopilot?.recommendAction?.(context, settings, detections) || '';
    void global.GoldspireVeilDecisions?.logPrompt?.({ context, detections, recommended });

    return new Promise((resolve) => {
      global.GoldspireVeilCopilot?.showCopilotPrompt?.({
        title: 'Sensitive data in AI prompt',
        subtitle: policyResult.message || 'Review before sending to the AI.',
        detections,
        context,
        settings,
        variant: 'ai',
        onDismiss: () => {
          void global.GoldspireVeilDecisions?.logDismiss?.({ context, detections, recommended });
          resolve({ dismissed: true });
        },
        onAction: async (actionId) => {
          void global.GoldspireVeilDecisions?.logChoice?.({
            context,
            detections,
            recommended,
            choice: actionId,
          });
          if (actionId === 'ignore') {
            await global.GoldspireVeilCopilot?.runAction?.('ignore', { text, context, detections, settings });
            resolve({ continued: true });
            return;
          }
          if (actionId === 'mask') {
            const masked = global.GoldspireVeilMask?.maskSensitiveText?.(text, context) || text;
            setPromptText(getPromptRoot, masked);
            await global.GoldspireVeilCopilot?.runAction?.('mask', {
              text: masked,
              context,
              detections,
              settings,
            });
            resolve({ sanitized: true, text: masked });
            return;
          }
          if (actionId === 'block') {
            await global.GoldspireVeilCopilot?.runAction?.('block', { text, context, detections, settings });
            global.GoldspireSecureUI?.showToast?.('Prompt blocked.', 'error');
            resolve({ blocked: true });
            return;
          }
          resolve({ ok: false });
        },
      });
    });
  }

  function wireSubmitInterceptor({ matches, getPromptRoot, getSubmitControl, getSettings, runSafe, adapterId }) {
    if (!matches?.()) return;

    let bypassOnce = false;

    const handler = (event) => {
      if (bypassOnce) {
        bypassOnce = false;
        return;
      }

      runSafe?.((async () => {
        const result = await interceptSubmit({
          getPromptRoot,
          getSubmitControl,
          getSettings,
          runSafe,
          adapterId,
        });

        if (!result) return;

        if (result.blocked || result.dismissed) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation?.();
          return;
        }

        if (result.continued || result.sanitized || result.autoMasked) {
          if (result.continued) {
            bypassOnce = true;
            const control = getSubmitControl?.();
            control?.click?.();
          }
        }
      })());
    };

    document.addEventListener('click', (event) => {
      const control = getSubmitControl?.();
      if (!control) return;
      if (event.target === control || control.contains?.(event.target)) {
        event.preventDefault();
        event.stopPropagation();
        handler(event);
      }
    }, true);

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
      const root = getPromptRoot?.();
      if (!root) return;
      if (document.activeElement !== root && !root.contains?.(document.activeElement)) return;
      event.preventDefault();
      event.stopPropagation();
      handler(event);
    }, true);
  }

  global.GoldspireAiIntercept = {
    readPromptText,
    setPromptText,
    interceptSubmit,
    wireSubmitInterceptor,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
