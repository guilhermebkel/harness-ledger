import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TranscriptFile } from "@/Shared/Protocols/ProviderProtocol.ts";
import type { SessionFacts, ToolCall } from "@/Shared/Protocols/SessionProtocol.ts";
import type { CodexFixture } from "@/Providers/Codex/Protocols/CodexFixtureProtocol.ts";
import { CollectionUtil } from "@/Shared/Utils/CollectionUtil.ts";
import { CodexProviderAdapter } from "@/Providers/Codex/Adapters/CodexProviderAdapter.ts";
import { CodexFixtureUtil } from "@/Providers/Codex/Utils/CodexFixtureUtil.ts";

const IDLE_MS = 5 * 60_000;
const { FAKE_SECRETS } = CodexFixtureUtil;
const PROJECT_PIECE_IDS = ["agent:code-reviewer", "instructions:AGENTS.md", "mcp:github", "skill:changelog"];

let fixture: CodexFixture;
let restoreEnv: () => void;
let facts: SessionFacts;
const adapter = new CodexProviderAdapter();

beforeAll(async () => {
  fixture = CodexFixtureUtil.makeFixture();
  CodexFixtureUtil.writeHarness(fixture);
  CodexFixtureUtil.writeSessions(fixture);
  restoreEnv = CodexFixtureUtil.useFixtureEnv(fixture);
  const transcripts = await adapter.discoverTranscripts({ projectDir: fixture.projectDir });
  const main = transcripts.find((transcript) => transcript.sessionId === "s1");
  if (!main) {
    throw new Error("Missing session s1");
  }
  facts = await adapter.parseSession(main, { idleMs: IDLE_MS, projectDir: fixture.projectDir });
});

afterAll(() => {
  restoreEnv();
  rmSync(fixture.root, { recursive: true, force: true });
});

function idsOf(transcripts: TranscriptFile[]): string[] {
  return transcripts.map((transcript) => transcript.sessionId).sort(CollectionUtil.compareCodeUnits);
}

function toolById(id: string): ToolCall {
  const call = facts.tools.find((candidate) => candidate.id === id);
  if (!call) {
    throw new Error(`Missing tool call ${id}`);
  }
  return call;
}

describe("CodexProviderAdapter.discoverTranscripts()", () => {
  it("finds the sessions run inside this project and attaches subagent rollouts to their parent", async () => {
    const transcripts = await adapter.discoverTranscripts({ projectDir: fixture.projectDir });
    expect(idsOf(transcripts)).toStrictEqual(["nested", "s1"]);
    const main = transcripts.find((transcript) => transcript.sessionId === "s1");
    expect(main?.subagentFiles).toHaveLength(1);
    expect(main?.isExactProject).toBe(true);
    const nested = transcripts.find((transcript) => transcript.sessionId === "nested");
    expect(nested?.isExactProject).toBe(false);
  });

  it("reads every project's sessions on request", async () => {
    const { projectDir } = fixture;
    const transcripts = await adapter.discoverTranscripts({ projectDir, shouldReadAllProjects: true });
    expect(idsOf(transcripts)).toStrictEqual(["nested", "other", "s1"]);
  });
});

