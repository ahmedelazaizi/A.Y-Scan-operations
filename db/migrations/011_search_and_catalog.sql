-- Patient search uses ILIKE '%term%'; trigram indexes make that indexable (the old tsvector index was never used).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_patients_name_trgm ON patients USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_patients_phone_trgm ON patients USING gin (phone gin_trgm_ops) WHERE phone IS NOT NULL;
DROP INDEX IF EXISTS idx_patients_name;

-- Unfiltered list endpoints order by recency.
CREATE INDEX IF NOT EXISTS idx_specimens_created ON specimens (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lab_results_created ON lab_results (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_created ON invoices (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_radiology_studies_created ON radiology_studies (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders (created_at DESC);

-- Orders now reference catalog tests by id; free-text tests no longer create catalog rows.
-- Common tests are seeded INACTIVE with price 0: the center sets its own prices, then activates them.
INSERT INTO test_catalog (code, name, specimen_type, price, is_active) VALUES
  ('CBC', 'صورة دم كاملة (CBC)', 'دم كامل (EDTA)', 0, false),
  ('HBA1C', 'السكر التراكمي (HbA1c)', 'دم كامل (EDTA)', 0, false),
  ('FBS', 'سكر صائم', 'مصل', 0, false),
  ('RBS', 'سكر عشوائي', 'مصل', 0, false),
  ('LIPID', 'دهون الدم (Lipid Profile)', 'مصل', 0, false),
  ('LFT', 'وظائف الكبد', 'مصل', 0, false),
  ('KFT', 'وظائف الكلى', 'مصل', 0, false),
  ('TSH', 'هرمون الغدة الدرقية (TSH)', 'مصل', 0, false),
  ('FT4', 'هرمون T4 الحر', 'مصل', 0, false),
  ('CRP', 'بروتين سي التفاعلي (CRP)', 'مصل', 0, false),
  ('ESR', 'سرعة الترسيب (ESR)', 'دم كامل (سترات)', 0, false),
  ('UA', 'تحليل بول كامل', 'بول', 0, false),
  ('SA', 'تحليل براز', 'براز', 0, false),
  ('VITD', 'فيتامين د', 'مصل', 0, false),
  ('FERR', 'مخزون الحديد (Ferritin)', 'مصل', 0, false),
  ('PT_INR', 'سيولة الدم (PT/INR)', 'بلازما (سترات)', 0, false),
  ('ABO_RH', 'فصيلة الدم', 'دم كامل (EDTA)', 0, false),
  ('HCV_AB', 'فيروس سي (HCV Ab)', 'مصل', 0, false),
  ('HBSAG', 'فيروس بي (HBsAg)', 'مصل', 0, false),
  ('URIC', 'حمض اليوريك', 'مصل', 0, false)
ON CONFLICT (code) DO NOTHING;
