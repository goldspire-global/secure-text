-- Veil Plus: included contacts + paid overflow slots

ALTER TABLE personal_accounts
  ADD COLUMN IF NOT EXISTS extra_contact_slots INT NOT NULL DEFAULT 0;
