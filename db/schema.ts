import { sql } from "drizzle-orm";
import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("templates_owner_updated_idx").on(
      table.ownerEmail,
      table.updatedAt,
    ),
  ],
);

export const recipientLinks = sqliteTable(
  "recipient_links",
  {
    id: text("id").primaryKey(),
    templateId: text("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    roleId: text("role_id").notNull(),
    roleName: text("role_name").notNull(),
    roleColor: text("role_color").notNull(),
    tokenHash: text("token_hash").notNull(),
    status: text("status").notNull().default("active"),
    expiresAt: text("expires_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("recipient_links_token_hash_unique").on(table.tokenHash),
    uniqueIndex("recipient_links_template_role_unique").on(
      table.templateId,
      table.roleId,
    ),
    index("recipient_links_template_idx").on(table.templateId),
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
    recipientName: text("recipient_name").notNull().default(""),
    recipientEmail: text("recipient_email").notNull().default(""),
    valuesJson: text("values_json").notNull(),
    completedFileKey: text("completed_file_key"),
    submittedAt: text("submitted_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("submissions_template_submitted_idx").on(
      table.templateId,
      table.submittedAt,
    ),
  ],
);
