// Test-only. Builds a fake Claude Code home and project on disk, in the format Claude Code writes:
// one JSON object per line, tool_use/tool_result blocks, the message usage repeated on every
// content-block line, and subagent transcripts in <session>/subagents/.

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ClaudeCodePathUtil } from "./ClaudeCodePathUtil.js";

export interface Fixture {
  root: string;
  claudeHome: string;
  projectDir: string;
  claudeJson: string;
  dataDir: string;
}

const FAKE_SECRETS = {
  bearerToken: "abcdefghijklmnop1234567",
  githubToken: "ghp_abcdefghijklmnopqrstuvwxyz123456",
  anthropicKey: "sk-ant-secretsecretsecret123",
};

let uuidCounter = 0;

const DEFAULT_TOOL_USAGE = {
  input_tokens: 100,
  output_tokens: 50,
  cache_read_input_tokens: 1000,
  cache_creation_input_tokens: 0,
};
const DEFAULT_TEXT_USAGE = {
  input_tokens: 80,
  output_tokens: 40,
  cache_read_input_tokens: 500,
  cache_creation_input_tokens: 0,
};
const DEFAULT_MODEL = "claude-sonnet-4-6";

export interface TranscriptOptions {
  isSidechain?: boolean;
  agentId?: string;
}

export interface ToolStepOptions {
  secondsLater?: number;
  model?: string;
  /** Extra fields on the assistant lines, e.g. `attributionSkill`. */
  lineFields?: Record<string, unknown>;
  /** Replaces the default output tokens of the step. */
  outputTokens?: number;
}

export interface TestRunOptions {
  commandSeconds?: number;
  model?: string;
  outputTokens?: number;
}

export interface ResultOptions {
  isError?: boolean;
  secondsLater?: number;
  toolUseResult?: unknown;
  /** `toolDenialKind` on the result line, e.g. "user-rejected" or "automode-blocked". */
  denialKind?: string;
}

/** Fluent builder for one transcript file. */
export class ClaudeCodeTranscriptBuilder {
  readonly lines: unknown[] = [];
  private currentAtMs: number;

  constructor(
    readonly sessionId: string,
    readonly cwd: string,
    startedAt: string,
    readonly options: TranscriptOptions = {},
  ) {
    this.currentAtMs = Date.parse(startedAt);
  }

  private lineBase(type: string, secondsLater: number) {
    this.currentAtMs += secondsLater * 1000;
    return {
      type,
      uuid: ClaudeCodeFixtureUtil.nextUuid(),
      sessionId: this.sessionId,
      cwd: this.cwd,
      gitBranch: "main",
      version: "2.1.287",
      isSidechain: this.options.isSidechain === true,
      ...(this.options.agentId ? { agentId: this.options.agentId } : {}),
      timestamp: new Date(this.currentAtMs).toISOString(),
    };
  }

  user(text: string, secondsLater = 5): this {
    this.lines.push({
      ...this.lineBase("user", secondsLater),
      message: { role: "user", content: text },
    });
    return this;
  }

  /** An assistant message with one tool_use, written as two lines (text, then tool_use) that share the usage. */
  tool(id: string, name: string, input: Record<string, unknown>, stepOptions: ToolStepOptions = {}): this {
    const messageId = `msg_${id}`;
    const model = stepOptions.model ?? DEFAULT_MODEL;
    const outputTokens = stepOptions.outputTokens ?? DEFAULT_TOOL_USAGE.output_tokens;
    const usage = { ...DEFAULT_TOOL_USAGE, output_tokens: outputTokens };
    const message = { id: messageId, role: "assistant", model, usage };
    this.lines.push({
      ...this.lineBase("assistant", stepOptions.secondsLater ?? 3),
      ...stepOptions.lineFields,
      message: { ...message, content: [{ type: "text", text: "Working." }] },
    });
    this.lines.push({
      ...this.lineBase("assistant", 0),
      ...stepOptions.lineFields,
      message: { ...message, content: [{ type: "tool_use", id, name, input }] },
    });
    return this;
  }

