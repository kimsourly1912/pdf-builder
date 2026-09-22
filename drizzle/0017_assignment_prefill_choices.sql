ALTER TABLE form_assignments ADD COLUMN prefill_mode text NOT NULL DEFAULT 'automatic';
ALTER TABLE form_assignments ADD COLUMN available_values_json text NOT NULL DEFAULT '{}';
ALTER TABLE form_assignments ADD COLUMN available_values_meta_json text NOT NULL DEFAULT '{}';
