-- Org member directory + pending unlock deliveries (Phase 2)

CREATE TABLE IF NOT EXISTS org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  public_key_jwk JSONB NOT NULL,
  device_id TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, email)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_members_device
  ON org_members(org_id, device_id)
  WHERE device_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS pending_unlocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sender_email TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  wrapped_key JSONB NOT NULL,
  marker_fingerprint TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ,
  claimed_by_device_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_unlocks_recipient
  ON pending_unlocks(org_id, recipient_email, created_at DESC)
  WHERE claimed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pending_unlocks_fingerprint
  ON pending_unlocks(marker_fingerprint);
