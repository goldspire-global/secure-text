/**
 * Veil Plus magic-link claim page.
 */
(function () {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('t') || '';
  const loading = document.getElementById('loading');
  const result = document.getElementById('result');
  const errorEl = document.getElementById('error');
  const resultValue = document.getElementById('result-value');
  const copyBtn = document.getElementById('copy-result');

  function showError(message) {
    if (loading) loading.hidden = true;
    if (result) result.hidden = true;
    if (errorEl) {
      errorEl.hidden = false;
      errorEl.textContent = message;
    }
  }

  async function claim() {
    if (!token) {
      showError('Invalid link — missing claim token.');
      return;
    }

    const apiBase = (globalThis.GoldspirePortal?.API_BASE || '').replace(/\/$/, '');
    if (!apiBase) {
      showError('This page is not configured for claims yet.');
      return;
    }

    try {
      const response = await fetch(
        `${apiBase}/v1/personal/magic-claim?t=${encodeURIComponent(token)}`,
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        showError(body.message || body.error || 'This link is invalid or expired.');
        return;
      }

      const code = String(body.unlockCode || '').trim();
      if (!code) {
        showError('Could not read unlock code.');
        return;
      }

      if (loading) loading.hidden = true;
      if (result) result.hidden = false;
      if (resultValue) resultValue.textContent = code;

      copyBtn?.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(code);
          copyBtn.textContent = 'Copied';
        } catch {
          copyBtn.textContent = 'Copy failed';
        }
      });
    } catch {
      showError('Could not reach Veil — check your connection and try again.');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', claim);
  } else {
    claim();
  }
})();
