-- Client metadata for connected extension browsers (admin visibility)

ALTER TABLE device_provisions
  ADD COLUMN IF NOT EXISTS extension_version TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS browser TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT '';
