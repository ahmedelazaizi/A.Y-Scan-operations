-- Phase 2 reception snapshots and pending practitioner commissions.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS practitioner_id UUID REFERENCES practitioners(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS fasting BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS diagnosis TEXT,
  ADD COLUMN IF NOT EXISTS insurance_company TEXT,
  ADD COLUMN IF NOT EXISTS insurance_coverage_piastres BIGINT NOT NULL DEFAULT 0 CHECK (insurance_coverage_piastres >= 0);

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS bundle_id UUID REFERENCES bundles(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  ADD COLUMN IF NOT EXISTS unit_price_piastres BIGINT CHECK (unit_price_piastres >= 0);

CREATE TABLE IF NOT EXISTS practitioner_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  practitioner_id UUID NOT NULL REFERENCES practitioners(id) ON DELETE RESTRICT,
  amount_piastres BIGINT NOT NULL CHECK (amount_piastres >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status = 'pending'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_reception_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commissions_practitioner_pending ON practitioner_commissions(practitioner_id, status);
