// Integration test: runs the command end to end against a fake Claude Code home, the only
// provider today. Shared logic is exercised through a real provider on purpose.

import { rmSync } from "node:fs";
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
        "repeated_read:code-reviewer:src/auth.ts",
        "permission_denied:rm",
      ]),
    );
    expect(analysis.signals.find((signal) => signal.type === "repeated_request")?.sessions).toBe(3);
    expect(signalById(analysis.signals, "permission_denied:rm").pieces).toEqual(["skill:changelog"]);
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
