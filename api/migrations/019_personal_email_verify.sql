-- Personal email verification (Plus trusted contacts)

ALTER TABLE personal_accounts
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_verify_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS email_verify_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_personal_accounts_verify_token
  ON personal_accounts (email_verify_token_hash)
  WHERE email_verify_token_hash IS NOT NULL;
