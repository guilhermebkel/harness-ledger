import type { SessionFacts, ThreadRef } from "@/Shared/Protocols/SessionProtocol.ts";
import type { UnknownRecord } from "@/Shared/Protocols/UtilProtocol.ts";

export interface AntigravityTranscriptLine {
  record: UnknownRecord;
  lineNumber: number;
  occurredAtMs?: number;
  occurredAt?: string;
  thread: ThreadRef;
  type?: string;
}

export interface AntigravityParseContext {
  facts: SessionFacts;
  currentFile: string;
  currentThread: ThreadRef;
  threadIdToEventsAtMs: Map<string, number[]>;
  threadIdToFirstPromptHash: Map<string, string>;
}
