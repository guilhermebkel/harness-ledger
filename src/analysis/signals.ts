// Deterministic pattern extraction (ADR 0002). Every number comes from the transcripts;
// the skill turns these signals into classified findings.

import { msToMinutes } from "../core/time.js";
import {
  MAIN_THREAD_ID,
  type EvidenceRef,
  type HarnessPiece,
  type Inventory,
  type PieceKind,
  type SessionFacts,
} from "../core/types.js";
import { round, unique } from "../core/util.js";
import { buildSessionIndex, UNRESOLVED_SUBAGENT_PIECE } from "./attribution.js";
import { addUsage, totalTokens, usageCostUsd, ZERO_USAGE } from "./cost.js";
import {
  detectCorrectionsAndInterruptions,
  detectRepeatedReads,
  detectRepeatedRequests,
  detectSubagentRereads,
  detectToolFailures,
} from "./detectors.js";
import {
  OccurrenceCollector,
  type CountedDetail,
  type CountedValue,
  type Occurrence,
  type OccurrenceGroup,
  type Signal,
  type SignalCost,
  type SignalDetails,
  type SignalOptions,
  type SignalType,
} from "./signal-model.js";

export type { Signal, SignalOptions, SignalType } from "./signal-model.js";

const MAX_COUNTED_VALUES = 5;
/** Evidence from fewer sessions than this is marked partial (re-reads within one session are still meaningful). */
const MIN_SESSIONS_FOR_FULL_EVIDENCE = 2;
const SELF_SKILL_NAME = /(^|:)improve-my-harness$/;
const USAGE_KINDS = new Set<PieceKind>(["skill", "agent", "command", "mcp"]);
const SIZE_KINDS = new Set<PieceKind>(["instructions", "skill", "agent"]);

/** Ranking weights: estimated waste first, then how widespread the pattern is; partial evidence ranks lower. */
const SCORE_WEIGHTS = {
  perActiveMinute: 1,
  perUsd: 2,
  perSession: 2,
  perOccurrence: 0.3,
  maxCountedOccurrences: 30,
  partialPenalty: 2,
};

type ThresholdCheck = (occurrences: number, sessions: number, options: SignalOptions) => boolean;

/** When a group of occurrences is strong enough to report. Piece signals (unused, large) are built separately. */
const SIGNAL_TYPE_TO_THRESHOLD: Record<SignalType, ThresholdCheck> = {
  failed_command: (occurrences, sessions, options) =>
    occurrences >= options.thresholds.minFailures || sessions >= options.thresholds.minFailureSessions,
  tool_error: (occurrences, sessions, options) =>
    occurrences >= options.thresholds.minFailures || sessions >= options.thresholds.minFailureSessions,
  permission_denied: (occurrences, _sessions, options) => occurrences >= options.thresholds.minRepeatedEvents,
  hook_blocked: (occurrences, _sessions, options) => occurrences >= options.thresholds.minRepeatedEvents,
  user_correction: (occurrences, _sessions, options) => occurrences >= options.thresholds.minRepeatedEvents,
  interruption: (occurrences, _sessions, options) => occurrences >= options.thresholds.minRepeatedEvents,
  repeated_read: (occurrences, _sessions, options) => occurrences >= options.thresholds.minExtraReads,
  subagent_reread: (occurrences, _sessions, options) => occurrences >= options.thresholds.minSubagentRereads,
  repeated_request: (_occurrences, sessions, options) => sessions >= options.thresholds.minRepeatedRequestSessions,
  unused_piece: () => true,
  large_piece: () => true,
};

export function extractSignals(
  sessions: SessionFacts[],
  inventory: Inventory | undefined,
  options: SignalOptions,
): Signal[] {
  const pieceIds = new Set(inventory?.pieces.map((piece) => piece.id) ?? []);
  const collector = new OccurrenceCollector();
  for (const session of sessions) {
    const context = {
      session,
      index: buildSessionIndex(session, pieceIds),
      pieceIds,
      options,
      collector,
    };
    detectToolFailures(context);
    detectRepeatedReads(context);
    detectSubagentRereads(context);
    detectCorrectionsAndInterruptions(context);
  }
  detectRepeatedRequests(sessions, options, collector);

  const signals = collector
    .groups()
    .filter((group) => {
      const sessionCount = new Set(group.occurrences.map((occurrence) => occurrence.session.sessionId)).size;
      return SIGNAL_TYPE_TO_THRESHOLD[group.type](group.occurrences.length, sessionCount, options);
    })
    .map((group) => buildSignal(group, options));
  if (inventory) {
    signals.push(...unusedPieceSignals(sessions, inventory, options), ...largePieceSignals(inventory, options));
    markPiecesChangedAfterEvidence(signals, inventory);
  }
  for (const signal of signals) {
    signal.score = scoreOf(signal);
  }
  return signals.sort((left, right) => right.score - left.score);
}

