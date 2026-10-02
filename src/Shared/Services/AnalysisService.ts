import type {
  Analysis,
  AnalysisTotals,
  CommonCommand,
  CompactAnalysis,
  CostSummary,
  ReportedTotals,
  SessionTotals,
  StageProfile,
} from "@/Shared/Protocols/AnalysisProtocol.js";
import type { AnalyzeOptions } from "@/Shared/Protocols/CommandProtocol.js";
import type { Inventory } from "@/Shared/Protocols/HarnessProtocol.js";
import type { SessionFacts } from "@/Shared/Protocols/SessionProtocol.js";
import type { CountedValue, Signal, SignalType } from "@/Shared/Protocols/SignalProtocol.js";
import type { Suggestion } from "@/Shared/Protocols/SuggestionProtocol.js";
import { CollectionUtil } from "@/Shared/Utils/CollectionUtil.js";
import { NormalizeUtil } from "@/Shared/Utils/NormalizeUtil.js";
import { NumberUtil } from "@/Shared/Utils/NumberUtil.js";
import { RedactUtil } from "@/Shared/Utils/RedactUtil.js";
import { SessionUtil } from "@/Shared/Utils/SessionUtil.js";
import { TimeUtil } from "@/Shared/Utils/TimeUtil.js";
import { TokenUsageUtil } from "@/Shared/Utils/TokenUsageUtil.js";
import { VersionUtil } from "@/Shared/Utils/VersionUtil.js";
import { AttributionService } from "./AttributionService.js";
import { CompareService } from "./CompareService.js";
import type { ContextService } from "./ContextService.js";
import { CostService } from "./CostService.js";
import { InventoryService } from "./InventoryService.js";
import { MentionService } from "./MentionService.js";
import { ProcessProfileService } from "./ProcessProfileService.js";
import { SignalService } from "./SignalService.js";
import { UsageService } from "./UsageService.js";

const DEFAULT_MAX_SIGNALS = 25;
const MIN_COMMON_COMMAND_RUNS = 2;
const MAX_COMMON_COMMANDS = 15;
const EMPTY_COMMAND_KEY = "(empty)";
const DEFAULT_MAX_EVIDENCE = 5;
/** Evidence kept per signal in the saved analysis, for `imh evidence`. */
const SAVED_EVIDENCE_PER_SIGNAL = 50;
const MAX_USAGE_ENTRIES = 15;
/** Searching instruction files for every failing command is slow; the top ones are enough. */
const MAX_FAILED_COMMANDS_TO_SEARCH = 15;
const FAILED_COMMAND_PREFIX = "failed_command:";
const WASTE_SIGNAL_TYPES = new Set<SignalType>([
  "failed_command",
  "tool_error",
  "permission_denied",
  "hook_blocked",
  "repeated_read",
  "subagent_reread",
  "api_error",
]);
const CORRECTION_SIGNAL_TYPES = new Set<SignalType>(["user_correction", "interruption"]);
const COST_METHOD
  = "Active time sums gaps between transcript events up to the idle threshold; subagent time is reported per agent "
    + "and not added to session time. Failure cost = time until the agent reacted + tokens of the reaction turn. "
    + "Correction cost = the corrected turn (upper bound). Categories can overlap.";

/** Maps the harness, reads the sessions and extracts signals. Saves the full result and returns a compact one. */
export class AnalysisService {
  static readonly LAST_ANALYSIS_FILE = "last-analysis.json";

  constructor(private readonly context: ContextService) {}

