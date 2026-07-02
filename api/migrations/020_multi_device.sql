-- Multi-device identity: one member/account across Chrome, Edge, and other browsers.

-- Org: link many browser installs to one member email.
CREATE TABLE IF NOT EXISTS org_member_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES org_members(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  public_key_jwk JSONB,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, device_id),
  UNIQUE (member_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_org_member_devices_member
  ON org_member_devices (member_id)
  WHERE active = true;

INSERT INTO org_member_devices (org_id, member_id, device_id, public_key_jwk, active)
SELECT om.org_id, om.id, om.device_id, om.public_key_jwk, om.active
FROM org_members om
WHERE om.device_id IS NOT NULL
ON CONFLICT (org_id, device_id) DO NOTHING;

DROP INDEX IF EXISTS idx_org_members_device;

-- Personal: many browser installs share one Veil Plus account (keyed by verified email).
CREATE TABLE IF NOT EXISTS personal_device_provisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL REFERENCES personal_accounts(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  provision_token TEXT NOT NULL UNIQUE,
  public_key_jwk JSONB,
  client_browser TEXT,
  client_platform TEXT,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_personal_device_provisions_device
  ON personal_device_provisions (device_id)
  WHERE revoked_at IS NULL;

INSERT INTO personal_device_provisions (account_id, device_id, provision_token)
SELECT id, owner_device_id, provision_token
FROM personal_accounts
ON CONFLICT (account_id, device_id) DO NOTHING;

-- Merge duplicate personal accounts that share the same email (legacy per-device rows).
WITH ranked AS (
  SELECT id,
         lower(owner_email) AS email_key,
         ROW_NUMBER() OVER (PARTITION BY lower(owner_email) ORDER BY created_at ASC, id ASC) AS rn
  FROM personal_accounts
),
dupes AS (
  SELECT id AS dupe_id, email_key
  FROM ranked
  WHERE rn > 1
),
canonical AS (
  SELECT r.email_key, r.id AS canonical_id
  FROM ranked r
  WHERE r.rn = 1
)
UPDATE personal_device_provisions pdp
SET account_id = c.canonical_id,
    updated_at = now()
FROM dupes d
JOIN canonical c ON c.email_key = d.email_key
WHERE pdp.account_id = d.dupe_id;

DELETE FROM personal_accounts pa
USING (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY lower(owner_email) ORDER BY created_at ASC, id ASC) AS rn
    FROM personal_accounts
  ) ranked
  WHERE rn > 1
) dupes
WHERE pa.id = dupes.id;

ALTER TABLE personal_accounts DROP CONSTRAINT IF EXISTS personal_accounts_owner_device_id_key;
ALTER TABLE personal_accounts DROP COLUMN IF EXISTS owner_device_id;
ALTER TABLE personal_accounts DROP COLUMN IF EXISTS provision_token;

CREATE UNIQUE INDEX IF NOT EXISTS idx_personal_accounts_email_unique
  ON personal_accounts (lower(owner_email));
