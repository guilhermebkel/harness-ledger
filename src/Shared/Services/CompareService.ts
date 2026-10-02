// Before/after for one piece. Observational: it compares real sessions before and after a
// change, which also differ in tasks. It reports deltas and refuses to call a winner when
// either side has too few sessions.

import type { CompareResult, CompareVerdict, SideMetrics } from "@/Shared/Protocols/AnalysisProtocol.js";
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
    if (!hasEnoughData) {
      caveats.push(
        `Need at least ${minSessions} sessions using ${piece} on each side `
        + `(before: ${before.sessions}, after: ${after.sessions}).`,
      );
    }
    return {
      piece,
      changedAt: TimeUtil.toIso(changedAtMs),
      changedAtSource,
      minSessions,
      before,
      after,
      verdict: hasEnoughData ? this.verdictOf(before, after) : "insufficient_data",
      deltas: {
        errorRate: this.difference(before.errorRate, after.errorRate),
        correctionsPerSession: this.difference(before.correctionsPerSession, after.correctionsPerSession),
        activeMinutesPerInvocation: this.difference(
          before.perInvocation?.activeMinutes,
          after.perInvocation?.activeMinutes,
        ),
        tokensPerInvocation: this.difference(before.perInvocation?.tokens, after.perInvocation?.tokens),
        usdPerInvocation: this.difference(before.perInvocation?.usd, after.perInvocation?.usd),
      },
      caveats,
    };
  }

  /** Lower is better for every tracked metric; a verdict needs all significant moves in one direction. */
  private verdictOf(before: SideMetrics, after: SideMetrics): CompareVerdict {
    const significantMoves = [
      this.relativeChange(before.errorRate, after.errorRate),
      this.relativeChange(before.correctionsPerSession, after.correctionsPerSession),
      this.relativeChange(before.perInvocation?.usd, after.perInvocation?.usd),
    ].filter((change) => Math.abs(change) >= this.config.minRelativeChange);
    if (!significantMoves.length) {
      return "no_clear_change";
    }
    if (significantMoves.every((change) => change < 0)) {
      return "improved";
    }
    return significantMoves.every((change) => change > 0) ? "worse" : "no_clear_change";
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
      sessions: sessions.length,
      invocations: usage?.invocations ?? 0,
      toolCalls: usage?.toolCalls ?? 0,
      errorRate: usage?.errorRate ?? 0,
      perInvocation: usage?.perInvocation,
      corrections,
      correctionsPerSession: sessions.length ? NumberUtil.round(corrections / sessions.length) : 0,
      signals,
    };
  }

  private relativeChange(before: number | undefined, after: number | undefined): number {
    return before && after !== undefined ? (after - before) / before : 0;
  }

  private difference(before: number | undefined, after: number | undefined): number | null {
    return before === undefined || after === undefined ? null : NumberUtil.round(after - before, DELTA_DIGITS);
  }
}
