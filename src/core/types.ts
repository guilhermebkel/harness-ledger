// The agent-agnostic model. Adapters read each agent's own formats and produce these
// types; everything after the adapter works only on them (ADR 0005).

export type AgentId = "claude-code";

export const MAIN_THREAD_ID = "main";

/** Where a step happened: the main thread or a subagent run. */
export interface ThreadRef {
  /** `MAIN_THREAD_ID` for the main thread; otherwise the subagent id. */
  id: string;
  /** Subagent type (e.g. "code-reviewer") when known; `MAIN_THREAD_ID` for the main thread. */
  agentType: string;
}

/** A pointer back to the exact place in a transcript. Every signal carries these. */
export interface EvidenceRef {
  sessionId: string;
  /** Absolute path of the transcript file. */
  file: string;
  /** 1-based line in the transcript file. */
  line: number;
  occurredAt?: string;
  /** Agent type of the thread, or `MAIN_THREAD_ID`. */
  thread: string;
  /** Short, redacted excerpt. Never contains secret values. */
  excerpt?: string;
}

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export type ToolResultKind = "ok" | "error" | "permission_denied" | "interrupted" | "hook_blocked";

export interface ToolResult {
  isError: boolean;
  kind: ToolResultKind;
  /** First meaningful line of the error, redacted and normalized for grouping. */
  errorHead?: string;
  contentChars: number;
  ref: EvidenceRef;
  returnedAtMs?: number;
}

export interface ToolCall {
  id: string;
  name: string;
  /** Grouping key, e.g. "npm test", "Read", "mcp:github". */
  key: string;
  /** Redacted short description of the input (command, file path, query). */
  summary: string;
  /** Project-relative path for file tools, when the file is inside the project. */
  filePath?: string;
  thread: ThreadRef;
  ref: EvidenceRef;
  calledAtMs?: number;
  /** Id of the assistant message that issued the call. */
  messageId?: string;
  result?: ToolResult;
  /** Set for delegations to a subagent. */
  subagentType?: string;
  subagentPromptHash?: string;
  /** Set for skill invocations. */
  skill?: string;
}

export interface UserPrompt {
  /** Redacted, with harness-injected blocks removed. */
  text: string;
  ref: EvidenceRef;
  sentAtMs?: number;
  /** Slash command name (without the slash) when the prompt invoked one. */
  command?: string;
  isCorrection: boolean;
  isInterruption: boolean;
}

export interface AssistantMessage {
  id: string;
  model?: string;
  usage: TokenUsage;
  thread: ThreadRef;
  sentAtMs?: number;
  ref: EvidenceRef;
}

export interface ThreadFacts {
  thread: ThreadRef;
  /** Gaps above the idle threshold are excluded. */
  activeMs: number;
  firstEventAtMs?: number;
  lastEventAtMs?: number;
  promptHash?: string;
}

/** Everything the analysis needs from one session: the main transcript and its subagent transcripts. */
export interface SessionFacts {
  agent: AgentId;
  sessionId: string;
  file: string;
  projectDir?: string;
  gitBranch?: string;
  startedAtMs?: number;
  endedAtMs?: number;
  /** Main thread only. Subagent time is reported per thread and never added here. */
  activeMs: number;
  threads: ThreadFacts[];
  prompts: UserPrompt[];
  tools: ToolCall[];
  messages: AssistantMessage[];
  /** Transcript files read, including subagent transcripts. */
  files: string[];
  /** Lines that could not be parsed, a sign of format drift. */
  unparsedLines: number;
}

export type PieceKind = "instructions" | "skill" | "agent" | "command" | "hook" | "mcp" | "plugin" | "settings";

export type PieceScope = "project" | "local" | "user" | "plugin" | "managed";

export type ModifiedSource = "git" | "mtime";

export interface HarnessPiece {
  /** Stable id, e.g. "agent:code-reviewer", "skill:changelog", "instructions:project". */
  id: string;
  kind: PieceKind;
  name: string;
  scope: PieceScope;
  /** Relative to the project for project and local pieces; absolute with `~` otherwise. */
  path: string;
  /** Short sha256 of the content. */
  hash: string;
  bytes: number;
  approxTokens: number;
  description?: string;
  model?: string;
  tools?: string[];
  /** Last change: the last commit touching the file, or its mtime when uncommitted or outside git. */
  modifiedAt?: string;
  modifiedSource?: ModifiedSource;
  /** False for pieces the user doesn't control (plugins, managed settings). */
  isEditable: boolean;
  /** Plugin id for pieces that come from a plugin. */
  plugin?: string;
}

export interface Retention {
  days: number;
  /** The settings file that set it, or "default". */
  source: string;
}

export interface Inventory {
  agent: AgentId;
  projectDir: string;
  takenAt: string;
  /** Changes whenever any piece changes. */
  fingerprint: string;
  pieces: HarnessPiece[];
  retention: Retention;
  notes: string[];
}
