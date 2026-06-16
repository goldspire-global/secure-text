(function (global) {
  const PROMPT_ID = 'goldspire-secure-text-prompt';
  const TOAST_ID = 'goldspire-secure-text-toast';
  let activePromptKeyHandler = null;

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showToast(message, type = 'info') {
    document.getElementById(TOAST_ID)?.remove();

    const toast = document.createElement('div');
    toast.id = TOAST_ID;
    toast.className = `gst-toast gst-toast--${type}`;
    toast.textContent = message;
    document.documentElement.appendChild(toast);

    window.setTimeout(() => toast.remove(), 3600);
  }

  function removePrompt() {
    if (activePromptKeyHandler) {
      document.removeEventListener('keydown', activePromptKeyHandler);
      activePromptKeyHandler = null;
    }
    document.getElementById(PROMPT_ID)?.remove();
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
    overlay.className = 'gst-overlay';
    overlay.innerHTML = `
      <div class="gst-dialog gst-dialog--wide" role="dialog" aria-modal="true">
        <h2 class="gst-dialog__title">${escapeHtml(title)}</h2>
        <div class="gst-result">
          ${lines
            .map(
              (line) => `
                <div class="gst-result__row">
                  <span class="gst-result__label">${escapeHtml(line.label)}</span>
                  <code class="gst-result__value">${escapeHtml(line.value)}</code>
                </div>
              `,
            )
            .join('')}
        </div>
        <div class="gst-dialog__actions">
          ${copyItems
            .map(
              (item) =>
                `<button type="button" class="gst-btn gst-btn--ghost" data-copy="${escapeHtml(item.value)}">${escapeHtml(item.label)}</button>`,
            )
            .join('')}
          ${extraActions
            .map(
              (action) =>
                `<button type="button" class="gst-btn gst-btn--ghost" data-extra-action="${escapeHtml(action.id)}">${escapeHtml(action.label)}</button>`,
            )
            .join('')}
          <button type="button" class="gst-btn gst-btn--primary" data-action="close">Done</button>
        </div>
      </div>
    `;

    overlay.addEventListener('click', async (event) => {
      const copyButton = event.target.closest('[data-copy]');
      if (copyButton) {
        await navigator.clipboard.writeText(copyButton.dataset.copy || '');
        showToast('Copied to clipboard.', 'success');
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

  global.GoldspireSecureUI = {
    showToast,
    showPrompt,
    showTeamPassphrasePrompt,
    teamPassphraseFields,
    showResultDialog,
    removePrompt,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
