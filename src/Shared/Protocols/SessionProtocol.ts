// Why: everything after the adapter works only on these types (ADR 0005).

export interface ThreadRef {
  id: string;
  agentType: string;
}

export interface EvidenceRef {
  sessionId: string;
  file: string;
  // Why: 1-based.
  line: number;
  occurredAt?: string;
  thread: string;
  // Why: redacted; never contains secret values.
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
  // Why: redacted and normalized for grouping.
  errorHead?: string;
  contentChars: number;
  ref: EvidenceRef;
  returnedAtMs?: number;
}

// Why: shared code branches on the category, never on a provider's tool name.
export type ToolCategory = "shell" | "read" | "edit" | "search" | "plan" | "delegation" | "skill" | "mcp" | "other";

export interface ToolCall {
  id: string;
  name: string;
  category: ToolCategory;
  key: string;
  // Why: redacted.
  summary: string;
  // Why: only when the file is inside the project.
  filePath?: string;
  thread: ThreadRef;
  ref: EvidenceRef;
  calledAtMs?: number;
  messageId?: string;
  result?: ToolResult;
  subagentType?: string;
  subagentPromptHash?: string;
  skill?: string;
  skillInUse?: string;
}

export interface UserPrompt {
  // Why: redacted, with harness-injected blocks removed.
  text: string;
  ref: EvidenceRef;
  sentAtMs?: number;
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
  skillInUse?: string;
}

export interface ThreadFacts {
  thread: ThreadRef;
  activeMs: number;
  firstEventAtMs?: number;
  lastEventAtMs?: number;
  promptHash?: string;
}

export interface ApiError {
  status?: number;
  code: string;
  model?: string;
  thread: ThreadRef;
  ref: EvidenceRef;
  occurredAtMs?: number;
}

export interface ContextCompaction {
  trigger: "auto" | "manual";
  contextTokens?: number;
  thread: ThreadRef;
  ref: EvidenceRef;
  occurredAtMs?: number;
}

// Why: as the provider timed it, from the person's message until the agent stopped.
export interface ReportedTurn {
  durationMs: number;
  endedAtMs?: number;
}

// Why: kept apart from the script's estimates, never added to them.
export interface ProviderReport {
  // Why: a session resumed many times may have recorded only some runs, so this can be lower than the real cost.
  costUsd?: number;
  isCostPartial: boolean;
  turns: ReportedTurn[];
}

// Why: suggested scripts and commands must fit the person's machine.
export interface SessionEnvironment {
  // Why: Node-style names: "darwin", "linux", "win32".
  platform?: string;
  shell?: string;
}

// Why: a line the provider's parser doesn't know, by shape only (its type and top-level keys), never its values.
export interface UnknownLineShape {
  type: string;
  keys: string[];
  count: number;
}

export interface SessionFacts {
  provider: string;
  sessionId: string;
  file: string;
  projectDir?: string;
  gitBranch?: string;
  startedAtMs?: number;
  endedAtMs?: number;
  // Why: main thread only; subagent time is reported per thread and never added here.
  activeMs: number;
  threads: ThreadFacts[];
  prompts: UserPrompt[];
  tools: ToolCall[];
  messages: AssistantMessage[];
  apiErrors: ApiError[];
  compactions: ContextCompaction[];
  environment: SessionEnvironment;
  reported: ProviderReport;
  files: string[];
  // Why: a sign of format drift.
  unparsedLines: number;
  // Why: optional because sessions cached by older versions don't have them.
  unknownLines?: UnknownLineShape[];
  agentVersion?: string;
}
