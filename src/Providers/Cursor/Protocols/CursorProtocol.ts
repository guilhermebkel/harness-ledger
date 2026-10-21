import type { UnknownRecord } from "@/Shared/Protocols/UtilProtocol.ts";
import type { AssistantMessage, SessionFacts, ThreadRef, ToolCall } from "@/Shared/Protocols/SessionProtocol.ts";

export interface CursorParseContext {
  facts: SessionFacts;
  currentFile: string;
  currentThread: ThreadRef;
}

export type CursorToolDescription = Pick<
  ToolCall,
  "key" | "category" | "summary" | "filePath" | "subagentType" | "subagentPromptHash"
>;

export interface CursorTranscriptEntry {
  file: string;
  modifiedAtMs: number;
  bytes: number;
  sessionId: string;
  projectFolder: string;
  isSubagent: boolean;
  parentId: string;
}

export interface CursorToolSource {
  message: AssistantMessage;
  name: string;
  block: UnknownRecord;
  id: string;
  lineNumber: number;
}
