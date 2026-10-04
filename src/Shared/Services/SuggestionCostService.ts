import type {
  CostBound,
  CostFigures,
  OccurrenceCost,
  Signal,
  SignalEvidence,
} from "@/Shared/Protocols/SignalProtocol.ts";
import type { NewSuggestion, OccurrenceRef, SuggestionCost } from "@/Shared/Protocols/SuggestionProtocol.ts";
import { CollectionUtil } from "@/Shared/Utils/CollectionUtil.ts";
import { NumberUtil } from "@/Shared/Utils/NumberUtil.ts";
import { RedactUtil } from "@/Shared/Utils/RedactUtil.ts";
import { TimeUtil } from "@/Shared/Utils/TimeUtil.ts";

const MAX_ID_CHARS = 120;

interface CostPart {
  cost: OccurrenceCost;
  occurrences: number;
  bound: CostBound;
}

const ZERO_COST: OccurrenceCost = {
  activeMs: 0,
  tokens: 0,
  inputTokens: 0,
  outputTokens: 0,
  usd: 0,
};

export class SuggestionCostService {
  private readonly idToSignal: Map<string, Signal>;

  constructor(signals: Signal[]) {
    this.idToSignal = new Map(signals.map((signal) => [signal.id, signal]));
  }

  static keyOf(occurrence: OccurrenceRef): string {
    return `${occurrence.sessionId}:${occurrence.line}`;
  }

  static keysOf(occurrences: OccurrenceRef[]): Set<string> {
    return new Set(occurrences.map((occurrence) => SuggestionCostService.keyOf(occurrence)));
  }

  static figuresOf(cost: OccurrenceCost): CostFigures {
    return {
      activeMinutes: TimeUtil.msToMinutes(cost.activeMs),
      tokens: cost.tokens,
      inputTokens: cost.inputTokens,
      outputTokens: cost.outputTokens,
      usd: NumberUtil.round(cost.usd),
    };
  }

  static sum(costs: OccurrenceCost[]): OccurrenceCost {
    return costs.reduce((total, cost) => ({
      activeMs: total.activeMs + cost.activeMs,
      tokens: total.tokens + cost.tokens,
      inputTokens: total.inputTokens + cost.inputTokens,
      outputTokens: total.outputTokens + cost.outputTokens,
      usd: total.usd + cost.usd,
    }), ZERO_COST);
  }

  static coveredBy(costs: SuggestionCost[]): CostFigures {
    const covered = costs.reduce((total, cost) => ({
      activeMinutes: total.activeMinutes + cost.activeMinutes,
      tokens: total.tokens + cost.tokens,
      inputTokens: total.inputTokens + cost.inputTokens,
      outputTokens: total.outputTokens + cost.outputTokens,
      usd: total.usd + cost.usd,
    }), SuggestionCostService.figuresOf(ZERO_COST));
    return {
      ...covered,
      activeMinutes: NumberUtil.round(covered.activeMinutes, 1),
      usd: NumberUtil.round(covered.usd),
    };
  }

  costsOf(suggestions: NewSuggestion[]): SuggestionCost[] {
    const occurrenceKeyToPosition = this.claimedOccurrences(suggestions);
    this.checkWholeSignals(suggestions);
    return suggestions.map((suggestion) => this.costOf(suggestion, new Set(occurrenceKeyToPosition.keys())));
  }

  private claimedOccurrences(suggestions: NewSuggestion[]): Map<string, number> {
    const occurrenceKeyToPosition = new Map<string, number>();
    suggestions.forEach((suggestion, suggestionIndex) => {
      const position = suggestionIndex + 1;
      const evidenceKeys = SuggestionCostService.keysOf(this.evidenceOf(suggestion.signals));
      for (const occurrence of suggestion.occurrences ?? []) {
        const key = SuggestionCostService.keyOf(occurrence);
        if (!evidenceKeys.has(key)) {
          throw new Error(
            `Suggestion ${position} lists session ${occurrence.sessionId} line ${occurrence.line}, which isn't in the`
            + " evidence of its signals. Run `harness-ledger evidence <signal-id>` to see their occurrences.",
          );
        }
        const otherPosition = occurrenceKeyToPosition.get(key);
        if (otherPosition !== undefined && otherPosition !== position) {
          throw new Error(
            `Session ${occurrence.sessionId} line ${occurrence.line} is in suggestions ${otherPosition} and ${position}.`
            + " Each occurrence belongs to the one suggestion that would prevent it.",
          );
        }
        occurrenceKeyToPosition.set(key, position);
      }
    });
    return occurrenceKeyToPosition;
  }

