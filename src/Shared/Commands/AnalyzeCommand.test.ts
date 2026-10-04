import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Fixture } from "@/Providers/ClaudeCode/Protocols/ClaudeCodeFixtureProtocol.ts";
import { ClaudeCodeFixtureUtil } from "@/Providers/ClaudeCode/Utils/ClaudeCodeFixtureUtil.ts";
import { ClaudeCodeTranscriptBuilder } from "@/Providers/ClaudeCode/Utils/ClaudeCodeTranscriptBuilder.ts";
import type { Signal } from "@/Shared/Protocols/SignalProtocol.ts";
import { AnalyzeCommand } from "@/Shared/Commands/AnalyzeCommand.ts";
import { IssueCommand } from "@/Shared/Commands/IssueCommand.ts";

const { FAKE_SECRETS } = ClaudeCodeFixtureUtil;
const command = new AnalyzeCommand();

const history = ClaudeCodeFixtureUtil.useHistoryFixture();

function signalById(signals: Signal[], id: string): Signal {
  const signal = signals.find((candidate) => candidate.id === id);
  if (!signal) {
    throw new Error(`Missing signal ${id}; got ${signals.map((candidate) => candidate.id).join(", ")}`);
  }
  return signal;
}

describe("AnalyzeCommand.run()", () => {
  it("finds the enforcement gap, the command that worked and the instruction that already covers it", async () => {
    const analysis = await command.run(history.commonOptions());
    const npmTest = signalById(analysis.signals, "failed_command:npm test");
    expect(npmTest).toMatchObject({ occurrences: 3, sessions: 3, pieces: ["agent:test-runner"] });
    expect(npmTest.details.recoveredWith).toStrictEqual([{ value: "pnpm test", count: 3 }]);
    expect(npmTest.details.mentions).toStrictEqual(
      expect.arrayContaining([expect.objectContaining({ piece: "instructions:project", line: 3, term: "pnpm test" })]),
    );
    expect(npmTest.cost.activeMinutes).toBeGreaterThan(0);
    expect(npmTest.cost.tokens).toBeGreaterThan(0);
    expect(npmTest.cost.inputTokens).toBeGreaterThan(0);
    expect(npmTest.cost.outputTokens).toBeGreaterThan(0);
    expect(npmTest.cost.inputTokens + npmTest.cost.outputTokens).toBe(npmTest.cost.tokens);
    expect(npmTest.evidence[0]).toMatchObject({ line: 3, thread: "test-runner" });
    expect(npmTest.evidence[0]?.excerpt).toContain("npm ERR!");
  });

  it("finds subagent re-reads, repeated reads, permission denials and repeated requests", async () => {
    const analysis = await command.run(history.commonOptions());
    const signalIds = analysis.signals.map((signal) => signal.id);
    expect(signalIds).toStrictEqual(
      expect.arrayContaining([
        "subagent_reread:code-reviewer",
        "repeated_read:code-reviewer",
        "permission_denied:rm",
      ]),
    );
    expect(analysis.signals.find((signal) => signal.type === "repeated_request")?.sessions).toBe(3);
    expect(signalById(analysis.signals, "permission_denied:rm").pieces).toStrictEqual(["skill:changelog"]);
    expect(signalById(analysis.signals, "repeated_read:code-reviewer").details.files).toStrictEqual([
      { value: "src/auth.ts", count: 3 },
    ]);
  });

  it("reports the provider, history, totals and per-piece usage", async () => {
    const analysis = await command.run(history.commonOptions());
    expect(analysis.provider).toBe("claude-code");
    expect(analysis.analyzed.sessions).toBe(6);
    expect(analysis.history).toMatchObject({ transcriptsAvailable: 6, retentionDays: 60 });
    expect(analysis.history.note).toContain("Claude Code");
    expect(analysis.totals.tokens).toBeGreaterThan(0);
    expect(analysis.totals.inputTokens + analysis.totals.outputTokens).toBe(analysis.totals.tokens);
    expect(analysis.totals.lostToFailures.outputTokens).toBeGreaterThan(0);
    expect(analysis.totals.lostToFailures.activeMinutes).toBeGreaterThan(0);
    const testRunner = analysis.usage.find((usage) => usage.piece === "agent:test-runner");
    expect(testRunner).toMatchObject({ invocations: 3, sessions: 3, toolErrors: 3 });
    expect(testRunner?.models).toContain("claude-haiku-4-5");
  });

  it("never prints secret values", async () => {
    const serialized = JSON.stringify(await command.run(history.commonOptions()));
    expect(serialized).toContain("[REDACTED]");
    for (const secret of Object.values(FAKE_SECRETS)) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("reuses the cache on the next run and can focus on one piece", async () => {
    await command.run(history.commonOptions());
    const secondRun = await command.run(history.commonOptions());
    expect(secondRun.analyzed).toMatchObject({ parsedNow: 0, fromCache: 6 });
    const focused = await command.run({ ...history.commonOptions(), focusPieces: ["agent:code-reviewer"] });
    expect(focused.analyzed.sessions).toBe(1);
    expect(focused.signals.every((signal) => signal.pieces.includes("agent:code-reviewer"))).toBe(true);
  });

  it("leaves out excluded sessions", async () => {
    const analysis = await command.run({ ...history.commonOptions(), excludedSessionIds: ["s5"] });
    expect(analysis.analyzed.sessions).toBe(5);
  });

  it("filters by period", async () => {
    const analysis = await command.run({ ...history.commonOptions(), since: "2026-09-13" });
    expect(analysis.analyzed.sessions).toBe(3);
  });

  describe("on cases seen in real sessions", () => {
    let realFixture: Fixture;
    let restoreRealEnv: () => void;

    beforeAll(() => {
      realFixture = ClaudeCodeFixtureUtil.makeFixture();
      ClaudeCodeFixtureUtil.writeHarness(realFixture);
      ClaudeCodeFixtureUtil.writeRealCasesSession(realFixture, "real1", "2026-09-20T10:00:00.000Z");
      ClaudeCodeFixtureUtil.writeRealCasesSession(realFixture, "real2", "2026-09-21T10:00:00.000Z");
      restoreRealEnv = ClaudeCodeFixtureUtil.useFixtureEnv(realFixture);
    });

    afterAll(() => {
      restoreRealEnv();
      rmSync(realFixture.root, { recursive: true, force: true });
    });

    async function analyzeReal() {
      return command.run({ projectDir: realFixture.projectDir, dataDir: realFixture.dataDir });
    }

    it("reports the platforms the sessions ran on, for scripts that work there", async () => {
      const analysis = await analyzeReal();
      expect(analysis.environment).toStrictEqual({
        platforms: [{ value: "darwin", count: 2 }],
        shells: [{ value: "zsh", count: 2 }],
      });
      const exploration = analysis.process.find((profile) => profile.stage === "exploration");
      expect(exploration?.contextTokens).toBeGreaterThan(0);
    });

    it("profiles the work by stage, with rejected plans as planning failures", async () => {
      const analysis = await analyzeReal();
      const stageToProfile = new Map(analysis.process.map((profile) => [profile.stage, profile]));
      expect(analysis.process.map((profile) => profile.stage)).toStrictEqual(["setup", "planning", "exploration"]);
      expect(stageToProfile.get("planning")).toMatchObject({ sessions: 2, steps: 2, failures: 2 });
      expect(stageToProfile.get("setup")?.commands).toStrictEqual(["git stash"]);
    });

    it("counts rejected plans and queued pushback as corrections, not permission problems", async () => {
      const analysis = await analyzeReal();
      expect(analysis.signals.some((signal) => signal.id === "permission_denied:ExitPlanMode")).toBe(false);
      const correction = signalById(analysis.signals, "user_correction:main");
      expect(correction).toMatchObject({ occurrences: 4, sessions: 2 });
      expect(correction.evidence.map((evidence) => evidence.excerpt)).toContain("rejected ExitPlanMode → use the existing queue");
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
      expect(python.details.errors).toStrictEqual([{ value: "ModuleNotFoundError: No module named '…'", count: 2 }]);
      expect(signalById(analysis.signals, "failed_command:git stash").sessions).toBe(2);
    });

    it("leaves models without a known price unpriced and says which", async () => {
      const analysis = await analyzeReal();
      expect(analysis.totals.unpricedModels).toStrictEqual(["glm-5.2"]);
      const usageWithGlm = analysis.usage.find((usage) => usage.models.includes("glm-5.2"));
      expect(usageWithGlm).toMatchObject({ piece: "main" });
    });

    it("lists what it couldn't map as gaps, each with a prefilled issue", async () => {
      const analysis = await analyzeReal();
      expect(analysis.gaps.map((gap) => [gap.kind, gap.details[0]])).toStrictEqual([
        ["unknown_line", "type: workspace-sync"],
        ["unpriced_model", "model: glm-5.2"],
      ]);
      expect(analysis.versions).toStrictEqual({
        harnessLedger: "dev",
        provider: "claude-code",
        agentVersions: ["2.1.287"],
        platforms: ["darwin"],
      });
    });

    it("builds a rule question from a signal and the person's words, redacted", async () => {
      await analyzeReal();
      const link = await new IssueCommand().run({
        projectDir: realFixture.projectDir,
        dataDir: realFixture.dataDir,
        signalId: "user_correction",
        note: `Plans are rejected on purpose here; token ${FAKE_SECRETS.anthropicKey}`,
      });
      const params = new URL(link.issueUrl).searchParams;
      expect(params.get("template")).toBe("rule-question.yml");
      expect(params.get("explanation")).toBe("Plans are rejected on purpose here; token [REDACTED]");
      expect(params.get("signal")).toMatch(/^user_correction: user_correction:/);
      expect(link.issueUrl).not.toContain("sk-ant");
    });
  });

  describe("on data Claude Code computes itself", () => {
    let reportFixture: Fixture;
    let restoreReportEnv: () => void;

    beforeAll(() => {
      reportFixture = ClaudeCodeFixtureUtil.makeFixture();
      const agentFile = join(reportFixture.projectDir, ".claude", "agents", "migrations-writer.md");
      writeFileSync(agentFile, "---\nname: migrations-writer\ndescription: Writes migrations\nmodel: glm-5.3\n---\nWrite it.\n");
      ClaudeCodeFixtureUtil.writeProviderReportSession(reportFixture, "rep1", "2026-09-22T10:00:00.000Z");
      ClaudeCodeFixtureUtil.writeProviderReportSession(reportFixture, "rep2", "2026-09-23T10:00:00.000Z");
      restoreReportEnv = ClaudeCodeFixtureUtil.useFixtureEnv(reportFixture);
    });

    afterAll(() => {
      restoreReportEnv();
      rmSync(reportFixture.root, { recursive: true, force: true });
    });

    async function analyzeReport() {
      return command.run({ projectDir: reportFixture.projectDir, dataDir: reportFixture.dataDir });
    }

    it("reports repeated model API errors with the failing model and the subagent that hit them", async () => {
      const analysis = await analyzeReport();
      const apiError = signalById(analysis.signals, "api_error:model_not_found");
      expect(apiError).toMatchObject({ occurrences: 4, sessions: 2, pieces: ["agent:migrations-writer"] });
      expect(apiError.details.models).toStrictEqual([{ value: "glm-5.3", count: 4 }]);
      expect(apiError.cost.activeMinutes).toBeGreaterThan(0);
    });

    it("shows the provider's own cost and turn time next to the estimates", async () => {
      const analysis = await analyzeReport();
      expect(analysis.totals.reportedByProvider).toStrictEqual({
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

  describe("on work that could be a skill, a script or a subagent", () => {
    let workflowFixture: Fixture;
    let restoreWorkflowEnv: () => void;

    beforeAll(() => {
      workflowFixture = ClaudeCodeFixtureUtil.makeFixture();
      for (let sessionIndex = 0; sessionIndex < 4; sessionIndex++) {
        ClaudeCodeFixtureUtil.writeWorkflowSession(workflowFixture, `wf${sessionIndex}`, `2026-09-2${sessionIndex}T10:00:00.000Z`);
      }
      restoreWorkflowEnv = ClaudeCodeFixtureUtil.useFixtureEnv(workflowFixture);
    });

    afterAll(() => {
      restoreWorkflowEnv();
      rmSync(workflowFixture.root, { recursive: true, force: true });
    });

    async function analyzeWorkflows() {
      return command.run({ projectDir: workflowFixture.projectDir, dataDir: workflowFixture.dataDir });
    }

    it("finds the same steps repeated across sessions, without the exploration around them", async () => {
      const analysis = await analyzeWorkflows();
      const workflows = analysis.signals.filter((signal) => signal.type === "repeated_workflow");
      expect(workflows).toHaveLength(1);
      expect(workflows[0]).toMatchObject({ sessions: 4, pieces: ["main"] });
      expect(workflows[0]?.details.steps).toStrictEqual(["git status", "git add", "npx tsc", "git commit", "git push"]);
    });

    it("puts validation and delivery commands in their stages", async () => {
      const analysis = await analyzeWorkflows();
      const stageToCommands = new Map(analysis.process.map((profile) => [profile.stage, profile.commands]));
      expect(stageToCommands.get("validation")).toStrictEqual(["npx tsc"]);
      expect(stageToCommands.get("delivery")).toStrictEqual(expect.arrayContaining(["git commit", "git push"]));
      expect(stageToCommands.get("exploration")).toStrictEqual([]);
    });

    it("lists the work commands the project runs, with a real example, for a first CLAUDE.md", async () => {
      const analysis = await analyzeWorkflows();
      const commandKeyToCommand = new Map(analysis.commonCommands.map((command) => [command.key, command]));
      expect(commandKeyToCommand.get("npx tsc")).toStrictEqual({
        key: "npx tsc",
        runs: 4,
        sessions: 4,
        failures: 0,
        example: "npx tsc --noEmit",
      });
      expect(commandKeyToCommand.has("ls")).toBe(false);
    });

    it("finds a procedure repeated many times inside one long session", async () => {
      const loop = new ClaudeCodeTranscriptBuilder("loop1", workflowFixture.projectDir, "2026-09-26T10:00:00.000Z")
        .user("Fix the lint errors in the gallery");
      for (let round = 0; round < 6; round++) {
        for (const [stepIndex, command] of ["git status", "npm run eslint", "git diff"].entries()) {
          loop.tool(`l${round}_${stepIndex}`, "Bash", { command }).result(`l${round}_${stepIndex}`, "ok");
        }
        loop.tool(`e${round}`, "Edit", { file_path: join(workflowFixture.projectDir, "src/a.js") }).result(`e${round}`, "ok");
      }
      loop.write(ClaudeCodeTranscriptBuilder.sessionPath(workflowFixture, "loop1"));
      const analysis = await analyzeWorkflows();
      const lintLoop = analysis.signals.find((signal) => signal.details.steps?.includes("npm run eslint"));
      expect(lintLoop).toMatchObject({ type: "repeated_workflow", occurrences: 6, sessions: 1, isPartial: true });
    });

    it("reports sessions that outgrow the context window", async () => {
      const analysis = await analyzeWorkflows();
      const compaction = signalById(analysis.signals, "context_compaction:auto");
      expect(compaction).toMatchObject({ occurrences: 4, sessions: 4 });
      expect(compaction.details.maxContextTokens).toBe(950_000);
      expect(compaction.evidence[0]?.excerpt).toBe("auto compaction at ~950k tokens after 1 turns");
    });

    it("groups malformed tool calls without the leaked text", async () => {
      const serialized = JSON.stringify(await analyzeWorkflows());
      expect(serialized).toContain("(malformed tool name)");
      expect(serialized).not.toContain("getAll");
    });
  });

  describe("on pieces that keep filling their context", () => {
    let contextFixture: Fixture;
    let restoreContextEnv: () => void;

    beforeAll(() => {
      contextFixture = ClaudeCodeFixtureUtil.makeFixture();
      // Why: low thresholds let a small fixture show the pattern (1 token is about 4 characters).
      mkdirSync(contextFixture.dataDir, { recursive: true });
      writeFileSync(join(contextFixture.dataDir, "config.json"), JSON.stringify({
        signalThresholds: { minHeavySourceTokens: 5000, minHeavySourceLoads: 3, minHugeResultTokens: 4000 },
      }));
      const guide = join(contextFixture.projectDir, "docs/guide.md");
      for (const sessionId of ["c1", "c2"]) {
        const agentId = `r${sessionId}`;
        const reviewer = new ClaudeCodeTranscriptBuilder(sessionId, contextFixture.projectDir, `2026-09-2${sessionId.at(-1)}T10:00:00.000Z`, {
          isSidechain: true,
          agentId,
        }).user(`Review ${sessionId}`);
        for (let read = 0; read < 2; read++) {
          reviewer.tool(`g${read}_${sessionId}`, "Read", { file_path: guide }).result(`g${read}_${sessionId}`, "x".repeat(8000));
        }
        reviewer
          .tool(`a_${sessionId}`, "Bash", { command: "cat src/a.ts" }).result(`a_${sessionId}`, "a".repeat(12000))
          .tool(`b_${sessionId}`, "Bash", { command: "cat src/b.ts" }).result(`b_${sessionId}`, "b".repeat(12000))
          .tool(`l_${sessionId}`, "Bash", { command: "npm run build" }).result(`l_${sessionId}`, "log ".repeat(4500))
          .writeTo(contextFixture);
        new ClaudeCodeTranscriptBuilder(sessionId, contextFixture.projectDir, `2026-09-2${sessionId.at(-1)}T10:00:00.000Z`)
          .user("Review the change")
          .tool(`t_${sessionId}`, "Task", { subagent_type: "reviewer", prompt: `Review ${sessionId}` })
          .result(`t_${sessionId}`, "Looks good.", { secondsLater: 60, toolUseResult: { agentId } })
          .write(ClaudeCodeTranscriptBuilder.sessionPath(contextFixture, sessionId));
      }
      restoreContextEnv = ClaudeCodeFixtureUtil.useFixtureEnv(contextFixture);
    });

    afterAll(() => {
      restoreContextEnv();
      rmSync(contextFixture.root, { recursive: true, force: true });
    });

    it("names the files loaded again and again and the huge outputs, per piece, with their tokens and their carry", async () => {
      const analysis = await command.run({ projectDir: contextFixture.projectDir, dataDir: contextFixture.dataDir });
      const heavy = signalById(analysis.signals, "context_heavy:agent:reviewer (built-in)");
      expect(heavy).toMatchObject({ sessions: 2, pieces: ["agent:reviewer (built-in)"] });
      expect(heavy.details.sources).toStrictEqual([
        { value: "npm run build (×2)", count: 9000 },
        { value: "docs/guide.md (×4)", count: 8000 },
      ]);
      expect(heavy.cost).toMatchObject({ tokens: 17000 + 28000, inputTokens: 17000 + 28000, outputTokens: 0 });
    });

    it("doesn't take different files read with the same command as the same material", async () => {
      const analysis = await command.run({ projectDir: contextFixture.projectDir, dataDir: contextFixture.dataDir });
      const heavy = signalById(analysis.signals, "context_heavy:agent:reviewer (built-in)");
      expect(heavy.details.sources?.some((source) => source.value.startsWith("cat"))).toBe(false);
    });
  });

  describe("on skills that are called but own no turns", () => {
    let skillsFixture: Fixture;
    let restoreSkillsEnv: () => void;
    const skillNames = Array.from({ length: 20 }, (_unused, index) => `helper-${index}`);

    beforeAll(() => {
      skillsFixture = ClaudeCodeFixtureUtil.makeFixture();
      const transcript = new ClaudeCodeTranscriptBuilder("k1", skillsFixture.projectDir, "2026-09-20T10:00:00.000Z")
        .user("Prepare the release");
      for (const skill of skillNames) {
        transcript.tool(`s_${skill}`, "Skill", { skill }).result(`s_${skill}`, `Launching skill: ${skill}`);
      }
      transcript.write(ClaudeCodeTranscriptBuilder.sessionPath(skillsFixture, "k1"));
      restoreSkillsEnv = ClaudeCodeFixtureUtil.useFixtureEnv(skillsFixture);
    });

    afterAll(() => {
      restoreSkillsEnv();
      rmSync(skillsFixture.root, { recursive: true, force: true });
    });

    it("lists every called skill in usage, however little it cost", async () => {
      const analysis = await command.run({ projectDir: skillsFixture.projectDir, dataDir: skillsFixture.dataDir });
      const skillPieces = analysis.usage.map((usage) => usage.piece).filter((piece) => piece.startsWith("skill:"));
      const expectedPieces = skillNames.map((skill) => `skill:${skill}`);
      expect(new Set(skillPieces)).toStrictEqual(new Set(expectedPieces));
    });
  });
});
