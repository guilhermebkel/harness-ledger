import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AntigravityProviderAdapter } from "@/Providers/Antigravity/Adapters/AntigravityProviderAdapter.ts";
import type { AntigravityFixture } from "@/Providers/Antigravity/Protocols/AntigravityFixtureProtocol.ts";
import { AntigravityFixtureUtil } from "@/Providers/Antigravity/Utils/AntigravityFixtureUtil.ts";
import type { TranscriptFile } from "@/Shared/Protocols/ProviderProtocol.ts";
import type { SessionFacts, ToolCall } from "@/Shared/Protocols/SessionProtocol.ts";
import { CollectionUtil } from "@/Shared/Utils/CollectionUtil.ts";

const { FAKE_SECRETS } = AntigravityFixtureUtil;
const AGENTS_PIECE_ID = "instructions:AGENTS.md";
const REDACTED_MASK = "[REDACTED]";
const adapter = new AntigravityProviderAdapter();

let testFixture: AntigravityFixture;
let cleanEnv: () => void;
let parsedFacts: SessionFacts;

const extractSessionIds = (items: TranscriptFile[]): string[] =>
  items.map((entry) => entry.sessionId).sort(CollectionUtil.compareCodeUnits);

const findToolByName = (toolCalls: ToolCall[], name: string): ToolCall => {
  const match = toolCalls.find((candidate) => candidate.name === name);
  if (!match) {
    throw new Error(`Tool call ${name} not found`);
  }
  return match;
};

beforeAll(async () => {
  testFixture = AntigravityFixtureUtil.makeFixture();
  AntigravityFixtureUtil.writeHarness(testFixture);
  AntigravityFixtureUtil.writeSessions(testFixture);
  cleanEnv = AntigravityFixtureUtil.useFixtureEnv(testFixture);
  const { projectDir } = testFixture;
  const discoveredFiles = await adapter.discoverTranscripts({ projectDir });
  const s1Session = discoveredFiles.find((file) => file.sessionId === "s1");
  if (!s1Session) {
    throw new Error("Session s1 not found");
  }
  parsedFacts = await adapter.parseSession(s1Session, { idleMs: 300_000, projectDir });
});

afterAll(() => {
  cleanEnv();
  rmSync(testFixture.root, { force: true, recursive: true });
});

describe("AntigravityProviderAdapter.paths()", () => {
  it("points to the default or configured home directory", () => {
    expect(adapter.type).toBe("antigravity");
    expect(adapter.displayName).toBe("Antigravity");
    expect(adapter.paths().homeDir).toBe(testFixture.antigravityHome);
  });
});

describe("AntigravityProviderAdapter.retentionNote()", () => {
  it("explains that Antigravity preserves transcripts indefinitely", () => {
    expect(adapter.retentionNote()).toContain("Antigravity keeps session transcripts");
  });
});

describe("AntigravityProviderAdapter.discoverTranscripts()", () => {
  it("finds the sessions associated with the project when flag is omitted", async () => {
    const transcripts = await adapter.discoverTranscripts({ projectDir: testFixture.projectDir });
    expect(extractSessionIds(transcripts)).toStrictEqual(["s1", "s2"]);
    const s1 = transcripts.find((transcript) => transcript.sessionId === "s1");
    expect(s1?.isExactProject).toBe(true);
  });

  it("finds the sessions associated with the project when shouldReadAllProjects is explicitly false", async () => {
    const transcripts = await adapter.discoverTranscripts({
      projectDir: testFixture.projectDir,
      shouldReadAllProjects: false,
    });
    expect(extractSessionIds(transcripts)).toStrictEqual(["s1", "s2"]);
  });

  it("reads every project's sessions on request, including unassociated and orphan ones", async () => {
    const transcripts = await adapter.discoverTranscripts({
      projectDir: testFixture.projectDir,
      shouldReadAllProjects: true,
    });
    expect(extractSessionIds(transcripts)).toStrictEqual(["s1", "s2", "s_orphan", "s_other", "s_unassociated"]);
  });

  it("recovers gracefully when last_conversations.json is corrupted and still discovers from history", async () => {
    const corruptedCachePath = join(testFixture.antigravityHome, "cache", "last_conversations.json");
    writeFileSync(corruptedCachePath, "TRUNCATED_JSON_{{{");
    const transcripts = await adapter.discoverTranscripts({ projectDir: testFixture.projectDir });
    expect(extractSessionIds(transcripts)).toStrictEqual(["s1", "s2"]);
  });
});