  result(id: string, content: string, resultOptions: ResultOptions = {}): this {
    const block = {
      type: "tool_result",
      tool_use_id: id,
      content,
      ...(resultOptions.isError ? { is_error: true } : {}),
    };
    this.lines.push({
      ...this.lineBase("user", resultOptions.secondsLater ?? 2),
      message: { role: "user", content: [block] },
      ...(resultOptions.toolUseResult ? { toolUseResult: resultOptions.toolUseResult } : {}),
      ...(resultOptions.denialKind ? { toolDenialKind: resultOptions.denialKind } : {}),
    });
    return this;
  }

  say(text: string, secondsLater = 3): this {
    const message = {
      id: `msg_${ClaudeCodeFixtureUtil.nextUuid()}`,
      role: "assistant",
      model: DEFAULT_MODEL,
      content: [{ type: "text", text }],
      usage: DEFAULT_TEXT_USAGE,
    };
    this.lines.push({ ...this.lineBase("assistant", secondsLater), message });
    return this;
  }

  /** A user line written by Claude Code rather than the person, e.g. a background-task notification. */
  systemUser(text: string, originKind: string, secondsLater = 5): this {
    this.lines.push({
      ...this.lineBase("user", secondsLater),
      origin: { kind: originKind },
      promptSource: "system",
      message: { role: "user", content: text },
    });
    return this;
  }

  /** A prompt sent while the agent was busy: Claude Code writes it as a `queued_command` attachment. */
  queued(prompt: string, commandMode: "prompt" | "task-notification", originKind = "human", secondsLater = 5): this {
    this.lines.push({
      ...this.lineBase("attachment", secondsLater),
      attachment: { type: "queued_command", commandMode, prompt, origin: { kind: originKind } },
    });
    return this;
  }

  /** An API error, which Claude Code writes as an assistant message from the "<synthetic>" model. */
  apiError(text: string, secondsLater = 3, lineFields: Record<string, unknown> = {}): this {
    const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    this.lines.push({
      ...this.lineBase("assistant", secondsLater),
      isApiErrorMessage: true,
      ...lineFields,
      message: { id: `msg_${ClaudeCodeFixtureUtil.nextUuid()}`, role: "assistant", model: "<synthetic>", content: [{ type: "text", text }], usage },
    });
    return this;
  }

  /** A line without a message, such as `cost-state` or a `system` line. */
  record(type: string, fields: Record<string, unknown>, secondsLater = 1): this {
    this.lines.push({ ...this.lineBase(type, secondsLater), ...fields });
    return this;
  }

  idle(seconds: number): this {
    this.currentAtMs += seconds * 1000;
    return this;
  }

