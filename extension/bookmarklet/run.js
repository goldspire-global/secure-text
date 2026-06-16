(function () {
  if (window.__gstBookmarkletActive) {
    window.__gstBookmarkletScan?.();
    return;
  }

  const base = document.currentScript?.src?.replace(/\/bookmarklet\/run\.js.*$/, '/') || '';
  const files = ['browser.js', 'crypto.js', 'marker.js', 'redacted.js', 'ui.js', 'resecure.js', 'bookmarklet/scan.js'];

  function loadNext(index) {
    if (index >= files.length) return;
    const script = document.createElement('script');
    script.src = `${base}${files[index]}`;
    script.onload = () => loadNext(index + 1);
    script.onerror = () => alert('Goldspire Secure Text: could not load unlock tools. Reload the extension.');
    document.head.appendChild(script);
  }

  window.__gstBookmarkletActive = true;
  loadNext(0);
})();
