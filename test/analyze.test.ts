import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { takeInventory } from "../src/adapters/claude-code/inventory.js";
import type { Signal } from "../src/analysis/signals.js";
import {
  runAddSuggestions,
  runAnalyze,
  runCompare,
  runListSuggestions,
  runSetSuggestionStatus,
  suggestionId,
} from "../src/commands/index.js";
import {
  FAKE_SECRETS,
  makeFixture,
  useFixtureEnv,
  writeHarness,
  writeHistory,
  writeTestRunnerSession,
  type Fixture,
} from "./helpers/fixture.js";

let fixture: Fixture;
let restoreEnv: () => void;

beforeAll(() => {
  fixture = makeFixture();
  writeHarness(fixture);
  writeHistory(fixture);
  restoreEnv = useFixtureEnv(fixture);
});

afterAll(() => {
  restoreEnv();
  rmSync(fixture.root, { recursive: true, force: true });
});

function commonOptions() {
  return { projectDir: fixture.projectDir, dataDir: fixture.dataDir };
}

function signalById(signals: Signal[], id: string): Signal {
  const signal = signals.find((candidate) => candidate.id === id);
  if (!signal) {
    throw new Error(`Missing signal ${id}; got ${signals.map((candidate) => candidate.id).join(", ")}`);
  }
  return signal;
}

describe("inventory", () => {
  it("maps project and user pieces without storing secret values", async () => {
    const inventory = await takeInventory({ projectDir: fixture.projectDir, claudeHomeDir: fixture.claudeHome });
    expect(inventory.pieces.map((piece) => piece.id)).toEqual(
      expect.arrayContaining([
        "instructions:project",
        "agent:test-runner",
        "agent:code-reviewer",
        "skill:changelog",
        "mcp:github",
        "hook:project:PreToolUse:Bash#0",
        "settings:permissions-project",
      ]),
    );
    expect(inventory.pieces.find((piece) => piece.id === "agent:test-runner")).toMatchObject({
      model: "haiku",
      tools: ["Bash", "Read"],
      scope: "project",
      isEditable: true,
    });
    expect(inventory.retention).toEqual({ days: 60, source: ".claude/settings.json" });
    const serialized = JSON.stringify(inventory);
    expect(serialized).not.toContain(FAKE_SECRETS.githubToken);
    expect(serialized).not.toContain(FAKE_SECRETS.anthropicKey);
  });

  it("can leave out user-level pieces", async () => {
    const inventory = await takeInventory({
      projectDir: fixture.projectDir,
      claudeHomeDir: fixture.claudeHome,
      isProjectOnly: true,
    });
    expect(inventory.pieces.some((piece) => piece.scope === "user")).toBe(false);
  });
});

