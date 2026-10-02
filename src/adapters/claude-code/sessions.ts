// Claude Code session reader.
// Transcripts are JSONL at ~/.claude/projects/<project>/<session>.jsonl, with subagent
// transcripts at <session>/subagents/agent-<id>.jsonl. The format is internal and changes
// between versions, so every field is read through the guards: unknown lines are counted,
// never fatal (docs/code-standards.md).

import { readdir, readFile, stat } from "node:fs/promises";
import { basename, isAbsolute, join, relative } from "node:path";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  firstString,
  parseJson,
  type UnknownRecord,
} from "../../core/guards.js";
import { readJsonLines } from "../../core/jsonl.js";
import {
  cleanPrompt,
  commandKey,
  errorKey,
  HOOK_BLOCKED,
  INTERRUPTED,
  isCorrection,
  PERMISSION_DENIED,
} from "../../core/normalize.js";
import { excerpt, redact } from "../../core/redact.js";
import { activeTime } from "../../core/time.js";
import {
  MAIN_THREAD_ID,
  type AssistantMessage,
  type EvidenceRef,
  type SessionFacts,
  type ThreadFacts,
  type ThreadRef,
  type TokenUsage,
  type ToolCall,
  type ToolResultKind,
} from "../../core/types.js";
import { sha } from "../../core/util.js";
import { claudeHome, encodeProjectDir } from "./paths.js";

const TRANSCRIPT_EXTENSION = ".jsonl";
const UNKNOWN_SUBAGENT_TYPE = "subagent";
const DEFAULT_SUBAGENT_TYPE = "general-purpose";
const MAX_PROMPT_CHARS = 2000;
const MAX_SUMMARY_CHARS = 160;
/** Classification only looks at the start of a tool result; the rest is output. */
const RESULT_HEAD_CHARS = 600;
const SUBAGENT_TYPE_KEYS = ["agentType", "agent_type", "subagentType", "subagent_type"];
const TIMED_LINE_TYPES = new Set(["user", "assistant", "attachment", "system"]);
const FILE_TOOLS = new Set(["Read", "Edit", "Write", "MultiEdit", "NotebookEdit", "NotebookRead"]);
const DELEGATION_TOOLS = new Set(["Task", "Agent"]);

export interface TranscriptFileStat {
  file: string;
  modifiedAtMs: number;
  bytes: number;
}

export interface TranscriptFile extends TranscriptFileStat {
  sessionId: string;
  subagentFiles: TranscriptFileStat[];
  /** In this project's own folder, as opposed to a prefix match such as `my-app-2` or a subfolder. */
  isExactProject: boolean;
}

export interface DiscoverOptions {
  projectDir: string;
  shouldReadAllProjects?: boolean;
  claudeHomeDir?: string;
}

