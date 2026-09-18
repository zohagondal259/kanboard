import { and, eq, isNull, ne } from "drizzle-orm";

import type { dbClient } from "@kan/db/client";
import { cardPlanDocs, cards } from "@kan/db/schema";

export const getByCardId = async (db: dbClient, cardId: number) => {
  const [planDoc] = await db
    .select({
      repo: cardPlanDocs.repo,
      path: cardPlanDocs.path,
      ref: cardPlanDocs.ref,
    })
    .from(cardPlanDocs)
    .where(eq(cardPlanDocs.cardId, cardId))
    .limit(1);

  return planDoc ?? null;
};

/** Find the card a document is linked to, so a sync never creates it twice. */
export const getCardByDoc = async (
  db: dbClient,
  args: { workspaceId: number; repo: string; path: string },
) => {
  const [result] = await db
    .select({ cardPublicId: cards.publicId })
    .from(cardPlanDocs)
    .innerJoin(cards, eq(cards.id, cardPlanDocs.cardId))
    .where(
      and(
        eq(cardPlanDocs.workspaceId, args.workspaceId),
        eq(cardPlanDocs.repo, args.repo),
        eq(cardPlanDocs.path, args.path),
        isNull(cards.deletedAt),
      ),
    )
    .limit(1);

  return result ?? null;
};

export const upsert = async (
  db: dbClient,
  args: {
    cardId: number;
    workspaceId: number;
    repo: string;
    path: string;
    ref?: string | null;
    createdBy: string;
  },
) => {
  const [planDoc] = await db
    .insert(cardPlanDocs)
    .values({
      cardId: args.cardId,
      workspaceId: args.workspaceId,
      repo: args.repo,
      path: args.path,
      ref: args.ref ?? null,
      createdBy: args.createdBy,
    })
    .onConflictDoUpdate({
      target: cardPlanDocs.cardId,
      set: {
        repo: args.repo,
        path: args.path,
        ref: args.ref ?? null,
        updatedAt: new Date(),
      },
    })
    .returning({
      repo: cardPlanDocs.repo,
      path: cardPlanDocs.path,
      ref: cardPlanDocs.ref,
    });

  return planDoc ?? null;
};

export const removeByCardId = async (db: dbClient, cardId: number) => {
  const [removed] = await db
    .delete(cardPlanDocs)
    .where(eq(cardPlanDocs.cardId, cardId))
    .returning({ id: cardPlanDocs.id });

  return removed ?? null;
};

/**
 * A document can be linked to one card per workspace. Links left behind by
 * soft-deleted cards would block re-linking the document, so clear them first.
 */
export const removeByDocExceptCard = async (
  db: dbClient,
  args: { workspaceId: number; repo: string; path: string; cardId: number },
) => {
  await db
    .delete(cardPlanDocs)
    .where(
      and(
        eq(cardPlanDocs.workspaceId, args.workspaceId),
        eq(cardPlanDocs.repo, args.repo),
        eq(cardPlanDocs.path, args.path),
        ne(cardPlanDocs.cardId, args.cardId),
      ),
    );
};
