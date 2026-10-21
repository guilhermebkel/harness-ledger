import { describe, expect, it } from "vitest";
import { CodexTomlUtil } from "@/Providers/Codex/Utils/CodexTomlUtil.ts";

describe("CodexTomlUtil.mcpServerNames()", () => {
  it("lists each server once, ignoring its sub-tables and settings", () => {
    const toml = [
      "model = \"gpt-5.4\"",
      "[mcp_servers.github]",
      "command = \"gh-mcp\"",
      "[mcp_servers.github.env]",
      "GITHUB_TOKEN = \"x\"",
      "[mcp_servers.\"docs\"]",
      "url = \"https://example.com\"",
    ].join("\n");
    expect(CodexTomlUtil.mcpServerNames(toml)).toStrictEqual(["github", "docs"]);
  });
});

describe("CodexTomlUtil.topLevelStrings()", () => {
  it("reads only the asked keys that come before the first table", () => {
    const toml = "name = \"reviewer\" # who\nmodel = \"gpt-5.4\"\neffort = \"high\"\n[extra]\nname = \"other\"\n";
    expect(CodexTomlUtil.topLevelStrings(toml, ["name", "model"])).toStrictEqual({ name: "reviewer", model: "gpt-5.4" });
  });
});
