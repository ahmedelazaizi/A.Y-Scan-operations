CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  invoice_number BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  currency TEXT NOT NULL DEFAULT 'EGP' CHECK (char_length(btrim(currency)) BETWEEN 3 AND 3),
  subtotal NUMERIC(14, 2) NOT NULL CHECK (subtotal >= 0),
  discount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  tax NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (tax >= 0),
  total NUMERIC(14, 2) NOT NULL CHECK (total >= 0),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'issued', 'partially_paid', 'paid', 'void')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  item_index INTEGER NOT NULL CHECK (item_index >= 0),
  description TEXT NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 500),
  quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(14, 2) NOT NULL CHECK (unit_price >= 0),
  line_total NUMERIC(16, 2) GENERATED ALWAYS AS (round(quantity * unit_price, 2)) STORED,
  UNIQUE (invoice_id, item_index)
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL CHECK (method IN ('cash', 'card', 'bank_transfer', 'insurance')),
  reference TEXT CHECK (reference IS NULL OR char_length(btrim(reference)) BETWEEN 1 AND 200),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_by TEXT NOT NULL DEFAULT 'system' CHECK (char_length(btrim(received_by)) BETWEEN 1 AND 200)
);

CREATE INDEX IF NOT EXISTS idx_invoices_order_created ON invoices (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status_created ON invoices (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_index ON invoice_items (invoice_id, item_index);
CREATE INDEX IF NOT EXISTS idx_payments_invoice_paid_at ON payments (invoice_id, paid_at DESC);
