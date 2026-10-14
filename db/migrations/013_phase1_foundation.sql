-- Phase 1 foundation. Existing legacy money columns remain untouched for invoice/API compatibility.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'branch_manager', 'receptionist', 'lab_technician', 'radiologist', 'accountant', 'lab_consultant'));

ALTER TABLE test_catalog
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'lab' CHECK (kind IN ('lab', 'radiology')),
  ADD COLUMN IF NOT EXISTS section_en TEXT,
  ADD COLUMN IF NOT EXISTS section_ar TEXT,
  ADD COLUMN IF NOT EXISTS name_en TEXT,
  ADD COLUMN IF NOT EXISTS contract_price_piastres BIGINT CHECK (contract_price_piastres >= 0),
  ADD COLUMN IF NOT EXISTS price_piastres BIGINT CHECK (price_piastres >= 0),
  ADD COLUMN IF NOT EXISTS insurance_price_piastres BIGINT CHECK (insurance_price_piastres >= 0),
  ADD COLUMN IF NOT EXISTS tube TEXT,
  ADD COLUMN IF NOT EXISTS result_type TEXT NOT NULL DEFAULT 'qualitative' CHECK (result_type IN ('numeric', 'qualitative', 'text')),
  ADD COLUMN IF NOT EXISTS source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS requires_review BOOLEAN NOT NULL DEFAULT false;

UPDATE test_catalog
SET contract_price_piastres = COALESCE(contract_price_piastres, ROUND(price * 100)::BIGINT),
    price_piastres = COALESCE(price_piastres, ROUND(price * 100)::BIGINT)
WHERE contract_price_piastres IS NULL OR price_piastres IS NULL;

CREATE TABLE IF NOT EXISTS lab_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name_ar TEXT NOT NULL DEFAULT 'معمل A.Y Scan',
  name_en TEXT NOT NULL DEFAULT 'A.Y Scan Laboratory',
  license_number TEXT,
  phone TEXT,
  address_ar TEXT,
  address_en TEXT,
  currency_code TEXT NOT NULL DEFAULT 'EGP' CHECK (char_length(currency_code) = 3),
  report_footer_ar TEXT,
  report_footer_en TEXT,
  logo_path TEXT,
  seal_path TEXT,
  signature_path TEXT,
  logo_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  seal_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  signature_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO lab_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS practitioners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar TEXT NOT NULL CHECK (char_length(btrim(name_ar)) BETWEEN 1 AND 200),
  name_en TEXT,
  specialty TEXT,
  phone TEXT,
  commission_type TEXT NOT NULL DEFAULT 'percentage' CHECK (commission_type IN ('percentage', 'fixed')),
  commission_percent NUMERIC(5,2) CHECK (commission_percent >= 0 AND commission_percent <= 100),
  commission_amount_piastres BIGINT CHECK (commission_amount_piastres >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((commission_type = 'percentage' AND commission_percent IS NOT NULL AND commission_amount_piastres IS NULL)
      OR (commission_type = 'fixed' AND commission_percent IS NULL AND commission_amount_piastres IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{1,63}$'),
  name_ar TEXT NOT NULL CHECK (char_length(btrim(name_ar)) BETWEEN 1 AND 200),
  name_en TEXT,
  price_piastres BIGINT NOT NULL CHECK (price_piastres >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS bundle_items (
  bundle_id UUID NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
  test_catalog_id UUID NOT NULL REFERENCES test_catalog(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  PRIMARY KEY (bundle_id, test_catalog_id)
);

CREATE TABLE IF NOT EXISTS test_parameters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_catalog_id UUID NOT NULL REFERENCES test_catalog(id) ON DELETE CASCADE,
  code TEXT NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{0,63}$'),
  name_ar TEXT NOT NULL CHECK (char_length(btrim(name_ar)) BETWEEN 1 AND 200),
  name_en TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  result_type TEXT NOT NULL CHECK (result_type IN ('numeric', 'qualitative', 'text')),
  unit TEXT,
  specimen TEXT,
  tube TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (test_catalog_id, code)
);

CREATE TABLE IF NOT EXISTS reference_ranges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parameter_id UUID NOT NULL REFERENCES test_parameters(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  result_type TEXT NOT NULL CHECK (result_type IN ('numeric', 'qualitative', 'text')),
  sex TEXT NOT NULL DEFAULT 'all' CHECK (sex IN ('all', 'male', 'female')),
  age_from_years INTEGER NOT NULL DEFAULT 18 CHECK (age_from_years >= 18),
  age_to_years INTEGER CHECK (age_to_years IS NULL OR age_to_years >= age_from_years),
  low NUMERIC,
  high NUMERIC,
  critical_low NUMERIC,
  critical_high NUMERIC,
  normal_text TEXT,
  text_value TEXT,
  specimen TEXT,
  tube TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'stopped')),
  proposed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
  approved_at TIMESTAMPTZ,
  source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (parameter_id, sex, age_from_years, age_to_years, version),
  CHECK (result_type <> 'numeric' OR (low IS NOT NULL OR high IS NOT NULL OR critical_low IS NOT NULL OR critical_high IS NOT NULL)),
  CHECK (status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_catalog_id UUID NOT NULL REFERENCES test_catalog(id) ON DELETE RESTRICT,
  old_price_piastres BIGINT NOT NULL CHECK (old_price_piastres >= 0),
  new_price_piastres BIGINT NOT NULL CHECK (new_price_piastres >= 0),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (char_length(btrim(source)) BETWEEN 1 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS phase1_seed_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  price_rows_seen INTEGER NOT NULL CHECK (price_rows_seen >= 0),
  price_rows_inserted INTEGER NOT NULL CHECK (price_rows_inserted >= 0),
  price_rows_existing INTEGER NOT NULL CHECK (price_rows_existing >= 0),
  review_rows INTEGER NOT NULL CHECK (review_rows >= 0),
  range_rows_seen INTEGER NOT NULL CHECK (range_rows_seen >= 0),
  range_rows_inserted INTEGER NOT NULL CHECK (range_rows_inserted >= 0),
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  imported_by UUID REFERENCES users(id) ON DELETE SET NULL
);

ALTER TABLE lab_results
  ADD COLUMN IF NOT EXISTS parameter_id UUID REFERENCES test_parameters(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS reference_range_snapshot JSONB;

CREATE INDEX IF NOT EXISTS idx_test_catalog_kind_section ON test_catalog (kind, section_ar, is_active);
CREATE INDEX IF NOT EXISTS idx_test_catalog_review ON test_catalog (requires_review, is_active);
CREATE INDEX IF NOT EXISTS idx_parameters_catalog_sort ON test_parameters (test_catalog_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_reference_ranges_lookup ON reference_ranges (parameter_id, sex, age_from_years, status);
CREATE INDEX IF NOT EXISTS idx_price_history_catalog_created ON price_history (test_catalog_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_phase1_seed_imports_imported ON phase1_seed_imports (imported_at DESC);
