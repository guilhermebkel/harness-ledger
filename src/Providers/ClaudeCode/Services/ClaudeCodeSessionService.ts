// Reads Claude Code transcripts: JSONL at <home>/projects/<project>/<session>.jsonl, with subagent
// transcripts at <session>/subagents/agent-<id>.jsonl. The format is internal and changes between
// versions, so every field is read through GuardUtil: unknown lines are counted, never fatal.

import { readdir, readFile, stat } from "node:fs/promises";
import { basename, isAbsolute, join, relative } from "node:path";
import type {
  DiscoverOptions,
  ParseOptions,
  TranscriptFile,
  TranscriptFileStat,
} from "@/Shared/Protocols/ProviderProtocol.js";
import type {
  SessionFacts,
  ThreadFacts,
  ThreadRef,
  TokenUsage,
  ToolCall,
  ToolCategory,
  ToolResultKind,
} from "@/Shared/Protocols/SessionProtocol.js";
import type { UnknownRecord } from "@/Shared/Protocols/UtilProtocol.js";
import { GuardUtil } from "@/Shared/Utils/GuardUtil.js";
import { HashUtil } from "@/Shared/Utils/HashUtil.js";
import { JsonlUtil } from "@/Shared/Utils/JsonlUtil.js";
import { NormalizeUtil } from "@/Shared/Utils/NormalizeUtil.js";
import { PathUtil } from "@/Shared/Utils/PathUtil.js";
import { RedactUtil } from "@/Shared/Utils/RedactUtil.js";
import { SessionUtil } from "@/Shared/Utils/SessionUtil.js";
import { TimeUtil } from "@/Shared/Utils/TimeUtil.js";
import type {
  ClaudeCodeParseContext,
  ClaudeCodeToolCallContext,
  ClaudeCodeToolDescription,
  ClaudeCodeTranscriptLine,
  EvidenceFactory,
} from "@/Providers/ClaudeCode/Protocols/ClaudeCodeProtocol.js";
import { ClaudeCodePathUtil } from "@/Providers/ClaudeCode/Utils/ClaudeCodePathUtil.js";
import { ClaudeCodeTranscriptUtil } from "@/Providers/ClaudeCode/Utils/ClaudeCodeTranscriptUtil.js";

const TRANSCRIPT_EXTENSION = ".jsonl";
const UNKNOWN_SUBAGENT_TYPE = "subagent";
const DEFAULT_SUBAGENT_TYPE = "general-purpose";
const MAX_PROMPT_CHARS = 2000;
const MAX_SUMMARY_CHARS = 160;
/** `attributionAgent` is written on every subagent line by recent versions. */
const SUBAGENT_TYPE_KEYS = ["agentType", "agent_type", "subagentType", "subagent_type", "attributionAgent"];
const TIMED_LINE_TYPES = new Set(["user", "assistant", "attachment", "system"]);
const READ_TOOLS = new Set(["Read", "NotebookRead"]);
const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const SEARCH_TOOLS = new Set(["Grep", "Glob", "WebSearch", "WebFetch", "ToolSearch"]);
const DELEGATION_TOOLS = new Set(["Task", "Agent"]);
const PLAN_TOOLS = new Set(["ExitPlanMode", "EnterPlanMode"]);
const HUMAN_ORIGIN = "human";
/** Claude Code writes API errors and "no response" notices as assistant messages from this pseudo-model. */
const SYNTHETIC_MODEL = "<synthetic>";
/** Model named in an API-error message, e.g. "There's an issue with the selected model (x)". */
const MODEL_IN_ERROR = /\bmodel \(([^)\s]{1,80})\)/i;
const UNKNOWN_API_ERROR = "unknown";
const TOKENS_PER_THOUSAND = 1000;
const VALID_TOOL_NAME = /^[\w.:-]{1,100}$/;
const MALFORMED_TOOL_NAME = "(malformed tool name)";

export class ClaudeCodeSessionService {
  constructor(private readonly homeDir: string) {}

