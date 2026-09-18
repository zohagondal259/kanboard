import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type { dbClient } from "@kan/db/client";
import * as cardRepo from "@kan/db/repository/card.repo";
import * as cardPlanDocRepo from "@kan/db/repository/cardPlanDoc.repo";
import * as workspaceRepo from "@kan/db/repository/workspace.repo";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import { assertPermission } from "../utils/permissions";
import {
  assertValidDocLocation,
  fetchPlanDoc,
  isPlanDocsConfigured,
  PlanDocError,
  summarisePlanDoc,
} from "../utils/planDoc";

const planDocErrorCodeSchema = z.enum([
  "NOT_CONFIGURED",
  "REPO_NOT_ALLOWED",
  "INVALID_PATH",
  "INVALID_REF",
  "NOT_FOUND",
  "TOO_LARGE",
  "UPSTREAM_ERROR",
]);

const planDocLinkSchema = z.object({
  repo: z.string(),
  path: z.string(),
  ref: z.string().nullable(),
});

const cardInputSchema = z.object({ cardPublicId: z.string().min(12) });

/**
 * Every procedure here checks `plandoc:view` on the card's workspace before it
 * reveals anything, including whether a link exists. Guests do not hold that
 * permission, so a client can never learn a document's repository or path.
 */
const getAuthorisedCard = async (
  db: dbClient,
  userId: string | undefined,
  cardPublicId: string,
) => {
  if (!userId)
    throw new TRPCError({
      message: "User not authenticated",
      code: "UNAUTHORIZED",
    });

  const card = await cardRepo.getWorkspaceAndCardIdByCardPublicId(
    db,
    cardPublicId,
  );

  if (!card)
    throw new TRPCError({ message: "Card not found", code: "NOT_FOUND" });

  await assertPermission(db, userId, card.workspaceId, "plandoc:view");

  return { userId, card };
};

