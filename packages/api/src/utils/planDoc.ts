/**
 * Plan documents live in private git repositories and are fetched on demand,
 * server side, with a read-only token. Two settings control it:
 *
 * - PLAN_DOCS_REPOS: comma-separated `owner/name` repositories that may be
 *   linked. Nothing else can be fetched, whatever a caller sends.
 * - PLAN_DOCS_GITHUB_TOKEN: a token with read access to those repositories.
 * - PLAN_DOCS_WORKSPACE_PREFIXES (optional): which folders each workspace may link,
 *   as comma-separated `workspacePublicId=folder/` pairs. One repository can hold
 *   many clients' docs; this keeps a workspace inside its own folder.
 *
 * Neither value is ever returned to a client.
 */

const REPO_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+$/;
const REF_PATTERN = /^[A-Za-z0-9._/-]{1,255}$/;
const PATH_SEGMENT_PATTERN = /^[A-Za-z0-9._ -]+$/;

const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_DOC_BYTES = 2_000_000;

export const STATE_ENTRY_LIMIT = 3;

export type PlanDocErrorCode =
  | "NOT_CONFIGURED"
  | "REPO_NOT_ALLOWED"
  | "INVALID_PATH"
  | "INVALID_REF"
  | "PATH_NOT_ALLOWED"
  | "NOT_FOUND"
  | "TOO_LARGE"
  | "UPSTREAM_ERROR";

export class PlanDocError extends Error {
  constructor(
    public readonly code: PlanDocErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PlanDocError";
  }
}

export const getAllowedRepos = (): string[] =>
  (process.env.PLAN_DOCS_REPOS ?? "")
    .split(",")
    .map((repo) => repo.trim())
    .filter((repo) => REPO_PATTERN.test(repo));

export const isPlanDocsConfigured = (): boolean =>
  getAllowedRepos().length > 0 && !!process.env.PLAN_DOCS_GITHUB_TOKEN;

export const isRepoAllowed = (repo: string): boolean =>
  getAllowedRepos().some(
    (allowed) => allowed.toLowerCase() === repo.toLowerCase(),
  );

/** A repo-relative markdown path with no way to climb out of the repository. */
export const isValidDocPath = (path: string): boolean => {
  if (path.length === 0 || path.length > 1024) return false;
  if (path.startsWith("/") || path.endsWith("/")) return false;
  if (!path.toLowerCase().endsWith(".md")) return false;

  return path
    .split("/")
    .every(
      (segment) =>
        segment !== "." &&
        segment !== ".." &&
        PATH_SEGMENT_PATTERN.test(segment),
    );
};

export const isValidRef = (ref: string): boolean =>
  REF_PATTERN.test(ref) && !ref.includes("..");

export const assertValidDocLocation = (location: {
  repo: string;
  path: string;
  ref?: string | null;
}): void => {
  if (!isRepoAllowed(location.repo))
    throw new PlanDocError(
      "REPO_NOT_ALLOWED",
      "This repository is not allowed for plan docs",
    );

  if (!isValidDocPath(location.path))
    throw new PlanDocError("INVALID_PATH", "Invalid plan doc path");

  if (location.ref && !isValidRef(location.ref))
    throw new PlanDocError("INVALID_REF", "Invalid plan doc ref");
};

/**
 * Unset means no restriction. Once set, it fails closed: a workspace that is not
 * listed can link nothing. It is a server setting on purpose, so a workspace
 * admin cannot widen their own access.
 */
export const getWorkspacePrefixes = (): Map<string, string[]> | null => {
  const raw = (process.env.PLAN_DOCS_WORKSPACE_PREFIXES ?? "").trim();
  if (!raw) return null;

  const prefixes = new Map<string, string[]>();
  for (const entry of raw.split(",")) {
    const [workspacePublicId, folder] = entry.split("=").map((s) => s.trim());
    if (!workspacePublicId || !folder) continue;

    const prefix = folder.endsWith("/") ? folder : `${folder}/`;
    if (!isValidDocPath(`${prefix}x.md`)) continue;

    prefixes.set(workspacePublicId, [
      ...(prefixes.get(workspacePublicId) ?? []),
      prefix,
    ]);
  }
  return prefixes;
};

