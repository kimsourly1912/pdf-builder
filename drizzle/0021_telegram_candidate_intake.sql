CREATE TABLE telegram_connections (
 id TEXT PRIMARY KEY NOT NULL, owner_email TEXT NOT NULL, chat_id TEXT NOT NULL,
 username TEXT NOT NULL DEFAULT '', full_name TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
 stage TEXT NOT NULL DEFAULT 'name' CHECK(stage IN ('name','email','pdf')),
 candidate_id TEXT, confirmed_candidate_id TEXT, confirmed_by TEXT, confirmed_at TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX telegram_connections_owner_chat_unique ON telegram_connections(owner_email,chat_id);
CREATE TABLE telegram_updates (
 id INTEGER PRIMARY KEY NOT NULL, chat_id TEXT NOT NULL, payload_json TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','completed','failed')),
 lock_token TEXT, locked_until TEXT, attempts INTEGER NOT NULL DEFAULT 0, error_message TEXT, created_at TEXT NOT NULL
);
CREATE INDEX telegram_updates_status_idx ON telegram_updates(status,id);
CREATE TABLE telegram_intakes (
 id TEXT PRIMARY KEY NOT NULL, owner_email TEXT NOT NULL, connection_id TEXT NOT NULL REFERENCES telegram_connections(id),
 candidate_id TEXT NOT NULL REFERENCES candidates(id), resume_id TEXT NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
 update_id INTEGER NOT NULL UNIQUE, extraction_status TEXT NOT NULL DEFAULT 'not_extracted' CHECK(extraction_status IN ('not_extracted','processing','extracted','failed')),
 extraction_token TEXT, extraction_until TEXT, created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX telegram_intakes_update_unique ON telegram_intakes(update_id);
CREATE UNIQUE INDEX telegram_intakes_resume_unique ON telegram_intakes(resume_id);
CREATE INDEX telegram_intakes_owner_idx ON telegram_intakes(owner_email,created_at);
CREATE TABLE telegram_deliveries (
 id TEXT PRIMARY KEY NOT NULL, run_id TEXT NOT NULL REFERENCES workflow_runs(id), node_id TEXT NOT NULL, owner_email TEXT NOT NULL,
 chat_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','uncertain')),
 token_cipher TEXT, message_id TEXT, error_message TEXT, next_attempt_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX telegram_deliveries_run_node_unique ON telegram_deliveries(run_id,node_id);
CREATE TABLE account_activations (
 id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE, owner_email TEXT NOT NULL,
 token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX account_activations_hash_unique ON account_activations(token_hash);
CREATE TABLE activation_redemptions (token_hash TEXT NOT NULL, checked_at TEXT NOT NULL);
CREATE TRIGGER account_activation_guard BEFORE INSERT ON activation_redemptions
WHEN NOT EXISTS (
 SELECT 1 FROM account_activations a JOIN user u ON u.id=a.user_id
 JOIN recipient_profiles p ON p.user_id=u.id AND p.created_by_email=a.owner_email
 JOIN account c ON c.user_id=u.id AND c.provider_id='credential'
 WHERE a.token_hash=NEW.token_hash AND a.used_at IS NULL AND a.expires_at>NEW.checked_at
 AND coalesce(u.banned,0)=0 AND p.account_type='candidate' AND p.must_change_password=1
)
BEGIN
 SELECT RAISE(ABORT,'ACTIVATION_UNAVAILABLE');
END;
CREATE TRIGGER account_activation_guard_cleanup AFTER INSERT ON activation_redemptions
BEGIN
 DELETE FROM activation_redemptions WHERE rowid=NEW.rowid;
END;
CREATE TABLE telegram_update_guards (update_id INTEGER NOT NULL, lock_token TEXT NOT NULL, checked_at TEXT NOT NULL);
CREATE TRIGGER telegram_update_lease_guard BEFORE INSERT ON telegram_update_guards
WHEN NOT EXISTS (SELECT 1 FROM telegram_updates WHERE id=NEW.update_id AND status='processing' AND lock_token=NEW.lock_token AND locked_until>NEW.checked_at)
BEGIN
 SELECT RAISE(ABORT,'TELEGRAM_UPDATE_CHANGED');
END;
CREATE TRIGGER telegram_update_guard_cleanup AFTER INSERT ON telegram_update_guards
BEGIN
 DELETE FROM telegram_update_guards WHERE rowid=NEW.rowid;
END;
CREATE TABLE intake_extraction_guards (intake_id TEXT NOT NULL,lock_token TEXT NOT NULL,resume_revision TEXT NOT NULL,candidate_revision TEXT NOT NULL,checked_at TEXT NOT NULL);
CREATE TRIGGER intake_extraction_revision_guard BEFORE INSERT ON intake_extraction_guards
WHEN NOT EXISTS (
 SELECT 1 FROM telegram_intakes i JOIN resumes r ON r.id=i.resume_id AND r.owner_email=i.owner_email
 JOIN candidates c ON c.id=r.candidate_id AND c.owner_email=i.owner_email
 WHERE i.id=NEW.intake_id AND i.extraction_token=NEW.lock_token AND i.extraction_until>NEW.checked_at
 AND r.updated_at=NEW.resume_revision AND c.updated_at=NEW.candidate_revision
)
BEGIN
 SELECT RAISE(ABORT,'INTAKE_EXTRACTION_CHANGED');
END;
CREATE TRIGGER intake_extraction_guard_cleanup AFTER INSERT ON intake_extraction_guards
BEGIN
 DELETE FROM intake_extraction_guards WHERE rowid=NEW.rowid;
END;
