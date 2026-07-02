/**
 * First-run popup tour — V coach strip points at targets; hands off to practice page.
 */
(function (global) {
  const TOUR_KEY = 'tourComplete';
  let active = false;
  let stepIndex = 0;
  let coachEl = null;
  let onSwitchTab = null;

  function stepsForProfile(profile) {
    const isOrg = profile === 'organization';
    return [
      {
        tab: 'home',
        target: '#tab-home .card--hero',
        title: 'Welcome to Veil',
        body: isOrg
          ? 'Highlight sensitive text, then Quick secure or use the keyboard shortcut.'
          : 'Encrypt secrets in your browser before mail servers or AI tools see plaintext.',
      },
      {
        tab: 'settings',
        target: '#copilotEnabled',
        title: 'Veil copilot',
        body: 'Catches secrets on paste and typing. Stays quiet on signup forms.',
      },
      {
        tab: 'settings',
        target: '#selectionUiMode',
        title: 'On-page hints',
        body: 'Smart · Always · Off — controls when the Quick/Options pill appears.',
      },
      {
        tab: 'home',
        target: '#open-practice-page',
        title: 'Try practice next',
        body: isOrg
          ? 'Fake Outlook compose — same flow your team uses. Nothing is sent.'
          : 'Fake Outlook compose — highlight, secure, unlock, copilot. Nothing is sent.',
        practiceStep: true,
        prime: () => {
          const card = document.getElementById('first-secure-card');
          if (card) card.hidden = false;
        },
      },
    ];
  }

  function removeCoach() {
    coachEl?.remove();
    coachEl = null;
    document.querySelectorAll('.tour-highlight').forEach((el) => {
      el.classList.remove('tour-highlight');
    });
  }

  function markComplete(api) {
    api?.storage?.sync?.set?.({ [TOUR_KEY]: true });
  }

  function portalOrigin() {
    return global.GoldspireConstants?.PORTAL_ORIGIN?.replace(/\/$/, '') || '';
  }

  function openPracticeFromTour(api) {
    const portal = portalOrigin();
    if (!portal || !api?.tabs?.create) {
      finishTour(true, { api });
      return;
    }
    markComplete(api);
    api.storage.sync.set({ firstSecurePractice: true, practiceTourPending: true }, () => {
      api.tabs.create({ url: `${portal}/practice?tour=1`, active: true }, () => {
        finishTour(false);
        try {
          global.close?.();
        } catch {
          // Popup may already be closing.
        }
      });
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderCoach(steps, step) {
    removeCoach();
    const isPracticeStep = step.practiceStep === true;
    coachEl = document.createElement('div');
    coachEl.className = 'tour-coach';
    coachEl.setAttribute('role', 'dialog');
    coachEl.setAttribute('aria-label', 'Veil tour');
    coachEl.innerHTML = `
      <div class="tour-coach__v" aria-hidden="true"><span>V</span></div>
      <div class="tour-coach__strip">
        <p class="tour-coach__progress">${stepIndex + 1} / ${steps.length} · ${escapeHtml(step.title)}</p>
        <p class="tour-coach__body">${escapeHtml(step.body)}</p>
        <div class="tour-coach__actions">
          <button type="button" class="btn btn--ghost btn--sm" data-tour-skip>Skip</button>
          <button type="button" class="btn btn--sm" data-tour-next>${isPracticeStep ? 'Open practice' : (stepIndex + 1 >= steps.length ? 'Done' : 'Next')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(coachEl);

    coachEl.querySelector('[data-tour-skip]')?.addEventListener('click', () => {
      finishTour(true, { api: global.chrome });
    });
    coachEl.querySelector('[data-tour-next]')?.addEventListener('click', () => {
      if (isPracticeStep) {
        openPracticeFromTour(global.chrome);
        return;
      }
      stepIndex += 1;
      if (stepIndex >= steps.length) finishTour(true, { api: global.chrome });
      else renderStep(steps);
    });
  }

  function renderStep(steps) {
    const step = steps[stepIndex];
    if (!step) return;

    step.prime?.();
    onSwitchTab?.(step.tab);

    window.setTimeout(() => {
      const target = document.querySelector(step.target);
      if (!target) {
        stepIndex += 1;
        if (stepIndex < steps.length) renderStep(steps);
        else finishTour(true, { api: global.chrome });
        return;
      }

      target.classList.add('tour-highlight');
      target.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      renderCoach(steps, step);

      if (step.practiceStep) {
        document.getElementById('open-practice-page')?.addEventListener('click', () => {
          openPracticeFromTour(global.chrome);
        }, { once: true });
      }
    }, step.tab ? 120 : 0);
  }

  function finishTour(marked = false, { api = global.chrome } = {}) {
    active = false;
    removeCoach();
    if (marked) markComplete(api);
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
      deps.api?.storage?.sync?.get?.({ [TOUR_KEY]: false, setupComplete: true }, (result) => {
        if (deps.api?.runtime?.lastError) return;
        if (!result?.setupComplete || result?.[TOUR_KEY] === true) return;
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
    openPracticeFromTour,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