  async discoverTranscripts(options: DiscoverOptions): Promise<TranscriptFile[]> {
    const projectsDir = join(this.homeDir, "projects");
    const projectFolders = await readdir(projectsDir).catch(() => [] as string[]);
    const encodedProject = ClaudeCodePathUtil.encodeProjectDir(options.projectDir);
    const isCandidateFolder = (folder: string): boolean =>
      folder === encodedProject || folder.startsWith(`${encodedProject}-`);
    const selectedFolders = options.shouldReadAllProjects ? projectFolders : projectFolders.filter(isCandidateFolder);

    const transcripts: TranscriptFile[] = [];
    for (const folder of selectedFolders) {
      const folderPath = join(projectsDir, folder);
      const entries = await readdir(folderPath).catch(() => [] as string[]);
      for (const entry of entries.filter((name) => name.endsWith(TRANSCRIPT_EXTENSION))) {
        const fileStat = await this.statFile(join(folderPath, entry));
        if (!fileStat) {
          continue;
        }
        const sessionId = entry.slice(0, -TRANSCRIPT_EXTENSION.length);
        const subagentFolder = join(folderPath, sessionId, "subagents");
        const subagentFiles = await this.listSubagentFiles(subagentFolder);
        transcripts.push({
          ...fileStat,
          sessionId,
          subagentFiles,
          isExactProject: folder === encodedProject,
        });
      }
    }
    return transcripts.sort((left, right) => left.modifiedAtMs - right.modifiedAtMs);
  }

  async parseSession(transcript: TranscriptFile, options: ParseOptions): Promise<SessionFacts> {
    const facts: SessionFacts = {
      provider: "claude-code",
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
        isCostPartial: false,
        turns: [],
      },
      files: [transcript.file, ...transcript.subagentFiles.map((subagentFile) => subagentFile.file)],
      unparsedLines: 0,
    };
    const context: ClaudeCodeParseContext = {
      facts,
      currentFile: transcript.file,
      currentThread: SessionUtil.mainThread(),
      projectDir: options.projectDir,
      toolUseIdToPendingCall: new Map(),
      threadIdToEventsAtMs: new Map(),
      messageIdToMessage: new Map(),
      delegationCallIdToAgentId: new Map(),
      threadIdToFirstPromptHash: new Map(),
      threadIdToDeclaredType: new Map(),
      threadIdToLastModel: new Map(),
      runStartToCostUsd: new Map(),
    };
    await this.readTranscript(context, transcript.file, true);

    for (const subagentFile of transcript.subagentFiles) {
      const agentId = basename(subagentFile.file, TRANSCRIPT_EXTENSION).replace(/^agent-/, "");
      const metaType = await this.readSubagentMetaType(subagentFile.file);
      context.currentFile = subagentFile.file;
      context.currentThread = {
        id: agentId,
        agentType: metaType ?? UNKNOWN_SUBAGENT_TYPE,
      };
      await this.readTranscript(context, subagentFile.file, false);
      const resolvedType = metaType
        ?? context.threadIdToDeclaredType.get(agentId)
        ?? this.typeFromDelegation(context, agentId);
      if (resolvedType) {
        this.relabelThread(facts, agentId, resolvedType);
      }
    }

    // Older versions wrote subagent turns inline in the main file; the delegation result names their id.
    for (const call of facts.tools) {
      const agentId = context.delegationCallIdToAgentId.get(call.id);
      if (agentId && call.subagentType) {
        this.relabelThread(facts, agentId, call.subagentType);
      }
    }

