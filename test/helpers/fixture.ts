// Builds a fake Claude Code home + project on disk, in the transcript format
// Claude Code writes (one JSON object per line, tool_use/tool_result blocks,
// usage repeated on every content-block line, subagents in <session>/subagents/).

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeProjectDir } from "../../src/adapters/claude-code/paths.js";

export interface Fixture {
  root: string;
  home: string;
  project: string;
  claudeJson: string;
  dataDir: string;
}

export function makeFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), "imh-test-"));
  const home = join(root, "claude-home");
  const project = join(root, "work", "my-app");
  mkdirSync(join(home, "projects", encodeProjectDir(project)), { recursive: true });
  mkdirSync(join(project, ".claude", "agents"), { recursive: true });
  mkdirSync(join(project, ".claude", "skills", "changelog"), { recursive: true });
  const claudeJson = join(root, "claude.json");
  writeFileSync(claudeJson, JSON.stringify({ mcpServers: { github: { command: "/usr/bin/gh-mcp", env: { GITHUB_TOKEN: "ghp_abcdefghijklmnopqrstuvwxyz123456" } } } }));
  return { root, home, project, claudeJson, dataDir: join(root, "imh-data") };
}

export function writeHarness(f: Fixture): void {
  writeFileSync(join(f.project, "CLAUDE.md"), "# My app\n\n- Run tests with `pnpm test`, never npm.\n- Keep PRs small.\n");
  writeFileSync(
    join(f.project, ".claude", "agents", "test-runner.md"),
    "---\nname: test-runner\ndescription: Runs the test suite and reports failures\ntools: Bash, Read\nmodel: haiku\n---\nRun the tests.\n",
  );
  writeFileSync(
    join(f.project, ".claude", "agents", "code-reviewer.md"),
    "---\nname: code-reviewer\ndescription: Reviews diffs\n---\nReview the change.\n",
  );
  writeFileSync(
    join(f.project, ".claude", "agents", "docs-writer.md"),
    "---\nname: docs-writer\ndescription: Writes docs\n---\nWrite docs.\n",
  );
  writeFileSync(
    join(f.project, ".claude", "skills", "changelog", "SKILL.md"),
    "---\nname: changelog\ndescription: Generates changelog entries\n---\nSteps...\n",
  );
  writeFileSync(
    join(f.project, ".claude", "settings.json"),
    JSON.stringify({
      cleanupPeriodDays: 60,
      hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "./scripts/guard.sh --token sk-ant-secretsecretsecret123" }] }] },
      permissions: { allow: ["Bash(pnpm test)"], deny: [] },
    }),
  );
}

