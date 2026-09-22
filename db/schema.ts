import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const user = sqliteTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: integer("email_verified", { mode: "boolean" })
      .notNull()
      .default(false),
    image: text("image"),
    role: text("role").notNull().default("user"),
    banned: integer("banned", { mode: "boolean" }).notNull().default(false),
    banReason: text("ban_reason"),
    banExpires: integer("ban_expires", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [uniqueIndex("user_email_unique").on(table.email)],
);

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    token: text("token").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    impersonatedBy: text("impersonated_by"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("session_token_unique").on(table.token),
    index("session_user_id_idx").on(table.userId),
  ],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp",
    }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("account_user_id_idx").on(table.userId),
    uniqueIndex("account_provider_account_unique").on(
      table.providerId,
      table.accountId,
    ),
  ],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const templates = sqliteTable(
  "templates",
  {
    id: text("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    fileKey: text("file_key").notNull(),
    fileName: text("file_name").notNull(),
    annotationsJson: text("annotations_json").notNull(),
    pageOrderJson: text("page_order_json").notNull(),
    currentVersionId: text("current_version_id").notNull(),
    archivedAt: text("archived_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("templates_owner_updated_idx").on(
      table.ownerEmail,
      table.updatedAt,
    ),
    index("templates_owner_archived_updated_idx").on(
      table.ownerEmail,
      table.archivedAt,
      table.updatedAt,
    ),
  ],
);

export const templateVersions = sqliteTable(
  "template_versions",
  {
    id: text("id").primaryKey(),
    templateId: text("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    fileKey: text("file_key").notNull(),
    fileName: text("file_name").notNull(),
    annotationsJson: text("annotations_json").notNull(),
    pageOrderJson: text("page_order_json").notNull(),
    rolesJson: text("roles_json").notNull().default("[]"),
    publishedAt: text("published_at").notNull(),
  },
  (table) => [
    uniqueIndex("template_versions_template_number_unique").on(
      table.templateId,
      table.versionNumber,
    ),
    index("template_versions_template_idx").on(table.templateId),
  ],
);

export const recipientLinks = sqliteTable(
  "recipient_links",
  {
    id: text("id").primaryKey(),
    templateId: text("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    templateVersionId: text("template_version_id")
      .notNull()
      .references(() => templateVersions.id, { onDelete: "restrict" }),
    roleId: text("role_id").notNull(),
    roleName: text("role_name").notNull(),
    roleColor: text("role_color").notNull(),
    assignedUserId: text("assigned_user_id").references(() => user.id, {
      onDelete: "cascade",
    }),
    tokenHash: text("token_hash").notNull(),
    status: text("status").notNull().default("active"),
    expiresAt: text("expires_at"),
    maxSubmissions: integer("max_submissions").notNull().default(1),
    submissionCount: integer("submission_count").notNull().default(0),
    revokedAt: text("revoked_at"),
    completedAt: text("completed_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("recipient_links_token_hash_unique").on(table.tokenHash),
    uniqueIndex("recipient_links_template_role_public_unique")
      .on(table.templateId, table.roleId)
      .where(sql`${table.assignedUserId} IS NULL`),
    index("recipient_links_template_idx").on(table.templateId),
    index("recipient_links_template_assignee_idx").on(
      table.templateId,
      table.assignedUserId,
    ),
    index("recipient_links_assigned_user_idx").on(table.assignedUserId),
  ],
);

export const recipientProfiles = sqliteTable(
  "recipient_profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    accountType: text("account_type").notNull(),
    mustChangePassword: integer("must_change_password", { mode: "boolean" })
      .notNull()
      .default(true),
    createdByEmail: text("created_by_email").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("recipient_profiles_type_idx").on(table.accountType),
    index("recipient_profiles_creator_created_idx").on(
      table.createdByEmail,
      table.createdAt,
    ),
  ],
);

export const formAssignments = sqliteTable(
  "form_assignments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    templateId: text("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    templateVersionId: text("template_version_id")
      .notNull()
      .references(() => templateVersions.id, { onDelete: "restrict" }),
    recipientLinkId: text("recipient_link_id")
      .notNull()
      .references(() => recipientLinks.id, { onDelete: "restrict" }),
    roleId: text("role_id").notNull(),
    roleName: text("role_name").notNull(),
    roleColor: text("role_color").notNull(),
    initialValuesJson: text("initial_values_json").notNull().default("{}"),
    candidateProfileVersionId: text("candidate_profile_version_id"),
    initialValuesMetaJson: text("initial_values_meta_json").notNull().default("{}"),
    prefillMode: text("prefill_mode").notNull().default("automatic"),
    availableValuesJson: text("available_values_json").notNull().default("{}"),
    availableValuesMetaJson: text("available_values_meta_json").notNull().default("{}"),
    assignmentRequestKey: text("assignment_request_key"),
    assignmentRequestFingerprint: text("assignment_request_fingerprint"),
    status: text("status").notNull().default("assigned"),
    assignedAt: text("assigned_at").notNull(),
    completedAt: text("completed_at"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("form_assignments_link_unique").on(table.recipientLinkId),
    uniqueIndex("form_assignments_user_version_role_unique").on(
      table.userId,
      table.templateVersionId,
      table.roleId,
    ),
    index("form_assignments_user_status_idx").on(table.userId, table.status),
    index("form_assignments_user_assigned_idx").on(
      table.userId,
      table.assignedAt,
    ),
    index("form_assignments_template_idx").on(table.templateId),
    uniqueIndex("form_assignments_user_request_key_unique")
      .on(table.userId, table.assignmentRequestKey)
      .where(sql`${table.assignmentRequestKey} IS NOT NULL`),
    check(
      "form_assignments_prefill_mode_check",
      sql`${table.prefillMode} IN ('suggested', 'automatic', 'none')`,
    ),
  ],
);

export const candidates = sqliteTable(
  "candidates",
  {
    id: text("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    fullName: text("full_name").notNull().default(""),
    firstName: text("first_name").notNull().default(""),
    lastName: text("last_name").notNull().default(""),
    email: text("email").notNull().default(""),
    normalizedEmail: text("normalized_email").notNull().default(""),
    phone: text("phone").notNull().default(""),
    normalizedPhone: text("normalized_phone").notNull().default(""),
    address: text("address").notNull().default(""),
    dateOfBirth: text("date_of_birth"),
    gender: text("gender").notNull().default(""),
    nationality: text("nationality").notNull().default(""),
    currentTitle: text("current_title").notNull().default(""),
    professionalSummary: text("professional_summary").notNull().default(""),
    skillsJson: text("skills_json").notNull().default("[]"),
    workExperienceJson: text("work_experience_json").notNull().default("[]"),
    educationJson: text("education_json").notNull().default("[]"),
    certificationsJson: text("certifications_json").notNull().default("[]"),
    languagesJson: text("languages_json").notNull().default("[]"),
    linksJson: text("links_json").notNull().default("[]"),
    verificationStatus: text("verification_status").notNull().default("extracted"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("candidates_user_unique").on(table.userId),
    index("candidates_owner_updated_idx").on(table.ownerEmail, table.updatedAt),
    index("candidates_owner_email_idx").on(table.ownerEmail, table.normalizedEmail),
    index("candidates_owner_phone_idx").on(table.ownerEmail, table.normalizedPhone),
  ],
);

export const resumes = sqliteTable(
  "resumes",
  {
    id: text("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    candidateId: text("candidate_id").references(() => candidates.id, { onDelete: "set null" }),
    duplicateCandidateId: text("duplicate_candidate_id").references(() => candidates.id, { onDelete: "set null" }),
    fileKey: text("file_key").notNull(),
    fileName: text("file_name").notNull(),
    fileSize: integer("file_size").notNull(),
    contentType: text("content_type").notNull(),
    checksum: text("checksum").notNull(),
    pageCount: integer("page_count").notNull(),
    source: text("source").notNull(),
    appliedPosition: text("applied_position").notNull().default(""),
    receivedDate: text("received_date").notNull(),
    note: text("note").notNull().default(""),
    status: text("status").notNull(),
    errorMessage: text("error_message"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("resumes_file_key_unique").on(table.fileKey),
    uniqueIndex("resumes_owner_checksum_unique").on(table.ownerEmail, table.checksum),
    index("resumes_owner_status_updated_idx").on(table.ownerEmail, table.status, table.updatedAt),
    index("resumes_owner_source_received_idx").on(table.ownerEmail, table.source, table.receivedDate),
    index("resumes_owner_received_created_idx").on(table.ownerEmail, table.receivedDate, table.createdAt),
    index("resumes_candidate_idx").on(table.candidateId),
  ],
);

export const resumeExtractions = sqliteTable(
  "resume_extractions",
  {
    id: text("id").primaryKey(),
    resumeId: text("resume_id").notNull().references(() => resumes.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    engine: text("engine").notNull(),
    status: text("status").notNull(),
    fieldsJson: text("fields_json").notNull(),
    pageCount: integer("page_count").notNull(),
    scannedPageCount: integer("scanned_page_count").notNull(),
    createdByEmail: text("created_by_email").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("resume_extractions_version_unique").on(table.resumeId, table.versionNumber),
    index("resume_extractions_resume_idx").on(table.resumeId),
  ],
);

export const candidateProfileVersions = sqliteTable(
  "candidate_profile_versions",
  {
    id: text("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    candidateId: text("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    resumeId: text("resume_id").references(() => resumes.id, {
      onDelete: "set null",
    }),
    extractionId: text("extraction_id").references(() => resumeExtractions.id, {
      onDelete: "set null",
    }),
    versionNumber: integer("version_number").notNull(),
    schemaVersion: integer("schema_version").notNull().default(2),
    profileJson: text("profile_json").notNull(),
    verificationStatus: text("verification_status")
      .notNull()
      .default("extracted"),
    source: text("source").notNull(),
    createdByEmail: text("created_by_email").notNull(),
    createdAt: text("created_at").notNull(),
    verifiedAt: text("verified_at"),
  },
  (table) => [
    uniqueIndex("candidate_profile_versions_candidate_number_unique").on(
      table.candidateId,
      table.versionNumber,
    ),
    index("candidate_profile_versions_owner_candidate_idx").on(
      table.ownerEmail,
      table.candidateId,
      table.versionNumber,
    ),
    index("candidate_profile_versions_resume_idx").on(table.resumeId),
  ],
);

export const candidateResumeLinks = sqliteTable(
  "candidate_resume_links",
  {
    id: text("id").primaryKey(),
    candidateId: text("candidate_id").notNull().references(() => candidates.id, { onDelete: "cascade" }),
    resumeId: text("resume_id").notNull().references(() => resumes.id, { onDelete: "cascade" }),
    linkType: text("link_type").notNull(),
    createdByEmail: text("created_by_email").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("candidate_resume_links_resume_unique").on(table.resumeId),
    index("candidate_resume_links_candidate_idx").on(table.candidateId),
  ],
);

export const resumeProcessingJobs = sqliteTable(
  "resume_processing_jobs",
  {
    id: text("id").primaryKey(),
    resumeId: text("resume_id").notNull().references(() => resumes.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    status: text("status").notNull(),
    errorCode: text("error_code"),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("resume_processing_jobs_attempt_unique").on(table.resumeId, table.attemptNumber),
    index("resume_processing_jobs_resume_idx").on(table.resumeId),
  ],
);

export const aiFieldDetectionRuns = sqliteTable(
  "ai_field_detection_runs",
  {
    id: text("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    fileKey: text("file_key").notNull(),
    fileName: text("file_name").notNull(),
    fileSize: integer("file_size").notNull(),
    pageCount: integer("page_count").notNull(),
    status: text("status").notNull().default("queued"),
    provider: text("provider").notNull().default("openai"),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    resultJson: text("result_json"),
    reviewedCandidatesJson: text("reviewed_candidates_json"),
    providerResponseId: text("provider_response_id"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    totalTokens: integer("total_tokens"),
    attemptCount: integer("attempt_count").notNull().default(0),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: text("created_at").notNull(),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    reviewedAt: text("reviewed_at"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("ai_field_detection_runs_owner_updated_idx").on(
      table.ownerEmail,
      table.updatedAt,
    ),
    index("ai_field_detection_runs_status_updated_idx").on(
      table.status,
      table.updatedAt,
    ),
  ],
);

export const submissions = sqliteTable(
  "submissions",
  {
    id: text("id").primaryKey(),
    templateId: text("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    recipientLinkId: text("recipient_link_id")
      .notNull()
      .references(() => recipientLinks.id, { onDelete: "cascade" }),
    templateVersionId: text("template_version_id")
      .notNull()
      .references(() => templateVersions.id, { onDelete: "restrict" }),
    idempotencyKey: text("idempotency_key"),
    recipientName: text("recipient_name").notNull().default(""),
    recipientEmail: text("recipient_email").notNull().default(""),
    valuesJson: text("values_json").notNull(),
    completedFileKey: text("completed_file_key"),
    completedFileChecksum: text("completed_file_checksum"),
    artifactGenerator: text("artifact_generator")
      .notNull()
      .default("legacy-client-v1"),
    submittedAt: text("submitted_at").notNull(),
  },
  (table) => [
    index("submissions_template_submitted_idx").on(
      table.templateId,
      table.submittedAt,
    ),
    uniqueIndex("submissions_link_idempotency_unique").on(
      table.recipientLinkId,
      table.idempotencyKey,
    ),
    index("submissions_link_submitted_idx").on(
      table.recipientLinkId,
      table.submittedAt,
    ),
  ],
);

export const storageCleanupJobs = sqliteTable(
  "storage_cleanup_jobs",
  {
    id: text("id").primaryKey(),
    objectKey: text("object_key").notNull(),
    reason: text("reason").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastErrorCode: text("last_error_code"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("storage_cleanup_jobs_object_key_unique").on(table.objectKey),
    index("storage_cleanup_jobs_updated_idx").on(table.updatedAt),
  ],
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    requestId: text("request_id"),
    metadataJson: text("metadata_json").notNull().default("{}"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("audit_events_owner_created_idx").on(
      table.ownerEmail,
      table.createdAt,
    ),
    index("audit_events_target_created_idx").on(
      table.targetType,
      table.targetId,
      table.createdAt,
    ),
    index("audit_events_action_created_idx").on(
      table.action,
      table.createdAt,
    ),
  ],
);
