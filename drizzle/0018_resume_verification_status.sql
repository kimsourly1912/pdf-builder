ALTER TABLE resumes ADD COLUMN verification_status text NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'needs_attention', 'verified'));
--> statement-breakpoint
UPDATE resumes SET verification_status = 'needs_attention' WHERE status IN ('needs_attention', 'possible_duplicate', 'failed');
--> statement-breakpoint
UPDATE resumes SET verification_status = 'verified' WHERE EXISTS (
  SELECT 1 FROM candidate_profile_versions
  WHERE candidate_profile_versions.resume_id = resumes.id
    AND candidate_profile_versions.verification_status = 'verified'
    AND candidate_profile_versions.source = 'hr_review'
);
--> statement-breakpoint
CREATE INDEX resumes_owner_verification_updated_idx ON resumes (owner_email, verification_status, updated_at);
