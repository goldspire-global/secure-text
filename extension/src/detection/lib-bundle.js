/**
 * Pure detection helpers (no DOM). Tested via Node vm in tests/detection/.
 */
(function (global) {
  const API_KEY_PREFIXES = [
    { prefix: 'sk-', label: 'OpenAI-style secret key' },
    { prefix: 'sk-ant-', label: 'Anthropic API key' },
    { prefix: 'sk_live_', label: 'Stripe secret key (live)' },
    { prefix: 'sk_test_', label: 'Stripe secret key (test)' },
    { prefix: 'rk_live_', label: 'Stripe restricted key (live)' },
    { prefix: 'rk_test_', label: 'Stripe restricted key (test)' },
    { prefix: 'pk_live_', label: 'Stripe publishable key (live)' },
    { prefix: 'pk_test_', label: 'Stripe publishable key (test)' },
    { prefix: 'whsec_', label: 'Stripe webhook signing secret' },
    { prefix: 'sk-proj-', label: 'OpenAI project key' },
    { prefix: 'ghp_', label: 'GitHub personal access token' },
    { prefix: 'gho_', label: 'GitHub OAuth token' },
    { prefix: 'ghu_', label: 'GitHub user-to-server token' },
    { prefix: 'ghs_', label: 'GitHub secret' },
    { prefix: 'ghr_', label: 'GitHub refresh token' },
    { prefix: 'github_pat_', label: 'GitHub fine-grained PAT' },
    { prefix: 'glpat-', label: 'GitLab personal access token' },
    { prefix: 'glptt-', label: 'GitLab pipeline trigger token' },
    { prefix: 'xoxb-', label: 'Slack bot token' },
    { prefix: 'xoxp-', label: 'Slack user token' },
    { prefix: 'xoxa-', label: 'Slack app token' },
    { prefix: 'xoxr-', label: 'Slack refresh token' },
    { prefix: 'xoxs-', label: 'Slack session token' },
    { prefix: 'xapp-', label: 'Twitter/X app token' },
    { prefix: 'AIza', label: 'Google API key' },
    { prefix: 'AKIA', label: 'AWS access key id' },
    { prefix: 'ASIA', label: 'AWS temporary access key id' },
    { prefix: 'ya29.', label: 'Google OAuth token' },
    { prefix: 'SG.', label: 'SendGrid API key' },
    { prefix: 'sbp_', label: 'Supabase service key' },
    { prefix: 'sbp_live_', label: 'Supabase live key' },
    { prefix: 'sb_publishable_', label: 'Supabase publishable key' },
    { prefix: 'pplx-', label: 'Perplexity API key' },
    { prefix: 'sq0atp-', label: 'Square access token' },
    { prefix: 'sq0csp-', label: 'Square OAuth secret' },
    { prefix: 'shpat_', label: 'Shopify access token' },
    { prefix: 'shpss_', label: 'Shopify shared secret' },
    { prefix: 'shpca_', label: 'Shopify custom app token' },
    { prefix: 'figd_', label: 'Figma personal access token' },
    { prefix: 'npm_', label: 'npm access token' },
    { prefix: 'keylive_', label: 'Pusher live key' },
    { prefix: 'keytest_', label: 'Pusher test key' },
    { prefix: 'sk_live', label: 'Clerk secret key' },
    { prefix: 'pk_live', label: 'Clerk publishable key' },
    { prefix: 'dop_v1_', label: 'DigitalOcean personal access token' },
    { prefix: 'linode_', label: 'Linode API token' },
    { prefix: 'hf_', label: 'Hugging Face token' },
    { prefix: 'r8_', label: 'Replicate API token' },
    { prefix: 'vapi-', label: 'Vapi API key' },
    { prefix: 'tvly-', label: 'Tavily API key' },
    { prefix: 'sess_', label: 'Stripe session secret' },
    { prefix: 'seti_', label: 'Stripe setup intent secret' },
    { prefix: 'pi_', label: 'Stripe payment intent secret' },
    { prefix: 'EAAG', label: 'Meta/Facebook access token' },
    { prefix: 'EAAJ', label: 'Meta/Facebook access token' },
  ];

  function redactPreview(value, { showLast = 4 } = {}) {
    const text = String(value || '');
    if (!text) return '';
    if (text.length <= showLast) return '*'.repeat(text.length);
    const maskLen = Math.max(4, text.length - showLast);
    return `${'*'.repeat(maskLen)}${text.slice(-showLast)}`;
  }

  function normalizeDigits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function luhnCheck(digits) {
    const normalized = normalizeDigits(digits);
    if (normalized.length < 13 || normalized.length > 19) return false;
    let sum = 0;
    let alternate = false;
    for (let i = normalized.length - 1; i >= 0; i -= 1) {
      let n = normalized.charCodeAt(i) - 48;
      if (n < 0 || n > 9) return false;
      if (alternate) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      alternate = !alternate;
    }
    return sum % 10 === 0;
  }

  function findCreditCards(text) {
    const input = String(text || '');
    if (!input) return [];
    const pattern = /\b(?:\d{4}(?:[ \-]?\d{4}){2}[ \-]?\d{1,4}|\d{13,19})\b/g;
    const results = [];
    let match;
    while ((match = pattern.exec(input)) !== null) {
      const raw = match[0];
      const digits = normalizeDigits(raw);
      if (digits.length < 13 || digits.length > 19) continue;
      if (!luhnCheck(digits)) continue;
      let confidence = 85;
      if (digits.length === 16) confidence += 8;
      if (/^4|^5[1-5]|^3[47]/.test(digits)) confidence += 5;
      results.push({
        category: 'credit_card',
        matchedText: redactPreview(digits, { showLast: 4 }),
        matchedTextRaw: raw,
        index: match.index,
        confidence: Math.min(98, confidence),
        severity: 'high',
        recommendation: 'Mask or encrypt before sharing.',
      });
    }
    return results;
  }

  function looksLikeJwtSegment(segment) {
    return /^[A-Za-z0-9_-]+$/.test(segment) && segment.length >= 8;
  }

  function findJwts(text) {
    const input = String(text || '');
    if (!input) return [];
    const pattern = /\b([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\b/g;
    const results = [];
    let match;
    while ((match = pattern.exec(input)) !== null) {
      const [raw, header, payload, signature] = match;
      if (!looksLikeJwtSegment(header) || !looksLikeJwtSegment(payload)) continue;
      if (!looksLikeJwtSegment(signature) || signature.length < 8) continue;

      let confidence = 80;
      if (header.startsWith('eyJ')) confidence += 12;
      if (payload.startsWith('eyJ')) confidence += 5;

      results.push({
        category: 'jwt',
        matchedText: redactPreview(raw, { showLast: 8 }),
        matchedTextRaw: raw,
        index: match.index,
        confidence: Math.min(98, confidence),
        severity: 'critical',
        recommendation: 'Do not share tokens in plain text.',
      });
    }
    return results;
  }

  function findApiKeys(text) {
    const input = String(text || '');
    if (!input) return [];
    const results = [];
    const seen = new Set();

    for (const { prefix, label } of API_KEY_PREFIXES) {
      const pattern = new RegExp(
        `\\b${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[A-Za-z0-9_\\-./+=]{4,}\\b`,
        'gi',
      );
      let match;
      while ((match = pattern.exec(input)) !== null) {
        const raw = match[0];
        const key = raw.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({
          category: 'api_key',
          matchedText: redactPreview(raw, { showLast: 4 }),
          matchedTextRaw: raw,
          index: match.index,
          confidence: 92,
          severity: 'critical',
          recommendation: `Remove or encrypt credentials (${label}).`,
        });
      }
    }

    const trimmed = input.trim();
    if (
      trimmed.length >= 10
      && trimmed.length <= 256
      && /^[A-Za-z0-9_\-./+]+$/.test(trimmed)
      && !/^\d+$/.test(trimmed)
      && !fieldLooksLikeIban(trimmed)
      && !shouldSkipGenericSecretGuess(trimmed)
      && !findJwts(trimmed).some((entry) => entry.matchedTextRaw === trimmed)
    ) {
      const key = `generic:${trimmed}`;
      if (!seen.has(key)) {
        let confidence = 55;
        if (trimmed.length >= 20) confidence += 10;
        if (/[A-Z]/.test(trimmed) && /[a-z]/.test(trimmed) && /\d/.test(trimmed)) confidence += 10;
        results.push({
          category: 'api_key',
          matchedText: redactPreview(trimmed, { showLast: 4 }),
          matchedTextRaw: trimmed,
          index: input.indexOf(trimmed),
          confidence: Math.min(75, confidence),
          severity: 'medium',
          recommendation: 'This may be a secret or API token — verify before sharing.',
        });
      }
    }

    return results;
  }

  function findPrivateKeys(text) {
    const input = String(text || '');
    if (!input) return [];
    const results = [];
    const seen = new Set();
    const patterns = [
      /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----[\s\S]{0,8000}?-----END (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g,
      /-----BEGIN PGP PRIVATE KEY BLOCK-----[\s\S]{0,8000}?-----END PGP PRIVATE KEY BLOCK-----/g,
    ];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(input)) !== null) {
        const raw = match[0];
        const key = raw.slice(0, 64);
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({
          category: 'private_key',
          matchedText: '-----BEGIN PRIVATE KEY----- …',
          matchedTextRaw: raw,
          index: match.index,
          confidence: 97,
          severity: 'critical',
          recommendation: 'Never share private keys in email or chat — rotate if exposed.',
        });
      }
    }
    return results;
  }

  function findConnectionStrings(text) {
    const input = String(text || '');
    if (!input) return [];
    const results = [];
    const seen = new Set();
    const patterns = [
      { re: /(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss|amqp|amqps):\/\/[^\s'"<>]{8,}/gi, label: 'Database/message broker URL' },
      { re: /DefaultEndpointsProtocol=https;AccountName=[^;\s'"<>]+;AccountKey=[^;\s'"<>]+/gi, label: 'Azure storage connection string' },
      { re: /Endpoint=sb:\/\/[^;\s'"<>]+;SharedAccessKey=[^;\s'"<>]+/gi, label: 'Azure Service Bus connection' },
      { re: /hooks\.slack\.com\/services\/[A-Za-z0-9/_-]{20,}/gi, label: 'Slack incoming webhook' },
      { re: /discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]{20,}/gi, label: 'Discord webhook' },
      { re: /\bAC[a-f0-9]{32}\b/gi, label: 'Twilio Account SID' },
      { re: /\bSK[a-f0-9]{32}\b/g, label: 'Twilio API key' },
    ];
    for (const { re, label } of patterns) {
      let match;
      while ((match = re.exec(input)) !== null) {
        const raw = match[0];
        const key = raw.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({
          category: 'api_key',
          matchedText: redactPreview(raw, { showLast: 4 }),
          matchedTextRaw: raw,
          index: match.index,
          confidence: 94,
          severity: 'critical',
          recommendation: `Remove or encrypt credentials (${label}).`,
          tags: ['connection_string'],
        });
      }
    }
    return results;
  }

  const EXAMPLE_EMAIL_DOMAINS = new Set(['example.com', 'example.org', 'test.com', 'localhost']);

  function findEmails(text, context = {}) {
    const input = String(text || '');
    if (!input) return [];
    const pattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
    const results = [];
    const seen = new Set();
    let match;
    while ((match = pattern.exec(input)) !== null) {
      const raw = match[0];
      const key = raw.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      const domain = key.slice(key.indexOf('@') + 1);
      if (EXAMPLE_EMAIL_DOMAINS.has(domain)) continue;

      let confidence = 78;
      if (context.fieldType === 'email' || context.isEmailField) confidence -= 50;
      if (confidence < 35) continue;

      const local = key.split('@')[0];
      results.push({
        category: 'email',
        matchedText: `${redactPreview(local, { showLast: 1 })}@${domain}`,
        matchedTextRaw: raw,
        index: match.index,
        confidence: Math.min(95, confidence),
        severity: 'medium',
        recommendation: 'Confirm this recipient should receive personal data.',
      });
    }
    return results;
  }

  function findPhones(text, context = {}) {
    const input = String(text || '');
    if (!input) return [];
    if (fieldLooksLikeIban(input)) return [];
    const results = [];
    const seen = new Set();

    function countryTagsFromRaw(raw) {
      const compact = String(raw || '').replace(/\s/g, '');
      if (compact.startsWith('+44')) return ['gb'];
      if (compact.startsWith('+61')) return ['au'];
      if (compact.startsWith('+353')) return ['ie'];
      if (compact.startsWith('+49')) return ['de'];
      if (compact.startsWith('+33')) return ['fr'];
      if (compact.startsWith('+34')) return ['es'];
      if (compact.startsWith('+39')) return ['it'];
      if (compact.startsWith('+31')) return ['nl'];
      if (compact.startsWith('+65')) return ['sg'];
      if (compact.startsWith('+91')) return ['in'];
      if (compact.startsWith('+81')) return ['jp'];
      if (compact.startsWith('+82')) return ['kr'];
      if (compact.startsWith('+1')) return ['us'];
      return [];
    }

    function pushPhone(raw, index, confidence, tags = []) {
      const digits = normalizeDigits(raw);
      if (digits.length < 8 || digits.length > 15) return;
      if (seen.has(digits)) return;
      seen.add(digits);
      let conf = confidence;
      if (context.fieldType === 'tel' || context.isPhoneField) conf -= 20;
      if (conf < 45) return;
      const mergedTags = [...new Set([...tags, ...countryTagsFromRaw(raw)])];
      results.push({
        category: 'phone',
        matchedText: redactPreview(digits, { showLast: 4 }),
        matchedTextRaw: raw,
        index,
        confidence: Math.min(94, conf),
        severity: 'medium',
        recommendation: 'Confirm this recipient should receive personal data.',
        tags: mergedTags,
      });
    }

    const labeledPatterns = [
      { re: /\b(?:mobile|cell|phone|tel|telephone|contact)[#:\s-]*(\+?\d[\d\s().+-]{7,18}\d)\b/gi, boost: 14 },
      { re: /(?:^|[\s(,;])(\+44[\s-]?(?:\(?0\)?\s*)?(?:\d[\s-]?){9,10})\b/g, boost: 12, tags: ['gb'] },
      { re: /(?:^|[\s(,;])(\+61[\s-]?(?:\(?0\)?\s*)?(?:\d[\s-]?){8,10})\b/g, boost: 12, tags: ['au'] },
      { re: /(?:^|[\s(,;])(\+353[\s-]?(?:\(?0\)?\s*)?(?:\d[\s-]?){7,10})\b/g, boost: 12, tags: ['ie'] },
      { re: /(?:^|[\s(,;])(\+49[\s-]?(?:\(?0\)?\s*)?(?:\d[\s-]?){8,12})\b/g, boost: 12, tags: ['de'] },
      { re: /(?:^|[\s(,;])(\+33[\s-]?(?:\(?0\)?\s*)?(?:\d[\s-]?){8,10})\b/g, boost: 12, tags: ['fr'] },
      { re: /(?:^|[\s(,;])(\+34[\s-]?(?:\(?0\)?\s*)?(?:\d[\s-]?){8,10})\b/g, boost: 12, tags: ['es'] },
      { re: /(?:^|[\s(,;])(\+39[\s-]?(?:\(?0\)?\s*)?(?:\d[\s-]?){8,11})\b/g, boost: 12, tags: ['it'] },
      { re: /(?:^|[\s(,;])(\+31[\s-]?(?:\(?0\)?\s*)?(?:\d[\s-]?){8,10})\b/g, boost: 12, tags: ['nl'] },
      { re: /(?:^|[\s(,;])(\+65[\s-]?(?:\d[\s-]?){8})\b/g, boost: 12, tags: ['sg'] },
      { re: /(?:^|[\s(,;])(\+91[\s-]?(?:\(?0\)?\s*)?(?:\d[\s-]?){8,10})\b/g, boost: 12, tags: ['in'] },
      { re: /(?:^|[\s(,;])(\+81[\s-]?(?:\(?0\)?\s*)?(?:\d[\s-]?){9,10})\b/g, boost: 12, tags: ['jp'] },
      { re: /(?:^|[\s(,;])(\+82[\s-]?(?:\(?0\)?\s*)?(?:\d[\s-]?){8,10})\b/g, boost: 12, tags: ['kr'] },
      { re: /(?:^|[\s(,;])(\+1[\s-]?(?:\(?\d{3}\)?[\s.-]?)?\d{3}[\s.-]?\d{4})\b/g, boost: 10, tags: ['us'] },
    ];

    for (const { re, boost, tags } of labeledPatterns) {
      let match;
      while ((match = re.exec(input)) !== null) {
        const raw = match[1] || match[0];
        const offset = match[0].indexOf(raw);
        pushPhone(raw, match.index + (offset >= 0 ? offset : 0), 72 + (boost || 0), tags || []);
      }
    }

    const genericPatterns = [
      /\b\+?\d{1,3}[-.\s]?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/g,
      /\b\(\d{3}\)\s*\d{3}[-.\s]?\d{4}\b/g,
      /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g,
    ];

    for (const pattern of genericPatterns) {
      let match;
      while ((match = pattern.exec(input)) !== null) {
        const raw = match[0];
        let confidence = 72;
        if (normalizeDigits(raw).length === 10 || normalizeDigits(raw).length === 11) confidence += 10;
        pushPhone(raw, match.index, confidence);
      }
    }
    return results;
  }

  function ibanMod97(iban) {
    const rearranged = `${String(iban).slice(4)}${String(iban).slice(0, 4)}`.toUpperCase();
    let remainder = '';
    for (const ch of rearranged) {
      const token = ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch;
      remainder += token;
      if (remainder.length > 9) {
        remainder = String(Number(remainder) % 97);
      }
    }
    return Number(remainder) % 97 === 1;
  }

  const IBAN_LENGTH_BY_COUNTRY = {
    AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22,
    BR: 29, BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22, DK: 18, DO: 28,
    EE: 20, ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23, GL: 18,
    GR: 27, GT: 28, HR: 21, HU: 28, IE: 22, IL: 23, IS: 26, IT: 27, JO: 30,
    KW: 30, KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27,
    MD: 24, ME: 22, MK: 19, MR: 27, MT: 31, MU: 30, NL: 18, NO: 15, PK: 24,
    PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22, SA: 24, SE: 24, SI: 19,
    SK: 24, SM: 27, TN: 24, TR: 26, UA: 29, VG: 24, XK: 20,
  };

  function isKnownIbanCountry(code) {
    return Object.prototype.hasOwnProperty.call(
      IBAN_LENGTH_BY_COUNTRY,
      String(code || '').toUpperCase(),
    );
  }

  function compactIbanToken(value) {
    return String(value || '').replace(/\s/g, '').toUpperCase();
  }

  function looksLikeIbanPrefix(value) {
    const compact = compactIbanToken(value);
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]*$/i.test(compact)) return false;
    if (compact.length < 4) return false;
    const country = compact.slice(0, 2).toUpperCase();
    if (!isKnownIbanCountry(country)) return false;
    const expected = IBAN_LENGTH_BY_COUNTRY[country];
    return compact.length <= Math.min(34, expected + 2);
  }

  function fieldLooksLikeIban(text) {
    const compact = compactIbanToken(text);
    if (compact.length < 4) return false;
    return looksLikeIbanPrefix(compact);
  }

  function suppressIbanConflicts(text, results) {
    if (!fieldLooksLikeIban(text)) return results;
    return (results || []).filter((hit) => hit.category !== 'api_key' && hit.category !== 'phone');
  }

  const VALID_BIC_COUNTRY = new Set([
    'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ',
    'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS', 'BT', 'BV', 'BW', 'BY', 'BZ',
    'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN', 'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ',
    'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ', 'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK', 'FM', 'FO', 'FR',
    'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY',
    'HK', 'HM', 'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT', 'JE', 'JM', 'JO', 'JP',
    'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY',
    'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ',
    'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY',
    'QA', 'RE', 'RO', 'RS', 'RU', 'RW', 'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ',
    'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ',
    'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI', 'VN', 'VU', 'WF', 'WS', 'YE', 'YT', 'ZA', 'ZM', 'ZW',
  ]);

  function looksLikeSwiftBic(value) {
    const compact = compactIbanToken(value).toUpperCase();
    if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(compact)) return false;
    return VALID_BIC_COUNTRY.has(compact.slice(4, 6));
  }

  function looksLikeUuid(value) {
    const compact = String(value || '').trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(compact);
  }

  function shouldSkipGenericSecretGuess(value) {
    const compact = compactIbanToken(value);
    return (
      looksLikeIbanPrefix(compact)
      || looksLikeSwiftBic(compact)
      || looksLikeUuid(compact)
      || /^[A-Z]{2}\d{6,}$/.test(compact)
    );
  }

  function findIbanPrefixes(text) {
    const input = String(text || '');
    if (!input) return [];
    const results = [];
    const seen = new Set();
    const pattern = /\b([A-Z]{2}\d{2}(?:[ \t]?[A-Z0-9]{1,4}){0,8})\b/gi;

    let match;
    while ((match = pattern.exec(input)) !== null) {
      const compact = compactIbanToken(match[1]);
      if (!looksLikeIbanPrefix(compact)) continue;
      const country = compact.slice(0, 2);
      const expectedLen = IBAN_LENGTH_BY_COUNTRY[country];
      if (compact.length >= expectedLen && ibanMod97(compact)) continue;

      if (seen.has(compact)) continue;
      seen.add(compact);

      const progress = compact.length / expectedLen;
      let confidence = 58 + Math.round(progress * 22);
      if (compact.length >= 8) confidence += 8;
      if (compact.length >= 12) confidence += 4;

      results.push({
        category: 'iban',
        matchedText: redactPreview(compact, { showLast: 4 }),
        matchedTextRaw: compact,
        index: match.index,
        confidence: Math.min(86, confidence),
        severity: 'high',
        recommendation: 'Mask or encrypt financial identifiers before sharing.',
      });
    }

    return results;
  }

  function findIbans(text) {
    const input = String(text || '');
    if (!input) return [];
    const results = [];
    const seen = new Set();

    function pushPrefixHits(source) {
      for (const prefixHit of findIbanPrefixes(source)) {
        const key = compactIbanToken(prefixHit.matchedTextRaw);
        if (seen.has(key)) continue;
        seen.add(key);
        results.push(prefixHit);
      }
    }

    if (fieldLooksLikeIban(input)) {
      pushPrefixHits(input);
      const compactOnly = compactIbanToken(input);
      if (compactOnly !== input) pushPrefixHits(compactOnly);
    }

    function countAlphanumWordsInCompactSpan(original, compactStart, compactLen) {
      const input = String(original || '');
      let compactIdx = 0;
      let spanStart = -1;
      let spanEnd = -1;
      for (let i = 0; i < input.length && compactIdx < compactStart + compactLen; i += 1) {
        const ch = input[i];
        if (!/[A-Za-z0-9]/.test(ch)) continue;
        if (compactIdx === compactStart) spanStart = i;
        compactIdx += 1;
        if (compactIdx === compactStart + compactLen) {
          spanEnd = i + 1;
          break;
        }
      }
      if (spanStart < 0 || spanEnd < 0) return 99;
      return input.slice(spanStart, spanEnd).split(/[^A-Za-z0-9]+/).filter(Boolean).length;
    }

    function tryPushCompact(compact, index) {
      const value = String(compact || '').toUpperCase();
      if (value.length < 15 || value.length > 34) return;
      if (!ibanMod97(value)) return;
      if (/\s/.test(input) && countAlphanumWordsInCompactSpan(input, index, value.length) > 6) return;
      if (seen.has(value)) return;
      seen.add(value);
      results.push({
        category: 'iban',
        matchedText: redactPreview(value, { showLast: 4 }),
        matchedTextRaw: value,
        index,
        confidence: 88,
        severity: 'high',
        recommendation: 'Mask or encrypt financial identifiers before sharing.',
      });
    }

    const compactInput = input.replace(/\s/g, '');
    const pattern = /[A-Z]{2}\d{2}[A-Z0-9]{11,30}/gi;
    let match;
    while ((match = pattern.exec(compactInput)) !== null) {
      const chunk = match[0].toUpperCase();
      for (let end = Math.min(34, chunk.length); end >= 15; end -= 1) {
        const candidate = chunk.slice(0, end);
        if (!ibanMod97(candidate)) continue;
        if (/\s/.test(input) && countAlphanumWordsInCompactSpan(input, match.index, candidate.length) > 6) continue;
        tryPushCompact(candidate, match.index);
        break;
      }
    }

    return results;
  }

  function findSsns(text) {
    const input = String(text || '');
    if (!input) return [];
    const pattern = /\b(?!000|666|9\d{2})\d{3}[-\s]?(?!00)\d{2}[-\s]?(?!0000)\d{4}\b/g;
    const results = [];
    let match;
    while ((match = pattern.exec(input)) !== null) {
      const raw = match[0];
      results.push({
        category: 'ssn',
        matchedText: redactPreview(normalizeDigits(raw), { showLast: 4 }),
        matchedTextRaw: raw,
        index: match.index,
        confidence: 82,
        severity: 'critical',
        recommendation: 'Do not share Social Security numbers in plain text.',
      });
    }
    return results;
  }

  function findBankAccounts(text) {
    const input = String(text || '');
    if (!input) return [];
    const pattern = /\b(?:account|acct|a\/c)[#:\s-]*(\d{6,17})\b/gi;
    const results = [];
    let match;
    while ((match = pattern.exec(input)) !== null) {
      const raw = match[1];
      results.push({
        category: 'bank_account',
        matchedText: redactPreview(raw, { showLast: 4 }),
        matchedTextRaw: raw,
        index: match.index + match[0].indexOf(raw),
        confidence: 75,
        severity: 'high',
        recommendation: 'Mask or encrypt bank account details before sharing.',
      });
    }
    return results;
  }

  function routingNumberCheck(digits) {
    const normalized = normalizeDigits(digits);
    if (!/^\d{9}$/.test(normalized)) return false;
    const weights = [3, 7, 1, 3, 7, 1, 3, 7, 1];
    let sum = 0;
    for (let i = 0; i < 9; i += 1) sum += Number(normalized[i]) * weights[i];
    return sum % 10 === 0;
  }

  function findRoutingNumbers(text) {
    const input = String(text || '');
    if (!input) return [];
    const results = [];
    const seen = new Set();
    const patterns = [
      /\b(?:routing|ABA|RTN|sort code)[#:\s-]*(\d{3})[\s-]?(\d{3})[\s-]?(\d{3})\b/gi,
      /\b(?:routing|ABA|RTN|sort code)[#:\s-]*(\d{9})\b/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(input)) !== null) {
        const raw = match[3] ? `${match[1]}${match[2]}${match[3]}` : match[1];
        if (!routingNumberCheck(raw)) continue;
        const key = raw;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({
          category: 'routing_number',
          matchedText: redactPreview(raw, { showLast: 3 }),
          matchedTextRaw: match[0].trim(),
          index: match.index,
          confidence: 84,
          severity: 'high',
          recommendation: 'Mask or encrypt bank routing details before sharing.',
        });
      }
    }
    return results;
  }

  function findSwiftBics(text) {
    const input = String(text || '');
    if (!input) return [];
    const results = [];
    const seen = new Set();
    const pattern = /\b([A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)\b/gi;

    let match;
    while ((match = pattern.exec(input)) !== null) {
      const raw = match[1];
      const original = match[0];
      const upper = raw.toUpperCase();
      if (!looksLikeSwiftBic(upper)) continue;
      if (original === original.toLowerCase() && !/\d/.test(original)) continue;
      if (seen.has(upper)) continue;
      seen.add(upper);
      results.push({
        category: 'swift_bic',
        matchedText: redactPreview(upper, { showLast: 3 }),
        matchedTextRaw: upper,
        index: match.index,
        confidence: 86,
        severity: 'high',
        recommendation: 'Mask or encrypt SWIFT/BIC codes before sharing.',
      });
    }
    return results;
  }

  function findTaxIds(text) {
    const input = String(text || '');
    if (!input) return [];
    const results = [];
    const seen = new Set();

    const labeled = /\b(?:EIN|TIN|VAT|GST|tax(?:\s+ID)?)[#:\s-]*([A-Z0-9][A-Z0-9\s./-]{6,18}[A-Z0-9])\b/gi;
    let match;
    while ((match = labeled.exec(input)) !== null) {
      const raw = match[1].trim();
      const key = raw.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        category: 'tax_id',
        matchedText: redactPreview(raw.replace(/\s/g, ''), { showLast: 3 }),
        matchedTextRaw: raw,
        index: match.index + match[0].indexOf(raw),
        confidence: 82,
        severity: 'high',
        recommendation: 'Mask or encrypt tax identifiers before sharing.',
      });
    }

    const einPattern = /\b\d{2}-\d{7}\b/g;
    while ((match = einPattern.exec(input)) !== null) {
      const raw = match[0];
      const key = `ein:${raw}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        category: 'tax_id',
        matchedText: redactPreview(raw, { showLast: 4 }),
        matchedTextRaw: raw,
        index: match.index,
        confidence: 78,
        severity: 'high',
        recommendation: 'This may be a US EIN — verify before sharing.',
      });
    }

    const vatPattern = /\b(?:ATU\d{8}|DE\d{9}|FR[A-Z0-9]{2}\d{9}|GB(?:\d{9}|\d{12})|IE\d[A-Z0-9]{7}|NL\d{9}B\d{2})\b/gi;
    while ((match = vatPattern.exec(input)) !== null) {
      const raw = match[0].toUpperCase();
      const key = `vat:${raw}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        category: 'tax_id',
        matchedText: redactPreview(raw, { showLast: 3 }),
        matchedTextRaw: raw,
        index: match.index,
        confidence: 85,
        severity: 'high',
        recommendation: 'Mask or encrypt VAT/tax numbers before sharing.',
      });
    }

    return results;
  }

  function nhsCheck(digits) {
    const normalized = normalizeDigits(digits);
    if (!/^\d{10}$/.test(normalized)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i += 1) sum += Number(normalized[i]) * (10 - i);
    const remainder = sum % 11;
    const check = remainder === 0 ? 0 : 11 - remainder;
    if (check === 11) return false;
    return Number(normalized[9]) === check;
  }

  function findNhsNumbers(text) {
    const input = String(text || '');
    if (!input) return [];
    const results = [];
    const seen = new Set();
    const pattern = /\b(?:NHS(?:\s+number)?)[#:\s-]*(\d{3}[\s-]?\d{3}[\s-]?\d{4})\b/gi;

    let match;
    while ((match = pattern.exec(input)) !== null) {
      const raw = match[1];
      if (!nhsCheck(raw)) continue;
      const key = normalizeDigits(raw);
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        category: 'nhs_number',
        matchedText: redactPreview(key, { showLast: 3 }),
        matchedTextRaw: raw,
        index: match.index + match[0].indexOf(raw),
        confidence: 86,
        severity: 'critical',
        recommendation: 'UK NHS numbers are personal health data — do not share in plain text.',
      });
    }
    return results;
  }

  function findDatesOfBirth(text) {
    const input = String(text || '');
    if (!input) return [];
    const results = [];
    const seen = new Set();
    const pattern = /\b(?:DOB|D\.O\.B\.|date of birth|born on|birth\s*date)[#:\s-]*(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}[/.-]\d{1,2}[/.-]\d{1,2})\b/gi;

    let match;
    while ((match = pattern.exec(input)) !== null) {
      const raw = match[1];
      const key = raw.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        category: 'date_of_birth',
        matchedText: redactPreview(raw, { showLast: 0 }),
        matchedTextRaw: raw,
        index: match.index + match[0].indexOf(raw),
        confidence: 80,
        severity: 'high',
        recommendation: 'Dates of birth are personal data — mask or encrypt before sharing.',
      });
    }
    return results;
  }

  function findPpsNumbers(text) {
    const input = String(text || '');
    if (!input) return [];
    const pattern = /\b(\d{7})([A-W])\b/gi;
    const results = [];
    const seen = new Set();
    let match;
    while ((match = pattern.exec(input)) !== null) {
      const raw = `${match[1]}${match[2].toUpperCase()}`;
      const key = raw.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        category: 'national_id',
        matchedText: redactPreview(raw, { showLast: 1 }),
        matchedTextRaw: raw,
        index: match.index,
        confidence: 82,
        severity: 'high',
        recommendation: 'Do not share PPS or national identifiers in plain text.',
        tags: ['pps', 'ie'],
      });
    }
    return results;
  }

  const INVALID_NINO_PREFIXES = new Set(['BG', 'GB', 'NK', 'KN', 'TN', 'NT', 'ZZ']);

  function australianTfnCheck(digits) {
    const d = normalizeDigits(digits);
    if (!/^\d{9}$/.test(d)) return false;
    const weights = [1, 4, 3, 7, 5, 8, 6, 9];
    let sum = 0;
    for (let i = 0; i < 8; i += 1) sum += Number(d[i]) * weights[i];
    let check = 11 - (sum % 11);
    if (check === 11) check = 0;
    if (check === 10) return false;
    return Number(d[8]) === check;
  }

  function ukNinoCheck(raw) {
    const upper = String(raw).toUpperCase().replace(/\s/g, '');
    const match = upper.match(/^([A-CEGHJ-PR-TW-Z]{2})(\d{6})([A-D])$/);
    if (!match) return false;
    return !INVALID_NINO_PREFIXES.has(match[1]);
  }

  function singaporeNricCheck(raw) {
    const upper = String(raw).toUpperCase().replace(/\s/g, '');
    const match = upper.match(/^([STFGM])(\d{7})([A-Z])$/);
    if (!match) return false;
    const weights = [2, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < 7; i += 1) sum += Number(match[2][i]) * weights[i];
    const st = 'JZIHGFEDCBA';
    const fg = 'XWUTRQPNMLK';
    const offsets = { S: 0, T: 4, F: 0, G: 4, M: 3 };
    const alpha = (match[1] === 'S' || match[1] === 'T') ? st : fg;
    const expected = alpha[(sum + (offsets[match[1]] || 0)) % 11];
    return match[3] === expected;
  }

  function aadhaarVerhoeffCheck(digits) {
    const d = normalizeDigits(digits);
    if (!/^[2-9]\d{11}$/.test(d)) return false;
    const inv = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];
    const dTable = [
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
      [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
      [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
      [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
      [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
      [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
      [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
      [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
      [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
    ];
    const pTable = [
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
      [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
      [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
      [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
      [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
      [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
      [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
    ];
    let c = 0;
    const reversed = d.split('').reverse();
    for (let i = 0; i < reversed.length; i += 1) {
      c = dTable[c][pTable[i % 8][Number(reversed[i])]];
    }
    return c === 0;
  }

  function canadianSinCheck(digits) {
    const d = normalizeDigits(digits);
    if (!/^\d{9}$/.test(d) || d.startsWith('0')) return false;
    let sum = 0;
    let alternate = false;
    for (let i = d.length - 1; i >= 0; i -= 1) {
      let n = Number(d[i]);
      if (alternate) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      alternate = !alternate;
    }
    return sum % 10 === 0;
  }

  function findRegionalNationalIds(text) {
    const input = String(text || '');
    if (!input) return [];
    const results = [];
    const seen = new Set();

    function push(hit) {
      const key = String(hit.matchedTextRaw || '').toUpperCase().replace(/\s/g, '');
      if (!key || seen.has(key)) return;
      seen.add(key);
      results.push(hit);
    }

    let match;
    const sinPattern = /\b(?:SIN|social insurance)[#:\s-]*(\d{3})[\s-]?(\d{3})[\s-]?(\d{3})\b/gi;
    while ((match = sinPattern.exec(input)) !== null) {
      const raw = `${match[1]}${match[2]}${match[3]}`;
      if (!canadianSinCheck(raw)) continue;
      push({
        category: 'national_id',
        matchedText: redactPreview(raw, { showLast: 3 }),
        matchedTextRaw: match[0].includes('-') || match[0].includes(' ') ? `${match[1]}-${match[2]}-${match[3]}` : raw,
        index: match.index,
        confidence: 86,
        severity: 'critical',
        recommendation: 'Canadian SIN — do not share in plain text.',
        tags: ['sin', 'ca'],
      });
    }

    const tfnPattern = /\b(?:TFN|tax file)[#:\s-]*(\d{3})[\s-]?(\d{3})[\s-]?(\d{3})\b/gi;
    while ((match = tfnPattern.exec(input)) !== null) {
      const raw = `${match[1]}${match[2]}${match[3]}`;
      if (!australianTfnCheck(raw)) continue;
      push({
        category: 'national_id',
        matchedText: redactPreview(raw, { showLast: 3 }),
        matchedTextRaw: raw,
        index: match.index,
        confidence: 86,
        severity: 'high',
        recommendation: 'Australian TFN — do not share in plain text.',
        tags: ['tfn', 'au'],
      });
    }

    const ninoPattern = /\b(?:NINO|NI number|national insurance)[#:\s-]*([A-CEGHJ-PR-TW-Z]{2})[\s-]?(\d{2})[\s-]?(\d{2})[\s-]?(\d{2})[\s-]?([A-D])\b/gi;
    while ((match = ninoPattern.exec(input)) !== null) {
      const raw = `${match[1]}${match[2]}${match[3]}${match[4]}${match[5]}`.toUpperCase();
      if (!ukNinoCheck(raw)) continue;
      push({
        category: 'national_id',
        matchedText: redactPreview(raw, { showLast: 1 }),
        matchedTextRaw: raw,
        index: match.index,
        confidence: 88,
        severity: 'high',
        recommendation: 'UK National Insurance number — do not share in plain text.',
        tags: ['nino', 'gb'],
      });
    }

    const nricPattern = /\b([STFGM]\d{7}[A-Z])\b/gi;
    while ((match = nricPattern.exec(input)) !== null) {
      const raw = match[1].toUpperCase();
      if (!singaporeNricCheck(raw)) continue;
      push({
        category: 'national_id',
        matchedText: redactPreview(raw, { showLast: 1 }),
        matchedTextRaw: raw,
        index: match.index,
        confidence: 88,
        severity: 'high',
        recommendation: 'Singapore NRIC/FIN — do not share in plain text.',
        tags: ['nric', 'sg'],
      });
    }

    const aadhaarPattern = /\b(?:aadhaar|uid)[#:\s-]*([2-9]\d{3})[\s-]?(\d{4})[\s-]?(\d{4})\b/gi;
    while ((match = aadhaarPattern.exec(input)) !== null) {
      const raw = `${match[1]}${match[2]}${match[3]}`;
      if (!aadhaarVerhoeffCheck(raw)) continue;
      push({
        category: 'national_id',
        matchedText: redactPreview(raw, { showLast: 4 }),
        matchedTextRaw: raw,
        index: match.index,
        confidence: 88,
        severity: 'critical',
        recommendation: 'Indian Aadhaar — do not share in plain text.',
        tags: ['aadhaar', 'in'],
      });
    }

    const inseePattern = /\b(?:INSEE|sécurité sociale|securite sociale|nir)[#:\s-]*([12]\d{2}(?:0[1-9]|1[0-2])\d{2}\d{3}\d{3}\d{2})\b/gi;
    while ((match = inseePattern.exec(input)) !== null) {
      const raw = match[1];
      push({
        category: 'national_id',
        matchedText: redactPreview(raw, { showLast: 2 }),
        matchedTextRaw: raw,
        index: match.index + match[0].indexOf(raw),
        confidence: 84,
        severity: 'high',
        recommendation: 'French social security number — do not share in plain text.',
        tags: ['insee', 'fr'],
      });
    }

    const RCS = global.GoldspireRegionalChecksums || {};

    const bsnPattern = /\b(?:BSN|burgerservicenummer|sofi)[#:\s-]*(\d{3})[\s.]?(\d{3})[\s.]?(\d{3})\b/gi;
    while ((match = bsnPattern.exec(input)) !== null) {
      const raw = `${match[1]}${match[2]}${match[3]}`;
      if (RCS.bsnCheck && !RCS.bsnCheck(raw)) continue;
      push({
        category: 'national_id',
        matchedText: redactPreview(raw, { showLast: 3 }),
        matchedTextRaw: raw,
        index: match.index,
        confidence: 88,
        severity: 'critical',
        recommendation: 'Dutch BSN — do not share in plain text.',
        tags: ['bsn', 'nl'],
      });
    }

    const cpfPattern = /\b(?:CPF|cadastro de pessoa)[#:\s-]*(\d{3})[\.\s]?(\d{3})[\.\s]?(\d{3})[\-\s]?(\d{2})\b/gi;
    while ((match = cpfPattern.exec(input)) !== null) {
      const raw = `${match[1]}${match[2]}${match[3]}${match[4]}`;
      if (RCS.cpfCheck && !RCS.cpfCheck(raw)) continue;
      push({
        category: 'national_id',
        matchedText: redactPreview(raw, { showLast: 2 }),
        matchedTextRaw: raw,
        index: match.index,
        confidence: 88,
        severity: 'critical',
        recommendation: 'Brazilian CPF — do not share in plain text.',
        tags: ['cpf', 'br'],
      });
    }

    const hkidPattern = /\b(?:HKID|香港身份證)[#:\s-]*([A-Z]{1,2})[\s-]?(\d{6})[\s-]?\(?([0-9A])\)?\b/gi;
    while ((match = hkidPattern.exec(input)) !== null) {
      const raw = `${match[1]}${match[2]}${match[3]}`.toUpperCase();
      if (RCS.hkidCheck && !RCS.hkidCheck(raw)) continue;
      push({
        category: 'national_id',
        matchedText: redactPreview(raw, { showLast: 1 }),
        matchedTextRaw: raw,
        index: match.index,
        confidence: 90,
        severity: 'critical',
        recommendation: 'Hong Kong ID — do not share in plain text.',
        tags: ['hkid', 'hk'],
      });
    }
    const hkidBarePattern = /\b([A-Z]{1,2})\s?(\d{6})\s?\(?([0-9A])\)?\b/g;
    while ((match = hkidBarePattern.exec(input)) !== null) {
      const raw = `${match[1]}${match[2]}${match[3]}`.toUpperCase();
      if (!RCS.hkidCheck || !RCS.hkidCheck(raw)) continue;
      push({
        category: 'national_id',
        matchedText: redactPreview(raw, { showLast: 1 }),
        matchedTextRaw: raw,
        index: match.index,
        confidence: 85,
        severity: 'high',
        recommendation: 'Hong Kong ID — do not share in plain text.',
        tags: ['hkid', 'hk'],
      });
    }

    const irdPattern = /\b(?:IRD|tax number|GST number)[#:\s-]*(\d{2,3})[\s-]?(\d{3})[\s-]?(\d{3})\b/gi;
    while ((match = irdPattern.exec(input)) !== null) {
      const raw = `${match[1]}${match[2]}${match[3]}`;
      if (RCS.nzIrdCheck && !RCS.nzIrdCheck(raw)) continue;
      push({
        category: 'national_id',
        matchedText: redactPreview(raw, { showLast: 2 }),
        matchedTextRaw: raw,
        index: match.index,
        confidence: 86,
        severity: 'high',
        recommendation: 'New Zealand IRD number — do not share in plain text.',
        tags: ['ird', 'nz'],
      });
    }

    const steuerPattern = /\b(?:Steuer-ID|steueridentifikationsnummer|tax id de)[#:\s-]*(\d{11})\b/gi;
    while ((match = steuerPattern.exec(input)) !== null) {
      const raw = match[1];
      if (RCS.germanSteuerIdCheck && !RCS.germanSteuerIdCheck(raw)) continue;
      push({
        category: 'national_id',
        matchedText: redactPreview(raw, { showLast: 3 }),
        matchedTextRaw: raw,
        index: match.index + match[0].indexOf(raw),
        confidence: 86,
        severity: 'high',
        recommendation: 'German tax ID — do not share in plain text.',
        tags: ['steuer', 'de'],
      });
    }

    const sePattern = /\b(?:personnummer|personnr)[#:\s-]*(\d{6})[\s-]?(\d{4})\b/gi;
    while ((match = sePattern.exec(input)) !== null) {
      const raw = `${match[1]}${match[2]}`;
      if (RCS.swedishPersonnummerCheck && !RCS.swedishPersonnummerCheck(raw)) continue;
      push({
        category: 'national_id',
        matchedText: redactPreview(raw, { showLast: 2 }),
        matchedTextRaw: raw,
        index: match.index,
        confidence: 87,
        severity: 'high',
        recommendation: 'Swedish personnummer — do not share in plain text.',
        tags: ['personnummer', 'se'],
      });
    }

    const noPattern = /\b(?:fødselsnummer|fodselsnummer|fnr)[#:\s-]*(\d{6})[\s-]?(\d{5})\b/gi;
    while ((match = noPattern.exec(input)) !== null) {
      const raw = `${match[1]}${match[2]}`;
      if (RCS.norwegianFnrCheck && !RCS.norwegianFnrCheck(raw)) continue;
      push({
        category: 'national_id',
        matchedText: redactPreview(raw, { showLast: 2 }),
        matchedTextRaw: raw,
        index: match.index,
        confidence: 87,
        severity: 'high',
        recommendation: 'Norwegian fødselsnummer — do not share in plain text.',
        tags: ['fnr', 'no'],
      });
    }

    const dkPattern = /\b(?:CPR|cpr-nr)[#:\s-]*(\d{6})[\s-]?(\d{4})\b/gi;
    while ((match = dkPattern.exec(input)) !== null) {
      const raw = `${match[1]}${match[2]}`;
      if (RCS.danishCprCheck && !RCS.danishCprCheck(raw)) continue;
      push({
        category: 'national_id',
        matchedText: redactPreview(raw, { showLast: 2 }),
        matchedTextRaw: raw,
        index: match.index,
        confidence: 84,
        severity: 'high',
        recommendation: 'Danish CPR number — do not share in plain text.',
        tags: ['cpr', 'dk'],
      });
    }

    const curpPattern = /\b(?:CURP)[#:\s-]*([A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d)\b/gi;
    while ((match = curpPattern.exec(input)) !== null) {
      const raw = match[1].toUpperCase();
      if (RCS.curpShapeCheck && !RCS.curpShapeCheck(raw)) continue;
      push({
        category: 'national_id',
        matchedText: redactPreview(raw, { showLast: 2 }),
        matchedTextRaw: raw,
        index: match.index + match[0].indexOf(raw),
        confidence: 88,
        severity: 'high',
        recommendation: 'Mexican CURP — do not share in plain text.',
        tags: ['curp', 'mx'],
      });
    }

    const myNumberPattern = /\b(?:マイナンバー|my number|individual number)[#:\s-]*(\d{4})[\s-]?(\d{4})[\s-]?(\d{4})\b/gi;
    while ((match = myNumberPattern.exec(input)) !== null) {
      const raw = `${match[1]}${match[2]}${match[3]}`;
      if (RCS.japanMyNumberCheck && !RCS.japanMyNumberCheck(raw)) continue;
      push({
        category: 'national_id',
        matchedText: redactPreview(raw, { showLast: 4 }),
        matchedTextRaw: raw,
        index: match.index,
        confidence: 88,
        severity: 'critical',
        recommendation: 'Japanese My Number — do not share in plain text.',
        tags: ['mynumber', 'jp'],
      });
    }

    const rrnPattern = /\b(?:RRN|resident registration|주민등록번호)[#:\s-]*(\d{6})[\s-]?(\d{7})\b/gi;
    while ((match = rrnPattern.exec(input)) !== null) {
      const raw = `${match[1]}${match[2]}`;
      if (RCS.koreanRrnCheck && !RCS.koreanRrnCheck(raw)) continue;
      push({
        category: 'national_id',
        matchedText: redactPreview(raw, { showLast: 2 }),
        matchedTextRaw: raw,
        index: match.index,
        confidence: 88,
        severity: 'critical',
        recommendation: 'Korean resident registration number — do not share in plain text.',
        tags: ['rrn', 'kr'],
      });
    }

    const bePattern = /\b(?:rijksregisternummer|national register)[#:\s-]*(\d{2})[\.\s]?(\d{2})[\.\s]?(\d{2})[\-\s]?(\d{3})[\.\s]?(\d{2})\b/gi;
    while ((match = bePattern.exec(input)) !== null) {
      const raw = `${match[1]}${match[2]}${match[3]}${match[4]}${match[5]}`;
      if (RCS.belgianNrnCheck && !RCS.belgianNrnCheck(raw)) continue;
      push({
        category: 'national_id',
        matchedText: redactPreview(raw, { showLast: 2 }),
        matchedTextRaw: raw,
        index: match.index,
        confidence: 86,
        severity: 'high',
        recommendation: 'Belgian national register number — do not share in plain text.',
        tags: ['nrn', 'be'],
      });
    }

    const zaPattern = /\b(?:SA ID|south africa id)[#:\s-]*(\d{13})\b/gi;
    while ((match = zaPattern.exec(input)) !== null) {
      const raw = match[1];
      if (RCS.southAfricanIdCheck && !RCS.southAfricanIdCheck(raw)) continue;
      push({
        category: 'national_id',
        matchedText: redactPreview(raw, { showLast: 2 }),
        matchedTextRaw: raw,
        index: match.index + match[0].indexOf(raw),
        confidence: 86,
        severity: 'high',
        recommendation: 'South African ID number — do not share in plain text.',
        tags: ['sa_id', 'za'],
      });
    }

    const twPattern = /\b(?:TW ID|taiwan id|身分證)[#:\s-]*([A-Z])(\d{9})\b/gi;
    while ((match = twPattern.exec(input)) !== null) {
      const raw = `${match[1]}${match[2]}`.toUpperCase();
      if (RCS.taiwanIdCheck && !RCS.taiwanIdCheck(raw)) continue;
      push({
        category: 'national_id',
        matchedText: redactPreview(raw, { showLast: 1 }),
        matchedTextRaw: raw,
        index: match.index,
        confidence: 87,
        severity: 'high',
        recommendation: 'Taiwan national ID — do not share in plain text.',
        tags: ['tw_id', 'tw'],
      });
    }

    const itinPattern = /\b(?:ITIN|individual taxpayer)[#:\s-]*(9\d{2})[\s-]?(5\d|6\d|7\d)[\s-]?(\d{4})\b/gi;
    while ((match = itinPattern.exec(input)) !== null) {
      const raw = `${match[1]}${match[2]}${match[3]}`;
      push({
        category: 'tax_id',
        matchedText: redactPreview(raw, { showLast: 4 }),
        matchedTextRaw: raw,
        index: match.index,
        confidence: 84,
        severity: 'high',
        recommendation: 'US ITIN — do not share in plain text.',
        tags: ['itin', 'us'],
      });
    }

    return results;
  }

  function findNationalIds(text) {
    const input = String(text || '');
    if (!input) return [];
    const patterns = [
      /\b\d{3}-\d{3}-\d{3}\b/g,
      /\b[A-Z]{2}\d{6}[A-Z]?\b/g,
      /\bNINO[:\s-]?[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]?\b/gi,
    ];
    const results = [...findRegionalNationalIds(input), ...findPpsNumbers(input)];
    const seen = new Set(results.map((hit) => String(hit.matchedTextRaw || '').toUpperCase().replace(/\s/g, '')));
    for (const re of patterns) {
      let match;
      while ((match = re.exec(input)) !== null) {
        const raw = match[0];
        const key = raw.toUpperCase().replace(/\s/g, '');
        if (seen.has(key)) continue;
        if (re.source.includes('NINO') && !ukNinoCheck(raw.replace(/^NINO[:\s-]?/i, ''))) continue;
        seen.add(key);
        results.push({
          category: 'national_id',
          matchedText: redactPreview(raw, { showLast: 2 }),
          matchedTextRaw: raw,
          index: match.index,
          confidence: 70,
          severity: 'high',
          recommendation: 'Do not share government identifiers in plain text.',
        });
      }
    }
    return results;
  }

  function findPassports(text) {
    const input = String(text || '');
    if (!input) return [];
    const pattern = /\b(?:passport|travel doc)[#:\s-]*([A-Z0-9]{6,9})\b/gi;
    const results = [];
    let match;
    while ((match = pattern.exec(input)) !== null) {
      const raw = match[1];
      results.push({
        category: 'passport',
        matchedText: redactPreview(raw, { showLast: 2 }),
        matchedTextRaw: raw,
        index: match.index + match[0].indexOf(raw),
        confidence: 78,
        severity: 'high',
        recommendation: 'Do not share passport numbers in plain text.',
      });
    }
    return results;
  }

  function findDriverLicenses(text) {
    const input = String(text || '');
    if (!input) return [];
    const pattern = /\b(?:DL|driver(?:'s)? licen[cs]e)[#:\s-]*([A-Z0-9-]{5,16})\b/gi;
    const results = [];
    let match;
    while ((match = pattern.exec(input)) !== null) {
      const raw = match[1];
      results.push({
        category: 'driver_license',
        matchedText: redactPreview(raw, { showLast: 3 }),
        matchedTextRaw: raw,
        index: match.index + match[0].indexOf(raw),
        confidence: 72,
        severity: 'high',
        recommendation: 'Do not share license numbers in plain text.',
      });
    }
    return results;
  }

  function findMedicalRecordNumbers(text) {
    const input = String(text || '');
    if (!input) return [];
    const results = [];
    const seen = new Set();
    const patterns = [
      /\b(?:MRN|medical record)[#:\s-]*(\d{6,12})\b/gi,
      /\b(?:medicare|IRN)[#:\s-]*(\d{4})[\s-]?(\d{5})[\s-]?(\d)\b/gi,
    ];
    let match;
    for (const pattern of patterns) {
      while ((match = pattern.exec(input)) !== null) {
        const raw = match[3] != null ? `${match[1]}${match[2]}${match[3]}` : match[1];
        const key = raw;
        if (seen.has(key)) continue;
        seen.add(key);
        const isMedicare = match[3] != null;
        results.push({
          category: isMedicare ? 'nhs_number' : 'medical_record_number',
          matchedText: redactPreview(raw, { showLast: 2 }),
          matchedTextRaw: match[0],
          index: match.index,
          confidence: isMedicare ? 84 : 80,
          severity: 'critical',
          recommendation: isMedicare
            ? 'Australian Medicare number — personal health data.'
            : 'HIPAA-sensitive — do not share medical identifiers.',
          tags: isMedicare ? ['medicare', 'au'] : ['mrn'],
        });
      }
    }
    return results;
  }

  function findCustomerIds(text) {
    const input = String(text || '');
    if (!input) return [];
    const pattern = /\b(?:customer|cust|client)[#:\s-]*([A-Z0-9-]{4,20})\b/gi;
    const results = [];
    let match;
    while ((match = pattern.exec(input)) !== null) {
      const raw = match[1];
      if (/^\d{4,6}$/.test(raw)) continue;
      results.push({
        category: 'customer_id',
        matchedText: redactPreview(raw, { showLast: 3 }),
        matchedTextRaw: raw,
        index: match.index + match[0].indexOf(raw),
        confidence: 62,
        severity: 'medium',
        recommendation: 'Verify whether this customer identifier should be shared.',
      });
    }
    return results;
  }

  function findInternalCompanyRefs(text) {
    const input = String(text || '');
    if (!input) return [];
    const pattern = /\b(?:INTERNAL|INT|PROJ|PROJECT|TICKET|INC|CASE)[-_][A-Z0-9]{3,20}\b/gi;
    const results = [];
    let match;
    while ((match = pattern.exec(input)) !== null) {
      const raw = match[0];
      results.push({
        category: 'internal_company_reference',
        matchedText: redactPreview(raw, { showLast: 4 }),
        matchedTextRaw: raw,
        index: match.index,
        confidence: 68,
        severity: 'medium',
        recommendation: 'Protect internal business references.',
      });
    }
    return results;
  }

  function findPasswords(text, context = {}) {
    const input = String(text || '');
    if (!input) return [];
    const pattern = /\b(?=[^\s]*[A-Z])(?=[^\s]*[a-z])(?=[^\s]*\d)[A-Za-z0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]{8,64}\b/g;
    const results = [];
    const seen = new Set();
    let match;
    while ((match = pattern.exec(input)) !== null) {
      const raw = match[0];
      const key = raw.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      let confidence = 58;
      if (/[^A-Za-z0-9]/.test(raw)) confidence += 12;
      if (raw.length >= 12) confidence += 8;
      if (context.isPasswordField) confidence += 28;
      if (context.fieldType === 'password') confidence += 28;

      results.push({
        category: 'password',
        matchedText: redactPreview(raw, { showLast: 0 }),
        matchedTextRaw: raw,
        index: match.index,
        confidence: Math.min(96, confidence),
        severity: context.isPasswordField || context.fieldType === 'password' ? 'high' : 'medium',
        recommendation: 'Use encrypt or a password manager.',
      });
    }
    return results;
  }

  const DETECTION_CATEGORY_PRIORITY = {
    iban: 95,
    credit_card: 94,
    ssn: 93,
    medical_record_number: 92,
    nhs_number: 92,
    jwt: 91,
    private_key: 91,
    bank_account: 90,
    routing_number: 90,
    swift_bic: 89,
    tax_id: 89,
    passport: 89,
    driver_license: 88,
    national_id: 87,
    date_of_birth: 86,
    api_key: 70,
    password: 65,
    email: 60,
    phone: 60,
    customer_id: 55,
    internal_company_reference: 50,
  };

  function sortDetections(results) {
    return [...results].sort((a, b) => {
      const confDiff = (Number(b.confidence) || 0) - (Number(a.confidence) || 0);
      if (confDiff !== 0) return confDiff;
      const priA = DETECTION_CATEGORY_PRIORITY[a.category] || 0;
      const priB = DETECTION_CATEGORY_PRIORITY[b.category] || 0;
      return priB - priA;
    });
  }

  function analyzeAll(text, context = {}) {
    const ctx = context || {};
    const resolved = suppressIbanConflicts(text, sortDetections([
      ...findCreditCards(text),
      ...findPrivateKeys(text),
      ...findConnectionStrings(text),
      ...findJwts(text),
      ...findApiKeys(text),
      ...findEmails(text, context),
      ...findPhones(text, context),
      ...findIbans(text),
      ...findRoutingNumbers(text),
      ...findSwiftBics(text),
      ...findTaxIds(text),
      ...findNhsNumbers(text),
      ...findDatesOfBirth(text),
      ...findSsns(text),
      ...findBankAccounts(text),
      ...findNationalIds(text),
      ...findPassports(text),
      ...findDriverLicenses(text),
      ...findMedicalRecordNumbers(text),
      ...findCustomerIds(text),
      ...findInternalCompanyRefs(text),
      ...findPasswords(text, context),
    ]));
    return global.GoldspireDetectionContextResolve?.resolveDetections?.(text, resolved, ctx) || resolved;
  }

  function isSensitiveSelectionText(text, context = {}) {
    if (!text || text.length < 4) return false;
    const trimmed = String(text).trim();
    const hits = analyzeAll(trimmed, { ...context, source: context.source || 'selection' });
    const filtered = global.GoldspireDetectionGating?.filterForPrompt?.(
      hits,
      { ...context, source: context.source || 'selection' },
      context.source || 'selection',
    ) || hits.filter((hit) => hit.confidence >= 50);
    return filtered.length > 0;
  }

  global.GoldspireDetectionLib = {
    redactPreview,
    normalizeDigits,
    luhnCheck,
    findCreditCards,
    findJwts,
    findPrivateKeys,
    findConnectionStrings,
    findApiKeys,
    findEmails,
    findPhones,
    findIbans,
    findIbanPrefixes,
    findRoutingNumbers,
    findSwiftBics,
    findTaxIds,
    findNhsNumbers,
    findDatesOfBirth,
    looksLikeIbanPrefix,
    fieldLooksLikeIban,
    shouldSkipGenericSecretGuess,
    sortDetections,
    findSsns,
    findBankAccounts,
    findNationalIds,
    findRegionalNationalIds,
    findPassports,
    findDriverLicenses,
    findMedicalRecordNumbers,
    findCustomerIds,
    findInternalCompanyRefs,
    findPasswords,
    analyzeAll,
    isSensitiveSelectionText,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
