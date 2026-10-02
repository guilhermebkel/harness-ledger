// Deterministic pattern extraction (ADR 0002). Every number comes from the transcripts;
// the skill turns these signals into classified findings.

import type { HarnessPiece, Inventory, PieceKind } from "@/Shared/Protocols/HarnessProtocol.js";
import type { EvidenceRef, SessionFacts } from "@/Shared/Protocols/SessionProtocol.js";
import type {
  CountedDetail,
  CountedValue,
  Occurrence,
  OccurrenceGroup,
  PieceChange,
  Signal,
  SignalCost,
  SignalDetails,
  SignalOptions,
  SignalType,
} from "@/Shared/Protocols/SignalProtocol.js";
import { CollectionUtil } from "@/Shared/Utils/CollectionUtil.js";
import { NumberUtil } from "@/Shared/Utils/NumberUtil.js";
import { SessionUtil } from "@/Shared/Utils/SessionUtil.js";
import { TimeUtil } from "@/Shared/Utils/TimeUtil.js";
import { TokenUsageUtil } from "@/Shared/Utils/TokenUsageUtil.js";
import { AttributionService } from "./AttributionService.js";
import { CostService } from "./CostService.js";
import { OccurrenceCollectorService } from "./OccurrenceCollectorService.js";
import { SignalDetectorService } from "./SignalDetectorService.js";

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

interface PieceSignalFields {
  type: SignalType;
  title: string;
  sessions: number;
  partialReasons: string[];
  details: SignalDetails;
}

export class SignalService {
  /** When a group of occurrences is strong enough to report. Piece signals (unused, large) are built separately. */
  private static readonly SIGNAL_TYPE_TO_THRESHOLD: Record<SignalType, ThresholdCheck> = {
    failed_command: (occurrences, sessions, options) =>
      occurrences >= options.thresholds.minFailures || sessions >= options.thresholds.minFailureSessions,
    tool_error: (occurrences, sessions, options) =>
      occurrences >= options.thresholds.minFailures || sessions >= options.thresholds.minFailureSessions,
    permission_denied: (occurrences, _sessions, options) => occurrences >= options.thresholds.minRepeatedEvents,
    hook_blocked: (occurrences, _sessions, options) => occurrences >= options.thresholds.minRepeatedEvents,
    api_error: (occurrences, _sessions, options) => occurrences >= options.thresholds.minRepeatedEvents,
    user_correction: (occurrences, _sessions, options) => occurrences >= options.thresholds.minRepeatedEvents,
    interruption: (occurrences, _sessions, options) => occurrences >= options.thresholds.minRepeatedEvents,
    repeated_read: (occurrences, _sessions, options) => occurrences >= options.thresholds.minExtraReads,
    subagent_reread: (occurrences, _sessions, options) => occurrences >= options.thresholds.minSubagentRereads,
    repeated_request: (_occurrences, sessions, options) => sessions >= options.thresholds.minRepeatedRequestSessions,
    unused_piece: () => true,
    large_piece: () => true,
  };

  private readonly costService: CostService;

  constructor(private readonly options: SignalOptions) {
    this.costService = new CostService(options.prices);
  }

  extract(sessions: SessionFacts[], inventory?: Inventory): Signal[] {
    const pieceIds = new Set(inventory?.pieces.map((piece) => piece.id) ?? []);
    const attribution = new AttributionService(pieceIds);
    const collector = new OccurrenceCollectorService();
    const detector = new SignalDetectorService(this.options, attribution, collector);
    for (const session of sessions) {
      detector.detectInSession(session, attribution.buildSessionIndex(session));
    }
    detector.detectRepeatedRequests(sessions);

    const signals = collector
      .groups()
      .filter((group) => this.isStrongEnough(group))
      .map((group) => this.buildSignal(group));
    if (inventory) {
      signals.push(...this.unusedPieceSignals(sessions, inventory), ...this.largePieceSignals(inventory));
      this.markPiecesChangedAfterEvidence(signals, inventory);
    }
    for (const signal of signals) {
      signal.score = this.scoreOf(signal);
    }
    return signals.sort((left, right) => right.score - left.score);
  }

  private isStrongEnough(group: OccurrenceGroup): boolean {
    const sessionCount = new Set(group.occurrences.map((occurrence) => occurrence.session.sessionId)).size;
    return SignalService.SIGNAL_TYPE_TO_THRESHOLD[group.type](group.occurrences.length, sessionCount, this.options);
  }

