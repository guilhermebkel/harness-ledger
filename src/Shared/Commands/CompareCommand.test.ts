// Integration test against a fake Claude Code home (see AnalyzeCommand.test.ts).

import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ClaudeCodeFixtureUtil, type Fixture } from "@/Providers/ClaudeCode/Utils/ClaudeCodeFixtureUtil.js";
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
