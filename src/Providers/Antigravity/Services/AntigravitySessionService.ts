import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type {
  AntigravityParseContext,
  AntigravityToolDescription,
  AntigravityTranscriptLine,
} from "@/Providers/Antigravity/Protocols/AntigravityProtocol.ts";
import { AntigravityPathUtil } from "@/Providers/Antigravity/Utils/AntigravityPathUtil.ts";
import type { DiscoverOptions, ParseOptions, TranscriptFile } from "@/Shared/Protocols/ProviderProtocol.ts";
import type { AssistantMessage, EvidenceRef, SessionFacts, ToolCall } from "@/Shared/Protocols/SessionProtocol.ts";
import type { UnknownRecord } from "@/Shared/Protocols/UtilProtocol.ts";
import { UnknownLineUtil } from "@/Shared/Utils/UnknownLineUtil.ts";
import { ThreadSummaryUtil } from "@/Shared/Utils/ThreadSummaryUtil.ts";
import { SessionUtil } from "@/Shared/Utils/SessionUtil.ts";
import { RedactUtil } from "@/Shared/Utils/RedactUtil.ts";
import { NormalizeUtil } from "@/Shared/Utils/NormalizeUtil.ts";
import { JsonlUtil } from "@/Shared/Utils/JsonlUtil.ts";
import { HashUtil } from "@/Shared/Utils/HashUtil.ts";
import { GuardUtil } from "@/Shared/Utils/GuardUtil.ts";
import { CollectionUtil } from "@/Shared/Utils/CollectionUtil.ts";

const TRANSCRIPT_FILE_NAME = "transcript.jsonl";
const LOGS_SUBDIR = join(".system_generated", "logs");
const MAX_PROMPT_CHARS = 2000;
const MAX_NAME_CHARS = 60;
const DEFAULT_IDLE_MINUTES = 5;
const MS_PER_MINUTE = 60_000;
const IDLE_MS = DEFAULT_IDLE_MINUTES * MS_PER_MINUTE;
const TIMED_RECORD_TYPES = new Set<string>([
  "USER_INPUT",
  "PLANNER_RESPONSE",
  "ERROR_MESSAGE",
]);
// Why: Antigravity writes these for context sync or checkpoints; none feeds a signal directly.
const IGNORED_RECORD_TYPES = new Set<string>(["SYSTEM_MESSAGE", "CHECKPOINT"]);

type RecordHandler = (context: AntigravityParseContext, line: AntigravityTranscriptLine) => void;
type ToolDescriber = (args: UnknownRecord) => AntigravityToolDescription;

const describeShell: ToolDescriber = (args) => {
  const command = GuardUtil.asString(args.CommandLine) ?? GuardUtil.asString(args.command) ?? "";
  return {
    key: NormalizeUtil.commandKey(command),
    category: "shell",
    summary: command,
  };
};

const describeRead: ToolDescriber = (args) => {
  const filePath = GuardUtil.asString(args.Path) ?? GuardUtil.asString(args.path);
  return {
    key: "read",
    category: "read",
    summary: filePath ?? "read",
    filePath,
  };
};

const describeEdit: ToolDescriber = (args) => {
  const filePath = GuardUtil.asString(args.Path) ?? GuardUtil.asString(args.path);
  return {
    key: "edit",
    category: "edit",
    summary: filePath ?? "edit",
    filePath,
  };
};

const describeWrite: ToolDescriber = (args) => {
  const filePath = GuardUtil.asString(args.Path) ?? GuardUtil.asString(args.path);
  return {
    key: "write",
    category: "edit",
    summary: filePath ?? "write",
    filePath,
  };
};

const describePlan: ToolDescriber = (args) => {
  const action = GuardUtil.asString(args.Action) ?? GuardUtil.asString(args.action) ?? "manage_task";
  return {
    key: "manage_task",
    category: "plan",
    summary: action,
  };
};

const describeSearch: ToolDescriber = (args) => {
  const query = GuardUtil.asString(args.query) ?? "search_web";
  return {
    key: "search_web",
    category: "search",
    summary: query,
  };
};

