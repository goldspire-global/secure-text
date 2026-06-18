/**
 * Direct-share recipient validation and compose mismatch hints.
 */
(function (global) {
  const GROUP_LOCAL_PREFIXES = [
    'all',
    'team',
    'staff',
    'group',
    'groups',
    'distro',
    'mailing',
    'list',
    'lists',
    'everyone',
    'newsletter',
    'noreply',
    'no-reply',
  ];

  const GROUP_DOMAIN_HINTS = [
    'googlegroups.com',
    'groups.google.com',
    'listserv',
    'list-manage',
  ];

  function parseRecipientEmails(input) {
    return String(input || '')
      .split(/[,;\s]+/)
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.includes('@'));
  }

  function isLikelyGroupMailbox(email) {
    const normalized = String(email || '').trim().toLowerCase();
    const at = normalized.lastIndexOf('@');
    if (at < 1) return false;
    const local = normalized.slice(0, at);
    const domain = normalized.slice(at + 1);

    if (GROUP_DOMAIN_HINTS.some((hint) => domain === hint || domain.endsWith(`.${hint}`) || domain.includes(hint))) {
      return true;
    }

    if (GROUP_LOCAL_PREFIXES.some((prefix) => {
      if (local === prefix) return true;
      if (local.startsWith(`${prefix}-`) || local.startsWith(`${prefix}.`)) return true;
      if (local.endsWith(`-${prefix}`) || local.endsWith(`.${prefix}`)) return true;
      return false;
    })) {
      return true;
    }

    if (/\b(all|team|staff|group|distro|list)\b/.test(local) && local.length > 12) return true;
    return false;
  }

  function validateDirectShareRecipients(emails) {
    const list = Array.isArray(emails) ? emails : parseRecipientEmails(emails);
    if (list.length === 0) {
      throw new Error('Enter at least one colleague work email.');
    }

    const groupLike = list.filter(isLikelyGroupMailbox);
    if (groupLike.length) {
      throw new Error(
        `${groupLike[0]} looks like a group or list address. Name individual colleagues, or use Team for broad distribution.`,
      );
    }

    return list;
  }

  function readComposeRecipients() {
    const emails = new Set();

    document.querySelectorAll('[email]').forEach((el) => {
      const addr = String(el.getAttribute('email') || '').trim().toLowerCase();
      if (addr.includes('@')) emails.add(addr);
    });

    document.querySelectorAll('input[type="email"], input[name="to"], input[name="cc"]').forEach((el) => {
      const addr = String(el.value || '').trim().toLowerCase();
      if (addr.includes('@')) emails.add(addr);
    });

    document.querySelectorAll('[title*="@"], [aria-label*="@"]').forEach((el) => {
      const match = String(el.getAttribute('title') || el.getAttribute('aria-label') || '')
        .match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
      if (match) emails.add(match[0].toLowerCase());
    });

    return [...emails];
  }

  function composeMismatchWarning(namedEmails, composeEmails) {
    const named = namedEmails.map((e) => e.toLowerCase());
    const compose = (composeEmails || []).map((e) => e.toLowerCase());
    if (!compose.length) return null;

    const namedSet = new Set(named);
    const groupInCompose = compose.filter(isLikelyGroupMailbox);

    if (groupInCompose.length) {
      return 'Your email To/Cc includes a group or list. Only the people you name in Veil receive unlock keys — others will see [redacted] but cannot open it. Prefer Team for distribution lists.';
    }

    const namedMissingFromCompose = named.filter((email) => !compose.includes(email));
    if (namedMissingFromCompose.length && compose.length) {
      return `Unlock keys are sent to ${named.join(', ')}, but they are not in your email To/Cc. Make sure you are emailing the same people.`;
    }

    const extraRecipients = compose.filter((email) => !namedSet.has(email));
    if (extraRecipients.length) {
      return `Your email also goes to ${extraRecipients.slice(0, 3).join(', ')}${extraRecipients.length > 3 ? '…' : ''}, who will not receive unlock keys. Use Team if everyone on the thread should unlock.`;
    }

    return null;
  }

  global.GoldspireShareRecipients = {
    parseRecipientEmails,
    isLikelyGroupMailbox,
    validateDirectShareRecipients,
    readComposeRecipients,
    composeMismatchWarning,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
