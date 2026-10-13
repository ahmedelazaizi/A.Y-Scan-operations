CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL UNIQUE CHECK (char_length(btrim(sku)) BETWEEN 1 AND 100),
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  category TEXT NOT NULL CHECK (char_length(btrim(category)) BETWEEN 1 AND 100),
  unit TEXT NOT NULL CHECK (char_length(btrim(unit)) BETWEEN 1 AND 50),
  reorder_level NUMERIC(18, 3) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  quantity NUMERIC(18, 3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('receipt', 'issue', 'adjustment')),
  quantity NUMERIC(18, 3) NOT NULL CHECK (quantity > 0),
  adjustment_direction TEXT,
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
  reference TEXT CHECK (reference IS NULL OR char_length(btrim(reference)) BETWEEN 1 AND 200),
  created_by TEXT NOT NULL CHECK (char_length(btrim(created_by)) BETWEEN 1 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inventory_movement_adjustment_direction_check CHECK (
    (type = 'adjustment' AND adjustment_direction IN ('increase', 'decrease'))
    OR (type IN ('receipt', 'issue') AND adjustment_direction IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_active ON inventory_items (is_active);
CREATE INDEX IF NOT EXISTS idx_inventory_items_category ON inventory_items (category);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_item_created ON inventory_movements (item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_type ON inventory_movements (type);