  private checkWholeSignals(suggestions: NewSuggestion[]): void {
    const signalIdToPosition = new Map<string, number>();
    suggestions.forEach((suggestion, suggestionIndex) => {
      const position = suggestionIndex + 1;
      for (const signalId of this.wholeSignalsOf(suggestion)) {
        const otherPosition = signalIdToPosition.get(signalId);
        if (otherPosition !== undefined) {
          const shownId = RedactUtil.excerpt(signalId, MAX_ID_CHARS);
          throw new Error(
            `Suggestions ${otherPosition} and ${position} both take all of ${shownId}. List the occurrences each one`
            + ` covers ("occurrences": [{"sessionId", "line"}], from \`harness-ledger evidence ${shownId}\`).`,
          );
        }
        signalIdToPosition.set(signalId, position);
      }
    });
  }

  private wholeSignalsOf(suggestion: NewSuggestion): string[] {
    const listedKeys = SuggestionCostService.keysOf(suggestion.occurrences ?? []);
    return suggestion.signals.filter((signalId) => {
      const evidence = this.idToSignal.get(signalId)?.evidence ?? [];
      return !evidence.some((item) => listedKeys.has(SuggestionCostService.keyOf(item)));
    });
  }

  private costOf(suggestion: NewSuggestion, claimedKeys: Set<string>): SuggestionCost {
    const listedKeys = SuggestionCostService.keysOf(suggestion.occurrences ?? []);
    const parts: CostPart[] = [];
    const partialReasons: string[] = [];
    for (const signalId of suggestion.signals) {
      const signal = this.idToSignal.get(signalId);
      if (!signal) {
        partialReasons.push(`signal not in the last analysis: ${RedactUtil.excerpt(signalId, MAX_ID_CHARS)}`);
        continue;
      }
      const listed = signal.evidence.filter((item) => listedKeys.has(SuggestionCostService.keyOf(item)));
      parts.push(listed.length
        ? SuggestionCostService.listedPart(signal, listed)
        : this.remainderPart(signal, claimedKeys));
    }
    const bounds = CollectionUtil.unique(parts.map((part) => part.bound));
    const total = SuggestionCostService.sum(parts.map((part) => part.cost));
    return {
      ...SuggestionCostService.figuresOf(total),
      partialReasons,
      bound: bounds.length === 1 ? (bounds[0] ?? "estimate") : "estimate",
      occurrences: parts.reduce((count, part) => count + part.occurrences, 0),
      isPartial: partialReasons.length > 0,
    };
  }

  private static listedPart(signal: Signal, listed: SignalEvidence[]): CostPart {
    return {
      cost: SuggestionCostService.sum(listed.map((item) => item.cost)),
      occurrences: listed.length,
      bound: signal.cost.bound,
    };
  }

  private remainderPart(signal: Signal, claimedKeys: Set<string>): CostPart {
    // Why: the signal's own cost minus what other suggestions claimed; occurrences past the saved evidence are in the
    // signal's cost, so they stay with the suggestion that takes the rest.
    const claimed = signal.evidence.filter((item) => claimedKeys.has(SuggestionCostService.keyOf(item)));
    const claimedCost = SuggestionCostService.sum(claimed.map((item) => item.cost));
    const signalCost: OccurrenceCost = {
      activeMs: signal.cost.activeMinutes * TimeUtil.MS_PER_MINUTE,
      tokens: signal.cost.tokens,
      inputTokens: signal.cost.inputTokens,
      outputTokens: signal.cost.outputTokens,
      usd: signal.cost.usd,
    };
    return {
      cost: {
        activeMs: Math.max(0, signalCost.activeMs - claimedCost.activeMs),
        tokens: Math.max(0, signalCost.tokens - claimedCost.tokens),
        inputTokens: Math.max(0, signalCost.inputTokens - claimedCost.inputTokens),
        outputTokens: Math.max(0, signalCost.outputTokens - claimedCost.outputTokens),
        usd: Math.max(0, signalCost.usd - claimedCost.usd),
      },
      occurrences: signal.occurrences - claimed.length,
      bound: signal.cost.bound,
    };
  }

  private evidenceOf(signalIds: string[]): SignalEvidence[] {
    return signalIds.flatMap((signalId) => this.idToSignal.get(signalId)?.evidence ?? []);
  }
}
