-- Contract prices and approved clinical ranges are immutable records.
CREATE OR REPLACE FUNCTION prevent_phase1_immutable_changes()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'test_catalog'
     AND OLD.contract_price_piastres IS DISTINCT FROM NEW.contract_price_piastres THEN
    RAISE EXCEPTION 'contract_price_piastres is read-only';
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

DROP TRIGGER IF EXISTS trg_test_catalog_contract_price_immutable ON test_catalog;
CREATE TRIGGER trg_test_catalog_contract_price_immutable
BEFORE UPDATE ON test_catalog
FOR EACH ROW EXECUTE FUNCTION prevent_phase1_immutable_changes();

DROP TRIGGER IF EXISTS trg_reference_ranges_approved_immutable ON reference_ranges;
CREATE TRIGGER trg_reference_ranges_approved_immutable
BEFORE UPDATE ON reference_ranges
FOR EACH ROW EXECUTE FUNCTION prevent_phase1_immutable_changes();
