import { readdir, stat } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";
import type { DiscoverOptions, ParseOptions, TranscriptFile } from "@/Shared/Protocols/ProviderProtocol.ts";
import type {
  AssistantMessage,
  SessionFacts,
  TokenUsage,
  ToolCall,
  ToolResultKind,
} from "@/Shared/Protocols/SessionProtocol.ts";
import type { UnknownRecord } from "@/Shared/Protocols/UtilProtocol.ts";
import { GuardUtil } from "@/Shared/Utils/GuardUtil.ts";
import { HashUtil } from "@/Shared/Utils/HashUtil.ts";
import { JsonlUtil } from "@/Shared/Utils/JsonlUtil.ts";
import { NormalizeUtil } from "@/Shared/Utils/NormalizeUtil.ts";
import { RedactUtil } from "@/Shared/Utils/RedactUtil.ts";
import { SessionUtil } from "@/Shared/Utils/SessionUtil.ts";
import { UnknownLineUtil } from "@/Shared/Utils/UnknownLineUtil.ts";
import { ThreadSummaryUtil } from "@/Shared/Utils/ThreadSummaryUtil.ts";
import type {
  CodexEvidenceFactory,
  CodexParseContext,
  CodexRolloutEntry,
  CodexRolloutLine,
  CodexToolDescription,
} from "@/Providers/Codex/Protocols/CodexProtocol.ts";
import { CodexPathUtil } from "@/Providers/Codex/Utils/CodexPathUtil.ts";
import { CodexTranscriptUtil } from "@/Providers/Codex/Utils/CodexTranscriptUtil.ts";

const ROLLOUT_PREFIX = "rollout-";
const ROLLOUT_EXTENSION = ".jsonl";
const UNKNOWN_SUBAGENT_TYPE = "subagent";
const MAX_PROMPT_CHARS = 2000;
const MAX_UNKNOWN_TYPE_CHARS = 60;
const INTERRUPTION_TEXT = "[Request interrupted by user]";
const MCP_TOOL_PREFIX = "mcp__";
const MCP_TOOL_SEPARATOR = "__";
const PATCH_FILE_PATTERN = /^\*\*\* (?:Update|Add|Delete) File: (.+)$/m;
const FAILED_SCRIPT_PATTERN = /^Script failed/m;
const SHELL_WRAPPER_PARTS = 3;
const SHELL_SCRIPT_FLAGS = new Set(["-c", "-lc"]);
const TIMED_LINE_TYPES = new Set(["event_msg", "response_item"]);
// Why: Codex writes these for its own interface or repeats what another line already carries; none feeds a signal.
// A type missing here and from the handlers is reported as a gap, so add new ones after checking.
const IGNORED_EVENT_TYPES = new Set([
  "agent_message",
  "agent_reasoning",
  "agent_reasoning_raw_content",
  "task_started",
  "web_search_end",
  "item_completed",
  "sub_agent_activity",
  "collab_agent_spawn_end",
  "collab_waiting_end",
  "context_compacted",
  "thread_rolled_back",
  "thread_settings_applied",
  "entered_review_mode",
  "exited_review_mode",
  "mcp_tool_call_end",
  "patch_apply_end",
]);
const IGNORED_ITEM_TYPES = new Set(["ghost_snapshot", "agent_message"]);
const IGNORED_LINE_TYPES = new Set(["world_state", "inter_agent_communication_metadata"]);

type ToolDescriber = (input: UnknownRecord, rawInput: string | undefined) => CodexToolDescription;
type LineType = "session_meta" | "turn_context" | "event_msg" | "response_item" | "compacted";
type LineHandler = (context: CodexParseContext, line: CodexRolloutLine, isMainFile: boolean) => void;
type PayloadHandler = (context: CodexParseContext, line: CodexRolloutLine, isMainFile: boolean) => void;

