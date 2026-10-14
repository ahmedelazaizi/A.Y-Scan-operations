CREATE TABLE IF NOT EXISTS trial_license_state (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  installation_id UUID NOT NULL,
  activation_code TEXT,
  records_used INTEGER NOT NULL DEFAULT 0 CHECK (records_used >= 0)
);
INSERT INTO trial_license_state (singleton, installation_id)
VALUES (TRUE, gen_random_uuid())
ON CONFLICT (singleton) DO NOTHING;
