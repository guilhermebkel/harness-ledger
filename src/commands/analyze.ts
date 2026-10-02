import { takeInventory } from "../adapters/claude-code/inventory.js";
import { usesPiece } from "../analysis/compare.js";
import { addUsage, totalTokens, usageCostUsd, ZERO_USAGE, type PriceTable } from "../analysis/cost.js";
import { findMentions } from "../analysis/mentions.js";
import { extractSignals, type Signal, type SignalType } from "../analysis/signals.js";
import { pieceUsage, type PieceUsage } from "../analysis/usage.js";
import { msToMinutes, parsePointInTime, toIso } from "../core/time.js";
import { MAIN_THREAD_ID, type Inventory, type SessionFacts } from "../core/types.js";
import { countBy, round } from "../core/util.js";
import type { Suggestion } from "../state/store.js";
import {
  compactPiece,
  createContext,
  diffInventories,
  loadProjectSessions,
  VERSION,
  type CommonOptions,
  type CompactPiece,
  type InventoryChange,
} from "./context.js";

export const LAST_ANALYSIS_FILE = "last-analysis.json";

const DEFAULT_MAX_SIGNALS = 25;
const DEFAULT_MAX_EVIDENCE = 5;
/** Evidence kept per signal in the saved analysis, for `imh evidence`. */
const SAVED_EVIDENCE_PER_SIGNAL = 50;
const MAX_USAGE_ENTRIES = 15;
/** Searching instruction files for every failing command is slow; the top ones are enough. */
const MAX_FAILED_COMMANDS_TO_SEARCH = 15;
const WASTE_SIGNAL_TYPES = new Set<SignalType>([
  "failed_command",
  "tool_error",
  "permission_denied",
  "hook_blocked",
  "repeated_read",
  "subagent_reread",
]);
const CORRECTION_SIGNAL_TYPES = new Set<SignalType>(["user_correction", "interruption"]);
const COST_METHOD
  = "Active time sums gaps between transcript events up to the idle threshold; subagent time is reported per agent and not added to session time. Failure cost = time until the agent reacted + tokens of the reaction turn. Correction cost = the corrected turn (upper bound). Categories can overlap.";

export interface AnalyzeOptions extends CommonOptions {
  since?: string;
  until?: string;
  focusPieces?: string[];
  maxSignals?: number;
  maxEvidence?: number;
}

export interface CostSummary {
  activeMinutes: number;
  tokens: number;
  usd: number;
}

export interface AnalysisTotals extends CostSummary {
  subagentActiveMinutes: number;
  lostToFailures: CostSummary;
  inCorrectedOrInterruptedTurns: CostSummary;
  isEstimated: true;
  method: string;
  idleMinutes: number;
}

export interface Analysis {
  tool: {
    name: string;
    version: string;
  };
  generatedAt: string;
  project: string;
  agent: Inventory["agent"];
  period: {
    since?: string;
    until?: string;
    focus: string[];
  };
  history: {
    transcriptsAvailable: number;
    oldestAt?: string;
    newestAt?: string;
    retentionDays: number;
    retentionSource: string;
    note: string;
  };
  analyzed: {
    sessions: number;
    subagentRuns: number;
    parsedNow: number;
    fromCache: number;
    unparsedLines: number;
  };
  totals: AnalysisTotals;
  inventory: {
    fingerprint: string;
    hasChangedSinceLastRun: boolean;
    changes: InventoryChange[];
    pieces: CompactPiece[];
    notes: string[];
  };
  usage: PieceUsage[];
  signals: Signal[];
  suggestions: Record<string, number>;
  dataDir: string;
}

export interface CompactAnalysis extends Analysis {
  omittedSignals: number;
  hint: string;
}

/** Maps the harness, reads the sessions and extracts signals. Saves the full result and returns a compact one. */
export async function runAnalyze(options: AnalyzeOptions): Promise<CompactAnalysis> {
  const context = await createContext(options);
  const { config } = context;
  const periodStartAtMs = parsePointInTime(options.since);
  const periodEndAtMs = parsePointInTime(options.until);
  const inventory = await takeInventory({
    projectDir: context.projectDir,
    isProjectOnly: options.isProjectOnly,
  });
  const { previous, hasChanged } = await context.store.saveInventory(inventory);
  const loaded = await loadProjectSessions(context, options, {
    periodStartAtMs,
    periodEndAtMs,
  });

  const focusPieces = options.focusPieces?.filter(Boolean) ?? [];
  const isFocused = focusPieces.length > 0;
  const sessions = isFocused
    ? loaded.sessions.filter((session) => focusPieces.some((piece) => usesPiece(session, piece)))
    : loaded.sessions;
  const allSignals = extractSignals(sessions, inventory, {
    idleMs: context.idleMs,
    prices: config.prices,
    maxEvidence: SAVED_EVIDENCE_PER_SIGNAL,
    minSessionsForUnused: config.minSessionsForUnused,
    largePieceTokens: config.largePieceTokens,
    thresholds: config.signalThresholds,
  });
  const signals = isFocused ? allSignals.filter((signal) => touchesAnyPiece(signal, focusPieces)) : allSignals;
  const suggestions = await context.store.loadSuggestions();
  markHandledSignals(signals, suggestions);
  await addInstructionMentions(signals, inventory);

  const pieceIds = new Set(inventory.pieces.map((piece) => piece.id));
  const usage = pieceUsage(sessions, pieceIds, config.prices);
  const analysis: Analysis = {
    tool: {
      name: "improve-my-harness",
      version: VERSION,
    },
    generatedAt: new Date().toISOString(),
    project: context.projectDir,
    agent: inventory.agent,
    period: {
      since: toIso(periodStartAtMs) ?? loaded.available.oldestAt,
      until: toIso(periodEndAtMs) ?? new Date().toISOString(),
      focus: focusPieces,
    },
    history: {
      transcriptsAvailable: loaded.available.count,
      oldestAt: loaded.available.oldestAt,
      newestAt: loaded.available.newestAt,
      retentionDays: inventory.retention.days,
      retentionSource: inventory.retention.source,
      note: `Claude Code deletes transcripts older than ${inventory.retention.days} days at startup. `
        + "improve-my-harness never changes this setting.",
    },
    analyzed: {
      sessions: sessions.length,
      subagentRuns: sessions
        .flatMap((session) => session.threads)
        .filter((thread) => thread.thread.id !== MAIN_THREAD_ID).length,
      parsedNow: loaded.parsedCount,
      fromCache: loaded.cachedCount,
      unparsedLines: loaded.unparsedLines,
    },
    totals: {
      ...sessionTotals(sessions, config.prices),
      lostToFailures: sumSignalCosts(signals, WASTE_SIGNAL_TYPES),
      inCorrectedOrInterruptedTurns: sumSignalCosts(signals, CORRECTION_SIGNAL_TYPES),
      isEstimated: true,
      method: COST_METHOD,
      idleMinutes: config.idleMinutes,
    },
    inventory: {
      fingerprint: inventory.fingerprint,
      hasChangedSinceLastRun: hasChanged,
      changes: diffInventories(previous, inventory),
      pieces: inventory.pieces.map(compactPiece),
      notes: inventory.notes,
    },
    usage,
    signals,
    suggestions: countBy(suggestions.map((suggestion) => suggestion.status)),
    dataDir: context.store.root,
  };
  await context.store.writeJson(LAST_ANALYSIS_FILE, analysis);
  return compactAnalysis(analysis, options);
}

