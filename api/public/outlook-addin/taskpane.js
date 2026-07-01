/**
 * Veil Outlook add-in — read-pane unlock for [redacted] markers (desktop Outlook).
 */
(function () {
  const scanStatus = document.getElementById('scan-status');
  const form = document.getElementById('unlock-form');
  const errorEl = document.getElementById('error');
  const result = document.getElementById('result');
  const resultText = document.getElementById('result-text');
  const passphraseInput = document.getElementById('passphrase');

  let itemBody = '';
  let marker = null;

  function showError(message) {
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.hidden = !message;
    }
  }

  function setStatus(message) {
    if (scanStatus) scanStatus.textContent = message;
  }

  function scanBody(text) {
    marker = globalThis.GoldspireSecureMarker?.findInText?.(text);
    if (!marker) {
      setStatus('No [redacted] markers found in this message.');
      return false;
    }
    setStatus('Found secured content — enter your passphrase to unlock.');
    if (form) form.hidden = false;
    return true;
  }

  async function replaceInBody(unlocked) {
    if (!Office?.context?.mailbox?.item?.body?.setAsync) {
      resultText.textContent = unlocked;
      result.hidden = false;
      return;
    }
    const next = itemBody.replace(marker.fullMarker, unlocked);
    return new Promise((resolve, reject) => {
      Office.context.mailbox.item.body.setAsync(next, { coercionType: Office.CoercionType.Html }, (result) => {
        if (result.status === Office.AsyncResultStatus.Succeeded) resolve();
        else reject(new Error(result.error?.message || 'Could not update message.'));
      });
    });
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
      const decrypted = await globalThis.GoldspireSecureCrypto.decryptEnvelope(
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

  Office.onReady(() => {
    const item = Office.context.mailbox?.item;
    if (!item?.body?.getAsync) {
      setStatus('Open a message with [redacted] text to unlock.');
      return;
    }
    item.body.getAsync(Office.CoercionType.Text, (asyncResult) => {
      if (asyncResult.status !== Office.AsyncResultStatus.Succeeded) {
        setStatus('Could not read message body.');
        return;
      }
      itemBody = asyncResult.value || '';
      scanBody(itemBody);
    });
  });
})();
