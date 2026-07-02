-- Cloud profile sync — preferences and personal passphrase follow the user across browsers.

ALTER TABLE personal_accounts
  ADD COLUMN IF NOT EXISTS passphrase_ciphertext TEXT,
  ADD COLUMN IF NOT EXISTS settings_sync JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE personal_device_provisions
  ADD COLUMN IF NOT EXISTS sync_key_wrap TEXT;

ALTER TABLE org_members
  ADD COLUMN IF NOT EXISTS settings_sync JSONB NOT NULL DEFAULT '{}'::jsonb;
