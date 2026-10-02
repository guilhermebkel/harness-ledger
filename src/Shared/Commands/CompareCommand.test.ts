// Integration test against a fake Claude Code home (see AnalyzeCommand.test.ts).

import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ClaudeCodeFixtureUtil, type Fixture, type TestRunOptions } from "@/Providers/ClaudeCode/Utils/ClaudeCodeFixtureUtil.js";
import { CompareCommand } from "./CompareCommand.js";

const command = new CompareCommand();

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

describe("CompareCommand", () => {
  it("refuses to call a winner with too few sessions", async () => {
    const result = await command.run({ ...commonOptions(), piece: "agent:test-runner", changedAt: "2026-09-12" });
    expect(result.verdict).toBe("insufficient_data");
    expect(result.before.sessions).toBe(2);
    expect(result.after.sessions).toBe(1);
  });

  it("shows an improvement when failures stop after the change", async () => {
    for (let sessionIndex = 0; sessionIndex < 5; sessionIndex++) {
      const startedAt = `2026-09-2${sessionIndex}T10:00:00.000Z`;
      ClaudeCodeFixtureUtil.writeTestRunnerSession(fixture, `n${sessionIndex}`, startedAt, "pnpm test", false);
    }
    ClaudeCodeFixtureUtil.writeTestRunnerSession(fixture, "o1", "2026-09-05T10:00:00.000Z", "npm test", true);
    ClaudeCodeFixtureUtil.writeTestRunnerSession(fixture, "o2", "2026-09-06T10:00:00.000Z", "npm test", true);

    const result = await command.run({ ...commonOptions(), piece: "agent:test-runner", changedAt: "2026-09-15" });
    expect(result.before.sessions).toBe(5);
    expect(result.after.sessions).toBe(5);
    expect(result.before.errorRate).toBeGreaterThan(0);
    expect(result.after.errorRate).toBe(0);
    expect(result.verdict).toBe("improved");
  });

  it("explains when it can't tell when the piece changed", async () => {
    await expect(command.run({ ...commonOptions(), piece: "agent:missing" })).rejects.toThrow(/--at/);
  });
});

describe("CompareCommand counts time as much as cost", () => {
  let timeFixture: Fixture;
  let restoreTimeEnv: () => void;

  beforeAll(() => {
    restoreEnv();
    timeFixture = ClaudeCodeFixtureUtil.makeFixture();
    ClaudeCodeFixtureUtil.writeHarness(timeFixture);
    restoreTimeEnv = ClaudeCodeFixtureUtil.useFixtureEnv(timeFixture);
  });

  afterAll(() => {
    restoreTimeEnv();
    restoreEnv = ClaudeCodeFixtureUtil.useFixtureEnv(fixture);
    rmSync(timeFixture.root, { recursive: true, force: true });
  });

  function writeSide(prefix: string, firstDay: number, runOptions: TestRunOptions): void {
    for (let sessionIndex = 0; sessionIndex < 5; sessionIndex++) {
      const startedAt = `2026-09-${String(firstDay + sessionIndex).padStart(2, "0")}T10:00:00.000Z`;
      ClaudeCodeFixtureUtil.writeTestRunnerSession(
        timeFixture, `${prefix}${sessionIndex}`, startedAt, "pnpm test", false, runOptions,
      );
    }
  }

  async function compareAt(changedAt: string) {
    return command.run({
      projectDir: timeFixture.projectDir,
      dataDir: timeFixture.dataDir,
      piece: "agent:test-runner",
      changedAt,
      shouldSkipCache: true,
    });
  }

  it("calls a change that keeps the cost but makes the work faster an improvement", async () => {
    writeSide("slow", 1, { commandSeconds: 200 });
    writeSide("fast", 10, { commandSeconds: 20 });
    const result = await compareAt("2026-09-08");
    expect(result.verdict).toBe("improved");
    expect(result.moves).toEqual([
      { metric: "activeMinutesPerInvocation", relativeChange: expect.any(Number) as number, direction: "better" },
    ]);
    expect(result.moves[0]?.relativeChange).toBeLessThan(-0.5);
    expect(result.deltas.usdPerInvocation).toBe(0);
  });

  it("calls faster but more expensive a mixed result", async () => {
    writeSide("pricey", 20, { commandSeconds: 20, model: "claude-opus-5" });
    const result = await compareAt("2026-09-18");
    expect(result.verdict).toBe("mixed");
    const metricToDirection = Object.fromEntries(result.moves.map((move) => [move.metric, move.direction]));
    // Before the change: the slow and the fast sessions; after: fast, on a pricier model.
    expect(metricToDirection).toEqual({ activeMinutesPerInvocation: "better", usdPerInvocation: "worse" });
  });
});
