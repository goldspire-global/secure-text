-- Veil learning platform — review queue, proposals, personal telemetry, runtime hints

CREATE TABLE IF NOT EXISTS platform_decision_events (
  id BIGSERIAL PRIMARY KEY,
  event_at TIMESTAMPTZ NOT NULL,
  device_hash TEXT NOT NULL DEFAULT '',
  extension_version TEXT NOT NULL DEFAULT '',
  browser TEXT NOT NULL DEFAULT '',
  profile TEXT NOT NULL DEFAULT 'personal',
  event_type TEXT NOT NULL DEFAULT 'decision',
  category TEXT NOT NULL DEFAULT '',
  severity TEXT NOT NULL DEFAULT '',
  host TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  confidence SMALLINT NOT NULL DEFAULT 0,
  outcome TEXT NOT NULL DEFAULT '',
  features JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_decisions_at
  ON platform_decision_events (event_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_decisions_bucket
  ON platform_decision_events (host, category, event_at DESC);

CREATE TABLE IF NOT EXISTS learning_review_queue (
  id BIGSERIAL PRIMARY KEY,
  bucket_key TEXT NOT NULL UNIQUE,
  host TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  intent TEXT NOT NULL DEFAULT '',
  field_semantic TEXT NOT NULL DEFAULT '',
  prompts INT NOT NULL DEFAULT 0,
  overrides INT NOT NULL DEFAULT 0,
  agrees INT NOT NULL DEFAULT 0,
  dismissals INT NOT NULL DEFAULT 0,
  override_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
  ticket_count INT NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'open',
  evidence JSONB NOT NULL DEFAULT '{}',
  first_seen TIMESTAMPTZ,
  last_seen TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_learning_queue_status
  ON learning_review_queue (status, override_pct DESC);

CREATE TABLE IF NOT EXISTS learning_proposals (
  id BIGSERIAL PRIMARY KEY,
  proposal_ref TEXT NOT NULL UNIQUE,
  queue_id BIGINT REFERENCES learning_review_queue(id) ON DELETE SET NULL,
  proposal_type TEXT NOT NULL DEFAULT 'confidence_adjust',
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'normal',
  title TEXT NOT NULL DEFAULT '',
  rationale TEXT NOT NULL DEFAULT '',
  suggested_patch JSONB NOT NULL DEFAULT '{}',
  evidence JSONB NOT NULL DEFAULT '{}',
  reviewer TEXT NOT NULL DEFAULT '',
  review_notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_learning_proposals_status
  ON learning_proposals (status, created_at DESC);

CREATE TABLE IF NOT EXISTS platform_learning_hints (
  id SERIAL PRIMARY KEY,
  hint_key TEXT NOT NULL UNIQUE,
  host_pattern TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  field_semantic TEXT NOT NULL DEFAULT '',
  intent TEXT NOT NULL DEFAULT '',
  adjust_confidence SMALLINT NOT NULL DEFAULT 0,
  suppress BOOLEAN NOT NULL DEFAULT false,
  source_proposal_id BIGINT REFERENCES learning_proposals(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  shipped_in_version TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_learning_hints_active
  ON platform_learning_hints (active) WHERE active = true;
