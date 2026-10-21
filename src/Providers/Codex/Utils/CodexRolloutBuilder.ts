import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CodexCallOptions, CodexFixture, CodexSubagentOptions, CodexTokenOptions } from "@/Providers/Codex/Protocols/CodexFixtureProtocol.ts";

const MS_PER_SECOND = 1000;
const CLI_VERSION = "0.119.0";

export class CodexRolloutBuilder {
  private atMs: number;
  private readonly lines: string[] = [];

  constructor(
    private readonly sessionId: string,
    private readonly cwd: string,
    startedAt: string,
    private readonly subagent?: CodexSubagentOptions,
  ) {
    this.atMs = Date.parse(startedAt);
    const meta = this.metaPayload();
    this.lines.push(this.line("session_meta", meta));
  }

  turn(model: string): this {
    return this.add("turn_context", { turn_id: `turn-${this.lines.length}`, cwd: this.cwd, effort: "medium", current_date: "2026-09-01", model });
  }

  user(text: string): this {
    return this.add("event_msg", { type: "user_message", message: text, images: [], local_images: [], text_elements: [] });
  }

  injectedContext(text: string): this {
    const content = [{ type: "input_text", text }];
    return this.add("response_item", { type: "message", role: "user", content });
  }

  say(text: string): this {
    const content = [{ type: "output_text", text }];
    return this.add("response_item", { type: "message", role: "assistant", content });
  }

  call(callId: string, name: string, args: Record<string, unknown>, options: CodexCallOptions = {}): this {
    this.wait(options.secondsLater ?? 1);
    return this.add("response_item", { type: "function_call", arguments: JSON.stringify(args), call_id: callId, name });
  }

  customCall(callId: string, name: string, input: string): this {
    this.wait(1);
    return this.add("response_item", { type: "custom_tool_call", status: "completed", call_id: callId, name, input });
  }

  output(callId: string, output: string, options: CodexCallOptions = {}): this {
    this.wait(options.secondsLater ?? 1);
    return this.add("response_item", { type: "function_call_output", call_id: callId, output });
  }

  declined(callId: string): this {
    const payload = { type: "exec_command_end", call_id: callId, status: "declined", exit_code: -1, command: ["rm"], cwd: this.cwd };
    return this.add("event_msg", payload);
  }

  webSearch(query: string): this {
    this.wait(1);
    return this.add("response_item", { type: "web_search_call", status: "completed", action: { type: "search", query } });
  }

  tokens(options: CodexTokenOptions): this {
    const usage = {
      input_tokens: options.input,
      cached_input_tokens: options.cached,
      output_tokens: options.output,
      reasoning_output_tokens: 0,
      total_tokens: options.total,
    };
    const info = { total_token_usage: usage, last_token_usage: usage, model_context_window: 258_400 };
    return this.add("event_msg", { type: "token_count", rate_limits: null, info });
  }

  aborted(): this {
    this.wait(1);
    return this.add("event_msg", { type: "turn_aborted", reason: "interrupted", duration_ms: 1000 });
  }

  complete(durationMs: number): this {
    this.wait(1);
    return this.add("event_msg", { type: "task_complete", turn_id: "t", duration_ms: durationMs, time_to_first_token_ms: 400 });
  }

  compacted(): this {
    this.wait(1);
    this.add("compacted", { message: "", replacement_history: [] });
    return this.add("event_msg", { type: "context_compacted" });
  }

  raw(type: string, payload: Record<string, unknown>): this {
    return this.add(type, payload);
  }

  rawLine(text: string): this {
    this.lines.push(text);
    return this;
  }

  wait(seconds: number): this {
    this.atMs += seconds * MS_PER_SECOND;
    return this;
  }

  writeTo(fixture: CodexFixture): string {
    const dayDir = join(fixture.codexHome, "sessions", "2026", "09", "01");
    mkdirSync(dayDir, { recursive: true });
    const file = join(dayDir, `rollout-2026-09-01T10-00-00-${this.sessionId}.jsonl`);
    writeFileSync(file, `${this.lines.join("\n")}\n`);
    return file;
  }

  private add(type: string, payload: Record<string, unknown>): this {
    this.atMs += MS_PER_SECOND;
    this.lines.push(this.line(type, payload));
    return this;
  }

  private line(type: string, payload: Record<string, unknown>): string {
    return JSON.stringify({ timestamp: new Date(this.atMs).toISOString(), type, payload });
  }

  private metaPayload(): Record<string, unknown> {
    const spawn = this.subagent && {
      thread_spawn: {
        parent_thread_id: this.subagent.parentId,
        depth: 1,
        agent_path: null,
        agent_nickname: "Scout",
        agent_role: this.subagent.role,
      },
    };
    return {
      id: this.sessionId,
      timestamp: new Date(this.atMs).toISOString(),
      cwd: this.cwd,
      originator: "codex-tui",
      cli_version: CLI_VERSION,
      source: spawn ? { subagent: spawn } : "cli",
      model_provider: "openai",
      base_instructions: { text: "You are Codex." },
      git: { commit_hash: "abc123", branch: "main", repository_url: "git@example.com:org/my-app.git" },
    };
  }
}
