// The provider-agnostic session model. Each provider adapter reads its agent's own transcripts and
// produces these types; everything after the adapter works only on them (ADR 0005).

/** Where a step happened: the main thread or a subagent run. */
export interface ThreadRef {
  /** `SessionUtil.MAIN_THREAD_ID` for the main thread; otherwise the subagent id. */
  id: string;
  /** Subagent type (e.g. "code-reviewer") when known; `SessionUtil.MAIN_THREAD_ID` for the main thread. */
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
  /** Agent type of the thread, or the main thread id. */
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

export type ToolResultKind = "ok" | "error" | "permission_denied" | "user_rejected" | "interrupted" | "hook_blocked";

export interface ToolResult {
  isError: boolean;
  kind: ToolResultKind;
  /** First meaningful line of the error, redacted and normalized for grouping. */
  errorHead?: string;
  contentChars: number;
  ref: EvidenceRef;
  returnedAtMs?: number;
}

/**
 * What a tool does, independent of the provider's tool names. Shared code branches on this,
 * never on a tool's name.
 */
export type ToolCategory = "shell" | "read" | "edit" | "search" | "delegation" | "skill" | "mcp" | "other";

export interface ToolCall {
  id: string;
  /** The provider's own tool name, for display. */
  name: string;
  category: ToolCategory;
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
  /** The skill whose instructions were driving this call, when the provider records it. */
  skillInUse?: string;
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
  /** The skill whose instructions were driving this message, when the provider records it. */
  skillInUse?: string;
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
/** A request to the model API that failed (bad model name, auth, server error, rate limit). */
export interface ApiError {
  /** HTTP status, when recorded. */
  status?: number;
  /** Short error code, e.g. "model_not_found", "authentication_failed", "http_400". */
  code: string;
  /** Model the failing request used, when known. */
  model?: string;
  thread: ThreadRef;
  ref: EvidenceRef;
  occurredAtMs?: number;
}

/** One agent turn as the provider timed it: from the person's message until the agent stopped. */
export interface ReportedTurn {
  durationMs: number;
  endedAtMs?: number;
}

/** Figures the provider computed itself, kept apart from the script's own estimates. */
export interface ProviderReport {
  /** The provider's own cost for the session, in USD. */
  costUsd?: number;
  /** The provider could not price some model, so `costUsd` leaves it out. */
  isCostPartial: boolean;
  turns: ReportedTurn[];
}

export interface SessionFacts {
  provider: string;
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
  apiErrors: ApiError[];
  reported: ProviderReport;
  /** Transcript files read, including subagent transcripts. */
  files: string[];
  /** Lines that could not be parsed, a sign of format drift. */
  unparsedLines: number;
}
