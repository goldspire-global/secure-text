import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { getPool } from './db.mjs';
import { httpError } from './org-service.mjs';
import {
  authenticatePersonalRequest,
  assertPlusActive,
  assertEmailVerified,
  normalizePersonalEmail,
  personalInboxKey,
  hashClaimToken,
} from './personal-service.mjs';

function encryptUnlockSecret(accountId, recipientEmail, unlockSecret) {
  const key = personalInboxKey(accountId, recipientEmail);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(unlockSecret), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64url');
}

function decryptUnlockSecret(accountId, recipientEmail, encoded) {
  if (!encoded) return '';
  try {
    const key = personalInboxKey(accountId, recipientEmail);
    const buf = Buffer.from(encoded, 'base64url');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ciphertext = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  } catch {
    return '';
  }
}

function encryptForAccount(accountId, secret) {
  const key = personalInboxKey(accountId, '__magic__');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(secret), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64url');
}

function decryptForAccount(accountId, encoded) {
  if (!encoded) return '';
  try {
    const key = personalInboxKey(accountId, '__magic__');
    const buf = Buffer.from(encoded, 'base64url');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ciphertext = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

export async function createPersonalShares(token, deviceId, body = {}) {
  const account = await authenticatePersonalRequest(token, deviceId);
  assertPlusActive(account);
  assertEmailVerified(account);

  const senderEmail = account.owner_email;
  const unlockSecret = String(body.unlockSecret || '').trim();
  const markerFingerprint = String(body.markerFingerprint || '').trim();
  if (!unlockSecret) throw httpError(400, 'unlockSecret is required.');
  if (!markerFingerprint) throw httpError(400, 'markerFingerprint is required.');

  const expiresAt = body.expiresAt
    ? new Date(body.expiresAt)
    : new Date(Date.now() + 72 * 60 * 60 * 1000);
  if (Number.isNaN(expiresAt.getTime())) throw httpError(400, 'Invalid expiresAt.');

  const deliveries = Array.isArray(body.deliveries) ? body.deliveries : [];
  if (deliveries.length === 0) throw httpError(400, 'At least one delivery is required.');

  const pool = getPool();
  const created = [];

  for (const delivery of deliveries) {
    const recipientEmail = normalizePersonalEmail(delivery.recipientEmail);
    if (!recipientEmail || recipientEmail === senderEmail) continue;
    if (!delivery.wrappedKey || typeof delivery.wrappedKey !== 'object') {
      throw httpError(400, `wrappedKey is required for ${recipientEmail || 'recipient'}.`);
    }

    const memberResult = await pool.query(
      `SELECT email, public_key_jwk FROM personal_contacts
       WHERE account_id = $1 AND email = $2 AND active = true`,
      [account.id, recipientEmail],
    );
    if (memberResult.rowCount === 0) {
      throw httpError(404, `${recipientEmail} is not in your trusted contacts.`);
    }
    if (!memberResult.rows[0].public_key_jwk) {
      throw httpError(400, `${recipientEmail} has not installed Veil yet. Ask them to install and add your contact.`);
    }

    const insert = await pool.query(
      `INSERT INTO personal_pending_unlocks
         (account_id, sender_email, recipient_email, wrapped_key, marker_fingerprint, expires_at, unlock_secret_enc)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
       RETURNING id, recipient_email, expires_at`,
      [
        account.id,
        senderEmail,
        recipientEmail,
        JSON.stringify(delivery.wrappedKey),
        markerFingerprint,
        expiresAt.toISOString(),
        encryptUnlockSecret(account.id, recipientEmail, unlockSecret),
      ],
    );

    created.push({
      id: insert.rows[0].id,
      recipientEmail: insert.rows[0].recipient_email,
      expiresAt: insert.rows[0].expires_at,
    });
  }

  if (created.length === 0) throw httpError(400, 'No valid recipients to share with.');
  return { ok: true, shares: created };
}

export async function listPersonalPendingShares(token, deviceId) {
  const account = await authenticatePersonalRequest(token, deviceId);
  assertEmailVerified(account);
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, account_id AS sender_account_id, sender_email, wrapped_key, marker_fingerprint, expires_at, created_at, unlock_secret_enc, recipient_email
     FROM personal_pending_unlocks
     WHERE lower(recipient_email) = lower($1)
       AND claimed_at IS NULL
       AND expires_at > now()
     ORDER BY created_at DESC
     LIMIT 50`,
    [account.owner_email],
  );

  return {
    selfEmail: account.owner_email,
    shares: result.rows.map((row) => ({
      id: row.id,
      senderEmail: row.sender_email,
      wrappedKey: row.wrapped_key,
      unlockKey: decryptUnlockSecret(row.sender_account_id, row.recipient_email, row.unlock_secret_enc) || undefined,
      markerFingerprint: row.marker_fingerprint,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    })),
  };
}

export async function lookupPersonalUnlockKey(token, deviceId, fingerprint) {
  const account = await authenticatePersonalRequest(token, deviceId);
  assertEmailVerified(account);
  const fp = String(fingerprint || '').trim();
  if (!fp) throw httpError(400, 'fingerprint is required.');

  const pool = getPool();
  const result = await pool.query(
    `SELECT id, account_id AS sender_account_id, unlock_secret_enc, expires_at, claimed_at, recipient_email
     FROM personal_pending_unlocks
     WHERE lower(recipient_email) = lower($1)
       AND marker_fingerprint = $2
       AND expires_at > now()
     ORDER BY created_at DESC
     LIMIT 1`,
    [account.owner_email, fp],
  );

  if (result.rowCount === 0) throw httpError(404, 'No unlock key found for this message.');
  const row = result.rows[0];
  const unlockKey = decryptUnlockSecret(row.sender_account_id, row.recipient_email, row.unlock_secret_enc);
  if (!unlockKey) throw httpError(404, 'Unlock key unavailable. Ask the sender to share again.');

  return {
    unlockKey,
    shareId: row.id,
    expiresAt: row.expires_at,
    claimed: Boolean(row.claimed_at),
  };
}

export async function createMagicClaim(token, deviceId, body = {}) {
  const account = await authenticatePersonalRequest(token, deviceId);
  assertPlusActive(account);
  assertEmailVerified(account);

  const unlockSecret = String(body.unlockSecret || '').trim();
  if (!unlockSecret) throw httpError(400, 'unlockSecret is required.');

  const expiresAt = body.expiresAt
    ? new Date(body.expiresAt)
    : new Date(Date.now() + 72 * 60 * 60 * 1000);
  if (Number.isNaN(expiresAt.getTime())) throw httpError(400, 'Invalid expiresAt.');

  const claimToken = randomBytes(24).toString('base64url');
  const tokenHash = hashClaimToken(claimToken);
  const pool = getPool();

  await pool.query(
    `INSERT INTO personal_magic_claims (account_id, claim_token_hash, unlock_secret_enc, marker_fingerprint, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      account.id,
      tokenHash,
      encryptForAccount(account.id, unlockSecret),
      String(body.markerFingerprint || '').trim() || null,
      expiresAt.toISOString(),
    ],
  );

  return {
    ok: true,
    claimToken,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function redeemMagicClaim(claimToken) {
  const token = String(claimToken || '').trim();
  if (!token) throw httpError(400, 'Invalid claim link.');

  const pool = getPool();
  const result = await pool.query(
    `SELECT id, account_id, unlock_secret_enc, expires_at, claimed_at
     FROM personal_magic_claims
     WHERE claim_token_hash = $1`,
    [hashClaimToken(token)],
  );

  if (result.rowCount === 0) throw httpError(404, 'This link is invalid or expired.');
  const row = result.rows[0];
  if (row.claimed_at) throw httpError(410, 'This link was already used.');
  if (new Date(row.expires_at).getTime() < Date.now()) throw httpError(410, 'This link has expired.');

  const unlockCode = decryptForAccount(row.account_id, row.unlock_secret_enc);
  if (!unlockCode) throw httpError(500, 'Could not read unlock code.');

  await pool.query(
    `UPDATE personal_magic_claims SET claimed_at = now() WHERE id = $1`,
    [row.id],
  );

  return { ok: true, unlockCode };
}
