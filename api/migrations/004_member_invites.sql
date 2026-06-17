-- Members can be invited before they register a public key on device.

ALTER TABLE org_members
  ALTER COLUMN public_key_jwk DROP NOT NULL;
