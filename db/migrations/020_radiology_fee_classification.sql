ALTER TABLE test_catalog
  ADD COLUMN IF NOT EXISTS is_fee BOOLEAN NOT NULL DEFAULT false;

UPDATE test_catalog
SET is_fee = true
WHERE code = 'RAD-300';
