// Builds a fake Claude Code home and project on disk, in the format Claude Code writes:
// one JSON object per line, tool_use/tool_result blocks, the message usage repeated on every
// content-block line, and subagent transcripts in <session>/subagents/.

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { encodeProjectDir } from "../../src/adapters/claude-code/paths.js";

export interface Fixture {
  root: string;
  claudeHome: string;
  projectDir: string;
  claudeJson: string;
  dataDir: string;
}

export const FAKE_SECRETS = {
  bearerToken: "abcdefghijklmnop1234567",
  githubToken: "ghp_abcdefghijklmnopqrstuvwxyz123456",
  anthropicKey: "sk-ant-secretsecretsecret123",
};

export function makeFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), "imh-test-"));
  const claudeHome = join(root, "claude-home");
  const projectDir = join(root, "work", "my-app");
  mkdirSync(join(claudeHome, "projects", encodeProjectDir(projectDir)), { recursive: true });
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

export function writeHarness(fixture: Fixture): void {
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
    "---\nname: docs-writer\ndescription: Writes docs\n---\nWrite docs.\n",
  );
  writeFileSync(
    join(projectDir, ".claude", "skills", "changelog", "SKILL.md"),
    "---\nname: changelog\ndescription: Generates changelog entries\n---\nSteps...\n",
  );
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

let uuidCounter = 0;
function nextUuid(): string {
  uuidCounter++;
  return `00000000-0000-4000-8000-${String(uuidCounter).padStart(12, "0")}`;
}

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
}

export interface ResultOptions {
  isError?: boolean;
  secondsLater?: number;
  toolUseResult?: unknown;
}

