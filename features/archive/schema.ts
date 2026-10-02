import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
export const archiveRecords = sqliteTable(
  "archive_records",
  {
    id: text("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    label: text("label").notNull(),
    groupId: text("group_id").notNull(),
    priorStateJson: text("prior_state_json").notNull().default("{}"),
    archivedBy: text("archived_by").notNull(),
    archivedAt: text("archived_at").notNull(),
  },
  (t) => [
    uniqueIndex("archive_entity_unique").on(t.entityType, t.entityId),
    index("archive_owner_date_idx").on(t.ownerEmail, t.archivedAt),
  ],
);
