/**
 * Free-tier helpers — share unlock codes out of band without cloud.
 */
(function (global) {
  function passphraseMessage(code, { senderName = 'I' } = {}) {
    return `${senderName} secured part of an email with Veil. Use this unlock code (not in the email thread):\n\n${code}\n\nPaste the message at veil.goldspireventures.com/unlock.html if you don't have Veil installed.`;
  }

  function oneTimeMessage(code, unlockLink = '') {
    const lines = [
      'Your Veil one-time unlock code (share separately from the email):',
      '',
      code,
    ];
    if (unlockLink) {
      lines.push('', `Or open: ${unlockLink}`);
    }
    return lines.join('\n');
  }

  function mailtoUrl({ to = '', subject = 'Veil unlock code', body = '' } = {}) {
    const params = new URLSearchParams();
    if (subject) params.set('subject', subject);
    if (body) params.set('body', body);
    const qs = params.toString();
    return `mailto:${encodeURIComponent(to)}${qs ? `?${qs}` : ''}`;
  }

  function smsUrl(body = '') {
    return `sms:?&body=${encodeURIComponent(body)}`;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  async function shareNative({ title = 'Veil unlock code', text = '' } = {}) {
    if (!navigator.share) return false;
    try {
      await navigator.share({ title, text });
      return true;
    } catch {
      return false;
    }
  }

  global.GoldspireShareHelper = {
    passphraseMessage,
    oneTimeMessage,
    mailtoUrl,
    smsUrl,
    copyText,
    shareNative,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