const describeDelegation: ToolDescriber = (args) => {
  const subagentType = GuardUtil.asString(args.TypeName) ?? GuardUtil.asString(args.Role) ?? "subagent";
  const prompt = GuardUtil.asString(args.Prompt);
  return {
    key: `spawn_agent:${subagentType}`,
    category: "delegation",
    summary: subagentType,
    subagentType: subagentType,
    subagentPromptHash: prompt ? HashUtil.sha(prompt) : undefined,
  };
};

const NAME_TO_DESCRIBER = new Map<string, ToolDescriber>([
  ["run_command", describeShell],
  ["read_file", describeRead],
  ["edit_file", describeEdit],
  ["write_file", describeWrite],
  ["manage_task", describePlan],
  ["search_web", describeSearch],
  ["invoke_subagent", describeDelegation],
]);

export class AntigravitySessionService {
  private readonly recordTypeToHandler = new Map<string, RecordHandler>([
    ["USER_INPUT", (context, line) => {
      this.handleUserInput(context, line);
    }],
    ["PLANNER_RESPONSE", (context, line) => {
      this.handlePlannerResponse(context, line);
    }],
    ["ERROR_MESSAGE", (context, line) => {
      this.handleErrorMessage(context, line);
    }],
    ["GENERIC", (context, line) => {
      this.handleGeneric(context, line);
    }],
  ]);

  constructor(private readonly homeDir: string) {}

  async discoverTranscripts(options: DiscoverOptions): Promise<TranscriptFile[]> {
    const conversationIdToWorkspace = await this.readWorkspaceMap();
    const brainDir = AntigravityPathUtil.brainDir(this.homeDir);
    const conversationIds = await readdir(brainDir).catch(() => [] as string[]);
    const transcripts: TranscriptFile[] = [];
    for (const conversationId of conversationIds) {
      const transcriptPath = join(brainDir, conversationId, LOGS_SUBDIR, TRANSCRIPT_FILE_NAME);
      const fileStat = await stat(transcriptPath).catch(() => undefined);
      const workspace = conversationIdToWorkspace.get(conversationId);
      const isCandidate = options.shouldReadAllProjects === true
        || (workspace !== undefined && this.isInsideProject(workspace, options.projectDir));
      if (!fileStat?.isFile() || !isCandidate) {
        continue;
      }
      transcripts.push({
        file: transcriptPath,
        modifiedAtMs: fileStat.mtimeMs,
        bytes: fileStat.size,
        sessionId: conversationId,
        subagentFiles: [],
        isExactProject: workspace === options.projectDir,
      });
    }
    return transcripts.sort((left, right) => (
      left.modifiedAtMs - right.modifiedAtMs || CollectionUtil.compareCodeUnits(left.sessionId, right.sessionId)
    ));
  }

  async parseSession(transcript: TranscriptFile, options?: ParseOptions): Promise<SessionFacts> {
    const initialFacts: SessionFacts = {
      sessionId: transcript.sessionId,
      provider: "antigravity",
      file: transcript.file,
      files: [transcript.file],
      projectDir: options?.projectDir,
      activeMs: 0,
      prompts: [],
      tools: [],
      messages: [],
      threads: [],
      apiErrors: [],
      compactions: [],
      environment: {},
      reported: { isCostPartial: true, turns: [] },
      unparsedLines: 0,
    };
    const context: AntigravityParseContext = {
      facts: initialFacts,
      currentFile: transcript.file,
      currentThread: SessionUtil.mainThread(),
      threadIdToEventsAtMs: new Map(),
      threadIdToFirstPromptHash: new Map(),
    };
    await this.processTranscriptFile(context);
    ThreadSummaryUtil.summarize({
      facts: initialFacts,
      idleMs: options?.idleMs ?? IDLE_MS,
      threadIdToEventsAtMs: context.threadIdToEventsAtMs,
      threadIdToFirstPromptHash: context.threadIdToFirstPromptHash,
    });
    if (initialFacts.threads.length === 0) {
      initialFacts.threads.push({ thread: SessionUtil.mainThread(), activeMs: 0 });
    }
    initialFacts.environment.platform ??= SessionUtil.platformFromPath(initialFacts.projectDir);
    return initialFacts;
  }

