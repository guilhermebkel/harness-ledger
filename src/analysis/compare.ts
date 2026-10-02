// Before/after for one piece. Observational: it compares real sessions before and after
// a change, which differ in tasks too. It reports deltas and refuses to call a winner
// when either side has too few sessions.

import type { Inventory, SessionFacts } from "../core/types.js";
import { round } from "../core/util.js";
import type { PriceTable } from "./cost.js";
import { extractSignals } from "./signals.js";
import { pieceUsage } from "./usage.js";

export interface SideMetrics {
  sessions: number;
  invocations: number;
  toolCalls: number;
  errorRate: number;
  perInvocation?: { activeMinutes: number; tokens: number; usd: number; toolCalls: number };
  corrections: number;
  correctionsPerSession: number;
  signals: Array<{ id: string; occurrences: number }>;
}

export interface CompareResult {
  piece: string;
  changedAt: string;
  changedAtSource: string;
  minSessions: number;
  before: SideMetrics;
  after: SideMetrics;
  verdict: "insufficient_data" | "improved" | "worse" | "no_clear_change";
  deltas: Record<string, number | null>;
  caveats: string[];
}

export function comparePiece(
  sessions: SessionFacts[],
  piece: string,
  changedAtMs: number,
  changedAtSource: string,
  opts: { minSessions: number; prices: PriceTable; idleMs: number },
): CompareResult {
  const uses = (s: SessionFacts) => usesPiece(s, piece);
  const before = sessions.filter((s) => (s.startMs ?? 0) < changedAtMs && uses(s));
  const after = sessions.filter((s) => (s.startMs ?? 0) >= changedAtMs && uses(s));
  const b = side(before, piece, opts);
  const a = side(after, piece, opts);
  const caveats = [
    "Observational comparison: sessions before and after differ in tasks, not only in the harness.",
    "Time and cost are estimates; idle gaps are excluded.",
  ];
  const deltas: Record<string, number | null> = {
    errorRate: diff(b.errorRate, a.errorRate),
    correctionsPerSession: diff(b.correctionsPerSession, a.correctionsPerSession),
    activeMinutesPerInvocation: diff(b.perInvocation?.activeMinutes, a.perInvocation?.activeMinutes),
    tokensPerInvocation: diff(b.perInvocation?.tokens, a.perInvocation?.tokens),
    usdPerInvocation: diff(b.perInvocation?.usd, a.perInvocation?.usd),
  };
  let verdict: CompareResult["verdict"] = "no_clear_change";
  if (b.sessions < opts.minSessions || a.sessions < opts.minSessions) {
    verdict = "insufficient_data";
    caveats.push(`Need at least ${opts.minSessions} sessions using ${piece} on each side (before: ${b.sessions}, after: ${a.sessions}).`);
  } else {
    // Lower is better for all tracked metrics. Require a 20% relative move to call it.
    const rel = (x?: number, y?: number) => (x && y !== undefined ? (y - x) / x : 0);
    const moves = [
      rel(b.errorRate, a.errorRate),
      rel(b.correctionsPerSession, a.correctionsPerSession),
      rel(b.perInvocation?.usd, a.perInvocation?.usd),
    ].filter((m) => Math.abs(m) >= 0.2);
    if (moves.length && moves.every((m) => m < 0)) verdict = "improved";
    else if (moves.length && moves.every((m) => m > 0)) verdict = "worse";
  }
  return { piece, changedAt: new Date(changedAtMs).toISOString(), changedAtSource, minSessions: opts.minSessions, before: b, after: a, verdict, deltas, caveats };
}

export function usesPiece(s: SessionFacts, piece: string): boolean {
  const [kind, ...rest] = piece.split(":");
  const name = rest.join(":");
  switch (kind) {
    case "agent":
      return s.threads.some((t) => t.thread.agentType === name) || s.tools.some((c) => c.subagentType === name);
    case "skill":
      return s.tools.some((c) => c.skill === name) || s.prompts.some((p) => p.command === name);
    case "command":
      return s.prompts.some((p) => p.command === name);
    case "mcp":
      return s.tools.some((c) => c.key === `mcp:${name}`);
    default:
      // instructions, hooks, settings, main: they apply to every session in the project.
      return true;
  }
}

function side(sessions: SessionFacts[], piece: string, opts: { prices: PriceTable; idleMs: number }): SideMetrics {
  // A one-piece inventory so slash-command skills are attributed to "skill:<name>".
  const inv = { pieces: [{ id: piece }] } as unknown as Inventory;
  const usage = pieceUsage(sessions, inv, opts.prices).find((u) => u.piece === normalizePiece(piece));
  const corrections = sessions.reduce((n, s) => n + s.prompts.filter((p) => p.isCorrection || p.isInterruption).length, 0);
  const signals = extractSignals(sessions, undefined, {
    idleMs: opts.idleMs,
    prices: opts.prices,
    maxEvidence: 0,
    minSessionsForUnused: Infinity,
    largePieceTokens: Infinity,
  })
    .filter((s) => s.pieces.some((p) => p === piece || p.startsWith(`${piece} `)))
    .slice(0, 10)
    .map((s) => ({ id: s.id, occurrences: s.occurrences }));
  return {
    sessions: sessions.length,
    invocations: usage?.invocations ?? 0,
    toolCalls: usage?.toolCalls ?? 0,
    errorRate: usage?.errorRate ?? 0,
    perInvocation: usage?.perInvocation,
    corrections,
    correctionsPerSession: sessions.length ? round(corrections / sessions.length, 2) : 0,
    signals,
  };
}

function normalizePiece(piece: string): string {
  return piece.startsWith("instructions:") || piece.startsWith("hook:") || piece.startsWith("settings:") ? "main" : piece;
}

function diff(before?: number, after?: number): number | null {
  return before === undefined || after === undefined ? null : round(after - before, 3);
}
