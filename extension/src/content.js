(function () {
  if (window.__goldspireSecureTextLoaded) return;
  window.__goldspireSecureTextLoaded = true;

  const DEFAULT_SETTINGS = GoldspireSettings.DEFAULT_SETTINGS;
  const runtimeApi = () => globalThis.chrome?.runtime || globalThis.browser?.runtime;
  const browserApi = () => globalThis.GoldspireBrowser;
  const isInvalidatedError = (error) => browserApi()?.isInvalidatedError?.(error) ?? false;

  let detectorController = null;
  let contextDead = false;
  let staleWarningShown = false;

  // --- Selection UI mode helpers ---

  // Snooze: pill dismissed by user for this page-load session
  let pillSnoozedUntil = 0;
  // Per-site snooze persisted in local storage
  let snoozedHosts = new Set();
  // Cached settings snapshot for refreshSelectionUi (updated after each getSettings call)
  let cachedUiSettings = null;
  // Debounce timer for refreshSelectionUi
  let refreshDebounceTimer = null;
  // Selection preview relayed from child iframes (top frame only)
  let remoteSelectionPreview = '';
  // Which iframe last reported the selection (top frame only)
  let remoteSelectionToken = '';
  const isTopFrame = window.top === window.self;
  const frameToken = Math.random().toString(36).slice(2);
  let lastContextMenuTarget = null;

  function elementIsEditable(target) {
    if (!target) return false;
    const el = target instanceof Element ? target : target.parentElement;
    if (!el) return false;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      return !el.disabled && !el.readOnly;
    }
    if (el.isContentEditable) return true;
    if (el.getAttribute('role') === 'textbox') return true;
    return Boolean(el.closest('[contenteditable="true"],[contenteditable=""],textarea,input:not([type])'));
  }

  function getActivePreview() {
    return GoldspireSelection.getLivePreview() || remoteSelectionPreview || '';
  }

  function isSensitiveSelection(text) {
    if (!text || text.length < 4) return false;
    return (
      // Long enough to be a credential
      text.length >= 8 ||
      // Looks like an API key / token (contains letters+digits+special, no spaces)
      /^[A-Za-z0-9_\-./+]{8,}$/.test(text.trim()) ||
      // JWT (three base64url segments)
      /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(text.trim()) ||
      // Looks like sk-…, ghp_…, xox…, AIza… common API key prefixes
      /^(sk-|ghp_|ghs_|glpat-|xox[abprs]-|AIza|AKIA|ya29\.|ey[JI])/i.test(text.trim()) ||
      // Basic credit card pattern (16 digits optionally grouped)
      /^\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}$/.test(text.trim()) ||
      // Password-like: mixed case + digit + symbol, no spaces
      /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)[^\s]{8,}$/.test(text.trim())
    );
  }

  function isComposeContext() {
    if (elementIsEditable(lastContextMenuTarget)) return true;

    const active = document.activeElement;
    if (elementIsEditable(active)) return true;

    // Check if selection/caret is inside a contenteditable subtree
    try {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const ancestor = sel.getRangeAt(0).commonAncestorContainer;
        const el = ancestor.nodeType === Node.ELEMENT_NODE ? ancestor : ancestor.parentElement;
        if (el?.closest('[contenteditable="true"],[contenteditable=""]')) return true;
      }
    } catch { /**/ }
    return false;
  }

  function shouldShowSelectionUi(preview, settings) {
    if (!preview || preview.length < 4) return false;
    const host = location.hostname;
    if (snoozedHosts.has(host)) return false;
    if (Date.now() < pillSnoozedUntil) return false;

    const mode = settings?.selectionUiMode || 'smart';
    if (mode === 'quiet') return false;
    if (mode === 'always') return true;

    // 'smart': show if in a compose context OR selection looks sensitive
    return isComposeContext() || isSensitiveSelection(preview);
  }

  async function loadSnoozedHosts() {
    try {
      const gst = browserApi();
      if (!gst?.storageGet) return;
      const { gstSnoozedHosts = [] } = await gst.storageGet('local', { gstSnoozedHosts: [] });
      snoozedHosts = new Set(gstSnoozedHosts);
    } catch { /**/ }
  }

  async function snoozeCurrentSite() {
    const host = location.hostname;
    if (!host) return;
    snoozedHosts.add(host);
    try {
      const gst = browserApi();
      if (!gst?.storageGet) return;
      const { gstSnoozedHosts = [] } = await gst.storageGet('local', { gstSnoozedHosts: [] });
      const updated = Array.from(new Set([...gstSnoozedHosts, host]));
      gst.storage?.local?.set?.({ gstSnoozedHosts: updated });
    } catch { /**/ }
  }

  function safeToast(message, type = 'info') {
    try {
      globalThis.GoldspireSecureUI?.showToast?.(message, type);
    } catch {
      // UI unavailable in this frame.
    }
  }

  function markContextDead() {
    if (contextDead) return;
    contextDead = true;
    try {
      detectorController?.observer?.disconnect();
    } catch {
      // ignore
    }
  }

  function warnStaleContext() {
    markContextDead();
    if (!staleWarningShown) {
      staleWarningShown = true;
      safeToast('Extension was updated — refresh this page (F5), then try again.', 'error');
    }
  }

  function runSafe(task) {
    Promise.resolve(task).catch((error) => {
      if (isInvalidatedError(error)) {
        warnStaleContext();
        return;
      }
      console.warn('[Goldspire Secure Text]', error);
      safeToast('Something went wrong — refresh the page and try again.', 'error');
    });
  }

  function extensionReachable() {
    if (contextDead) return false;
    try {
      if (browserApi()?.isValid?.()) return true;
      return Boolean(runtimeApi()?.id);
    } catch (error) {
      if (isInvalidatedError(error)) markContextDead();
      return false;
    }
  }

  function ensureExtensionReady() {
    if (extensionReachable()) return true;
    warnStaleContext();
    return false;
  }

  async function getSettings() {
    if (contextDead) return { ...DEFAULT_SETTINGS, passphrase: '' };

    try {
      if (browserApi()?.isValid?.()) {
        const s = await GoldspireSettings.load();
        cachedUiSettings = s;
        return s;
      }
    } catch (error) {
      if (isInvalidatedError(error)) {
        warnStaleContext();
        return { ...DEFAULT_SETTINGS, passphrase: '' };
      }
    }

    const response = await browserApi()?.sendMessage?.({ type: 'GET_SETTINGS' });
    if (response?.settings) {
      cachedUiSettings = response.settings;
      return response.settings;
    }
    return { ...DEFAULT_SETTINGS, passphrase: '' };
  }

  function getProfile(settings) {
    return settings.securityProfile === 'organization' ? 'organization' : 'personal';
  }

  async function resolveTeamPassphrase(settings) {
    if (settings.passphraseFromVault) {
      return (await GoldspireSecrets.loadSessionTeamPassphrase?.()) || '';
    }
    const fromSettings = settings.passphrase?.trim() || '';
    if (fromSettings) return fromSettings;
    return (await GoldspireSecrets.loadPassphrase?.(getProfile(settings))) || '';
  }

  async function copyWithAutoClear(text, settings) {
    await navigator.clipboard.writeText(text);
    const seconds = Number(settings.clipboardClearSeconds) || 0;
    if (seconds > 0) {
      window.setTimeout(() => navigator.clipboard.writeText('').catch(() => {}), seconds * 1000);
    }
  }

  function resolveContext(context) {
    if (!context) return null;
    if (context.kind !== 'fallback') return context;

    const text = context.selectedText;
    const active = document.activeElement;

    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
      const index = active.value.indexOf(text);
      if (index >= 0) {
        active.focus();
        active.setSelectionRange(index, index + text.length);
        return { kind: 'input', element: active, start: index, end: index + text.length, selectedText: text };
      }
    }

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const index = node.nodeValue?.indexOf(text) ?? -1;
      if (index < 0) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + text.length);
      return { kind: 'range', selectedText: text, range, selection: window.getSelection() };
    }

    return null;
  }

  function getSelectionContext(message = {}) {
    GoldspireSelection.captureSelection();
    return resolveContext(
      GoldspireSelection.getActiveSelection({
        fallbackText: message.selectionText,
      }),
    );
  }

  function getInsertionContext(message = {}) {
    // For generate+insert, we need caret context even when nothing is highlighted.
    const base = GoldspireSelection.buildInsertionContext?.() || GoldspireSelection.buildSelectionContext?.();
    if (base) return resolveContext(base);
    // Context-menu may provide selectionText but no caret; fallback keeps old behavior.
    return getSelectionContext(message);
  }

  function replaceSelection(context, replacement) {
    const resolved = resolveContext(context);
    if (!resolved) return null;

    if (resolved.kind === 'input') {
      const { element, start, end } = resolved;
      const before = element.value.slice(0, start);
      const after = element.value.slice(end);
      element.value = `${before}${replacement}${after}`;
      const cursor = before.length + replacement.length;
      element.focus();
      element.setSelectionRange(cursor, cursor);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return { kind: 'input', element, start: before.length, length: replacement.length };
    }

    const range = resolved.range.cloneRange();
    const selection = resolved.selection || window.getSelection();
    range.deleteContents();
    const node = document.createTextNode(replacement);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    node.parentElement?.closest('[contenteditable=""], [contenteditable="true"]')?.dispatchEvent(new Event('input', { bubbles: true }));
    return { kind: 'node', node };
  }

  function replaceRedactedWithPlaintext(context, marker, plaintext) {
    const token = marker.plainToken || GoldspireRedacted.formatPlain(marker.fullMarker || marker.full);

    if (context?.kind === 'input') {
      const { element } = context;
      const start = element.value.indexOf(token);
      if (start === -1) throw new Error('Could not find [redacted] in this field.');
      element.value = `${element.value.slice(0, start)}${plaintext}${element.value.slice(start + token.length)}`;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      return { kind: 'input', element, start, plaintext };
    }

    return replaceSelection(context, context.selectedText.replace(GoldspireRedacted.LABEL, plaintext));
  }

  function insertAtCursor(text) {
    const context = getSelectionContext();
    if (context?.selectedText) {
      replaceSelection(context, text);
      return true;
    }

    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
      const start = active.selectionStart ?? active.value.length;
      const end = active.selectionEnd ?? start;
      active.value = `${active.value.slice(0, start)}${text}${active.value.slice(end)}`;
      active.setSelectionRange(start + text.length, start + text.length);
      active.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }

    return false;
  }

  function doRefreshSelectionUi() {
    const preview = getActivePreview();
    const settings = cachedUiSettings;
    const showPill = settings?.showSelectionPill !== false;
    const showFabs = settings?.showFloatingButton !== false;

    const pill = document.getElementById('goldspire-selection-status');
    if (pill) {
      const secured = preview ? GoldspireRedacted.isRedactedToken(preview) : false;
      // Always show pill for secured tokens (so user knows they can unlock)
      const wantPill = showPill && (secured ? Boolean(preview) : shouldShowSelectionUi(preview, settings));

      if (!wantPill || !preview) {
        pill.classList.remove('gst-selection-status--visible');
      } else {
        pill.querySelector('.gst-pill-text').textContent = secured
          ? 'Secured [redacted] selected — click to unlock'
          : `Ready to secure: "${preview.slice(0, 28)}${preview.length > 28 ? '…' : ''}"`;
        pill.classList.add('gst-selection-status--visible');
      }
    }

    const wrap = document.getElementById('goldspire-secure-text-fabs');
    if (wrap) {
      const secured = preview ? GoldspireRedacted.isRedactedToken(preview) : false;
      const wantFabs = showFabs && (secured ? true : shouldShowSelectionUi(preview, settings));

      wrap.querySelector('#goldspire-secure-fab')?.classList.toggle(
        'gst-fab--visible',
        Boolean(wantFabs && preview && !secured),
      );
      wrap.querySelector('#goldspire-unlock-fab')?.classList.toggle(
        'gst-fab--visible',
        Boolean(secured || (wantFabs && preview === GoldspireRedacted.LABEL)),
      );
    }
  }

  function broadcastSelectionToTop() {
    if (isTopFrame) return;
    const preview = GoldspireSelection.getLivePreview();
    try {
      window.top.postMessage({ source: 'goldspire-selection-relay', preview, token: frameToken }, '*');
    } catch {
      // Cross-origin parent — ignore.
    }
  }

  function forwardToRelayedFrame(type, payload = {}) {
    if (!isTopFrame || !remoteSelectionToken) return false;
    let forwarded = false;
    for (const frame of Array.from(window.frames || [])) {
      try {
        frame.postMessage({ source: 'goldspire-ui-command', token: remoteSelectionToken, type, ...payload }, '*');
        forwarded = true;
      } catch {
        // Cross-origin frame; ignore.
      }
    }
    return forwarded;
  }

  function createPromptRequestId() {
    return `gst-prompt-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  }

  function runTeamPassphrasePrompt({ title, submitLabel, onSubmit, onCancel }) {
    return new Promise((resolve, reject) => {
      GoldspireSecureUI.showTeamPassphrasePrompt({
        title,
        submitLabel,
        onSubmit: async (data) => {
          try {
            const result = await onSubmit(data);
            resolve(result);
          } catch (error) {
            reject(error);
          }
        },
        onCancel: () => {
          onCancel?.();
          reject(new Error('Cancelled'));
        },
      });
    });
  }

  async function showTeamPassphrasePromptTop(options) {
    if (isTopFrame) {
      try {
        await runTeamPassphrasePrompt(options);
      } catch (error) {
        if (error?.message !== 'Cancelled') throw error;
      }
      return;
    }

    const requestId = createPromptRequestId();
    await new Promise((resolve, reject) => {
      const onResult = (event) => {
        if (event.data?.source !== 'goldspire-prompt-result' || event.data.requestId !== requestId) return;
        window.removeEventListener('message', onResult);
        if (event.data.cancelled) {
          reject(new Error('Cancelled'));
          return;
        }
        if (event.data.error) {
          reject(new Error(event.data.error));
          return;
        }
        resolve(event.data.data);
      };

      window.addEventListener('message', onResult);
      try {
        window.top.postMessage(
          {
            source: 'goldspire-prompt-request',
            requestId,
            kind: 'team-passphrase',
            title: options.title,
            submitLabel: options.submitLabel,
          },
          '*',
        );
      } catch {
        window.removeEventListener('message', onResult);
        reject(new Error('Could not open passphrase prompt.'));
      }
    }).then(async (data) => {
      await options.onSubmit(data);
    }).catch((error) => {
      if (error?.message !== 'Cancelled') throw error;
    });
  }

  function initSelectionRelay() {
    let relayTimer = null;
    const scheduleRelay = () => {
      window.clearTimeout(relayTimer);
      relayTimer = window.setTimeout(broadcastSelectionToTop, 400);
    };
    document.addEventListener('selectionchange', scheduleRelay);
    document.addEventListener('mouseup', () => window.setTimeout(broadcastSelectionToTop, 0));
    document.addEventListener('keyup', scheduleRelay);
  }

  function refreshSelectionUi() {
    window.clearTimeout(refreshDebounceTimer);
    refreshDebounceTimer = window.setTimeout(doRefreshSelectionUi, 400);
  }

  function ensureSelectionStatus() {
    if (document.getElementById('goldspire-selection-status')) return;

    const pill = document.createElement('div');
    pill.id = 'goldspire-selection-status';
    pill.className = 'gst-selection-status';
    pill.innerHTML = `
      <span class="gst-pill-text"></span>
      <button type="button" class="gst-pill-snooze" title="Don't show on this site">✕</button>
    `;
    document.documentElement.appendChild(pill);

    pill.querySelector('.gst-pill-snooze')?.addEventListener('click', (e) => {
      e.stopPropagation();
      pill.classList.remove('gst-selection-status--visible');
      // Snooze for current page-load session only; right-click shows a site-snooze option
      pillSnoozedUntil = Date.now() + 30 * 60 * 1000;
    });

    // Right-click pill dismiss → snooze for this site permanently
    pill.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      runSafe(snoozeCurrentSite().then(() => {
        pill.classList.remove('gst-selection-status--visible');
        safeToast(`Selection hints hidden on ${location.hostname}. Re-enable in extension settings.`, 'info');
      }));
    });

    document.addEventListener('selectionchange', refreshSelectionUi);
    document.addEventListener('mouseup', () => window.setTimeout(refreshSelectionUi, 0));
    document.addEventListener('keyup', refreshSelectionUi);
    document.addEventListener('focusin', () => window.setTimeout(refreshSelectionUi, 0));
    document.addEventListener('mousedown', () => window.setTimeout(refreshSelectionUi, 0));
  }

  async function recordHistory(entry) {
    try {
      const gst = browserApi();
      if (!gst?.storageGet) return;
      const { secureHistory = [] } = await gst.storageGet('local', { secureHistory: [] });
      gst.storage?.local?.set?.({
        secureHistory: [
          {
            at: Date.now(),
            mode: entry.mode || '',
            host: location.hostname || '',
          },
          ...secureHistory,
        ].slice(0, 8),
      });
    } catch {
      // Non-critical; ignore if extension context was invalidated.
    }
  }

  async function auditEvent(action, settings, mode) {
    try {
      await globalThis.GoldspireAudit?.log?.({
        action,
        host: location.hostname || '',
        mode: mode || '',
        profile: getProfile(settings),
      });
    } catch {
      // Non-critical.
    }
  }

  function maybeScheduleResecure({ settings, marker, secret, plaintext, target }) {
    if (!settings.resecureAfterUnlock || !target) return;
    const profile = getProfile(settings);
    const delaySeconds = Number(settings.resecureDelaySeconds) || (profile === 'organization' ? 45 : 60);

    GoldspireResecure.scheduleResecure({
      target,
      marker,
      secret,
      plaintext,
      delaySeconds,
      profile,
      unlockBaseUrl: GoldspireRedacted.getUnlockBaseUrl(settings, {
        forEmail: GoldspireRedacted.isEmailCompose(),
      }),
      onResecured: () => detectorController?.scheduleScan(),
    });
  }

  async function executeSecure(context, settings, { mode, unlockSecret, copyLink }) {
    const profile = getProfile(settings);
    const isOneTime = mode === 'one-time';
    const version = isOneTime ? '2' : '1';
    const plaintext = context.selectedText;

    if (!isOneTime && settings.enforceStrongPassphrase !== false) {
      GoldspirePassphrasePolicy?.assertPassphrase?.(unlockSecret, profile, { mode });
    } else if (!isOneTime) {
      GoldspireSecureCrypto.validatePassphrase(unlockSecret, profile, { mode });
    }

    const oneTimeTtl = GoldspireConstants.ONE_TIME_TTL_MS || 72 * 60 * 60 * 1000;
    const payload = await GoldspireSecureCrypto.encryptText(plaintext, unlockSecret, {
      mode: isOneTime ? 'one-time' : mode,
      profile,
      expiresAt: isOneTime ? Date.now() + oneTimeTtl : null,
      burnAfterRead: isOneTime,
    });
    const fullMarker = GoldspireSecureMarker.wrapSecured(payload, '', version);

    await GoldspireRedacted.insertRedacted(context, fullMarker, settings);

    await recordHistory({ mode: isOneTime ? 'one-time' : mode });
    await auditEvent('secure', settings, isOneTime ? 'one-time' : mode);

    if (isOneTime) {
      const unlockLink = GoldspireSecureMarker.buildUnlockLink(fullMarker);
      if (settings.copyOneTimeCodeAutomatically) await copyWithAutoClear(unlockSecret, settings);

      GoldspireSecureUI.showResultDialog({
        title: 'Secured with one-time code',
        lines: [
          { label: 'Share this code separately (not in the message)', value: unlockSecret },
          ...(unlockLink ? [{ label: 'Backup unlock link', value: unlockLink }] : []),
        ],
        copyItems: [
          { label: 'Copy code', value: unlockSecret },
          ...(unlockLink ? [{ label: 'Copy link', value: unlockLink }] : []),
        ],
      });

      if (copyLink && unlockLink) await copyWithAutoClear(unlockLink, settings);
    } else {
      GoldspireSecureUI.showToast('Secured as [redacted]. Send as normal.', 'success');
    }

    if (!isOneTime && mode === 'team' && settings.passphraseFromVault) {
      await GoldspireSecrets.cacheSessionTeamPassphrase?.(unlockSecret);
    }

    GoldspireSecrets.clearMemoryString(unlockSecret);
    refreshSelectionUi();
    detectorController?.scheduleScan();
  }

  async function unlockMarker(marker, options = {}) {
    const settings = await getSettings();
    const profile = getProfile(settings);
    const isOneTime = marker.mode === 'one-time' || marker.version === '2';
    const prefill =
      !settings.passphraseFromVault
      && !isOneTime
      && settings.useSavedPassphrase !== false
        ? settings.passphrase?.trim() || (await GoldspireSecrets.loadPassphrase?.(profile)) || ''
        : '';

    const unlockFields = isOneTime
      ? [
          {
            name: 'passphrase',
            label: 'One-time code',
            type: 'password',
            placeholder: 'Code from sender',
            required: true,
          },
        ]
      : settings.passphraseFromVault
        ? GoldspireSecureUI.teamPassphraseFields({ label: 'Passphrase' })
        : [
            {
              name: 'passphrase',
              label: 'Passphrase',
              type: 'password',
              placeholder: 'Team passphrase',
              value: prefill,
              required: true,
            },
          ];

    return new Promise((resolve) => {
      const useCompactTeamForm = !isOneTime && settings.passphraseFromVault;

      const handleUnlock = async ({ passphrase }) => {
        const secret = passphrase?.trim();
        if (!secret) throw new Error('Passphrase is required.');

        const fullMarker = marker.fullMarker || marker.full || '';
        if (await GoldspireBurnList?.isBurned?.(fullMarker)) {
          throw new Error('This one-time message was already unlocked and cannot be read again.');
        }

        const rateLimit = await GoldspireBurnList?.checkRateLimit?.(fullMarker);
        if (rateLimit && !rateLimit.allowed) {
          throw new Error(rateLimit.message);
        }

        let plaintext;
        let envelopeMeta;
        try {
          const result = await GoldspireSecureCrypto.decryptEnvelope(marker.payload, secret, {
            profile,
            mode: isOneTime ? 'one-time' : 'team',
          });
          plaintext = result.text;
          envelopeMeta = result.envelope;
          await GoldspireBurnList?.clearFailures?.(fullMarker);
        } catch (error) {
          await GoldspireBurnList?.recordFailure?.(fullMarker);
          throw new Error(
            error instanceof Error && (
              error.message.includes('at least')
              || error.message.includes('expired')
              || error.message.includes('already unlocked')
            )
              ? error.message
              : 'Wrong passphrase or corrupted text.',
          );
        }

        if (isOneTime || envelopeMeta?.burn) {
          await GoldspireBurnList?.burn?.(fullMarker);
        }

        await auditEvent('unlock', settings, isOneTime ? 'one-time' : marker.mode || 'team');

        if (!isOneTime && settings.passphraseFromVault) {
          await GoldspireSecrets.cacheSessionTeamPassphrase?.(secret);
        }

        let resecureTarget = null;

        if (options.replaceNode) {
          const textNode = document.createTextNode(plaintext);
          options.replaceNode.replaceWith(textNode);
          resecureTarget = { kind: 'node', node: textNode };
        } else if (options.context) {
          resecureTarget = replaceRedactedWithPlaintext(options.context, marker, plaintext);
        }

        maybeScheduleResecure({ settings, marker, secret, plaintext, target: resecureTarget });

        if (options.copyResult !== false) {
          await copyWithAutoClear(plaintext, settings);
          GoldspireSecureUI.showResultDialog({
            title: 'Unlocked',
            lines: [{ label: 'Secret', value: plaintext }],
            copyItems: [{ label: 'Copy', value: plaintext }],
          });
        } else {
          GoldspireSecureUI.showToast('Unlocked on this page.', 'success');
        }

        refreshSelectionUi();
        resolve(plaintext);
      };

      const onCancel = () => resolve(undefined);

      if (useCompactTeamForm) {
        showTeamPassphrasePromptTop({
          title: 'Unlock',
          submitLabel: 'Unlock',
          onSubmit: handleUnlock,
          onCancel,
        });
        return;
      }

      GoldspireSecureUI.showPrompt({
        title: 'Unlock',
        submitLabel: 'Unlock',
        fields: unlockFields,
        onSubmit: handleUnlock,
        onCancel,
      });
    });
  }

  async function secureSelection(message = {}) {
    if (!ensureExtensionReady()) return;

    const context = getSelectionContext(message);
    if (!context?.selectedText?.trim()) {
      GoldspireSecureUI.showToast('Highlight text first, then Ctrl+Shift+S or right-click.', 'error');
      return;
    }

    if (GoldspireRedacted.isRedactedToken(context.selectedText.trim())) {
      GoldspireSecureUI.showToast('Already secured as [redacted].', 'error');
      return;
    }

    const settings = await getSettings();
    const profile = getProfile(settings);

    const teamPassphrase = await resolveTeamPassphrase(settings);

    const canQuickSecure =
      !message.showOptions &&
      settings.defaultSecureMode === 'team' &&
      teamPassphrase &&
      (settings.passphraseFromVault || settings.useSavedPassphrase !== false);

    if (canQuickSecure) {
      await executeSecure(context, settings, {
        mode: 'team',
        unlockSecret: teamPassphrase,
        copyLink: false,
      });
      return;
    }

    const useVaultTeamFlow =
      !message.showOptions &&
      settings.passphraseFromVault &&
      settings.defaultSecureMode === 'team';

    if (useVaultTeamFlow) {
      await showTeamPassphrasePromptTop({
        onSubmit: async ({ passphrase }) => {
          const unlockSecret = passphrase?.trim();
          if (!unlockSecret) throw new Error('Passphrase is required.');
          await executeSecure(context, settings, {
            mode: 'team',
            unlockSecret,
            copyLink: false,
          });
        },
      });
      return;
    }

    GoldspireSecureUI.showPrompt({
      title: 'Secure selection',
      submitLabel: 'Secure as [redacted]',
      fields: [
        {
          type: 'radio-group',
          name: 'mode',
          label: 'Protection',
          options: [
            { value: 'team', label: 'Team passphrase', checked: settings.defaultSecureMode === 'team' },
            { value: 'one-time', label: 'One-time code (share separately)', checked: settings.defaultSecureMode === 'one-time' },
            { value: 'custom', label: 'Custom passphrase (this message only)', checked: settings.defaultSecureMode === 'custom' },
          ],
        },
        {
          name: 'passphrase',
          label: 'Team passphrase',
          type: 'password',
          value: settings.passphraseFromVault ? '' : settings.useSavedPassphrase ? settings.passphrase : '',
        },
        {
          name: 'customPassphrase',
          label: 'Custom passphrase',
          type: 'password',
        },
        {
          type: 'checkbox',
          name: 'copyLink',
          label: 'Copy backup unlock link (one-time mode)',
          checked: false,
        },
      ],
      onSubmit: async ({ mode, passphrase, customPassphrase, copyLink }) => {
        const isOneTime = mode === 'one-time';
        const unlockSecret = isOneTime
          ? GoldspireSecureCrypto.generateOneTimeCode(16)
          : mode === 'custom'
            ? customPassphrase?.trim()
            : passphrase?.trim() || teamPassphrase;

        if (!unlockSecret) throw new Error('Passphrase is required.');

        if (!isOneTime && settings.enforceStrongPassphrase !== false && mode !== 'custom') {
          GoldspirePassphrasePolicy?.assertPassphrase?.(unlockSecret, profile, { mode });
        }

        await executeSecure(context, settings, {
          mode: isOneTime ? 'one-time' : mode,
          unlockSecret,
          copyLink,
        });
      },
    });
  }

  async function unlockSelection(message = {}) {
    if (!ensureExtensionReady()) return;

    const context = getSelectionContext(message);
    if (!context?.selectedText) {
      GoldspireSecureUI.showToast('Click or highlight [redacted] to unlock.', 'error');
      return;
    }

    const marker = GoldspireRedacted.resolveSelection(context, context.selectedText);
    if (!marker) {
      GoldspireSecureUI.showToast('No [redacted] text found here.', 'error');
      return;
    }

    await unlockMarker(marker, { context, copyResult: false });
  }

  async function insertGeneratedPassword() {
    const settings = await getSettings();
    const password = GoldspirePassword.generatePassword({
      length: settings.passwordLength,
      lowercase: settings.passwordLowercase,
      uppercase: settings.passwordUppercase,
      digits: settings.passwordDigits,
      symbols: settings.passwordSymbols,
    });

    if (!insertAtCursor(password)) {
      await copyWithAutoClear(password, settings);
      GoldspireSecureUI.showToast('Password copied to clipboard.', 'info');
      return;
    }

    GoldspireSecureUI.showResultDialog({
      title: 'Password generated',
      lines: [{ label: 'Password', value: password }],
      copyItems: [{ label: 'Copy', value: password }],
    });
    refreshSelectionUi();
  }

  async function insertGeneratedSecuredPassword(message = {}) {
    if (!ensureExtensionReady()) return;

    const settings = await getSettings();
    const password = GoldspirePassword.generatePassword({
      length: settings.passwordLength,
      lowercase: settings.passwordLowercase,
      uppercase: settings.passwordUppercase,
      digits: settings.passwordDigits,
      symbols: settings.passwordSymbols,
    });

    const target = getInsertionContext(message);
    if (!target) {
      GoldspireSecureUI.showToast('Click into a field first.', 'error');
      return;
    }

    const profile = getProfile(settings);
    const teamPassphrase = await resolveTeamPassphrase(settings);

    const mode = settings.defaultSecureMode === 'one-time' ? 'one-time' : 'team';

    if (mode === 'team' && !teamPassphrase) {
      await showTeamPassphrasePromptTop({
        submitLabel: 'Secure',
        onSubmit: async ({ passphrase }) => {
          const unlockSecret = passphrase?.trim();
          if (!unlockSecret) throw new Error('Passphrase is required.');
          await executeSecure({ ...target, selectedText: password }, settings, {
            mode: 'team',
            unlockSecret,
            copyLink: false,
          });
          GoldspireSecureUI.showToast('Generated & secured as [redacted].', 'success');
        },
      });
      return;
    }

    // One-time mode generates a separate code; generated password becomes the secured plaintext.
    if (mode === 'one-time') {
      const code = GoldspireSecureCrypto.generateOneTimeCode(16);
      await executeSecure({ ...target, selectedText: password }, settings, {
        mode: 'one-time',
        unlockSecret: code,
        copyLink: false,
      });
      return;
    }

    if (!teamPassphrase) {
      GoldspireSecureUI.showToast('Set your team passphrase first.', 'error');
      return;
    }

    await executeSecure({ ...target, selectedText: password }, settings, {
      mode: 'team',
      unlockSecret: teamPassphrase,
      copyLink: false,
    });
    GoldspireSecureUI.showToast('Generated & secured as [redacted].', 'success');
  }

  async function handleCommand(message = {}) {
    try {
      const handlers = {
        SECURE_SELECTION: () => {
          // In iframe-heavy apps (Jira/Outlook), selection lives in a child frame.
          if (isTopFrame && !getSelectionContext(message)?.selectedText?.trim() && remoteSelectionToken) {
            forwardToRelayedFrame('SECURE_SELECTION', message);
            return;
          }
          return secureSelection(message);
        },
        SECURE_WITH_OPTIONS: () => {
          if (isTopFrame && !getSelectionContext(message)?.selectedText?.trim() && remoteSelectionToken) {
            forwardToRelayedFrame('SECURE_WITH_OPTIONS', { ...message, showOptions: true });
            return;
          }
          return secureSelection({ ...message, showOptions: true });
        },
        UNLOCK_SELECTION: () => {
          const ctx = getSelectionContext(message);
          if (isTopFrame && !ctx?.selectedText?.trim() && remoteSelectionToken) {
            forwardToRelayedFrame('UNLOCK_SELECTION', message);
            return;
          }
          return unlockSelection(message);
        },
        INSERT_GENERATED_PASSWORD: insertGeneratedPassword,
        INSERT_GENERATED_SECURED_PASSWORD: () => insertGeneratedSecuredPassword(message),
        INSERT_TEXT: async () => {
          if (!message.text) return;
          if (!insertAtCursor(message.text)) {
            await copyWithAutoClear(message.text, await getSettings());
            GoldspireSecureUI.showToast('Copied to clipboard.', 'info');
          }
        },
        GET_SELECTION_STATUS: async () => ({
          preview: GoldspireSelection.getLivePreview(),
          inEditable: isComposeContext(),
        }),
      };

      const handler = handlers[message?.type];
      if (!handler) return { ok: false };
      await handler();
      return {
        ok: true,
        preview: GoldspireSelection.getLivePreview(),
        inEditable: isComposeContext(),
      };
    } catch (error) {
      if (isInvalidatedError(error)) {
        warnStaleContext();
        return { ok: false };
      }
      console.warn('[Goldspire Secure Text]', error);
      safeToast('Something went wrong — refresh the page and try again.', 'error');
      return { ok: false };
    }
  }

  window.__goldspireHandleCommand = handleCommand;

  function ensureFloatingButtons() {
    if (document.getElementById('goldspire-secure-text-fabs')) return;

    getSettings().then((settings) => {
      cachedUiSettings = settings;
      // Always inject the wrapper — visibility is controlled per-button by refreshSelectionUi
      const wrap = document.createElement('div');
      wrap.id = 'goldspire-secure-text-fabs';
      wrap.className = 'gst-fabs';
      wrap.innerHTML = `
        <button type="button" id="goldspire-secure-fab" class="gst-fab">Secure</button>
        <button type="button" id="goldspire-unlock-fab" class="gst-fab gst-fab--unlock">Unlock</button>
      `;
      document.documentElement.appendChild(wrap);

      // Route through handleCommand so the action can be forwarded to the correct iframe.
      wrap.querySelector('#goldspire-secure-fab')?.addEventListener('click', () => runSafe(handleCommand({ type: 'SECURE_SELECTION' })));
      wrap.querySelector('#goldspire-unlock-fab')?.addEventListener('click', () => runSafe(handleCommand({ type: 'UNLOCK_SELECTION' })));
      refreshSelectionUi();
    }).catch(() => {});
  }

  window.addEventListener('message', (event) => {
    if (event.data?.source === 'goldspire-selection-relay' && isTopFrame) {
      remoteSelectionPreview = event.data.preview || '';
      remoteSelectionToken = event.data.token || '';
      refreshSelectionUi();
      return;
    }

    if (event.data?.source === 'goldspire-prompt-request' && isTopFrame) {
      const { requestId, kind, title, submitLabel } = event.data;
      const replyTarget = event.source;
      if (!replyTarget || kind !== 'team-passphrase') return;

      const reply = (payload) => {
        try {
          replyTarget.postMessage({ source: 'goldspire-prompt-result', requestId, ...payload }, '*');
        } catch {
          // Frame may have navigated away.
        }
      };

      GoldspireSecureUI.showTeamPassphrasePrompt({
        title,
        submitLabel,
        onSubmit: async (data) => reply({ data }),
        onCancel: () => reply({ cancelled: true }),
      });
      return;
    }

    // Child frame receives a command from the top-frame UI.
    if (event.data?.source === 'goldspire-ui-command' && !isTopFrame) {
      if (event.data.token !== frameToken) return;
      runSafe(handleCommand(event.data));
      return;
    }
    if (event.source !== window || event.data?.source !== 'goldspire-secure-text-extension') return;
    runSafe(handleCommand(event.data));
  });

  GoldspireSelection.initSelectionTracking();

  document.addEventListener(
    'contextmenu',
    (event) => {
      lastContextMenuTarget = event.target;
    },
    true,
  );

  if (isTopFrame) {
    ensureSelectionStatus();
    ensureFloatingButtons();
  } else {
    initSelectionRelay();
  }

  // Pre-load snoozed hosts and cache settings for synchronous UI decisions
  runSafe(loadSnoozedHosts());
  getSettings().then((s) => { cachedUiSettings = s; }).catch(() => {});

  detectorController = GoldspireSecureDetector.initDetector(getSettings, (marker, node) => {
    runSafe(unlockMarker(marker, { replaceNode: node, copyResult: true }));
  });

  try {
    runtimeApi()?.onMessage?.addListener((message, _sender, sendResponse) => {
      runSafe(
        handleCommand(message).then((result) => {
          try {
            sendResponse(result || { ok: true });
          } catch {
            // Extension context may already be gone.
          }
        }),
      );
      return true;
    });
  } catch (error) {
    if (isInvalidatedError(error)) markContextDead();
  }
})();