describe("analyze", () => {
  it("finds the enforcement gap, the command that worked and the instruction that already covers it", async () => {
    const analysis = await runAnalyze(commonOptions());
    const npmTest = signalById(analysis.signals, "failed_command:npm test");
    expect(npmTest).toMatchObject({ occurrences: 3, sessions: 3, pieces: ["agent:test-runner"] });
    expect(npmTest.details.recoveredWith).toEqual([{ value: "pnpm test", count: 3 }]);
    expect(npmTest.details.mentions).toEqual(
      expect.arrayContaining([expect.objectContaining({ piece: "instructions:project", line: 3, term: "pnpm test" })]),
    );
    expect(npmTest.cost.activeMinutes).toBeGreaterThan(0);
    expect(npmTest.cost.tokens).toBeGreaterThan(0);
    expect(npmTest.evidence[0]).toMatchObject({ line: 3, thread: "test-runner" });
    expect(npmTest.evidence[0]?.excerpt).toContain("npm ERR!");
  });

  it("finds subagent re-reads, repeated reads, permission denials and repeated requests", async () => {
    const analysis = await runAnalyze(commonOptions());
    const signalIds = analysis.signals.map((signal) => signal.id);
    expect(signalIds).toEqual(
      expect.arrayContaining([
        "subagent_reread:code-reviewer",
        "repeated_read:code-reviewer:src/auth.ts",
        "permission_denied:rm",
      ]),
    );
    expect(analysis.signals.find((signal) => signal.type === "repeated_request")?.sessions).toBe(3);
    expect(signalById(analysis.signals, "permission_denied:rm").pieces).toEqual(["skill:changelog"]);
  });

  it("reports history, totals and per-piece usage", async () => {
    const analysis = await runAnalyze(commonOptions());
    expect(analysis.analyzed.sessions).toBe(6);
    expect(analysis.history).toMatchObject({ transcriptsAvailable: 6, retentionDays: 60 });
    expect(analysis.totals.tokens).toBeGreaterThan(0);
    expect(analysis.totals.lostToFailures.activeMinutes).toBeGreaterThan(0);
    const testRunner = analysis.usage.find((usage) => usage.piece === "agent:test-runner");
    expect(testRunner).toMatchObject({ invocations: 3, sessions: 3, toolErrors: 3 });
    expect(testRunner?.models).toContain("claude-haiku-4-5");
  });

  it("never prints secret values", async () => {
    const serialized = JSON.stringify(await runAnalyze(commonOptions()));
    for (const secret of Object.values(FAKE_SECRETS)) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("reuses the cache on the next run and can focus on one piece", async () => {
    await runAnalyze(commonOptions());
    const secondRun = await runAnalyze(commonOptions());
    expect(secondRun.analyzed).toMatchObject({ parsedNow: 0, fromCache: 6 });
    const focused = await runAnalyze({ ...commonOptions(), focusPieces: ["agent:code-reviewer"] });
    expect(focused.analyzed.sessions).toBe(1);
    expect(focused.signals.every((signal) => signal.pieces.includes("agent:code-reviewer"))).toBe(true);
  });

  it("leaves out excluded sessions", async () => {
    const analysis = await runAnalyze({ ...commonOptions(), excludedSessionIds: ["s5"] });
    expect(analysis.analyzed.sessions).toBe(5);
  });

  it("filters by period", async () => {
    const analysis = await runAnalyze({ ...commonOptions(), since: "2026-09-13" });
    expect(analysis.analyzed.sessions).toBe(3);
  });
});

describe("suggestions", () => {
  it("gives stable ids, never duplicates, and marks signals as handled", async () => {
    const suggestion = {
      title: "Enforce pnpm in test-runner",
      class: "rule_ignored",
      piece: "agent:test-runner",
      signals: ["failed_command:npm test"],
    };
    const firstAdd = await runAddSuggestions({ ...commonOptions(), items: [suggestion] });
    const secondAdd = await runAddSuggestions({ ...commonOptions(), items: [suggestion] });
    const id = suggestionId(suggestion);
    expect(firstAdd.added).toEqual([id]);
    expect(secondAdd.added).toEqual([]);
    expect(secondAdd.existing).toEqual([{ id, status: "pending" }]);

    await runSetSuggestionStatus({ ...commonOptions(), id, status: "rejected", note: "we keep npm in CI" });
    const analysis = await runAnalyze(commonOptions());
    expect(signalById(analysis.signals, "failed_command:npm test").handledBy).toEqual({ suggestionId: id, status: "rejected" });
    expect(await runListSuggestions({ ...commonOptions(), status: "rejected" })).toHaveLength(1);
  });

  it("rejects suggestions without signals or with an unknown class", async () => {
    await expect(runAddSuggestions({ ...commonOptions(), items: [{ title: "x", class: "rule_ignored", signals: [] }] })).rejects.toThrow();
    await expect(runAddSuggestions({ ...commonOptions(), items: [{ title: "x", class: "other", signals: ["a"] }] })).rejects.toThrow();
  });
});

describe("compare", () => {
  it("refuses to call a winner with too few sessions", async () => {
    const result = await runCompare({ ...commonOptions(), piece: "agent:test-runner", changedAt: "2026-09-12" });
    expect(result.verdict).toBe("insufficient_data");
    expect(result.before.sessions).toBe(2);
    expect(result.after.sessions).toBe(1);
  });

  it("shows an improvement when failures stop after the change", async () => {
    for (let sessionIndex = 0; sessionIndex < 5; sessionIndex++) {
      writeTestRunnerSession(fixture, `n${sessionIndex}`, `2026-09-2${sessionIndex}T10:00:00.000Z`, "pnpm test", false);
    }
    writeTestRunnerSession(fixture, "o1", "2026-09-05T10:00:00.000Z", "npm test", true);
    writeTestRunnerSession(fixture, "o2", "2026-09-06T10:00:00.000Z", "npm test", true);

    const result = await runCompare({ ...commonOptions(), piece: "agent:test-runner", changedAt: "2026-09-15" });
    expect(result.before.sessions).toBe(5);
    expect(result.after.sessions).toBe(5);
    expect(result.before.errorRate).toBeGreaterThan(0);
    expect(result.after.errorRate).toBe(0);
    expect(result.verdict).toBe("improved");
  });
});