export const isPathAllowedForWorkspace = (
  workspacePublicId: string,
  path: string,
): boolean => {
  const prefixes = getWorkspacePrefixes();
  if (!prefixes) return true;

  return (prefixes.get(workspacePublicId) ?? []).some((prefix) =>
    path.startsWith(prefix),
  );
};

export const assertPathAllowedForWorkspace = (
  workspacePublicId: string,
  path: string,
): void => {
  if (!isPathAllowedForWorkspace(workspacePublicId, path))
    throw new PlanDocError(
      "PATH_NOT_ALLOWED",
      "This workspace may not link plan docs from that folder",
    );
};

const cache = new Map<string, { expiresAt: number; content: string }>();

export const clearPlanDocCache = (): void => cache.clear();

export const fetchPlanDoc = async (location: {
  repo: string;
  path: string;
  ref?: string | null;
}): Promise<string> => {
  if (!isPlanDocsConfigured())
    throw new PlanDocError("NOT_CONFIGURED", "Plan docs are not configured");

  assertValidDocLocation(location);

  const cacheKey = `${location.repo}|${location.path}|${location.ref ?? ""}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.content;

  const encodedPath = location.path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const url = new URL(
    `https://api.github.com/repos/${location.repo}/contents/${encodedPath}`,
  );
  if (location.ref) url.searchParams.set("ref", location.ref);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github.raw+json",
        Authorization: `Bearer ${process.env.PLAN_DOCS_GITHUB_TOKEN}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "kan-plan-docs",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    throw new PlanDocError("UPSTREAM_ERROR", "Could not reach the docs host");
  }

  if (response.status === 404)
    throw new PlanDocError("NOT_FOUND", "Plan doc not found");

  if (!response.ok)
    throw new PlanDocError(
      "UPSTREAM_ERROR",
      `The docs host answered ${response.status}`,
    );

  const content = await response.text();

  if (content.length > MAX_DOC_BYTES)
    throw new PlanDocError("TOO_LARGE", "Plan doc is too large to display");

  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, content });

  return content;
};

export interface PlanDocSummary {
  title: string | null;
  banner: string | null;
  stateEntries: string[];
  totalStateEntries: number;
}

const isHeading = (line: string, level: number): boolean =>
  new RegExp(`^#{${level}}\\s+\\S`).test(line);

/**
 * The card panel shows only the document's banner (the block quote under the
 * title) and the newest few entries of its STATE section. New entries are
 * written at the top of STATE, so "newest" means "first".
 */
export const summarisePlanDoc = (
  markdown: string,
  entryLimit: number = STATE_ENTRY_LIMIT,
): PlanDocSummary => {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");

  const titleLine = lines.find((line) => isHeading(line, 1));
  const title = titleLine ? titleLine.replace(/^#\s+/, "").trim() : null;

  // Banner: the first run of block-quote lines before any second-level heading.
  const bannerLines: string[] = [];
  for (const line of lines) {
    if (isHeading(line, 2)) break;
    if (line.startsWith(">")) {
      bannerLines.push(line.replace(/^>\s?/, ""));
    } else if (bannerLines.length > 0 && line.trim() !== "") {
      break;
    } else if (bannerLines.length > 0) {
      bannerLines.push("");
    }
  }
  const banner = bannerLines.join("\n").trim() || null;

  // STATE: from its heading to the next heading of the same or higher level.
  const stateStart = lines.findIndex((line) =>
    /^##\s+state\b/i.test(line.trim()),
  );
  const entries: string[] = [];
  if (stateStart !== -1) {
    let current: string[] | null = null;
    for (const line of lines.slice(stateStart + 1)) {
      if (isHeading(line, 1) || isHeading(line, 2)) break;

      if (/^[-*]\s+/.test(line)) {
        if (current) entries.push(current.join("\n").trimEnd());
        current = [line];
      } else if (current) {
        current.push(line);
      }
    }
    if (current) entries.push(current.join("\n").trimEnd());
  }

  return {
    title,
    banner,
    stateEntries: entries.slice(0, entryLimit),
    totalStateEntries: entries.length,
  };
};
