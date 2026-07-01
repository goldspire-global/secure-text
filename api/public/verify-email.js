/**
 * Veil Plus email verification landing page.
 */
(function () {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('t') || '';
  const loading = document.getElementById('loading');
  const result = document.getElementById('result');
  const errorEl = document.getElementById('error');
  const resultMessage = document.getElementById('result-message');
  const verifiedEmail = document.getElementById('verified-email');

  function showError(message) {
    if (loading) loading.hidden = true;
    if (result) result.hidden = true;
    if (errorEl) {
      errorEl.hidden = false;
      errorEl.textContent = message;
    }
  }

  async function verify() {
    if (!token) {
      showError('Invalid link — missing verification token.');
      return;
    }

    const apiBase = (globalThis.GoldspirePortal?.API_BASE || '').replace(/\/$/, '');
    if (!apiBase) {
      showError('This page is not configured yet.');
      return;
    }

    try {
      const response = await fetch(
        `${apiBase}/v1/personal/verify-email?t=${encodeURIComponent(token)}`,
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        showError(body.message || body.error || 'This link is invalid or expired.');
        return;
      }

      if (loading) loading.hidden = true;
      if (result) result.hidden = false;
      if (resultMessage) {
        resultMessage.textContent = body.alreadyVerified
          ? 'This email was already verified. Open Veil to receive trusted-contact unlocks.'
          : 'Your email is verified. Open Veil to receive trusted-contact unlocks.';
      }
      if (verifiedEmail && body.email) {
        verifiedEmail.textContent = body.email;
      }
    } catch {
      showError('Could not reach Veil — check your connection and try again.');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', verify);
  } else {
    verify();
  }
})();
