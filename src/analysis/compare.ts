// Before/after for one piece. Observational: it compares real sessions before and after a
// change, which also differ in tasks. It reports deltas and refuses to call a winner when
// either side has too few sessions.

import { toIso } from "../core/time.js";
import type { PieceKind, SessionFacts } from "../core/types.js";
import { round } from "../core/util.js";
import { MAIN_PIECE } from "./attribution.js";
import type { PriceTable } from "./cost.js";
import { extractSignals } from "./signals.js";
import type { SignalThresholds } from "../state/config.js";
import { pieceUsage, type PerInvocation } from "./usage.js";

const MAX_SIDE_SIGNALS = 10;
const DELTA_DIGITS = 3;

export interface SideSignal {
  id: string;
  occurrences: number;
}

export interface SideMetrics {
  sessions: number;
  invocations: number;
  toolCalls: number;
  errorRate: number;
  perInvocation?: PerInvocation;
  corrections: number;
  correctionsPerSession: number;
  signals: SideSignal[];
}

export type CompareVerdict = "insufficient_data" | "improved" | "worse" | "no_clear_change";

export interface CompareDeltas {
  errorRate: number | null;
  correctionsPerSession: number | null;
  activeMinutesPerInvocation: number | null;
  tokensPerInvocation: number | null;
  usdPerInvocation: number | null;
}

export interface CompareResult {
  piece: string;
  changedAt?: string;
  changedAtSource: string;
  minSessions: number;
  before: SideMetrics;
  after: SideMetrics;
  verdict: CompareVerdict;
  deltas: CompareDeltas;
  caveats: string[];
}

export interface CompareOptions {
  minSessions: number;
  /** Relative change (0–1) a metric needs before it counts as better or worse. */
  minRelativeChange: number;
  prices: PriceTable;
  idleMs: number;
  thresholds: SignalThresholds;
}

export function comparePiece(
  sessions: SessionFacts[],
  piece: string,
  changedAtMs: number,
  changedAtSource: string,
  options: CompareOptions,
): CompareResult {
  const sessionsUsingPiece = sessions.filter((session) => usesPiece(session, piece));
  const isBeforeChange = (session: SessionFacts): boolean => (session.startedAtMs ?? 0) < changedAtMs;
  const before = sideMetrics(sessionsUsingPiece.filter(isBeforeChange), piece, options);
  const after = sideMetrics(sessionsUsingPiece.filter((session) => !isBeforeChange(session)), piece, options);
  const caveats = [
    "Observational comparison: sessions before and after differ in tasks, not only in the harness.",
    "Time and cost are estimates; idle gaps are excluded.",
  ];
  const hasEnoughData = before.sessions >= options.minSessions && after.sessions >= options.minSessions;
  if (!hasEnoughData) {
    caveats.push(
      `Need at least ${options.minSessions} sessions using ${piece} on each side `
      + `(before: ${before.sessions}, after: ${after.sessions}).`,
    );
  }
  return {
    piece,
    changedAt: toIso(changedAtMs),
    changedAtSource,
    minSessions: options.minSessions,
    before,
    after,
    verdict: hasEnoughData ? verdictOf(before, after, options.minRelativeChange) : "insufficient_data",
    deltas: {
      errorRate: difference(before.errorRate, after.errorRate),
      correctionsPerSession: difference(before.correctionsPerSession, after.correctionsPerSession),
      activeMinutesPerInvocation: difference(before.perInvocation?.activeMinutes, after.perInvocation?.activeMinutes),
      tokensPerInvocation: difference(before.perInvocation?.tokens, after.perInvocation?.tokens),
      usdPerInvocation: difference(before.perInvocation?.usd, after.perInvocation?.usd),
    },
    caveats,
  };
}

/** Lower is better for every tracked metric; a verdict needs all significant moves in one direction. */
function verdictOf(before: SideMetrics, after: SideMetrics, minRelativeChange: number): CompareVerdict {
  const significantMoves = [
    relativeChange(before.errorRate, after.errorRate),
    relativeChange(before.correctionsPerSession, after.correctionsPerSession),
    relativeChange(before.perInvocation?.usd, after.perInvocation?.usd),
  ].filter((change) => Math.abs(change) >= minRelativeChange);
  if (!significantMoves.length) {
    return "no_clear_change";
  }
  if (significantMoves.every((change) => change < 0)) {
    return "improved";
  }
  return significantMoves.every((change) => change > 0) ? "worse" : "no_clear_change";
}

type UsageCheck = (session: SessionFacts, name: string) => boolean;

const PIECE_KIND_TO_USAGE_CHECK: Partial<Record<PieceKind, UsageCheck>> = {
  agent: (session, name) =>
    session.threads.some((thread) => thread.thread.agentType === name)
    || session.tools.some((call) => call.subagentType === name),
  skill: (session, name) =>
    session.tools.some((call) => call.skill === name) || session.prompts.some((prompt) => prompt.command === name),
  command: (session, name) => session.prompts.some((prompt) => prompt.command === name),
  mcp: (session, name) => session.tools.some((call) => call.key === `mcp:${name}`),
};

/** Instructions, hooks and settings apply to every session in the project, so every session "uses" them. */
export function usesPiece(session: SessionFacts, piece: string): boolean {
  const [kind = "", ...nameParts] = piece.split(":");
  const usageCheck = PIECE_KIND_TO_USAGE_CHECK[kind as PieceKind];
  return usageCheck ? usageCheck(session, nameParts.join(":")) : true;
}

const GLOBAL_PIECE_PREFIXES = ["instructions:", "hook:", "settings:"];

/** Usage of a global piece is the usage of the main thread. */
function usagePieceOf(piece: string): string {
  const isGlobalPiece = GLOBAL_PIECE_PREFIXES.some((prefix) => piece.startsWith(prefix));
  return isGlobalPiece ? MAIN_PIECE : piece;
}

function sideMetrics(sessions: SessionFacts[], piece: string, options: CompareOptions): SideMetrics {
  // Knowing the piece id lets slash commands that run a skill be attributed to "skill:<name>".
  const usage = pieceUsage(sessions, new Set([piece]), options.prices)
    .find((entry) => entry.piece === usagePieceOf(piece));
  const corrections = sessions
    .flatMap((session) => session.prompts)
    .filter((prompt) => prompt.isCorrection || prompt.isInterruption).length;
  const signals = extractSignals(sessions, undefined, {
    idleMs: options.idleMs,
    prices: options.prices,
    maxEvidence: 0,
    minSessionsForUnused: Infinity,
    largePieceTokens: Infinity,
    thresholds: options.thresholds,
  })
    .filter((signal) => signal.pieces.some((signalPiece) => isSamePiece(signalPiece, piece)))
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
    correctionsPerSession: sessions.length ? round(corrections / sessions.length) : 0,
    signals,
  };
}

/** Signals may mark a piece as built-in ("agent:Explore (built-in)"); it's still the same piece. */
function isSamePiece(signalPiece: string, piece: string): boolean {
  return signalPiece === piece || signalPiece.startsWith(`${piece} `);
}

function relativeChange(before: number | undefined, after: number | undefined): number {
  return before && after !== undefined ? (after - before) / before : 0;
}

function difference(before: number | undefined, after: number | undefined): number | null {
  return before === undefined || after === undefined ? null : round(after - before, DELTA_DIGITS);
}
