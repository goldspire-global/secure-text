-- Veil Plus — personal accounts, trusted contacts, direct share, magic links

CREATE TABLE IF NOT EXISTS personal_accounts (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  owner_device_id TEXT NOT NULL UNIQUE,
  provision_token TEXT NOT NULL UNIQUE,
  plus_status TEXT NOT NULL DEFAULT 'none',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_personal_accounts_email
  ON personal_accounts (lower(owner_email));

CREATE TABLE IF NOT EXISTS personal_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL REFERENCES personal_accounts(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  public_key_jwk JSONB,
  device_id TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, email)
);

CREATE TABLE IF NOT EXISTS personal_pending_unlocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL REFERENCES personal_accounts(id) ON DELETE CASCADE,
  sender_email TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  wrapped_key JSONB NOT NULL,
  marker_fingerprint TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  unlock_secret_enc TEXT,
  claimed_at TIMESTAMPTZ,
  claimed_by_device_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_personal_pending_recipient
  ON personal_pending_unlocks (account_id, recipient_email, created_at DESC)
  WHERE claimed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_personal_pending_fingerprint
  ON personal_pending_unlocks (marker_fingerprint);

CREATE TABLE IF NOT EXISTS personal_magic_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL REFERENCES personal_accounts(id) ON DELETE CASCADE,
  claim_token_hash TEXT NOT NULL UNIQUE,
  unlock_secret_enc TEXT NOT NULL,
  marker_fingerprint TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
