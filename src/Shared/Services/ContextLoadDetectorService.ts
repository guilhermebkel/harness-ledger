// What fills each piece's context: the files, commands and tools whose results it keeps loading. High token
// use alone is not a finding (big tasks are big); the same material loaded again and again, or one huge
// output, is: it can be summarized, split, cut short or looked up instead.

import type { SessionIndex } from "@/Shared/Protocols/AnalysisProtocol.js";
import type { SessionFacts, ToolCall, ToolCategory } from "@/Shared/Protocols/SessionProtocol.js";
import type { SignalOptions } from "@/Shared/Protocols/SignalProtocol.js";
import { NormalizeUtil } from "@/Shared/Utils/NormalizeUtil.js";
import { NumberUtil } from "@/Shared/Utils/NumberUtil.js";
import { AttributionService } from "./AttributionService.js";
import type { OccurrenceCollectorService } from "./OccurrenceCollectorService.js";

const TOKENS_PER_THOUSAND = 1000;
/** Results that bring material into the context. Edits, plans and delegations return little or a summary. */
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
          // Counted once as input; in practice it is re-read on every later turn of the thread.
          usage: {
            input: tokens,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
          },
          model: undefined,
        });
        this.collector.count(group, "sources", `${loads.source} (×${loads.calls.length})`, tokens);
      }
    }
  }

  /** Sources over the token threshold that were loaded repeatedly, or that once returned a huge result. */
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

  /**
   * The material a call loads: a file for reads; for shell, the exact command when it only looks around
   * (`cat a.ts` and `cat b.ts` are different material), otherwise its key (every `git diff` prints a diff).
   */
  private sourceOf(call: ToolCall): string {
    if (call.category === "read" && call.filePath) {
      return call.filePath;
    }
    const isExploration = call.category === "shell" && NormalizeUtil.isExplorationCommand(call.key);
    return isExploration ? call.summary : call.key;
  }

  private inThousands(tokens: number): number {
    return NumberUtil.round(tokens / TOKENS_PER_THOUSAND, 1);
  }
}