  private buildSignal(group: OccurrenceGroup): Signal {
    const occurrences = [...group.occurrences].sort((left, right) =>
      (left.ref.occurredAt ?? "").localeCompare(right.ref.occurredAt ?? ""),
    );
    const sessionCount = new Set(occurrences.map((occurrence) => occurrence.session.sessionId)).size;
    const pieces = CollectionUtil.unique(occurrences.flatMap((occurrence) => occurrence.pieces));
    const partialReasons: string[] = [];
    if (pieces.includes(AttributionService.UNRESOLVED_SUBAGENT_PIECE)) {
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
      cost: this.costOf(occurrences),
      details: {
        ...group.details,
        ...this.topCountedValues(group),
      },
      evidence: this.spreadEvidence(occurrences),
      evidenceTotal: occurrences.length,
      firstSeenAt: occurrences[0]?.ref.occurredAt,
      lastSeenAt: occurrences.at(-1)?.ref.occurredAt,
      score: 0,
    };
  }

  private costOf(occurrences: Occurrence[]): SignalCost {
    const usage = occurrences.reduce(
      (total, occurrence) => TokenUsageUtil.add(total, occurrence.usage),
      TokenUsageUtil.zero(),
    );
    const usd = occurrences.reduce(
      (total, occurrence) => total + this.costService.costUsd(occurrence.usage, occurrence.model),
      0,
    );
    const activeMs = occurrences.reduce((total, occurrence) => total + occurrence.activeMs, 0);
    return {
      activeMinutes: TimeUtil.msToMinutes(activeMs),
      tokens: TokenUsageUtil.total(usage),
      usd: NumberUtil.round(usd),
      isEstimated: true,
    };
  }

  private topCountedValues(group: OccurrenceGroup): Pick<SignalDetails, CountedDetail> {
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

  private scoreOf(signal: Signal): number {
    const countedOccurrences = Math.min(signal.occurrences, SCORE_WEIGHTS.maxCountedOccurrences);
    const score = signal.cost.activeMinutes * SCORE_WEIGHTS.perActiveMinute
      + signal.cost.usd * SCORE_WEIGHTS.perUsd
      + signal.sessions * SCORE_WEIGHTS.perSession
      + countedOccurrences * SCORE_WEIGHTS.perOccurrence
      - (signal.isPartial ? SCORE_WEIGHTS.partialPenalty : 0);
    return NumberUtil.round(score);
  }

  /** Pieces nobody used during the period. Needs enough sessions for absence to mean something. */
  private unusedPieceSignals(sessions: SessionFacts[], inventory: Inventory): Signal[] {
    if (sessions.length < this.options.minSessionsForUnused) {
      return [];
    }
    const usedPieceIds = this.usedPieceIdsIn(sessions);
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
      return this.pieceSignal(piece, {
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

  private usedPieceIdsIn(sessions: SessionFacts[]): Set<string> {
    const usedPieceIds = new Set<string>();
    for (const session of sessions) {
      for (const call of session.tools) {
        if (call.subagentType) {
          usedPieceIds.add(`agent:${call.subagentType}`);
        }
        if (call.skill) {
          usedPieceIds.add(`skill:${call.skill}`);
        }
        if (call.category === "mcp") {
          usedPieceIds.add(call.key);
        }
      }
      for (const threadFacts of session.threads.filter((thread) => !SessionUtil.isMainThread(thread.thread))) {
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
  private largePieceSignals(inventory: Inventory): Signal[] {
    return inventory.pieces
      .filter((piece) => piece.isEditable && SIZE_KINDS.has(piece.kind))
      .filter((piece) => piece.approxTokens >= this.options.largePieceTokens)
      .map((piece) =>
        this.pieceSignal(piece, {
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

  private pieceSignal(piece: HarnessPiece, fields: PieceSignalFields): Signal {
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
  private markPiecesChangedAfterEvidence(signals: Signal[], inventory: Inventory): void {
    const pieceIdToPiece = new Map(inventory.pieces.map((piece) => [piece.id, piece]));
    for (const signal of signals) {
      const lastSeenAtMs = signal.lastSeenAt === undefined ? undefined : Date.parse(signal.lastSeenAt);
      if (lastSeenAtMs === undefined) {
        continue;
      }
      const changedPieces = signal.pieces.flatMap((pieceId): PieceChange[] => {
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
  private spreadEvidence(sortedOccurrences: Occurrence[]): EvidenceRef[] {
    const maxEvidence = this.options.maxEvidence;
    const sessionIdToOccurrences = new Map<string, Occurrence[]>();
    for (const occurrence of sortedOccurrences) {
      CollectionUtil.pushTo(sessionIdToOccurrences, occurrence.session.sessionId, occurrence);
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
}
