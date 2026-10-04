import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll } from "vitest";
import type { Fixture, HistoryFixture, TestRun } from "@/Providers/ClaudeCode/Protocols/ClaudeCodeFixtureProtocol.ts";
import { ClaudeCodePathUtil } from "@/Providers/ClaudeCode/Utils/ClaudeCodePathUtil.ts";
import { ClaudeCodeTranscriptBuilder } from "@/Providers/ClaudeCode/Utils/ClaudeCodeTranscriptBuilder.ts";

const TEST_RUNNER_AGENT = "test-runner";
const COST_STATE_ATTACHMENT = "cost-state";

const FAKE_SECRETS = {
  bearerToken: "abcdefghijklmnop1234567",
  githubToken: "ghp_abcdefghijklmnopqrstuvwxyz123456",
  anthropicKey: "sk-ant-secretsecretsecret123",
};

type SubagentTypeSource = "meta" | "result" | "prompt";

interface SubagentRef {
  fixture: Fixture;
  sessionId: string;
  agentId: string;
}

type SubagentTypeSetup = (subagent: SubagentRef) => unknown;

export class ClaudeCodeFixtureUtil {
  static readonly FAKE_SECRETS = FAKE_SECRETS;

  static makeFixture(): Fixture {
    const tempDir = tmpdir();
    const root = mkdtempSync(join(tempDir, "harness-ledger-test-"));
    const claudeHome = join(root, "claude-home");
    const projectDir = join(root, "work", "my-app");
    const projectsDir = join(claudeHome, "projects", ClaudeCodePathUtil.encodeProjectDir(projectDir));
    mkdirSync(projectsDir, { recursive: true });
    const agentsDir = join(projectDir, ".claude", "agents");
    mkdirSync(agentsDir, { recursive: true });
    const changelogSkillDir = join(projectDir, ".claude", "skills", "changelog");
    mkdirSync(changelogSkillDir, { recursive: true });
    const claudeJson = join(root, "claude.json");
    const userMcpServers = {
      github: {
        command: "/usr/bin/gh-mcp",
        env: { GITHUB_TOKEN: FAKE_SECRETS.githubToken },
      },
    };
    writeFileSync(claudeJson, JSON.stringify({ mcpServers: userMcpServers }));
    return {
      root,
      claudeHome,
      projectDir,
      claudeJson,
      dataDir: join(root, "harness-ledger-data"),
    };
  }

  static writeHarness(fixture: Fixture): void {
    const { projectDir } = fixture;
    const agentsDir = join(projectDir, ".claude", "agents");
    const changelogSkillDir = join(projectDir, ".claude", "skills", "changelog");
    const changelogReferencesDir = join(changelogSkillDir, "references");
    writeFileSync(join(projectDir, "CLAUDE.md"), "# My app\n\n- Run tests with `pnpm test`, never npm.\n- Keep PRs small.\n");
    writeFileSync(
      join(agentsDir, "test-runner.md"),
      "---\nname: test-runner\ndescription: Runs the test suite and reports failures\ntools: Bash, Read\nmodel: haiku\n---\nRun the tests.\n",
    );
    writeFileSync(
      join(agentsDir, "code-reviewer.md"),
      "---\nname: code-reviewer\ndescription: Reviews diffs\n---\nReview the change.\n",
    );
    writeFileSync(
      join(agentsDir, "docs-writer.md"),
      "---\nname: docs-writer\ndescription: Writes docs\nskills: changelog\n---\nWrite docs.\n",
    );
    writeFileSync(
      join(changelogSkillDir, "SKILL.md"),
      "---\nname: changelog\ndescription: Generates changelog entries\n---\nSteps...\n",
    );
    mkdirSync(changelogReferencesDir, { recursive: true });
    writeFileSync(join(changelogReferencesDir, "format.md"), "# Entry format\n");
    const guardHook = {
      matcher: "Bash",
      hooks: [{ type: "command", command: `./scripts/guard.sh --token ${FAKE_SECRETS.anthropicKey}` }],
    };
    const settingsFile = join(projectDir, ".claude", "settings.json");
    writeFileSync(
      settingsFile,
      JSON.stringify({
        cleanupPeriodDays: 60,
        hooks: { PreToolUse: [guardHook] },
        permissions: { allow: ["Bash(pnpm test)"], deny: [] },
      }),
    );
  }

