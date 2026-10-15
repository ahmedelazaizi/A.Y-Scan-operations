-- Phase 1 allows reference ranges for children as well as adults.
ALTER TABLE reference_ranges
  DROP CONSTRAINT IF EXISTS reference_ranges_age_from_years_check;

ALTER TABLE reference_ranges
  ADD CONSTRAINT reference_ranges_age_from_years_nonnegative
  CHECK (age_from_years >= 0);