/** Fewer signals and less evidence, to keep the agent's context small. */
function compactAnalysis(analysis: Analysis, options: AnalyzeOptions): CompactAnalysis {
  const maxSignals = options.maxSignals ?? DEFAULT_MAX_SIGNALS;
  const maxEvidence = options.maxEvidence ?? DEFAULT_MAX_EVIDENCE;
  return {
    ...analysis,
    usage: analysis.usage.slice(0, MAX_USAGE_ENTRIES),
    signals: analysis.signals.slice(0, maxSignals).map((signal) => ({
      ...signal,
      evidence: signal.evidence.slice(0, maxEvidence),
    })),
    omittedSignals: Math.max(0, analysis.signals.length - maxSignals),
    hint: "Full result in .imh/last-analysis.json. Use `imh evidence <signal-id>` for all evidence of one signal.",
  };
}

function touchesAnyPiece(signal: Signal, pieces: string[]): boolean {
  return signal.pieces.some((signalPiece) =>
    pieces.some((piece) => signalPiece === piece || signalPiece.startsWith(`${piece} `)),
  );
}

/** A signal with a suggestion (in any status) is never suggested again. */
function markHandledSignals(signals: Signal[], suggestions: Suggestion[]): void {
  const signalIdToSuggestion = new Map<string, Suggestion>();
  for (const suggestion of suggestions) {
    for (const signalId of suggestion.signals) {
      signalIdToSuggestion.set(signalId, suggestion);
    }
  }
  for (const signal of signals) {
    const suggestion = signalIdToSuggestion.get(signal.id);
    if (suggestion) {
      signal.handledBy = {
        suggestionId: suggestion.id,
        status: suggestion.status,
      };
    }
  }
}

/** Where the harness already mentions a failing command or the one that worked instead. */
async function addInstructionMentions(signals: Signal[], inventory: Inventory): Promise<void> {
  const failedCommandSignals = signals
    .filter((signal) => signal.type === "failed_command")
    .slice(0, MAX_FAILED_COMMANDS_TO_SEARCH);
  for (const signal of failedCommandSignals) {
    const failedCommand = signal.id.slice("failed_command:".length);
    const workingCommands = (signal.details.recoveredWith ?? []).map((recovery) => recovery.value);
    const mentions = await findMentions(inventory, [failedCommand, ...workingCommands]);
    if (mentions.length) {
      signal.details.mentions = mentions;
    }
  }
}

function sessionTotals(sessions: SessionFacts[], prices: PriceTable): CostSummary & { subagentActiveMinutes: number } {
  let usage = ZERO_USAGE;
  let usd = 0;
  let mainActiveMs = 0;
  let subagentActiveMs = 0;
  for (const session of sessions) {
    mainActiveMs += session.activeMs;
    subagentActiveMs += session.threads
      .filter((thread) => thread.thread.id !== MAIN_THREAD_ID)
      .reduce((total, thread) => total + thread.activeMs, 0);
    for (const message of session.messages) {
      usage = addUsage(usage, message.usage);
      usd += usageCostUsd(message.usage, message.model, prices);
    }
  }
  return {
    activeMinutes: msToMinutes(mainActiveMs),
    subagentActiveMinutes: msToMinutes(subagentActiveMs),
    tokens: totalTokens(usage),
    usd: round(usd),
  };
}

function sumSignalCosts(allSignals: Signal[], types: Set<SignalType>): CostSummary {
  const signals = allSignals.filter((signal) => types.has(signal.type));
  return {
    activeMinutes: round(signals.reduce((total, signal) => total + signal.cost.activeMinutes, 0), 1),
    tokens: signals.reduce((total, signal) => total + signal.cost.tokens, 0),
    usd: round(signals.reduce((total, signal) => total + signal.cost.usd, 0)),
  };
}