function buildSignal(group: OccurrenceGroup, options: SignalOptions): Signal {
  const occurrences = [...group.occurrences].sort((left, right) =>
    (left.ref.occurredAt ?? "").localeCompare(right.ref.occurredAt ?? ""),
  );
  const sessionCount = new Set(occurrences.map((occurrence) => occurrence.session.sessionId)).size;
  const pieces = unique(occurrences.flatMap((occurrence) => occurrence.pieces));
  const partialReasons: string[] = [];
  if (pieces.includes(UNRESOLVED_SUBAGENT_PIECE)) {
    partialReasons.push("subagent type could not be resolved for some steps");
  }
  const isSingleSession = sessionCount < MIN_SESSIONS_FOR_FULL_EVIDENCE && group.type !== "repeated_read";
  if (isSingleSession) {
    partialReasons.push("seen in a single session");
  }
  return {
    id: group.id,
    type: group.type,
    title: group.title,
    pieces,
    occurrences: occurrences.length,
    sessions: sessionCount,
    isPartial: partialReasons.length > 0,
    partialReasons,
    cost: costOf(occurrences, options),
    details: {
      ...group.details,
      ...topCountedValues(group),
    },
    evidence: spreadEvidence(occurrences, options.maxEvidence),
    evidenceTotal: occurrences.length,
    firstSeenAt: occurrences[0]?.ref.occurredAt,
    lastSeenAt: occurrences.at(-1)?.ref.occurredAt,
    score: 0,
  };
}

function costOf(occurrences: Occurrence[], options: SignalOptions): SignalCost {
  const usage = occurrences.reduce((total, occurrence) => addUsage(total, occurrence.usage), ZERO_USAGE);
  const usd = occurrences.reduce(
    (total, occurrence) => total + usageCostUsd(occurrence.usage, occurrence.model, options.prices),
    0,
  );
  const activeMs = occurrences.reduce((total, occurrence) => total + occurrence.activeMs, 0);
  return {
    activeMinutes: msToMinutes(activeMs),
    tokens: totalTokens(usage),
    usd: round(usd),
    isEstimated: true,
  };
}

function topCountedValues(group: OccurrenceGroup): Pick<SignalDetails, CountedDetail> {
  const countedDetails: Pick<SignalDetails, CountedDetail> = {};
  for (const [detail, valueToCount] of Object.entries(group.counters) as [CountedDetail, Map<string, number>][]) {
    const countedValues: CountedValue[] = [...valueToCount.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, MAX_COUNTED_VALUES)
      .map(([value, count]) => ({
        value,
        count,
      }));
    countedDetails[detail] = countedValues;
  }
  return countedDetails;
}

function scoreOf(signal: Signal): number {
  const countedOccurrences = Math.min(signal.occurrences, SCORE_WEIGHTS.maxCountedOccurrences);
  const score = signal.cost.activeMinutes * SCORE_WEIGHTS.perActiveMinute
    + signal.cost.usd * SCORE_WEIGHTS.perUsd
    + signal.sessions * SCORE_WEIGHTS.perSession
    + countedOccurrences * SCORE_WEIGHTS.perOccurrence
    - (signal.isPartial ? SCORE_WEIGHTS.partialPenalty : 0);
  return round(score);
}

/** Pieces nobody used during the period. Needs enough sessions for absence to mean something. */
function unusedPieceSignals(sessions: SessionFacts[], inventory: Inventory, options: SignalOptions): Signal[] {
  if (sessions.length < options.minSessionsForUnused) {
    return [];
  }
  const usedPieceIds = usedPieceIdsIn(sessions);
  const periodStartAtMs = Math.min(...sessions.map((session) => session.startedAtMs ?? Date.now()));
  const unusedPieces = inventory.pieces.filter((piece) => {
    const isTrackedKind = USAGE_KINDS.has(piece.kind);
    const isThisTool = piece.kind === "skill" && SELF_SKILL_NAME.test(piece.name);
    return isTrackedKind && !isThisTool && !usedPieceIds.has(piece.id);
  });
  return unusedPieces.map((piece) => {
    const wasChangedDuringPeriod = piece.modifiedAt !== undefined && Date.parse(piece.modifiedAt) > periodStartAtMs;
    const partialReasons = [
      ...(wasChangedDuringPeriod ? ["piece was added or changed during the analyzed period"] : []),
      ...(piece.isEditable ? [] : ["piece comes from a plugin"]),
    ];
    return pieceSignal(piece, {
      type: "unused_piece",
      title: `Not used in ${sessions.length} sessions: ${piece.id}`,
      sessions: sessions.length,
      partialReasons,
      details: {
        scope: piece.scope,
        path: piece.path,
        approxTokens: piece.approxTokens,
        description: piece.description,
      },
    });
  });
}

