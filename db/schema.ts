import {
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
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("templates_owner_updated_idx").on(
      table.ownerEmail,
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
  (table) => [index("recipient_profiles_type_idx").on(table.accountType)],
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
    accessToken: text("access_token").notNull(),
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
    index("form_assignments_template_idx").on(table.templateId),
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
  ],
);
