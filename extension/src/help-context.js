/**
 * Settings-aware help copy for the popup Help tab and Settings hints.
 */
(function (global) {
  function build(settings = {}, ctx = {}) {
    const {
      snoozedHosts = [],
      activeHost = '',
      passphraseReady = true,
      managedState = {},
    } = ctx;

    const copy = global.GoldspireCopy || {};
    const isOrg = copy.isOrgProfile?.(settings) || settings.securityProfile === 'organization';
    const profileLabel = isOrg ? 'Team' : 'Personal';
    const selectionMode = settings.selectionUiMode || 'smart';
    const copilotOn = settings.copilotEnabled === true;
    const dlpMode = String(settings.dlpMode || 'off').toLowerCase();
    const defaultMode = settings.defaultSecureMode === 'one-time' ? 'one-time' : 'team';
    const oneClick = settings.useSavedPassphrase !== false;
    const secureShortcut = copy.shortcut?.('options') || 'Ctrl+Shift+O';
    const quickShortcut = copy.shortcut?.('secure') || 'Ctrl+Shift+S';

    const hintsLabel = {
      smart: 'Smart hints',
      always: 'Always show hints',
      quiet: 'Hints off (shortcuts only)',
    }[selectionMode] || 'Smart hints';

    const summaryParts = [
      profileLabel,
      hintsLabel,
      copilotOn ? 'Copilot on' : 'Copilot off',
    ];
    if (isOrg && dlpMode !== 'off') summaryParts.push(`DLP ${dlpMode}`);
    summaryParts.push(
      defaultMode === 'one-time'
        ? 'One-time default'
        : (copy.secureModeLabel?.(settings, 'team') || (isOrg ? 'Team passphrase' : 'My passphrase')),
    );

    const behaviors = [];

    if (selectionMode === 'smart') {
      behaviors.push({
        title: 'On-page hints (Smart)',
        body: `The gold Quick and blue Options pill appears when Veil detects sensitive-looking text (API keys, cards, passwords) in email compose. Highlighting ordinary words like "secret" alone will not show the pill — use ${secureShortcut} or set hints to Always in Settings.`,
      });
    } else if (selectionMode === 'always') {
      behaviors.push({
        title: 'On-page hints (Always)',
        body: 'The Quick/Options pill appears for any non-empty highlight in compose areas. In Outlook and Gmail the pill sits on the right edge of the window.',
      });
    } else {
      behaviors.push({
        title: 'On-page hints (Off)',
        body: 'No on-page pill. Use Secure selection from the Home tab, right-click Veil, or keyboard shortcuts.',
      });
    }

    if (copilotOn) {
      behaviors.push({
        title: 'Copilot',
        body: 'Veil prompts when you paste or type secrets in email and chat. It stays quiet on signup forms and plain text fields by design.',
      });
    } else if (dlpMode !== 'enforce') {
      behaviors.push({
        title: 'Copilot off',
        body: 'No paste or type prompts. You can still secure highlights with shortcuts, the Home tab, or right-click Veil.',
      });
    }

    if (isOrg && dlpMode === 'enforce') {
      behaviors.push({
        title: 'DLP enforce',
        body: 'Your org policy may block or mask sensitive data before you send, even when copilot is off.',
      });
    } else if (isOrg && dlpMode === 'observe') {
      behaviors.push({
        title: 'DLP observe',
        body: 'Sensitive pastes are logged locally for your team. Copilot prompts still appear when copilot is on.',
      });
    }

    if (defaultMode === 'one-time') {
      behaviors.push({
        title: 'Default: one-time',
        body: 'Quick secure generates a one-time unlock code. Share it with the recipient separately.',
      });
    } else if (oneClick && passphraseReady) {
      behaviors.push({
        title: 'One-click secure',
        body: `${quickShortcut} secures immediately with your saved ${isOrg ? 'team ' : ''}passphrase.`,
      });
    }

    behaviors.push({
      title: 'Outlook & Gmail',
      body: copy.refreshTabHint?.(settings)
        || 'Refresh the mail tab (F5) after changing settings. The pill anchors to the window edge, not inside the compose box.',
    });

    const troubleshooting = [];

    if (!copilotOn && dlpMode !== 'enforce') {
      troubleshooting.push({
        question: 'No copilot when I paste?',
        answer: 'Copilot is off in your settings. Turn it on under Settings, or secure with shortcuts.',
        action: 'settings-copilot',
      });
    }

    if (selectionMode === 'quiet') {
      troubleshooting.push({
        question: 'No Quick/Options pill on highlight?',
        answer: `On-page hints are set to Off. Turn on Smart or Always in Settings → More options, or press ${secureShortcut}.`,
        action: 'settings-hints',
      });
    } else if (selectionMode === 'smart') {
      troubleshooting.push({
        question: 'I highlighted text but no pill?',
        answer: `Smart mode only shows the pill for detector-shaped secrets in compose. Try an API-key-shaped string, set hints to Always, or press ${secureShortcut} for options.`,
        action: 'settings-hints',
      });
    }

    const hostSnoozed = activeHost && snoozedHosts.some(
      (host) => host === activeHost || activeHost.endsWith(`.${host}`),
    );
    if (hostSnoozed) {
      troubleshooting.push({
        question: `Hints hidden on ${activeHost}?`,
        answer: 'You chose to hide Veil hints on this site. Remove it under Settings → Sites where hints are hidden, or use shortcuts.',
        action: 'settings-snooze',
      });
    } else if (snoozedHosts.length > 0) {
      troubleshooting.push({
        question: 'Hints hidden on some sites?',
        answer: `Veil will not show the pill on: ${snoozedHosts.join(', ')}. Clear them in Settings if you want hints back.`,
        action: 'settings-snooze',
      });
    }

    if (!passphraseReady && defaultMode === 'team') {
      troubleshooting.push({
        question: "Quick secure doesn't work?",
        answer: copy.passphraseMissingError?.(settings) || 'Save a passphrase in Settings first.',
        action: 'settings-passphrase',
      });
    }

    if (managedState.skipOnboarding || managedState.hasTeamPassphrase) {
      troubleshooting.push({
        question: 'Some settings are locked?',
        answer: 'Your organization manages Veil through browser policy. Contact IT to change copilot, DLP, or passphrase defaults.',
      });
    }

    const settingsHints = {
      copilot: copilotOn
        ? 'On — paste/type prompts in email and chat. See Help → Your setup for details.'
        : 'Off — no paste prompts. Shortcuts and the Home tab still work.',
      hints: selectionMode === 'smart'
        ? 'Smart — pill only for sensitive-shaped highlights. See Help if you expected a pill.'
        : selectionMode === 'always'
          ? 'Always — pill on any compose highlight.'
          : 'Off — use shortcuts or the Home tab only.',
    };

    return {
      summary: summaryParts.join(' · '),
      behaviors,
      troubleshooting,
      settingsHints,
      refreshHint: copy.refreshTabHint?.(settings) || '',
    };
  }

  global.GoldspireHelpContext = { build };
})(typeof globalThis !== 'undefined' ? globalThis : self);
