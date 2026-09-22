-- Calls belong to a team; a portfolio holding is optional.
-- Backward compatible: existing reads/inserts keep working before and after this migration.
-- Apply before creating non-portfolio calls. No holding or call data is changed.
ALTER TABLE sell_side_calls ALTER COLUMN holding_id DROP NOT NULL;
