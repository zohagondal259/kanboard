import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertValidDocLocation,
  clearPlanDocCache,
  fetchPlanDoc,
  isValidDocPath,
  isValidRef,
  PlanDocError,
  summarisePlanDoc,
} from "./planDoc.js";

const DOC = `# Client board

> **IN PROGRESS.** Hosting works.
> Second banner line.

Some intro text.

## STATE

- **2026-09-18 — newest.**
  - detail a
  - detail b

- **2026-09-17 — middle.**

- **2026-09-16 — older.**
- **2026-09-15 — oldest.**

## Why this exists

- not a state entry
`;

describe("summarisePlanDoc", () => {
  it("extracts the title, the banner and the newest state entries", () => {
    const summary = summarisePlanDoc(DOC);

    expect(summary.title).toBe("Client board");
    expect(summary.banner).toBe(
      "**IN PROGRESS.** Hosting works.\nSecond banner line.",
    );
    expect(summary.totalStateEntries).toBe(4);
    expect(summary.stateEntries).toHaveLength(3);
    expect(summary.stateEntries[0]).toBe(
      "- **2026-09-18 — newest.**\n  - detail a\n  - detail b",
    );
    expect(summary.stateEntries[2]).toBe("- **2026-09-16 — older.**");
  });

  it("never reads past the STATE section", () => {
    const summary = summarisePlanDoc(DOC, 10);

    expect(summary.stateEntries).toHaveLength(4);
    expect(summary.stateEntries.join("\n")).not.toContain("not a state entry");
  });

  it("copes with a doc that has no banner and no STATE", () => {
    const summary = summarisePlanDoc("# Title\n\nJust text.\n");

    expect(summary).toEqual({
      title: "Title",
      banner: null,
      stateEntries: [],
      totalStateEntries: 0,
    });
  });

  it("does not treat a block quote after the first section as the banner", () => {
    const summary = summarisePlanDoc("# T\n\n## Section\n\n> quoted later\n");

    expect(summary.banner).toBeNull();
  });

  it("handles CRLF line endings", () => {
    const summary = summarisePlanDoc(DOC.replace(/\n/g, "\r\n"));

    expect(summary.totalStateEntries).toBe(4);
    expect(summary.title).toBe("Client board");
  });
});

describe("doc location validation", () => {
  beforeEach(() => {
    process.env.PLAN_DOCS_REPOS = "acme/docs, acme/mobile-docs";
    process.env.PLAN_DOCS_GITHUB_TOKEN = "test-token";
  });

  afterEach(() => {
    delete process.env.PLAN_DOCS_REPOS;
    delete process.env.PLAN_DOCS_GITHUB_TOKEN;
  });

  it("accepts ordinary repo-relative markdown paths", () => {
    expect(isValidDocPath("INPROGRESS_PLAN.md")).toBe(true);
    expect(isValidDocPath("completed-tasks/Some Plan v2.md")).toBe(true);
  });

  it("rejects traversal, absolute paths and non-markdown files", () => {
    expect(isValidDocPath("../secrets.md")).toBe(false);
    expect(isValidDocPath("a/../../b.md")).toBe(false);
    expect(isValidDocPath("/etc/passwd.md")).toBe(false);
    expect(isValidDocPath("a/./b.md")).toBe(false);
    expect(isValidDocPath("notes.txt")).toBe(false);
    expect(isValidDocPath("a%2F..%2Fb.md")).toBe(false);
    expect(isValidDocPath("a?ref=x.md")).toBe(false);
    expect(isValidDocPath("")).toBe(false);
  });

  it("rejects odd refs", () => {
    expect(isValidRef("main")).toBe(true);
    expect(isValidRef("feature/x-1")).toBe(true);
    expect(isValidRef("a..b")).toBe(false);
    expect(isValidRef("main?x=1")).toBe(false);
  });

  it("only allows listed repositories, ignoring case", () => {
    expect(() =>
      assertValidDocLocation({ repo: "Acme/Docs", path: "a.md" }),
    ).not.toThrow();

    expect(() =>
      assertValidDocLocation({ repo: "other/docs", path: "a.md" }),
    ).toThrowError(PlanDocError);
  });
});

describe("fetchPlanDoc", () => {
  beforeEach(() => {
    clearPlanDocCache();
    process.env.PLAN_DOCS_REPOS = "acme/docs";
    process.env.PLAN_DOCS_GITHUB_TOKEN = "test-token";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.PLAN_DOCS_REPOS;
    delete process.env.PLAN_DOCS_GITHUB_TOKEN;
  });

  it("refuses when nothing is configured, without calling out", async () => {
    delete process.env.PLAN_DOCS_GITHUB_TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchPlanDoc({ repo: "acme/docs", path: "a.md" }),
    ).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a repository outside the allowlist, without calling out", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchPlanDoc({ repo: "evil/repo", path: "a.md" }),
    ).rejects.toMatchObject({ code: "REPO_NOT_ALLOWED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches with the token, encodes the path and caches the result", async () => {
    const fetchMock = vi.fn(async () => new Response("# Doc", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await fetchPlanDoc({
      repo: "acme/docs",
      path: "dir/My Plan.md",
      ref: "main",
    });
    const second = await fetchPlanDoc({
      repo: "acme/docs",
      path: "dir/My Plan.md",
      ref: "main",
    });

    expect(first).toBe("# Doc");
    expect(second).toBe("# Doc");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      URL,
      { headers: Record<string, string> },
    ];
    expect(url.toString()).toBe(
      "https://api.github.com/repos/acme/docs/contents/dir/My%20Plan.md?ref=main",
    );
    expect(init.headers.Authorization).toBe("Bearer test-token");
  });

  it("maps a 404 to NOT_FOUND and other failures to UPSTREAM_ERROR", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404 })),
    );
    await expect(
      fetchPlanDoc({ repo: "acme/docs", path: "missing.md" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 500 })),
    );
    await expect(
      fetchPlanDoc({ repo: "acme/docs", path: "broken.md" }),
    ).rejects.toMatchObject({ code: "UPSTREAM_ERROR" });
  });
});
