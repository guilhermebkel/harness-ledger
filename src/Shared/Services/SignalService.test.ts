import { describe, expect, it } from "vitest";
import { SessionFactsBuilder } from "@/Shared/Utils/SessionFactsFixtureUtil.js";
import { ConfigService } from "./ConfigService.js";
import { SignalService } from "./SignalService.js";

const config = ConfigService.DEFAULT_CONFIG;
const signalService = new SignalService({
  idleMs: config.idleMinutes * 60_000,
  prices: config.prices,
  maxEvidence: 5,
  minSessionsForUnused: Infinity,
  largePieceTokens: Infinity,
  thresholds: {
    ...config.signalThresholds,
    minFailures: 1,
  },
});

describe("SignalService failure chains", () => {
  it("shares a chain's cost between its failures and summarizes the chain on the first one", () => {
    const session = new SessionFactsBuilder()
      .call("npm test", { isError: true })
      .wait(10).say()
      .call("npx jest", { isError: true })
      .wait(5).call("pnpm test")
      .build();
    const signals = signalService.extract([session]);
    const npmTest = signals.find((signal) => signal.id === "failed_command:npm test");
    const npxJest = signals.find((signal) => signal.id === "failed_command:npx jest");
    expect(npmTest?.details.chains).toStrictEqual({
      chains: 1,
      recovered: 1,
      attempts: 2,
      fixLoops: 0,
    });
    expect(npmTest?.details.recoveredWith).toStrictEqual([{ value: "pnpm test", count: 1 }]);
    expect(npxJest?.details.chains).toBeUndefined();
    expect(npmTest?.cost.tokens).toBe(npxJest?.cost.tokens);
    expect((npmTest?.cost.tokens ?? 0) + (npxJest?.cost.tokens ?? 0)).toBe(3 * 1100);
  });

  it("counts a fix loop without calling the same command a recovery", () => {
    const session = new SessionFactsBuilder()
      .call("pnpm lint", { isError: true })
      .call("Edit", { category: "edit", filePath: "src/a.ts" })
      .call("pnpm lint")
      .build();
    const [lint] = signalService.extract([session]);
    expect(lint?.details.chains?.fixLoops).toBe(1);
    expect(lint?.details.recoveredWith).toBeUndefined();
  });
});

describe("SignalService repeated workflows", () => {
  it("costs what the agent did around the steps, not the steps' own runs", () => {
    const workflowService = new SignalService({
      idleMs: config.idleMinutes * 60_000,
      prices: config.prices,
      maxEvidence: 5,
      minSessionsForUnused: Infinity,
      largePieceTokens: Infinity,
      thresholds: {
        ...config.signalThresholds,
        minWorkflowSessions: 99,
        minWorkflowRuns: 2,
      },
    });
    const builder = new SessionFactsBuilder();
    for (let run = 0; run < 2; run++) {
      builder
        .call("pnpm lint", { runSeconds: 2 })
        .wait(3).say()
        .call("cat build.log")
        .call("pnpm build", { runSeconds: 30 })
        .call("pnpm test", { runSeconds: 10 })
        .wait(60);
    }
    const workflow = workflowService.extract([builder.build()]).find((signal) => signal.type === "repeated_workflow");
    expect(workflow?.details.steps).toStrictEqual(["pnpm lint", "pnpm build", "pnpm test"]);
    expect(workflow?.cost.tokens).toBe(2 * 4 * 1100);
    expect(workflow?.cost.activeMinutes).toBe(0.1);
  });
});

const turnService = new SignalService({
  idleMs: config.idleMinutes * 60_000,
  prices: config.prices,
  maxEvidence: 5,
  minSessionsForUnused: Infinity,
  largePieceTokens: 1000,
  thresholds: {
    ...config.signalThresholds,
    minFailures: 1,
    minRepeatedEvents: 1,
  },
});
const SUBAGENT = {
  id: "agent1",
  agentType: "researcher",
};

describe("SignalService turn costs", () => {
  it("costs a rejected plan as the turn that built it, and leaves it out of the correction that follows", () => {
    const session = new SessionFactsBuilder()
      .prompt("Add the export button")
      .wait(5).say()
      .call("Read", { category: "read", filePath: "src/a.ts" })
      .call("ExitPlanMode", { category: "plan", isError: true, kind: "user_rejected" })
      .wait(30).prompt("no, only on mobile", { isCorrection: true })
      .build();
    const corrections = turnService.extract([session]).find((signal) => signal.type === "user_correction");
    expect(corrections?.occurrences).toBe(2);
    expect(corrections?.cost.tokens).toBe(3 * 1100);
  });

  it("counts subagent messages in a corrected turn but not the failure chains already counted", () => {
    const session = new SessionFactsBuilder()
      .prompt("Fix the tests")
      .wait(5).say()
      .inThread(SUBAGENT).say().say()
      .inThread({ id: "main", agentType: "main" })
      .call("npm test", { isError: true })
      .call("pnpm test")
      .wait(10).prompt("that's not what I asked", { isCorrection: true })
      .build();
    const signals = turnService.extract([session]);
    const correction = signals.find((signal) => signal.type === "user_correction");
    const failure = signals.find((signal) => signal.type === "failed_command");
    expect(failure?.cost.tokens).toBe(1100);
    expect(correction?.cost.tokens).toBe(4 * 1100);
  });

  it("charges re-reads after a compaction to the compaction, not to the agent", () => {
    const session = new SessionFactsBuilder()
      .call("Read", { category: "read", filePath: "src/a.ts" })
      .call("Read", { category: "read", filePath: "src/b.ts" })
      .compact()
      .call("Read", { category: "read", filePath: "src/a.ts" })
      .call("Read", { category: "read", filePath: "src/a.ts" })
      .build();
    const signals = turnService.extract([session]);
    expect(signals.some((signal) => signal.type === "repeated_read")).toBe(false);
    const compaction = signals.find((signal) => signal.type === "context_compaction");
    expect(compaction?.cost.inputTokens).toBe(25);
    expect(compaction?.cost.bound).toBe("lower");
  });

  it("prices a large instructions file by the messages that carried it", () => {
    const session = new SessionFactsBuilder().say().say().say().build();
    const inventory = {
      provider: "test",
      projectDir: "/work/app",
      takenAt: "2026-09-01T00:00:00.000Z",
      fingerprint: "x",
      pieces: [{
        id: "instructions:project",
        kind: "instructions" as const,
        name: "CLAUDE.md",
        scope: "project" as const,
        path: "CLAUDE.md",
        hash: "h",
        bytes: 12_000,
        approxTokens: 3000,
        isEditable: true,
      }],
      retention: {
        days: 30,
        source: "default",
      },
      notes: [],
    };
    const large = turnService.extract([session], inventory).find((signal) => signal.type === "large_piece");
    expect(large?.cost.inputTokens).toBe(3 * 3000);
    expect(large?.sessions).toBe(1);
  });
});
