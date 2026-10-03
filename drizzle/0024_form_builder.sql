ALTER TABLE templates ADD COLUMN kind TEXT NOT NULL DEFAULT 'pdf';
ALTER TABLE templates ADD COLUMN form_draft_json TEXT;
ALTER TABLE templates ADD COLUMN form_revision TEXT NOT NULL DEFAULT '';
ALTER TABLE template_versions ADD COLUMN form_definition_json TEXT;
CREATE TABLE form_response_drafts (
 recipient_link_id TEXT PRIMARY KEY NOT NULL REFERENCES recipient_links(id) ON DELETE CASCADE,
 values_json TEXT NOT NULL DEFAULT '{}', revision TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE form_submission_artifacts (
 submission_id TEXT PRIMARY KEY NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready','failed','not_configured')),
 file_key TEXT, error_code TEXT, checksum TEXT, lease_token TEXT, lease_expires_at TEXT, updated_at TEXT NOT NULL
);
CREATE TABLE form_builder_guards (id TEXT PRIMARY KEY NOT NULL, template_id TEXT NOT NULL, revision TEXT NOT NULL, owner_email TEXT NOT NULL);
CREATE TRIGGER form_builder_revision_guard BEFORE INSERT ON form_builder_guards
WHEN NOT EXISTS(SELECT 1 FROM templates WHERE id=NEW.template_id AND owner_email=NEW.owner_email AND kind='form' AND form_revision=NEW.revision AND archived_at IS NULL)
BEGIN SELECT RAISE(ABORT,'FORM_CHANGED'); END;
CREATE TRIGGER form_builder_guard_cleanup AFTER INSERT ON form_builder_guards
BEGIN DELETE FROM form_builder_guards WHERE id=NEW.id; END;

CREATE TABLE form_response_guards(id TEXT PRIMARY KEY NOT NULL,recipient_link_id TEXT NOT NULL,revision TEXT NOT NULL,assigned_user_id TEXT NOT NULL,version_id TEXT NOT NULL);
CREATE TRIGGER form_response_revision_guard BEFORE INSERT ON form_response_guards
WHEN NOT EXISTS(SELECT 1 FROM recipient_links WHERE id=NEW.recipient_link_id AND assigned_user_id=NEW.assigned_user_id AND template_version_id=NEW.version_id AND status='active' AND submission_count<max_submissions AND (expires_at IS NULL OR expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')))
 OR COALESCE((SELECT revision FROM form_response_drafts WHERE recipient_link_id=NEW.recipient_link_id),'')!=NEW.revision
BEGIN SELECT RAISE(ABORT,'FORM_RESPONSE_CHANGED'); END;
CREATE TRIGGER form_response_guard_cleanup AFTER INSERT ON form_response_guards
BEGIN DELETE FROM form_response_guards WHERE id=NEW.id; END;