  private async readWorkspaceMap(): Promise<Map<string, string>> {
    const conversationIdToWorkspace = new Map<string, string>();
    const historyFile = AntigravityPathUtil.historyFile(this.homeDir);
    await JsonlUtil.read(historyFile, {
      onRecord: (record) => {
        const entry = GuardUtil.asRecord(record);
        const conversationId = GuardUtil.asString(entry?.conversationId);
        const workspace = GuardUtil.asString(entry?.workspace);
        if (conversationId && workspace) {
          conversationIdToWorkspace.set(conversationId, workspace);
        }
      },
      onBadLine: () => undefined,
    }).catch(() => undefined);
    const lastConversationsFile = AntigravityPathUtil.lastConversationsFile(this.homeDir);
    const text = await readFile(lastConversationsFile, "utf8").catch(() => undefined);
    if (text) {
      this.mergeLastConversations(conversationIdToWorkspace, text);
    }
    return conversationIdToWorkspace;
  }

  private mergeLastConversations(conversationIdToWorkspace: Map<string, string>, text: string): void {
    const parsed = GuardUtil.asRecord(GuardUtil.parseJson(text));
    if (!parsed) {
      return;
    }
    for (const [workspace, conversationId] of Object.entries(parsed)) {
      const idString = GuardUtil.asString(conversationId);
      if (idString && !conversationIdToWorkspace.has(idString)) {
        conversationIdToWorkspace.set(idString, workspace);
      }
    }
  }

  private isInsideProject(cwd: string, projectDir: string): boolean {
    const path = relative(projectDir, cwd);
    return path === "" || (!path.startsWith("..") && !path.startsWith(sep) && !/^[A-Za-z]:/.test(path));
  }

  private async processTranscriptFile(context: AntigravityParseContext): Promise<void> {
    const streamHandlers = {
      onRecord: (record: unknown, lineIndex: number) => {
        this.handleRecord(context, record, lineIndex);
      },
      onBadLine: () => {
        context.facts.unparsedLines += 1;
      },
    };
    await JsonlUtil.read(context.currentFile, streamHandlers);
  }

  private handleRecord(context: AntigravityParseContext, value: unknown, lineNumber: number): void {
    const record = GuardUtil.asRecord(value);
    if (!record) {
      return;
    }
    const occurredAt = GuardUtil.asString(record.created_at);
    const parsedAtMs = occurredAt === undefined ? Number.NaN : Date.parse(occurredAt);
    const occurredAtMs = Number.isNaN(parsedAtMs) ? undefined : parsedAtMs;
    const lineType = GuardUtil.asString(record.type);
    const line: AntigravityTranscriptLine = {
      record,
      lineNumber,
      occurredAtMs,
      occurredAt,
      thread: context.currentThread,
      type: lineType,
    };
    if (occurredAtMs !== undefined && lineType !== undefined && TIMED_RECORD_TYPES.has(lineType)) {
      const eventsAtMs = context.threadIdToEventsAtMs.get(line.thread.id) ?? [];
      eventsAtMs.push(occurredAtMs);
      context.threadIdToEventsAtMs.set(line.thread.id, eventsAtMs);
    }
    const handler = lineType ? this.recordTypeToHandler.get(lineType) : undefined;
    if (handler) {
      handler(context, line);
      return;
    }
    if (!IGNORED_RECORD_TYPES.has(lineType ?? "")) {
      UnknownLineUtil.record(context.facts, record, lineType);
    }
  }

  private makeEvidence(
    context: AntigravityParseContext,
    line: AntigravityTranscriptLine,
    text?: string,
  ): EvidenceRef {
    const excerpt = text ? RedactUtil.excerpt(text) : undefined;
    return {
      sessionId: context.facts.sessionId,
      file: context.currentFile,
      line: line.lineNumber,
      occurredAt: line.occurredAt,
      thread: line.thread.agentType,
      excerpt,
    };
  }

