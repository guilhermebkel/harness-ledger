import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ClaudeCodeFixtureUtil, type Fixture, type TestRunOptions } from "@/Providers/ClaudeCode/Utils/ClaudeCodeFixtureUtil.ts";
import { CompareCommand } from "@/Shared/Commands/CompareCommand.ts";

const TEST_RUNNER_PIECE = "agent:test-runner";
const CHANGE_DAY = "2026-09-08";

const command = new CompareCommand();

const history = ClaudeCodeFixtureUtil.useHistoryFixture();

describe("CompareCommand", () => {
  it("refuses to call a winner with too few sessions", async () => {
    const result = await command.run({ ...history.commonOptions(), piece: TEST_RUNNER_PIECE, changedAt: "2026-09-12" });
    expect(result.verdict).toBe("insufficient_data");
    expect(result.before.sessions).toBe(2);
    expect(result.after.sessions).toBe(1);
  });

  it("shows an improvement when failures stop after the change", async () => {
    for (let sessionIndex = 0; sessionIndex < 5; sessionIndex++) {
      const startedAt = `2026-09-2${sessionIndex}T10:00:00.000Z`;
      ClaudeCodeFixtureUtil.writeTestRunnerSession(history.fixture, `n${sessionIndex}`, startedAt, { command: "pnpm test" });
    }
    ClaudeCodeFixtureUtil.writeTestRunnerSession(history.fixture, "o1", "2026-09-05T10:00:00.000Z", { command: "npm test", isFailing: true });
    ClaudeCodeFixtureUtil.writeTestRunnerSession(history.fixture, "o2", "2026-09-06T10:00:00.000Z", { command: "npm test", isFailing: true });

    const result = await command.run({ ...history.commonOptions(), piece: TEST_RUNNER_PIECE, changedAt: "2026-09-15" });
    expect(result.before.sessions).toBe(5);
    expect(result.after.sessions).toBe(5);
    expect(result.before.errorRate).toBeGreaterThan(0);
    expect(result.after.errorRate).toBe(0);
    expect(result.verdict).toBe("improved");
  });

  it("explains when it can't tell when the piece changed", async () => {
    await expect(command.run({ ...history.commonOptions(), piece: "agent:missing" })).rejects.toThrow(/--at/);
  });
});

describe("CompareCommand counts time as much as cost", () => {
  let timeFixture: Fixture;
  let restoreTimeEnv: () => void;

  beforeAll(() => {
    timeFixture = ClaudeCodeFixtureUtil.makeFixture();
    ClaudeCodeFixtureUtil.writeHarness(timeFixture);
    restoreTimeEnv = ClaudeCodeFixtureUtil.useFixtureEnv(timeFixture);
  });

  afterAll(() => {
    restoreTimeEnv();
    rmSync(timeFixture.root, { recursive: true, force: true });
  });

  function writeSide(prefix: string, firstDay: number, runOptions: TestRunOptions): void {
    for (let sessionIndex = 0; sessionIndex < 5; sessionIndex++) {
      const startedAt = `2026-09-${String(firstDay + sessionIndex).padStart(2, "0")}T10:00:00.000Z`;
      ClaudeCodeFixtureUtil.writeTestRunnerSession(timeFixture, `${prefix}${sessionIndex}`, startedAt, {
        command: "pnpm test",
        ...runOptions,
      });
    }
  }

  async function compareAt(changedAt: string) {
    return command.run({
      changedAt,
      projectDir: timeFixture.projectDir,
      dataDir: timeFixture.dataDir,
      piece: TEST_RUNNER_PIECE,
      shouldSkipCache: true,
    });
  }

  it("calls a change that keeps the cost but makes the work faster an improvement", async () => {
    writeSide("slow", 1, { commandSeconds: 200 });
    writeSide("fast", 10, { commandSeconds: 20 });
    const result = await compareAt(CHANGE_DAY);
    expect(result.verdict).toBe("improved");
    expect(result.moves).toStrictEqual([
      {
        metric: "activeMinutesPerInvocation",
        relativeChange: expect.any(Number) as number,
        direction: "better",
        isInVerdict: true,
      },
    ]);
    expect(result.moves[0]?.relativeChange).toBeLessThan(-0.5);
    expect(result.deltas.usdPerInvocation).toBe(0);
  });

  it("reports input and output tokens per use without letting them vote twice", async () => {
    const result = await compareAt(CHANGE_DAY);
    expect(result.before.perInvocation).toMatchObject({ inputTokens: 1100, outputTokens: 50 });
    expect(result.deltas).toMatchObject({ inputTokensPerInvocation: 0, outputTokensPerInvocation: 0 });
  });

  it("calls faster but more expensive a mixed result", async () => {
    writeSide("pricey", 20, { commandSeconds: 20, model: "claude-opus-5" });
    const result = await compareAt("2026-09-18");
    expect(result.verdict).toBe("mixed");
    const metricToDirection = Object.fromEntries(result.moves.map((move) => [move.metric, move.direction]));
    // Why: before the change there are slow and fast sessions; after, only fast ones, on a pricier model.
    expect(metricToDirection).toStrictEqual({ activeMinutesPerInvocation: "better", usdPerInvocation: "worse" });
  });
});

describe("CompareCommand with fewer output tokens", () => {
  let tokenFixture: Fixture;
  let restoreTokenEnv: () => void;

  beforeAll(() => {
    tokenFixture = ClaudeCodeFixtureUtil.makeFixture();
    ClaudeCodeFixtureUtil.writeHarness(tokenFixture);
    for (let sessionIndex = 0; sessionIndex < 5; sessionIndex++) {
      const day = (offset: number): string => `2026-09-${String(offset + sessionIndex).padStart(2, "0")}T10:00:00.000Z`;
      ClaudeCodeFixtureUtil.writeTestRunnerSession(tokenFixture, `v${sessionIndex}`, day(1), {
        command: "pnpm test",
        outputTokens: 400,
      });
      ClaudeCodeFixtureUtil.writeTestRunnerSession(tokenFixture, `t${sessionIndex}`, day(10), {
        command: "pnpm test",
        outputTokens: 100,
      });
    }
    restoreTokenEnv = ClaudeCodeFixtureUtil.useFixtureEnv(tokenFixture);
  });

  afterAll(() => {
    restoreTokenEnv();
    rmSync(tokenFixture.root, { recursive: true, force: true });
  });

  it("shows the token move, while the verdict comes from the cost it causes", async () => {
    const result = await command.run({
      projectDir: tokenFixture.projectDir,
      dataDir: tokenFixture.dataDir,
      piece: TEST_RUNNER_PIECE,
      changedAt: CHANGE_DAY,
    });
    expect(result.verdict).toBe("improved");
    const metricToMove = Object.fromEntries(result.moves.map((move) => [move.metric, move]));
    expect(metricToMove.outputTokensPerInvocation).toMatchObject({ direction: "better", isInVerdict: false });
    expect(metricToMove.usdPerInvocation).toMatchObject({ direction: "better", isInVerdict: true });
    expect(result.deltas.outputTokensPerInvocation).toBe(-300);
  });
});