const commandOf = (input: UnknownRecord): string | undefined => {
  const command = input.cmd ?? input.command;
  const asList = GuardUtil.asArray(command).filter((part): part is string => typeof part === "string");
  const isShellWrapper = asList.length >= SHELL_WRAPPER_PARTS && SHELL_SCRIPT_FLAGS.has(asList[1] ?? "");
  const script = isShellWrapper ? asList.at(-1) : undefined;
  return GuardUtil.asString(command) ?? script ?? (asList.length ? asList.join(" ") : undefined);
};
const describeShell: ToolDescriber = (input) => {
  const command = commandOf(input) ?? "";
  return {
    key: NormalizeUtil.commandKey(command),
    category: "shell",
    summary: command,
  };
};
const describePatch: ToolDescriber = (_input, rawInput) => ({
  key: "apply_patch",
  category: "edit",
  summary: "apply_patch",
  filePath: PATCH_FILE_PATTERN.exec(rawInput ?? "")?.[1],
});
const describePlan: ToolDescriber = () => ({ key: "update_plan", category: "plan", summary: "update_plan" });
const describeSpawn: ToolDescriber = (input) => {
  const subagentType = GuardUtil.asString(input.agent_type) ?? "default";
  const message = GuardUtil.asString(input.message);
  return {
    key: `spawn_agent:${subagentType}`,
    category: "delegation",
    summary: `spawn ${subagentType}`,
    subagentPromptHash: message === undefined ? undefined : HashUtil.sha(message),
    subagentType,
  };
};
const NAME_TO_DESCRIBER: Record<string, ToolDescriber> = {
  exec_command: describeShell,
  shell_command: describeShell,
  shell: describeShell,
  local_shell: describeShell,
  apply_patch: describePatch,
  update_plan: describePlan,
  spawn_agent: describeSpawn,
};
const RESULT_KIND_TO_IS_ERROR: Record<ToolResultKind, boolean> = {
  ok: false,
  error: true,
  permission_denied: true,
  user_rejected: true,
  interrupted: true,
  hook_blocked: true,
};

export class CodexSessionService {
  private readonly lineTypeToHandler: Record<LineType, LineHandler> = {
    session_meta: (context, line, isMainFile) => {
      this.handleSessionMeta(context, line, isMainFile);
    },
    turn_context: (context, line) => {
      this.handleTurnContext(context, line);
    },
    event_msg: (context, line, isMainFile) => {
      this.handlePayload(context, line, isMainFile, this.eventTypeToHandler, IGNORED_EVENT_TYPES);
    },
    response_item: (context, line, isMainFile) => {
      this.handlePayload(context, line, isMainFile, this.itemTypeToHandler, IGNORED_ITEM_TYPES);
    },
    compacted: (context, line) => {
      this.handleCompaction(context, line);
    },
  };

  private readonly eventTypeToHandler: Record<"user_message" | "token_count" | "turn_aborted" | "task_complete" | "exec_command_end", PayloadHandler> = {
    user_message: (context, line, isMainFile) => {
      this.handleUserMessage(context, line, isMainFile);
    },
    token_count: (context, line) => {
      this.handleTokenCount(context, line);
    },
    turn_aborted: (context, line) => {
      this.addPrompt(context, line, INTERRUPTION_TEXT, true);
    },
    task_complete: (context, line, isMainFile) => {
      this.handleTaskComplete(context, line, isMainFile);
    },
    exec_command_end: (context, line) => {
      this.handleCommandEnd(context, line);
    },
  };

  private readonly itemTypeToHandler: Record<
    "function_call" | "custom_tool_call" | "web_search_call" | "function_call_output" | "custom_tool_call_output" | "message" | "reasoning",
    PayloadHandler
  > = {
    function_call: (context, line) => {
      this.handleToolCall(context, line, line.payload.arguments);
    },
    custom_tool_call: (context, line) => {
      this.handleToolCall(context, line, line.payload.input);
    },
    web_search_call: (context, line) => {
      this.handleWebSearch(context, line);
    },
    function_call_output: (context, line) => {
      this.handleToolOutput(context, line);
    },
    custom_tool_call_output: (context, line) => {
      this.handleToolOutput(context, line);
    },
    message: (context, line) => {
      this.handleItemMessage(context, line);
    },
    reasoning: (context, line) => {
      this.openMessageFor(context, line);
    },
  };

