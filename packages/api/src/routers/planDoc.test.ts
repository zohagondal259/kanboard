import { TRPCError } from "@trpc/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as cardRepo from "@kan/db/repository/card.repo";
import * as cardPlanDocRepo from "@kan/db/repository/cardPlanDoc.repo";
import * as workspaceRepo from "@kan/db/repository/workspace.repo";

import { assertPermission } from "../utils/permissions";
import { clearPlanDocCache } from "../utils/planDoc";

vi.mock("@kan/db/repository/card.repo", () => ({
  getWorkspaceAndCardIdByCardPublicId: vi.fn(),
}));

vi.mock("@kan/db/repository/cardPlanDoc.repo", () => ({
  getByCardId: vi.fn(),
  getCardByDoc: vi.fn(),
  upsert: vi.fn(),
  removeByCardId: vi.fn(),
  removeByDocExceptCard: vi.fn(),
}));

vi.mock("@kan/db/repository/workspace.repo", () => ({
  getByPublicId: vi.fn(),
}));

vi.mock("../utils/permissions", () => ({
  assertPermission: vi.fn(),
}));

const mockGetCard = cardRepo.getWorkspaceAndCardIdByCardPublicId as ReturnType<
  typeof vi.fn
>;
const mockGetByCardId = cardPlanDocRepo.getByCardId as ReturnType<typeof vi.fn>;
const mockGetCardByDoc = cardPlanDocRepo.getCardByDoc as ReturnType<
  typeof vi.fn
>;
const mockUpsert = cardPlanDocRepo.upsert as ReturnType<typeof vi.fn>;
const mockRemoveStale = cardPlanDocRepo.removeByDocExceptCard as ReturnType<
  typeof vi.fn
>;
const mockWorkspaceGetByPublicId = workspaceRepo.getByPublicId as ReturnType<
  typeof vi.fn
>;
const mockAssertPermission = assertPermission as ReturnType<typeof vi.fn>;

const CARD_ID = "card-1234567";
const LINK = { repo: "acme/docs", path: "PLAN.md", ref: null };

const forbidden = (permission: string) =>
  new TRPCError({
    message: `You do not have permission to perform this action (${permission})`,
    code: "FORBIDDEN",
  });

