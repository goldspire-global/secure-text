-- Platform operations telemetry (metadata only — no secrets or matched content)

CREATE TABLE IF NOT EXISTS platform_ops_events (
  id BIGSERIAL PRIMARY KEY,
  event_at TIMESTAMPTZ NOT NULL,
  kind TEXT NOT NULL,
  code TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  extension_version TEXT NOT NULL DEFAULT '',
  browser TEXT NOT NULL DEFAULT '',
  host TEXT NOT NULL DEFAULT '',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_ops_events_at
  ON platform_ops_events(event_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_ops_events_kind_at
  ON platform_ops_events(kind, event_at DESC);

CREATE TABLE IF NOT EXISTS platform_health_checks (
  id BIGSERIAL PRIMARY KEY,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ok BOOLEAN NOT NULL,
  db_ok BOOLEAN NOT NULL DEFAULT false,
  version TEXT NOT NULL DEFAULT '',
  uptime_sec INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_platform_health_checks_at
  ON platform_health_checks(checked_at DESC);
