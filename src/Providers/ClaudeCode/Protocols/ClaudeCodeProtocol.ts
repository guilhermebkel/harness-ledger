import type { ModifiedSource, PieceKind, PieceScope, Retention } from "@/Shared/Protocols/HarnessProtocol.ts";
import type { EvidenceRef, SessionFacts, ThreadRef, ToolCall, AssistantMessage } from "@/Shared/Protocols/SessionProtocol.ts";
import type { UnknownRecord } from "@/Shared/Protocols/UtilProtocol.ts";

export interface ClaudeCodeParseContext {
  facts: SessionFacts;
  currentFile: string;
  currentThread: ThreadRef;
  projectDir?: string;
  toolUseIdToPendingCall: Map<string, ToolCall>;
  threadIdToEventsAtMs: Map<string, number[]>;
  messageIdToMessage: Map<string, AssistantMessage>;
  delegationCallIdToAgentId: Map<string, string>;
  threadIdToFirstPromptHash: Map<string, string>;
  threadIdToDeclaredType: Map<string, string>;
  threadIdToLastModel: Map<string, string>;
  runStartToCostUsd: Map<string, number>;
}

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

export type ClaudeCodeToolDescription = Pick<
  ToolCall,
  "key" | "category" | "summary" | "filePath" | "subagentType" | "subagentPromptHash" | "skill"
>;

export interface FileChange {
  modifiedAt?: string;
  modifiedSource?: ModifiedSource;
}

export interface FilePiece {
  file: string;
  kind: PieceKind;
  name: string;
  scope: PieceScope;
  plugin?: string;
  extraFiles?: string[];
}

export interface ComponentOptions {
  namePrefix?: string;
  plugin?: string;
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

export interface ClaudeCodeResultSignals {
  isMarkedError: boolean;
  wasInterrupted: boolean;
  denialKind?: string;
}