    facts.messages = [...context.messageIdToMessage.values()];
    facts.environment.platform ??= this.platformFromPath(facts.projectDir);
    this.summarizeThreads(context, options.idleMs);
    return facts;
  }

  private async listSubagentFiles(subagentsDir: string): Promise<TranscriptFileStat[]> {
    const entries = await readdir(subagentsDir).catch(() => [] as string[]);
    const stats = await Promise.all(
      entries
        .filter((name) => name.endsWith(TRANSCRIPT_EXTENSION))
        .map(async (name) => this.statFile(join(subagentsDir, name))),
    );
    return stats.filter((fileStat): fileStat is TranscriptFileStat => fileStat !== undefined);
  }

  private async statFile(file: string): Promise<TranscriptFileStat | undefined> {
    const fileStat = await stat(file).catch(() => undefined);
    if (!fileStat?.isFile()) {
      return undefined;
    }
    return {
      file,
      modifiedAtMs: fileStat.mtimeMs,
      bytes: fileStat.size,
    };
  }

  private async readTranscript(context: ClaudeCodeParseContext, file: string, isMainFile: boolean): Promise<void> {
    await JsonlUtil.read(file, {
      onRecord: (record, lineNumber) => {
        this.handleRecord(context, record, lineNumber, isMainFile);
      },
      onBadLine: () => {
        context.facts.unparsedLines++;
      },
    });
  }

  /** A subagent's type, found through the delegation whose result named it or whose prompt it received. */
  private typeFromDelegation(context: ClaudeCodeParseContext, agentId: string): string | undefined {
    const delegations = context.facts.tools.filter((call) => call.subagentType !== undefined);
    const firstPromptHash = context.threadIdToFirstPromptHash.get(agentId);
    const byResult = delegations.find((call) => context.delegationCallIdToAgentId.get(call.id) === agentId);
    const byPrompt = delegations.find(
      (call) => call.subagentPromptHash !== undefined && call.subagentPromptHash === firstPromptHash,
    );
    return byResult?.subagentType ?? byPrompt?.subagentType;
  }

  private summarizeThreads(context: ClaudeCodeParseContext, idleMs: number): void {
    const facts = context.facts;
    for (const [threadId, eventsAtMs] of context.threadIdToEventsAtMs) {
      eventsAtMs.sort((left, right) => left - right);
      const isMain = threadId === SessionUtil.MAIN_THREAD_ID;
      const threadFacts: ThreadFacts = {
        thread: isMain
          ? SessionUtil.mainThread()
          : {
              id: threadId,
              agentType: this.knownTypeOfThread(facts, threadId),
            },
        activeMs: TimeUtil.activeTime(eventsAtMs, idleMs),
        firstEventAtMs: eventsAtMs[0],
        lastEventAtMs: eventsAtMs.at(-1),
        promptHash: context.threadIdToFirstPromptHash.get(threadId),
      };
      facts.threads.push(threadFacts);
      if (isMain) {
        facts.activeMs = threadFacts.activeMs;
        facts.startedAtMs = threadFacts.firstEventAtMs;
        facts.endedAtMs = threadFacts.lastEventAtMs;
      }
    }
    if (facts.startedAtMs === undefined) {
      const allEventsAtMs = [...context.threadIdToEventsAtMs.values()].flat().sort((left, right) => left - right);
      facts.startedAtMs = allEventsAtMs[0];
      facts.endedAtMs = allEventsAtMs.at(-1);
    }
  }

  private knownTypeOfThread(facts: SessionFacts, threadId: string): string {
    return facts.tools.find((call) => call.thread.id === threadId)?.thread.agentType
      ?? facts.messages.find((message) => message.thread.id === threadId)?.thread.agentType
      ?? UNKNOWN_SUBAGENT_TYPE;
  }

  private relabelThread(facts: SessionFacts, threadId: string, agentType: string): void {
    for (const call of facts.tools.filter((toolCall) => toolCall.thread.id === threadId)) {
      call.thread.agentType = agentType;
      call.ref.thread = agentType;
      if (call.result) {
        call.result.ref.thread = agentType;
      }
    }
    for (const message of facts.messages.filter((assistantMessage) => assistantMessage.thread.id === threadId)) {
      message.thread.agentType = agentType;
    }
  }

  private async readSubagentMetaType(subagentFile: string): Promise<string | undefined> {
    const metaFile = subagentFile.replace(/\.jsonl$/, ".meta.json");
    const metaText = await readFile(metaFile, "utf8").catch(() => undefined);
    if (metaText === undefined) {
      return undefined;
    }
    const meta = GuardUtil.asRecord(GuardUtil.parseJson(metaText));
    return GuardUtil.firstString(meta, SUBAGENT_TYPE_KEYS);
  }

  private handleRecord(context: ClaudeCodeParseContext, value: unknown, lineNumber: number, isMainFile: boolean): void {
    const record = GuardUtil.asRecord(value);
    if (!record) {
      return;
    }
    const facts = context.facts;
    if (isMainFile) {
      facts.projectDir ??= GuardUtil.asString(record.cwd);
      const gitBranch = GuardUtil.asString(record.gitBranch);
      if (!facts.gitBranch && gitBranch && gitBranch !== "HEAD") {
        facts.gitBranch = gitBranch;
      }
    }
    const occurredAt = GuardUtil.asString(record.timestamp);
    const parsedAtMs = occurredAt === undefined ? Number.NaN : Date.parse(occurredAt);
    const line: ClaudeCodeTranscriptLine = {
      record,
      lineNumber,
      thread: this.threadOfLine(context, record, isMainFile),
      occurredAt,
      occurredAtMs: Number.isNaN(parsedAtMs) ? undefined : parsedAtMs,
    };
    const lineType = GuardUtil.asString(record.type);
    if (line.occurredAtMs !== undefined && lineType !== undefined && TIMED_LINE_TYPES.has(lineType)) {
      const eventsAtMs = context.threadIdToEventsAtMs.get(line.thread.id) ?? [];
      eventsAtMs.push(line.occurredAtMs);
      context.threadIdToEventsAtMs.set(line.thread.id, eventsAtMs);
    }
    if (lineType === "attachment") {
      this.handleAttachment(context, line);
      return;
    }
    if (lineType === "cost-state") {
      this.handleCostState(context, line);
      return;
    }
    if (lineType === "system") {
      this.handleSystemLine(context, line, isMainFile);
      return;
    }
    const message = GuardUtil.asRecord(record.message);
    if (!message) {
      return;
    }
    if (lineType === "assistant") {
      this.handleAssistantLine(context, line, message);
    } else if (lineType === "user") {
      this.handleUserLine(context, line, message);
    }
  }

  private threadOfLine(context: ClaudeCodeParseContext, record: UnknownRecord, isMainFile: boolean): ThreadRef {
    let thread = context.currentThread;
    const isInlineSidechain = isMainFile && record.isSidechain === true;
    if (isInlineSidechain) {
      const sidechainId = GuardUtil.asString(record.agentId) ?? "sidechain";
      thread = {
        id: sidechainId,
        agentType: context.threadIdToDeclaredType.get(sidechainId) ?? UNKNOWN_SUBAGENT_TYPE,
      };
    }
    const declaredType = GuardUtil.firstString(record, SUBAGENT_TYPE_KEYS);
    if (declaredType && !SessionUtil.isMainThread(thread)) {
      context.threadIdToDeclaredType.set(thread.id, declaredType);
      thread.agentType = declaredType;
    }
    return thread;
  }

  private evidenceFactory(context: ClaudeCodeParseContext, line: ClaudeCodeTranscriptLine): EvidenceFactory {
    return (text?: string) => ({
      sessionId: context.facts.sessionId,
      file: context.currentFile,
      line: line.lineNumber,
      occurredAt: line.occurredAt,
      thread: line.thread.agentType,
      excerpt: text ? RedactUtil.excerpt(text) : undefined,
    });
  }

  private handleAssistantLine(
    context: ClaudeCodeParseContext,
    line: ClaudeCodeTranscriptLine,
    message: UnknownRecord,
  ): void {
    const messageId = GuardUtil.asString(message.id) ?? `${context.currentFile}:${line.lineNumber}`;
    const usage = this.readUsage(GuardUtil.asRecord(message.usage));
    const toEvidence = this.evidenceFactory(context, line);
    const model = this.readModel(message);
    const skillInUse = GuardUtil.asString(line.record.attributionSkill);
    if (model) {
      context.threadIdToLastModel.set(line.thread.id, model);
    }
    if (line.record.isApiErrorMessage === true) {
      this.handleApiError(context, line, message);
    }
    const existing = context.messageIdToMessage.get(messageId);
    if (existing) {
      // Claude Code writes one line per content block and repeats the message's usage on each one.
      existing.usage = this.maxUsage(existing.usage, usage);
    } else {
      context.messageIdToMessage.set(messageId, {
        id: messageId,
        model,
        usage,
        thread: line.thread,
        sentAtMs: line.occurredAtMs,
        ref: toEvidence(),
        skillInUse,
      });
    }
    for (const block of GuardUtil.asArray(message.content).map((item) => GuardUtil.asRecord(item))) {
      const toolUseId = GuardUtil.asString(block?.id);
      if (block?.type !== "tool_use" || !toolUseId) {
        continue;
      }
      const call = this.buildToolCall(block, toolUseId, {
        thread: line.thread,
        toEvidence,
        calledAtMs: line.occurredAtMs,
        messageId,
        projectDir: context.projectDir,
        skillInUse,
      });
      context.toolUseIdToPendingCall.set(toolUseId, call);
      context.facts.tools.push(call);
    }
  }

  private readUsage(usage: UnknownRecord | undefined): TokenUsage {
    return {
      input: GuardUtil.asNumber(usage?.input_tokens) ?? 0,
      output: GuardUtil.asNumber(usage?.output_tokens) ?? 0,
      cacheRead: GuardUtil.asNumber(usage?.cache_read_input_tokens) ?? 0,
      cacheWrite: GuardUtil.asNumber(usage?.cache_creation_input_tokens) ?? 0,
    };
  }

  private maxUsage(left: TokenUsage, right: TokenUsage): TokenUsage {
    return {
      input: Math.max(left.input, right.input),
      output: Math.max(left.output, right.output),
      cacheRead: Math.max(left.cacheRead, right.cacheRead),
      cacheWrite: Math.max(left.cacheWrite, right.cacheWrite),
    };
  }

  private handleUserLine(
    context: ClaudeCodeParseContext,
    line: ClaudeCodeTranscriptLine,
    message: UnknownRecord,
  ): void {
    const content = message.content;
    if (typeof content === "string") {
      this.handlePrompt(context, line, content);
      return;
    }
    const textParts: string[] = [];
    for (const block of GuardUtil.asArray(content).map((item) => GuardUtil.asRecord(item))) {
      if (block?.type === "tool_result") {
        this.handleToolResult(context, line, block);
        continue;
      }
      const text = GuardUtil.asString(block?.text);
      if (block?.type === "text" && text !== undefined) {
        textParts.push(text);
      }
    }
    if (textParts.length) {
      this.handlePrompt(context, line, textParts.join("\n"));
    }
  }

  private handleApiError(
    context: ClaudeCodeParseContext,
    line: ClaudeCodeTranscriptLine,
    message: UnknownRecord,
  ): void {
    const status = GuardUtil.asNumber(line.record.apiErrorStatus);
    const recordedCode = GuardUtil.asString(line.record.error);
    const hasUsefulCode = recordedCode !== undefined && recordedCode !== UNKNOWN_API_ERROR;
    const statusCode = status === undefined ? UNKNOWN_API_ERROR : `http_${status}`;
    const text = this.messageText(message);
    context.facts.apiErrors.push({
      status,
      code: hasUsefulCode ? recordedCode : statusCode,
      model: MODEL_IN_ERROR.exec(text)?.[1] ?? context.threadIdToLastModel.get(line.thread.id),
      thread: line.thread,
      ref: this.evidenceFactory(context, line)(text),
      occurredAtMs: line.occurredAtMs,
    });
  }

  /** Older transcripts have no environment record; the working directory's shape still tells the platform. */
  private platformFromPath(projectDir: string | undefined): string | undefined {
    if (projectDir === undefined) {
      return undefined;
    }
    if (/^[A-Za-z]:[\\/]/.test(projectDir)) {
      return "win32";
    }
    if (projectDir.startsWith("/Users/")) {
      return "darwin";
    }
    return projectDir.startsWith("/home/") ? "linux" : undefined;
  }

  /** Claude Code records the platform and shell in an `environment` attachment; the first one wins. */
  private readEnvironment(context: ClaudeCodeParseContext, snapshot: UnknownRecord | undefined): void {
    const environment = context.facts.environment;
    environment.platform ??= GuardUtil.asString(snapshot?.platform);
    environment.shell ??= GuardUtil.asString(snapshot?.shell);
  }

  /** Claude Code's own running cost; the last line of each run holds that run's total. */
  private handleCostState(context: ClaudeCodeParseContext, line: ClaudeCodeTranscriptLine): void {
    const costUsd = GuardUtil.asNumber(line.record.totalCostUSD);
    if (costUsd === undefined) {
      return;
    }
    const runStart = String(GuardUtil.asNumber(line.record.startTime) ?? "");
    context.runStartToCostUsd.set(runStart, costUsd);
    const reported = context.facts.reported;
    reported.costUsd = [...context.runStartToCostUsd.values()].reduce((total, runCost) => total + runCost, 0);
    reported.isCostPartial ||= line.record.hasUnknownModelCost === true;
  }

  private handleSystemLine(
    context: ClaudeCodeParseContext,
    line: ClaudeCodeTranscriptLine,
    isMainFile: boolean,
  ): void {
    const durationMs = GuardUtil.asNumber(line.record.durationMs);
    const isMainTurn = isMainFile && line.record.isSidechain !== true;
    if (line.record.subtype === "compact_boundary") {
      this.handleCompaction(context, line);
      return;
    }
    if (line.record.subtype === "turn_duration" && isMainTurn && durationMs !== undefined) {
      context.facts.reported.turns.push({
        durationMs,
        endedAtMs: line.occurredAtMs,
      });
    }
  }

  private handleCompaction(context: ClaudeCodeParseContext, line: ClaudeCodeTranscriptLine): void {
    const metadata = GuardUtil.asRecord(line.record.compactMetadata);
    const trigger = metadata?.trigger === "manual" ? "manual" : "auto";
    const contextTokens = GuardUtil.asNumber(metadata?.preTokens);
    const tokensText = contextTokens === undefined ? "" : ` at ~${Math.round(contextTokens / TOKENS_PER_THOUSAND)}k tokens`;
    context.facts.compactions.push({
      trigger,
      contextTokens,
      thread: line.thread,
      ref: this.evidenceFactory(context, line)(`${trigger} compaction${tokensText}`),
      occurredAtMs: line.occurredAtMs,
    });
  }

  private messageText(message: UnknownRecord): string {
    if (typeof message.content === "string") {
      return message.content;
    }
    return GuardUtil.asArray(message.content)
      .map((item) => GuardUtil.asString(GuardUtil.asRecord(item)?.text) ?? "")
      .join("\n");
  }

  /**
   * A prompt the person typed while the agent was busy is written as a `queued_command` attachment,
   * never as a user line. Other queued commands (finished background tasks, messages from other
   * sessions) are not the person's words.
   */
  private handleAttachment(context: ClaudeCodeParseContext, line: ClaudeCodeTranscriptLine): void {
    const attachment = GuardUtil.asRecord(line.record.attachment);
    if (attachment?.type === "environment") {
      this.readEnvironment(context, GuardUtil.asRecord(attachment.snapshot));
      return;
    }
    const prompt = GuardUtil.asString(attachment?.prompt);
    const originKind = GuardUtil.asString(GuardUtil.asRecord(attachment?.origin)?.kind) ?? HUMAN_ORIGIN;
    const isQueuedHumanPrompt = attachment?.type === "queued_command"
      && attachment.commandMode === "prompt"
      && attachment.isMeta !== true
      && originKind === HUMAN_ORIGIN;
    if (isQueuedHumanPrompt && prompt !== undefined) {
      this.handlePrompt(context, line, prompt);
    }
  }

  private handlePrompt(context: ClaudeCodeParseContext, line: ClaudeCodeTranscriptLine, rawText: string): void {
    const threadId = line.thread.id;
    if (!context.threadIdToFirstPromptHash.has(threadId)) {
      const promptHash = HashUtil.sha(rawText.trim());
      context.threadIdToFirstPromptHash.set(threadId, promptHash);
    }
    // Recent versions say where a user line came from; background-task notifications are not the person.
    const originKind = GuardUtil.asString(GuardUtil.asRecord(line.record.origin)?.kind);
    const isHarnessGenerated = line.record.isMeta === true
      || line.record.isCompactSummary === true
      || line.record.isVisibleInTranscriptOnly === true
      || (originKind !== undefined && originKind !== HUMAN_ORIGIN);
    // A subagent's "user" turn is the delegation prompt, not something the person typed.
    if (isHarnessGenerated || !SessionUtil.isMainThread(line.thread)) {
      return;
    }
    const { text, command } = ClaudeCodeTranscriptUtil.cleanPrompt(rawText);
    const isEmpty = !text && !command;
    if (isEmpty || ClaudeCodeTranscriptUtil.isCompactionCaveat(text)) {
      return;
    }
    const isInterruption = ClaudeCodeTranscriptUtil.isInterruption(text);
    const hasEarlierPrompt = context.facts.prompts.length > 0;
    context.facts.prompts.push({
      text: RedactUtil.redact(text).slice(0, MAX_PROMPT_CHARS),
      ref: this.evidenceFactory(context, line)(text || `/${command ?? ""}`),
      sentAtMs: line.occurredAtMs,
      command,
      isInterruption,
      isCorrection: !isInterruption && hasEarlierPrompt && NormalizeUtil.isCorrection(text),
    });
  }

  private handleToolResult(
    context: ClaudeCodeParseContext,
    line: ClaudeCodeTranscriptLine,
    block: UnknownRecord,
  ): void {
    const toolUseId = GuardUtil.asString(block.tool_use_id);
    const call = toolUseId === undefined ? undefined : context.toolUseIdToPendingCall.get(toolUseId);
    if (!call || toolUseId === undefined) {
      return;
    }
    context.toolUseIdToPendingCall.delete(toolUseId);
    const toolUseResult = GuardUtil.asRecord(line.record.toolUseResult);
    const reportedAgentId = GuardUtil.asString(toolUseResult?.agentId);
    if (reportedAgentId) {
      context.delegationCallIdToAgentId.set(call.id, reportedAgentId);
    }
    const text = this.resultText(block.content);
    const wasInterrupted = toolUseResult?.interrupted === true;
    const kind = ClaudeCodeTranscriptUtil.classifyResult(text, {
      isMarkedError: block.is_error === true,
      wasInterrupted,
      denialKind: GuardUtil.asString(line.record.toolDenialKind),
    });
    const isError = kind !== "ok";
    const toEvidence = this.evidenceFactory(context, line);
    call.result = {
      isError,
      kind,
      errorHead: isError ? NormalizeUtil.errorKey(ClaudeCodeTranscriptUtil.errorText(text)) : undefined,
      contentChars: text.length,
      ref: {
        ...toEvidence(this.resultExcerptText(text, kind)),
        thread: call.thread.agentType,
      },
      returnedAtMs: line.occurredAtMs,
    };
  }

  /** What the person wrote when they rejected a call, without Claude Code's fixed wording around it. */
  private resultExcerptText(text: string, kind: ToolResultKind): string | undefined {
    if (kind === "ok") {
      return undefined;
    }
    if (kind === "user_rejected") {
      return ClaudeCodeTranscriptUtil.rejectionFeedback(text) ?? "rejected without feedback";
    }
    return text;
  }

  private readModel(message: UnknownRecord): string | undefined {
    const model = GuardUtil.asString(message.model);
    return model === SYNTHETIC_MODEL ? undefined : model;
  }

  private resultText(content: unknown): string {
    if (typeof content === "string") {
      return content;
    }
    return GuardUtil.asArray(content)
      .map((item) => GuardUtil.asRecord(item))
      .map((block) => {
        if (block?.type === "image") {
          return "[image]";
        }
        return block?.type === "text" ? (GuardUtil.asString(block.text) ?? "") : "";
      })
      .join("\n");
  }

  private buildToolCall(block: UnknownRecord, toolUseId: string, callContext: ClaudeCodeToolCallContext): ToolCall {
    // Some models behind proxies leak text into the tool name; never carry that text into keys or reports.
    const rawName = GuardUtil.asString(block.name) ?? "unknown";
    const name = VALID_TOOL_NAME.test(rawName) ? rawName : MALFORMED_TOOL_NAME;
    const input = GuardUtil.asRecord(block.input) ?? {};
    const description = this.describeToolCall(name, input, callContext.projectDir);
    return {
      ...description,
      id: toolUseId,
      name,
      summary: RedactUtil.excerpt(description.summary, MAX_SUMMARY_CHARS),
      thread: callContext.thread,
      ref: callContext.toEvidence(description.summary),
      calledAtMs: callContext.calledAtMs,
      messageId: callContext.messageId,
      skillInUse: callContext.skillInUse,
    };
  }

  private describeToolCall(name: string, input: UnknownRecord, projectDir?: string): ClaudeCodeToolDescription {
    const command = GuardUtil.asString(input.command);
    if (name === "Bash" && command !== undefined) {
      return {
        key: NormalizeUtil.commandKey(command),
        category: "shell",
        summary: command,
      };
    }
    const filePath = GuardUtil.firstString(input, ["file_path", "notebook_path", "path"]);
    const isReadTool = READ_TOOLS.has(name);
    if ((isReadTool || EDIT_TOOLS.has(name)) && filePath !== undefined) {
      const projectRelativePath = this.toProjectRelative(filePath, projectDir);
      return {
        key: name,
        category: isReadTool ? "read" : "edit",
        summary: `${name} ${projectRelativePath}`,
        filePath: projectRelativePath,
      };
    }
    const delegatedType = GuardUtil.asString(input.subagent_type);
    const delegatedPrompt = GuardUtil.asString(input.prompt);
    const isDelegation = DELEGATION_TOOLS.has(name) && (delegatedType !== undefined || delegatedPrompt !== undefined);
    if (isDelegation) {
      const subagentType = delegatedType ?? DEFAULT_SUBAGENT_TYPE;
      return {
        key: `${name}:${subagentType}`,
        category: "delegation",
        summary: `${subagentType}: ${GuardUtil.asString(input.description) ?? ""}`,
        subagentType,
        subagentPromptHash: delegatedPrompt === undefined ? undefined : HashUtil.sha(delegatedPrompt.trim()),
      };
    }
    if (name === "Skill") {
      const skill = (GuardUtil.firstString(input, ["skill", "command", "name"]) ?? "unknown").replace(/^\//, "");
      return {
        key: `Skill:${skill}`,
        category: "skill",
        summary: `skill ${skill}`,
        skill,
      };
    }
    if (name.startsWith("mcp__")) {
      const [, server = "unknown", tool = ""] = name.split("__");
      return {
        key: `mcp:${server}`,
        category: "mcp",
        summary: `${server} ${tool}`,
      };
    }
    const detail = GuardUtil.firstString(input, ["pattern", "url", "query"]);
    return {
      key: name,
      category: this.categoryOf(name),
      summary: detail === undefined ? name : `${name} ${detail}`,
    };
  }

  private categoryOf(name: string): ToolCategory {
    if (SEARCH_TOOLS.has(name)) {
      return "search";
    }
    return PLAN_TOOLS.has(name) ? "plan" : "other";
  }

  private toProjectRelative(filePath: string, projectDir?: string): string {
    const isInsideProject = projectDir !== undefined
      && isAbsolute(filePath)
      && (filePath === projectDir || filePath.startsWith(`${projectDir}/`));
    // Outside the project, the home folder (and the user name in it) is replaced by "~".
    return isInsideProject ? relative(projectDir, filePath) || "." : PathUtil.tildify(filePath);
  }
}