function usedPieceIdsIn(sessions: SessionFacts[]): Set<string> {
  const usedPieceIds = new Set<string>();
  for (const session of sessions) {
    for (const call of session.tools) {
      if (call.subagentType) {
        usedPieceIds.add(`agent:${call.subagentType}`);
      }
      if (call.skill) {
        usedPieceIds.add(`skill:${call.skill}`);
      }
      if (call.key.startsWith("mcp:")) {
        usedPieceIds.add(call.key);
      }
    }
    for (const threadFacts of session.threads.filter((thread) => thread.thread.id !== MAIN_THREAD_ID)) {
      usedPieceIds.add(`agent:${threadFacts.thread.agentType}`);
    }
    for (const command of session.prompts.map((prompt) => prompt.command).filter((name) => name !== undefined)) {
      usedPieceIds.add(`skill:${command}`);
      usedPieceIds.add(`command:${command}`);
    }
  }
  return usedPieceIds;
}

/** Editable pieces large enough to be worth trimming; instructions are loaded on every turn. */
function largePieceSignals(inventory: Inventory, options: SignalOptions): Signal[] {
  return inventory.pieces
    .filter((piece) => piece.isEditable && SIZE_KINDS.has(piece.kind) && piece.approxTokens >= options.largePieceTokens)
    .map((piece) =>
      pieceSignal(piece, {
        type: "large_piece",
        title: `${piece.id} is large (~${piece.approxTokens} tokens)`,
        sessions: 0,
        partialReasons: [],
        details: {
          path: piece.path,
          approxTokens: piece.approxTokens,
          isLoadedEveryTurn: piece.kind === "instructions",
        },
      }),
    );
}

interface PieceSignalFields {
  type: SignalType;
  title: string;
  sessions: number;
  partialReasons: string[];
  details: SignalDetails;
}

function pieceSignal(piece: HarnessPiece, fields: PieceSignalFields): Signal {
  return {
    ...fields,
    id: `${fields.type}:${piece.id}`,
    pieces: [piece.id],
    occurrences: 0,
    isPartial: fields.partialReasons.length > 0,
    cost: {
      activeMinutes: 0,
      tokens: 0,
      usd: 0,
      isEstimated: true,
    },
    evidence: [],
    evidenceTotal: 0,
    score: 0,
  };
}

/** A piece changed after the newest evidence may already be fixed: mark the signal partial. */
function markPiecesChangedAfterEvidence(signals: Signal[], inventory: Inventory): void {
  const pieceIdToPiece = new Map(inventory.pieces.map((piece) => [piece.id, piece]));
  for (const signal of signals) {
    const lastSeenAtMs = signal.lastSeenAt === undefined ? undefined : Date.parse(signal.lastSeenAt);
    if (lastSeenAtMs === undefined) {
      continue;
    }
    const changedPieces = signal.pieces.flatMap((pieceId) => {
      const modifiedAt = pieceIdToPiece.get(pieceId)?.modifiedAt;
      const wasChangedAfter = modifiedAt !== undefined && Date.parse(modifiedAt) > lastSeenAtMs;
      return wasChangedAfter
        ? [{
            piece: pieceId,
            modifiedAt,
          }]
        : [];
    });
    if (changedPieces.length) {
      signal.changedAfterEvidence = changedPieces;
      signal.isPartial = true;
      signal.partialReasons.push("piece changed after this evidence");
    }
  }
}

/** Evidence picked round-robin across sessions, so it shows the spread instead of the first N. */
function spreadEvidence(sortedOccurrences: Occurrence[], maxEvidence: number): EvidenceRef[] {
  const sessionIdToOccurrences = new Map<string, Occurrence[]>();
  for (const occurrence of sortedOccurrences) {
    const sessionOccurrences = sessionIdToOccurrences.get(occurrence.session.sessionId) ?? [];
    sessionOccurrences.push(occurrence);
    sessionIdToOccurrences.set(occurrence.session.sessionId, sessionOccurrences);
  }
  const evidence: EvidenceRef[] = [];
  for (let roundIndex = 0; evidence.length < maxEvidence; roundIndex++) {
    const roundEvidence = [...sessionIdToOccurrences.values()]
      .map((sessionOccurrences) => sessionOccurrences[roundIndex]?.ref)
      .filter((ref) => ref !== undefined);
    if (!roundEvidence.length) {
      break;
    }
    evidence.push(...roundEvidence.slice(0, maxEvidence - evidence.length));
  }
  return evidence;
}
