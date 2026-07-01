/**
 * First-run popup tour — lightweight coachmarks inside the extension popup.
 */
(function (global) {
  const TOUR_KEY = 'tourComplete';
  let active = false;
  let stepIndex = 0;
  let overlay = null;
  let onSwitchTab = null;

  function stepsForProfile(profile) {
    const isOrg = profile === 'organization';
    const steps = [
      {
        tab: 'home',
        target: '#tab-home .card--hero',
        title: 'Secure from here',
        body: 'Highlight sensitive text on any page, then use Secure selection or the keyboard shortcut shown below.',
      },
      {
        tab: 'home',
        target: '#action-secure',
        title: 'One-click secure',
        body: isOrg
          ? 'Secure, Mask, or Tokenize — teammates click [redacted] or [veil:vt_…] to reveal.'
          : 'Replaces secrets with [redacted]. Recipients unlock with your passphrase or hosted link.',
      },
      {
        tab: 'settings',
        target: '#copilotEnabled',
        title: 'Veil copilot',
        body: 'On by default. Catches secrets on paste and in AI chat. Stays quiet on signup forms. Turn off if you prefer shortcuts only.',
      },
      {
        tab: 'settings',
        target: '#selectionUiMode',
        title: 'On-page hints',
        body: 'Smart shows the pill when Veil detects sensitive text. Off keeps your screen completely clear — copilot still works on paste.',
      },
      {
        tab: 'settings',
        target: '#plus-settings-panel',
        title: 'Veil Plus',
        body: 'Free covers everything. Plus adds 6 trusted contacts for direct unlock — extra slots or Team when you outgrow personal.',
        personalOnly: true,
      },
      {
        tab: 'help',
        target: '#help-context-card',
        title: 'Help matches your setup',
        body: 'Your setup explains how Veil behaves with your current settings — including why something might not appear.',
      },
    ];
    return isOrg ? steps.filter((s) => !s.personalOnly) : steps;
  }

  function removeOverlay() {
    overlay?.remove();
    overlay = null;
    document.querySelectorAll('.tour-highlight').forEach((el) => {
      el.classList.remove('tour-highlight');
    });
  }

  function markComplete(api) {
    api?.storage?.sync?.set?.({ [TOUR_KEY]: true });
  }

  function renderStep(steps) {
    removeOverlay();
    const step = steps[stepIndex];
    if (!step) return;

    onSwitchTab?.(step.tab);

    window.setTimeout(() => {
      const target = document.querySelector(step.target);
      if (!target) {
        stepIndex += 1;
        if (stepIndex < steps.length) renderStep(steps);
        else finishTour();
        return;
      }

      target.classList.add('tour-highlight');
      target.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });

      overlay = document.createElement('div');
      overlay.className = 'tour-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-label', 'Veil tour');
      overlay.innerHTML = `
        <div class="tour-card">
          <p class="tour-card__progress">Step ${stepIndex + 1} of ${steps.length}</p>
          <h2 class="tour-card__title">${escapeHtml(step.title)}</h2>
          <p class="tour-card__body">${escapeHtml(step.body)}</p>
          <div class="tour-card__actions">
            <button type="button" class="btn btn--ghost btn--sm" data-tour-skip>Skip tour</button>
            <button type="button" class="btn btn--sm" data-tour-next>${stepIndex + 1 >= steps.length ? 'Done' : 'Next'}</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      overlay.querySelector('[data-tour-skip]')?.addEventListener('click', () => finishTour(true));
      overlay.querySelector('[data-tour-next]')?.addEventListener('click', () => {
        stepIndex += 1;
        if (stepIndex >= steps.length) finishTour(true);
        else renderStep(steps);
      });
    }, step.tab ? 120 : 0);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function finishTour(marked = false) {
    active = false;
    removeOverlay();
    if (marked && global.chrome?.storage?.sync) {
      markComplete(global.chrome);
      global.chrome.storage.sync.get(
        { firstSecurePractice: false, securityProfile: 'personal' },
        (settings) => {
          if (global.chrome.runtime?.lastError) return;
          const portal = global.GoldspireConstants?.PORTAL_ORIGIN?.replace(/\/$/, '');
          if (!settings?.firstSecurePractice && settings?.securityProfile === 'personal' && portal) {
            global.chrome.storage.sync.set({ firstSecurePractice: true }, () => {
              global.chrome.tabs.create({ url: `${portal}/practice.html`, active: true }, (tab) => {
                if (!tab?.id) return;
                const tabId = tab.id;
                const tryStart = (attempts = 0) => {
                  global.chrome.tabs.sendMessage(tabId, { type: 'START_PAGE_TOUR', force: true }, () => {
                    if (global.chrome.runtime?.lastError && attempts < 10) {
                      window.setTimeout(() => tryStart(attempts + 1), 450);
                    }
                  });
                };
                window.setTimeout(() => tryStart(), 700);
              });
            });
            return;
          }
          global.chrome.tabs?.query?.({ active: true, currentWindow: true }, (tabs) => {
            if (global.chrome.runtime?.lastError) return;
            const tabId = tabs?.[0]?.id;
            if (!tabId) return;
            global.chrome.tabs.sendMessage(tabId, { type: 'START_PAGE_TOUR' }, () => {
              void global.chrome.runtime?.lastError;
            });
          });
        },
      );
    }
  }

  function shouldRun(settings = {}) {
    return settings.setupComplete === true && settings[TOUR_KEY] !== true;
  }

  function start(profile, { switchTab, api, force = false } = {}) {
    if (active) return;

    const run = () => {
      active = true;
      stepIndex = 0;
      onSwitchTab = switchTab;
      renderStep(stepsForProfile(profile));
    };

    if (force) {
      run();
      return;
    }

    api?.storage?.sync?.get?.({ [TOUR_KEY]: false, setupComplete: true }, (result) => {
      if (api.runtime?.lastError) return;
      if (!result?.setupComplete || result?.[TOUR_KEY] === true) return;
      run();
    });
  }

  function maybeStartAfterSetup(profile, deps = {}) {
    window.setTimeout(() => {
      deps.api?.storage?.sync?.get?.({ [TOUR_KEY]: false }, (result) => {
        if (deps.api?.runtime?.lastError) return;
        if (result?.[TOUR_KEY] === true) return;
        start(profile, deps);
      });
    }, 500);
  }

  global.GoldspirePopupTour = {
    TOUR_KEY,
    shouldRun,
    start,
    maybeStartAfterSetup,
    finishTour,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
