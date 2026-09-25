import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import * as workspaceRepo from "@kan/db/repository/workspace.repo";
import * as schema from "@kan/db/schema";

import type { TestDbClient } from "./test-db";
import { createTestDb, seedTestData } from "./test-db";

type SearchResult = Awaited<
  ReturnType<typeof workspaceRepo.searchBoardsAndCards>
>[number];

const label = (result: SearchResult) =>
  result.type === "card" ? result.cardNumber : `board:${result.title}`;

describe("workspace search by ticket ID", () => {
  let db: TestDbClient;
  let workspaceId: number;

  const search = async (query: string, limit?: number) =>
    (
      await workspaceRepo.searchBoardsAndCards(db, workspaceId, query, limit)
    ).map(label);

  beforeAll(async () => {
    db = await createTestDb();
    const { user, workspace } = await seedTestData(db);
    workspaceId = workspace.id;

    let idCounter = 0;
    const publicId = () => `srch${String(++idCounter).padStart(8, "0")}`;

    await db
      .update(schema.workspaces)
      .set({ cardPrefix: "AGR" })
      .where(eq(schema.workspaces.id, workspace.id));

    const [board] = await db
      .insert(schema.boards)
      .values({
        publicId: publicId(),
        name: "Client Board",
        slug: "client-board",
        workspaceId: workspace.id,
        createdBy: user.id,
      })
      .returning();

    const [list, deletedList] = await db
      .insert(schema.lists)
      .values([
        {
          publicId: publicId(),
          name: "Backlog",
          index: 0,
          boardId: board!.id,
          createdBy: user.id,
        },
        {
          publicId: publicId(),
          name: "Trash",
          index: 1,
          boardId: board!.id,
          createdBy: user.id,
          deletedAt: new Date("2026-09-01T00:00:00Z"),
        },
      ])
      .returning();

    const card = (
      listId: number,
      cardNumber: number | null,
      title: string,
      createdAt: string,
      updatedAt?: string,
      deletedAt?: string,
    ) => ({
      publicId: publicId(),
      listId,
      cardNumber,
      title,
      index: cardNumber ?? 0,
      createdBy: user.id,
      createdAt: new Date(`${createdAt}T00:00:00Z`),
      updatedAt: updatedAt ? new Date(`${updatedAt}T00:00:00Z`) : null,
      deletedAt: deletedAt ? new Date(`${deletedAt}T00:00:00Z`) : null,
    });

    await db
      .insert(schema.cards)
      .values([
        card(list!.id, 3, "Set up staging", "2026-02-01"),
        card(list!.id, 34, "Fix receipt upload", "2026-02-02", "2026-08-01"),
        card(list!.id, 134, "Rotate API keys", "2026-02-03"),
        card(
          list!.id,
          340,
          "Review invoice totals",
          "2026-02-04",
          "2026-06-01",
        ),
        card(list!.id, 343, "Improve login screen", "2026-02-05", "2026-09-05"),
        card(list!.id, 1343, "Archive old exports", "2026-02-06"),
        card(list!.id, 3430, "Add dark mode", "2026-02-07", "2026-03-01"),
        card(list!.id, 7, "Agri parser rewrite", "2026-02-08", "2026-09-01"),
        card(
          list!.id,
          8,
          "Follow up on AGR-343 fix",
          "2026-02-09",
          "2026-09-10",
        ),
        card(list!.id, null, "Legacy card without number", "2026-02-10"),
        card(
          list!.id,
          999,
          "Deleted card",
          "2026-02-11",
          undefined,
          "2026-09-01",
        ),
        card(deletedList!.id, 998, "Card in deleted list", "2026-02-12"),
      ]);

    const [otherWorkspace] = await db
      .insert(schema.workspaces)
      .values({
        publicId: publicId(),
        name: "Other Workspace",
        slug: "other-workspace",
        cardPrefix: "OTH",
        createdBy: user.id,
      })
      .returning();
    const [otherBoard] = await db
      .insert(schema.boards)
      .values({
        publicId: publicId(),
        name: "Other Board",
        slug: "other-board",
        workspaceId: otherWorkspace!.id,
        createdBy: user.id,
      })
      .returning();
    const [otherList] = await db
      .insert(schema.lists)
      .values({
        publicId: publicId(),
        name: "Backlog",
        index: 0,
        boardId: otherBoard!.id,
        createdBy: user.id,
      })
      .returning();
    await db
      .insert(schema.cards)
      .values(card(otherList!.id, 343, "Other workspace ticket", "2026-02-13"));
  }, 60_000);

  it.each([
    ["AGR-343", [343, 8, 3430]],
    ["agr-343", [343, 8, 3430]],
    ["343", [343, 8, 3430, 1343]],
    [" 343 ", [343, 8, 3430, 1343]],
    ["34", [34, 8, 343, 340, 3430, 1343, 134]],
    ["agr-34", [34, 8, 343, 340, 3430]],
    ["agr", [8, 7, 343, 34, 340, 3430, 1343, 134, 3]],
    ["AGR", [8, 7, 343, 34, 340, 3430, 1343, 134, 3]],
  ])("finds and ranks cards for %j", async (query, expected) => {
    expect(await search(query)).toEqual(expected);
  });

  it("puts the most recently touched card first, treating a never-edited card by its creation date", async () => {
    expect(await search("agr", 5)).toEqual([8, 7, 343]);
  });

  it("still finds cards by title and boards by name", async () => {
    expect(await search("invoice")).toEqual([340]);
    expect(await search("Client")).toEqual(["board:Client Board"]);
  });

  it("finds a card that has no ticket number by its title only", async () => {
    expect(await search("legacy")).toEqual([null]);
  });

  it("hides deleted cards, cards in deleted lists and other workspaces", async () => {
    expect(await search("deleted")).toEqual([]);
    expect(await search("999")).toEqual([]);
    expect(await search("998")).toEqual([]);
    expect(await search("OTH-343")).toEqual([]);
    expect(await search("other workspace")).toEqual([]);
  });

  it("returns nothing for no match, blank input and numbers beyond the integer range", async () => {
    expect(await search("zzz-nothing")).toEqual([]);
    expect(await search("   ")).toEqual([]);
    expect(await search("99999999999")).toEqual([]);
    expect(await search("AGR-99999999999999999999")).toEqual([]);
  });
});
