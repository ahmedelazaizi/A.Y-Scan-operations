CREATE TABLE IF NOT EXISTS insurance_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  payer_name TEXT NOT NULL CHECK (char_length(btrim(payer_name)) BETWEEN 1 AND 200),
  member_number TEXT NOT NULL CHECK (char_length(btrim(member_number)) BETWEEN 1 AND 200),
  plan_name TEXT NOT NULL CHECK (char_length(btrim(plan_name)) BETWEEN 1 AND 200),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'suspended')),
  coverage_percent NUMERIC(5, 2) NOT NULL CHECK (coverage_percent BETWEEN 0 AND 100),
  valid_from DATE NOT NULL,
  valid_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (payer_name, member_number),
  CONSTRAINT insurance_policy_valid_dates_check CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE TABLE IF NOT EXISTS insurance_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_number BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  policy_id UUID NOT NULL REFERENCES insurance_policies(id) ON DELETE RESTRICT,
  order_id UUID REFERENCES orders(id) ON DELETE RESTRICT,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'paid')),
  submitted_at TIMESTAMPTZ,
  response_code TEXT CHECK (response_code IS NULL OR char_length(btrim(response_code)) BETWEEN 1 AND 100),
  notes TEXT CHECK (notes IS NULL OR char_length(btrim(notes)) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_insurance_policies_patient_created ON insurance_policies (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_insurance_policies_status_created ON insurance_policies (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_policy_created ON insurance_claims (policy_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_status_created ON insurance_claims (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_order_created ON insurance_claims (order_id, created_at DESC);
