import { createHash, randomBytes } from 'node:crypto';
import { getPool } from './db.mjs';
import { httpError } from './org-service.mjs';
import { billingEnv } from './billing.mjs';
import { sendEmail, isEmailConfigured } from './email-service.mjs';
import {
  authenticatePersonalRequest,
  normalizePersonalEmail,
} from './personal-service.mjs';
import {
  assertPersonalEmailDomainResolvable,
  assertPersonalEmailFormat,
} from './personal-email-validation.mjs';

const RESEND_COOLDOWN_MS = 60_000;

function hashVerifyToken(token) {
  return createHash('sha256').update(String(token), 'utf8').digest('hex');
}

function portalOrigin(env = billingEnv()) {
  const raw = env.ORG_PORTAL_URL || env.PORTAL_ORIGIN || '';
  try {
    return new URL(raw).origin;
  } catch {
    return String(raw).replace(/\/$/, '') || 'https://veil.goldspireventures.com';
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function isEmailVerified(account) {
  return Boolean(account?.email_verified_at);
}

export function assertEmailVerified(account) {
  const env = billingEnv();
  if (String(env.VEIL_PERSONAL_SKIP_EMAIL_VERIFY ?? '').toLowerCase() === 'true') return;
  if (!isEmailVerified(account)) {
    throw httpError(403, 'Verify your email before using trusted contacts.');
  }
}

export function buildVerificationEmail({ email, verifyUrl }) {
  const subject = 'Verify your email for Veil';
  const text = `Verify your email for Veil trusted contacts.

Open this link to confirm ${email}:
${verifyUrl}

This link expires in 24 hours. If you did not request this, ignore this email.

— Veil by Goldspire`;

  const html = `<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a1a;max-width:560px">
  <h1 style="font-size:20px;margin:0 0 12px">Verify your email</h1>
  <p>Confirm <strong>${escapeHtml(email)}</strong> to receive or send Veil Plus trusted-contact unlocks.</p>
  <p><a href="${escapeHtml(verifyUrl)}" style="display:inline-block;padding:10px 18px;background:#d4a017;color:#17130a;text-decoration:none;border-radius:8px;font-weight:600">Verify email</a></p>
  <p style="font-size:13px;color:#666">Link expires in 24 hours. If you did not request this, you can ignore this message.</p>
</body></html>`;

  return { subject, text, html };
}

export async function sendPersonalVerificationEmail(token, deviceId) {
  const env = billingEnv();
  const account = await authenticatePersonalRequest(token, deviceId);
  const email = assertPersonalEmailFormat(account.owner_email);
  await assertPersonalEmailDomainResolvable(email, env);

  if (isEmailVerified(account)) {
    return { ok: true, alreadyVerified: true, email };
  }

  const pool = getPool();
  const fresh = await pool.query(`SELECT * FROM personal_accounts WHERE id = $1`, [account.id]);
  const row = fresh.rows[0];
  const sentAt = row.email_verify_sent_at ? new Date(row.email_verify_sent_at).getTime() : 0;
  if (sentAt && Date.now() - sentAt < RESEND_COOLDOWN_MS) {
    throw httpError(429, 'Verification email was just sent. Wait a minute before resending.');
  }

  const verifyToken = randomBytes(24).toString('base64url');
  const tokenHash = hashVerifyToken(verifyToken);
  await pool.query(
    `UPDATE personal_accounts SET
       email_verify_token_hash = $2,
       email_verify_sent_at = now(),
       updated_at = now()
     WHERE id = $1`,
    [account.id, tokenHash],
  );

  const verifyUrl = `${portalOrigin(env)}/verify-email.html?t=${encodeURIComponent(verifyToken)}`;
  const content = buildVerificationEmail({ email, verifyUrl });
  const mailed = await sendEmail(env, {
    to: email,
    subject: content.subject,
    html: content.html,
    text: content.text,
  });

  const devPreview = !isEmailConfigured(env) || mailed.skipped;
  return {
    ok: true,
    email,
    emailed: mailed.ok === true,
    skipped: mailed.skipped === true,
    verifyUrl: devPreview ? verifyUrl : undefined,
    message: mailed.ok
      ? 'Verification email sent.'
      : 'Email is not configured — use the verification link shown in Veil settings.',
  };
}

export async function confirmPersonalEmailVerification(claimToken) {
  const token = String(claimToken || '').trim();
  if (!token) throw httpError(400, 'Invalid verification link.');

  const pool = getPool();
  const tokenHash = hashVerifyToken(token);
  const result = await pool.query(
    `SELECT id, owner_email, email_verified_at, email_verify_sent_at
     FROM personal_accounts
     WHERE email_verify_token_hash = $1`,
    [tokenHash],
  );

  if (result.rowCount === 0) throw httpError(404, 'This verification link is invalid or expired.');
  const row = result.rows[0];

  if (row.email_verified_at) {
    return { ok: true, alreadyVerified: true, email: row.owner_email };
  }

  const sentAt = row.email_verify_sent_at ? new Date(row.email_verify_sent_at).getTime() : 0;
  const maxAgeMs = 24 * 60 * 60 * 1000;
  if (!sentAt || Date.now() - sentAt > maxAgeMs) {
    throw httpError(410, 'This verification link has expired. Resend verification from Veil settings.');
  }

  await pool.query(
    `UPDATE personal_accounts SET
       email_verified_at = now(),
       email_verify_token_hash = NULL,
       updated_at = now()
     WHERE id = $1`,
    [row.id],
  );

  return { ok: true, email: row.owner_email, verified: true };
}

export async function maybeAutoVerifyForDev(accountId) {
  const env = billingEnv();
  if (String(env.VEIL_PERSONAL_SKIP_EMAIL_VERIFY ?? '').toLowerCase() !== 'true') return false;
  const pool = getPool();
  await pool.query(
    `UPDATE personal_accounts SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now() WHERE id = $1`,
    [accountId],
  );
  return true;
}