describe("AntigravityProviderAdapter.parseSession()", () => {
  it("reads the session identity correctly", () => {
    expect(parsedFacts.provider).toBe("antigravity");
    expect(parsedFacts.sessionId).toBe("s1");
    expect(parsedFacts.projectDir).toBe(testFixture.projectDir);
    expect(parsedFacts.files).toHaveLength(1);
  });

  it("extracts user prompts and detects corrections", () => {
    expect(parsedFacts.prompts[0]?.text).toBe("Fix the login bug");
    expect(parsedFacts.prompts[1]?.text).toBe("No, keep the tests untouched");
    expect(parsedFacts.prompts[1]?.isCorrection).toBe(true);
    expect(parsedFacts.prompts[0]?.isCorrection).toBe(false);
  });

  it("redacts secrets crossing the prompt truncation limit before slicing", () => {
    const boundaryPrompt = parsedFacts.prompts[3];
    expect(boundaryPrompt?.text).toContain(REDACTED_MASK);
    expect(boundaryPrompt?.text).not.toContain(FAKE_SECRETS.bearerToken);
    expect(boundaryPrompt?.ref.excerpt).not.toContain(FAKE_SECRETS.bearerToken);
  });

  it("describes native tool calls by their category and redacts inputs", () => {
    const indexPath = join(testFixture.projectDir, "src", "index.ts");
    const utilsPath = join(testFixture.projectDir, "src", "utils.ts");
    const readFile = findToolByName(parsedFacts.tools, "read_file");
    expect(readFile.category).toBe("read");
    expect(readFile.filePath).toBe(indexPath);
    const runCommand = parsedFacts.tools.find((call) => call.name === "run_command" && call.key === "pnpm test");
    expect(runCommand?.category).toBe("shell");
    const editFile = findToolByName(parsedFacts.tools, "edit_file");
    expect(editFile.category).toBe("edit");
    expect(editFile.filePath).toBe(indexPath);
    const writeFile = findToolByName(parsedFacts.tools, "write_file");
    expect(writeFile.category).toBe("edit");
    expect(writeFile.filePath).toBe(utilsPath);
    const manageTask = findToolByName(parsedFacts.tools, "manage_task");
    expect(manageTask.category).toBe("plan");
    const searchWeb = findToolByName(parsedFacts.tools, "search_web");
    expect(searchWeb.category).toBe("search");
    const subagent = findToolByName(parsedFacts.tools, "invoke_subagent");
    expect(subagent.category).toBe("delegation");
    expect(subagent.subagentType).toBe("reviewer");
    const unknownTool = findToolByName(parsedFacts.tools, "unknown_custom_tool");
    expect(unknownTool.category).toBe("other");
  });

  it("omits tool results when pairing is not guaranteed and marks cost partial", () => {
    expect(parsedFacts.tools.length).toBeGreaterThan(0);
    expect(parsedFacts.tools.every((call) => call.result === undefined)).toBe(true);
    expect(parsedFacts.reported.isCostPartial).toBe(true);
    expect(parsedFacts.reported.costUsd).toBeUndefined();
  });

  it("extracts usage per assistant message without duplicate counting across continued turns", () => {
    expect(parsedFacts.messages).toHaveLength(4);
    expect(parsedFacts.messages.map((message) => message.usage)).toStrictEqual([
      { input: 500, output: 100, cacheRead: 0, cacheWrite: 0 },
      { input: 400, output: 80, cacheRead: 500, cacheWrite: 0 },
      { input: 300, output: 60, cacheRead: 700, cacheWrite: 0 },
      { input: 200, output: 40, cacheRead: 800, cacheWrite: 0 },
    ]);
    expect(parsedFacts.messages.every((message) => message.model === undefined)).toBe(true);
  });

  it("parses timestamps and summarizes thread activity", () => {
    expect(parsedFacts.startedAtMs).toBe(Date.parse("2026-11-05T10:00:00.000Z"));
    expect(parsedFacts.endedAtMs).toBe(Date.parse("2026-11-05T10:02:19.000Z"));
    expect(parsedFacts.activeMs).toBeGreaterThan(0);
    expect(parsedFacts.threads).toHaveLength(1);
  });

  it("records API errors from ERROR_MESSAGE lines with redaction and without classifying GENERIC errors as API errors", () => {
    expect(parsedFacts.apiErrors).toHaveLength(1);
    expect(parsedFacts.apiErrors[0]?.code).toContain(REDACTED_MASK);
    expect(parsedFacts.apiErrors[0]?.code).not.toContain(FAKE_SECRETS.bearerToken);
    expect(parsedFacts.apiErrors[0]?.ref.excerpt).not.toContain(FAKE_SECRETS.bearerToken);
  });

  it("records GENERIC ERROR lines in unknownLines without inventing fake tool results", () => {
    const genericShape = parsedFacts.unknownLines?.find((shape) => shape.type === "GENERIC");
    expect(genericShape?.type).toBe("GENERIC");
    expect(genericShape?.count).toBe(1);
    expect(genericShape?.keys).toContain("error");
    expect(genericShape?.keys).toContain("status");
    expect(parsedFacts.tools.every((call) => call.result === undefined)).toBe(true);
  });

  it("counts malformed lines as unparsed and records unknown record types", () => {
    expect(parsedFacts.unparsedLines).toBe(1);
    const brandNew = parsedFacts.unknownLines?.find((shape) => shape.type === "brand_new_event");
    expect(brandNew).toStrictEqual({
      type: "brand_new_event",
      keys: ["detail", "source", "step_index", "type"],
      count: 1,
    });
  });

  it("redacts fake secrets from prompts, tools and serialized output", () => {
    const serialized = JSON.stringify(parsedFacts);
    expect(serialized).toContain(REDACTED_MASK);
    expect(serialized).not.toContain(FAKE_SECRETS.bearerToken);
  });
});

describe("AntigravityProviderAdapter.takeInventory()", () => {
  it("maps project instructions and managed builtin skills", async () => {
    const inventory = await adapter.takeInventory({ projectDir: testFixture.projectDir });
    expect(inventory.provider).toBe("antigravity");
    expect(inventory.pieces.map((piece) => piece.id)).toStrictEqual([
      AGENTS_PIECE_ID,
      "skill:code-review",
    ]);
    const instruction = inventory.pieces.find((piece) => piece.id === AGENTS_PIECE_ID);
    expect(instruction?.scope).toBe("project");
    const skill = inventory.pieces.find((piece) => piece.id === "skill:code-review");
    expect(skill?.scope).toBe("managed");
    expect(inventory.notes).toContain("Settings inspection is omitted to prevent reading authentication tokens.");
  });

  it("leaves managed builtin skills out when isProjectOnly is requested", async () => {
    const inventory = await adapter.takeInventory({
      projectDir: testFixture.projectDir,
      isProjectOnly: true,
    });
    expect(inventory.pieces.map((piece) => piece.id)).toStrictEqual([AGENTS_PIECE_ID]);
  });
});
