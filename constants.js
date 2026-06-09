/**
 * Built-in defaults shipped with the extension (no user setup required).
 */
(function (global) {
  global.GoldspireConstants = {
    /** Gmail/Outlook persist https links in sent mail; extension users unlock via in-page modal. */
    BUILT_IN_PUBLIC_UNLOCK_URL: 'https://goldspire-global.github.io/secure-text/unlock.html',
    /** Suggested shared vault item name for IT docs / 1Password autofill. */
    ONEPASSWORD_TEAM_ITEM_TITLE: 'Goldspire Team Passphrase',
    ONEPASSWORD_PARTNERSHIPS_EMAIL: 'support+partnerships@1password.com',
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