  constructor(private readonly homeDir: string) {}

  async discoverTranscripts(options: DiscoverOptions): Promise<TranscriptFile[]> {
    const entries = await this.listRollouts();
    const idToEntry = new Map<string, CodexRolloutEntry>();
    for (const entry of entries) {
      if (entry.meta.id) {
        idToEntry.set(entry.meta.id, entry);
      }
    }
    const parentIdToChildren = new Map<string, CodexRolloutEntry[]>();
    const roots: CodexRolloutEntry[] = [];
    for (const entry of entries) {
      const parentId = entry.meta.parentThreadId;
      if (parentId !== undefined && idToEntry.has(parentId)) {
        parentIdToChildren.set(parentId, [...(parentIdToChildren.get(parentId) ?? []), entry]);
      } else {
        roots.push(entry);
      }
    }
    const { projectDir } = options;
    return roots
      .filter((entry) => options.shouldReadAllProjects === true || this.isInsideProject(entry.meta.cwd, projectDir))
      .map((entry) => ({
        file: entry.file,
        modifiedAtMs: entry.modifiedAtMs,
        bytes: entry.bytes,
        sessionId: entry.meta.id ?? this.idFromFileName(entry.file),
        subagentFiles: (parentIdToChildren.get(entry.meta.id ?? "") ?? []).map((child) => ({
          file: child.file,
          modifiedAtMs: child.modifiedAtMs,
          bytes: child.bytes,
        })),
        isExactProject: entry.meta.cwd === options.projectDir,
      }))
      .sort((left, right) => left.modifiedAtMs - right.modifiedAtMs);
  }

  async parseSession(transcript: TranscriptFile, options: ParseOptions): Promise<SessionFacts> {
    const facts: SessionFacts = {
      provider: "codex",
      sessionId: transcript.sessionId,
      file: transcript.file,
      activeMs: 0,
      threads: [],
      prompts: [],
      tools: [],
      messages: [],
      apiErrors: [],
      compactions: [],
      environment: {},
      reported: {
        isCostPartial: true,
        turns: [],
      },
      files: [transcript.file, ...transcript.subagentFiles.map((subagentFile) => subagentFile.file)],
      unparsedLines: 0,
    };
    const context: CodexParseContext = {
      facts,
      currentFile: transcript.file,
      currentThread: SessionUtil.mainThread(),
      callIdToPendingCall: new Map(),
      threadIdToEventsAtMs: new Map(),
      threadIdToFirstPromptHash: new Map(),
      threadIdToModel: new Map(),
      threadIdToLastTotalTokens: new Map(),
    };
    await this.readRollout(context, transcript.file, true);
    for (const subagentFile of transcript.subagentFiles) {
      const meta = await CodexTranscriptUtil.readSessionMeta(subagentFile.file);
      context.currentFile = subagentFile.file;
      context.openMessage = undefined;
      context.currentThread = {
        id: meta.id ?? basename(subagentFile.file, ROLLOUT_EXTENSION),
        agentType: meta.agentType ?? UNKNOWN_SUBAGENT_TYPE,
      };
      await this.readRollout(context, subagentFile.file, false);
    }
    ThreadSummaryUtil.summarize({
      facts,
      idleMs: options.idleMs,
      threadIdToEventsAtMs: context.threadIdToEventsAtMs,
      threadIdToFirstPromptHash: context.threadIdToFirstPromptHash,
    });
    facts.environment.platform ??= SessionUtil.platformFromPath(facts.projectDir);
    return facts;
  }

