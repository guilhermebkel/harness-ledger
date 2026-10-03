// Before/after for one piece. Observational: it compares real sessions before and after a
// change, which also differ in tasks. It reports deltas and refuses to call a winner when
// either side has too few sessions.

import type {
  ComparedMetric,
  CompareResult,
  CompareVerdict,
  MetricMove,
  SideMetrics,
} from "@/Shared/Protocols/AnalysisProtocol.js";
import type { Config } from "@/Shared/Protocols/ConfigProtocol.js";
import type { PieceKind } from "@/Shared/Protocols/HarnessProtocol.js";
import type { SessionFacts } from "@/Shared/Protocols/SessionProtocol.js";
import { NumberUtil } from "@/Shared/Utils/NumberUtil.js";
import { TimeUtil } from "@/Shared/Utils/TimeUtil.js";
import { AttributionService } from "./AttributionService.js";
import { SignalService } from "./SignalService.js";
import { UsageService } from "./UsageService.js";

const MAX_SIDE_SIGNALS = 10;
const DELTA_DIGITS = 3;
const RELATIVE_CHANGE_DIGITS = 2;
const GLOBAL_PIECE_PREFIXES = ["instructions:", "hook:", "settings:"];

type UsageCheck = (session: SessionFacts, name: string) => boolean;

export class CompareService {
  /** Instructions, hooks and settings apply to every session, so every session "uses" them. */
  private static readonly PIECE_KIND_TO_USAGE_CHECK: Partial<Record<PieceKind, UsageCheck>> = {
    agent: (session, name) =>
      session.threads.some((thread) => thread.thread.agentType === name)
      || session.tools.some((call) => call.subagentType === name),
    skill: (session, name) =>
      session.tools.some((call) => call.skill === name) || session.prompts.some((prompt) => prompt.command === name),
    command: (session, name) => session.prompts.some((prompt) => prompt.command === name),
    mcp: (session, name) => session.tools.some((call) => call.category === "mcp" && call.key === `mcp:${name}`),
  };

  /** Already priced into usdPerInvocation, so they inform the report but don't vote in the verdict. */
  private static readonly TOKEN_METRICS = new Set<ComparedMetric>(["inputTokensPerInvocation", "outputTokensPerInvocation"]);

  constructor(
    private readonly config: Config,
    private readonly idleMs: number,
  ) {}

  static usesPiece(session: SessionFacts, piece: string): boolean {
    const [kind = "", ...nameParts] = piece.split(":");
    const usageCheck = CompareService.PIECE_KIND_TO_USAGE_CHECK[kind as PieceKind];
    return usageCheck ? usageCheck(session, nameParts.join(":")) : true;
  }

  compare(sessions: SessionFacts[], piece: string, changedAtMs: number, changedAtSource: string): CompareResult {
    const minSessions = this.config.minSessionsCompare;
    const sessionsUsingPiece = sessions.filter((session) => CompareService.usesPiece(session, piece));
    const isBeforeChange = (session: SessionFacts): boolean => (session.startedAtMs ?? 0) < changedAtMs;
    const before = this.sideMetrics(sessionsUsingPiece.filter(isBeforeChange), piece);
    const after = this.sideMetrics(sessionsUsingPiece.filter((session) => !isBeforeChange(session)), piece);
    const caveats = [
      "Observational comparison: sessions before and after differ in tasks, not only in the harness.",
      "Time and cost are estimates; idle gaps are excluded.",
    ];
    const hasEnoughData = before.sessions >= minSessions && after.sessions >= minSessions;
    const moves = hasEnoughData ? this.significantMoves(before, after) : [];
    if (!hasEnoughData) {
      caveats.push(
        `Need at least ${minSessions} sessions using ${piece} on each side `
        + `(before: ${before.sessions}, after: ${after.sessions}).`,
      );
    }
    return {
      piece,
      changedAtSource,
      minSessions,
      before,
      after,
      moves,
      caveats,
      changedAt: TimeUtil.toIso(changedAtMs),
      verdict: hasEnoughData ? this.verdictOf(moves) : "insufficient_data",
      deltas: {
        errorRate: this.difference(before.errorRate, after.errorRate),
        correctionsPerSession: this.difference(before.correctionsPerSession, after.correctionsPerSession),
        activeMinutesPerInvocation: this.difference(
          before.perInvocation?.activeMinutes,
          after.perInvocation?.activeMinutes,
        ),
        tokensPerInvocation: this.difference(before.perInvocation?.tokens, after.perInvocation?.tokens),
        inputTokensPerInvocation: this.difference(before.perInvocation?.inputTokens, after.perInvocation?.inputTokens),
        outputTokensPerInvocation: this.difference(
          before.perInvocation?.outputTokens,
          after.perInvocation?.outputTokens,
        ),
        usdPerInvocation: this.difference(before.perInvocation?.usd, after.perInvocation?.usd),
      },
    };
  }