  private handleUserInput(context: AntigravityParseContext, line: AntigravityTranscriptLine): void {
    const rawContent = GuardUtil.asString(line.record.content);
    if (!rawContent) {
      return;
    }
    const threadId = line.thread.id;
    if (!context.threadIdToFirstPromptHash.has(threadId)) {
      context.threadIdToFirstPromptHash.set(threadId, HashUtil.sha(rawContent));
    }
    const redactedContent = RedactUtil.redact(rawContent);
    const text = redactedContent.slice(0, MAX_PROMPT_CHARS);
    context.facts.prompts.push({
      text,
      ref: this.makeEvidence(context, line, redactedContent),
      sentAtMs: line.occurredAtMs,
      isCorrection: NormalizeUtil.isCorrection(rawContent),
      isInterruption: false,
    });
  }

  private describeTool(name: string, args: UnknownRecord): AntigravityToolDescription {
    const describer = NAME_TO_DESCRIBER.get(name);
    if (describer) {
      return describer(args);
    }
    return {
      key: name,
      category: "other",
      summary: name,
    };
  }

  private handlePlannerResponse(context: AntigravityParseContext, line: AntigravityTranscriptLine): void {
    const input = GuardUtil.asNumber(line.record.input_tokens) ?? 0;
    const output = GuardUtil.asNumber(line.record.output_tokens) ?? 0;
    const cacheRead = GuardUtil.asNumber(line.record.cache_read_tokens) ?? 0;
    const message: AssistantMessage = {
      id: `${line.thread.id}:${line.lineNumber}`,
      usage: { input, output, cacheRead, cacheWrite: 0 },
      thread: line.thread,
      sentAtMs: line.occurredAtMs,
      ref: this.makeEvidence(context, line),
    };
    context.facts.messages.push(message);
    const rawCalls = GuardUtil.asArray(line.record.tool_calls);
    for (const [index, item] of rawCalls.entries()) {
      const callRecord = GuardUtil.asRecord(item);
      if (!callRecord) {
        continue;
      }
      const rawName = GuardUtil.asString(callRecord.name) ?? "unknown";
      const args = GuardUtil.asRecord(callRecord.args) ?? {};
      const description = this.describeTool(rawName, args);
      const callId = `${line.thread.id}:${line.lineNumber}:${index}`;
      const name = RedactUtil.excerpt(rawName, MAX_NAME_CHARS);
      const key = RedactUtil.redact(description.key);
      const summary = RedactUtil.excerpt(description.summary);
      const filePath = description.filePath ? RedactUtil.redact(description.filePath) : undefined;
      const toolCall: ToolCall = {
        id: callId,
        name: name,
        key: key,
        summary: summary,
        category: description.category,
        filePath: filePath,
        thread: line.thread,
        ref: this.makeEvidence(context, line, description.summary),
        calledAtMs: line.occurredAtMs,
        messageId: message.id,
        subagentType: description.subagentType,
        subagentPromptHash: description.subagentPromptHash,
      };
      context.facts.tools.push(toolCall);
    }
  }

  private handleErrorMessage(context: AntigravityParseContext, line: AntigravityTranscriptLine): void {
    const errorText = GuardUtil.asString(line.record.error) ?? GuardUtil.asString(line.record.content) ?? "unknown error";
    context.facts.apiErrors.push({
      code: RedactUtil.excerpt(errorText),
      thread: line.thread,
      ref: this.makeEvidence(context, line, errorText),
      occurredAtMs: line.occurredAtMs,
    });
  }

  private handleGeneric(context: AntigravityParseContext, line: AntigravityTranscriptLine): void {
    const status = GuardUtil.asString(line.record.status);
    const hasError = status === "ERROR" || line.record.error !== undefined;
    if (hasError) {
      // Why: GENERIC errors reflect step/tool execution failures rather than API errors. Because Antigravity transcripts lack call IDs correlating results to specific tool calls, recording as an unknown line shape avoids inventing unverified tool results or misclassifying tool failures as API errors.
      UnknownLineUtil.record(context.facts, line.record, line.type);
    }
  }
}
