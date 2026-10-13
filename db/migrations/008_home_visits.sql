CREATE TABLE IF NOT EXISTS home_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  order_id UUID REFERENCES orders(id) ON DELETE RESTRICT,
  address TEXT NOT NULL CHECK (char_length(btrim(address)) BETWEEN 1 AND 500),
  contact_phone TEXT NOT NULL CHECK (char_length(btrim(contact_phone)) BETWEEN 1 AND 50),
  scheduled_at TIMESTAMPTZ NOT NULL,
  assigned_to TEXT CHECK (assigned_to IS NULL OR char_length(btrim(assigned_to)) BETWEEN 1 AND 200),
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled')),
  notes TEXT CHECK (notes IS NULL OR char_length(btrim(notes)) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_home_visits_patient ON home_visits (patient_id);
CREATE INDEX IF NOT EXISTS idx_home_visits_status ON home_visits (status);
CREATE INDEX IF NOT EXISTS idx_home_visits_scheduled_at ON home_visits (scheduled_at);
