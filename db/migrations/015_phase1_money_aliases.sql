-- Explicit money names for Phase 1. Legacy test_catalog.price remains NUMERIC for old APIs and invoices.
ALTER TABLE test_catalog
  ADD COLUMN IF NOT EXISTS contract_price BIGINT CHECK (contract_price >= 0),
  ADD COLUMN IF NOT EXISTS insurance_price BIGINT CHECK (insurance_price >= 0);

UPDATE test_catalog
SET contract_price = COALESCE(contract_price, contract_price_piastres),
    insurance_price = COALESCE(insurance_price, insurance_price_piastres)
WHERE contract_price IS NULL OR (insurance_price IS NULL AND insurance_price_piastres IS NOT NULL);

CREATE OR REPLACE FUNCTION prevent_phase1_immutable_changes()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'test_catalog'
     AND (OLD.contract_price_piastres IS DISTINCT FROM NEW.contract_price_piastres
       OR OLD.contract_price IS DISTINCT FROM NEW.contract_price) THEN
    RAISE EXCEPTION 'contract price is read-only';
  END IF;
  IF TG_TABLE_NAME = 'reference_ranges' AND OLD.status = 'approved' THEN
    IF NEW.status <> 'stopped' OR ROW(OLD.parameter_id, OLD.version, OLD.result_type, OLD.sex, OLD.age_from_years,
      OLD.age_to_years, OLD.low, OLD.high, OLD.critical_low, OLD.critical_high, OLD.normal_text, OLD.text_value,
      OLD.specimen, OLD.tube, OLD.note, OLD.source_metadata)
      IS DISTINCT FROM ROW(NEW.parameter_id, NEW.version, NEW.result_type, NEW.sex, NEW.age_from_years,
      NEW.age_to_years, NEW.low, NEW.high, NEW.critical_low, NEW.critical_high, NEW.normal_text, NEW.text_value,
      NEW.specimen, NEW.tube, NEW.note, NEW.source_metadata) THEN
      RAISE EXCEPTION 'approved reference ranges are immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
