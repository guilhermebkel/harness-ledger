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
    expect(npmTest?.details.chains).toEqual({
      chains: 1,
      recovered: 1,
      attempts: 2,
      fixLoops: 0,
    });
    expect(npmTest?.details.recoveredWith).toEqual([{ value: "pnpm test", count: 1 }]);
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
    expect(workflow?.details.steps).toEqual(["pnpm lint", "pnpm build", "pnpm test"]);
    expect(workflow?.cost.tokens).toBe(2 * 4 * 1100);
    expect(workflow?.cost.activeMinutes).toBe(0.1);
  });
});