  private async listRollouts(): Promise<CodexRolloutEntry[]> {
    const sessionsDir = CodexPathUtil.sessionsDir(this.homeDir);
    const names = await readdir(sessionsDir, { recursive: true }).catch(() => [] as string[]);
    const files = names.filter((name) => basename(name).startsWith(ROLLOUT_PREFIX) && name.endsWith(ROLLOUT_EXTENSION));
    const entries: CodexRolloutEntry[] = [];
    for (const name of files) {
      const file = join(sessionsDir, name);
      const fileStat = await stat(file).catch(() => undefined);
      if (fileStat?.isFile()) {
        entries.push({
          file,
          modifiedAtMs: fileStat.mtimeMs,
          bytes: fileStat.size,
          meta: await CodexTranscriptUtil.readSessionMeta(file),
        });
      }
    }
    return entries;
  }

  private isInsideProject(cwd: string | undefined, projectDir: string): boolean {
    if (cwd === undefined) {
      return false;
    }
    const path = relative(projectDir, cwd);
    return path === "" || (!path.startsWith("..") && !path.startsWith(sep) && !/^[A-Za-z]:/.test(path));
  }

  private idFromFileName(file: string): string {
    return basename(file, ROLLOUT_EXTENSION).slice(ROLLOUT_PREFIX.length);
  }

  private async readRollout(context: CodexParseContext, file: string, isMainFile: boolean): Promise<void> {
    await JsonlUtil.read(file, {
      onRecord: (record, lineNumber) => {
        this.handleRecord(context, record, lineNumber, isMainFile);
      },
      onBadLine: () => {
        context.facts.unparsedLines++;
      },
    });
  }

  private handleRecord(context: CodexParseContext, value: unknown, lineNumber: number, isMainFile: boolean): void {
    const record = GuardUtil.asRecord(value);
    if (!record) {
      return;
    }
    const occurredAt = GuardUtil.asString(record.timestamp);
    const parsedAtMs = occurredAt === undefined ? Number.NaN : Date.parse(occurredAt);
    const line: CodexRolloutLine = {
      payload: GuardUtil.asRecord(record.payload) ?? {},
      thread: context.currentThread,
      occurredAtMs: Number.isNaN(parsedAtMs) ? undefined : parsedAtMs,
      record,
      lineNumber,
      occurredAt,
    };
    const lineType = GuardUtil.asString(record.type);
    if (line.occurredAtMs !== undefined && lineType !== undefined && TIMED_LINE_TYPES.has(lineType)) {
      const eventsAtMs = context.threadIdToEventsAtMs.get(line.thread.id) ?? [];
      eventsAtMs.push(line.occurredAtMs);
      context.threadIdToEventsAtMs.set(line.thread.id, eventsAtMs);
    }
    if (GuardUtil.isKeyOf(this.lineTypeToHandler, lineType)) {
      this.lineTypeToHandler[lineType](context, line, isMainFile);
      return;
    }
    if (!IGNORED_LINE_TYPES.has(lineType ?? "")) {
      UnknownLineUtil.record(context.facts, record, lineType);
    }
  }

  private handlePayload(
    context: CodexParseContext,
    line: CodexRolloutLine,
    isMainFile: boolean,
    typeToHandler: Record<string, PayloadHandler>,
    ignoredTypes: Set<string>,
  ): void {
    const payloadType = GuardUtil.asString(line.payload.type);
    if (payloadType !== undefined && Object.hasOwn(typeToHandler, payloadType)) {
      typeToHandler[payloadType]?.(context, line, isMainFile);
      return;
    }
    if (!ignoredTypes.has(payloadType ?? "")) {
      UnknownLineUtil.record(context.facts, line.payload, `${GuardUtil.asString(line.record.type) ?? ""}:${payloadType ?? "(no type)"}`);
    }
  }

  private evidenceFactory(context: CodexParseContext, line: CodexRolloutLine): CodexEvidenceFactory {
    return (text?: string) => ({
      sessionId: context.facts.sessionId,
      file: context.currentFile,
      line: line.lineNumber,
      occurredAt: line.occurredAt,
      thread: line.thread.agentType,
      excerpt: text ? RedactUtil.excerpt(text) : undefined,
    });
  }