  private static readonly TYPE_SOURCE_TO_TOOL_USE_RESULT: Record<SubagentTypeSource, SubagentTypeSetup> = {
    meta: ({ fixture, sessionId, agentId }) => {
      const metaFile = ClaudeCodeTranscriptBuilder.subagentPath(fixture, sessionId, agentId).replace(/\.jsonl$/, ".meta.json");
      writeFileSync(metaFile, JSON.stringify({ agentType: TEST_RUNNER_AGENT }));
      return undefined;
    },
    result: ({ agentId }) => ({
      agentId,
      status: "completed",
    }),
    prompt: () => undefined,
  };

  private static testRunSession(
    fixture: Fixture,
    sessionId: string,
    startedAt: string,
    typeSource: SubagentTypeSource,
    firstPrompt: string,
  ): ClaudeCodeTranscriptBuilder {
    const delegationPrompt = `Run the test suite for ${sessionId}`;
    const main = new ClaudeCodeTranscriptBuilder(sessionId, fixture.projectDir, startedAt)
      .user(firstPrompt)
      .tool(`task_${sessionId}`, "Task", { subagent_type: TEST_RUNNER_AGENT, description: "Run tests", prompt: delegationPrompt });
    const agentId = `a${sessionId}`;
    new ClaudeCodeTranscriptBuilder(sessionId, fixture.projectDir, startedAt, { isSidechain: true, agentId })
      .user(delegationPrompt, 4)
      .tool(`b1_${sessionId}`, "Bash", { command: "cd app && npm test" }, { secondsLater: 5, model: "claude-haiku-4-5" })
      .result(`b1_${sessionId}`, "Exit code 1\nnpm ERR! Missing script: \"test\"", { isError: true, secondsLater: 20 })
      .tool(`b2_${sessionId}`, "Bash", { command: "pnpm test" }, { secondsLater: 6, model: "claude-haiku-4-5" })
      .result(`b2_${sessionId}`, "Tests: 42 passed", { secondsLater: 30 })
      .say("All tests pass.")
      .writeTo(fixture);
    const setUpTypeSource = ClaudeCodeFixtureUtil.TYPE_SOURCE_TO_TOOL_USE_RESULT[typeSource];
    const toolUseResult = setUpTypeSource({ fixture, sessionId, agentId });
    return main.result(`task_${sessionId}`, "All tests pass.", { secondsLater: 70, toolUseResult }).say("Done.");
  }

