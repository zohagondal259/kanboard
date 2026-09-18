import { afterEach, describe, expect, it } from "vitest";

import { canCreateWorkspace } from "./workspaceCreation.js";

describe("canCreateWorkspace", () => {
  afterEach(() => {
    delete process.env.WORKSPACE_CREATOR_EMAILS;
  });

  it("allows everyone when the setting is unset", () => {
    expect(canCreateWorkspace("anyone@example.com")).toBe(true);
  });

  it("allows everyone when the setting is empty or only separators", () => {
    process.env.WORKSPACE_CREATOR_EMAILS = " , ,";

    expect(canCreateWorkspace("anyone@example.com")).toBe(true);
  });

  it("allows only listed emails when the setting is set", () => {
    process.env.WORKSPACE_CREATOR_EMAILS = "owner@example.com,team@example.com";

    expect(canCreateWorkspace("owner@example.com")).toBe(true);
    expect(canCreateWorkspace("team@example.com")).toBe(true);
    expect(canCreateWorkspace("client@example.com")).toBe(false);
  });

  it("ignores case and surrounding whitespace", () => {
    process.env.WORKSPACE_CREATOR_EMAILS =
      " Owner@Example.com , team@example.com";

    expect(canCreateWorkspace("owner@example.COM")).toBe(true);
    expect(canCreateWorkspace(" team@example.com ")).toBe(true);
  });

  it("does not match on a partial address", () => {
    process.env.WORKSPACE_CREATOR_EMAILS = "owner@example.com";

    expect(canCreateWorkspace("owner@example.com.evil.test")).toBe(false);
    expect(canCreateWorkspace("not-owner@example.com")).toBe(false);
  });

  it("refuses a missing email when the setting is set", () => {
    process.env.WORKSPACE_CREATOR_EMAILS = "owner@example.com";

    expect(canCreateWorkspace(undefined)).toBe(false);
    expect(canCreateWorkspace(null)).toBe(false);
    expect(canCreateWorkspace("")).toBe(false);
  });
});
