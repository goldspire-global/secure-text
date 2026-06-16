/**
 * Enhances the hosted unlock page when opened from email (Outlook app, mobile).
 */
(function () {
  const host = location.hostname;
  const onHostedUnlock =
    host === 'goldspire-global.github.io' && location.pathname.includes('unlock')
    || location.protocol === 'chrome-extension:' && location.pathname.includes('unlock');

  if (!onHostedUnlock) return;

  const secretInput = document.getElementById('secret');
  const form = document.getElementById('unlock-form');
  if (!secretInput || !form) return;

  document.body.classList.add('gst-unlock-host');
})();