export const planDocRouter = createTRPCRouter({
  get: protectedProcedure
    .meta({
      openapi: {
        summary: "Get a card's plan doc summary",
        method: "GET",
        path: "/cards/{cardPublicId}/plan-doc",
        description:
          "Returns the banner and the newest STATE entries of the plan doc linked to a card",
        tags: ["Plan docs"],
        protect: true,
      },
    })
    .input(cardInputSchema)
    .output(
      z.object({
        configured: z.boolean(),
        link: planDocLinkSchema.nullable(),
        summary: z
          .object({
            title: z.string().nullable(),
            banner: z.string().nullable(),
            stateEntries: z.array(z.string()),
            totalStateEntries: z.number(),
          })
          .nullable(),
        error: planDocErrorCodeSchema.nullable(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { card } = await getAuthorisedCard(
        ctx.db,
        ctx.user?.id,
        input.cardPublicId,
      );

      const configured = isPlanDocsConfigured();
      const link = await cardPlanDocRepo.getByCardId(ctx.db, card.id);

      if (!link || !configured)
        return { configured, link, summary: null, error: null };

      try {
        const markdown = await fetchPlanDoc(link);
        return {
          configured,
          link,
          summary: summarisePlanDoc(markdown),
          error: null,
        };
      } catch (error) {
        if (error instanceof PlanDocError)
          return { configured, link, summary: null, error: error.code };
        throw error;
      }
    }),

  getFull: protectedProcedure
    .meta({
      openapi: {
        summary: "Get a card's full plan doc",
        method: "GET",
        path: "/cards/{cardPublicId}/plan-doc/full",
        description:
          "Returns the full markdown of the plan doc linked to a card",
        tags: ["Plan docs"],
        protect: true,
      },
    })
    .input(cardInputSchema)
    .output(
      z.object({
        link: planDocLinkSchema,
        title: z.string().nullable(),
        markdown: z.string().nullable(),
        error: planDocErrorCodeSchema.nullable(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { card } = await getAuthorisedCard(
        ctx.db,
        ctx.user?.id,
        input.cardPublicId,
      );

      const link = await cardPlanDocRepo.getByCardId(ctx.db, card.id);

      if (!link)
        throw new TRPCError({
          message: "This card has no plan doc",
          code: "NOT_FOUND",
        });

      try {
        const markdown = await fetchPlanDoc(link);
        return {
          link,
          title: summarisePlanDoc(markdown, 0).title,
          markdown,
          error: null,
        };
      } catch (error) {
        if (error instanceof PlanDocError)
          return { link, title: null, markdown: null, error: error.code };
        throw error;
      }
    }),

  set: protectedProcedure
    .meta({
      openapi: {
        summary: "Link a plan doc to a card",
        method: "PUT",
        path: "/cards/{cardPublicId}/plan-doc",
        description:
          "Links a markdown document in an allowed repository to a card, replacing any existing link",
        tags: ["Plan docs"],
        protect: true,
      },
    })
    .input(
      cardInputSchema.extend({
        repo: z.string().min(3).max(255),
        path: z.string().min(4).max(1024),
        ref: z.string().min(1).max(255).optional(),
      }),
    )
    .output(planDocLinkSchema)
    .mutation(async ({ ctx, input }) => {
      const { userId, card } = await getAuthorisedCard(
        ctx.db,
        ctx.user?.id,
        input.cardPublicId,
      );

      await assertPermission(ctx.db, userId, card.workspaceId, "card:edit");

      try {
        assertValidDocLocation(input);
      } catch (error) {
        if (error instanceof PlanDocError)
          throw new TRPCError({ message: error.message, code: "BAD_REQUEST" });
        throw error;
      }

      const existingCard = await cardPlanDocRepo.getCardByDoc(ctx.db, {
        workspaceId: card.workspaceId,
        repo: input.repo,
        path: input.path,
      });

      if (existingCard && existingCard.cardPublicId !== input.cardPublicId)
        throw new TRPCError({
          message: `This plan doc is already linked to card ${existingCard.cardPublicId}`,
          code: "CONFLICT",
        });

      await cardPlanDocRepo.removeByDocExceptCard(ctx.db, {
        workspaceId: card.workspaceId,
        repo: input.repo,
        path: input.path,
        cardId: card.id,
      });

      const link = await cardPlanDocRepo.upsert(ctx.db, {
        cardId: card.id,
        workspaceId: card.workspaceId,
        repo: input.repo,
        path: input.path,
        ref: input.ref ?? null,
        createdBy: userId,
      });

      if (!link)
        throw new TRPCError({
          message: "Unable to link the plan doc",
          code: "INTERNAL_SERVER_ERROR",
        });

      return link;
    }),

  remove: protectedProcedure
    .meta({
      openapi: {
        summary: "Unlink a card's plan doc",
        method: "DELETE",
        path: "/cards/{cardPublicId}/plan-doc",
        description: "Removes the link between a card and its plan doc",
        tags: ["Plan docs"],
        protect: true,
      },
    })
    .input(cardInputSchema)
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { userId, card } = await getAuthorisedCard(
        ctx.db,
        ctx.user?.id,
        input.cardPublicId,
      );

      await assertPermission(ctx.db, userId, card.workspaceId, "card:edit");

      const removed = await cardPlanDocRepo.removeByCardId(ctx.db, card.id);

      return { success: !!removed };
    }),

  byDoc: protectedProcedure
    .meta({
      openapi: {
        summary: "Find the card linked to a plan doc",
        method: "GET",
        path: "/workspaces/{workspacePublicId}/plan-docs/card",
        description:
          "Looks a card up by its plan doc, so a sync can update a card instead of creating it twice",
        tags: ["Plan docs"],
        protect: true,
      },
    })
    .input(
      z.object({
        workspacePublicId: z.string().min(12),
        repo: z.string().min(3).max(255),
        path: z.string().min(4).max(1024),
      }),
    )
    .output(z.object({ cardPublicId: z.string().nullable() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });

      const workspace = await workspaceRepo.getByPublicId(
        ctx.db,
        input.workspacePublicId,
      );

      if (!workspace)
        throw new TRPCError({
          message: "Workspace not found",
          code: "NOT_FOUND",
        });

      await assertPermission(ctx.db, userId, workspace.id, "plandoc:view");

      const result = await cardPlanDocRepo.getCardByDoc(ctx.db, {
        workspaceId: workspace.id,
        repo: input.repo,
        path: input.path,
      });

      return { cardPublicId: result?.cardPublicId ?? null };
    }),
});