  private handleSessionMeta(context: CodexParseContext, line: CodexRolloutLine, isMainFile: boolean): void {
    const facts = context.facts;
    context.facts.agentVersion = GuardUtil.asString(line.payload.cli_version) ?? facts.agentVersion;
    if (!isMainFile) {
      return;
    }
    facts.projectDir ??= GuardUtil.asString(line.payload.cwd);
    facts.gitBranch ??= GuardUtil.asString(GuardUtil.asRecord(line.payload.git)?.branch);
  }

  private handleTurnContext(context: CodexParseContext, line: CodexRolloutLine): void {
    const model = GuardUtil.asString(line.payload.model);
    if (model) {
      context.threadIdToModel.set(line.thread.id, model);
    }
  }

  private handleCompaction(context: CodexParseContext, line: CodexRolloutLine): void {
    context.facts.compactions.push({
      trigger: "auto",
      thread: line.thread,
      ref: this.evidenceFactory(context, line)(),
      occurredAtMs: line.occurredAtMs,
    });
  }

  private handleTaskComplete(context: CodexParseContext, line: CodexRolloutLine, isMainFile: boolean): void {
    const durationMs = GuardUtil.asNumber(line.payload.duration_ms);
    if (isMainFile && durationMs !== undefined) {
      context.facts.reported.turns.push({ durationMs, endedAtMs: line.occurredAtMs });
    }
  }

  private handleUserMessage(context: CodexParseContext, line: CodexRolloutLine, isMainFile: boolean): void {
    const text = GuardUtil.asString(line.payload.message);
    if (text === undefined || CodexTranscriptUtil.isInjectedContext(text)) {
      return;
    }
    if (!context.threadIdToFirstPromptHash.has(line.thread.id)) {
      context.threadIdToFirstPromptHash.set(line.thread.id, HashUtil.sha(text));
    }
    if (isMainFile) {
      this.addPrompt(context, line, text, false);
    }
  }

  private addPrompt(context: CodexParseContext, line: CodexRolloutLine, text: string, isInterruption: boolean): void {
    context.openMessage = undefined;
    context.facts.prompts.push({
      text: RedactUtil.redact(text.slice(0, MAX_PROMPT_CHARS)),
      ref: this.evidenceFactory(context, line)(text),
      sentAtMs: line.occurredAtMs,
      isCorrection: !isInterruption && NormalizeUtil.isCorrection(text),
      isInterruption,
    });
  }

  private handleItemMessage(context: CodexParseContext, line: CodexRolloutLine): void {
    if (line.payload.role !== "assistant") {
      return;
    }
    this.openMessageFor(context, line);
  }

  private openMessageFor(context: CodexParseContext, line: CodexRolloutLine): AssistantMessage {
    if (context.openMessage) {
      return context.openMessage;
    }
    const message: AssistantMessage = {
      id: `${line.thread.id}:${line.lineNumber}`,
      model: context.threadIdToModel.get(line.thread.id),
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      thread: line.thread,
      sentAtMs: line.occurredAtMs,
      ref: this.evidenceFactory(context, line)(),
    };
    context.facts.messages.push(message);
    context.openMessage = message;
    return message;
  }

  private handleTokenCount(context: CodexParseContext, line: CodexRolloutLine): void {
    const info = GuardUtil.asRecord(line.payload.info);
    const total = GuardUtil.asNumber(GuardUtil.asRecord(info?.total_token_usage)?.total_tokens);
    const last = GuardUtil.asRecord(info?.last_token_usage);
    if (!last || total === undefined || context.threadIdToLastTotalTokens.get(line.thread.id) === total) {
      return;
    }
    context.threadIdToLastTotalTokens.set(line.thread.id, total);
    const message = this.openMessageFor(context, line);
    message.usage = this.usageOf(last);
    context.openMessage = undefined;
  }

  private usageOf(usage: UnknownRecord): TokenUsage {
    const input = GuardUtil.asNumber(usage.input_tokens) ?? 0;
    const cacheRead = GuardUtil.asNumber(usage.cached_input_tokens) ?? 0;
    return {
      input: Math.max(input - cacheRead, 0),
      output: GuardUtil.asNumber(usage.output_tokens) ?? 0,
      cacheRead: cacheRead,
      cacheWrite: 0,
    };
  }