  /**
   * Time counts as much as money: a change that keeps the cost but makes the work faster is an improvement.
   * Lower is better for every metric.
   */
  private significantMoves(before: SideMetrics, after: SideMetrics): MetricMove[] {
    const metricToValues: Record<ComparedMetric, [number | undefined, number | undefined]> = {
      errorRate: [before.errorRate, after.errorRate],
      correctionsPerSession: [before.correctionsPerSession, after.correctionsPerSession],
      activeMinutesPerInvocation: [before.perInvocation?.activeMinutes, after.perInvocation?.activeMinutes],
      usdPerInvocation: [before.perInvocation?.usd, after.perInvocation?.usd],
      inputTokensPerInvocation: [before.perInvocation?.inputTokens, after.perInvocation?.inputTokens],
      outputTokensPerInvocation: [before.perInvocation?.outputTokens, after.perInvocation?.outputTokens],
    };
    return (Object.entries(metricToValues) as [ComparedMetric, [number | undefined, number | undefined]][])
      .map(([metric, [beforeValue, afterValue]]): MetricMove => {
        const relativeChange = this.relativeChange(beforeValue, afterValue);
        return {
          metric,
          relativeChange: NumberUtil.round(relativeChange, RELATIVE_CHANGE_DIGITS),
          direction: relativeChange < 0 ? "better" : "worse",
          isInVerdict: !CompareService.TOKEN_METRICS.has(metric),
        };
      })
      .filter((move) => Math.abs(move.relativeChange) >= this.config.minRelativeChange);
  }

  private verdictOf(allMoves: MetricMove[]): CompareVerdict {
    const moves = allMoves.filter((move) => move.isInVerdict);
    if (!moves.length) {
      return "no_clear_change";
    }
    if (moves.every((move) => move.direction === "better")) {
      return "improved";
    }
    return moves.every((move) => move.direction === "worse") ? "worse" : "mixed";
  }

  /** Usage of a global piece is the usage of the main thread. */
  private usagePieceOf(piece: string): string {
    const isGlobalPiece = GLOBAL_PIECE_PREFIXES.some((prefix) => piece.startsWith(prefix));
    return isGlobalPiece ? AttributionService.MAIN_PIECE : piece;
  }

  private sideMetrics(sessions: SessionFacts[], piece: string): SideMetrics {
    // Knowing the piece id lets slash commands that run a skill be attributed to "skill:<name>".
    const usage = new UsageService(this.config.prices, new Set([piece]))
      .pieceUsage(sessions)
      .find((entry) => entry.piece === this.usagePieceOf(piece));
    const corrections = sessions
      .flatMap((session) => session.prompts)
      .filter((prompt) => prompt.isCorrection || prompt.isInterruption).length;
    const signalService = new SignalService({
      idleMs: this.idleMs,
      prices: this.config.prices,
      maxEvidence: 0,
      minSessionsForUnused: Infinity,
      largePieceTokens: Infinity,
      thresholds: this.config.signalThresholds,
    });
    const signals = signalService
      .extract(sessions)
      .filter((signal) => signal.pieces.some((signalPiece) => AttributionService.isSamePiece(signalPiece, piece)))
      .slice(0, MAX_SIDE_SIGNALS)
      .map((signal) => ({
        id: signal.id,
        occurrences: signal.occurrences,
      }));
    return {
      corrections,
      signals,
      sessions: sessions.length,
      invocations: usage?.invocations ?? 0,
      toolCalls: usage?.toolCalls ?? 0,
      errorRate: usage?.errorRate ?? 0,
      perInvocation: usage?.perInvocation,
      correctionsPerSession: sessions.length ? NumberUtil.round(corrections / sessions.length) : 0,
    };
  }

  private relativeChange(before: number | undefined, after: number | undefined): number {
    return before && after !== undefined ? (after - before) / before : 0;
  }

  private difference(before: number | undefined, after: number | undefined): number | null {
    return before === undefined || after === undefined ? null : NumberUtil.round(after - before, DELTA_DIGITS);
  }
}
