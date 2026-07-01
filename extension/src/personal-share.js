/**
 * Veil Plus — trusted contact sharing (personal direct share).
 */
(function (global) {
  const PENDING_KEYS_STORAGE = 'gstPersonalPendingUnlockKeys';

  function browser() {
    return global.GoldspireBrowser;
  }

  async function canUsePersonalSharing() {
    const settings = await global.GoldspireSettings.load();
    return global.GoldspirePersonalCapability?.canUseDirectShare?.(settings);
  }

  async function canReceivePlusShares() {
    const settings = await global.GoldspireSettings.load();
    return global.GoldspirePersonalCapability?.canReceivePlusShares?.(settings) === true;
  }

  async function canSendPlusShares() {
    const settings = await global.GoldspireSettings.load();
    return global.GoldspirePersonalCapability?.canUseDirectShare?.(settings) === true;
  }

  async function registerContact(email, displayName = '') {
    await global.GoldspireShareKeys.ensureKeyPair();
    const publicKeyJwk = await global.GoldspireShareKeys.getPublicJwk();
    return global.GoldspirePersonalProvision.apiFetch('/v1/personal/contact/register', {
      method: 'PUT',
      body: JSON.stringify({
        email: String(email || '').trim(),
        displayName: String(displayName || '').trim(),
        publicKeyJwk,
      }),
    });
  }

  async function listContacts() {
    return global.GoldspirePersonalProvision.apiFetch('/v1/personal/contacts');
  }

  async function addContact(email, displayName = '') {
    return global.GoldspirePersonalProvision.apiFetch('/v1/personal/contacts', {
      method: 'POST',
      body: JSON.stringify({ email, displayName }),
    });
  }

  async function loadPendingKeyMap() {
    const stored = await browser()?.storageGet?.('local', { [PENDING_KEYS_STORAGE]: {} });
    return stored?.[PENDING_KEYS_STORAGE] && typeof stored[PENDING_KEYS_STORAGE] === 'object'
      ? stored[PENDING_KEYS_STORAGE]
      : {};
  }

  async function savePendingKeyMap(map) {
    await new Promise((resolve) => {
      browser()?.storage?.local?.set?.({ [PENDING_KEYS_STORAGE]: map }, resolve);
    });
  }

  async function syncPendingShares() {
    const settings = await global.GoldspireSettings.load();
    if (!settings.personalEmail) return { synced: false, reason: 'no_email' };
    if (!settings.personalAccountId) return { synced: false, reason: 'no_account' };
    if (settings.personalEmailVerified !== true) {
      return { synced: false, reason: 'email_unverified' };
    }

    await registerContact(settings.personalEmail);

    const payload = await global.GoldspirePersonalProvision.apiFetch('/v1/personal/shares/pending');
    const map = await loadPendingKeyMap();
    let added = 0;

    for (const share of payload.shares || []) {
      try {
        let unlockKey = '';
        try {
          unlockKey = await global.GoldspireShareKeys.unwrapSecret(share.wrappedKey);
        } catch {
          unlockKey = String(share.unlockKey || '').trim();
        }
        if (!unlockKey) continue;
        map[share.markerFingerprint] = {
          key: unlockKey,
          shareId: share.id,
          senderEmail: share.senderEmail,
          expiresAt: new Date(share.expiresAt).getTime(),
        };
        added += 1;
      } catch (error) {
        console.warn('Veil Plus: pending share sync failed', error);
      }
    }

    const now = Date.now();
    for (const [fp, entry] of Object.entries(map)) {
      if (!entry?.expiresAt || entry.expiresAt <= now) delete map[fp];
    }
    await savePendingKeyMap(map);
    return { synced: true, added, pending: Object.keys(map).length };
  }

  async function lookupKeyForMarker(fullMarker) {
    const fingerprints = global.GoldspireShareKeys.markerFingerprints
      ? await global.GoldspireShareKeys.markerFingerprints(fullMarker)
      : [await global.GoldspireShareKeys.markerFingerprint(fullMarker)];
    const map = await loadPendingKeyMap();
    const now = Date.now();

    for (const fingerprint of fingerprints) {
      const entry = map[fingerprint];
      if (!entry?.key) continue;
      if (entry.expiresAt && entry.expiresAt <= now) {
        delete map[fingerprint];
        continue;
      }
      return entry.key;
    }
    await savePendingKeyMap(map);

    const settings = await global.GoldspireSettings.load();
    const fp = fingerprints[0];
    if (!fp) return '';
    if (!settings.personalAccountId || !settings.personalEmail) return '';
    try {
      const result = await global.GoldspirePersonalProvision.apiFetch(
        `/v1/personal/shares/unlock-key?fingerprint=${encodeURIComponent(fp)}`,
      );
      return result?.unlockKey || '';
    } catch {
      return '';
    }
  }

  async function deliverSharesForContacts({ recipientEmails, unlockSecret, fullMarker }) {
    const membersPayload = await listContacts();
    const byEmail = Object.fromEntries(
      (membersPayload.contacts || []).map((c) => [c.email.toLowerCase(), c]),
    );

    const recipients = recipientEmails.map((e) => e.trim().toLowerCase()).filter(Boolean);
    const recipientKeys = {};

    for (const email of recipients) {
      if (global.GoldspireShareRecipients?.isLikelyGroupMailbox?.(email)) {
        throw new Error(`${email} looks like a group address. Name individuals only.`);
      }
      const contact = byEmail[email];
      if (!contact) throw new Error(`${email} is not in your trusted contacts.`);
      if (!contact.registered || !contact.publicKeyJwk) {
        throw new Error(`${email} needs Veil — ask them to install and save the same email under Settings → Veil Plus.`);
      }
      recipientKeys[email] = contact.publicKeyJwk;
    }

    const deliveries = [];
    for (const email of recipients) {
      const wrappedKey = await global.GoldspireShareKeys.wrapSecretForRecipient(
        unlockSecret,
        recipientKeys[email],
      );
      deliveries.push({ recipientEmail: email, wrappedKey });
    }

    const fingerprint = await global.GoldspireShareKeys.markerFingerprint(fullMarker);
    const expiresAt = new Date(Date.now() + (global.GoldspireConstants.ONE_TIME_TTL_MS || 72 * 3600000)).toISOString();

    return global.GoldspirePersonalProvision.apiFetch('/v1/personal/shares', {
      method: 'POST',
      body: JSON.stringify({
        markerFingerprint: fingerprint,
        unlockSecret,
        expiresAt,
        deliveries,
      }),
    });
  }

  async function createMagicLink({ unlockSecret, fullMarker }) {
    const fingerprint = await global.GoldspireShareKeys.markerFingerprint(fullMarker);
    const expiresAt = new Date(Date.now() + (global.GoldspireConstants.ONE_TIME_TTL_MS || 72 * 3600000)).toISOString();
    const result = await global.GoldspirePersonalProvision.apiFetch('/v1/personal/magic-links', {
      method: 'POST',
      body: JSON.stringify({
        unlockSecret,
        markerFingerprint: fingerprint,
        expiresAt,
      }),
    });
    const base = (global.GoldspireConstants?.PORTAL_ORIGIN || '').replace(/\/$/, '');
    const url = `${base}/claim.html?t=${encodeURIComponent(result.claimToken)}`;
    return { url, expiresAt: result.expiresAt };
  }

  global.GoldspirePersonalShare = {
    canUsePersonalSharing: canSendPlusShares,
    canReceivePlusShares,
    canSendPlusShares,
    registerContact,
    listContacts,
    addContact,
    syncPendingShares,
    lookupKeyForMarker,
    deliverSharesForContacts,
    createMagicLink,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