/** Lists transcript files for a project, or for all projects. Only stats files; nothing is parsed. */
export async function discoverTranscripts(options: DiscoverOptions): Promise<TranscriptFile[]> {
  const projectsDir = join(options.claudeHomeDir ?? claudeHome(), "projects");
  const projectFolders = await readdir(projectsDir).catch(() => [] as string[]);
  const encodedProject = encodeProjectDir(options.projectDir);
  const isCandidateFolder = (folder: string): boolean =>
    folder === encodedProject || folder.startsWith(`${encodedProject}-`);
  const selectedFolders = options.shouldReadAllProjects ? projectFolders : projectFolders.filter(isCandidateFolder);

  const transcripts: TranscriptFile[] = [];
  for (const folder of selectedFolders) {
    const folderPath = join(projectsDir, folder);
    const entries = await readdir(folderPath).catch(() => [] as string[]);
    for (const entry of entries.filter((name) => name.endsWith(TRANSCRIPT_EXTENSION))) {
      const fileStat = await statFile(join(folderPath, entry));
      if (!fileStat) {
        continue;
      }
      const sessionId = entry.slice(0, -TRANSCRIPT_EXTENSION.length);
      const subagentFiles = await listSubagentFiles(join(folderPath, sessionId, "subagents"));
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

async function listSubagentFiles(subagentsDir: string): Promise<TranscriptFileStat[]> {
  const entries = await readdir(subagentsDir).catch(() => [] as string[]);
  const stats = await Promise.all(
    entries
      .filter((name) => name.endsWith(TRANSCRIPT_EXTENSION))
      .map((name) => statFile(join(subagentsDir, name))),
  );
  return stats.filter((fileStat): fileStat is TranscriptFileStat => fileStat !== undefined);
}

async function statFile(file: string): Promise<TranscriptFileStat | undefined> {
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

export interface ParseOptions {
  /** Gaps longer than this are idle time and are not counted. */
  idleMs: number;
  projectDir?: string;
}

interface ParseContext {
  facts: SessionFacts;
  currentFile: string;
  currentThread: ThreadRef;
  projectDir?: string;
  toolUseIdToPendingCall: Map<string, ToolCall>;
  threadIdToEventsAtMs: Map<string, number[]>;
  messageIdToMessage: Map<string, AssistantMessage>;
  /** Delegation call id → the subagent id its result reported. */
  delegationCallIdToAgentId: Map<string, string>;
  threadIdToFirstPromptHash: Map<string, string>;
  /** Subagent types declared on transcript lines. */
  threadIdToDeclaredType: Map<string, string>;
}

/** What one transcript line says, with everything read through the guards. */
interface TranscriptLine {
  record: UnknownRecord;
  lineNumber: number;
  thread: ThreadRef;
  occurredAt?: string;
  occurredAtMs?: number;
  isInMainFile: boolean;
}

type EvidenceFactory = (text?: string) => EvidenceRef;

function mainThread(): ThreadRef {
  return {
    id: MAIN_THREAD_ID,
    agentType: MAIN_THREAD_ID,
  };
}

export async function parseSession(transcript: TranscriptFile, options: ParseOptions): Promise<SessionFacts> {
  const facts: SessionFacts = {
    agent: "claude-code",
    sessionId: transcript.sessionId,
    file: transcript.file,
    activeMs: 0,
    threads: [],
    prompts: [],
    tools: [],
    messages: [],
    files: [transcript.file, ...transcript.subagentFiles.map((subagentFile) => subagentFile.file)],
    unparsedLines: 0,
  };
  const context: ParseContext = {
    facts,
    currentFile: transcript.file,
    currentThread: mainThread(),
    projectDir: options.projectDir,
    toolUseIdToPendingCall: new Map(),
    threadIdToEventsAtMs: new Map(),
    messageIdToMessage: new Map(),
    delegationCallIdToAgentId: new Map(),
    threadIdToFirstPromptHash: new Map(),
    threadIdToDeclaredType: new Map(),
  };
  const countBadLine = (): void => {
    facts.unparsedLines++;
  };

  await readJsonLines(transcript.file, {
    onRecord: (record, lineNumber) => {
      handleRecord(context, record, lineNumber, true);
    },
    onBadLine: countBadLine,
  });

  for (const subagentFile of transcript.subagentFiles) {
    const agentId = basename(subagentFile.file, TRANSCRIPT_EXTENSION).replace(/^agent-/, "");
    const metaType = await readSubagentMetaType(subagentFile.file);
    context.currentFile = subagentFile.file;
    context.currentThread = {
      id: agentId,
      agentType: metaType ?? UNKNOWN_SUBAGENT_TYPE,
    };
    await readJsonLines(subagentFile.file, {
      onRecord: (record, lineNumber) => {
        handleRecord(context, record, lineNumber, false);
      },
      onBadLine: countBadLine,
    });
    const resolvedType = metaType
      ?? context.threadIdToDeclaredType.get(agentId)
      ?? typeFromDelegation(context, agentId);
    if (resolvedType) {
      relabelThread(facts, agentId, resolvedType);
    }
  }

  // Older versions wrote subagent turns inline in the main file; the delegation result names their id.
  for (const call of facts.tools) {
    const agentId = context.delegationCallIdToAgentId.get(call.id);
    if (agentId && call.subagentType) {
      relabelThread(facts, agentId, call.subagentType);
    }
  }

  facts.messages = [...context.messageIdToMessage.values()];
  summarizeThreads(context, options.idleMs);
  return facts;
}

/** A subagent's type, found through the delegation whose result named it or whose prompt it received. */
function typeFromDelegation(context: ParseContext, agentId: string): string | undefined {
  const delegations = context.facts.tools.filter((call) => call.subagentType !== undefined);
  const firstPromptHash = context.threadIdToFirstPromptHash.get(agentId);
  const byResult = delegations.find((call) => context.delegationCallIdToAgentId.get(call.id) === agentId);
  const byPrompt = delegations.find(
    (call) => call.subagentPromptHash !== undefined && call.subagentPromptHash === firstPromptHash,
  );
  return byResult?.subagentType ?? byPrompt?.subagentType;
}

function summarizeThreads(context: ParseContext, idleMs: number): void {
  const facts = context.facts;
  for (const [threadId, eventsAtMs] of context.threadIdToEventsAtMs) {
    eventsAtMs.sort((left, right) => left - right);
    const isMain = threadId === MAIN_THREAD_ID;
    const threadFacts: ThreadFacts = {
      thread: isMain
        ? mainThread()
        : {
            id: threadId,
            agentType: knownTypeOfThread(facts, threadId),
          },
      activeMs: activeTime(eventsAtMs, idleMs),
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

function knownTypeOfThread(facts: SessionFacts, threadId: string): string {
  return facts.tools.find((call) => call.thread.id === threadId)?.thread.agentType
    ?? facts.messages.find((message) => message.thread.id === threadId)?.thread.agentType
    ?? UNKNOWN_SUBAGENT_TYPE;
}

function relabelThread(facts: SessionFacts, threadId: string, agentType: string): void {
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

async function readSubagentMetaType(subagentFile: string): Promise<string | undefined> {
  const metaFile = subagentFile.replace(/\.jsonl$/, ".meta.json");
  const metaText = await readFile(metaFile, "utf8").catch(() => undefined);
  return metaText === undefined ? undefined : firstString(asRecord(parseJson(metaText)), SUBAGENT_TYPE_KEYS);
}

function handleRecord(context: ParseContext, value: unknown, lineNumber: number, isInMainFile: boolean): void {
  const record = asRecord(value);
  if (!record) {
    return;
  }
  const facts = context.facts;
  if (isInMainFile) {
    facts.projectDir ??= asString(record.cwd);
    const gitBranch = asString(record.gitBranch);
    if (!facts.gitBranch && gitBranch && gitBranch !== "HEAD") {
      facts.gitBranch = gitBranch;
    }
  }
  const occurredAt = asString(record.timestamp);
  const parsedAtMs = occurredAt === undefined ? Number.NaN : Date.parse(occurredAt);
  const line: TranscriptLine = {
    record,
    lineNumber,
    thread: threadOfLine(context, record, isInMainFile),
    occurredAt,
    occurredAtMs: Number.isNaN(parsedAtMs) ? undefined : parsedAtMs,
    isInMainFile,
  };
  const lineType = asString(record.type);
  if (line.occurredAtMs !== undefined && lineType !== undefined && TIMED_LINE_TYPES.has(lineType)) {
    const eventsAtMs = context.threadIdToEventsAtMs.get(line.thread.id) ?? [];
    eventsAtMs.push(line.occurredAtMs);
    context.threadIdToEventsAtMs.set(line.thread.id, eventsAtMs);
  }
  const message = asRecord(record.message);
  if (!message) {
    return;
  }
  if (lineType === "assistant") {
    handleAssistantLine(context, line, message);
  } else if (lineType === "user") {
    handleUserLine(context, line, message);
  }
}

function threadOfLine(context: ParseContext, record: UnknownRecord, isInMainFile: boolean): ThreadRef {
  let thread = context.currentThread;
  const isInlineSidechain = isInMainFile && record.isSidechain === true;
  if (isInlineSidechain) {
    const sidechainId = asString(record.agentId) ?? "sidechain";
    thread = {
      id: sidechainId,
      agentType: context.threadIdToDeclaredType.get(sidechainId) ?? UNKNOWN_SUBAGENT_TYPE,
    };
  }
  const declaredType = firstString(record, SUBAGENT_TYPE_KEYS);
  if (declaredType && thread.id !== MAIN_THREAD_ID) {
    context.threadIdToDeclaredType.set(thread.id, declaredType);
    thread.agentType = declaredType;
  }
  return thread;
}

function evidenceFactory(context: ParseContext, line: TranscriptLine): EvidenceFactory {
  return (text?: string) => ({
    sessionId: context.facts.sessionId,
    file: context.currentFile,
    line: line.lineNumber,
    occurredAt: line.occurredAt,
    thread: line.thread.agentType,
    excerpt: text ? excerpt(text) : undefined,
  });
}

function handleAssistantLine(context: ParseContext, line: TranscriptLine, message: UnknownRecord): void {
  const messageId = asString(message.id) ?? `${context.currentFile}:${line.lineNumber}`;
  const usage = readUsage(asRecord(message.usage));
  const toEvidence = evidenceFactory(context, line);
  const existing = context.messageIdToMessage.get(messageId);
  if (existing) {
    // Claude Code writes one line per content block and repeats the message's usage on each one.
    existing.usage = maxUsage(existing.usage, usage);
  } else {
    context.messageIdToMessage.set(messageId, {
      id: messageId,
      model: asString(message.model),
      usage,
      thread: line.thread,
      sentAtMs: line.occurredAtMs,
      ref: toEvidence(),
    });
  }
  for (const block of asArray(message.content).map(asRecord)) {
    const toolUseId = asString(block?.id);
    if (block?.type !== "tool_use" || !toolUseId) {
      continue;
    }
    const call = buildToolCall(block, toolUseId, {
      thread: line.thread,
      toEvidence,
      calledAtMs: line.occurredAtMs,
      messageId,
      projectDir: context.projectDir,
    });
    context.toolUseIdToPendingCall.set(toolUseId, call);
    context.facts.tools.push(call);
  }
}

function readUsage(usage: UnknownRecord | undefined): TokenUsage {
  return {
    input: asNumber(usage?.input_tokens) ?? 0,
    output: asNumber(usage?.output_tokens) ?? 0,
    cacheRead: asNumber(usage?.cache_read_input_tokens) ?? 0,
    cacheWrite: asNumber(usage?.cache_creation_input_tokens) ?? 0,
  };
}

function maxUsage(left: TokenUsage, right: TokenUsage): TokenUsage {
  return {
    input: Math.max(left.input, right.input),
    output: Math.max(left.output, right.output),
    cacheRead: Math.max(left.cacheRead, right.cacheRead),
    cacheWrite: Math.max(left.cacheWrite, right.cacheWrite),
  };
}

function handleUserLine(context: ParseContext, line: TranscriptLine, message: UnknownRecord): void {
  const content = message.content;
  if (typeof content === "string") {
    handlePrompt(context, line, content);
    return;
  }
  const textParts: string[] = [];
  for (const block of asArray(content).map(asRecord)) {
    if (block?.type === "tool_result") {
      handleToolResult(context, line, block);
      continue;
    }
    const text = asString(block?.text);
    if (block?.type === "text" && text !== undefined) {
      textParts.push(text);
    }
  }
  if (textParts.length) {
    handlePrompt(context, line, textParts.join("\n"));
  }
}

function handlePrompt(context: ParseContext, line: TranscriptLine, rawText: string): void {
  const threadId = line.thread.id;
  if (!context.threadIdToFirstPromptHash.has(threadId)) {
    context.threadIdToFirstPromptHash.set(threadId, sha(rawText.trim()));
  }
  const isHarnessGenerated = line.record.isMeta === true
    || line.record.isCompactSummary === true
    || line.record.isVisibleInTranscriptOnly === true;
  // A subagent's "user" turn is the delegation prompt, not something the person typed.
  if (isHarnessGenerated || threadId !== MAIN_THREAD_ID) {
    return;
  }
  const { text, command } = cleanPrompt(rawText);
  const isEmpty = !text && !command;
  if (isEmpty || /^Caveat: The messages below were generated/i.test(text)) {
    return;
  }
  const isInterruption = INTERRUPTED.test(text);
  const hasEarlierPrompt = context.facts.prompts.length > 0;
  context.facts.prompts.push({
    text: redact(text).slice(0, MAX_PROMPT_CHARS),
    ref: evidenceFactory(context, line)(text || `/${command ?? ""}`),
    sentAtMs: line.occurredAtMs,
    command,
    isInterruption,
    isCorrection: !isInterruption && hasEarlierPrompt && isCorrection(text),
  });
}

function handleToolResult(context: ParseContext, line: TranscriptLine, block: UnknownRecord): void {
  const toolUseId = asString(block.tool_use_id);
  const call = toolUseId === undefined ? undefined : context.toolUseIdToPendingCall.get(toolUseId);
  if (!call || toolUseId === undefined) {
    return;
  }
  context.toolUseIdToPendingCall.delete(toolUseId);
  const toolUseResult = asRecord(line.record.toolUseResult);
  const reportedAgentId = asString(toolUseResult?.agentId);
  if (reportedAgentId) {
    context.delegationCallIdToAgentId.set(call.id, reportedAgentId);
  }
  const text = resultText(block.content);
  const kind = classifyResult(text, block.is_error === true, toolUseResult?.interrupted === true);
  const isError = kind !== "ok";
  const toEvidence = evidenceFactory(context, line);
  call.result = {
    isError,
    kind,
    errorHead: isError ? errorKey(text) : undefined,
    contentChars: text.length,
    ref: {
      ...toEvidence(isError ? text : undefined),
      thread: call.thread.agentType,
    },
    returnedAtMs: line.occurredAtMs,
  };
}

function classifyResult(text: string, isMarkedError: boolean, wasInterrupted: boolean): ToolResultKind {
  const head = text.slice(0, RESULT_HEAD_CHARS);
  if (INTERRUPTED.test(text.trim())) {
    return "interrupted";
  }
  if (PERMISSION_DENIED.test(head)) {
    return "permission_denied";
  }
  if (isMarkedError && HOOK_BLOCKED.test(head)) {
    return "hook_blocked";
  }
  return isMarkedError || wasInterrupted ? "error" : "ok";
}

function resultText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  return asArray(content)
    .map(asRecord)
    .map((block) => {
      if (block?.type === "image") {
        return "[image]";
      }
      return block?.type === "text" ? (asString(block.text) ?? "") : "";
    })
    .join("\n");
}

interface ToolCallContext {
  thread: ThreadRef;
  toEvidence: EvidenceFactory;
  calledAtMs?: number;
  messageId: string;
  projectDir?: string;
}

/** What a tool call is about, for grouping and for evidence. */
type ToolDescription = Pick<ToolCall, "key" | "summary" | "filePath" | "subagentType" | "subagentPromptHash" | "skill">;

function buildToolCall(block: UnknownRecord, toolUseId: string, callContext: ToolCallContext): ToolCall {
  const name = asString(block.name) ?? "unknown";
  const input = asRecord(block.input) ?? {};
  const description = describeToolCall(name, input, callContext.projectDir);
  return {
    ...description,
    id: toolUseId,
    name,
    summary: excerpt(description.summary, MAX_SUMMARY_CHARS),
    thread: callContext.thread,
    ref: callContext.toEvidence(description.summary),
    calledAtMs: callContext.calledAtMs,
    messageId: callContext.messageId,
  };
}

function describeToolCall(name: string, input: UnknownRecord, projectDir?: string): ToolDescription {
  const command = asString(input.command);
  if (name === "Bash" && command !== undefined) {
    return {
      key: commandKey(command),
      summary: command,
    };
  }
  const filePath = firstString(input, ["file_path", "notebook_path", "path"]);
  if (FILE_TOOLS.has(name) && filePath !== undefined) {
    const projectRelativePath = toProjectRelative(filePath, projectDir);
    return {
      key: name,
      summary: `${name} ${projectRelativePath}`,
      filePath: projectRelativePath,
    };
  }
  const delegatedType = asString(input.subagent_type);
  const delegatedPrompt = asString(input.prompt);
  const isDelegation = DELEGATION_TOOLS.has(name) && (delegatedType !== undefined || delegatedPrompt !== undefined);
  if (isDelegation) {
    const subagentType = delegatedType ?? DEFAULT_SUBAGENT_TYPE;
    return {
      key: `${name}:${subagentType}`,
      summary: `${subagentType}: ${asString(input.description) ?? ""}`,
      subagentType,
      subagentPromptHash: delegatedPrompt === undefined ? undefined : sha(delegatedPrompt.trim()),
    };
  }
  if (name === "Skill") {
    const skill = (firstString(input, ["skill", "command", "name"]) ?? "unknown").replace(/^\//, "");
    return {
      key: `Skill:${skill}`,
      summary: `skill ${skill}`,
      skill,
    };
  }
  if (name.startsWith("mcp__")) {
    const [, server = "unknown", tool = ""] = name.split("__");
    return {
      key: `mcp:${server}`,
      summary: `${server} ${tool}`,
    };
  }
  const detail = firstString(input, ["pattern", "url", "query"]);
  return {
    key: name,
    summary: detail === undefined ? name : `${name} ${detail}`,
  };
}

function toProjectRelative(filePath: string, projectDir?: string): string {
  const isInsideProject = projectDir !== undefined && isAbsolute(filePath) && filePath.startsWith(projectDir);
  return isInsideProject ? relative(projectDir, filePath) || "." : filePath;
}
