-- Phase 3 specimen-to-order-item association and receiving timestamp.
ALTER TABLE specimens
  ADD COLUMN IF NOT EXISTS order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tube TEXT,
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_specimens_order_item ON specimens(order_item_id);
