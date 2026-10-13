CREATE TABLE IF NOT EXISTS specimens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  barcode TEXT NOT NULL UNIQUE CHECK (char_length(btrim(barcode)) BETWEEN 1 AND 100),
  specimen_type TEXT NOT NULL CHECK (char_length(btrim(specimen_type)) BETWEEN 1 AND 100),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'collected', 'received', 'processing', 'rejected', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  collected_at TIMESTAMPTZ,
  rejected_reason TEXT CHECK (rejected_reason IS NULL OR char_length(btrim(rejected_reason)) BETWEEN 1 AND 500)
);

CREATE TABLE IF NOT EXISTS lab_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  result_value TEXT NOT NULL CHECK (char_length(btrim(result_value)) BETWEEN 1 AND 2000),
  unit TEXT CHECK (unit IS NULL OR char_length(btrim(unit)) BETWEEN 1 AND 100),
  reference_range TEXT CHECK (reference_range IS NULL OR char_length(btrim(reference_range)) BETWEEN 1 AND 200),
  flag TEXT NOT NULL DEFAULT 'normal'
    CHECK (flag IN ('normal', 'low', 'high', 'critical', 'not_applicable')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_review', 'approved', 'released', 'amended')),
  entered_by TEXT NOT NULL DEFAULT 'system' CHECK (char_length(btrim(entered_by)) BETWEEN 1 AND 200),
  reviewed_by TEXT CHECK (reviewed_by IS NULL OR char_length(btrim(reviewed_by)) BETWEEN 1 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_specimens_order_status ON specimens (order_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_specimens_status_created ON specimens (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lab_results_order_item_status ON lab_results (order_item_id, status, created_at DESC);

