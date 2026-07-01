/**
 * Normalize legacy settings keys for cross-version compatibility.
 */
(function (global) {
  function migrateSettings(settings = {}) {
    const next = { ...settings };

    if (next.passphraseIn1Password !== undefined && next.passphraseFromVault === undefined) {
      next.passphraseFromVault = next.passphraseIn1Password;
    }
    delete next.passphraseIn1Password;

    if (next.copilotEnabled !== undefined) {
      next.copilotEnabled = next.copilotEnabled === true || next.copilotEnabled === 'on';
    }
    if (next.dlpMode !== undefined) {
      const mode = String(next.dlpMode).toLowerCase();
      next.dlpMode = ['off', 'observe', 'enforce'].includes(mode) ? mode : 'off';
    }
    if (next.dlpPolicy != null && typeof next.dlpPolicy === 'object') {
      next.dlpPolicy = global.GoldspireDlpSchema?.normalizePolicy?.(next.dlpPolicy) || next.dlpPolicy;
    }
    if (next.learningTelemetry === undefined) {
      next.learningTelemetry = true;
    } else {
      next.learningTelemetry = next.learningTelemetry === true;
    }
    if (next.learningHints != null && !Array.isArray(next.learningHints)) {
      next.learningHints = [];
    }

    // Existing installs before 1.3.3: skip auto tour; new users get tour after setup.
    if (next.setupComplete === true && next.tourComplete === undefined) {
      next.tourComplete = true;
    }

    return next;
  }

  global.GoldspireSettingsMigrate = { migrateSettings };
})(typeof globalThis !== 'undefined' ? globalThis : self);
