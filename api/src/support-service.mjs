import { randomBytes } from 'node:crypto';
import { getPool } from './db.mjs';
import { httpError } from './org-service.mjs';
import { raiseOpsAlert } from './ops-alerts.mjs';

const TICKET_KINDS = new Set(['feedback', 'bug', 'falsePositive', 'security']);
const TICKET_SOURCES = new Set(['portal', 'extension_popup', 'extension_menu']);
const TICKET_STATUSES = new Set(['new', 'investigating', 'waiting_customer', 'resolved', 'closed']);
const TICKET_PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);
const MAX_MESSAGE = 4000;
const MAX_EMAIL = 254;
const BLOCKED_MESSAGE_RE = /\b(sk_live|sk_test|whsec_|api[_-]?key|password|passphrase|Bearer\s+ey)/i;

function makeTicketRef() {
  const chunk = randomBytes(4).toString('hex').toUpperCase();
  return `VLT-${chunk}`;
}

function sanitizeHost(raw) {
  const host = String(raw || '').trim().toLowerCase().slice(0, 253);
  if (!host || host.includes(' ')) return '';
  return host;
}

function sanitizeDiagnostics(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  const allow = [
    'version', 'browser', 'profile', 'copilot', 'orgName', 'orgId', 'pageUrl', 'pageHost',
    'policyPackId', 'dlpEnabled', 'deviceHint', 'platform', 'locale', 'kind',
  ];
  for (const key of allow) {
    if (raw[key] == null) continue;
    if (typeof raw[key] === 'boolean' || typeof raw[key] === 'number') {
      out[key] = raw[key];
    } else {
      out[key] = String(raw[key]).slice(0, 240);
    }
  }
  return out;
}

function priorityForKind(kind) {
  if (kind === 'security') return 'urgent';
  if (kind === 'bug') return 'high';
  if (kind === 'falsePositive') return 'normal';
  return 'low';
}

function rowToTicket(row) {
  if (!row) return null;
  return {
    ticketRef: row.ticket_ref,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
    kind: row.kind,
    priority: row.priority,
    source: row.source,
    message: row.message,
    contactEmail: row.contact_email,
    orgId: row.org_id || '',
    orgName: row.org_name || '',
    extensionVersion: row.extension_version || '',
    browser: row.browser || '',
    profile: row.profile || '',
    pageHost: row.page_host || '',
    diagnostics: row.diagnostics || {},
    opsNotes: row.ops_notes || '',
    resolutionNotes: row.resolution_notes || '',
    resolvedAt: row.resolved_at,
    assignee: row.assignee || '',
  };
}

