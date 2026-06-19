-- Customer support tickets (metadata + user message — no secrets)

CREATE TABLE IF NOT EXISTS support_tickets (
  id BIGSERIAL PRIMARY KEY,
  ticket_ref TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'new',
  kind TEXT NOT NULL DEFAULT 'feedback',
  priority TEXT NOT NULL DEFAULT 'normal',
  source TEXT NOT NULL DEFAULT 'portal',
  message TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  org_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  org_name TEXT NOT NULL DEFAULT '',
  extension_version TEXT NOT NULL DEFAULT '',
  browser TEXT NOT NULL DEFAULT '',
  profile TEXT NOT NULL DEFAULT '',
  page_host TEXT NOT NULL DEFAULT '',
  diagnostics JSONB NOT NULL DEFAULT '{}'::jsonb,
  ops_notes TEXT NOT NULL DEFAULT '',
  resolution_notes TEXT NOT NULL DEFAULT '',
  resolved_at TIMESTAMPTZ,
  assignee TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status_created
  ON support_tickets(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_ref
  ON support_tickets(ticket_ref);

CREATE INDEX IF NOT EXISTS idx_support_tickets_kind_created
  ON support_tickets(kind, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_org
  ON support_tickets(org_id)
  WHERE org_id IS NOT NULL;
