(function (global) {
  const LOWER = 'abcdefghijkmnopqrstuvwxyz';
  const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const DIGITS = '23456789';
  const SYMBOLS = '!@#$%&*-_+=?';

  function shuffle(values) {
    const array = values.slice();
    for (let i = array.length - 1; i > 0; i -= 1) {
      const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function pick(pool, count) {
    const bytes = crypto.getRandomValues(new Uint32Array(count));
    return Array.from(bytes, (byte) => pool[byte % pool.length]);
  }

  function generatePassword(options = {}) {
    const length = Math.min(64, Math.max(8, Number(options.length) || 16));
    const useLower = options.lowercase !== false;
    const useUpper = options.uppercase !== false;
    const useDigits = options.digits !== false;
    const useSymbols = options.symbols !== false;

    const pools = [];
    if (useLower) pools.push(LOWER);
    if (useUpper) pools.push(UPPER);
    if (useDigits) pools.push(DIGITS);
    if (useSymbols) pools.push(SYMBOLS);
    if (pools.length === 0) pools.push(LOWER, UPPER, DIGITS);

    const all = pools.join('');
    const required = pools.flatMap((pool) => pick(pool, 1));
    const remaining = pick(all, Math.max(0, length - required.length));
    return shuffle([...required, ...remaining]).join('');
  }

  function scorePassphrase(value) {
    if (!value) return { label: 'Empty', score: 0 };
    let score = 0;
    if (value.length >= 8) score += 1;
    if (value.length >= 12) score += 1;
    if (value.length >= 16) score += 1;
    if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
    if (/\d/.test(value)) score += 1;
    if (/[^A-Za-z0-9]/.test(value)) score += 1;

    if (score <= 2) return { label: 'Weak', score };
    if (score <= 4) return { label: 'Fair', score };
    return { label: 'Strong', score };
  }

  global.GoldspirePassword = {
    generatePassword,
    scorePassphrase,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
