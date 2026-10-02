// Agent-agnostic model. Adapters (Claude Code today; Codex and Cursor later)
// read their own formats and produce these types. Everything after the adapter
// works only on these types.

/** Where a step happened: the main thread or a subagent. */
export interface ThreadRef {
  /** "main" for the main thread; otherwise the subagent id. */
  id: string;
  /** Subagent type (e.g. "code-reviewer") when known. "main" for the main thread. */
  agentType: string;
}

/** A pointer back to the exact place in a transcript. Every finding carries these. */
export interface EvidenceRef {
  sessionId: string;
  /** Absolute path of the transcript file. */
  file: string;
  /** 1-based line in the transcript file. */
  line: number;
  timestamp?: string;
  thread: string; // agentType or "main"
  /** Short, redacted excerpt. Never contains secret values. */
  excerpt?: string;
}

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface ToolCall {
  id: string;
  name: string;
  /** Normalized key used for grouping, e.g. "npm test", "Read", "mcp:github". */
  key: string;
  /** Redacted short description of the input (command, file path, query). */
  summary: string;
  /** File path for file tools, when present. */
  filePath?: string;
  thread: ThreadRef;
  ref: EvidenceRef;
  timestampMs?: number;
  /** Message id of the assistant message that issued the call. */
  messageId?: string;
  result?: {
    isError: boolean;
    kind: "ok" | "error" | "permission_denied" | "interrupted" | "hook_blocked";
    /** First line of the error, redacted and normalized. */
    errorHead?: string;
    contentChars: number;
    ref: EvidenceRef;
    timestampMs?: number;
  };
  /** For Task/Agent tool calls. */
  subagentType?: string;
  subagentPromptHash?: string;
  /** For Skill tool calls. */
  skill?: string;
}

export interface UserPrompt {
  text: string; // redacted, system reminders stripped
  ref: EvidenceRef;
  timestampMs?: number;
  /** Slash command name if the prompt invoked one (without the slash). */
  command?: string;
  isCorrection: boolean;
  isInterruption: boolean;
}

export interface AssistantMessage {
  id: string;
  model?: string;
  usage: TokenUsage;
  thread: ThreadRef;
  timestampMs?: number;
  ref: EvidenceRef;
}

export interface ThreadFacts {
  thread: ThreadRef;
  /** Active time in ms (gaps above the idle threshold are excluded). */
  activeMs: number;
  firstMs?: number;
  lastMs?: number;
  promptHash?: string;
}

/** Everything the analysis needs from one session (main transcript + subagents). */
export interface SessionFacts {
  agent: "claude-code";
  sessionId: string;
  file: string;
  projectDir?: string;
  gitBranch?: string;
  startMs?: number;
  endMs?: number;
  /** Active time of the main thread. Subagent time is reported per thread, never summed into this. */
  activeMs: number;
  threads: ThreadFacts[];
  prompts: UserPrompt[];
  tools: ToolCall[];
  messages: AssistantMessage[];
  /** Files counted, including subagent transcripts. */
  files: string[];
  /** Lines that could not be parsed (format drift). */
  unparsedLines: number;
}

export type PieceKind =
  | "instructions"
  | "skill"
  | "agent"
  | "command"
  | "hook"
  | "mcp"
  | "plugin"
  | "settings";

export type PieceScope = "project" | "local" | "user" | "plugin" | "managed";

export interface HarnessPiece {
  /** Stable id, e.g. "agent:code-reviewer", "skill:changelog", "instructions:project". */
  id: string;
  kind: PieceKind;
  name: string;
  scope: PieceScope;
  /** Path relative to the project (project/local) or absolute with ~ (user/plugin). */
  path: string;
  /** Short sha256 of the content. */
  hash: string;
  bytes: number;
  /** Rough token estimate (chars / 4). */
  approxTokens: number;
  description?: string;
  model?: string;
  tools?: string[];
  /** ISO date of the last change: last git commit touching the file, or mtime. */
  modifiedAt?: string;
  modifiedSource?: "git" | "mtime";
  /** False for pieces the user doesn't control (plugins, managed). */
  editable: boolean;
  /** Plugin id for pieces that come from a plugin. */
  plugin?: string;
}

export interface Inventory {
  agent: "claude-code";
  projectDir: string;
  takenAt: string;
  /** Hash over all piece hashes; changes when anything in the harness changes. */
  fingerprint: string;
  pieces: HarnessPiece[];
  /** Transcript retention as configured (days), and where it came from. */
  retention: { days: number; source: string };
  notes: string[];
}
