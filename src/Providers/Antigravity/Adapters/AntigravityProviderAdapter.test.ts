import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AntigravityProviderAdapter } from "@/Providers/Antigravity/Adapters/AntigravityProviderAdapter.ts";
import type { AntigravityFixture } from "@/Providers/Antigravity/Protocols/AntigravityFixtureProtocol.ts";
import { AntigravityFixtureUtil } from "@/Providers/Antigravity/Utils/AntigravityFixtureUtil.ts";
import type { TranscriptFile } from "@/Shared/Protocols/ProviderProtocol.ts";
import type { SessionFacts } from "@/Shared/Protocols/SessionProtocol.ts";
import { CollectionUtil } from "@/Shared/Utils/CollectionUtil.ts";

const { FAKE_SECRETS } = AntigravityFixtureUtil;
const adapter = new AntigravityProviderAdapter();

let testFixture: AntigravityFixture;
let cleanEnv: () => void;
let parsedFacts: SessionFacts;

const extractSessionIds = (items: TranscriptFile[]): string[] =>
  items.map((entry) => entry.sessionId).sort(CollectionUtil.compareCodeUnits);

beforeAll(async () => {
  testFixture = AntigravityFixtureUtil.makeFixture();
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
  it("finds the sessions associated with the project", async () => {
    const transcripts = await adapter.discoverTranscripts({ projectDir: testFixture.projectDir });
    expect(extractSessionIds(transcripts)).toStrictEqual(["s1", "s2"]);
    const s1 = transcripts.find((transcript) => transcript.sessionId === "s1");
    expect(s1?.isExactProject).toBe(true);
  });

  it("reads every project's sessions on request, including unassociated ones", async () => {
    const transcripts = await adapter.discoverTranscripts({
      projectDir: testFixture.projectDir,
      shouldReadAllProjects: true,
    });
    expect(extractSessionIds(transcripts)).toStrictEqual(["s1", "s2", "s_other", "s_unassociated"]);
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
    expect(parsedFacts.prompts.map((prompt) => prompt.text)).toStrictEqual([
      "Fix the login bug",
      "No, keep the tests untouched",
      "Check repo with token [REDACTED]",
    ]);
    expect(parsedFacts.prompts.map((prompt) => prompt.isCorrection)).toStrictEqual([false, true, false]);
  });

  it("extracts usage per assistant message without duplicate counting across continued turns", () => {
    expect(parsedFacts.messages).toHaveLength(3);
    expect(parsedFacts.messages.map((message) => message.usage)).toStrictEqual([
      { input: 500, output: 100, cacheRead: 0, cacheWrite: 0 },
      { input: 400, output: 80, cacheRead: 500, cacheWrite: 0 },
      { input: 300, output: 60, cacheRead: 700, cacheWrite: 0 },
    ]);
    expect(parsedFacts.messages.every((message) => message.model === undefined)).toBe(true);
  });

  it("parses timestamps and summarizes thread activity", () => {
    expect(parsedFacts.startedAtMs).toBe(Date.parse("2026-11-05T10:00:00.000Z"));
    expect(parsedFacts.endedAtMs).toBe(Date.parse("2026-11-05T10:02:09.000Z"));
    expect(parsedFacts.activeMs).toBeGreaterThan(0);
    expect(parsedFacts.threads).toHaveLength(1);
  });

  it("records API errors and marks cost partial", () => {
    expect(parsedFacts.apiErrors.map((error) => error.code)).toStrictEqual(["API error rate limited"]);
    expect(parsedFacts.reported.isCostPartial).toBe(true);
    expect(parsedFacts.reported.costUsd).toBeUndefined();
  });

  it("counts malformed lines as unparsed and records unknown record types", () => {
    expect(parsedFacts.unparsedLines).toBe(1);
    expect(parsedFacts.unknownLines).toStrictEqual([
      { type: "brand_new_event", keys: ["detail", "source", "step_index", "type"], count: 1 },
    ]);
  });

  it("redacts fake secrets from prompts and output", () => {
    const serialized = JSON.stringify(parsedFacts);
    expect(serialized).toContain("[REDACTED]");
    expect(serialized).not.toContain(FAKE_SECRETS.bearerToken);
  });
});
