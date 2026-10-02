// Which harness piece was running when something happened. Subagent steps belong to the
// subagent; main-thread steps after a skill or slash command (until the next prompt)
// belong to that skill or command.

import {
  MAIN_THREAD_ID,
  type AssistantMessage,
  type SessionFacts,
  type ToolCall,
  type UserPrompt,
} from "../core/types.js";
import { unique } from "../core/util.js";

/** Attribution for steps no skill, command or subagent was driving. */
export const MAIN_PIECE = "main";
/** Marks agents that aren't in the inventory (built-in ones like general-purpose or Explore). */
export const BUILT_IN_SUFFIX = " (built-in)";
const UNKNOWN_SUBAGENT_TYPE = "subagent";

type AttributedKind = "agent" | "skill" | "command";

export interface SessionIndex {
  /** Each thread's assistant messages, sorted by time. */
  threadIdToMessages: Map<string, AssistantMessage[]>;
  toolCallIdToPieces: Map<string, string[]>;
  /** For a correction or interruption: the pieces that ran in the turn before it. */
  promptToPreviousTurnPieces: Map<UserPrompt, string[]>;
}

interface MainThreadEvent {
  line: number;
  prompt?: UserPrompt;
  call?: ToolCall;
}

export function buildSessionIndex(session: SessionFacts, pieceIds: Set<string>): SessionIndex {
  const index: SessionIndex = {
    threadIdToMessages: groupMessagesByThread(session.messages),
    toolCallIdToPieces: new Map(),
    promptToPreviousTurnPieces: new Map(),
  };
  const mainEvents: MainThreadEvent[] = session.prompts
    .filter((prompt) => prompt.ref.file === session.file)
    .map((prompt) => ({
      line: prompt.ref.line,
      prompt,
    }));
  for (const call of session.tools) {
    if (call.thread.id !== MAIN_THREAD_ID) {
      index.toolCallIdToPieces.set(call.id, [pieceIdFor("agent", call.thread.agentType, pieceIds)]);
    } else if (call.ref.file === session.file) {
      mainEvents.push({
        line: call.ref.line,
        call,
      });
    }
  }
  mainEvents.sort((left, right) => left.line - right.line);

  let currentTurnPieces: string[] = [];
  let lastTurnPieces: string[] = [];
  for (const event of mainEvents) {
    if (event.prompt) {
      index.promptToPreviousTurnPieces.set(event.prompt, lastTurnPieces.length ? lastTurnPieces : [MAIN_PIECE]);
      currentTurnPieces = event.prompt.command ? [commandPieceId(event.prompt.command, pieceIds)] : [];
      lastTurnPieces = currentTurnPieces;
      continue;
    }
    const call = event.call;
    if (!call) {
      continue;
    }
    if (call.skill) {
      currentTurnPieces = unique([...currentTurnPieces, pieceIdFor("skill", call.skill, pieceIds)]);
      lastTurnPieces = currentTurnPieces;
    }
    if (call.subagentType) {
      lastTurnPieces = unique([...currentTurnPieces, pieceIdFor("agent", call.subagentType, pieceIds)]);
    }
    index.toolCallIdToPieces.set(call.id, currentTurnPieces.length ? currentTurnPieces : [MAIN_PIECE]);
  }
  return index;
}

function groupMessagesByThread(messages: AssistantMessage[]): Map<string, AssistantMessage[]> {
  const threadIdToMessages = new Map<string, AssistantMessage[]>();
  for (const message of messages) {
    const threadMessages = threadIdToMessages.get(message.thread.id) ?? [];
    threadMessages.push(message);
    threadIdToMessages.set(message.thread.id, threadMessages);
  }
  for (const threadMessages of threadIdToMessages.values()) {
    threadMessages.sort((left, right) => (left.sentAtMs ?? 0) - (right.sentAtMs ?? 0));
  }
  return threadIdToMessages;
}

/** The inventory id for a piece seen in a transcript; agents missing from the inventory are marked built-in. */
export function pieceIdFor(kind: AttributedKind, name: string, pieceIds: Set<string>): string {
  const pieceId = `${kind}:${name}`;
  const isKnown = pieceIds.has(pieceId) || pieceIds.size === 0;
  const isBuiltInAgent = !isKnown && kind === "agent" && name !== UNKNOWN_SUBAGENT_TYPE;
  return isBuiltInAgent ? `${pieceId}${BUILT_IN_SUFFIX}` : pieceId;
}

/** A slash command runs either a skill or a command file; prefer the skill when both exist. */
export function commandPieceId(name: string, pieceIds: Set<string>): string {
  return pieceIds.has(`skill:${name}`) ? `skill:${name}` : `command:${name}`;
}

export function withoutBuiltInSuffix(pieceId: string): string {
  return pieceId.endsWith(BUILT_IN_SUFFIX) ? pieceId.slice(0, -BUILT_IN_SUFFIX.length) : pieceId;
}

export const UNRESOLVED_SUBAGENT_PIECE = `agent:${UNKNOWN_SUBAGENT_TYPE}`;