describe("CodexProviderAdapter.parseSession()", () => {
  it("reads the session's identity from its first line", () => {
    expect(facts.provider).toBe("codex");
    expect(facts.sessionId).toBe("s1");
    expect(facts.projectDir).toBe(fixture.projectDir);
    expect(facts.gitBranch).toBe("main");
    expect(facts.agentVersion).toBe("0.119.0");
    expect(facts.files).toHaveLength(2);
  });

  it("counts only what the person typed as prompts, plus the interruption", () => {
    expect(facts.prompts.map((prompt) => [prompt.text, prompt.isInterruption])).toStrictEqual([
      ["Add a retry to the fetcher", false],
      ["[Request interrupted by user]", true],
      ["No, use exponential backoff instead", false],
    ]);
  });

  it("describes each tool call by its kind", () => {
    expect(toolById("a1")).toMatchObject({ key: "npm test", category: "shell" });
    expect(toolById("a2")).toMatchObject({ key: "pnpm test", category: "shell" });
    expect(toolById("a3")).toMatchObject({ key: "apply_patch", category: "edit", filePath: "src/fetcher.ts" });
    expect(toolById("a4")).toMatchObject({ key: "git status", category: "shell" });
    expect(toolById("a5")).toMatchObject({ key: "github", category: "mcp" });
    expect(toolById("a6").category).toBe("plan");
    expect(toolById("a7")).toMatchObject({ category: "delegation", subagentType: "explorer" });
    expect(facts.tools.find((call) => call.category === "search")?.summary).toBe("node fetch retry");
  });

  it("reads each result from the exit code in the output", () => {
    expect(toolById("a1").result).toMatchObject({ isError: true, kind: "error" });
    expect(toolById("a2").result).toMatchObject({ isError: false, kind: "ok" });
    expect(toolById("a3").result).toMatchObject({ isError: false, kind: "ok" });
    expect(toolById("a8").result).toMatchObject({ isError: true, kind: "error" });
    expect(toolById("a6").result).toBeUndefined();
  });

  it("reports a declined command as rejected by the person", () => {
    expect(toolById("a9").result).toMatchObject({ isError: true, kind: "user_rejected" });
  });

  it("counts a model step's tokens once, even when the total is repeated", () => {
    const mainMessages = facts.messages.filter((message) => message.thread.id === "main");
    expect(mainMessages.map((message) => message.usage)).toStrictEqual([
      { input: 500, output: 100, cacheRead: 400, cacheWrite: 0 },
      { input: 500, output: 200, cacheRead: 800, cacheWrite: 0 },
      { input: 400, output: 100, cacheRead: 0, cacheWrite: 0 },
    ]);
    expect(mainMessages.every((message) => message.model === "gpt-5.4")).toBe(true);
  });

  it("gives the subagent's calls to the subagent's thread", () => {
    const rg = facts.tools.find((call) => call.key === "rg");
    expect(rg?.thread).toStrictEqual({ id: "child1", agentType: "explorer" });
    expect(facts.threads.map((thread) => thread.thread.id).sort(CollectionUtil.compareCodeUnits)).toStrictEqual(["child1", "main"]);
    expect(facts.messages.filter((message) => message.thread.id === "child1")).toHaveLength(1);
  });

  it("records compactions once and the provider's own turn durations", () => {
    expect(facts.compactions).toHaveLength(1);
    expect(facts.reported.turns.map((turn) => turn.durationMs)).toStrictEqual([90_000]);
    expect(facts.reported.isCostPartial).toBe(true);
  });

  it("counts lines it does not know without failing", () => {
    expect(facts.unparsedLines).toBe(1);
    expect(facts.unknownLines).toStrictEqual([
      { type: "brand_new_line", keys: ["payload", "timestamp", "type"], count: 1 },
      { type: "event_msg:brand_new_event", keys: ["type", "value"], count: 1 },
    ]);
  });

  it("redacts secrets in commands before they reach the output", () => {
    const serialized = JSON.stringify(facts);
    expect(serialized).toContain("[REDACTED]");
    expect(serialized).not.toContain(FAKE_SECRETS.bearerToken);
  });
});

describe("CodexProviderAdapter.takeInventory()", () => {
  it("maps instructions, skills, subagents and MCP servers from project and user", async () => {
    const inventory = await adapter.takeInventory({ projectDir: fixture.projectDir });
    expect(inventory.provider).toBe("codex");
    expect(inventory.pieces.map((piece) => piece.id)).toStrictEqual([
      ...PROJECT_PIECE_IDS.slice(0, 2),
      "instructions:AGENTS.md@user",
      ...PROJECT_PIECE_IDS.slice(2),
      "skill:release-notes",
    ]);
    const changelog = inventory.pieces.find((piece) => piece.id === "skill:changelog");
    expect(changelog).toMatchObject({ scope: "project", description: "Generates changelog entries", files: ["format.md"] });
    const reviewer = inventory.pieces.find((piece) => piece.id === "agent:code-reviewer");
    expect(reviewer).toMatchObject({ description: "Reviews diffs", model: "gpt-5.4", path: ".codex/agents/reviewer.toml" });
  });

  it("keeps only names for MCP servers, never their settings", async () => {
    const inventory = await adapter.takeInventory({ projectDir: fixture.projectDir });
    expect(JSON.stringify(inventory)).not.toContain(FAKE_SECRETS.githubToken);
  });

  it("leaves user-level pieces out of a project-only inventory", async () => {
    const inventory = await adapter.takeInventory({ projectDir: fixture.projectDir, isProjectOnly: true });
    expect(inventory.pieces.map((piece) => piece.id)).toStrictEqual(PROJECT_PIECE_IDS);
  });
});
