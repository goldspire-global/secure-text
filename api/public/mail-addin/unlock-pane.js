/**
 * Shared read-pane unlock UI for mail add-ins (Outlook desktop, Gmail).
 */
(function (global) {
  function boot({ getBody, replaceBody, onReady }) {
    const scanStatus = document.getElementById('scan-status');
    const form = document.getElementById('unlock-form');
    const errorEl = document.getElementById('error');
    const result = document.getElementById('result');
    const resultText = document.getElementById('result-text');
    const passphraseInput = document.getElementById('passphrase');

    let itemBody = '';
    let marker = null;

    function showError(message) {
      if (!errorEl) return;
      errorEl.textContent = message || '';
      errorEl.hidden = !message;
    }

    function setStatus(message) {
      if (scanStatus) scanStatus.textContent = message;
    }

    function scanBody(text) {
      itemBody = text || '';
      marker = global.GoldspireSecureMarker?.findInText?.(itemBody);
      if (!marker) {
        setStatus('No [redacted] markers found in this message.');
        if (form) form.hidden = true;
        return false;
      }
      setStatus('Found secured content — enter your passphrase to unlock.');
      if (form) form.hidden = false;
      return true;
    }

    async function replaceInBody(unlocked) {
      if (typeof replaceBody === 'function') {
        await replaceBody(itemBody, marker, unlocked);
        return;
      }
      if (resultText) resultText.textContent = unlocked;
      if (result) result.hidden = false;
    }

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      showError('');
      const passphrase = passphraseInput?.value || '';
      if (!marker?.payload) {
        showError('Nothing to unlock.');
        return;
      }
      const btn = document.getElementById('unlock-btn');
      if (btn) btn.disabled = true;
      try {
        const decrypted = await global.GoldspireSecureCrypto.decryptEnvelope(
          marker.payload,
          passphrase,
          { profile: 'personal' },
        );
        await replaceInBody(decrypted.text);
        if (form) form.hidden = true;
        if (result) result.hidden = false;
        if (resultText) resultText.textContent = decrypted.text;
        setStatus('Done — secured text replaced in this message.');
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Wrong passphrase or corrupted marker.');
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    Promise.resolve()
      .then(() => getBody?.())
      .then((text) => {
        if (text == null) {
          setStatus('Open a message with [redacted] text to unlock.');
          return;
        }
        scanBody(text);
      })
      .catch(() => setStatus('Could not read message body.'))
      .finally(() => onReady?.());
  }

  global.VeilMailUnlock = { boot };
})(typeof globalThis !== 'undefined' ? globalThis : self);
