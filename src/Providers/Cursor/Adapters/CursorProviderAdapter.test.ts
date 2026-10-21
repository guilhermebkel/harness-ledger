import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TranscriptFile } from "@/Shared/Protocols/ProviderProtocol.ts";
import type { SessionFacts, ToolCall } from "@/Shared/Protocols/SessionProtocol.ts";
import { CollectionUtil } from "@/Shared/Utils/CollectionUtil.ts";
import type { CursorFixture } from "@/Providers/Cursor/Protocols/CursorFixtureProtocol.ts";
import { CursorProviderAdapter } from "@/Providers/Cursor/Adapters/CursorProviderAdapter.ts";
import { CursorFixtureUtil } from "@/Providers/Cursor/Utils/CursorFixtureUtil.ts";

const { FAKE_SECRETS } = CursorFixtureUtil;
const LOGIN_FILE = "/work/my-app/src/login.ts";

let fixture: CursorFixture;
let restoreEnv: () => void;
let facts: SessionFacts;
const adapter = new CursorProviderAdapter();

beforeAll(async () => {
  fixture = CursorFixtureUtil.makeFixture();
  CursorFixtureUtil.writeHarness(fixture);
  CursorFixtureUtil.writeSessions(fixture);
  restoreEnv = CursorFixtureUtil.useFixtureEnv(fixture);
  const transcripts = await adapter.discoverTranscripts({ projectDir: fixture.projectDir });
  const main = transcripts.find((transcript) => transcript.sessionId === "c1");
  if (!main) {
    throw new Error("Missing session c1");
  }
  facts = await adapter.parseSession(main);
});

afterAll(() => {
  restoreEnv();
  rmSync(fixture.root, { recursive: true, force: true });
});

function idsOf(transcripts: TranscriptFile[]): string[] {
  return transcripts.map((transcript) => transcript.sessionId).sort(CollectionUtil.compareCodeUnits);
}

function toolByName(name: string): ToolCall {
  const call = facts.tools.find((candidate) => candidate.name === name);
  if (!call) {
    throw new Error(`Missing tool call ${name}`);
  }
  return call;
}

describe("CursorProviderAdapter.discoverTranscripts()", () => {
  it("finds this project's transcripts and attaches the subagent ones to their parent", async () => {
    const transcripts = await adapter.discoverTranscripts({ projectDir: fixture.projectDir });
    expect(idsOf(transcripts)).toStrictEqual(["c1"]);
    expect(transcripts[0]?.subagentFiles).toHaveLength(1);
    expect(transcripts[0]?.isExactProject).toBe(true);
  });

  it("reads every project's transcripts on request", async () => {
    const { projectDir } = fixture;
    const transcripts = await adapter.discoverTranscripts({ projectDir, shouldReadAllProjects: true });
    expect(idsOf(transcripts)).toStrictEqual(["c1", "o1"]);
  });
});

describe("CursorProviderAdapter.parseSession()", () => {
  it("takes the person's words from the user query, not from attached context", () => {
    expect(facts.prompts.map((prompt) => prompt.text)).toStrictEqual([
      "Fix the login bug",
      "No, keep the tests untouched",
    ]);
  });

  it("describes each tool call by its kind", () => {
    expect(toolByName("ReadFile")).toMatchObject({ key: "Read", category: "read", filePath: LOGIN_FILE });
    expect(toolByName("Grep")).toMatchObject({ category: "search", summary: "login" });
    expect(toolByName("StrReplace")).toMatchObject({ key: "Edit", category: "edit", filePath: LOGIN_FILE });
    expect(toolByName("ApplyPatch")).toMatchObject({ key: "Edit", category: "edit", filePath: LOGIN_FILE });
    expect(toolByName("Subagent")).toMatchObject({ category: "delegation", subagentType: "explorer" });
    expect(toolByName("CallMcpTool")).toMatchObject({ key: "github", category: "mcp" });
    expect(toolByName("Brand_New_Tool")).toMatchObject({ key: "Brand_New_Tool", category: "other" });
    expect(facts.tools.find((call) => call.key === "npm test")?.category).toBe("shell");
  });

  it("reports no result, since Cursor transcripts record none", () => {
    expect(facts.tools).toHaveLength(10);
    expect(facts.tools.every((call) => call.result === undefined)).toBe(true);
    expect(facts.reported.isCostPartial).toBe(true);
  });

  it("gives the subagent file's calls to its own thread", () => {
    const glob = facts.tools.find((call) => call.name === "Glob");
    expect(glob?.thread).toStrictEqual({ id: "sub1", agentType: "subagent" });
    expect(facts.files).toHaveLength(2);
  });

  it("records a failed turn as an API error", () => {
    expect(facts.apiErrors.map((error) => error.code)).toStrictEqual(["rate limited"]);
  });

  it("counts rows it does not know without failing", () => {
    expect(facts.unparsedLines).toBe(1);
    expect(facts.unknownLines).toStrictEqual([{ type: "brand_new_row", keys: ["type", "value"], count: 1 }]);
  });

  it("redacts secrets in commands before they reach the output", () => {
    const serialized = JSON.stringify(facts);
    expect(serialized).toContain("[REDACTED]");
    expect(serialized).not.toContain(FAKE_SECRETS.bearerToken);
  });
});

describe("CursorProviderAdapter.takeInventory()", () => {
  it("maps instructions, rules, skills and MCP server names from project and user", async () => {
    const inventory = await adapter.takeInventory({ projectDir: fixture.projectDir });
    expect(inventory.provider).toBe("cursor");
    expect(inventory.pieces.map((piece) => piece.id)).toStrictEqual([
      "instructions:AGENTS.md",
      "instructions:small-prs",
      "mcp:docs",
      "mcp:github",
      "skill:changelog",
    ]);
    const rule = inventory.pieces.find((piece) => piece.id === "instructions:small-prs");
    expect(rule).toMatchObject({ scope: "project", description: "Keep PRs small", path: ".cursor/rules/small-prs.mdc" });
    expect(JSON.stringify(inventory)).not.toContain(FAKE_SECRETS.githubToken);
  });

  it("leaves user-level pieces out of a project-only inventory", async () => {
    const inventory = await adapter.takeInventory({ projectDir: fixture.projectDir, isProjectOnly: true });
    expect(inventory.pieces.map((piece) => piece.id)).not.toContain("mcp:docs");
    expect(inventory.pieces).toHaveLength(4);
  });
});
