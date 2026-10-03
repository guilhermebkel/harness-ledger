import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Fixture, ResultOptions, ToolStepOptions, TranscriptOptions } from "@/Providers/ClaudeCode/Protocols/ClaudeCodeFixtureProtocol.ts";
import { ClaudeCodePathUtil } from "@/Providers/ClaudeCode/Utils/ClaudeCodePathUtil.ts";

const TASK_NOTIFICATION = "task-notification";

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

export class ClaudeCodeTranscriptBuilder {
  static readonly TASK_NOTIFICATION = TASK_NOTIFICATION;

  readonly lines: unknown[] = [];
  private currentAtMs: number;

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
      uuid: ClaudeCodeTranscriptBuilder.nextUuid(),
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

  tool(id: string, name: string, input: Record<string, unknown>, stepOptions: ToolStepOptions = {}): this {
    const messageId = `msg_${id}`;
    const model = stepOptions.model ?? DEFAULT_MODEL;
    const outputTokens = stepOptions.outputTokens ?? DEFAULT_TOOL_USAGE.output_tokens;
    const usage = { ...DEFAULT_TOOL_USAGE, output_tokens: outputTokens };
    // Why: Claude Code writes text and tool_use as two lines that share the usage.
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
      id: `msg_${ClaudeCodeTranscriptBuilder.nextUuid()}`,
      role: "assistant",
      model: DEFAULT_MODEL,
      content: [{ type: "text", text }],
      usage: DEFAULT_TEXT_USAGE,
    };
    this.lines.push({ ...this.lineBase("assistant", secondsLater), message });
    return this;
  }

  systemUser(text: string, originKind: string, secondsLater = 5): this {
    this.lines.push({
      ...this.lineBase("user", secondsLater),
      origin: { kind: originKind },
      promptSource: "system",
      message: { role: "user", content: text },
    });
    return this;
  }

  queued(prompt: string, commandMode: "prompt" | typeof TASK_NOTIFICATION, originKind = "human", secondsLater = 5): this {
    this.lines.push({
      ...this.lineBase("attachment", secondsLater),
      attachment: { commandMode, prompt, type: "queued_command", origin: { kind: originKind } },
    });
    return this;
  }

  apiError(text: string, secondsLater = 3, lineFields: Record<string, unknown> = {}): this {
    const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    this.lines.push({
      ...this.lineBase("assistant", secondsLater),
      isApiErrorMessage: true,
      ...lineFields,
      message: { id: `msg_${ClaudeCodeTranscriptBuilder.nextUuid()}`, role: "assistant", model: "<synthetic>", content: [{ type: "text", text }], usage },
    });
    return this;
  }

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

  writeTo(fixture: Fixture): void {
    const agentId = this.options.agentId;
    const file = agentId === undefined
      ? ClaudeCodeTranscriptBuilder.sessionPath(fixture, this.sessionId)
      : ClaudeCodeTranscriptBuilder.subagentPath(fixture, this.sessionId, agentId);
    this.write(file);
  }
}