  static writeHistory(fixture: Fixture, firstDay = "2026-09-10"): void {
    const firstDayAtMs = Date.parse(`${firstDay}T10:00:00.000Z`);
    const dayAt = (dayOffset: number): string => new Date(firstDayAtMs + dayOffset * 86_400_000).toISOString();
    const changelogRequest = `Generate the changelog entry from the last PRs please, key ${FAKE_SECRETS.anthropicKey}`;
    const authFile = join(fixture.projectDir, "src/auth.ts");
    const authContent = "export function login() {}".repeat(40);

    ClaudeCodeFixtureUtil.testRunSession(fixture, "s1", dayAt(0), "meta", "Fix the failing login test")
      .tool("sk1", "Skill", { skill: "changelog" })
      .result("sk1", "Launching skill")
      .say("Here is the entry.")
      .write(ClaudeCodeTranscriptBuilder.sessionPath(fixture, "s1"));

    const s2Main = ClaudeCodeFixtureUtil.testRunSession(fixture, "s2", dayAt(1), "result", changelogRequest)
      .tool("r_main", "Read", { file_path: authFile })
      .result("r_main", authContent)
      .tool("task_rev", "Task", { subagent_type: "code-reviewer", description: "Review", prompt: "Review the auth change" });
    const reviewer = new ClaudeCodeTranscriptBuilder("s2", fixture.projectDir, dayAt(1), { isSidechain: true, agentId: "rev1" })
      .idle(400)
      .user("Review the auth change");
    for (let readIndex = 0; readIndex < 4; readIndex++) {
      reviewer.tool(`rr${readIndex}`, "Read", { file_path: authFile }).result(`rr${readIndex}`, authContent);
    }
    reviewer.say("Looks good.").writeTo(fixture);
    s2Main.result("task_rev", "Looks good.", { secondsLater: 60 }).say("Reviewed.").write(ClaudeCodeTranscriptBuilder.sessionPath(fixture, "s2"));

    ClaudeCodeFixtureUtil.testRunSession(fixture, "s3", dayAt(2), "prompt", "Fix the failing login test").write(ClaudeCodeTranscriptBuilder.sessionPath(fixture, "s3"));

    new ClaudeCodeTranscriptBuilder("s4", fixture.projectDir, dayAt(3))
      .user("<command-name>/changelog</command-name><command-args>for v2</command-args>")
      .tool("p1", "Bash", { command: "rm -rf dist" })
      .result("p1", "Permission to use Bash with command rm -rf dist has been denied.", { isError: true })
      .tool("p2", "Bash", { command: "rm -rf build" })
      .result("p2", "Permission to use Bash with command rm -rf build has been denied.", { isError: true })
      .tool("c1", "Bash", { command: `curl -H "Authorization: Bearer ${FAKE_SECRETS.bearerToken}" https://api.example.com` })
      .result("c1", "ok")
      .say("Changelog for v2 is ready.")
      .user("no, it should include the migration notes too", 30)
      .say("Updated.")
      .idle(3600)
      .user("<system-reminder>ignore me</system-reminder>[Request interrupted by user]")
      .write(ClaudeCodeTranscriptBuilder.sessionPath(fixture, "s4"));

    for (const [sessionId, dayOffset] of [["s5", 4], ["s6", 5]] as const) {
      new ClaudeCodeTranscriptBuilder(sessionId, fixture.projectDir, dayAt(dayOffset))
        .user("generate the changelog entry from the last PRs")
        .tool(`g_${sessionId}`, "Bash", { command: "gh pr list --state merged" })
        .result(`g_${sessionId}`, "#12 feat: login")
        .say("Entry ready.")
        .write(ClaudeCodeTranscriptBuilder.sessionPath(fixture, sessionId));
    }

    const otherProjectFile = join(fixture.claudeHome, "projects", "-somewhere-else", "other.jsonl");
    new ClaudeCodeTranscriptBuilder("other", "/somewhere/else", dayAt(0))
      .user("hello")
      .write(otherProjectFile);
  }

  static writeTestRunnerSession(
    fixture: Fixture,
    sessionId: string,
    startedAt: string,
    run: TestRun,
  ): void {
    const agentId = `x${sessionId}`;
    const delegationPrompt = `run tests for ${sessionId}`;
    const subagentOptions = { isSidechain: true, agentId };
    const subagent = new ClaudeCodeTranscriptBuilder(sessionId, fixture.projectDir, startedAt, subagentOptions)
      .user(delegationPrompt)
      .tool(`b_${sessionId}`, "Bash", { command: run.command }, { model: run.model, outputTokens: run.outputTokens });
    if (run.isFailing === true) {
      subagent
        .result(`b_${sessionId}`, "Exit code 1\nnpm ERR! Missing script", { isError: true })
        .tool(`c_${sessionId}`, "Bash", { command: "pnpm test" })
        .result(`c_${sessionId}`, "ok");
    } else {
      subagent.result(`b_${sessionId}`, "ok", { secondsLater: run.commandSeconds });
    }
    subagent.writeTo(fixture);
    new ClaudeCodeTranscriptBuilder(sessionId, fixture.projectDir, startedAt)
      .user("run the tests")
      .tool(`task_${sessionId}`, "Task", { subagent_type: TEST_RUNNER_AGENT, prompt: delegationPrompt })
      .result(`task_${sessionId}`, "ok", { secondsLater: 30, toolUseResult: { agentId } })
      .write(ClaudeCodeTranscriptBuilder.sessionPath(fixture, sessionId));
  }