  write(file: string): void {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${this.lines.map((line) => JSON.stringify(line)).join("\n")}\n`);
  }
}

type SubagentTypeSource = "meta" | "result" | "prompt";

/** Test-only helpers for a fake Claude Code home and project. */
export class ClaudeCodeFixtureUtil {
  static readonly FAKE_SECRETS = FAKE_SECRETS;

  static makeFixture(): Fixture {
    const root = mkdtempSync(join(tmpdir(), "imh-test-"));
    const claudeHome = join(root, "claude-home");
    const projectDir = join(root, "work", "my-app");
    mkdirSync(join(claudeHome, "projects", ClaudeCodePathUtil.encodeProjectDir(projectDir)), { recursive: true });
    mkdirSync(join(projectDir, ".claude", "agents"), { recursive: true });
    mkdirSync(join(projectDir, ".claude", "skills", "changelog"), { recursive: true });
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
      dataDir: join(root, "imh-data"),
    };
  }

  static writeHarness(fixture: Fixture): void {
    const { projectDir } = fixture;
    writeFileSync(join(projectDir, "CLAUDE.md"), "# My app\n\n- Run tests with `pnpm test`, never npm.\n- Keep PRs small.\n");
    writeFileSync(
      join(projectDir, ".claude", "agents", "test-runner.md"),
      "---\nname: test-runner\ndescription: Runs the test suite and reports failures\ntools: Bash, Read\nmodel: haiku\n---\nRun the tests.\n",
    );
    writeFileSync(
      join(projectDir, ".claude", "agents", "code-reviewer.md"),
      "---\nname: code-reviewer\ndescription: Reviews diffs\n---\nReview the change.\n",
    );
    writeFileSync(
      join(projectDir, ".claude", "agents", "docs-writer.md"),
      "---\nname: docs-writer\ndescription: Writes docs\nskills: changelog\n---\nWrite docs.\n",
    );
    writeFileSync(
      join(projectDir, ".claude", "skills", "changelog", "SKILL.md"),
      "---\nname: changelog\ndescription: Generates changelog entries\n---\nSteps...\n",
    );
    mkdirSync(join(projectDir, ".claude", "skills", "changelog", "references"), { recursive: true });
    writeFileSync(join(projectDir, ".claude", "skills", "changelog", "references", "format.md"), "# Entry format\n");
    const guardHook = {
      matcher: "Bash",
      hooks: [{ type: "command", command: `./scripts/guard.sh --token ${FAKE_SECRETS.anthropicKey}` }],
    };
    writeFileSync(
      join(projectDir, ".claude", "settings.json"),
      JSON.stringify({
        cleanupPeriodDays: 60,
        hooks: { PreToolUse: [guardHook] },
        permissions: { allow: ["Bash(pnpm test)"], deny: [] },
      }),
    );
  }

  static nextUuid(): string {
    uuidCounter++;
    return `00000000-0000-4000-8000-${String(uuidCounter).padStart(12, "0")}`;
  }

  static sessionPath(fixture: Fixture, sessionId: string): string {
    return join(fixture.claudeHome, "projects", ClaudeCodePathUtil.encodeProjectDir(fixture.projectDir), `${sessionId}.jsonl`);
  }

  static subagentPath(fixture: Fixture, sessionId: string, agentId: string): string {
    const projectFolder = join(fixture.claudeHome, "projects", ClaudeCodePathUtil.encodeProjectDir(fixture.projectDir));
    return join(projectFolder, sessionId, "subagents", `agent-${agentId}.jsonl`);
  }

  /** A session where test-runner runs `npm test` (fails), then `pnpm test` (works). */
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
      .tool(`task_${sessionId}`, "Task", { subagent_type: "test-runner", description: "Run tests", prompt: delegationPrompt });
    const agentId = `a${sessionId}`;
    new ClaudeCodeTranscriptBuilder(sessionId, fixture.projectDir, startedAt, { isSidechain: true, agentId })
      .user(delegationPrompt, 4)
      .tool(`b1_${sessionId}`, "Bash", { command: "cd app && npm test" }, { secondsLater: 5, model: "claude-haiku-4-5" })
      .result(`b1_${sessionId}`, "Exit code 1\nnpm ERR! Missing script: \"test\"", { isError: true, secondsLater: 20 })
      .tool(`b2_${sessionId}`, "Bash", { command: "pnpm test" }, { secondsLater: 6, model: "claude-haiku-4-5" })
      .result(`b2_${sessionId}`, "Tests: 42 passed", { secondsLater: 30 })
      .say("All tests pass.")
      .write(ClaudeCodeFixtureUtil.subagentPath(fixture, sessionId, agentId));
    if (typeSource === "meta") {
      const metaFile = ClaudeCodeFixtureUtil.subagentPath(fixture, sessionId, agentId).replace(/\.jsonl$/, ".meta.json");
      writeFileSync(metaFile, JSON.stringify({ agentType: "test-runner" }));
    }
    const toolUseResult = typeSource === "result" ? { agentId, status: "completed" } : undefined;
    return main.result(`task_${sessionId}`, "All tests pass.", { secondsLater: 70, toolUseResult }).say("Done.");
  }

  /**
   * A realistic history:
   * - s1..s3: the test-runner subagent runs `npm test` (fails), then `pnpm test` (works).
   * - s2: code-reviewer re-reads a file the main thread had just read.
   * - s2, s5, s6: "generate the changelog entry from the last PRs" (repeated request).
   * - s4: a correction, two permission denials and a secret in a command.
   */
  static writeHistory(fixture: Fixture, firstDay = "2026-09-10"): void {
    const firstDayAtMs = Date.parse(`${firstDay}T10:00:00.000Z`);
    const dayAt = (dayOffset: number): string => new Date(firstDayAtMs + dayOffset * 86_400_000).toISOString();
    const changelogRequest = "Generate the changelog entry from the last PRs please";
    const authFile = join(fixture.projectDir, "src/auth.ts");
    const authContent = "export function login() {}".repeat(40);

    ClaudeCodeFixtureUtil.testRunSession(fixture, "s1", dayAt(0), "meta", "Fix the failing login test")
      .tool("sk1", "Skill", { skill: "changelog" })
      .result("sk1", "Launching skill")
      .say("Here is the entry.")
      .write(ClaudeCodeFixtureUtil.sessionPath(fixture, "s1"));

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
    reviewer.say("Looks good.").write(ClaudeCodeFixtureUtil.subagentPath(fixture, "s2", "rev1"));
    s2Main.result("task_rev", "Looks good.", { secondsLater: 60 }).say("Reviewed.").write(ClaudeCodeFixtureUtil.sessionPath(fixture, "s2"));

    ClaudeCodeFixtureUtil.testRunSession(fixture, "s3", dayAt(2), "prompt", "Fix the failing login test").write(ClaudeCodeFixtureUtil.sessionPath(fixture, "s3"));

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
      .write(ClaudeCodeFixtureUtil.sessionPath(fixture, "s4"));

    for (const [sessionId, dayOffset] of [["s5", 4], ["s6", 5]] as const) {
      new ClaudeCodeTranscriptBuilder(sessionId, fixture.projectDir, dayAt(dayOffset))
        .user("generate the changelog entry from the last PRs")
        .tool(`g_${sessionId}`, "Bash", { command: "gh pr list --state merged" })
        .result(`g_${sessionId}`, "#12 feat: login")
        .say("Entry ready.")
        .write(ClaudeCodeFixtureUtil.sessionPath(fixture, sessionId));
    }

    // A transcript from another project must be ignored.
    new ClaudeCodeTranscriptBuilder("other", "/somewhere/else", dayAt(0))
      .user("hello")
      .write(join(fixture.claudeHome, "projects", "-somewhere-else", "other.jsonl"));
  }

  /**
   * A session where test-runner runs one command, for before/after tests. `commandSeconds` is how long
   * the command takes and `model` the subagent's model, to vary time and cost independently.
   */
  static writeTestRunnerSession(
    fixture: Fixture,
    sessionId: string,
    startedAt: string,
    command: string,
    isFailing: boolean,
    runOptions: TestRunOptions = {},
  ): void {
    const agentId = `x${sessionId}`;
    const delegationPrompt = `run tests for ${sessionId}`;
    const subagentOptions = { isSidechain: true, agentId };
    const subagent = new ClaudeCodeTranscriptBuilder(sessionId, fixture.projectDir, startedAt, subagentOptions)
      .user(delegationPrompt)
      .tool(`b_${sessionId}`, "Bash", { command }, { model: runOptions.model, outputTokens: runOptions.outputTokens });
    if (isFailing) {
      subagent
        .result(`b_${sessionId}`, "Exit code 1\nnpm ERR! Missing script", { isError: true })
        .tool(`c_${sessionId}`, "Bash", { command: "pnpm test" })
        .result(`c_${sessionId}`, "ok");
    } else {
      subagent.result(`b_${sessionId}`, "ok", { secondsLater: runOptions.commandSeconds });
    }
    subagent.write(ClaudeCodeFixtureUtil.subagentPath(fixture, sessionId, agentId));
    new ClaudeCodeTranscriptBuilder(sessionId, fixture.projectDir, startedAt)
      .user("run the tests")
      .tool(`task_${sessionId}`, "Task", { subagent_type: "test-runner", prompt: delegationPrompt })
      .result(`task_${sessionId}`, "ok", { secondsLater: 30, toolUseResult: { agentId } })
      .write(ClaudeCodeFixtureUtil.sessionPath(fixture, sessionId));
  }

  /**
   * Cases seen in real sessions (content is synthetic):
   * - the person rejects a plan (ExitPlanMode) with feedback;
   * - the auto-mode classifier blocks reading credentials, twice;
   * - a Python script fails with a FutureWarning printed before the traceback;
   * - `git -C <dir> stash pop` fails after a git warning line;
   * - a correction typed while the agent was busy (queued), next to a background-task notification;
   * - a model behind a proxy with no known price, and an API error message.
   */
  static writeRealCasesSession(fixture: Fixture, sessionId: string, startedAt: string): void {
    new ClaudeCodeTranscriptBuilder(sessionId, fixture.projectDir, startedAt)
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
      .queued("Background task finished: lint", "task-notification", "task-notification")
      .systemUser("<task-notification><status>completed</status><summary>lint done</summary></task-notification>", "task-notification")
      .tool(`loop_${sessionId}`, "Bash", { command: "for f in jobs/*.py; do python3 -m py_compile $f; done" })
      .result(`loop_${sessionId}`, "")
      .tool(`home_${sessionId}`, "Read", { file_path: join(homedir(), ".claude", "skills", "review", "SKILL.md") })
      .result(`home_${sessionId}`, "---\nname: review\n---")
      .queued("não, usa a fila que já existe", "prompt")
      .tool(`glm_${sessionId}`, "Read", { file_path: join(fixture.projectDir, "jobs/billing.ts") }, { model: "glm-5.2" })
      .result(`glm_${sessionId}`, "export const billing = 1;")
      .apiError("API Error: 404 model_not_found")
      .say("Done.")
      .write(ClaudeCodeFixtureUtil.sessionPath(fixture, sessionId));
  }

  /**
   * Data Claude Code computes itself (content is synthetic):
   * - two runs of the session (resumed), each ending with a `cost-state` total;
   * - `turn_duration` lines for the main thread's turns;
   * - a subagent whose type is known only from `attributionAgent` (no meta file), running a skill
   *   (`attributionSkill`), whose requests fail twice with `model_not_found` before it falls back.
   */
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
      .write(ClaudeCodeFixtureUtil.subagentPath(fixture, sessionId, agentId));
    const runStartAtMs = Date.parse(startedAt);
    new ClaudeCodeTranscriptBuilder(sessionId, fixture.projectDir, startedAt)
      .user("Add a migration for the invoices table")
      .tool(`d_${sessionId}`, "Agent", { subagent_type: "migrations-writer", prompt: `Write the migration for ${sessionId}` })
      .result(`d_${sessionId}`, "Migration written", { secondsLater: 40, toolUseResult: { agentId } })
      .say("Done.")
      .record("system", { subtype: "turn_duration", durationMs: 90_000, isMeta: true })
      .record("cost-state", { totalCostUSD: 0.5, startTime: runStartAtMs, hasUnknownModelCost: false })
      .record("cost-state", { totalCostUSD: 1.25, startTime: runStartAtMs, hasUnknownModelCost: true })
      .idle(3600)
      .user("Now run it")
      .say("Ran it.")
      .record("system", { subtype: "turn_duration", durationMs: 30_000, isMeta: true })
      .record("cost-state", { totalCostUSD: 0.75, startTime: runStartAtMs + 3_600_000, hasUnknownModelCost: false })
      .write(ClaudeCodeFixtureUtil.sessionPath(fixture, sessionId));
  }

  /** Points the reader at the fixture's Claude Code home. Returns a function that restores the environment. */
  static useFixtureEnv(fixture: Fixture): () => void {
    const previousHome = process.env.IMH_CLAUDE_HOME;
    const previousJson = process.env.IMH_CLAUDE_JSON;
    process.env.IMH_CLAUDE_HOME = fixture.claudeHome;
    process.env.IMH_CLAUDE_JSON = fixture.claudeJson;
    return () => {
      ClaudeCodeFixtureUtil.restoreEnv("IMH_CLAUDE_HOME", previousHome);
      ClaudeCodeFixtureUtil.restoreEnv("IMH_CLAUDE_JSON", previousJson);
    };
  }

  private static restoreEnv(name: "IMH_CLAUDE_HOME" | "IMH_CLAUDE_JSON", value: string | undefined): void {
    if (value === undefined) {
      process.env[name] = "";
    } else {
      process.env[name] = value;
    }
  }
}
