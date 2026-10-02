// Which harness piece was running when something happened. Subagent steps belong to the
// subagent; main-thread steps after a skill or slash command (until the next prompt) belong
// to that skill or command.

import type { AttributedKind, SessionIndex } from "../Protocols/AnalysisProtocol.js";
import type { AssistantMessage, SessionFacts, ToolCall, UserPrompt } from "../Protocols/SessionProtocol.js";
import { CollectionUtil } from "../Utils/CollectionUtil.js";
import { SessionUtil } from "../Utils/SessionUtil.js";

const UNKNOWN_SUBAGENT_TYPE = "subagent";

interface MainThreadEvent {
  line: number;
  prompt?: UserPrompt;
  call?: ToolCall;
}

export class AttributionService {
  /** Attribution for steps no skill, command or subagent was driving. */
  static readonly MAIN_PIECE = "main";
  /** Marks agents that aren't in the inventory (built-in ones like general-purpose or Explore). */
  static readonly BUILT_IN_SUFFIX = " (built-in)";
  static readonly UNRESOLVED_SUBAGENT_PIECE = `agent:${UNKNOWN_SUBAGENT_TYPE}`;

  /** `pieceIds` are the inventory ids; with none, every name is taken as is. */
  constructor(private readonly pieceIds: Set<string>) {}

  static withoutBuiltInSuffix(pieceId: string): string {
    const suffix = AttributionService.BUILT_IN_SUFFIX;
    return pieceId.endsWith(suffix) ? pieceId.slice(0, -suffix.length) : pieceId;
  }

  /** Signals may mark a piece as built-in ("agent:Explore (built-in)"); it's still the same piece. */
  static isSamePiece(signalPiece: string, piece: string): boolean {
    return signalPiece === piece || signalPiece.startsWith(`${piece} `);
  }

  buildSessionIndex(session: SessionFacts): SessionIndex {
    const index: SessionIndex = {
      threadIdToMessages: this.groupMessagesByThread(session.messages),
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
      if (!SessionUtil.isMainThread(call.thread)) {
        index.toolCallIdToPieces.set(call.id, [this.pieceIdFor("agent", call.thread.agentType)]);
      } else if (call.ref.file === session.file) {
        mainEvents.push({
          line: call.ref.line,
          call,
        });
      }
    }
    mainEvents.sort((left, right) => left.line - right.line);
    this.attributeMainThread(mainEvents, index);
    return index;
  }

  /** The inventory id for a piece seen in a transcript; agents missing from the inventory are marked built-in. */
  pieceIdFor(kind: AttributedKind, name: string): string {
    const pieceId = `${kind}:${name}`;
    const isKnown = this.pieceIds.has(pieceId) || this.pieceIds.size === 0;
    const isBuiltInAgent = !isKnown && kind === "agent" && name !== UNKNOWN_SUBAGENT_TYPE;
    return isBuiltInAgent ? `${pieceId}${AttributionService.BUILT_IN_SUFFIX}` : pieceId;
  }

  /** A slash command runs either a skill or a command file; prefer the skill when both exist. */
  commandPieceId(name: string): string {
    return this.pieceIds.has(`skill:${name}`) ? `skill:${name}` : `command:${name}`;
  }

  private attributeMainThread(mainEvents: MainThreadEvent[], index: SessionIndex): void {
    let currentTurnPieces: string[] = [];
    let lastTurnPieces: string[] = [];
    for (const event of mainEvents) {
      if (event.prompt) {
        const previousPieces = lastTurnPieces.length ? lastTurnPieces : [AttributionService.MAIN_PIECE];
        index.promptToPreviousTurnPieces.set(event.prompt, previousPieces);
        currentTurnPieces = event.prompt.command ? [this.commandPieceId(event.prompt.command)] : [];
        lastTurnPieces = currentTurnPieces;
        continue;
      }
      const call = event.call;
      if (!call) {
        continue;
      }
      if (call.skill) {
        currentTurnPieces = CollectionUtil.unique([...currentTurnPieces, this.pieceIdFor("skill", call.skill)]);
        lastTurnPieces = currentTurnPieces;
      }
      if (call.subagentType) {
        lastTurnPieces = CollectionUtil.unique([...currentTurnPieces, this.pieceIdFor("agent", call.subagentType)]);
      }
      const callPieces = currentTurnPieces.length ? currentTurnPieces : [AttributionService.MAIN_PIECE];
      index.toolCallIdToPieces.set(call.id, callPieces);
    }
  }

  private groupMessagesByThread(messages: AssistantMessage[]): Map<string, AssistantMessage[]> {
    const threadIdToMessages = new Map<string, AssistantMessage[]>();
    for (const message of messages) {
      CollectionUtil.pushTo(threadIdToMessages, message.thread.id, message);
    }
    for (const threadMessages of threadIdToMessages.values()) {
      threadMessages.sort((left, right) => (left.sentAtMs ?? 0) - (right.sentAtMs ?? 0));
    }
    return threadIdToMessages;
  }
}
