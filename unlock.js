const form = document.getElementById('unlock-form');
const securedText = document.getElementById('securedText');
const pasteField = document.getElementById('paste-field');
const secretInput = document.getElementById('secret');
const subtitle = document.getElementById('subtitle');
const result = document.getElementById('result');
const resultValue = document.getElementById('result-value');
const error = document.getElementById('error');
const copyButton = document.getElementById('copy-result');
const linkHint = document.getElementById('link-hint');

let unlocked = '';
let linkMarker = null;

secretInput.setAttribute('autocomplete', 'current-password');
secretInput.setAttribute('name', 'gst-team-passphrase');

function showError(message) {
  error.hidden = false;
  error.textContent = message;
  result.hidden = true;
}

function resolveMarker(text) {
  const redacted = GoldspireRedacted.findInText(text);
  if (redacted) return redacted;
  return GoldspireSecureMarker.parseMarker(text) || GoldspireSecureMarker.findInText(text);
}

function markerFromHash() {
  const raw = location.hash.replace(/^#/, '');
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    return resolveMarker(decoded);
  } catch {
    return resolveMarker(raw);
  }
}

function setupLinkMode() {
  pasteField.hidden = true;
  securedText.removeAttribute('required');
  subtitle.textContent = 'Enter your team passphrase — 1Password can autofill this field.';
  linkHint.hidden = false;
  secretInput.focus();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  error.hidden = true;

  const marker = linkMarker || resolveMarker(securedText.value);
  if (!marker) {
    showError(linkMarker ? 'Invalid secured link.' : 'No [redacted] text found. Paste the full message.');
    return;
  }

  try {
    unlocked = await GoldspireSecureCrypto.decryptText(marker.payload, secretInput.value.trim(), {
      profile: marker.mode === 'one-time' ? 'personal' : 'personal',
    });
    resultValue.textContent = unlocked;
    result.hidden = false;
    form.hidden = true;
    linkHint.hidden = true;
    copyButton.focus();
  } catch (err) {
    showError(err instanceof Error && !err.message.includes('at least') ? 'Wrong passphrase or corrupted link.' : err.message);
  }
});

copyButton.addEventListener('click', async () => {
  if (!unlocked) return;
  await navigator.clipboard.writeText(unlocked);
  copyButton.textContent = 'Copied';
});

const fromLink = markerFromHash();
if (fromLink) {
  linkMarker = fromLink;
  securedText.value = fromLink.fullMarker || location.hash.slice(1);
  setupLinkMode();
} else {
  const hash = location.hash.replace(/^#/, '');
  if (hash) {
    try {
      securedText.value = decodeURIComponent(hash);
    } catch {
      securedText.value = hash;
    }
    const parsed = resolveMarker(securedText.value);
    if (parsed) {
      linkMarker = parsed;
      setupLinkMode();
    }
  }
}
