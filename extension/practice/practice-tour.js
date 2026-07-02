/**
 * Practice guided tour — intro splash, then glowing V tracker + floating bubble.
 */
(function (global) {
  const STORAGE_KEY = 'veilPracticeTourCompleteV10';
  const PRACTICE_KEY = 'sk-practice-demo-7f3a9b2c4e8d1a6f0b5c9e2d4a7f1b3';
  const SAMPLE_IBAN = 'IE64IRCE99007012345678';
  const PLAIN_PHRASE = 'Thanks for your help on the project';
  const TYPE_DEMO_KEY = 'sk-type-demo';

  let stepIndex = 0;
  let watchers = [];
  let tourRoot = null;
  let spotlightEl = null;
  let coachEl = null;
  let bubbleEl = null;
  let introEl = null;
  let activeTarget = null;
  let advancing = false;
  let savedHintsMode = 'smart';
  let tourActive = false;
  const tourContext = { lastSecureMode: null };

  function rectsOverlap(a, b, pad = 8) {
    if (!a || !b) return false;
    return !(a.right + pad < b.left || a.left - pad > b.right || a.bottom + pad < b.top || a.top - pad > b.bottom);
  }

  function unlockStepBody() {
    if (tourContext.lastSecureMode === 'one-time') {
      return 'Click <code>[redacted]</code>. If Veil showed a one-time code, paste that. Otherwise use your saved Veil passphrase.';
    }
    return 'Click <code>[redacted]</code> and enter your Veil passphrase. If you secured with a one-time code earlier, paste that instead.';
  }

  async function openOptionsSheet() {
    if (!hasKeySelected() && hasKeyPlainInBody()) selectTextInCompose(PRACTICE_KEY);
    return bridgeRequest('openOptionsSheet');
  }

  function dismissVeilPrompt() {
    const root = document.getElementById('goldspire-veil-prompt');
    root?.querySelector('[data-action="close"]')?.click();
    if (root?.classList?.contains('gst-overlay') || root?.querySelector('.gst-dialog')) {
      root.remove();
    }
  }

  function dismissVeilCopilot() {
    document.querySelectorAll('.gst-veil-pop').forEach((el) => el.remove());
    document.dispatchEvent(new CustomEvent('veil-practice-reset-copilot'));
  }

  function resetCopilotForTyping() {
    dismissVeilCopilot();
    clearSelection();
  }

  async function prepareCopilotLab() {
    await ensureCopilot();
    await setHintsMode(savedHintsMode || 'smart');
    dismissVeilCopilot();
    clearSelection();
  }

  function clearSelection() {
    global.getSelection?.()?.removeAllRanges?.();
    document.dispatchEvent(new CustomEvent('veil-practice-clear-selection'));
  }

  function isExtensionUi(el) {
    if (!el) return false;
    return Boolean(
      el.id === 'goldspire-selection-status'
      || el.classList?.contains('gst-veil-pop')
      || el.closest?.('.gst-veil-pop, #goldspire-selection-status, .gst-overlay'),
    );
  }

  function secureSheet() {
    return document.querySelector('.gst-veil-pop--secure');
  }

  function copilotInterceptVisible() {
    return Boolean(document.querySelector('.gst-veil-pop:not(.gst-veil-pop--secure):not([hidden])'));
  }

  function copilotPasteVisible() {
    return copilotInterceptVisible();
  }

  function resolveTrackerTarget(step) {
    const raw = step.trackerTarget || step.target;
    if (!raw) return null;
    if (typeof raw === 'function') return raw();
    if (typeof raw === 'string') return document.querySelector(raw);
    if (raw instanceof Element) return raw;
    return null;
  }

  function composeBody() { return document.getElementById('practice-body'); }
  function focusComposeEnd() {
    const el = composeBody();
    if (!el) return;
    el.focus();
    if (!el.isContentEditable) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = global.getSelection();
    sel?.removeAllRanges?.();
    sel?.addRange?.(range);
  }
  function bodyText() {
    const el = composeBody();
    return el ? (el.innerText || el.textContent || el.value || '') : '';
  }
  function selectionText() { return global.getSelection?.()?.toString?.() || ''; }
  function hasKeySelected() {
    const t = selectionText();
    return t.includes('sk-practice-demo') || t.includes('sk-');
  }
  function hasPlainPhraseSelected() { return selectionText().includes('Thanks for your help'); }
  function looksLikeSecret(text) {
    const t = String(text || '').trim();
    if (t.length < 8) return true;
    if (/sk-[a-z0-9]/i.test(t)) return true;
    if (global.GoldspireDetectionLib?.analyzeAll?.(t, { source: 'selection' })?.some((d) => (d.confidence || 0) >= 50)) {
      return true;
    }
    return false;
  }
  function hasBenignHighlight() {
    const t = selectionText().trim();
    return t.length >= 8 && !looksLikeSecret(t);
  }
  function hasBenignHighlightWithPill() { return pillVisible() && hasBenignHighlight(); }
  function ensurePlainPhraseVisible() {
    if (bodyText().includes('Thanks for your help')) return;
    const el = composeBody();
    if (!el) return;
    const suffix = '\n\nThanks for your help on the project.';
    if (el instanceof HTMLTextAreaElement) el.value = `${bodyText().trim()}${suffix}`;
    else el.appendChild(document.createTextNode(suffix));
  }
  function oneTimeModeSelected() {
    const chip = document.querySelector('.gst-veil-pop--secure [data-mode].gst-veil-pop__chip--pick');
    return chip?.dataset?.mode === 'one-time';
  }
  function oneTimeDialogVisible() {
    return Boolean(document.querySelector('#goldspire-veil-prompt .gst-result'));
  }
  function hasRedactedLink() {
    return Boolean(composeBody()?.querySelector?.('a.gst-redacted, a[href*="unlock"]'));
  }
  function hasKeyPlainInBody() { return bodyText().includes(PRACTICE_KEY); }
  function pillVisible() {
    const pill = document.getElementById('goldspire-selection-status');
    return Boolean(pill?.classList?.contains('gst-selection-status--visible'));
  }
  function copilotVisible() { return Boolean(document.querySelector('.gst-veil-pop:not([hidden])')); }
  function optionsSheetVisible() { return Boolean(document.querySelector('.gst-veil-pop--secure')); }

  function typingStepReady() {
    return copilotInterceptVisible();
  }

  function bridgeRequest(action, payload = {}) {
    return new Promise((resolve) => {
      const requestId = `vpt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const onResult = (event) => {
        if (event.detail?.requestId !== requestId) return;
        document.removeEventListener('veil-practice-bridge-result', onResult);
        resolve(event.detail);
      };
      document.addEventListener('veil-practice-bridge-result', onResult);
      document.dispatchEvent(new CustomEvent('veil-practice-bridge', {
        detail: { requestId, action, payload },
      }));
      global.setTimeout(() => {
        document.removeEventListener('veil-practice-bridge-result', onResult);
        resolve({ ok: false, timeout: true });
      }, 4000);
    });
  }

  async function setHintsMode(mode) {
    const result = await bridgeRequest('setHintsMode', { mode });
    if (result.ok) updateHintsLab(mode);
    return result;
  }
  async function ensureCopilot() { return bridgeRequest('ensureCopilot'); }

  function clearWatchers() {
    watchers.forEach((stop) => stop?.());
    watchers = [];
  }
  function watch(condition, onMet) {
    if (condition()) { onMet(); return; }
    const id = global.setInterval(() => {
      if (condition()) { global.clearInterval(id); onMet(); }
    }, 200);
    watchers.push(() => global.clearInterval(id));
  }
  function watchEvent(name, onMet, predicate) {
    const handler = (event) => {
      if (predicate && !predicate(event)) return;
      document.removeEventListener(name, handler);
      onMet(event);
    };
    document.addEventListener(name, handler);
    watchers.push(() => document.removeEventListener(name, handler));
  }

  function steps() {
    return [
      { id: 'intro', outlineGroup: 0, title: 'Learn Veil hands-on', body: document.getElementById('goldspire-selection-status') ? 'Secure, unlock, tune hints, try copilot on paste and typing. Veil is active on this page — nothing leaves your browser.' : 'Install Veil and reload for hands-on steps. This sandbox teaches highlight → Quick → unlock with zero risk.', why: 'Encryption runs in your browser before mail or AI tools see plaintext.', type: 'info', nextLabel: 'Continue', optionalLink: document.getElementById('goldspire-selection-status') ? null : { href: 'install.html', label: 'Install guide' }, prime: async () => { const s = await bridgeRequest('getSettings'); if (s.ok) savedHintsMode = s.selectionUiMode || 'smart'; await ensureCopilot(); } },
      { id: 'highlight', outlineGroup: 0, title: 'Highlight the secret', body: 'Select the <code>sk-</code> API key in the compose box.', why: 'You choose exactly what to protect.', type: 'action', target: '#practice-body', waitFor: () => hasKeySelected() || pillVisible(), waitHint: 'Waiting for your selection…' },
      { id: 'quick', outlineGroup: 0, title: 'Click Quick', body: 'On the Veil pill, tap <strong>Quick</strong> (or <kbd>Ctrl+Shift+S</kbd>).', type: 'action', target: () => document.querySelector('.gst-pill-half--quick') || '#goldspire-selection-status', waitFor: () => hasRedactedLink(), waitHint: 'Waiting for [redacted] link…', events: ['veil-practice-secured'] },
      { id: 'celebrate-secure', outlineGroup: 0, title: 'Just like that!', body: 'Plaintext became a clickable <code>[redacted]</code> link. Recipients tap the link and enter the passphrase or one-time code you shared separately.', celebrate: 'Encrypted before send.', why: 'Forwarded email ≠ leaked secret.', type: 'info', nextLabel: 'Try unlock', target: () => composeBody()?.querySelector('a.gst-redacted'), prime: () => dismissVeilPrompt() },
      { id: 'unlock', outlineGroup: 1, title: 'Click [redacted]', body: unlockStepBody(), type: 'action', target: () => composeBody()?.querySelector('a.gst-redacted'), waitFor: () => hasKeyPlainInBody() && !hasRedactedLink(), waitHint: 'Waiting for unlock…', events: ['veil-practice-unlocked'], showContinueDuringWait: true, noDim: true, noSpotlight: true },
      { id: 'celebrate-unlock', outlineGroup: 1, title: 'Recipient view', body: 'Anyone with the passphrase or one-time code sees the secret in-thread — without it, the link stays locked.', celebrate: 'Unlock in place.', type: 'info', nextLabel: 'Continue' },
      { id: 'options', outlineGroup: 2, title: 'Try Options', body: 'Highlight the key → <strong>Options</strong> on the pill.', type: 'action', trackerTarget: () => document.querySelector('.gst-pill-half--options') || '#goldspire-selection-status', waitFor: () => optionsSheetVisible(), waitHint: 'Open Options…', prime: () => { if (!hasKeySelected() && hasKeyPlainInBody()) selectTextInCompose(PRACTICE_KEY); }, noDim: true, noSpotlight: true },
      { id: 'options-modes', outlineGroup: 2, title: 'Choose how they unlock', body: '<strong>One-time</strong> — unique code for this message; send it separately (text or call).<br><br><strong>My passphrase</strong> — the password you saved in Veil settings.<br><br><em>One-time suits clients; passphrase suits people who already have it.</em>', type: 'info', nextLabel: 'Next', trackerTarget: () => secureSheet(), noDim: true, noSpotlight: true },
      { id: 'options-onetime-secure', outlineGroup: 2, title: 'One-time & Secure', body: 'In the Veil sheet (follow the <strong>V</strong>), tap <strong>One-time</strong>, then <strong>Secure</strong>. Veil opens a code dialog — read the next step before closing it.', type: 'action', trackerTarget: () => secureSheet(), waitFor: () => hasRedactedLink() && oneTimeDialogVisible(), waitHint: 'Choose One-time, tap Secure, then wait for the code dialog…', showContinueDuringWait: true, continueLabel: 'Continue', prime: async () => { await openOptionsSheet(); }, noDim: true, noSpotlight: true },
      { id: 'onetime-code', outlineGroup: 2, title: 'Copy your unlock code', body: 'Find the dialog Veil just opened (the <strong>V</strong> points at it). Tap <strong>Copy code</strong> and save it — this code is <em>not</em> in the email.', why: 'You can also copy the unlock page link as a backup.', type: 'info', nextLabel: 'I copied the code', trackerTarget: () => document.querySelector('#goldspire-veil-prompt .gst-dialog, .gst-overlay .gst-dialog'), noDim: true, noSpotlight: true },
      { id: 'onetime-unlock', outlineGroup: 2, title: 'Unlock with the code', body: 'Click <code>[redacted]</code> and paste the code you copied.', type: 'action', trackerTarget: () => composeBody()?.querySelector('a.gst-redacted'), waitFor: () => hasKeyPlainInBody(), waitHint: 'Unlock with your code…', events: ['veil-practice-unlocked'], showContinueDuringWait: true, noDim: true, noSpotlight: true },
      { id: 'hints-intro', outlineGroup: 3, title: 'Smart · Always · Off', body: 'Controls when the Veil pill appears. Try each mode — syncs to Settings.', why: '<strong>Smart</strong> — secrets only. <strong>Always</strong> — any highlight. <strong>Off</strong> — shortcuts only.', type: 'info', nextLabel: 'Try Smart', showHintsLab: true, prime: async () => { await setHintsMode('smart'); } },
      { id: 'hints-smart-plain', outlineGroup: 3, title: 'Smart + plain text', body: 'Highlight any normal sentence — not the API key. Try the line that starts with <em>Thanks for your help…</em>', type: 'action', target: '#practice-body', showHintsLab: true, waitFor: () => hasBenignHighlight(), waitHint: 'Highlight a normal sentence…', nextAfterWait: true, showContinueDuringWait: true, continueLabel: 'Continue', prime: () => ensurePlainPhraseVisible() },
      { id: 'hints-smart-plain-result', outlineGroup: 3, title: 'Smart mode result', body: '', type: 'info', nextLabel: 'Try Always mode', showHintsLab: true },
      { id: 'hints-always', outlineGroup: 3, title: 'Always mode', body: 'Switched to <strong>Always</strong> (see the buttons above). Highlight any normal sentence — not the API key — and the pill should appear.', type: 'action', target: '#practice-body', showHintsLab: true, prime: async () => { clearSelection(); await setHintsMode('always'); ensurePlainPhraseVisible(); }, waitFor: () => hasBenignHighlightWithPill(), waitHint: 'Highlight plain text…', showContinueDuringWait: true, continueLabel: 'Continue', nextAfterWait: true },
      { id: 'hints-always-result', outlineGroup: 3, title: 'Pill on everything', body: 'Power-user mode — Quick on any selection.', celebrate: 'Maximum reachability.', type: 'info', nextLabel: 'Smart + secret', showHintsLab: true },
      { id: 'hints-smart-secret', outlineGroup: 3, title: 'Smart + API key', body: 'Back to <strong>Smart</strong> — highlight the <code>sk-</code> key. The pill should appear.', type: 'action', target: '#practice-body', showHintsLab: true, prime: async () => { clearSelection(); await setHintsMode('smart'); }, waitFor: () => hasKeySelected() && pillVisible(), waitHint: 'Highlight the key…', showContinueDuringWait: true, continueLabel: 'Continue' },
      { id: 'hints-quiet', outlineGroup: 3, title: 'Off mode', body: 'Off stops the pill on highlight. Use <kbd>Ctrl+Shift+S</kbd> to secure without the pill. Highlight the <code>sk-</code> key to verify — no pill should appear.', type: 'action', target: '#practice-body', showHintsLab: true, prime: async () => { await setHintsMode('quiet'); clearSelection(); }, waitFor: () => hasKeySelected() && !pillVisible(), waitHint: 'Highlight the key — pill should stay hidden…', showContinueDuringWait: true, continueLabel: 'Continue', onLeave: async () => { clearSelection(); await setHintsMode(savedHintsMode || 'smart'); } },
      { id: 'paste-iban', outlineGroup: 4, title: 'Copilot — paste', body: `Tap <strong>Copy IBAN</strong> below, click in the compose box, and paste on a new line.<br><code>${SAMPLE_IBAN}</code>`, type: 'action', target: '#practice-body', sampleCopy: SAMPLE_IBAN, sampleLabel: 'Copy IBAN', waitFor: () => copilotPasteVisible(), waitHint: 'Paste the IBAN in compose…', waitReadyHint: 'Veil flagged your paste — tap Continue when ready.', manualAdvance: true, showContinueDuringWait: true, continueLabel: 'Continue', noDim: true, prime: async () => { await prepareCopilotLab(); focusComposeEnd(); } },
      { id: 'paste-done', outlineGroup: 4, title: 'Paste caught', body: 'Veil flagged what you pasted. <strong>Secure</strong> encrypts · <strong>Mask</strong> redacts · <strong>Allow</strong> dismisses.', type: 'info', nextLabel: 'Try typing', trackerTarget: () => document.querySelector('.gst-veil-pop:not(.gst-veil-pop--secure)'), noDim: true, noSpotlight: true, prime: () => dismissVeilCopilot() },
      { id: 'typing-type', outlineGroup: 5, title: 'Copilot — typing', body: `Veil watches keystrokes too. Click in the compose box and type exactly: <code>${TYPE_DEMO_KEY}</code> (not “test”) — or tap <strong>Copy key</strong>.`, type: 'action', target: '#practice-body', sampleCopy: TYPE_DEMO_KEY, sampleLabel: 'Copy key', waitFor: () => typingStepReady(), waitHint: `Type exactly: ${TYPE_DEMO_KEY}`, waitReadyHint: 'Veil flagged your typing — tap Continue when ready.', manualAdvance: true, showContinueDuringWait: true, continueLabel: 'Continue', prime: async () => { await prepareCopilotLab(); resetCopilotForTyping(); focusComposeEnd(); } },
      { id: 'graduate', outlineGroup: 6, title: 'Ready for real mail', body: 'Copilot catches paste and typing. Outlook, Gmail, forms — same flow.', celebrate: 'Practice complete', type: 'info', nextLabel: 'Done', done: true, prime: async () => { await setHintsMode(savedHintsMode || 'smart'); } },
    ];
  }

  function selectTextInCompose(needle) {
    const root = composeBody();
    if (!root) return;
    const text = bodyText();
    const start = text.indexOf(needle);
    if (start < 0) return;
    root.focus();
    if (root instanceof HTMLTextAreaElement || root instanceof HTMLInputElement) {
      root.setSelectionRange(start, start + needle.length);
      return;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let pos = 0;
    let node = walker.nextNode();
    while (node) {
      const len = node.textContent.length;
      if (pos + len > start) {
        const range = document.createRange();
        const offset = start - pos;
        range.setStart(node, offset);
        range.setEnd(node, Math.min(len, offset + needle.length));
        const sel = global.getSelection();
        sel?.removeAllRanges?.();
        sel?.addRange?.(range);
        return;
      }
      pos += len;
      node = walker.nextNode();
    }
  }

  function resolveTarget(step) {
    const raw = typeof step.target === 'function' ? step.target() : step.target;
    if (!raw) return null;
    if (typeof raw === 'string') return document.querySelector(raw);
    if (raw instanceof Element) return raw;
    return null;
  }

  function updateHintsLab(activeMode) {
    document.querySelectorAll('[data-hints-mode]').forEach((btn) => {
      const on = btn.dataset.hintsMode === activeMode;
      btn.classList.toggle('practice-hints-lab__btn--active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function toggleTourZones(step) {
    const hintsLab = document.getElementById('practice-hints-lab');
    if (hintsLab) hintsLab.hidden = !step?.showHintsLab;
  }

  function clearSpotlight() {
    activeTarget?.classList?.remove('practice-tour-target');
    activeTarget = null;
    spotlightEl?.classList.remove('practice-tour__spotlight--on');
  }

  function positionSpotlight(target) {
    if (!spotlightEl || !target?.getBoundingClientRect) {
      spotlightEl?.classList.remove('practice-tour__spotlight--on');
      return;
    }
    const rect = target.getBoundingClientRect();
    const pad = 10;
    spotlightEl.style.top = `${Math.max(8, rect.top - pad)}px`;
    spotlightEl.style.left = `${Math.max(8, rect.left - pad)}px`;
    spotlightEl.style.width = `${rect.width + pad * 2}px`;
    spotlightEl.style.height = `${rect.height + pad * 2}px`;
    spotlightEl.classList.add('practice-tour__spotlight--on');
    activeTarget?.classList?.remove('practice-tour-target');
    target.classList.add('practice-tour-target');
    activeTarget = target;
    target.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }

  function positionCoach(target) {
    if (!coachEl) return;
    const pad = 12;
    const rect = target?.getBoundingClientRect?.();
    coachEl.style.visibility = 'hidden';
    coachEl.removeAttribute('hidden');
    const coachRect = coachEl.getBoundingClientRect();
    const coachW = coachRect.width || 320;
    const coachH = coachRect.height || 72;

    let left = pad;
    let top = pad;

    if (rect) {
      left = rect.left - coachW - pad;
      top = rect.top + Math.max(0, (rect.height - coachH) * 0.35);
      if (left < pad) {
        left = Math.min(rect.right + pad, global.innerWidth - coachW - pad);
        top = rect.top + Math.max(0, (rect.height - coachH) * 0.35);
      }
      if (left + coachW > global.innerWidth - pad) {
        left = global.innerWidth - coachW - pad;
      }
      if (top + coachH > global.innerHeight - pad) {
        top = global.innerHeight - coachH - pad;
      }
      if (top < pad) top = pad;
    }

    coachEl.style.top = `${top}px`;
    coachEl.style.left = `${left}px`;
    coachEl.style.visibility = '';
  }

  function positionTrackerAndBubble(target) {
    positionCoach(target);
  }

  function updateOutline() {
    const list = document.getElementById('practice-tour-outline');
    const step = steps()[stepIndex];
    if (!list || !step) return;
    const group = step.outlineGroup ?? 0;
    list.querySelectorAll('li').forEach((li, i) => {
      li.classList.toggle('is-done', i < group);
      li.classList.toggle('is-active', i === group);
    });
  }

  function setBubbleProgress(total) {
    const el = bubbleEl?.querySelector('.practice-tour__bubble-step');
    if (el) el.textContent = `${stepIndex + 1} / ${total}`;
    if (coachEl) coachEl.setAttribute('aria-label', `Practice step ${stepIndex + 1} of ${total}`);
  }

  let leavingStep = null;

  async function renderStep() {
    if (leavingStep?.onLeave) await leavingStep.onLeave();
    clearWatchers();

    const allSteps = steps();
    const step = allSteps[stepIndex];
    if (!step || !bubbleEl) return;

    leavingStep = step;
    await step.prime?.();
    updateOutline();
    toggleTourZones(step);
    setBubbleProgress(allSteps.length);

    bubbleEl.querySelector('.practice-tour__bubble-title').innerHTML = step.title;
    const bodyEl = bubbleEl.querySelector('.practice-tour__bubble-body');
    if (step.id === 'unlock') bodyEl.innerHTML = unlockStepBody();
    else if (step.id === 'hints-smart-plain-result') {
      bodyEl.innerHTML = pillVisible()
        ? 'The pill appeared — Smart still flagged this line. That can happen on longer phrases. Continue to try <strong>Always</strong> mode next.'
        : 'No pill — Smart stays quiet for normal text like this.';
    } else bodyEl.innerHTML = typeof step.body === 'function' ? step.body() : step.body;

    tourRoot?.classList.toggle('practice-tour--no-dim', Boolean(step.noDim));
    tourRoot?.classList.toggle('practice-tour--no-spotlight', Boolean(step.noSpotlight));

    const whyEl = bubbleEl.querySelector('.practice-tour__bubble-why');
    if (step.why) { whyEl.hidden = false; whyEl.innerHTML = step.why; } else { whyEl.hidden = true; }

    const celebrateEl = bubbleEl.querySelector('.practice-tour__bubble-celebrate');
    if (step.celebrate) { celebrateEl.hidden = false; celebrateEl.textContent = step.celebrate; } else { celebrateEl.hidden = true; }

    const waitEl = bubbleEl.querySelector('.practice-tour__bubble-wait');
    const backBtn = bubbleEl.querySelector('[data-tour-back]');
    const nextBtn = bubbleEl.querySelector('[data-tour-next]');
    const sampleBtn = bubbleEl.querySelector('[data-tour-sample]');
    const linkSlot = bubbleEl.querySelector('.practice-tour__bubble-link');

    if (backBtn) {
      backBtn.hidden = stepIndex <= 0;
    }

    if (step.type === 'action' && step.waitFor) {
      waitEl.hidden = false;
      waitEl.textContent = step.waitHint || 'Try it now…';
      const showNext = Boolean(step.nextAfterWait || step.showContinueDuringWait);
      if (showNext) {
        nextBtn.hidden = false;
        nextBtn.removeAttribute('hidden');
        nextBtn.textContent = step.continueLabel || step.nextLabel || 'Continue';
      } else {
        nextBtn.hidden = true;
      }
      const advance = () => global.setTimeout(() => go(1), 250);
      if (step.manualAdvance) {
        nextBtn.disabled = true;
        watch(step.waitFor, () => {
          nextBtn.disabled = false;
          if (step.waitReadyHint) waitEl.textContent = step.waitReadyHint;
        });
      } else {
        const autoAdvanceOnWait = step.nextAfterWait || !step.showContinueDuringWait;
        if (autoAdvanceOnWait) watch(step.waitFor, advance);
        (step.events || []).forEach((name) => watchEvent(name, advance, step.eventFilter));
      }
    } else {
      waitEl.hidden = true;
      nextBtn.hidden = false;
      nextBtn.textContent = step.nextLabel || (step.done ? 'Done' : 'Next');
    }

    if (step.sampleCopy && sampleBtn) {
      sampleBtn.hidden = false;
      sampleBtn.textContent = step.sampleLabel || 'Copy';
      sampleBtn.onclick = async () => {
        try { await navigator.clipboard.writeText(step.sampleCopy); sampleBtn.textContent = 'Copied'; }
        catch { sampleBtn.textContent = step.sampleCopy; }
      };
    } else if (sampleBtn) sampleBtn.hidden = true;

    if (step.optionalLink && linkSlot) {
      linkSlot.hidden = false;
      linkSlot.innerHTML = `<a href="${step.optionalLink.href}">${step.optionalLink.label}</a>`;
    } else if (linkSlot) linkSlot.hidden = true;

    clearSpotlight();
    const spotlightTarget = step.noSpotlight ? null : resolveTarget(step);
    const trackerTarget = resolveTrackerTarget(step) || spotlightTarget;
    if (spotlightTarget) positionSpotlight(spotlightTarget);
    global.requestAnimationFrame(() => {
      positionTrackerAndBubble(trackerTarget || spotlightTarget);
    });

    document.querySelector('.practice-frame')?.classList.toggle('practice-frame--highlight-key', step.id === 'highlight');
  }

  function go(delta) {
    if (advancing) return;
    advancing = true;
    stepIndex += delta;
    if (stepIndex >= steps().length) {
      finish(true);
      advancing = false;
      return;
    }
    if (stepIndex < 0) stepIndex = 0;
    renderStep().finally(() => { global.setTimeout(() => { advancing = false; }, 280); });
  }

  function showIntro() {
    tourRoot?.removeAttribute('hidden');
    tourRoot?.classList.remove('practice-tour--active');
    introEl?.removeAttribute('hidden');
    coachEl?.setAttribute('hidden', '');
    bubbleEl?.setAttribute('hidden', '');
    spotlightEl?.classList.remove('practice-tour__spotlight--on');
  }

  function beginTour() {
    tourActive = true;
    document.documentElement.classList.add('gst-practice-tour-active');
    introEl?.setAttribute('hidden', '');
    tourRoot?.classList.add('practice-tour--active');
    coachEl?.removeAttribute('hidden');
    bubbleEl?.removeAttribute('hidden');
    stepIndex = 0;
    leavingStep = null;
    document.getElementById('practice-tour-replay')?.setAttribute('hidden', '');
    renderStep();
  }

  function finish(save = false) {
    clearWatchers();
    clearSpotlight();
    tourActive = false;
    document.documentElement.classList.remove('gst-practice-tour-active');
    tourRoot?.classList.remove('practice-tour--no-dim', 'practice-tour--no-spotlight');
    tourRoot?.classList.remove('practice-tour--active');
    tourRoot?.setAttribute('hidden', '');
    document.getElementById('practice-hints-lab')?.setAttribute('hidden', '');
    if (save) {
      try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch { /**/ }
      setHintsMode(savedHintsMode || 'smart');
    }
    document.getElementById('practice-tour-replay')?.removeAttribute('hidden');
  }

  function initHintsLab() {
    const lab = document.getElementById('practice-hints-lab');
    if (!lab || lab.dataset.bound === '1') return;
    lab.dataset.bound = '1';
    lab.querySelectorAll('[data-hints-mode]').forEach((btn) => {
      btn.addEventListener('click', async () => { await setHintsMode(btn.dataset.hintsMode); });
    });
    document.addEventListener('veil-practice-hints-changed', (e) => {
      updateHintsLab(e.detail?.mode || 'smart');
    });
  }

  function ensureBackButton() {
    const actions = bubbleEl?.querySelector('.practice-tour__bubble-actions');
    if (!actions || actions.querySelector('[data-tour-back]')) return;
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'practice-tour__btn practice-tour__btn--ghost';
    back.dataset.tourBack = '';
    back.textContent = 'Back';
    back.addEventListener('click', () => go(-1));
    actions.insertBefore(back, actions.firstChild);
  }

  function buildUi() {
    if (document.getElementById('practice-tour')) {
      tourRoot = document.getElementById('practice-tour');
      spotlightEl = tourRoot.querySelector('.practice-tour__spotlight');
      coachEl = tourRoot.querySelector('.practice-tour__coach');
      bubbleEl = tourRoot.querySelector('.practice-tour__strip');
      introEl = tourRoot.querySelector('.practice-tour__intro');
      ensureBackButton();
      return;
    }

    tourRoot = document.createElement('div');
    tourRoot.id = 'practice-tour';
    tourRoot.className = 'practice-tour';
    tourRoot.setAttribute('hidden', '');
    tourRoot.innerHTML = `
      <div class="practice-tour__spotlight" aria-hidden="true"></div>
      <div class="practice-tour__intro" role="dialog" aria-labelledby="practice-intro-title">
        <div class="practice-tour__intro-card">
          <div class="practice-tour__intro-v" aria-hidden="true">V</div>
          <h2 id="practice-intro-title">Guided practice</h2>
          <p>Try highlight → Quick → unlock in a fake mail compose. Nothing is sent.</p>
          <div class="practice-tour__intro-actions">
            <button type="button" class="practice-tour__btn practice-tour__btn--primary" data-intro-begin>Begin tour</button>
            <button type="button" class="practice-tour__btn practice-tour__btn--ghost" data-intro-skip>Skip</button>
          </div>
        </div>
      </div>
      <div class="practice-tour__coach" hidden aria-live="polite">
        <div class="practice-tour__coach-v" aria-hidden="true">
          <span class="practice-tour__tracker-v">V</span>
          <span class="practice-tour__tracker-pulse"></span>
        </div>
        <div class="practice-tour__strip" hidden role="status">
          <p class="practice-tour__bubble-step">1 / 1</p>
          <h3 class="practice-tour__bubble-title"></h3>
          <p class="practice-tour__bubble-body"></p>
          <p class="practice-tour__bubble-why" hidden></p>
          <p class="practice-tour__bubble-celebrate" hidden></p>
          <p class="practice-tour__bubble-wait" hidden></p>
          <p class="practice-tour__bubble-link hint" hidden></p>
          <div class="practice-tour__bubble-actions">
            <button type="button" class="practice-tour__btn practice-tour__btn--ghost" data-tour-back hidden>Back</button>
            <button type="button" class="practice-tour__btn practice-tour__btn--ghost" data-tour-skip>Skip</button>
            <button type="button" class="practice-tour__btn practice-tour__btn--sample" hidden></button>
            <button type="button" class="practice-tour__btn practice-tour__btn--primary" data-tour-next>Next</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(tourRoot);

    spotlightEl = tourRoot.querySelector('.practice-tour__spotlight');
    coachEl = tourRoot.querySelector('.practice-tour__coach');
    bubbleEl = tourRoot.querySelector('.practice-tour__strip');
    introEl = tourRoot.querySelector('.practice-tour__intro');

    tourRoot.querySelector('[data-intro-begin]')?.addEventListener('click', beginTour);
    tourRoot.querySelector('[data-intro-skip]')?.addEventListener('click', () => finish(true));
    tourRoot.querySelector('[data-tour-back]')?.addEventListener('click', () => go(-1));
    tourRoot.querySelector('[data-tour-skip]')?.addEventListener('click', () => finish(true));
    tourRoot.querySelector('[data-tour-next]')?.addEventListener('click', () => go(1));

    document.addEventListener('veil-practice-secured', (event) => {
      tourContext.lastSecureMode = event.detail?.mode || tourContext.lastSecureMode;
    });

    initHintsLab();

    document.addEventListener('selectionchange', () => {
      const step = steps()[stepIndex];
      if (tourActive && step?.id === 'highlight' && (hasKeySelected() || pillVisible())) go(1);
    });

    global.addEventListener('resize', () => {
      if (!tourActive) return;
      const step = steps()[stepIndex];
      positionTrackerAndBubble(resolveTrackerTarget(step) || resolveTarget(step));
    });
  }

  function start({ force = false } = {}) {
    buildUi();
    ensurePlainPhraseVisible();
    if (!force) {
      try {
        if (localStorage.getItem(STORAGE_KEY)) {
          document.getElementById('practice-tour-replay')?.removeAttribute('hidden');
          return;
        }
      } catch { /**/ }
    }
    showIntro();
  }

  function replay() { start({ force: true }); }

  global.GoldspirePracticeTour = { start, replay, beginTour, STORAGE_KEY };

  document.addEventListener('veil-practice-start-tour', (event) => {
    start({ force: event.detail?.force === true });
  });

  const params = new URLSearchParams(global.location?.search || '');
  if (params.get('tour') === '1') {
    const boot = () => start({ force: true });
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => global.setTimeout(boot, 300), { once: true });
    } else {
      global.setTimeout(boot, 300);
    }
  }
})(window);
