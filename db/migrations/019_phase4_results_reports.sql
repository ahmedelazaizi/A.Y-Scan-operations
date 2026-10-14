-- Phase 4 result provenance, amendments, report release snapshots, and public authenticity tokens.
ALTER TABLE lab_results
  ADD COLUMN IF NOT EXISTS entered_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  ADD COLUMN IF NOT EXISTS amendment_reason TEXT,
  ADD COLUMN IF NOT EXISTS supersedes_result_id UUID REFERENCES lab_results(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS released_snapshot_id UUID;

CREATE INDEX IF NOT EXISTS idx_lab_results_entered_actor ON lab_results(entered_by_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_reviewed_actor ON lab_results(reviewed_by_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_supersedes ON lab_results(supersedes_result_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lab_results_single_amendment_child ON lab_results(supersedes_result_id) WHERE supersedes_result_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS report_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version > 0),
  verification_token TEXT NOT NULL UNIQUE CHECK (verification_token ~ '^[A-Za-z0-9_-]{32,}$'),
  released_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  released_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  content_snapshot JSONB NOT NULL CHECK (jsonb_typeof(content_snapshot) = 'object'),
  settings_snapshot JSONB NOT NULL CHECK (jsonb_typeof(settings_snapshot) = 'object'),
  UNIQUE (order_id, version)
);
ALTER TABLE lab_results ADD CONSTRAINT lab_results_released_snapshot_fk
  FOREIGN KEY (released_snapshot_id) REFERENCES report_releases(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_report_releases_order_version ON report_releases(order_id, version DESC);

CREATE OR REPLACE FUNCTION prevent_report_release_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'report release snapshots are immutable';
END;
$$;
CREATE TRIGGER trg_report_releases_immutable
BEFORE UPDATE OR DELETE ON report_releases
FOR EACH ROW EXECUTE FUNCTION prevent_report_release_mutation();
