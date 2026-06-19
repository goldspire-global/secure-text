-- Learning train run log (automation audit + ops visibility)

CREATE TABLE IF NOT EXISTS learning_train_runs (
  id BIGSERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  trigger_reason TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'running',
  bundle_version TEXT,
  sample_count INT,
  result JSONB,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_learning_train_runs_started
  ON learning_train_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_learning_train_runs_status
  ON learning_train_runs (status, started_at DESC);