  private describeTool(name: string, rawInput: unknown): CodexToolDescription {
    const input = CodexTranscriptUtil.argumentsOf(rawInput);
    const describer = Object.hasOwn(NAME_TO_DESCRIBER, name) ? NAME_TO_DESCRIBER[name] : undefined;
    if (describer) {
      return describer(input, GuardUtil.asString(rawInput));
    }
    const afterPrefix = name.slice(MCP_TOOL_PREFIX.length);
    const mcpServer = name.startsWith(MCP_TOOL_PREFIX) ? afterPrefix.split(MCP_TOOL_SEPARATOR)[0] : undefined;
    if (mcpServer) {
      return { key: mcpServer, category: "mcp", summary: name };
    }
    return { key: name, category: "other", summary: name };
  }

  private handleToolCall(context: CodexParseContext, line: CodexRolloutLine, rawInput: unknown): void {
    const callId = GuardUtil.asString(line.payload.call_id);
    const name = GuardUtil.asString(line.payload.name);
    if (callId === undefined || name === undefined) {
      return;
    }
    const message = this.openMessageFor(context, line);
    const description = this.describeTool(name, rawInput);
    const call: ToolCall = {
      id: callId,
      name: RedactUtil.excerpt(name, MAX_UNKNOWN_TYPE_CHARS),
      ...description,
      key: RedactUtil.redact(description.key),
      summary: RedactUtil.excerpt(description.summary),
      thread: line.thread,
      ref: this.evidenceFactory(context, line)(description.summary),
      calledAtMs: line.occurredAtMs,
      messageId: message.id,
    };
    context.facts.tools.push(call);
    context.callIdToPendingCall.set(callId, call);
  }

  private handleWebSearch(context: CodexParseContext, line: CodexRolloutLine): void {
    const message = this.openMessageFor(context, line);
    const query = GuardUtil.asString(GuardUtil.asRecord(line.payload.action)?.query) ?? "web_search";
    const id = `web_search:${line.lineNumber}`;
    context.facts.tools.push({
      id,
      name: "web_search",
      key: "web_search",
      category: "search",
      summary: RedactUtil.excerpt(query),
      thread: line.thread,
      ref: this.evidenceFactory(context, line)(query),
      calledAtMs: line.occurredAtMs,
      messageId: message.id,
    });
  }

  private handleCommandEnd(context: CodexParseContext, line: CodexRolloutLine): void {
    const callId = GuardUtil.asString(line.payload.call_id);
    const call = callId === undefined ? undefined : context.callIdToPendingCall.get(callId);
    if (!call || line.payload.status !== "declined") {
      return;
    }
    call.result = {
      isError: true,
      kind: "user_rejected",
      errorHead: "declined",
      contentChars: 0,
      ref: this.evidenceFactory(context, line)("declined"),
      returnedAtMs: line.occurredAtMs,
    };
  }

  private handleToolOutput(context: CodexParseContext, line: CodexRolloutLine): void {
    const callId = GuardUtil.asString(line.payload.call_id);
    const call = callId === undefined ? undefined : context.callIdToPendingCall.get(callId);
    if (!call || call.result) {
      return;
    }
    const text = CodexTranscriptUtil.outputText(line.payload.output);
    const exitCode = CodexTranscriptUtil.exitCodeOf(text);
    const kind: ToolResultKind = (exitCode !== undefined && exitCode !== 0) || FAILED_SCRIPT_PATTERN.test(text) ? "error" : "ok";
    const isError = RESULT_KIND_TO_IS_ERROR[kind];
    call.result = {
      isError,
      kind,
      errorHead: isError ? RedactUtil.excerpt(NormalizeUtil.errorKey(text)) : undefined,
      contentChars: text.length,
      ref: this.evidenceFactory(context, line)(isError ? text : undefined),
      returnedAtMs: line.occurredAtMs,
    };
  }
}
