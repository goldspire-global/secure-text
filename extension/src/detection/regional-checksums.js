/**
 * Regional ID checksum validators — used by lib-bundle.js findRegionalNationalIds.
 */
(function (global) {
  function digits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function bsnCheck(value) {
    const d = digits(value);
    if (!/^\d{9}$/.test(d)) return false;
    let sum = 0;
    for (let i = 0; i < 8; i += 1) sum += Number(d[i]) * (9 - i);
    sum -= Number(d[8]);
    return sum % 11 === 0;
  }

  function cpfCheck(value) {
    const d = digits(value);
    if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i += 1) sum += Number(d[i]) * (10 - i);
    let r = (sum * 10) % 11;
    if (r === 10) r = 0;
    if (r !== Number(d[9])) return false;
    sum = 0;
    for (let i = 0; i < 10; i += 1) sum += Number(d[i]) * (11 - i);
    r = (sum * 10) % 11;
    if (r === 10) r = 0;
    return r === Number(d[10]);
  }

  function hkidCharValue(ch) {
    if (ch === ' ') return 36;
    const code = ch.charCodeAt(0);
    if (code >= 65 && code <= 90) return code - 55;
    return 0;
  }

  function hkidCheck(value) {
    const s = String(value || '').toUpperCase().replace(/[()]/g, '').replace(/\s/g, '');
    const m = s.match(/^([A-Z]{1,2})(\d{6})([0-9A])$/);
    if (!m) return false;
    let sum = 0;
    if (m[1].length === 2) {
      sum += hkidCharValue(m[1][0]) * 9 + hkidCharValue(m[1][1]) * 8;
    } else {
      sum += 36 * 9 + hkidCharValue(m[1]) * 8;
    }
    const weights = [7, 6, 5, 4, 3, 2];
    for (let i = 0; i < 6; i += 1) sum += Number(m[2][i]) * weights[i];
    const rem = sum % 11;
    const expected = rem === 0 ? 0 : 11 - rem;
    const check = m[3] === 'A' ? 10 : Number(m[3]);
    return check === expected;
  }

  function nzIrdCheck(value) {
    const d = digits(value);
    if (!/^\d{8,9}$/.test(d)) return false;
    const body = d.length === 9 ? d.slice(0, 8) : d.slice(0, 7);
    const checkDigit = Number(d.slice(-1));
    const weights8 = [3, 2, 7, 6, 5, 4, 3, 2];
    const weights7 = [2, 7, 6, 5, 4, 3, 2];
    const weights = body.length === 8 ? weights8 : weights7;
    let sum = 0;
    for (let i = 0; i < body.length; i += 1) sum += Number(body[i]) * weights[i];
    const rem = sum % 11;
    const expected = rem === 0 ? 0 : 11 - rem;
    return checkDigit === expected;
  }

  function germanSteuerIdCheck(value) {
    const d = digits(value);
    if (!/^\d{11}$/.test(d)) return false;
    if (d[0] === '0') return false;
    const counts = new Map();
    for (const ch of d) counts.set(ch, (counts.get(ch) || 0) + 1);
    let doubles = 0;
    for (const count of counts.values()) {
      if (count === 2) doubles += 1;
      else if (count !== 1) return false;
    }
    return doubles === 1;
  }

  function luhnDigitCheck(value) {
    const d = digits(value);
    if (d.length < 2) return false;
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

  function swedishPersonnummerCheck(value) {
    const d = digits(value);
    if (!/^\d{10}$/.test(d) && !/^\d{12}$/.test(d)) return false;
    const ten = d.length === 12 ? d.slice(2) : d;
    const mm = Number(ten.slice(2, 4));
    const dd = Number(ten.slice(4, 6));
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return false;
    return luhnDigitCheck(ten);
  }

  function norwegianFnrCheck(value) {
    const d = digits(value);
    if (!/^\d{11}$/.test(d)) return false;
    const k1w = [3, 7, 6, 1, 8, 9, 4, 5, 2];
    let sum = 0;
    for (let i = 0; i < 9; i += 1) sum += Number(d[i]) * k1w[i];
    const k1 = sum % 11 === 0 ? 0 : 11 - (sum % 11);
    if (k1 === 10 || k1 !== Number(d[9])) return false;
    const k2w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    sum = 0;
    for (let i = 0; i < 10; i += 1) sum += Number(d[i]) * k2w[i];
    const k2 = sum % 11 === 0 ? 0 : 11 - (sum % 11);
    return k2 !== 10 && k2 === Number(d[10]);
  }

  function danishCprCheck(value) {
    const d = digits(value);
    if (!/^\d{10}$/.test(d)) return false;
    const dd = Number(d.slice(0, 2));
    const mm = Number(d.slice(2, 4));
    if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return false;
    return true;
  }

  function curpShapeCheck(value) {
    const s = String(value || '').toUpperCase().replace(/\s/g, '');
    return /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/.test(s);
  }

  function japanMyNumberCheck(value) {
    const d = digits(value);
    if (!/^\d{12}$/.test(d)) return false;
    const weights = [6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < 11; i += 1) sum += Number(d[i]) * weights[i];
    const rem = sum % 11;
    const expected = rem <= 1 ? 0 : 11 - rem;
    return Number(d[11]) === expected;
  }

  function koreanRrnCheck(value) {
    const d = digits(value);
    if (!/^\d{13}$/.test(d)) return false;
    const weights = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5];
    let sum = 0;
    for (let i = 0; i < 12; i += 1) sum += Number(d[i]) * weights[i];
    const expected = (11 - (sum % 11)) % 11;
    return Number(d[12]) === expected;
  }

  function belgianNrnCheck(value) {
    const d = digits(value);
    if (!/^\d{11}$/.test(d)) return false;
    const base = Number(d.slice(0, 9));
    const check = Number(d.slice(9));
    let expected = 97 - (base % 97);
    if (expected === 0) expected = 97;
    if (check === expected) return true;
    const base2000 = 2000000000 + base;
    expected = 97 - (base2000 % 97);
    return check === expected;
  }

  function southAfricanIdCheck(value) {
    const d = digits(value);
    if (!/^\d{13}$/.test(d)) return false;
    return luhnDigitCheck(d);
  }

  function taiwanIdCheck(value) {
    const s = String(value || '').toUpperCase().replace(/\s/g, '');
    const m = s.match(/^([A-Z])(\d{9})$/);
    if (!m) return false;
    const letterMap = 'ABCDEFGHJKLMNPQRSTUVXYWZIO';
    const idx = letterMap.indexOf(m[1]);
    if (idx < 0) return false;
    const n1 = Math.floor((idx + 10) / 10);
    const n2 = (idx + 10) % 10;
    const weights = [1, 9, 8, 7, 6, 5, 4, 3, 2, 1, 1];
    const nums = [n1, n2, ...m[2].split('').map(Number)];
    let sum = 0;
    for (let i = 0; i < 11; i += 1) sum += nums[i] * weights[i];
    return sum % 10 === 0;
  }

  global.GoldspireRegionalChecksums = {
    digits,
    bsnCheck,
    cpfCheck,
    hkidCheck,
    nzIrdCheck,
    germanSteuerIdCheck,
    luhnDigitCheck,
    swedishPersonnummerCheck,
    norwegianFnrCheck,
    danishCprCheck,
    curpShapeCheck,
    japanMyNumberCheck,
    koreanRrnCheck,
    belgianNrnCheck,
    southAfricanIdCheck,
    taiwanIdCheck,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
