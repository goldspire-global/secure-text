/**
 * Pure detection helpers (no DOM). Tested via Node vm in tests/detection/.
 */
(function (global) {
  const API_KEY_PREFIXES = [
    { prefix: 'sk-', label: 'OpenAI-style secret key' },
    { prefix: 'sk-proj-', label: 'OpenAI project key' },
    { prefix: 'ghp_', label: 'GitHub personal access token' },
    { prefix: 'ghs_', label: 'GitHub secret' },
    { prefix: 'glpat-', label: 'GitLab personal access token' },
    { prefix: 'xoxb-', label: 'Slack bot token' },
    { prefix: 'xoxp-', label: 'Slack user token' },
    { prefix: 'xoxa-', label: 'Slack app token' },
    { prefix: 'xoxr-', label: 'Slack refresh token' },
    { prefix: 'xoxs-', label: 'Slack session token' },
    { prefix: 'AIza', label: 'Google API key' },
    { prefix: 'AKIA', label: 'AWS access key id' },
    { prefix: 'ya29.', label: 'Google OAuth token' },
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
      trimmed.length >= 8
      && trimmed.length <= 256
      && /^[A-Za-z0-9_\-./+]+$/.test(trimmed)
      && !/^\d+$/.test(trimmed)
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
    const patterns = [
      /\b\+?\d{1,3}[-.\s]?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/g,
      /\b\(\d{3}\)\s*\d{3}[-.\s]?\d{4}\b/g,
      /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g,
    ];
    const results = [];
    const seen = new Set();

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(input)) !== null) {
        const raw = match[0];
        const digits = normalizeDigits(raw);
        if (digits.length < 10 || digits.length > 15) continue;
        if (seen.has(digits)) continue;
        seen.add(digits);

        let confidence = 72;
        if (digits.length === 10 || digits.length === 11) confidence += 10;
        if (context.fieldType === 'tel' || context.isPhoneField) confidence -= 20;
        if (confidence < 45) continue;

        results.push({
          category: 'phone',
          matchedText: redactPreview(digits, { showLast: 4 }),
          matchedTextRaw: raw,
          index: match.index,
          confidence: Math.min(92, confidence),
          severity: 'medium',
          recommendation: 'Confirm this recipient should receive personal data.',
        });
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

  function findIbans(text) {
    const input = String(text || '');
    if (!input) return [];
    const results = [];
    const seen = new Set();

    function tryPushCompact(compact, index) {
      const value = String(compact || '').toUpperCase();
      if (value.length < 15 || value.length > 34) return;
      if (!ibanMod97(value)) return;
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
        if (ibanMod97(candidate)) {
          tryPushCompact(candidate, match.index);
          break;
        }
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

  function findNationalIds(text) {
    const input = String(text || '');
    if (!input) return [];
    const patterns = [
      /\b\d{3}-\d{3}-\d{3}\b/g,
      /\b[A-Z]{2}\d{6}[A-Z]?\b/g,
      /\bNINO[:\s-]?[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]?\b/gi,
    ];
    const results = [];
    for (const re of patterns) {
      let match;
      while ((match = re.exec(input)) !== null) {
        const raw = match[0];
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
    const pattern = /\b(?:MRN|medical record)[#:\s-]*(\d{6,12})\b/gi;
    const results = [];
    let match;
    while ((match = pattern.exec(input)) !== null) {
      const raw = match[1];
      results.push({
        category: 'medical_record_number',
        matchedText: redactPreview(raw, { showLast: 2 }),
        matchedTextRaw: raw,
        index: match.index + match[0].indexOf(raw),
        confidence: 80,
        severity: 'critical',
        recommendation: 'HIPAA-sensitive — do not share medical identifiers.',
      });
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

  function analyzeAll(text, context = {}) {
    return [
      ...findCreditCards(text),
      ...findJwts(text),
      ...findApiKeys(text),
      ...findEmails(text, context),
      ...findPhones(text, context),
      ...findIbans(text),
      ...findSsns(text),
      ...findBankAccounts(text),
      ...findNationalIds(text),
      ...findPassports(text),
      ...findDriverLicenses(text),
      ...findMedicalRecordNumbers(text),
      ...findCustomerIds(text),
      ...findInternalCompanyRefs(text),
      ...findPasswords(text, context),
    ];
  }

  function isSensitiveSelectionText(text, context = {}) {
    if (!text || text.length < 4) return false;
    const trimmed = String(text).trim();
    const hits = analyzeAll(trimmed, { ...context, source: 'selection' });
    if (hits.some((hit) => hit.confidence >= 50)) return true;
    if (trimmed.length >= 8) return true;
    if (/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)[^\s]{8,}$/.test(trimmed)) return true;
    return false;
  }

  global.GoldspireDetectionLib = {
    redactPreview,
    normalizeDigits,
    luhnCheck,
    findCreditCards,
    findJwts,
    findApiKeys,
    findEmails,
    findPhones,
    findIbans,
    findSsns,
    findBankAccounts,
    findNationalIds,
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
