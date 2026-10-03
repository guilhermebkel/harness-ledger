import { describe, expect, it } from "vitest";
import { ProviderModule } from "@/Shared/Modules/ProviderModule.ts";

describe("ProviderModule", () => {
  it("creates the default provider", () => {
    expect(ProviderModule.create().type).toBe(ProviderModule.DEFAULT_PROVIDER);
  });

  it("knows which provider types exist", () => {
    expect(ProviderModule.types()).toContain("claude-code");
    expect(ProviderModule.isProviderType("claude-code")).toBe(true);
    expect(ProviderModule.isProviderType("toString")).toBe(false);
    expect(ProviderModule.isProviderType("cursor")).toBe(false);
  });
});
