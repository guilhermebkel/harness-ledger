// Why: subagent steps belong to the subagent; main-thread steps after a skill or slash command, until the next prompt, belong to that skill or command.

import type { AttributedKind, SessionIndex } from "@/Shared/Protocols/AnalysisProtocol.js";
import type { AssistantMessage, SessionFacts, ToolCall, UserPrompt } from "@/Shared/Protocols/SessionProtocol.js";
import { CollectionUtil } from "@/Shared/Utils/CollectionUtil.js";
import { SessionUtil } from "@/Shared/Utils/SessionUtil.js";

const UNKNOWN_SUBAGENT_TYPE = "subagent";

interface MainThreadEvent {
  line: number;
  prompt?: UserPrompt;
  call?: ToolCall;
}

// Why: `last` is what the next prompt inherits; it includes an agent the turn started.
interface TurnPieces {
  current: string[];
  last: string[];
}

export class AttributionService {
  static readonly MAIN_PIECE = "main";
  // Why: agents missing from the inventory are built-in ones (general-purpose, Explore).
  static readonly BUILT_IN_SUFFIX = " (built-in)";
  static readonly UNRESOLVED_SUBAGENT_PIECE = `agent:${UNKNOWN_SUBAGENT_TYPE}`;

  constructor(private readonly pieceIds: Set<string>) {}

  static withoutBuiltInSuffix(pieceId: string): string {
    const suffix = AttributionService.BUILT_IN_SUFFIX;
    return pieceId.endsWith(suffix) ? pieceId.slice(0, -suffix.length) : pieceId;
  }

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
      const isMainThread = SessionUtil.isMainThread(call.thread);
      if (!isMainThread) {
        const agentPiece = this.pieceIdFor("agent", call.thread.agentType);
        const skillPieces = call.skillInUse ? [this.pieceIdFor("skill", call.skillInUse)] : [];
        index.toolCallIdToPieces.set(call.id, [agentPiece, ...skillPieces]);
      }
      if (isMainThread && call.ref.file === session.file) {
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

  pieceIdFor(kind: AttributedKind, name: string): string {
    const pieceId = `${kind}:${name}`;
    const isKnown = this.pieceIds.has(pieceId) || this.pieceIds.size === 0;
    const isBuiltInAgent = !isKnown && kind === "agent" && name !== UNKNOWN_SUBAGENT_TYPE;
    return isBuiltInAgent ? `${pieceId}${AttributionService.BUILT_IN_SUFFIX}` : pieceId;
  }

  // Why: a slash command runs either a skill or a command file; the skill wins when both exist.
  commandPieceId(name: string): string {
    return this.pieceIds.has(`skill:${name}`) ? `skill:${name}` : `command:${name}`;
  }

  private attributeMainThread(mainEvents: MainThreadEvent[], index: SessionIndex): void {
    const turn: TurnPieces = { current: [], last: [] };
    for (const event of mainEvents) {
      if (event.prompt) {
        const previousPieces = turn.last.length ? turn.last : [AttributionService.MAIN_PIECE];
        index.promptToPreviousTurnPieces.set(event.prompt, previousPieces);
        turn.current = event.prompt.command ? [this.commandPieceId(event.prompt.command)] : [];
        turn.last = turn.current;
      }
      if (event.call) {
        this.attributeCall(event.call, turn, index);
      }
    }
  }

  // Why: a skill a call loads joins the turn's pieces; an agent it starts is only inherited by the next prompt.
  private attributeCall(call: ToolCall, turn: TurnPieces, index: SessionIndex): void {
    // Why: the skill the provider says was running wins over the one inferred from the turn.
    const skillName = call.skillInUse ?? call.skill;
    if (skillName) {
      turn.current = CollectionUtil.unique([...turn.current, this.pieceIdFor("skill", skillName)]);
      turn.last = turn.current;
    }
    if (call.subagentType) {
      turn.last = CollectionUtil.unique([...turn.current, this.pieceIdFor("agent", call.subagentType)]);
    }
    index.toolCallIdToPieces.set(call.id, turn.current.length ? turn.current : [AttributionService.MAIN_PIECE]);
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