  async analyze(options: AnalyzeOptions): Promise<CompactAnalysis> {
    const { config, store, provider } = this.context;
    const periodStartAtMs = TimeUtil.parsePointInTime(options.since);
    const periodEndAtMs = TimeUtil.parsePointInTime(options.until);
    const inventory = await this.context.takeInventory();
    const { previous, hasChanged } = await store.saveInventory(inventory);
    const loaded = await this.context.loadSessions({
      periodStartAtMs,
      periodEndAtMs,
    });

    const focusPieces = options.focusPieces?.filter(Boolean) ?? [];
    const isFocused = focusPieces.length > 0;
    const sessions = isFocused
      ? loaded.sessions.filter((session) => focusPieces.some((piece) => CompareService.usesPiece(session, piece)))
      : loaded.sessions;
    const allSignals = new SignalService({
      idleMs: this.context.idleMs,
      prices: config.prices,
      maxEvidence: SAVED_EVIDENCE_PER_SIGNAL,
      minSessionsForUnused: config.minSessionsForUnused,
      largePieceTokens: config.largePieceTokens,
      thresholds: config.signalThresholds,
    }).extract(sessions, inventory);
    const signals = isFocused ? allSignals.filter((signal) => this.touchesAnyPiece(signal, focusPieces)) : allSignals;
    const suggestions = await store.loadSuggestions();
    this.markHandledSignals(signals, suggestions);
    await this.addInstructionMentions(signals, inventory);

    const pieceIds = new Set(inventory.pieces.map((piece) => piece.id));
    const analysis: Analysis = {
      tool: {
        name: "improve-my-harness",
        version: VersionUtil.VERSION,
      },
      generatedAt: new Date().toISOString(),
      project: this.context.projectDir,
      provider: inventory.provider,
      period: {
        since: TimeUtil.toIso(periodStartAtMs) ?? loaded.available.oldestAt,
        until: TimeUtil.toIso(periodEndAtMs) ?? new Date().toISOString(),
        focus: focusPieces,
      },
      history: {
        transcriptsAvailable: loaded.available.count,
        oldestAt: loaded.available.oldestAt,
        newestAt: loaded.available.newestAt,
        retentionDays: inventory.retention.days,
        retentionSource: inventory.retention.source,
        note: provider.retentionNote(inventory.retention.days),
      },
      analyzed: {
        sessions: sessions.length,
        subagentRuns: sessions
          .flatMap((session) => session.threads)
          .filter((thread) => !SessionUtil.isMainThread(thread.thread)).length,
        parsedNow: loaded.parsedCount,
        fromCache: loaded.cachedCount,
        unparsedLines: loaded.unparsedLines,
      },
      totals: this.totalsOf(sessions, signals),
      inventory: {
        fingerprint: inventory.fingerprint,
        hasChangedSinceLastRun: hasChanged,
        changes: InventoryService.diff(previous, inventory),
        pieces: inventory.pieces.map((piece) => InventoryService.compactPiece(piece)),
        notes: inventory.notes,
      },
      usage: new UsageService(config.prices, pieceIds).pieceUsage(sessions),
      environment: {
        platforms: this.countedBySession(sessions, (session) => session.environment.platform),
        shells: this.countedBySession(sessions, (session) => session.environment.shell),
      },
      process: this.processProfile(sessions, pieceIds),
      commonCommands: this.commonCommands(sessions),
      signals,
      suggestions: CollectionUtil.countBy(suggestions.map((suggestion) => suggestion.status)),
      dataDir: store.root,
    };
    await store.writeJson(AnalysisService.LAST_ANALYSIS_FILE, analysis);
    return this.compact(analysis, options);
  }

