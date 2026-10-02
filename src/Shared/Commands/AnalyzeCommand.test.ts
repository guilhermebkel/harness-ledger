// Integration test: runs the command end to end against a fake Claude Code home, the only
// provider today. Shared logic is exercised through a real provider on purpose.

import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ClaudeCodeFixtureUtil, type Fixture } from "@/Providers/ClaudeCode/Utils/ClaudeCodeFixtureUtil.js";
import type { Signal } from "@/Shared/Protocols/SignalProtocol.js";
import { AnalyzeCommand } from "./AnalyzeCommand.js";

const { FAKE_SECRETS } = ClaudeCodeFixtureUtil;
const command = new AnalyzeCommand();

let fixture: Fixture;
let restoreEnv: () => void;

beforeAll(() => {
  fixture = ClaudeCodeFixtureUtil.makeFixture();
  ClaudeCodeFixtureUtil.writeHarness(fixture);
  ClaudeCodeFixtureUtil.writeHistory(fixture);
  restoreEnv = ClaudeCodeFixtureUtil.useFixtureEnv(fixture);
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

describe("AnalyzeCommand", () => {
  it("finds the enforcement gap, the command that worked and the instruction that already covers it", async () => {
    const analysis = await command.run(commonOptions());
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
    const analysis = await command.run(commonOptions());
    const signalIds = analysis.signals.map((signal) => signal.id);
    expect(signalIds).toEqual(
      expect.arrayContaining([
        "subagent_reread:code-reviewer",
        "repeated_read:code-reviewer",
        "permission_denied:rm",
      ]),
    );
    expect(analysis.signals.find((signal) => signal.type === "repeated_request")?.sessions).toBe(3);
    expect(signalById(analysis.signals, "permission_denied:rm").pieces).toEqual(["skill:changelog"]);
    expect(signalById(analysis.signals, "repeated_read:code-reviewer").details.files).toEqual([
      { value: "src/auth.ts", count: 3 },
    ]);
  });

  it("reports the provider, history, totals and per-piece usage", async () => {
    const analysis = await command.run(commonOptions());
    expect(analysis.provider).toBe("claude-code");
    expect(analysis.analyzed.sessions).toBe(6);
    expect(analysis.history).toMatchObject({ transcriptsAvailable: 6, retentionDays: 60 });
    expect(analysis.history.note).toContain("Claude Code");
    expect(analysis.totals.tokens).toBeGreaterThan(0);
    expect(analysis.totals.lostToFailures.activeMinutes).toBeGreaterThan(0);
    const testRunner = analysis.usage.find((usage) => usage.piece === "agent:test-runner");
    expect(testRunner).toMatchObject({ invocations: 3, sessions: 3, toolErrors: 3 });
    expect(testRunner?.models).toContain("claude-haiku-4-5");
  });

  it("never prints secret values", async () => {
    const serialized = JSON.stringify(await command.run(commonOptions()));
    for (const secret of Object.values(FAKE_SECRETS)) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("reuses the cache on the next run and can focus on one piece", async () => {
    await command.run(commonOptions());
    const secondRun = await command.run(commonOptions());
    expect(secondRun.analyzed).toMatchObject({ parsedNow: 0, fromCache: 6 });
    const focused = await command.run({ ...commonOptions(), focusPieces: ["agent:code-reviewer"] });
    expect(focused.analyzed.sessions).toBe(1);
    expect(focused.signals.every((signal) => signal.pieces.includes("agent:code-reviewer"))).toBe(true);
  });

  it("leaves out excluded sessions", async () => {
    const analysis = await command.run({ ...commonOptions(), excludedSessionIds: ["s5"] });
    expect(analysis.analyzed.sessions).toBe(5);
  });

  it("filters by period", async () => {
    const analysis = await command.run({ ...commonOptions(), since: "2026-09-13" });
    expect(analysis.analyzed.sessions).toBe(3);
  });
});

describe("AnalyzeCommand on cases seen in real sessions", () => {
  let realFixture: Fixture;
  let restoreRealEnv: () => void;

  beforeAll(() => {
    restoreEnv();
    realFixture = ClaudeCodeFixtureUtil.makeFixture();
    ClaudeCodeFixtureUtil.writeHarness(realFixture);
    ClaudeCodeFixtureUtil.writeRealCasesSession(realFixture, "real1", "2026-09-20T10:00:00.000Z");
    ClaudeCodeFixtureUtil.writeRealCasesSession(realFixture, "real2", "2026-09-21T10:00:00.000Z");
    restoreRealEnv = ClaudeCodeFixtureUtil.useFixtureEnv(realFixture);
  });

  afterAll(() => {
    restoreRealEnv();
    restoreEnv = ClaudeCodeFixtureUtil.useFixtureEnv(fixture);
    rmSync(realFixture.root, { recursive: true, force: true });
  });

  async function analyzeReal() {
    return command.run({ projectDir: realFixture.projectDir, dataDir: realFixture.dataDir });
  }

  it("counts rejected plans and queued pushback as corrections, not permission problems", async () => {
    const analysis = await analyzeReal();
    expect(analysis.signals.some((signal) => signal.id === "permission_denied:ExitPlanMode")).toBe(false);
    const correction = signalById(analysis.signals, "user_correction:main");
    expect(correction).toMatchObject({ occurrences: 4, sessions: 2 });
    expect(correction.evidence.some((evidence) => evidence.excerpt?.startsWith("rejected"))).toBe(true);
  });

  it("reports auto-mode blocks as permission denials with the classifier's reason", async () => {
    const analysis = await analyzeReal();
    const denied = signalById(analysis.signals, "permission_denied:cat");
    expect(denied.occurrences).toBe(4);
    expect(denied.details.errors?.[0]?.value).toContain("Credential Exploration");
    expect(analysis.signals.some((signal) => signal.id === "failed_command:cat")).toBe(false);
  });

  it("groups failing commands by what actually failed", async () => {
    const analysis = await analyzeReal();
    const python = signalById(analysis.signals, "failed_command:python3 report.py");
    expect(python.details.errors).toEqual([{ value: "ModuleNotFoundError: No module named '…'", count: 2 }]);
    expect(signalById(analysis.signals, "failed_command:git stash").sessions).toBe(2);
  });

  it("leaves models without a known price unpriced and says which", async () => {
    const analysis = await analyzeReal();
    expect(analysis.totals.unpricedModels).toEqual(["glm-5.2"]);
    const usageWithGlm = analysis.usage.find((usage) => usage.models.includes("glm-5.2"));
    expect(usageWithGlm).toBeDefined();
  });
});

describe("AnalyzeCommand on data Claude Code computes itself", () => {
  let reportFixture: Fixture;
  let restoreReportEnv: () => void;

  beforeAll(() => {
    restoreEnv();
    reportFixture = ClaudeCodeFixtureUtil.makeFixture();
    const agentFile = join(reportFixture.projectDir, ".claude", "agents", "migrations-writer.md");
    writeFileSync(agentFile, "---\nname: migrations-writer\ndescription: Writes migrations\nmodel: glm-5.3\n---\nWrite it.\n");
    ClaudeCodeFixtureUtil.writeProviderReportSession(reportFixture, "rep1", "2026-09-22T10:00:00.000Z");
    ClaudeCodeFixtureUtil.writeProviderReportSession(reportFixture, "rep2", "2026-09-23T10:00:00.000Z");
    restoreReportEnv = ClaudeCodeFixtureUtil.useFixtureEnv(reportFixture);
  });

  afterAll(() => {
    restoreReportEnv();
    restoreEnv = ClaudeCodeFixtureUtil.useFixtureEnv(fixture);
    rmSync(reportFixture.root, { recursive: true, force: true });
  });

  async function analyzeReport() {
    return command.run({ projectDir: reportFixture.projectDir, dataDir: reportFixture.dataDir });
  }

  it("reports repeated model API errors with the failing model and the subagent that hit them", async () => {
    const analysis = await analyzeReport();
    const apiError = signalById(analysis.signals, "api_error:model_not_found");
    expect(apiError).toMatchObject({ occurrences: 4, sessions: 2, pieces: ["agent:migrations-writer"] });
    expect(apiError.details.models).toEqual([{ value: "glm-5.3", count: 4 }]);
    expect(apiError.cost.activeMinutes).toBeGreaterThan(0);
  });

  it("shows the provider's own cost and turn time next to the estimates", async () => {
    const analysis = await analyzeReport();
    expect(analysis.totals.reportedByProvider).toEqual({
      costUsd: 4,
      sessionsWithCost: 2,
      isCostPartial: true,
      turnMinutes: 4,
      turns: 4,
    });
  });

  it("attributes a subagent's calls and tokens to the skill it was running", async () => {
    const analysis = await analyzeReport();
    const skillUsage = analysis.usage.find((usage) => usage.piece === "skill:db-migrations");
    expect(skillUsage).toMatchObject({ toolCalls: 2, sessions: 2 });
    expect(skillUsage?.tokens).toBeGreaterThan(0);
  });
});
