import { relations } from "drizzle-orm";
import {
  bigint,
  bigserial,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { cards } from "./cards";
import { users } from "./users";
import { workspaces } from "./workspaces";

/**
 * Links a card to the plan document that describes its work. The document
 * itself lives in a git repository and is fetched on demand.
 *
 * This is a separate table rather than columns on `card` on purpose: card rows
 * are read by guests, copied on duplication and sent in webhook payloads, and
 * the link must never travel with them.
 */
export const cardPlanDocs = pgTable(
  "card_plan_doc",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    cardId: bigint("cardId", { mode: "number" })
      .notNull()
      .unique()
      .references(() => cards.id, { onDelete: "cascade" }),
    workspaceId: bigint("workspaceId", { mode: "number" })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    repo: varchar("repo", { length: 255 }).notNull(),
    path: varchar("path", { length: 1024 }).notNull(),
    ref: varchar("ref", { length: 255 }),
    createdBy: uuid("createdBy").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
  },
  (table) => [
    index("card_plan_doc_workspace_idx").on(table.workspaceId),
    uniqueIndex("card_plan_doc_workspace_doc_idx").on(
      table.workspaceId,
      table.repo,
      table.path,
    ),
  ],
).enableRLS();

export const cardPlanDocsRelations = relations(cardPlanDocs, ({ one }) => ({
  card: one(cards, {
    fields: [cardPlanDocs.cardId],
    references: [cards.id],
    relationName: "cardPlanDocsCard",
  }),
  workspace: one(workspaces, {
    fields: [cardPlanDocs.workspaceId],
    references: [workspaces.id],
    relationName: "cardPlanDocsWorkspace",
  }),
}));
