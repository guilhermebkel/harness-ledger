// Types used only inside the Claude Code provider.

import type { ModifiedSource, PieceKind, PieceScope, Retention } from "@/Shared/Protocols/HarnessProtocol.js";
import type { EvidenceRef, SessionFacts, ThreadRef, ToolCall, AssistantMessage } from "@/Shared/Protocols/SessionProtocol.js";
import type { UnknownRecord } from "@/Shared/Protocols/UtilProtocol.js";

export interface ClaudeCodeParseContext {
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
  /** Last real model each thread used, to name the model behind an API error. */
  threadIdToLastModel: Map<string, string>;
  /** `cost-state` totals are cumulative per run of Claude Code; a resumed session starts a new run. */
  runStartToCostUsd: Map<string, number>;
}

/** What one transcript line says, with every field read through the guards. */
export interface ClaudeCodeTranscriptLine {
  record: UnknownRecord;
  lineNumber: number;
  thread: ThreadRef;
  occurredAt?: string;
  occurredAtMs?: number;
}

export type EvidenceFactory = (text?: string) => EvidenceRef;

export interface ClaudeCodeToolCallContext {
  thread: ThreadRef;
  toEvidence: EvidenceFactory;
  calledAtMs?: number;
  messageId: string;
  projectDir?: string;
  skillInUse?: string;
}

/** What a tool call is about, for grouping and for evidence. */
export type ClaudeCodeToolDescription = Pick<
  ToolCall,
  "key" | "category" | "summary" | "filePath" | "subagentType" | "subagentPromptHash" | "skill"
>;

export interface FileChange {
  modifiedAt?: string;
  modifiedSource?: ModifiedSource;
}

/** A file-backed piece before it gets its content-derived fields. */
export interface FilePiece {
  file: string;
  kind: PieceKind;
  name: string;
  scope: PieceScope;
  plugin?: string;
  /** Other files of the piece (a skill folder's references and scripts); they count toward its hash. */
  extraFiles?: string[];
}

export interface ComponentOptions {
  /** Prefix for names of plugin components, which Claude Code namespaces as `plugin:name`. */
  namePrefix?: string;
  plugin?: string;
  /** A plugin may be a single skill with SKILL.md at its root. */
  canBeRootSkill?: boolean;
}

export interface SettingsFile {
  file: string;
  scope: PieceScope;
}

export interface SettingsSummary {
  pluginIdToIsEnabled: Map<string, boolean>;
  retention: Retention;
}

/** What the result line says about a tool result, besides its text. */
export interface ClaudeCodeResultSignals {
  isMarkedError: boolean;
  wasInterrupted: boolean;
  /** `toolDenialKind`, e.g. "user-rejected" or "automode-blocked". */
  denialKind?: string;
}
