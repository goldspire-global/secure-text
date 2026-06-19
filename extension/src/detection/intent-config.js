/**
 * Universal intent heuristics (product rules — not deployment-specific).
 * Deployment hosts (portal, API) come from GoldspireConstants via intent.js.
 */
(function (global) {
  global.GoldspireIntentConfig = {
    mailHostPattern:
      '(mail\\.google|googlemail|outlook\\.(live|office)|office365|hotmail|yahoo|proton\\.me|protonmail|zoho)',
    composePathPattern: '\\/(mail|compose|new|draft|inbox\\/new|_compose)',
    formPathPattern:
      '\\/(signup|sign-up|register|registration|join|checkout|onboarding|profile|account|apply|enrol|enroll|patient|intake|application)',
    adminPathPattern: '\\/(admin|dashboard|partner|devconsole|listing|submit|settings|manage)',
    partnerAdminHostPattern:
      '(partner\\.microsoft\\.com|chrome\\.google\\.com\\/webstore|microsoftedge\\.microsoft\\.com)',
    piiAutocomplete: [
      'bday', 'bday-day', 'bday-month', 'bday-year',
      'email', 'tel', 'given-name', 'family-name', 'name',
      'street-address', 'postal-code', 'country', 'organization',
      'cc-name', 'cc-number', 'cc-exp', 'cc-csc',
    ],
    piiLabelPattern:
      '\\b(date of birth|d\\.?o\\.?b\\.?|birth\\s*date|email|e-mail|phone|mobile|first name|last name|full name|address|postcode|zip code|national insurance|ssn|social security)\\b',
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
