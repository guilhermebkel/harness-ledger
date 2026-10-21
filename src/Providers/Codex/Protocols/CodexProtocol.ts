import type { AssistantMessage, EvidenceRef, SessionFacts, ThreadRef, ToolCall } from "@/Shared/Protocols/SessionProtocol.ts";
import type { UnknownRecord } from "@/Shared/Protocols/UtilProtocol.ts";

export interface CodexSessionMeta {
  id?: string;
  cwd?: string;
  parentThreadId?: string;
  agentType?: string;
}

export interface CodexParseContext {
  facts: SessionFacts;
  currentFile: string;
  currentThread: ThreadRef;
  callIdToPendingCall: Map<string, ToolCall>;
  threadIdToEventsAtMs: Map<string, number[]>;
  threadIdToFirstPromptHash: Map<string, string>;
  threadIdToModel: Map<string, string>;
  threadIdToLastTotalTokens: Map<string, number>;
  openMessage?: AssistantMessage;
}

export interface CodexRolloutLine {
  record: UnknownRecord;
  payload: UnknownRecord;
  lineNumber: number;
  thread: ThreadRef;
  occurredAt?: string;
  occurredAtMs?: number;
}

export type CodexEvidenceFactory = (text?: string) => EvidenceRef;

export type CodexToolDescription = Pick<
  ToolCall,
  "key" | "category" | "summary" | "filePath" | "subagentType" | "subagentPromptHash"
>;

export interface CodexRolloutEntry {
  file: string;
  modifiedAtMs: number;
  bytes: number;
  meta: CodexSessionMeta;
}
