CREATE TABLE IF NOT EXISTS radiology_studies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accession_number BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  modality TEXT NOT NULL CHECK (modality IN ('xray', 'ct', 'mri', 'ultrasound', 'mammography', 'pet_ct', 'other')),
  body_part TEXT NOT NULL CHECK (char_length(btrim(body_part)) BETWEEN 1 AND 200),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'urgent', 'stat')),
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'in_progress', 'reported', 'verified', 'cancelled')),
  scheduled_at TIMESTAMPTZ,
  performed_at TIMESTAMPTZ,
  report_text TEXT,
  impression TEXT,
  referring_provider TEXT CHECK (referring_provider IS NULL OR char_length(btrim(referring_provider)) BETWEEN 1 AND 200),
  verified_by TEXT CHECK (verified_by IS NULL OR char_length(btrim(verified_by)) BETWEEN 1 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT radiology_report_required CHECK (
    status NOT IN ('reported', 'verified')
    OR (report_text IS NOT NULL AND char_length(btrim(report_text)) > 0
      AND impression IS NOT NULL AND char_length(btrim(impression)) > 0)
  ),
  CONSTRAINT radiology_verification_requires_report CHECK (
    status <> 'verified' OR (report_text IS NOT NULL AND impression IS NOT NULL AND verified_by IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_radiology_studies_status ON radiology_studies (status);
CREATE INDEX IF NOT EXISTS idx_radiology_studies_scheduled_at ON radiology_studies (scheduled_at);
CREATE INDEX IF NOT EXISTS idx_radiology_studies_patient ON radiology_studies (patient_id);
CREATE INDEX IF NOT EXISTS idx_radiology_studies_accession ON radiology_studies (accession_number);
