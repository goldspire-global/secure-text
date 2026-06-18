-- Veil secure tokens (client-encrypted ciphertext only)

CREATE TABLE IF NOT EXISTS secure_tokens (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  device_id TEXT,
  member_email TEXT,
  ciphertext TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  expires_at TIMESTAMPTZ,
  burn_after_read BOOLEAN NOT NULL DEFAULT false,
  read_count INTEGER NOT NULL DEFAULT 0,
  max_reads INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_secure_tokens_org
  ON secure_tokens(org_id, created_at DESC);
