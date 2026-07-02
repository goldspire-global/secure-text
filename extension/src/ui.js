(function (global) {
  const PROMPT_ID = 'goldspire-veil-prompt';
  const TOAST_ID = 'goldspire-veil-toast';
  let activePromptKeyHandler = null;
  let activeOutsideDismiss = null;

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatCompactUrl(url) {
    if (!url || typeof url !== 'string') return '';
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, '');
      const path = parsed.pathname.replace(/\/unlock\.html$/i, '/unlock');
      return `${host}${path}…`;
    } catch {
      return url.length > 42 ? `${url.slice(0, 38)}…` : url;
    }
  }

  function showToast(message, type = 'info') {
    document.getElementById(TOAST_ID)?.remove();

    const toast = document.createElement('div');
    toast.id = TOAST_ID;
    toast.className = `gst-toast gst-toast--${type}`;
    toast.textContent = message;
    document.documentElement.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('gst-toast--visible');
    });

    window.setTimeout(() => dismissToast(toast), 3200);
  }

  let activeActionToastTimer = null;

  function showActionToast({
    message,
    type = 'info',
    durationMs = 5000,
    actionLabel = 'Undo',
    onAction,
  } = {}) {
    document.getElementById(TOAST_ID)?.remove();
    if (activeActionToastTimer) {
      window.clearTimeout(activeActionToastTimer);
      activeActionToastTimer = null;
    }

    const toast = document.createElement('div');
    toast.id = TOAST_ID;
    toast.className = `gst-toast gst-toast--${type} gst-toast--action`;
    toast.innerHTML = `
      <span class="gst-toast__message">${escapeHtml(message)}</span>
      <button type="button" class="gst-toast__action">${escapeHtml(actionLabel)}</button>
    `;
    document.documentElement.appendChild(toast);

    const dismiss = () => {
      if (activeActionToastTimer) {
        window.clearTimeout(activeActionToastTimer);
        activeActionToastTimer = null;
      }
      dismissToast(toast);
    };

    toast.querySelector('.gst-toast__action')?.addEventListener('click', () => {
      dismiss();
      try {
        const result = onAction?.();
        if (result && typeof result.then === 'function') {
          result.catch(() => {});
        }
      } catch {
        // Non-critical.
      }
    });

    requestAnimationFrame(() => {
      toast.classList.add('gst-toast--visible');
    });

    activeActionToastTimer = window.setTimeout(dismiss, durationMs);
  }

  function removePrompt() {
    if (activePromptKeyHandler) {
      document.removeEventListener('keydown', activePromptKeyHandler);
      activePromptKeyHandler = null;
    }
    if (activeOutsideDismiss) {
      document.removeEventListener('mousedown', activeOutsideDismiss, true);
      activeOutsideDismiss = null;
    }
    const el = document.getElementById(PROMPT_ID);
    if (!el) return;
    el.classList.add('gst-ui--exit');
    window.setTimeout(() => el.remove(), 240);
  }

  function attachOutsideDismiss(rootEl, onCancel) {
    if (activeOutsideDismiss) {
      document.removeEventListener('mousedown', activeOutsideDismiss, true);
      activeOutsideDismiss = null;
    }
    activeOutsideDismiss = (event) => {
      if (!rootEl.isConnected) {
        document.removeEventListener('mousedown', activeOutsideDismiss, true);
        activeOutsideDismiss = null;
        return;
      }
      if (rootEl.contains(event.target)) return;
      if (event.target.closest?.('.practice-tour')) return;
      document.removeEventListener('mousedown', activeOutsideDismiss, true);
      activeOutsideDismiss = null;
      removePrompt();
      onCancel?.();
    };
    window.setTimeout(() => {
      if (activeOutsideDismiss) {
        document.addEventListener('mousedown', activeOutsideDismiss, true);
      }
    }, 0);
  }

  function dismissToast(toast) {
    if (!toast) return;
    toast.classList.remove('gst-toast--visible');
    window.setTimeout(() => toast.remove(), 220);
  }

  function attachPromptKeyboard(onCancel) {
    if (activePromptKeyHandler) {
      document.removeEventListener('keydown', activePromptKeyHandler);
    }
    activePromptKeyHandler = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        removePrompt();
        onCancel?.();
      }
    };
    document.addEventListener('keydown', activePromptKeyHandler);
  }

  function renderField(field) {
    if (field.type === 'radio-group') {
      const options = field.options
        .map(
          (option) => `
            <label class="gst-radio">
              <input type="radio" name="${field.name}" value="${escapeHtml(option.value)}" ${option.checked ? 'checked' : ''} />
              <span>${escapeHtml(option.label)}</span>
            </label>
          `,
        )
        .join('');
      return `
        <div class="gst-field">
          <span class="gst-field__label">${escapeHtml(field.label)}</span>
          <div class="gst-radio-group">${options}</div>
        </div>
      `;
    }

    if (field.type === 'checkbox') {
      return `
        <label class="gst-checkbox">
          <input name="${field.name}" type="checkbox" ${field.checked ? 'checked' : ''} />
          <span>${escapeHtml(field.label)}</span>
        </label>
      `;
    }

    if (field.type === 'note') {
      if (!field.label) return '';
      return `<p class="gst-note">${escapeHtml(field.label)}</p>`;
    }

    const autocomplete = field.autocomplete ?? (field.type === 'password' ? 'current-password' : 'off');
    const inputId = field.id || field.name;

    const hiddenAttr = field.hidden ? ' hidden' : '';

    return `
      <label class="gst-field${field.compact ? ' gst-field--compact' : ''}" for="${escapeHtml(inputId)}">
        <span class="gst-field__label">${escapeHtml(field.label)}</span>
        <input
          class="gst-field__input"
          id="${escapeHtml(inputId)}"
          name="${field.name}"
          type="${field.type || 'text'}"
          placeholder="${escapeHtml(field.placeholder || '')}"
          value="${escapeHtml(field.value || '')}"
          ${field.required ? 'required' : ''}
          ${field.readOnly ? 'readonly' : ''}
          ${hiddenAttr}
          autocomplete="${escapeHtml(autocomplete)}"
          ${field.inputMode ? `inputmode="${escapeHtml(field.inputMode)}"` : ''}
          spellcheck="false"
          data-lpignore="false"
          data-1p-ignore="false"
          data-op-ignore="false"
        />
      </label>
    `;
  }

  function showPrompt({
    title,
    fields,
    submitLabel,
    onSubmit,
    onCancel,
    extraActions = [],
    compactDialog = false,
  }) {
    removePrompt();

    const formAction = `${location.origin}${location.pathname}`;

    const overlay = document.createElement('div');
    overlay.id = PROMPT_ID;
    overlay.className = 'gst-overlay';
    overlay.innerHTML = `
      <div class="gst-dialog${compactDialog ? ' gst-dialog--compact' : ''}" role="dialog" aria-modal="true">
        <h2 class="gst-dialog__title">${escapeHtml(title)}</h2>
        <form class="gst-dialog__form" id="gst-form" method="post" action="${escapeHtml(formAction)}" autocomplete="on"></form>
        <div class="gst-dialog__actions">
          ${extraActions
            .map(
              (action) =>
                `<button type="button" class="gst-btn gst-btn--ghost" data-extra-action="${escapeHtml(action.id)}">${escapeHtml(action.label)}</button>`,
            )
            .join('')}
          <button type="button" class="gst-btn gst-btn--ghost" data-action="cancel">Cancel</button>
          <button type="submit" form="gst-form" class="gst-btn gst-btn--primary">${escapeHtml(submitLabel)}</button>
        </div>
      </div>
    `;

    const form = overlay.querySelector('.gst-dialog__form');
    form.innerHTML = fields.map(renderField).join('');

    overlay.addEventListener('click', (event) => {
      const extra = event.target.closest('[data-extra-action]');
      if (extra) {
        const action = extraActions.find((item) => item.id === extra.dataset.extraAction);
        action?.onClick?.();
        return;
      }
      if (event.target === overlay || event.target.closest('[data-action="cancel"]')) {
        removePrompt();
        onCancel?.();
      }
    });

    form.addEventListener('change', (event) => {
      const modeInput = form.querySelector('input[name="mode"]:checked');
      if (!modeInput) return;
      const customField = form.querySelector('[name="customPassphrase"]')?.closest('.gst-field');
      const teamField = form.querySelector('[name="passphrase"]')?.closest('.gst-field');
      if (customField) customField.style.display = modeInput.value === 'custom' ? 'grid' : 'none';
      if (teamField) teamField.style.display = modeInput.value === 'team' ? 'grid' : 'none';
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      for (const field of fields) {
        if (field.type === 'checkbox') {
          data[field.name] = Boolean(form.querySelector(`[name="${field.name}"]`)?.checked);
        }
      }

      const submitButton = overlay.querySelector('.gst-btn--primary');
      submitButton.disabled = true;
      submitButton.textContent = 'Working...';

      try {
        await onSubmit(data);
        removePrompt();
      } catch (error) {
        submitButton.disabled = false;
        submitButton.textContent = submitLabel;
        showToast(error instanceof Error ? error.message : 'Something went wrong.', 'error');
      }
    });

    document.documentElement.appendChild(overlay);
    attachPromptKeyboard(onCancel);
    form.dispatchEvent(new Event('change'));
    form.querySelector('[name="passphrase"]')?.focus()
      || form.querySelector('input[type="password"]')?.focus()
      || form.querySelector('input:not([readonly])')?.focus();
  }

  function teamPassphraseFields({ label = 'Passphrase' } = {}) {
    return [
      {
        name: 'passphrase',
        id: 'goldspire-team-passphrase',
        label,
        type: 'password',
        required: true,
        autocomplete: 'current-password',
      },
    ];
  }

  function showTeamPassphrasePrompt({ title = 'Team passphrase', submitLabel = 'Secure', onSubmit, onCancel }) {
    showPrompt({
      title,
      submitLabel,
      compactDialog: true,
      fields: teamPassphraseFields(),
      onSubmit,
      onCancel,
    });
  }

  function showResultDialog({ title, lines, copyItems = [], extraActions = [] }) {
    removePrompt();

    const overlay = document.createElement('div');
    overlay.id = PROMPT_ID;
    overlay.className = 'gst-overlay gst-overlay--compact';
    const copyValues = new Map();
    overlay.innerHTML = `
      <div class="gst-dialog gst-dialog--compact" role="dialog" aria-modal="true">
        <h2 class="gst-dialog__title">${escapeHtml(title)}</h2>
        <div class="gst-result gst-result--compact">
          ${lines
            .map(
              (line) => {
                const shown = line.displayValue ?? line.value;
                const compact = Boolean(line.displayValue || (line.value && String(line.value).includes('#')));
                const title = line.title || (compact ? line.value : '');
                return `
                <div class="gst-result__row">
                  <span class="gst-result__label">${escapeHtml(line.label)}</span>
                  <code class="gst-result__value${compact ? ' gst-result__value--compact' : ''}"${title ? ` title="${escapeHtml(title)}"` : ''}>${escapeHtml(shown)}</code>
                </div>
              `;
              },
            )
            .join('')}
        </div>
        <div class="gst-dialog__actions gst-dialog__actions--compact">
          ${copyItems
            .map(
              (item, index) =>
                `<button type="button" class="gst-btn gst-btn--ghost gst-btn--sm" data-copy-index="${index}">${escapeHtml(item.label)}</button>`,
            )
            .join('')}
          ${extraActions
            .map(
              (action) =>
                `<button type="button" class="gst-btn gst-btn--ghost gst-btn--sm" data-extra-action="${escapeHtml(action.id)}">${escapeHtml(action.label)}</button>`,
            )
            .join('')}
          <button type="button" class="gst-btn gst-btn--primary gst-btn--sm" data-action="close">Done</button>
        </div>
      </div>
    `;

    copyItems.forEach((item, index) => {
      copyValues.set(String(index), item.value);
    });

    overlay.addEventListener('click', async (event) => {
      const copyButton = event.target.closest('[data-copy-index]');
      if (copyButton) {
        const value = copyValues.get(copyButton.dataset.copyIndex || '') || '';
        await navigator.clipboard.writeText(value);
        showToast('Copied.', 'success');
        return;
      }
      const extra = event.target.closest('[data-extra-action]');
      if (extra) {
        const action = extraActions.find((item) => item.id === extra.dataset.extraAction);
        await action?.onClick?.();
        return;
      }
      if (event.target === overlay || event.target.closest('[data-action="close"]')) {
        removePrompt();
      }
    });

    document.documentElement.appendChild(overlay);
  }

  function showSecureSheet({
    title = 'Secure selection',
    modes = [],
    defaultMode = 'team',
    settings = null,
    detections = [],
    onSubmit,
    onCancel,
  }) {
    removePrompt();
    document.getElementById('goldspire-veil-copilot')?.remove();

    const isOrg = global.GoldspireCopy?.isOrgProfile?.(settings) || false;
    const initialMode = modes.some((m) => m.value === defaultMode)
      ? defaultMode
      : (modes[0]?.value || 'team');

    const panelHtml = {
      team: isOrg
        ? '<p class="gst-veil-pop__hint">Uses your saved team passphrase from Veil settings.</p>'
        : '<p class="gst-veil-pop__hint">Uses your saved passphrase from Veil settings.</p>',
      direct: `
        <p class="gst-veil-pop__hint">Unlock keys go only to the people you name — not everyone on the email thread.</p>
        <div class="gst-veil-pop__field">
          <span class="gst-veil-pop__field-label">Email(s)</span>
          <input class="gst-veil-pop__field-input" name="recipients" type="email" placeholder="friend@example.com" autocomplete="email" />
        </div>
      `,
      magic: '<p class="gst-veil-pop__hint">Creates a one-time link you share separately. Recipient opens it to get the unlock code — no Veil account needed.</p>',
      'one-time': '<p class="gst-veil-pop__hint"><strong>One-time code</strong> — Veil creates a unique unlock code for this message. Copy it and send it separately (text, call, or chat). The recipient pastes it when they click <code>[redacted]</code>.</p>',
    };

    const sheetDetections = global.GoldspireVeilExplain?.dedupeDetectionsForDisplay?.(detections) || detections;
    const detectionSummary = Array.isArray(sheetDetections) && sheetDetections.length
      ? global.GoldspireVeilExplain?.buildExplainSummary?.(sheetDetections, { context: {}, settings }) || []
      : [];

    const pop = document.createElement('div');
    pop.id = PROMPT_ID;
    pop.className = 'gst-veil-pop gst-veil-pop--secure';
    pop.innerHTML = `
      <div class="gst-veil-pop__head">
        <span class="gst-veil-pop__brand">Veil</span>
        <span class="gst-veil-pop__detect">${escapeHtml(title)}</span>
        <button type="button" class="gst-veil-pop__close" data-action="cancel" title="Close">✕</button>
      </div>
      ${detectionSummary.length ? `<ul class="gst-veil-pop__why">${detectionSummary.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>` : ''}
      <p class="gst-veil-pop__trust">Encrypted in your browser before send</p>
      <div class="gst-veil-pop__chips" data-mode-chips></div>
      <div class="gst-veil-pop__panel" data-panel-slot></div>
      <div class="gst-veil-pop__actions">
        <button type="button" class="gst-veil-pop__chip gst-veil-pop__chip--pick" data-action="submit">Secure</button>
      </div>
    `;

    const chipsEl = pop.querySelector('[data-mode-chips]');
    for (const mode of modes) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `gst-veil-pop__chip${mode.value === initialMode ? ' gst-veil-pop__chip--pick' : ''}`;
      btn.dataset.mode = mode.value;
      btn.textContent = mode.label;
      chipsEl.appendChild(btn);
    }

    let activeMode = initialMode;

    function setMode(mode) {
      activeMode = mode;
      chipsEl.querySelectorAll('[data-mode]').forEach((chip) => {
        chip.classList.toggle('gst-veil-pop__chip--pick', chip.dataset.mode === mode);
      });
      const slot = pop.querySelector('[data-panel-slot]');
      if (slot) slot.innerHTML = panelHtml[mode] || '';
      if (mode === 'direct') {
        slot?.querySelector('[name="recipients"]')?.focus();
      }
    }

    chipsEl.addEventListener('mousedown', (event) => {
      if (event.target.closest('[data-mode]')) event.preventDefault();
    });
    chipsEl.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-mode]');
      if (!chip) return;
      setMode(chip.dataset.mode);
    });

    pop.addEventListener('mousedown', (event) => {
      if (event.target.closest('[data-action], [data-mode], .gst-veil-pop__chip')) {
        event.preventDefault();
      }
    });

    pop.addEventListener('click', async (event) => {
      if (event.target.closest('[data-action="cancel"]')) {
        removePrompt();
        onCancel?.();
        return;
      }
      if (!event.target.closest('[data-action="submit"]')) return;
      const submitBtn = pop.querySelector('[data-action="submit"]');
      submitBtn.disabled = true;
      try {
        const recipients = pop.querySelector('[name="recipients"]')?.value || '';
        await onSubmit({ mode: activeMode, recipients });
        removePrompt();
      } catch (error) {
        submitBtn.disabled = false;
        showToast(error instanceof Error ? error.message : 'Something went wrong.', 'error');
      }
    });

    document.documentElement.appendChild(pop);
    attachPromptKeyboard(onCancel);
    attachOutsideDismiss(pop, onCancel);
    setMode(initialMode);
  }

  function showConfirm({
    title,
    message,
    confirmLabel = 'Continue',
    cancelLabel = 'Cancel',
    onConfirm,
    onCancel,
  }) {
    removePrompt();

    const overlay = document.createElement('div');
    overlay.id = PROMPT_ID;
    overlay.className = 'gst-overlay gst-overlay--compact';
    overlay.innerHTML = `
      <div class="gst-dialog gst-dialog--compact" role="dialog" aria-modal="true">
        <h2 class="gst-dialog__title">${escapeHtml(title)}</h2>
        <p class="gst-note">${escapeHtml(message)}</p>
        <div class="gst-dialog__actions gst-dialog__actions--compact">
          <button type="button" class="gst-btn gst-btn--ghost gst-btn--sm" data-action="cancel">${escapeHtml(cancelLabel)}</button>
          <button type="button" class="gst-btn gst-btn--primary gst-btn--sm" data-action="confirm">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `;

    overlay.addEventListener('click', async (event) => {
      if (event.target === overlay || event.target.closest('[data-action="cancel"]')) {
        removePrompt();
        onCancel?.();
        return;
      }
      const confirmBtn = event.target.closest('[data-action="confirm"]');
      if (!confirmBtn) return;
      confirmBtn.disabled = true;
      try {
        await onConfirm?.();
        removePrompt();
      } catch (error) {
        confirmBtn.disabled = false;
        showToast(error instanceof Error ? error.message : 'Something went wrong.', 'error');
      }
    });

    document.documentElement.appendChild(overlay);
    attachPromptKeyboard(onCancel);
  }

  global.GoldspireSecureUI = {
    showToast,
    showActionToast,
    showPrompt,
    showTeamPassphrasePrompt,
    showSecureSheet,
    showConfirm,
    teamPassphraseFields,
    showResultDialog,
    removePrompt,
    formatCompactUrl,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
