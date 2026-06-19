-- Structured context features for offline learning / rule tuning (no matched content)

ALTER TABLE security_events
  ADD COLUMN IF NOT EXISTS features JSONB NOT NULL DEFAULT '{}';

ALTER TABLE security_events
  ADD COLUMN IF NOT EXISTS outcome TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_security_events_features
  ON security_events USING GIN (features);

CREATE INDEX IF NOT EXISTS idx_security_events_decisions
  ON security_events (org_id, event_at DESC)
  WHERE event_type = 'decision';
