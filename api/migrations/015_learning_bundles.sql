-- Signed learning bundles (global + per-org private)

CREATE TABLE IF NOT EXISTS learning_bundles (
  id SERIAL PRIMARY KEY,
  bundle_version TEXT NOT NULL,
  org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  schema_version SMALLINT NOT NULL DEFAULT 1,
  payload JSONB NOT NULL,
  signature TEXT NOT NULL,
  changelog TEXT NOT NULL DEFAULT '',
  sample_count INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bundle_version, org_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_bundles_active_global
  ON learning_bundles ((org_id IS NULL))
  WHERE active = true AND org_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_bundles_active_org
  ON learning_bundles (org_id)
  WHERE active = true AND org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_learning_bundles_created
  ON learning_bundles (created_at DESC);