/** Fluent builder for one transcript file. */
export class Transcript {
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
      uuid: nextUuid(),
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
    const message = { id: messageId, role: "assistant", model, usage: DEFAULT_TOOL_USAGE };
    this.lines.push({
      ...this.lineBase("assistant", stepOptions.secondsLater ?? 3),
      message: { ...message, content: [{ type: "text", text: "Working." }] },
    });
    this.lines.push({
      ...this.lineBase("assistant", 0),
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
    });
    return this;
  }

  say(text: string, secondsLater = 3): this {
    const message = {
      id: `msg_${nextUuid()}`,
      role: "assistant",
      model: DEFAULT_MODEL,
      content: [{ type: "text", text }],
      usage: DEFAULT_TEXT_USAGE,
    };
    this.lines.push({ ...this.lineBase("assistant", secondsLater), message });
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

export function sessionPath(fixture: Fixture, sessionId: string): string {
  return join(fixture.claudeHome, "projects", encodeProjectDir(fixture.projectDir), `${sessionId}.jsonl`);
}

export function subagentPath(fixture: Fixture, sessionId: string, agentId: string): string {
  const projectFolder = join(fixture.claudeHome, "projects", encodeProjectDir(fixture.projectDir));
  return join(projectFolder, sessionId, "subagents", `agent-${agentId}.jsonl`);
}

type SubagentTypeSource = "meta" | "result" | "prompt";

/** A session where test-runner runs `npm test` (fails), then `pnpm test` (works). */
function testRunSession(
  fixture: Fixture,
  sessionId: string,
  startedAt: string,
  typeSource: SubagentTypeSource,
  firstPrompt: string,
): Transcript {
  const delegationPrompt = `Run the test suite for ${sessionId}`;
  const main = new Transcript(sessionId, fixture.projectDir, startedAt)
    .user(firstPrompt)
    .tool(`task_${sessionId}`, "Task", { subagent_type: "test-runner", description: "Run tests", prompt: delegationPrompt });
  const agentId = `a${sessionId}`;
  new Transcript(sessionId, fixture.projectDir, startedAt, { isSidechain: true, agentId })
    .user(delegationPrompt, 4)
    .tool(`b1_${sessionId}`, "Bash", { command: "cd app && npm test" }, { secondsLater: 5, model: "claude-haiku-4-5" })
    .result(`b1_${sessionId}`, "Exit code 1\nnpm ERR! Missing script: \"test\"", { isError: true, secondsLater: 20 })
    .tool(`b2_${sessionId}`, "Bash", { command: "pnpm test" }, { secondsLater: 6, model: "claude-haiku-4-5" })
    .result(`b2_${sessionId}`, "Tests: 42 passed", { secondsLater: 30 })
    .say("All tests pass.")
    .write(subagentPath(fixture, sessionId, agentId));
  if (typeSource === "meta") {
    const metaFile = subagentPath(fixture, sessionId, agentId).replace(/\.jsonl$/, ".meta.json");
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
export function writeHistory(fixture: Fixture, firstDay = "2026-09-10"): void {
  const firstDayAtMs = Date.parse(`${firstDay}T10:00:00.000Z`);
  const dayAt = (dayOffset: number): string => new Date(firstDayAtMs + dayOffset * 86_400_000).toISOString();
  const changelogRequest = "Generate the changelog entry from the last PRs please";
  const authFile = join(fixture.projectDir, "src/auth.ts");
  const authContent = "export function login() {}".repeat(40);

  testRunSession(fixture, "s1", dayAt(0), "meta", "Fix the failing login test")
    .tool("sk1", "Skill", { skill: "changelog" })
    .result("sk1", "Launching skill")
    .say("Here is the entry.")
    .write(sessionPath(fixture, "s1"));

  const s2Main = testRunSession(fixture, "s2", dayAt(1), "result", changelogRequest)
    .tool("r_main", "Read", { file_path: authFile })
    .result("r_main", authContent)
    .tool("task_rev", "Task", { subagent_type: "code-reviewer", description: "Review", prompt: "Review the auth change" });
  const reviewer = new Transcript("s2", fixture.projectDir, dayAt(1), { isSidechain: true, agentId: "rev1" })
    .idle(400)
    .user("Review the auth change");
  for (let readIndex = 0; readIndex < 4; readIndex++) {
    reviewer.tool(`rr${readIndex}`, "Read", { file_path: authFile }).result(`rr${readIndex}`, authContent);
  }
  reviewer.say("Looks good.").write(subagentPath(fixture, "s2", "rev1"));
  s2Main.result("task_rev", "Looks good.", { secondsLater: 60 }).say("Reviewed.").write(sessionPath(fixture, "s2"));

  testRunSession(fixture, "s3", dayAt(2), "prompt", "Fix the failing login test").write(sessionPath(fixture, "s3"));

  new Transcript("s4", fixture.projectDir, dayAt(3))
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
    .write(sessionPath(fixture, "s4"));

  for (const [sessionId, dayOffset] of [["s5", 4], ["s6", 5]] as const) {
    new Transcript(sessionId, fixture.projectDir, dayAt(dayOffset))
      .user("generate the changelog entry from the last PRs")
      .tool(`g_${sessionId}`, "Bash", { command: "gh pr list --state merged" })
      .result(`g_${sessionId}`, "#12 feat: login")
      .say("Entry ready.")
      .write(sessionPath(fixture, sessionId));
  }

  // A transcript from another project must be ignored.
  new Transcript("other", "/somewhere/else", dayAt(0))
    .user("hello")
    .write(join(fixture.claudeHome, "projects", "-somewhere-else", "other.jsonl"));
}

/** A session where test-runner runs one command, for before/after tests. */
export function writeTestRunnerSession(
  fixture: Fixture,
  sessionId: string,
  startedAt: string,
  command: string,
  isFailing: boolean,
): void {
  const agentId = `x${sessionId}`;
  const delegationPrompt = `run tests for ${sessionId}`;
  const subagent = new Transcript(sessionId, fixture.projectDir, startedAt, { isSidechain: true, agentId })
    .user(delegationPrompt)
    .tool(`b_${sessionId}`, "Bash", { command });
  if (isFailing) {
    subagent
      .result(`b_${sessionId}`, "Exit code 1\nnpm ERR! Missing script", { isError: true })
      .tool(`c_${sessionId}`, "Bash", { command: "pnpm test" })
      .result(`c_${sessionId}`, "ok");
  } else {
    subagent.result(`b_${sessionId}`, "ok");
  }
  subagent.write(subagentPath(fixture, sessionId, agentId));
  new Transcript(sessionId, fixture.projectDir, startedAt)
    .user("run the tests")
    .tool(`task_${sessionId}`, "Task", { subagent_type: "test-runner", prompt: delegationPrompt })
    .result(`task_${sessionId}`, "ok", { secondsLater: 30, toolUseResult: { agentId } })
    .write(sessionPath(fixture, sessionId));
}

/** Points the reader at the fixture's Claude Code home. Returns a function that restores the environment. */
export function useFixtureEnv(fixture: Fixture): () => void {
  const previousHome = process.env.IMH_CLAUDE_HOME;
  const previousJson = process.env.IMH_CLAUDE_JSON;
  process.env.IMH_CLAUDE_HOME = fixture.claudeHome;
  process.env.IMH_CLAUDE_JSON = fixture.claudeJson;
  return () => {
    restoreEnv("IMH_CLAUDE_HOME", previousHome);
    restoreEnv("IMH_CLAUDE_JSON", previousJson);
  };
}

function restoreEnv(name: "IMH_CLAUDE_HOME" | "IMH_CLAUDE_JSON", value: string | undefined): void {
  if (value === undefined) {
    process.env[name] = "";
  } else {
    process.env[name] = value;
  }
}