  static writeRealCasesSession(fixture: Fixture, sessionId: string, startedAt: string): void {
    new ClaudeCodeTranscriptBuilder(sessionId, fixture.projectDir, startedAt)
      .record("attachment", { attachment: { type: "environment", snapshot: { platform: "darwin", shell: "zsh" } } })
      .record("ai-title", { aiTitle: "Billing retry" })
      .record("workspace-sync", { syncId: "ws-1", files: 3 })
      .user("Add a retry to the billing job")
      .tool(`plan_${sessionId}`, "ExitPlanMode", { plan: "1. Add a new queue\n2. Retry there" })
      .result(
        `plan_${sessionId}`,
        "The user doesn't want to proceed with this tool use. The tool use was rejected. The user said: use the existing queue",
        { isError: true, denialKind: "user-rejected" },
      )
      .tool(`env_${sessionId}`, "Bash", { command: "cat .env.local" })
      .result(
        `env_${sessionId}`,
        "Permission for this action was denied by the Claude Code auto mode classifier. Reason: [Credential Exploration].",
        { isError: true, denialKind: "automode-blocked" },
      )
      .tool(`aws_${sessionId}`, "Bash", { command: "cat ~/.aws/credentials" })
      .result(
        `aws_${sessionId}`,
        "Permission for this action was denied by the Claude Code auto mode classifier. Reason: [Credential Exploration].",
        { isError: true, denialKind: "automode-blocked" },
      )
      .tool(`py_${sessionId}`, "Bash", { command: "cd jobs && python3 report.py --month 9" })
      .result(
        `py_${sessionId}`,
        [
          "Exit code 1",
          "/usr/lib/python3/site-packages/google/api_core/_python_version_support.py:266: FutureWarning: "
          + "Python 3.10 will stop being supported. Please upgrade.",
          "  warnings.warn(message, FutureWarning)",
          "Traceback (most recent call last):",
          "  File \"/work/jobs/report.py\", line 3, in <module>",
          "    import pandas",
          "ModuleNotFoundError: No module named 'pandas'",
        ].join("\n"),
        { isError: true },
      )
      .tool(`git_${sessionId}`, "Bash", { command: "git -C ../billing-api stash pop" })
      .result(
        `git_${sessionId}`,
        "Exit code 1\nwarning: ignoring dangling symref refs/remotes/origin/HEAD\nerror: 'stash@{0}' is not a stash reference",
        { isError: true },
      )
      .queued("Background task finished: lint", ClaudeCodeTranscriptBuilder.TASK_NOTIFICATION, ClaudeCodeTranscriptBuilder.TASK_NOTIFICATION)
      .systemUser("<task-notification><status>completed</status><summary>lint done</summary></task-notification>", ClaudeCodeTranscriptBuilder.TASK_NOTIFICATION)
      .tool(`loop_${sessionId}`, "Bash", { command: "for f in jobs/*.py; do python3 -m py_compile $f; done" })
      .result(`loop_${sessionId}`, "")
      .tool(`home_${sessionId}`, "Read", { file_path: join(homedir(), ".claude", "skills", "review", "SKILL.md") })
      .result(`home_${sessionId}`, "---\nname: review\n---")
      .queued("não, usa a fila que já existe", "prompt")
      .tool(`glm_${sessionId}`, "Read", { file_path: join(fixture.projectDir, "jobs/billing.ts") }, { model: "glm-5.2" })
      .result(`glm_${sessionId}`, "export const billing = 1;")
      .apiError("API Error: 404 model_not_found")
      .say("Done.")
      .write(ClaudeCodeTranscriptBuilder.sessionPath(fixture, sessionId));
  }

  static writeProviderReportSession(fixture: Fixture, sessionId: string, startedAt: string): void {
    const agentId = `p${sessionId}`;
    const agentLine = { attributionAgent: "migrations-writer" };
    new ClaudeCodeTranscriptBuilder(sessionId, fixture.projectDir, startedAt, { isSidechain: true, agentId })
      .user(`Write the migration for ${sessionId}`)
      .apiError("There's an issue with the selected model (glm-5.3). It may not exist.", 2, {
        ...agentLine, apiErrorStatus: 404, error: "model_not_found",
      })
      .apiError("There's an issue with the selected model (glm-5.3). It may not exist.", 2, {
        ...agentLine, apiErrorStatus: 404, error: "model_not_found",
      })
      .tool(`m_${sessionId}`, "Write", { file_path: join(fixture.projectDir, "db/001.sql") }, {
        secondsLater: 30, lineFields: { ...agentLine, attributionSkill: "db-migrations" },
      })
      .result(`m_${sessionId}`, "File created")
      .writeTo(fixture);
    const runStartAtMs = Date.parse(startedAt);
    new ClaudeCodeTranscriptBuilder(sessionId, fixture.projectDir, startedAt)
      .user("Add a migration for the invoices table")
      .tool(`d_${sessionId}`, "Agent", { subagent_type: "migrations-writer", prompt: `Write the migration for ${sessionId}` })
      .result(`d_${sessionId}`, "Migration written", { secondsLater: 40, toolUseResult: { agentId } })
      .say("Done.")
      .record("system", { subtype: "turn_duration", durationMs: 90_000, isMeta: true })
      .record(COST_STATE_ATTACHMENT, { totalCostUSD: 0.5, startTime: runStartAtMs, hasUnknownModelCost: false })
      .record(COST_STATE_ATTACHMENT, { totalCostUSD: 1.25, startTime: runStartAtMs, hasUnknownModelCost: true })
      .idle(3600)
      .user("Now run it")
      .say("Ran it.")
      .record("system", { subtype: "turn_duration", durationMs: 30_000, isMeta: true })
      .record(COST_STATE_ATTACHMENT, {
        totalCostUSD: 0.75,
        startTime: runStartAtMs + 3_600_000,
        hasUnknownModelCost: false,
      })
      .write(ClaudeCodeTranscriptBuilder.sessionPath(fixture, sessionId));
  }

