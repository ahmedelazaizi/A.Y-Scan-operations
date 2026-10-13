CREATE TABLE IF NOT EXISTS lab_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  manufacturer TEXT CHECK (manufacturer IS NULL OR char_length(btrim(manufacturer)) BETWEEN 1 AND 200),
  model TEXT CHECK (model IS NULL OR char_length(btrim(model)) BETWEEN 1 AND 200),
  protocol TEXT NOT NULL CHECK (protocol IN ('hl7', 'astm', 'tcp_ip', 'serial')),
  endpoint TEXT NOT NULL CHECK (char_length(btrim(endpoint)) BETWEEN 1 AND 300),
  status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('configured', 'online', 'offline', 'unknown')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lab_devices_status ON lab_devices (status);
CREATE INDEX IF NOT EXISTS idx_lab_devices_protocol ON lab_devices (protocol);
CREATE INDEX IF NOT EXISTS idx_lab_devices_active ON lab_devices (is_active);