async function logTicketOpsEvent(ticket) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO platform_ops_events
      (event_at, kind, code, message, source, extension_version, browser, host, meta)
     VALUES (now(), 'support_ticket', $1, $2, $3, $4, $5, $6, $7)`,
    [
      ticket.ticketRef,
      `${ticket.kind}: ${String(ticket.message || '').slice(0, 180)}`,
      ticket.source,
      ticket.extensionVersion,
      ticket.browser,
      ticket.pageHost,
      JSON.stringify({
        status: ticket.status,
        priority: ticket.priority,
        orgId: ticket.orgId || undefined,
        orgName: ticket.orgName || undefined,
      }),
    ],
  );
}

export async function createSupportTicket(body = {}, env = {}) {
  const kind = String(body.kind || 'feedback').trim();
  if (!TICKET_KINDS.has(kind)) {
    throw httpError(400, 'Invalid ticket kind.');
  }

  const source = String(body.source || 'portal').trim();
  if (!TICKET_SOURCES.has(source)) {
    throw httpError(400, 'Invalid ticket source.');
  }

  const message = String(body.message || '').trim().slice(0, MAX_MESSAGE);
  if (!message && kind !== 'feedback') {
    throw httpError(400, 'Message is required for this ticket type.');
  }
  if (BLOCKED_MESSAGE_RE.test(message)) {
    throw httpError(400, 'Do not paste secrets or credentials — describe the issue in plain language.');
  }

  const contactEmail = String(body.contactEmail || body.email || '').trim().slice(0, MAX_EMAIL);
  const diagnostics = sanitizeDiagnostics(body.diagnostics || body.meta || {});
  const orgId = String(body.orgId || diagnostics.orgId || '').trim().slice(0, 64);
  const orgName = String(body.orgName || diagnostics.orgName || '').trim().slice(0, 120);
  const extensionVersion = String(body.extensionVersion || diagnostics.version || '').slice(0, 24);
  const browser = String(body.browser || diagnostics.browser || '').slice(0, 64);
  const profile = String(body.profile || diagnostics.profile || '').slice(0, 32);
  const pageHost = sanitizeHost(body.pageHost || diagnostics.pageHost || '');

  const pool = getPool();
  let ticketRef = '';
  let row = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    ticketRef = makeTicketRef();
    try {
      const result = await pool.query(
        `INSERT INTO support_tickets
          (ticket_ref, status, kind, priority, source, message, contact_email,
           org_id, org_name, extension_version, browser, profile, page_host, diagnostics)
         VALUES ($1, 'new', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [
          ticketRef,
          kind,
          priorityForKind(kind),
          source,
          message || '(No message provided)',
          contactEmail,
          orgId || null,
          orgName,
          extensionVersion,
          browser,
          profile,
          pageHost,
          JSON.stringify(diagnostics),
        ],
      );
      row = result.rows[0];
      break;
    } catch (error) {
      if (error.code === '23505') continue;
      throw error;
    }
  }

  if (!row) throw httpError(500, 'Could not create ticket.');

  const ticket = rowToTicket(row);
  await logTicketOpsEvent(ticket);

  if (kind === 'security' || kind === 'bug') {
    await raiseOpsAlert({
      key: `support_${ticket.ticketRef}`,
      severity: kind === 'security' ? 'critical' : 'warn',
      title: `New support ticket ${ticket.ticketRef}`,
      body: `${kind} from ${source}${orgName ? ` (${orgName})` : ''}\n${message.slice(0, 500)}`,
      env,
    });
  }

  return { ticketRef: ticket.ticketRef, status: ticket.status, kind: ticket.kind };
}

export async function listSupportTickets({
  status = '',
  kind = '',
  q = '',
  limit = 50,
  offset = 0,
} = {}) {
  const pool = getPool();
  const params = [];
  const where = [];

  if (status && TICKET_STATUSES.has(status)) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  if (kind && TICKET_KINDS.has(kind)) {
    params.push(kind);
    where.push(`kind = $${params.length}`);
  }
  if (q) {
    params.push(`%${String(q).slice(0, 80)}%`);
    const idx = params.length;
    where.push(`(
      ticket_ref ILIKE $${idx}
      OR message ILIKE $${idx}
      OR org_name ILIKE $${idx}
      OR contact_email ILIKE $${idx}
    )`);
  }

  const lim = Math.min(100, Math.max(1, Number(limit) || 50));
  const off = Math.max(0, Number(offset) || 0);
  params.push(lim, off);

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const result = await pool.query(
    `SELECT ticket_ref, created_at, updated_at, status, kind, priority, source,
            LEFT(message, 160) AS message, contact_email, org_id, org_name,
            extension_version, browser, profile, page_host, assignee
     FROM support_tickets
     ${whereSql}
     ORDER BY
       CASE status
         WHEN 'new' THEN 0
         WHEN 'investigating' THEN 1
         WHEN 'waiting_customer' THEN 2
         WHEN 'resolved' THEN 3
         ELSE 4
       END,
       created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  const counts = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM support_tickets
     WHERE created_at >= now() - interval '30 days'
     GROUP BY status`,
  );

  const byStatus = Object.fromEntries(counts.rows.map((r) => [r.status, r.count]));

  return {
    tickets: result.rows.map(rowToTicket),
    counts: byStatus,
    openCount: (byStatus.new || 0) + (byStatus.investigating || 0) + (byStatus.waiting_customer || 0),
  };
}

