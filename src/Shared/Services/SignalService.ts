import type { SessionIndex } from "@/Shared/Protocols/AnalysisProtocol.js";
import type { SignalThresholds } from "@/Shared/Protocols/ConfigProtocol.js";
import type { HarnessPiece, Inventory, PieceKind } from "@/Shared/Protocols/HarnessProtocol.js";
import type { AssistantMessage, SessionFacts, TokenUsage, ToolCall } from "@/Shared/Protocols/SessionProtocol.js";
import type {
  CostFigures,
  CountedDetail,
  CountedValue,
  Occurrence,
  OccurrenceCost,
  OccurrenceGroup,
  PieceChange,
  Signal,
  SignalCost,
  SignalDetails,
  SignalEvidence,
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
import { WorkflowDetectorService } from "./WorkflowDetectorService.js";
import { ContextLoadDetectorService } from "./ContextLoadDetectorService.js";

const MAX_COUNTED_VALUES = 5;
const OCCURRENCE_USD_DIGITS = 6;
// Why: evidence from fewer sessions is partial; re-reads within one session are still meaningful.
const MIN_SESSIONS_FOR_FULL_EVIDENCE = 2;
const SELF_SKILL_NAME = /(^|:)improve-my-harness$/;
const USAGE_KINDS = new Set<PieceKind>(["skill", "agent", "command", "mcp"]);
const SIZE_KINDS = new Set<PieceKind>(["instructions", "skill", "agent"]);

// Why: estimated waste ranks first, then how widespread the pattern is; partial evidence ranks lower.
const SCORE_WEIGHTS = {
  perActiveMinute: 1,
  perUsd: 2,
  perSession: 2,
  perOccurrence: 0.3,
  maxCountedOccurrences: 30,
  partialPenalty: 2,
};

// Why: a group is reported when it reaches either threshold; "always" groups were already filtered by their detector.
type SignalThreshold = "always" | {
  minOccurrences?: keyof SignalThresholds;
  minSessions?: keyof SignalThresholds;
};

type CarrierFinder = (piece: HarnessPiece, session: SessionFacts) => AssistantMessage[];

interface PieceSignalFields {
  type: SignalType;
  title: string;
  sessions: number;
  partialReasons: string[];
  details: SignalDetails;
  usage?: TokenUsage;
}

const FAILURE_CHAIN_METHOD: Pick<SignalCost, "bound" | "method"> = {
  bound: "estimate",
  method: "Each chain of failed attempts, from the first failure until a call doing the same job worked: every message "
    + "in between, idle gaps left out, shared by the chain's failures. `fixLoop` is the part spent rerunning the same "
    + "command after fixes.",
};
const REREAD_METHOD: Pick<SignalCost, "bound" | "method"> = {
  bound: "lower",
  method: "The re-read's duration and its content as input, once; the content also stays in context afterwards.",
};
const NO_COST_METHOD: Pick<SignalCost, "bound" | "method"> = {
  bound: "estimate",
  method: "No cost: there is no clear counterfactual to price.",
};
const SIGNAL_TYPE_TO_COST_METHOD: Record<SignalType, Pick<SignalCost, "bound" | "method">> = {
  failed_command: FAILURE_CHAIN_METHOD,
  tool_error: FAILURE_CHAIN_METHOD,
  permission_denied: FAILURE_CHAIN_METHOD,
  hook_blocked: FAILURE_CHAIN_METHOD,
  api_error: {
    bound: "estimate",
    method: "The wait from the failed request until the thread got a real answer (retries and fallbacks).",
  },
  context_compaction: {
    bound: "lower",
    method: "Re-reads after the compaction of files the thread had read before it.",
  },
  repeated_workflow: {
    bound: "estimate",
    method: "Each run's window, from the first step to the last: every message around the steps, minus the steps' own "
      + "runs and the one call a script would still need.",
  },
  context_heavy: {
    bound: "estimate",
    method: "Each load's tokens, plus their carry: re-sent as cached input on every later message of the thread until "
      + "a compaction.",
  },
  repeated_read: REREAD_METHOD,
  subagent_reread: REREAD_METHOD,
  repeated_request: NO_COST_METHOD,
  user_correction: {
    bound: "upper",
    method: "The whole turn before the correction (all threads), or the turn that built a rejected plan, minus failure "
      + "chains already counted.",
  },
  interruption: {
    bound: "upper",
    method: "The whole turn before the interruption (all threads), minus failure chains already counted.",
  },
  unused_piece: NO_COST_METHOD,
  large_piece: {
    bound: "estimate",
    method: "The piece's size, as cached input, times the messages that carried it: every message for instructions, "
      + "the agent's messages for an agent, the messages after its first use in a thread for a skill.",
  },
};

export class SignalService {
  private static readonly SIGNAL_TYPE_TO_THRESHOLD: Record<SignalType, SignalThreshold> = {
    failed_command: { minOccurrences: "minFailures", minSessions: "minFailureSessions" },
    tool_error: { minOccurrences: "minFailures", minSessions: "minFailureSessions" },
    permission_denied: { minOccurrences: "minRepeatedEvents" },
    hook_blocked: { minOccurrences: "minRepeatedEvents" },
    api_error: { minOccurrences: "minRepeatedEvents" },
    context_compaction: { minOccurrences: "minRepeatedEvents" },
    context_heavy: "always",
    repeated_workflow: { minOccurrences: "minWorkflowRuns", minSessions: "minWorkflowSessions" },
    user_correction: { minOccurrences: "minRepeatedEvents" },
    interruption: { minOccurrences: "minRepeatedEvents" },
    repeated_read: { minOccurrences: "minExtraReads" },
    subagent_reread: { minOccurrences: "minSubagentRereads" },
    repeated_request: { minSessions: "minRepeatedRequestSessions" },
    unused_piece: "always",
    large_piece: "always",
  };

  // Why: what a piece adds to the context stays there: instructions in every message, an agent's prompt in its
  // thread, a skill or command from its first use on.
  private static readonly afterFirstUse: CarrierFinder = (piece, session) =>
    SignalService.messagesAfterFirstUse(piece, session);

  private static readonly PIECE_KIND_TO_CARRIERS: Record<PieceKind, CarrierFinder> = {
    instructions: (_piece, session) => session.messages,
    agent: (piece, session) => session.messages.filter((message) => message.thread.agentType === piece.name),
    skill: SignalService.afterFirstUse,
    command: SignalService.afterFirstUse,
    hook: SignalService.afterFirstUse,
    mcp: SignalService.afterFirstUse,
    plugin: SignalService.afterFirstUse,
    settings: SignalService.afterFirstUse,
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
    const sessionIdToIndex = new Map<string, SessionIndex>();
    for (const session of sessions) {
      const index = attribution.buildSessionIndex(session);
      sessionIdToIndex.set(session.sessionId, index);
      detector.detectInSession(session, index);
    }
    detector.detectRepeatedRequests(sessions);
    new WorkflowDetectorService(this.options, collector).detect(sessions, sessionIdToIndex);
    new ContextLoadDetectorService(this.options, collector).detect(sessions, sessionIdToIndex);

    const signals = collector
      .groups()
      .filter((group) => this.isStrongEnough(group))
      .map((group) => this.buildSignal(group));
    if (inventory) {
      signals.push(...this.unusedPieceSignals(sessions, inventory), ...this.largePieceSignals(sessions, inventory));
      this.markPiecesChangedAfterEvidence(signals, inventory);
    }
    for (const signal of signals) {
      signal.score = this.scoreOf(signal);
    }
    return signals.sort((left, right) => right.score - left.score);
  }

  private isStrongEnough(group: OccurrenceGroup): boolean {
    const sessionCount = new Set(group.occurrences.map((occurrence) => occurrence.session.sessionId)).size;
    const threshold = SignalService.SIGNAL_TYPE_TO_THRESHOLD[group.type];
    if (threshold === "always") {
      return true;
    }
    const thresholds = this.options.thresholds;
    const hasEnoughOccurrences = threshold.minOccurrences !== undefined
      && group.occurrences.length >= thresholds[threshold.minOccurrences];
    const hasEnoughSessions = threshold.minSessions !== undefined && sessionCount >= thresholds[threshold.minSessions];
    return hasEnoughOccurrences || hasEnoughSessions;
  }

  private buildSignal(group: OccurrenceGroup): Signal {
    const occurrences = group.occurrences.toSorted((left, right) =>
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
      pieces,
      partialReasons,
      id: group.id,
      type: group.type,
      title: group.title,
      occurrences: occurrences.length,
      sessions: sessionCount,
      isPartial: partialReasons.length > 0,
      cost: this.costOf(group.type, occurrences),
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

  private costOf(type: SignalType, occurrences: Occurrence[]): SignalCost {
    const fixLoopOccurrences = occurrences.filter((occurrence) => occurrence.isFixLoop === true);
    return {
      ...this.figuresOf(occurrences),
      ...SIGNAL_TYPE_TO_COST_METHOD[type],
      ...(fixLoopOccurrences.length ? { fixLoop: this.figuresOf(fixLoopOccurrences) } : {}),
      isEstimated: true,
    };
  }

  private figuresOf(occurrences: Pick<Occurrence, "activeMs" | "usage" | "model">[]): CostFigures {
    const usage = TokenUsageUtil.sum(occurrences.map((occurrence) => occurrence.usage));
    const usd = occurrences.reduce(
      (total, occurrence) => total + this.costService.costUsd(occurrence.usage, occurrence.model),
      0,
    );
    const activeMs = occurrences.reduce((total, occurrence) => total + occurrence.activeMs, 0);
    return {
      activeMinutes: TimeUtil.msToMinutes(activeMs),
      tokens: TokenUsageUtil.total(usage),
      inputTokens: TokenUsageUtil.input(usage),
      outputTokens: usage.output,
      usd: NumberUtil.round(usd),
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

  // Why: needs enough sessions for absence to mean something.
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
        partialReasons,
        type: "unused_piece",
        title: `Not used in ${sessions.length} sessions: ${piece.id}`,
        sessions: sessions.length,
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
      for (const pieceId of session.tools.flatMap((call) => this.piecesCalledBy(call))) {
        usedPieceIds.add(pieceId);
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

  private piecesCalledBy(call: ToolCall): string[] {
    return [
      ...(call.subagentType ? [`agent:${call.subagentType}`] : []),
      ...(call.skill ? [`skill:${call.skill}`] : []),
      ...(call.category === "mcp" ? [call.key] : []),
    ];
  }

  // Why: instructions are loaded on every turn, so their size costs every time.
  private largePieceSignals(sessions: SessionFacts[], inventory: Inventory): Signal[] {
    return inventory.pieces
      .filter((piece) => piece.isEditable && SIZE_KINDS.has(piece.kind))
      .filter((piece) => piece.approxTokens >= this.options.largePieceTokens)
      .map((piece) => {
        const carriers = sessions.flatMap((session) => this.messagesCarrying(piece, session));
        return this.pieceSignal(piece, {
          type: "large_piece",
          title: `${piece.id} is large (~${piece.approxTokens} tokens)`,
          sessions: new Set(carriers.map((message) => message.ref.sessionId)).size,
          partialReasons: [],
          details: {
            path: piece.path,
            approxTokens: piece.approxTokens,
            isLoadedEveryTurn: piece.kind === "instructions",
          },
          usage: {
            ...TokenUsageUtil.zero(),
            cacheRead: piece.approxTokens * carriers.length,
          },
        });
      });
  }

  private messagesCarrying(piece: HarnessPiece, session: SessionFacts): AssistantMessage[] {
    return SignalService.PIECE_KIND_TO_CARRIERS[piece.kind](piece, session);
  }

  private static messagesAfterFirstUse(piece: HarnessPiece, session: SessionFacts): AssistantMessage[] {
    const threadIdToFirstUseAtMs = new Map<string, number>();
    for (const call of session.tools.filter((toolCall) => toolCall.skill === piece.name)) {
      const earlierUseAtMs = threadIdToFirstUseAtMs.get(call.thread.id) ?? Infinity;
      threadIdToFirstUseAtMs.set(call.thread.id, Math.min(earlierUseAtMs, call.calledAtMs ?? Infinity));
    }
    const commandAtMs = session.prompts.find((prompt) => prompt.command === piece.name)?.sentAtMs;
    if (commandAtMs !== undefined) {
      const mainFirstUseAtMs = threadIdToFirstUseAtMs.get(SessionUtil.MAIN_THREAD_ID) ?? Infinity;
      threadIdToFirstUseAtMs.set(SessionUtil.MAIN_THREAD_ID, Math.min(mainFirstUseAtMs, commandAtMs));
    }
    return session.messages.filter((message) =>
      (message.sentAtMs ?? 0) >= (threadIdToFirstUseAtMs.get(message.thread.id) ?? Infinity));
  }

  private pieceSignal(piece: HarnessPiece, { usage, ...fields }: PieceSignalFields): Signal {
    const loadedUsage = usage ?? TokenUsageUtil.zero();
    return {
      ...fields,
      id: `${fields.type}:${piece.id}`,
      pieces: [piece.id],
      occurrences: 0,
      isPartial: fields.partialReasons.length > 0,
      cost: {
        ...this.figuresOf([{ activeMs: 0, usage: loadedUsage }]),
        ...SIGNAL_TYPE_TO_COST_METHOD[fields.type],
        isEstimated: true,
      },
      evidence: [],
      evidenceTotal: 0,
      score: 0,
    };
  }

  // Why: a piece changed after the newest evidence may already be fixed, so the signal is partial.
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

  // Why: round-robin across sessions shows the spread instead of the first N.
  private spreadEvidence(sortedOccurrences: Occurrence[]): SignalEvidence[] {
    const maxEvidence = this.options.maxEvidence;
    const sessionIdToOccurrences = new Map<string, Occurrence[]>();
    for (const occurrence of sortedOccurrences) {
      CollectionUtil.pushTo(sessionIdToOccurrences, occurrence.session.sessionId, occurrence);
    }
    const sessionsOccurrences = [...sessionIdToOccurrences.values()];
    const roundCount = Math.max(0, ...sessionsOccurrences.map((sessionOccurrences) => sessionOccurrences.length));
    const evidence: SignalEvidence[] = [];
    for (let roundIndex = 0; roundIndex < roundCount && evidence.length < maxEvidence; roundIndex++) {
      const roundEvidence = sessionsOccurrences
        .map((sessionOccurrences) => sessionOccurrences[roundIndex])
        .filter((occurrence) => occurrence !== undefined)
        .map((occurrence) => ({
          ...occurrence.ref,
          cost: this.occurrenceCost(occurrence),
        }));
      evidence.push(...roundEvidence.slice(0, maxEvidence - evidence.length));
    }
    return evidence;
  }

  private occurrenceCost(occurrence: Occurrence): OccurrenceCost {
    return {
      activeMs: occurrence.activeMs,
      tokens: TokenUsageUtil.total(occurrence.usage),
      inputTokens: TokenUsageUtil.input(occurrence.usage),
      outputTokens: occurrence.usage.output,
      usd: NumberUtil.round(this.costService.costUsd(occurrence.usage, occurrence.model), OCCURRENCE_USD_DIGITS),
    };
  }
}