  /** Fewer signals and less evidence, to keep the agent's context small. */
  private compact(analysis: Analysis, options: AnalyzeOptions): CompactAnalysis {
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

  private touchesAnyPiece(signal: Signal, pieces: string[]): boolean {
    return signal.pieces.some((signalPiece) =>
      pieces.some((piece) => AttributionService.isSamePiece(signalPiece, piece)),
    );
  }

  /** A signal with a suggestion (in any status) is never suggested again. */
  private markHandledSignals(signals: Signal[], suggestions: Suggestion[]): void {
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
  private async addInstructionMentions(signals: Signal[], inventory: Inventory): Promise<void> {
    const mentionService = new MentionService(inventory);
    const failedCommandSignals = signals
      .filter((signal) => signal.type === "failed_command")
      .slice(0, MAX_FAILED_COMMANDS_TO_SEARCH);
    for (const signal of failedCommandSignals) {
      const failedCommand = signal.id.slice(FAILED_COMMAND_PREFIX.length);
      const workingCommands = (signal.details.recoveredWith ?? []).map((recovery) => recovery.value);
      const mentions = await mentionService.find([failedCommand, ...workingCommands]);
      if (mentions.length) {
        signal.details.mentions = mentions;
      }
    }
  }

  private totalsOf(sessions: SessionFacts[], signals: Signal[]): AnalysisTotals {
    return {
      ...this.sessionTotals(sessions),
      lostToFailures: this.sumSignalCosts(signals, WASTE_SIGNAL_TYPES),
      inCorrectedOrInterruptedTurns: this.sumSignalCosts(signals, CORRECTION_SIGNAL_TYPES),
      reportedByProvider: this.reportedTotals(sessions),
      isEstimated: true,
      unpricedModels: this.unpricedModels(sessions),
      method: COST_METHOD,
      idleMinutes: this.context.config.idleMinutes,
    };
  }

  private countedBySession(
    sessions: SessionFacts[],
    valueOf: (session: SessionFacts) => string | undefined,
  ): CountedValue[] {
    const values = sessions.map(valueOf).filter((value): value is string => value !== undefined);
    return Object.entries(CollectionUtil.countBy(values))
      .map(([value, count]) => ({
        value: RedactUtil.redact(value),
        count,
      }))
      .sort((left, right) => right.count - left.count);
  }

  private processProfile(sessions: SessionFacts[], pieceIds: Set<string>): StageProfile[] {
    const attribution = new AttributionService(pieceIds);
    const sessionIdToIndex = new Map(
      sessions.map((session) => [session.sessionId, attribution.buildSessionIndex(session)]),
    );
    return new ProcessProfileService().profile(sessions, sessionIdToIndex);
  }

  private commonCommands(sessions: SessionFacts[]): CommonCommand[] {
    const keyToCommand = new Map<string, CommonCommand & { sessionIds: Set<string> }>();
    const workCalls = sessions.flatMap((session) => session.tools.map((call) => ({
      session,
      call,
    }))).filter(({ call }) => call.category === "shell" && !NormalizeUtil.isExplorationCommand(call.key));
    for (const { session, call } of workCalls) {
      const command = keyToCommand.get(call.key) ?? {
        key: call.key,
        runs: 0,
        sessions: 0,
        failures: 0,
        sessionIds: new Set<string>(),
      };
      command.runs++;
      command.sessionIds.add(session.sessionId);
      if (call.result?.isError) {
        command.failures++;
      } else {
        command.example = call.summary;
      }
      keyToCommand.set(call.key, command);
    }
    return [...keyToCommand.values()]
      .filter((command) => command.runs >= MIN_COMMON_COMMAND_RUNS && command.key !== EMPTY_COMMAND_KEY)
      .map(({ sessionIds, ...command }) => ({
        ...command,
        sessions: sessionIds.size,
      }))
      .sort((left, right) => right.sessions - left.sessions || right.runs - left.runs)
      .slice(0, MAX_COMMON_COMMANDS);
  }

  private reportedTotals(sessions: SessionFacts[]): ReportedTotals {
    const sessionsWithCost = sessions.filter((session) => session.reported.costUsd !== undefined);
    const turns = sessions.flatMap((session) => session.reported.turns);
    const turnMs = turns.reduce((total, turn) => total + turn.durationMs, 0);
    return {
      costUsd: sessionsWithCost.length
        ? NumberUtil.round(sessionsWithCost.reduce((total, session) => total + (session.reported.costUsd ?? 0), 0))
        : undefined,
      sessionsWithCost: sessionsWithCost.length,
      isCostPartial: sessionsWithCost.some((session) => session.reported.isCostPartial),
      turnMinutes: turns.length ? TimeUtil.msToMinutes(turnMs) : undefined,
      turns: turns.length,
    };
  }

  private unpricedModels(sessions: SessionFacts[]): string[] {
    const costService = new CostService(this.context.config.prices);
    const models = sessions
      .flatMap((session) => session.messages.map((message) => message.model))
      .filter((model): model is string => model !== undefined && !costService.isPriced(model));
    return CollectionUtil.unique(models).map((model) => RedactUtil.redact(model)).sort();
  }

  private sessionTotals(sessions: SessionFacts[]): SessionTotals {
    const costService = new CostService(this.context.config.prices);
    let usage = TokenUsageUtil.zero();
    let usd = 0;
    let mainActiveMs = 0;
    let subagentActiveMs = 0;
    for (const session of sessions) {
      mainActiveMs += session.activeMs;
      subagentActiveMs += session.threads
        .filter((thread) => !SessionUtil.isMainThread(thread.thread))
        .reduce((total, thread) => total + thread.activeMs, 0);
      for (const message of session.messages) {
        usage = TokenUsageUtil.add(usage, message.usage);
        usd += costService.costUsd(message.usage, message.model);
      }
    }
    return {
      activeMinutes: TimeUtil.msToMinutes(mainActiveMs),
      subagentActiveMinutes: TimeUtil.msToMinutes(subagentActiveMs),
      tokens: TokenUsageUtil.total(usage),
      inputTokens: TokenUsageUtil.input(usage),
      outputTokens: usage.output,
      usd: NumberUtil.round(usd),
    };
  }

  private sumSignalCosts(allSignals: Signal[], types: Set<SignalType>): CostSummary {
    const signals = allSignals.filter((signal) => types.has(signal.type));
    return {
      activeMinutes: NumberUtil.round(signals.reduce((total, signal) => total + signal.cost.activeMinutes, 0), 1),
      tokens: signals.reduce((total, signal) => total + signal.cost.tokens, 0),
      inputTokens: signals.reduce((total, signal) => total + signal.cost.inputTokens, 0),
      outputTokens: signals.reduce((total, signal) => total + signal.cost.outputTokens, 0),
      usd: NumberUtil.round(signals.reduce((total, signal) => total + signal.cost.usd, 0)),
    };
  }
}
