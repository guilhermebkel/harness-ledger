export interface ThreadRef {
  id: string;
  agentType: string;
}

export interface EvidenceRef {
  sessionId: string;
  file: string;
  line: number;
  occurredAt?: string;
  thread: string;
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
  errorHead?: string;
  contentChars: number;
  ref: EvidenceRef;
  returnedAtMs?: number;
}

export type ToolCategory = "shell" | "read" | "edit" | "search" | "plan" | "delegation" | "skill" | "mcp" | "other";

export interface ToolCall {
  id: string;
  name: string;
  category: ToolCategory;
  key: string;
  summary: string;
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

export type CompactionTrigger = "auto" | "manual";

export interface ContextCompaction {
  trigger: CompactionTrigger;
  contextTokens?: number;
  thread: ThreadRef;
  ref: EvidenceRef;
  occurredAtMs?: number;
}

export interface ReportedTurn {
  durationMs: number;
  endedAtMs?: number;
}

export interface ProviderReport {
  costUsd?: number;
  isCostPartial: boolean;
  turns: ReportedTurn[];
}

export interface SessionEnvironment {
  platform?: string;
  shell?: string;
}

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
  unparsedLines: number;
  unknownLines?: UnknownLineShape[];
  agentVersion?: string;
}