  static writeWorkflowSession(fixture: Fixture, sessionId: string, startedAt: string): void {
    const transcript = new ClaudeCodeTranscriptBuilder(sessionId, fixture.projectDir, startedAt)
      .user("Ship the billing fix")
      .tool(`ls_${sessionId}`, "Bash", { command: "ls -la" })
      .result(`ls_${sessionId}`, "src");
    const steps = ["git status", "git add -A", "npx tsc --noEmit", "git commit -m 'fix billing'", "git push origin HEAD"];
    steps.forEach((command, stepIndex) => {
      transcript.tool(`w${stepIndex}_${sessionId}`, "Bash", { command }).result(`w${stepIndex}_${sessionId}`, "ok");
    });
    transcript
      .record("system", { subtype: "turn_duration", durationMs: 60_000, isMeta: true })
      .record("system", { subtype: "compact_boundary", compactMetadata: { trigger: "auto", preTokens: 950_000 } })
      .tool(`bad_${sessionId}`, "; the getAll call uses userId from the request.<tool_call>Edit", { file_path: "x" })
      .result(`bad_${sessionId}`, "<tool_use_error>Error: No such tool available</tool_use_error>", { isError: true })
      .say("Shipped.")
      .write(ClaudeCodeTranscriptBuilder.sessionPath(fixture, sessionId));
  }

  static useHistoryFixture(setUpMore?: (fixture: Fixture) => void): HistoryFixture {
    let current: Fixture | undefined;
    let restoreEnv: (() => void) | undefined;
    beforeAll(() => {
      current = ClaudeCodeFixtureUtil.makeFixture();
      ClaudeCodeFixtureUtil.writeHarness(current);
      ClaudeCodeFixtureUtil.writeHistory(current);
      setUpMore?.(current);
      restoreEnv = ClaudeCodeFixtureUtil.useFixtureEnv(current);
    });
    afterAll(() => {
      restoreEnv?.();
      if (current) {
        rmSync(current.root, { recursive: true, force: true });
      }
    });
    const fixtureOrThrow = (): Fixture => {
      if (!current) {
        throw new Error("The history fixture is only available inside tests.");
      }
      return current;
    };
    return {
      get fixture() {
        return fixtureOrThrow();
      },
      commonOptions: () => ({
        projectDir: fixtureOrThrow().projectDir,
        dataDir: fixtureOrThrow().dataDir,
      }),
    };
  }

  static useFixtureEnv(fixture: Fixture): () => void {
    const previousHome = process.env.HARNESS_LEDGER_CLAUDE_HOME;
    const previousJson = process.env.HARNESS_LEDGER_CLAUDE_JSON;
    process.env.HARNESS_LEDGER_CLAUDE_HOME = fixture.claudeHome;
    process.env.HARNESS_LEDGER_CLAUDE_JSON = fixture.claudeJson;
    return () => {
      ClaudeCodeFixtureUtil.restoreEnv("HARNESS_LEDGER_CLAUDE_HOME", previousHome);
      ClaudeCodeFixtureUtil.restoreEnv("HARNESS_LEDGER_CLAUDE_JSON", previousJson);
    };
  }

  private static restoreEnv(name: "HARNESS_LEDGER_CLAUDE_HOME" | "HARNESS_LEDGER_CLAUDE_JSON", value: string | undefined): void {
    if (value === undefined) {
      process.env[name] = "";
    } else {
      process.env[name] = value;
    }
  }
}
