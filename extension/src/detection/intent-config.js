/**
 * Veil detection product rules — single source of truth (locked at ship time).
 *
 * This file is explicit regex/heuristic configuration. It is NOT learned, NOT
 * org-configurable, and NOT hidden behind a "context engine" facade.
 *
 * - Org admins configure warn/block only (policy packs / DLP JSON).
 * - Detection patterns and field-label rules live here and in lib-bundle.js.
 * - field-semantics.js and gating.js READ this file; they do not define rules.
 *
 * Deployment hosts (portal, API) come from GoldspireConstants via intent.js.
 */
(function (global) {
  global.GoldspireIntentConfig = {
    mailHostPattern:
      '(mail\\.google|googlemail|outlook\\.(live|office)|office365|hotmail|yahoo|proton\\.me|protonmail|zoho|icloud)',
    composePathPattern: '\\/(mail|compose|new|draft|inbox\\/new|_compose)',
    formPathPattern:
      '\\/(signup|sign-up|register|registration|join|checkout|onboarding|profile|account|apply|enrol|enroll|patient|intake|application|form-template|form-templates|\\/form|lead|contact-us|request-demo)',
    formHostPattern:
      '(jotform\\.com|typeform\\.com|surveymonkey\\.com|wufoo\\.com|formstack\\.com|tally\\.so|paperform\\.co|cognitoforms\\.com)',
    adminPathPattern:
      '\\/(admin|dashboard|partner|devconsole|listing|submit|settings|manage|console|portal|backoffice)',
    partnerAdminHostPattern:
      '(partner\\.microsoft\\.com|chrome\\.google\\.com\\/webstore|microsoftedge\\.microsoft\\.com|admin\\.google\\.com|dashboard\\.stripe\\.com|app\\.hubspot\\.com|\\.salesforce\\.com|\\.force\\.com|\\.zendesk\\.com|\\.service-now\\.com|\\.workday\\.com|\\.bamboohr\\.com|\\.rippling\\.com|\\.gusto\\.com|\\.freshdesk\\.com|\\.intercom\\.com|\\.monday\\.com|\\.asana\\.com|\\.notion\\.so|airtable\\.com|\\.xero\\.com|quickbooks\\.intuit\\.com|\\.plaid\\.com|\\.okta\\.com|\\.auth0\\.com|\\.datadoghq\\.com|\\.snowflake\\.com|\\.atlassian\\.net)',
    piiAutocomplete: [
      'bday', 'bday-day', 'bday-month', 'bday-year',
      'email', 'tel', 'given-name', 'family-name', 'name',
      'street-address', 'postal-code', 'country', 'organization',
      'cc-name', 'cc-number', 'cc-exp', 'cc-csc',
    ],
    piiLabelPattern:
      '\\b(date of birth|d\\.?o\\.?b\\.?|birth\\s*date|email|e-mail|phone|mobile|first name|last name|full name|student name|address|postcode|zip code|national insurance|ssn|social security|pps|personal public service|student id|bsn|burgerservicenummer|cpf|curp|hkid|ird|personnummer|fødselsnummer|fodselsnummer|cpr|my number|マイナンバー|rrn|주민등록|steuer-id|nino|aadhaar|nric|sin|tfn|medicare|itin)\\b',

    /** Structural disambiguation (value shape, not field label). */
    disambiguation: {
      ibanCountryLead: '^[A-Z]{2}\\d{2}',
      irishPpsShape: '^\\d{7}[A-W]',
      typedLowercaseWord: '^[a-z]+$',
      highConfidenceBypass: {
        api_key: 90,
        jwt: 85,
        credit_card: 85,
        private_key: 90,
      },
    },

    /**
     * Copilot gating — which categories can interrupt the user (product-locked).
     * Org DLP only changes enforcement after a hit is accepted for prompt.
     */
    gating: {
      secretCategories: ['api_key', 'jwt', 'password', 'credit_card', 'private_key'],
      financialCategories: ['iban', 'routing_number', 'swift_bic', 'bank_account', 'tax_id'],
      piiCategories: [
        'email', 'phone', 'date_of_birth', 'ssn', 'nhs_number',
        'national_id', 'passport', 'driver_license', 'medical_record_number',
        'customer_id', 'internal_company_reference', 'pii',
      ],
      minConfidence: {
        paste: { form_data_entry: 55, admin_portal: 60, default: 50 },
        type: {
          compose_outbound: 55,
          form_data_entry: 75,
          admin_portal: 70,
          default: 65,
        },
        default: 50,
      },
      formTypingLowConfidenceSuppress: {
        api_key: 88,
        swift_bic: 88,
        private_key: 95,
      },
    },

    /**
     * Field label / autocomplete → suppress or prefer detector categories.
     * Edit HERE only — field-semantics.js compiles these strings to RegExp.
     */
    fieldSemantics: [
      {
        id: 'person_name',
        labelPatterns: [
          '\\b(first|last|full|given|family|sur|middle|maiden|student)\\s*name\\b',
        ],
        autocomplete: ['name', 'given-name', 'family-name', 'nickname', 'additional-name'],
        suppressCategories: [
          'api_key', 'jwt', 'swift_bic', 'iban', 'credit_card', 'routing_number',
          'phone', 'email', 'customer_id', 'internal_company_reference', 'private_key',
        ],
        preferCategories: [],
      },
      {
        id: 'government_id',
        labelPatterns: [
          '\\b(pps|personal public service|national id|national insurance|nino|social security|ssn|tax id|student id|bsn|burgerservicenummer|cpf|curp|hkid|ird|personnummer|fødselsnummer|fodselsnummer|cpr|my number|rrn|steuer-id|aadhaar|nric|sin|tfn|itin|resident registration)\\b',
        ],
        autocomplete: ['off'],
        suppressCategories: ['iban', 'swift_bic', 'api_key', 'jwt', 'credit_card', 'private_key'],
        preferCategories: ['national_id', 'ssn', 'tax_id'],
      },
      {
        id: 'payment_account',
        labelPatterns: [
          '\\b(iban|bank account|account number|sort code|routing|swift|bic|payment reference)\\b',
        ],
        autocomplete: ['cc-number', 'cc-name'],
        suppressCategories: ['national_id', 'ssn'],
        preferCategories: ['iban', 'bank_account', 'routing_number', 'swift_bic', 'credit_card'],
      },
      {
        id: 'contact',
        labelPatterns: ['\\b(e-?mail|phone|mobile|tel)\\b'],
        autocomplete: ['email', 'tel'],
        suppressCategories: ['api_key', 'jwt', 'swift_bic', 'private_key'],
        preferCategories: ['email', 'phone'],
      },
      {
        id: 'secret_credential',
        labelPatterns: ['\\b(api key|token|secret|password|passphrase|credential|private key|connection string|webhook)\\b'],
        autocomplete: ['new-password', 'current-password'],
        suppressCategories: ['iban', 'national_id', 'phone', 'email'],
        preferCategories: ['api_key', 'jwt', 'password', 'private_key'],
      },
    ],
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