describe("planDoc router", () => {
  const ctx = {
    user: { id: "user-123", email: "team@example.com" },
    db: {},
  } as never;

  beforeEach(() => {
    vi.clearAllMocks();
    clearPlanDocCache();
    process.env.PLAN_DOCS_REPOS = "acme/docs";
    process.env.PLAN_DOCS_GITHUB_TOKEN = "test-token";
    mockAssertPermission.mockResolvedValue(undefined);
    mockGetCard.mockResolvedValue({ id: 7, workspaceId: 1 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.PLAN_DOCS_REPOS;
    delete process.env.PLAN_DOCS_GITHUB_TOKEN;
  });

  it("refuses an unauthenticated caller", async () => {
    const { planDocRouter } = await import("./planDoc");

    await expect(
      planDocRouter
        .createCaller({ user: null, db: {} } as never)
        .get({ cardPublicId: CARD_ID }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("refuses a guest before it reads the link or calls out", async () => {
    const { planDocRouter } = await import("./planDoc");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mockAssertPermission.mockRejectedValue(forbidden("plandoc:view"));

    const caller = planDocRouter.createCaller(ctx);

    await expect(caller.get({ cardPublicId: CARD_ID })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      caller.getFull({ cardPublicId: CARD_ID }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mockAssertPermission).toHaveBeenCalledWith(
      expect.anything(),
      "user-123",
      1,
      "plandoc:view",
    );
    expect(mockGetByCardId).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never names the document in a refusal", async () => {
    const { planDocRouter } = await import("./planDoc");
    mockAssertPermission.mockRejectedValue(forbidden("plandoc:view"));

    const error = (await planDocRouter
      .createCaller(ctx)
      .get({ cardPublicId: CARD_ID })
      .catch((e: unknown) => e)) as TRPCError;

    expect(error.message).not.toContain("acme");
    expect(error.message).not.toContain("PLAN.md");
  });

  it("returns the summary for someone who may view plan docs", async () => {
    const { planDocRouter } = await import("./planDoc");
    mockGetByCardId.mockResolvedValue(LINK);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            "# Plan\n\n> Banner\n\n## STATE\n\n- newest\n- older\n",
            {
              status: 200,
            },
          ),
      ),
    );

    const result = await planDocRouter
      .createCaller(ctx)
      .get({ cardPublicId: CARD_ID });

    expect(result.error).toBeNull();
    expect(result.link).toEqual(LINK);
    expect(result.summary).toMatchObject({
      title: "Plan",
      banner: "Banner",
      stateEntries: ["- newest", "- older"],
    });
  });

  it("reports a missing document as an error code, not a crash", async () => {
    const { planDocRouter } = await import("./planDoc");
    mockGetByCardId.mockResolvedValue(LINK);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404 })),
    );

    const result = await planDocRouter
      .createCaller(ctx)
      .get({ cardPublicId: CARD_ID });

    expect(result.summary).toBeNull();
    expect(result.error).toBe("NOT_FOUND");
  });

  describe("set", () => {
    it("needs card:edit as well as plandoc:view", async () => {
      const { planDocRouter } = await import("./planDoc");
      mockAssertPermission.mockImplementation(
        async (
          _db: unknown,
          _user: unknown,
          _ws: unknown,
          permission: string,
        ) => {
          if (permission === "card:edit") throw forbidden("card:edit");
        },
      );

      await expect(
        planDocRouter
          .createCaller(ctx)
          .set({ cardPublicId: CARD_ID, repo: "acme/docs", path: "PLAN.md" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it("rejects a repository outside the allowlist and a traversal path", async () => {
      const { planDocRouter } = await import("./planDoc");
      const caller = planDocRouter.createCaller(ctx);

      await expect(
        caller.set({
          cardPublicId: CARD_ID,
          repo: "evil/repo",
          path: "PLAN.md",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(
        caller.set({
          cardPublicId: CARD_ID,
          repo: "acme/docs",
          path: "../other/PLAN.md",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it("refuses a document already linked to another live card", async () => {
      const { planDocRouter } = await import("./planDoc");
      mockGetCardByDoc.mockResolvedValue({ cardPublicId: "card-7654321" });

      await expect(
        planDocRouter
          .createCaller(ctx)
          .set({ cardPublicId: CARD_ID, repo: "acme/docs", path: "PLAN.md" }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it("clears stale links, then saves", async () => {
      const { planDocRouter } = await import("./planDoc");
      mockGetCardByDoc.mockResolvedValue(null);
      mockUpsert.mockResolvedValue(LINK);

      const result = await planDocRouter
        .createCaller(ctx)
        .set({ cardPublicId: CARD_ID, repo: "acme/docs", path: "PLAN.md" });

      expect(result).toEqual(LINK);
      expect(mockRemoveStale).toHaveBeenCalledWith(expect.anything(), {
        workspaceId: 1,
        repo: "acme/docs",
        path: "PLAN.md",
        cardId: 7,
      });
    });
  });

  describe("byDoc", () => {
    it("checks plandoc:view on the workspace before looking anything up", async () => {
      const { planDocRouter } = await import("./planDoc");
      mockWorkspaceGetByPublicId.mockResolvedValue({ id: 1 });
      mockAssertPermission.mockRejectedValue(forbidden("plandoc:view"));

      await expect(
        planDocRouter.createCaller(ctx).byDoc({
          workspacePublicId: "ws-123456789",
          repo: "acme/docs",
          path: "PLAN.md",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(mockGetCardByDoc).not.toHaveBeenCalled();
    });

    it("returns the linked card, or null", async () => {
      const { planDocRouter } = await import("./planDoc");
      mockWorkspaceGetByPublicId.mockResolvedValue({ id: 1 });
      mockGetCardByDoc.mockResolvedValueOnce({ cardPublicId: CARD_ID });

      const caller = planDocRouter.createCaller(ctx);
      const input = {
        workspacePublicId: "ws-123456789",
        repo: "acme/docs",
        path: "PLAN.md",
      };

      expect(await caller.byDoc(input)).toEqual({ cardPublicId: CARD_ID });

      mockGetCardByDoc.mockResolvedValueOnce(null);
      expect(await caller.byDoc(input)).toEqual({ cardPublicId: null });
    });
  });
});