let uuidCounter = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, "0")}`;

/** Fluent builder for one transcript file. */
export class Transcript {
  lines: unknown[] = [];
  private t: number;
  constructor(
    readonly sessionId: string,
    readonly cwd: string,
    start: string,
    readonly opts: { sidechain?: boolean; agentId?: string } = {},
  ) {
    this.t = Date.parse(start);
  }

  private base(type: string, secondsLater: number) {
    this.t += secondsLater * 1000;
    return {
      type,
      uuid: uuid(),
      sessionId: this.sessionId,
      cwd: this.cwd,
      gitBranch: "main",
      version: "2.1.287",
      isSidechain: !!this.opts.sidechain,
      ...(this.opts.agentId ? { agentId: this.opts.agentId } : {}),
      timestamp: new Date(this.t).toISOString(),
    };
  }

  user(text: string, after = 5, extra: Record<string, unknown> = {}) {
    this.lines.push({ ...this.base("user", after), message: { role: "user", content: text }, ...extra });
    return this;
  }

  /** An assistant message with one tool_use, written as two lines (text + tool_use) sharing usage. */
  tool(id: string, name: string, input: Record<string, unknown>, after = 3, usage = { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0 }, model = "claude-sonnet-4-6") {
    const msgId = `msg_${id}`;
    this.lines.push({ ...this.base("assistant", after), message: { id: msgId, role: "assistant", model, content: [{ type: "text", text: "Working." }], usage } });
    this.lines.push({ ...this.base("assistant", 0), message: { id: msgId, role: "assistant", model, content: [{ type: "tool_use", id, name, input }], usage } });
    return this;
  }

  result(id: string, content: string, isError = false, after = 2, toolUseResult?: unknown) {
    this.lines.push({
      ...this.base("user", after),
      message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content, ...(isError ? { is_error: true } : {}) }] },
      ...(toolUseResult ? { toolUseResult } : {}),
    });
    return this;
  }

  say(text: string, after = 3, usage = { input_tokens: 80, output_tokens: 40, cache_read_input_tokens: 500, cache_creation_input_tokens: 0 }) {
    this.lines.push({ ...this.base("assistant", after), message: { id: `msg_${uuid()}`, role: "assistant", model: "claude-sonnet-4-6", content: [{ type: "text", text }], usage } });
    return this;
  }

  idle(seconds: number) {
    this.t += seconds * 1000;
    return this;
  }

  write(file: string) {
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, `${this.lines.map((l) => JSON.stringify(l)).join("\n")}\n`);
  }
}

export function sessionPath(f: Fixture, sessionId: string): string {
  return join(f.home, "projects", encodeProjectDir(f.project), `${sessionId}.jsonl`);
}

export function subagentPath(f: Fixture, sessionId: string, agentId: string): string {
  return join(f.home, "projects", encodeProjectDir(f.project), sessionId, "subagents", `agent-${agentId}.jsonl`);
}

/**
 * A realistic history:
 * - s1..s3: the test-runner subagent runs `npm test` (fails), then `pnpm test` (works).
 * - s2: code-reviewer re-reads a file the main thread had just read.
 * - s1, s3, s5, s6: "generate the changelog entry from the last PRs" (repeated request).
 * - s4: a correction and two permission denials; a secret in a command.
 */
export function writeHistory(f: Fixture, startDay = "2026-09-10"): void {
  const day = (n: number) => `${startDay.slice(0, 8)}${String(Number(startDay.slice(8)) + n).padStart(2, "0")}T10:00:00.000Z`;
  const testRun = (sid: string, n: number, withMeta: "meta" | "result" | "prompt") => {
    const main = new Transcript(sid, f.project, day(n))
      .user(n % 2 === 1 ? "Generate the changelog entry from the last PRs please" : "Fix the failing login test")
      .tool(`task_${sid}`, "Task", { subagent_type: "test-runner", description: "Run tests", prompt: `Run the test suite for ${sid}` });
    const agentId = `a${sid}`;
    const sub = new Transcript(sid, f.project, day(n), { sidechain: true, agentId })
      .user(`Run the test suite for ${sid}`, 4)
      .tool(`b1_${sid}`, "Bash", { command: "cd app && npm test" }, 5, undefined, "claude-haiku-4-5")
      .result(`b1_${sid}`, "Exit code 1\nnpm ERR! Missing script: \"test\"", true, 20)
      .tool(`b2_${sid}`, "Bash", { command: "pnpm test" }, 6, undefined, "claude-haiku-4-5")
      .result(`b2_${sid}`, "Tests: 42 passed", false, 30)
      .say("All tests pass.", 3);
    sub.write(subagentPath(f, sid, agentId));
    if (withMeta === "meta") {
      writeFileSync(subagentPath(f, sid, agentId).replace(/\.jsonl$/, ".meta.json"), JSON.stringify({ agentType: "test-runner" }));
    }
    main.result(`task_${sid}`, "All tests pass.", false, 70, withMeta === "result" ? { agentId, status: "completed" } : undefined).say("Done.");
    return main;
  };

  const s1 = testRun("s1", 0, "meta");
  s1.tool("sk1", "Skill", { skill: "changelog" }).result("sk1", "Launching skill").say("Here is the entry.");
  s1.write(sessionPath(f, "s1"));

  const s2 = testRun("s2", 1, "result");
  s2.tool("r_main", "Read", { file_path: join(f.project, "src/auth.ts") }).result("r_main", "export function login() {}".repeat(40));
  s2.tool("task_rev", "Task", { subagent_type: "code-reviewer", description: "Review", prompt: "Review the auth change" });
  const rev = new Transcript("s2", f.project, day(1), { sidechain: true, agentId: "rev1" }).idle(400).user("Review the auth change");
  for (let i = 0; i < 4; i++) rev.tool(`rr${i}`, "Read", { file_path: join(f.project, "src/auth.ts") }).result(`rr${i}`, "export function login() {}".repeat(40));
  rev.say("Looks good.");
  rev.write(subagentPath(f, "s2", "rev1"));
  s2.result("task_rev", "Looks good.", false, 60).say("Reviewed.");
  s2.write(sessionPath(f, "s2"));

  const s3 = testRun("s3", 2, "prompt");
  s3.write(sessionPath(f, "s3"));

  const s4 = new Transcript("s4", f.project, day(3))
    .user("<command-name>/changelog</command-name><command-args>for v2</command-args>")
    .tool("p1", "Bash", { command: "rm -rf dist" })
    .result("p1", "Permission to use Bash with command rm -rf dist has been denied.", true)
    .tool("p2", "Bash", { command: "rm -rf build" })
    .result("p2", "Permission to use Bash with command rm -rf build has been denied.", true)
    .tool("c1", "Bash", { command: 'curl -H "Authorization: Bearer abcdefghijklmnop1234567" https://api.example.com' })
    .result("c1", "ok")
    .say("Changelog for v2 is ready.")
    .user("no, it should include the migration notes too", 30)
    .say("Updated.")
    .idle(3600)
    .user("<system-reminder>ignore me</system-reminder>[Request interrupted by user]", 5);
  s4.write(sessionPath(f, "s4"));

  for (const [sid, n] of [["s5", 4], ["s6", 5]] as const) {
    new Transcript(sid, f.project, day(n))
      .user("generate the changelog entry from the last PRs")
      .tool(`g_${sid}`, "Bash", { command: "gh pr list --state merged" })
      .result(`g_${sid}`, "#12 feat: login")
      .say("Entry ready.")
      .write(sessionPath(f, sid));
  }

  // A transcript from another project must be ignored.
  new Transcript("other", "/somewhere/else", day(0)).user("hello").write(join(f.home, "projects", "-somewhere-else", "other.jsonl"));
}

export function useFixtureEnv(f: Fixture): () => void {
  const prev = { home: process.env.IMH_CLAUDE_HOME, json: process.env.IMH_CLAUDE_JSON };
  process.env.IMH_CLAUDE_HOME = f.home;
  process.env.IMH_CLAUDE_JSON = f.claudeJson;
  return () => {
    process.env.IMH_CLAUDE_HOME = prev.home;
    process.env.IMH_CLAUDE_JSON = prev.json;
  };
}
