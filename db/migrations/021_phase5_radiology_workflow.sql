-- Link new radiology studies to a single catalog order item while preserving legacy standalone studies.
ALTER TABLE radiology_studies
  ADD COLUMN IF NOT EXISTS order_item_id UUID REFERENCES order_items(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_radiology_studies_order_item_unique
  ON radiology_studies(order_item_id)
  WHERE order_item_id IS NOT NULL;
