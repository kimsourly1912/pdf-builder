import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const telegramConnections = sqliteTable(
  "telegram_connections",
  {
    id: text("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    chatId: text("chat_id").notNull(),
    username: text("username").notNull().default(""),
    fullName: text("full_name").notNull().default(""),
    email: text("email").notNull().default(""),
    stage: text("stage").notNull().default("name"),
    submissionMode: text("submission_mode").notNull().default("initial"),
    lastIntakeId: text("last_intake_id"),
    candidateId: text("candidate_id"),
    confirmedCandidateId: text("confirmed_candidate_id"),
    confirmedBy: text("confirmed_by"),
    confirmedAt: text("confirmed_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("telegram_connections_owner_chat_unique").on(
      t.ownerEmail,
      t.chatId,
    ),
  ],
);
export const telegramUpdates = sqliteTable(
  "telegram_updates",
  {
    id: integer("id").primaryKey(),
    chatId: text("chat_id").notNull(),
    payloadJson: text("payload_json").notNull(),
    status: text("status").notNull().default("queued"),
    lockToken: text("lock_token"),
    lockedUntil: text("locked_until"),
    attempts: integer("attempts").notNull().default(0),
    errorMessage: text("error_message"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("telegram_updates_status_idx").on(t.status, t.id)],
);
export const telegramIntakes = sqliteTable(
  "telegram_intakes",
  {
    id: text("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    connectionId: text("connection_id").notNull(),
    candidateId: text("candidate_id").notNull(),
    resumeId: text("resume_id").notNull(),
    updateId: integer("update_id").notNull(),
    extractionStatus: text("extraction_status")
      .notNull()
      .default("not_extracted"),
    extractionToken: text("extraction_token"),
    extractionUntil: text("extraction_until"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("telegram_intakes_update_unique").on(t.updateId),
    uniqueIndex("telegram_intakes_resume_unique").on(t.resumeId),
    index("telegram_intakes_owner_idx").on(t.ownerEmail, t.createdAt),
  ],
);
export const telegramDeliveries = sqliteTable(
  "telegram_deliveries",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    ownerEmail: text("owner_email").notNull(),
    chatId: text("chat_id").notNull(),
    status: text("status").notNull().default("pending"),
    tokenCipher: text("token_cipher"),
    messageId: text("message_id"),
    errorMessage: text("error_message"),
    nextAttemptAt: text("next_attempt_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("telegram_deliveries_run_node_unique").on(t.runId, t.nodeId),
  ],
);
export const accountActivations = sqliteTable(
  "account_activations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    ownerEmail: text("owner_email").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("account_activations_hash_unique").on(t.tokenHash)],
);
export const activationRedemptions = sqliteTable("activation_redemptions", {
  tokenHash: text("token_hash").notNull(),
  checkedAt: text("checked_at").notNull(),
});
export const telegramUpdateGuards = sqliteTable("telegram_update_guards", {
  updateId: integer("update_id").notNull(),
  lockToken: text("lock_token").notNull(),
  checkedAt: text("checked_at").notNull(),
});
export const intakeExtractionGuards = sqliteTable("intake_extraction_guards", {
  intakeId: text("intake_id").notNull(),
  lockToken: text("lock_token").notNull(),
  resumeRevision: text("resume_revision").notNull(),
  candidateRevision: text("candidate_revision").notNull(),
  checkedAt: text("checked_at").notNull(),
});
