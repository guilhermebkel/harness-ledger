import type { SessionIndex } from "@/Shared/Protocols/AnalysisProtocol.ts";
import type { SessionFacts, ToolCall, ToolCategory } from "@/Shared/Protocols/SessionProtocol.ts";
import type { SignalOptions } from "@/Shared/Protocols/SignalProtocol.ts";
import { NormalizeUtil } from "@/Shared/Utils/NormalizeUtil.ts";
import { NumberUtil } from "@/Shared/Utils/NumberUtil.ts";
import { TokenUsageUtil } from "@/Shared/Utils/TokenUsageUtil.ts";
import { AttributionService } from "@/Shared/Services/AttributionService.ts";
import type { OccurrenceCollectorService } from "@/Shared/Services/OccurrenceCollectorService.ts";

const keyOf = (call: ToolCall): string => call.key;
const CATEGORY_TO_SOURCE: Record<ToolCategory, (call: ToolCall) => string> = {
  read: (call) => call.filePath ?? call.key,
  // Why: a command that only looks around is the material itself (`cat a.ts` and `cat b.ts` differ); any other is its
  // key (every `git diff` prints a diff).
  shell: (call) => (NormalizeUtil.isExplorationCommand(call.key) ? call.summary : call.key),
  edit: keyOf,
  search: keyOf,
  plan: keyOf,
  delegation: keyOf,
  skill: keyOf,
  mcp: keyOf,
  other: keyOf,
};
const TOKENS_PER_THOUSAND = 1000;
// Why: edits, plans and delegations return little or a summary, so they don't load material.
const LOADING_CATEGORIES = new Set<ToolCategory>(["read", "shell", "search", "mcp", "skill", "other"]);

interface SourceLoads {
  pieceSourceKey: string;
  piece: string;
  source: string;
  calls: {
    session: SessionFacts;
    call: ToolCall;
    tokens: number;
  }[];
}

export class ContextLoadDetectorService {
  constructor(
    private readonly options: SignalOptions,
    private readonly collector: OccurrenceCollectorService,
  ) {}

  detect(sessions: SessionFacts[], sessionIdToIndex: Map<string, SessionIndex>): void {
    for (const loads of this.heavySources(sessions, sessionIdToIndex)) {
      for (const { session, call, tokens } of loads.calls) {
        const title = `${loads.piece} keeps filling its context with the same material`;
        const group = this.collector.add(`context_heavy:${loads.piece}`, "context_heavy", title, {
          session,
          ref: {
            ...call.ref,
            excerpt: `${call.summary} → ~${this.inThousands(tokens)}k tokens`,
          },
          pieces: [loads.piece],
          activeMs: 0,
          usage: {
            ...TokenUsageUtil.zero(),
            input: tokens,
            cacheRead: tokens * ContextLoadDetectorService.laterMessagesOf(session, sessionIdToIndex, call),
          },
          model: undefined,
        });
        this.collector.count(group, "sources", `${loads.source} (×${loads.calls.length})`, tokens);
      }
    }
  }

  private static laterMessagesOf(
    session: SessionFacts,
    sessionIdToIndex: Map<string, SessionIndex>,
    call: ToolCall,
  ): number {
    const loadedAtMs = call.result?.returnedAtMs ?? call.calledAtMs ?? 0;
    // Why: loaded material is re-sent as cached input with every later message of the thread, until a compaction
    // drops it; that carry, not the first load, is most of what it costs.
    const droppedAtMs = session.compactions
      .filter((compaction) => compaction.thread.id === call.thread.id && (compaction.occurredAtMs ?? 0) > loadedAtMs)
      .reduce((earliest, compaction) => Math.min(earliest, compaction.occurredAtMs ?? Infinity), Infinity);
    const threadMessages = sessionIdToIndex.get(session.sessionId)?.threadIdToMessages.get(call.thread.id) ?? [];
    return threadMessages.filter((message) => {
      const sentAtMs = message.sentAtMs ?? 0;
      return sentAtMs > loadedAtMs && sentAtMs < droppedAtMs;
    }).length;
  }

  private heavySources(sessions: SessionFacts[], sessionIdToIndex: Map<string, SessionIndex>): SourceLoads[] {
    const thresholds = this.options.thresholds;
    const keyToLoads = new Map<string, SourceLoads>();
    for (const session of sessions) {
      const index = sessionIdToIndex.get(session.sessionId);
      for (const call of session.tools.filter((toolCall) => LOADING_CATEGORIES.has(toolCall.category))) {
        const tokens = NumberUtil.charsToTokens(call.result?.contentChars ?? 0);
        if (!tokens || call.result?.isError) {
          continue;
        }
        const piece = index?.toolCallIdToPieces.get(call.id)?.[0] ?? AttributionService.MAIN_PIECE;
        const source = this.sourceOf(call);
        const pieceSourceKey = `${piece}\u0000${source}`;
        const loads = keyToLoads.get(pieceSourceKey) ?? {
          pieceSourceKey,
          piece,
          source,
          calls: [],
        };
        loads.calls.push({
          session,
          call,
          tokens,
        });
        keyToLoads.set(pieceSourceKey, loads);
      }
    }
    return [...keyToLoads.values()].filter((loads) => {
      const totalTokens = loads.calls.reduce((total, load) => total + load.tokens, 0);
      const isRepeated = loads.calls.length >= thresholds.minHeavySourceLoads;
      const hasHugeResult = loads.calls.some((load) => load.tokens >= thresholds.minHugeResultTokens);
      return totalTokens >= thresholds.minHeavySourceTokens && (isRepeated || hasHugeResult);
    });
  }

  private sourceOf(call: ToolCall): string {
    return CATEGORY_TO_SOURCE[call.category](call);
  }

  private inThousands(tokens: number): number {
    return NumberUtil.round(tokens / TOKENS_PER_THOUSAND, 1);
  }
}
