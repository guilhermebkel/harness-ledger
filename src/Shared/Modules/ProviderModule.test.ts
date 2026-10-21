import { describe, expect, it } from "vitest";
import { ProviderModule } from "@/Shared/Modules/ProviderModule.ts";

describe("ProviderModule.create()", () => {
  it("creates the default provider", () => {
    expect(ProviderModule.create().type).toBe(ProviderModule.DEFAULT_PROVIDER);
  });

  it.each(["claude-code", "codex", "cursor"] as const)("creates the %s provider", (type) => {
    expect(ProviderModule.create(type).type).toBe(type);
  });
});

describe("ProviderModule.isProviderType()", () => {
  it("knows which provider types exist", () => {
    expect(ProviderModule.types()).toStrictEqual(["claude-code", "codex", "cursor"]);
    expect(ProviderModule.isProviderType("codex")).toBe(true);
    expect(ProviderModule.isProviderType("cursor")).toBe(true);
    expect(ProviderModule.isProviderType("toString")).toBe(false);
    expect(ProviderModule.isProviderType("windsurf")).toBe(false);
  });
});