export async function getSupportTicket(ticketRef) {
  const ref = String(ticketRef || '').trim().toUpperCase();
  if (!/^VLT-[0-9A-F]{8}$/.test(ref)) {
    throw httpError(400, 'Invalid ticket reference.');
  }

  const pool = getPool();
  const result = await pool.query('SELECT * FROM support_tickets WHERE ticket_ref = $1', [ref]);
  const ticket = rowToTicket(result.rows[0]);
  if (!ticket) throw httpError(404, 'Ticket not found.');

  const related = await pool.query(
    `SELECT event_at, kind, code, message, source, extension_version, browser, host
     FROM platform_ops_events
     WHERE event_at >= $2::timestamptz - interval '24 hours'
       AND event_at <= $2::timestamptz + interval '24 hours'
       AND kind <> 'health'
       AND (
         ($3 <> '' AND extension_version = $3)
         OR ($4 <> '' AND host = $4)
         OR (kind = 'support_ticket' AND code = $1)
       )
     ORDER BY event_at DESC
     LIMIT 40`,
    [ref, ticket.createdAt, ticket.extensionVersion, ticket.pageHost],
  );

  return { ticket, relatedEvents: related.rows };
}

export async function updateSupportTicket(ticketRef, patch = {}) {
  const ref = String(ticketRef || '').trim().toUpperCase();
  if (!/^VLT-[0-9A-F]{8}$/.test(ref)) {
    throw httpError(400, 'Invalid ticket reference.');
  }

  const updates = [];
  const params = [ref];

  if (patch.status != null) {
    const status = String(patch.status).trim();
    if (!TICKET_STATUSES.has(status)) throw httpError(400, 'Invalid status.');
    params.push(status);
    updates.push(`status = $${params.length}`);
    if (status === 'resolved' || status === 'closed') {
      updates.push('resolved_at = COALESCE(resolved_at, now())');
    }
  }

  if (patch.priority != null) {
    const priority = String(patch.priority).trim();
    if (!TICKET_PRIORITIES.has(priority)) throw httpError(400, 'Invalid priority.');
    params.push(priority);
    updates.push(`priority = $${params.length}`);
  }

  if (patch.opsNotes != null) {
    params.push(String(patch.opsNotes).slice(0, 8000));
    updates.push(`ops_notes = $${params.length}`);
  }

  if (patch.resolutionNotes != null) {
    params.push(String(patch.resolutionNotes).slice(0, 8000));
    updates.push(`resolution_notes = $${params.length}`);
  }

  if (patch.assignee != null) {
    params.push(String(patch.assignee).slice(0, 120));
    updates.push(`assignee = $${params.length}`);
  }

  if (updates.length === 0) {
    throw httpError(400, 'No valid fields to update.');
  }

  updates.push('updated_at = now()');

  const pool = getPool();
  const result = await pool.query(
    `UPDATE support_tickets SET ${updates.join(', ')} WHERE ticket_ref = $1 RETURNING *`,
    params,
  );
  const ticket = rowToTicket(result.rows[0]);
  if (!ticket) throw httpError(404, 'Ticket not found.');

  await logTicketOpsEvent({
    ...ticket,
    message: `status:${ticket.status}`,
  });

  return { ticket };
}

export async function getSupportTicketStats() {
  const pool = getPool();
  const [open, recent] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS count
       FROM support_tickets
       WHERE status IN ('new', 'investigating', 'waiting_customer')`,
    ),
    pool.query(
      `SELECT ticket_ref, created_at, status, kind, priority, source,
              LEFT(message, 100) AS message, org_name
       FROM support_tickets
       ORDER BY created_at DESC
       LIMIT 8`,
    ),
  ]);

  return {
    openCount: open.rows[0]?.count || 0,
    recentTickets: recent.rows.map(rowToTicket),
  };
}
