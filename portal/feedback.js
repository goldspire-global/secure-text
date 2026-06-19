(function (global) {
  function supportEmail() {
    return global.GoldspirePortal?.SUPPORT_EMAIL || '';
  }

  const SUBJECTS = {
    feedback: 'Veil feedback',
    bug: 'Veil issue report',
    falsePositive: 'Veil copilot false alert',
  };

  function readParams() {
    const params = new URLSearchParams(global.location.search);
    return {
      version: params.get('v') || params.get('version') || '',
      browser: params.get('browser') || '',
      profile: params.get('profile') || '',
      copilot: params.get('copilot') || '',
      page: params.get('page') || '',
      kind: params.get('kind') || '',
    };
  }

  function buildDiagnostics(params) {
    const lines = [
      `Veil version: ${params.version || 'unknown'}`,
      `Browser: ${params.browser || 'unknown'}`,
      `Profile: ${params.profile || 'unknown'}`,
    ];
    if (params.copilot) lines.push(`Copilot: ${params.copilot}`);
    if (params.page) lines.push(`Page: ${params.page}`);
    return lines.join('\n');
  }

  function buildBody(message, diagnostics) {
    const parts = [];
    if (message) parts.push(message.trim(), '');
    parts.push('---', 'Diagnostic info (no secrets):', diagnostics, '', 'Describe what happened and what you expected:');
    return parts.join('\n');
  }

  function init() {
    const form = document.getElementById('feedback-form');
    const kindEl = document.getElementById('feedback-kind');
    const messageEl = document.getElementById('feedback-message');
    const diagEl = document.getElementById('feedback-diagnostics');
    const statusEl = document.getElementById('feedback-status');
    const copyBtn = document.getElementById('feedback-copy');
    if (!form || !kindEl || !messageEl || !diagEl) return;

    const params = readParams();
    const diagnostics = buildDiagnostics(params);
    diagEl.textContent = diagnostics;

    if (params.kind && SUBJECTS[params.kind]) {
      kindEl.value = params.kind;
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const kind = kindEl.value || 'feedback';
      const subject = SUBJECTS[kind] || SUBJECTS.feedback;
      const body = buildBody(messageEl.value, diagnostics);
      const mailto = `mailto:${supportEmail()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      global.location.href = mailto;
    });

    copyBtn?.addEventListener('click', async () => {
      const kind = kindEl.value || 'feedback';
      const subject = SUBJECTS[kind] || SUBJECTS.feedback;
      const text = `To: ${supportEmail()}\nSubject: ${subject}\n\n${buildBody(messageEl.value, diagnostics)}`;
      try {
        await navigator.clipboard.writeText(text);
        if (statusEl) {
          statusEl.hidden = false;
          statusEl.textContent = 'Copied — paste into your email client if the mail link did not open.';
        }
      } catch {
        if (statusEl) {
          statusEl.hidden = false;
          statusEl.textContent = 'Could not copy — use Open email to send instead.';
        }
      }
    });
  }

  global.GoldspirePortalFeedback = { init, buildDiagnostics, readParams };
})(typeof window !== 'undefined' ? window : globalThis);
