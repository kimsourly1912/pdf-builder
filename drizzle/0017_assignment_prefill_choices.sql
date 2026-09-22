ALTER TABLE form_assignments ADD COLUMN prefill_mode text NOT NULL DEFAULT 'automatic' CHECK (prefill_mode IN ('suggested', 'automatic', 'none'));
ALTER TABLE form_assignments ADD COLUMN available_values_json text NOT NULL DEFAULT '{}';
ALTER TABLE form_assignments ADD COLUMN available_values_meta_json text NOT NULL DEFAULT '{}';
ALTER TABLE form_assignments ADD COLUMN assignment_request_key text;
ALTER TABLE form_assignments ADD COLUMN assignment_request_fingerprint text;
CREATE UNIQUE INDEX form_assignments_user_request_key_unique
  ON form_assignments (user_id, assignment_request_key)
  WHERE assignment_request_key IS NOT NULL;
