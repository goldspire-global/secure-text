/**
 * Selection copilot — Veil bar when sensitive text is highlighted.
 */
(function (global) {
  const BAR_ID = 'goldspire-veil-selection-copilot';
  let lastKey = '';
  let visible = false;

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function ensureBar() {
    let bar = document.getElementById(BAR_ID);
    if (bar) return bar;

    bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.className = 'gst-veil-selection-bar';
    bar.innerHTML = `
      <span class="gst-veil-selection-bar__label">Veil</span>
      <span class="gst-veil-selection-bar__hint"></span>
      <div class="gst-veil-selection-bar__actions"></div>
      <button type="button" class="gst-veil-selection-bar__close" title="Dismiss">✕</button>
    `;
    document.documentElement.appendChild(bar);

    bar.querySelector('.gst-veil-selection-bar__close')?.addEventListener('click', () => {
      global.GoldspireVeilSnooze?.snoozeSession?.();
      hide();
    });

    return bar;
  }

  function hide() {
    const bar = document.getElementById(BAR_ID);
    if (!bar) return;
    bar.classList.remove('gst-veil-selection-bar--visible');
    visible = false;
    lastKey = '';
  }

  async function onSelectionAction(actionId, { text, context, detections, settings, selectionContext }) {
    if (actionId === 'tokenize') {
      await global.GoldspireVeilCopilot?.runAction?.('tokenize', {
        text,
        context,
        detections,
        settings,
        selectionContext,
      });
      hide();
      return;
    }
    if (actionId === 'ignore') {
      hide();
      return;
    }
    await global.GoldspireVeilCopilot?.runAction?.(actionId, {
      text,
      context,
      detections,
      settings,
      selectionContext,
      options: actionId === 'encrypt' ? { showSecureOptions: true } : undefined,
    });
    hide();
  }

  function render({ text, context, detections, settings, selectionContext }) {
    if (!global.GoldspireVeilCopilot?.isCopilotEnabled?.(settings)) {
      hide();
      return;
    }
    if (global.GoldspireVeilSnooze?.isSnoozed?.(context.host)) {
      hide();
      return;
    }
    if (!text?.trim() || detections.length === 0) {
      hide();
      return;
    }

    const key = `${text.slice(0, 64)}:${detections.map((d) => d.category).join(',')}`;
    if (key === lastKey && visible) return;
    lastKey = key;

    const bar = ensureBar();
    const hint = bar.querySelector('.gst-veil-selection-bar__hint');
    const actionsEl = bar.querySelector('.gst-veil-selection-bar__actions');
    const categories = [...new Set(detections.map((d) => d.category))].join(', ');
    if (hint) hint.textContent = categories.replace(/_/g, ' ');

    const actions = global.GoldspireVeilCopilot?.listCopilotActions?.(context, settings, detections) || [];
    actionsEl.innerHTML = '';
    for (const action of actions) {
      if (action.id === 'ignore') continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gst-veil-selection-bar__btn';
      btn.textContent = action.stub ? `${action.label} (soon)` : action.label;
      btn.disabled = action.stub || action.available === false;
      btn.addEventListener('click', () => {
        onSelectionAction(action.id, { text, context, detections, settings, selectionContext });
      });
      actionsEl.appendChild(btn);
    }

    bar.classList.add('gst-veil-selection-bar--visible');
    visible = true;
  }

  function refresh(getDeps) {
    if (!getDeps) return;
    const { getPreview, getSelectionContext, getSettings, isComposeContext } = getDeps;
    const preview = getPreview?.() || '';
    const trimmed = preview.trim();
    if (!trimmed || trimmed.length < 4) {
      hide();
      return;
    }

    Promise.resolve(getSettings?.()).then((settings) => {
      if (!global.GoldspireVeilCopilot?.isCopilotEnabled?.(settings)) {
        hide();
        return;
      }
      if (!isComposeContext?.()) {
        hide();
        return;
      }

      const selectionContext = getSelectionContext?.() || null;
      const context = global.GoldspireObserveContext?.contextFromTarget?.(document.activeElement, {
        source: 'selection',
      }) || { source: 'selection', host: location.hostname || '' };

      const detections = (global.GoldspireDetection?.analyze?.(trimmed, context) || [])
        .filter((hit) => hit.confidence >= global.GoldspireVeilCopilot.MIN_CONFIDENCE);

      if (detections.length === 0) {
        hide();
        return;
      }

      render({
        text: trimmed,
        context,
        detections,
        settings,
        selectionContext,
      });
    }).catch(() => hide());
  }

  function initSelectionCopilot(getDeps) {
    if (!getDeps) return;
    let timer = null;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => refresh(getDeps), 450);
    };
    document.addEventListener('selectionchange', schedule);
    document.addEventListener('mouseup', () => window.setTimeout(schedule, 0));
    document.addEventListener('keyup', schedule);
  }

  global.GoldspireVeilSelectionCopilot = {
    initSelectionCopilot,
    refresh,
    hide,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
