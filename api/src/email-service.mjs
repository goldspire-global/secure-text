/**
 * Transactional email — Brevo (preferred) or Resend when API keys are set.
 */

function parseFromAddress(raw) {
  const value = String(raw || '').trim();
  const match = value.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() };
  }
  return { email: value };
}

async function sendViaBrevo(apiKey, { from, to, subject, html, text, replyTo }) {
  const payload = {
    sender: from,
    to: [{ email: to }],
    subject: String(subject || '').slice(0, 200),
    htmlContent: html || undefined,
    textContent: text || undefined,
  };
  if (replyTo) payload.replyTo = { email: replyTo };

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    return { ok: false, error: `brevo_${response.status}`, detail: body.slice(0, 200) };
  }
  const data = await response.json().catch(() => ({}));
  return { ok: true, id: data.messageId, provider: 'brevo' };
}

async function sendViaResend(apiKey, { from, to, subject, html, text, replyTo }) {
  const fromHeader = from.name ? `${from.name} <${from.email}>` : from.email;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromHeader,
      to: [to],
      subject: String(subject || '').slice(0, 200),
      html: html || undefined,
      text: text || undefined,
      reply_to: replyTo || undefined,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    return { ok: false, error: `resend_${response.status}`, detail: body.slice(0, 200) };
  }
  const data = await response.json().catch(() => ({}));
  return { ok: true, id: data.id, provider: 'resend' };
}

export async function sendEmail(env, { to, subject, html, text, replyTo }) {
  const brevoKey = String(env.BREVO_API_KEY || '').trim();
  const resendKey = String(env.RESEND_API_KEY || '').trim();
  const from = parseFromAddress(env.VEIL_EMAIL_FROM || 'Veil <noreply@goldspireventures.com>');
  const recipient = String(to || '').trim();
  if (!recipient) return { ok: false, error: 'missing_recipient' };
  if (!from.email) return { ok: false, error: 'missing_sender' };

  const message = { from, to: recipient, subject, html, text, replyTo };

  if (brevoKey) return sendViaBrevo(brevoKey, message);
  if (resendKey) return sendViaResend(resendKey, message);

  return { ok: false, skipped: true, reason: 'BREVO_API_KEY or RESEND_API_KEY not configured' };
}

export function isEmailConfigured(env) {
  return Boolean(String(env.BREVO_API_KEY || '').trim())
    || Boolean(String(env.RESEND_API_KEY || '').trim());
}
