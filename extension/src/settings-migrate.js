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

    return next;
  }

  global.GoldspireSettingsMigrate = { migrateSettings };
})(typeof globalThis !== 'undefined' ? globalThis : self);
