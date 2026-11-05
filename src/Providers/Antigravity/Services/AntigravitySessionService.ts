import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type {
  AntigravityParseContext,
  AntigravityTranscriptLine,
} from "@/Providers/Antigravity/Protocols/AntigravityProtocol.ts";
import { AntigravityPathUtil } from "@/Providers/Antigravity/Utils/AntigravityPathUtil.ts";
import type { DiscoverOptions, ParseOptions, TranscriptFile } from "@/Shared/Protocols/ProviderProtocol.ts";
import type { AssistantMessage, EvidenceRef, SessionFacts } from "@/Shared/Protocols/SessionProtocol.ts";
import { GuardUtil } from "@/Shared/Utils/GuardUtil.ts";
import { HashUtil } from "@/Shared/Utils/HashUtil.ts";
import { JsonlUtil } from "@/Shared/Utils/JsonlUtil.ts";
import { NormalizeUtil } from "@/Shared/Utils/NormalizeUtil.ts";
import { RedactUtil } from "@/Shared/Utils/RedactUtil.ts";
import { SessionUtil } from "@/Shared/Utils/SessionUtil.ts";
import { ThreadSummaryUtil } from "@/Shared/Utils/ThreadSummaryUtil.ts";
import { UnknownLineUtil } from "@/Shared/Utils/UnknownLineUtil.ts";

const TRANSCRIPT_FILE_NAME = "transcript.jsonl";
const LOGS_SUBDIR = join(".system_generated", "logs");
const MAX_PROMPT_CHARS = 2000;
const DEFAULT_IDLE_MINUTES = 5;
const MS_PER_MINUTE = 60_000;
const IDLE_MS = DEFAULT_IDLE_MINUTES * MS_PER_MINUTE;
const TIMED_RECORD_TYPES = new Set<string>([
  "USER_INPUT",
  "PLANNER_RESPONSE",
  "GENERIC",
  "SYSTEM_MESSAGE",
  "ERROR_MESSAGE",
  "CHECKPOINT",
]);
// Why: Antigravity writes these for context sync or checkpoints; none feeds a signal directly.
const IGNORED_RECORD_TYPES = new Set<string>(["GENERIC", "SYSTEM_MESSAGE", "CHECKPOINT"]);

type RecordHandler = (context: AntigravityParseContext, line: AntigravityTranscriptLine) => void;

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
      const isCandidate = options.shouldReadAllProjects
        ?? (workspace !== undefined && this.isInsideProject(workspace, options.projectDir));
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
    return transcripts.sort((left, right) => left.modifiedAtMs - right.modifiedAtMs);
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
    const parsed = GuardUtil.asRecord(JSON.parse(text));
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
    const text = RedactUtil.redact(rawContent.slice(0, MAX_PROMPT_CHARS));
    context.facts.prompts.push({
      text,
      ref: this.makeEvidence(context, line, rawContent),
      sentAtMs: line.occurredAtMs,
      isCorrection: NormalizeUtil.isCorrection(rawContent),
      isInterruption: false,
    });
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
}
