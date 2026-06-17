-- Cloud org provisioning schema for Goldspire Secure Text extension

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  team_passphrase TEXT NOT NULL,
  policy_version INTEGER NOT NULL DEFAULT 1,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS join_codes (
  code TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS device_provisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  provision_token TEXT NOT NULL UNIQUE,
  policy_version INTEGER NOT NULL DEFAULT 0,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_device_provisions_token ON device_provisions(provision_token);
CREATE INDEX IF NOT EXISTS idx_device_provisions_device ON device_provisions(device_id);
CREATE INDEX IF NOT EXISTS idx_join_codes_org ON join_codes(org_id);
