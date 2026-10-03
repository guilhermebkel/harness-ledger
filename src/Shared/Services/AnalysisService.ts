import type {
  Analysis,
  AnalysisTotals,
  CommonCommand,
  CompactAnalysis,
  CostSummary,
  ReportedTotals,
  SessionTotals,
  StageProfile,
} from "@/Shared/Protocols/AnalysisProtocol.ts";
import type { AnalyzeOptions } from "@/Shared/Protocols/CommandProtocol.ts";
import type { Inventory } from "@/Shared/Protocols/HarnessProtocol.ts";
import type { SessionFacts } from "@/Shared/Protocols/SessionProtocol.ts";
import type { CountedValue, Signal, SignalCost, SignalType } from "@/Shared/Protocols/SignalProtocol.ts";
import type { Suggestion } from "@/Shared/Protocols/SuggestionProtocol.ts";
import { CollectionUtil } from "@/Shared/Utils/CollectionUtil.ts";
import { NormalizeUtil } from "@/Shared/Utils/NormalizeUtil.ts";
import { NumberUtil } from "@/Shared/Utils/NumberUtil.ts";
import { RedactUtil } from "@/Shared/Utils/RedactUtil.ts";
import { SessionUtil } from "@/Shared/Utils/SessionUtil.ts";
import { TimeUtil } from "@/Shared/Utils/TimeUtil.ts";
import { TokenUsageUtil } from "@/Shared/Utils/TokenUsageUtil.ts";
import { VersionUtil } from "@/Shared/Utils/VersionUtil.ts";
import { AttributionService } from "@/Shared/Services/AttributionService.ts";
import { CompareService } from "@/Shared/Services/CompareService.ts";
import type { ContextService } from "@/Shared/Services/ContextService.ts";
import { CostService } from "@/Shared/Services/CostService.ts";
import { InventoryService } from "@/Shared/Services/InventoryService.ts";
import { MentionService } from "@/Shared/Services/MentionService.ts";
import { ProcessProfileService } from "@/Shared/Services/ProcessProfileService.ts";
import { SignalService } from "@/Shared/Services/SignalService.ts";
import type { StoreService } from "@/Shared/Services/StoreService.ts";
import { UsageService } from "@/Shared/Services/UsageService.ts";
import { CheckInventoryService } from "@/Shared/Services/CheckInventoryService.ts";
import { GapService } from "@/Shared/Services/GapService.ts";

const DEFAULT_MAX_SIGNALS = 25;
const MIN_COMMON_COMMAND_RUNS = 2;
const MAX_COMMON_COMMANDS = 15;
const EMPTY_COMMAND_KEY = "(empty)";
const DEFAULT_MAX_EVIDENCE = 5;
const SAVED_EVIDENCE_PER_SIGNAL = 50;
const MAX_USAGE_ENTRIES = 15;
// Why: searching instruction files for every failing command is slow; the top ones are enough.
const MAX_FAILED_COMMANDS_TO_SEARCH = 15;
const FAILED_COMMAND_PREFIX = "failed_command:";

type FixLoopPart = "all" | "withoutFixLoops" | "onlyFixLoops";
type CostPicker = (cost: CostSummary, fixLoop: CostSummary) => CostSummary;
const FAILURE_SIGNAL_TYPES = new Set<SignalType>(["failed_command", "tool_error", "permission_denied", "hook_blocked", "api_error"]);
const REREAD_SIGNAL_TYPES = new Set<SignalType>(["repeated_read", "subagent_reread", "context_compaction"]);
const CORRECTION_SIGNAL_TYPES = new Set<SignalType>(["user_correction", "interruption"]);
const COST_METHOD
  = "Active time sums gaps between transcript events up to the idle threshold. Each signal's cost.method says what it "
    + "counts and cost.bound whether it is a lower bound, an upper bound or an estimate (docs/cost-model.md). The "
    + "totals don't overlap: failures exclude fix loops, and corrections exclude turns already counted as failures.";

export class AnalysisService {
  private static readonly FIX_LOOP_PART_TO_SUMMARY: Record<FixLoopPart, CostPicker> = {
    all: (cost, fixLoop) => AnalysisService.offset(cost, fixLoop, 0),
    withoutFixLoops: (cost, fixLoop) => AnalysisService.offset(cost, fixLoop, -1),
    onlyFixLoops: (_cost, fixLoop) => fixLoop,
  };

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
    const totals = this.totalsOf(sessions, signals);
    const usage = new UsageService(config.prices, pieceIds).pieceUsage(sessions);
    const checks = await new CheckInventoryService(this.context.projectDir).inspect(sessions, inventory);
    const versions = GapService.versionsOf(sessions, VersionUtil.VERSION, inventory.provider);
    const gaps = new GapService(versions).gapsOf({
      sessions,
      checks,
      usage,
      unpricedModels: totals.unpricedModels,
    });
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
      inventory: {
        fingerprint: inventory.fingerprint,
        hasChangedSinceLastRun: hasChanged,
        changes: InventoryService.diff(previous, inventory),
        pieces: inventory.pieces.map((piece) => InventoryService.compactPiece(piece)),
        notes: inventory.notes,
      },
      environment: {
        platforms: this.countedBySession(sessions, (session) => session.environment.platform),
        shells: this.countedBySession(sessions, (session) => session.environment.shell),
      },
      process: this.processProfile(sessions, pieceIds),
      commonCommands: this.commonCommands(sessions),
      suggestions: CollectionUtil.countBy(suggestions.map((suggestion) => suggestion.status)),
      dataDir: store.root,
      totals,
      usage,
      checks,
      gaps,
      versions,
      signals,
    };
    await store.writeJson(AnalysisService.LAST_ANALYSIS_FILE, analysis);
    return this.compact(analysis, options);
  }

  // Why: an exact id wins over a longer id that merely starts with it.
  static signalById(analysis: Analysis, signalId: string): Signal {
    const signal = analysis.signals.find((candidate) => candidate.id === signalId)
      ?? analysis.signals.find((candidate) => candidate.id.startsWith(signalId));
    if (!signal) {
      throw new Error(`Signal not found: ${signalId}`);
    }
    return signal;
  }

  static async lastAnalysis(store: StoreService): Promise<Analysis> {
    const analysis = await store.readJson<Analysis>(AnalysisService.LAST_ANALYSIS_FILE);
    if (!analysis) {
      throw new Error("No analysis yet. Run `imh analyze` first.");
    }
    return analysis;
  }

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

  // Why: a signal with a suggestion, in any status, is never suggested again.
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
      lostToFailures: this.sumSignalCosts(signals, FAILURE_SIGNAL_TYPES, "withoutFixLoops"),
      inFixLoops: this.sumSignalCosts(signals, FAILURE_SIGNAL_TYPES, "onlyFixLoops"),
      lostToRereads: this.sumSignalCosts(signals, REREAD_SIGNAL_TYPES),
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
    return CollectionUtil.unique(models).map((model) => RedactUtil.redact(model)).sort(CollectionUtil.compareCodeUnits);
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

  private sumSignalCosts(allSignals: Signal[], types: Set<SignalType>, fixLoops: FixLoopPart = "all"): CostSummary {
    const figures = allSignals
      .filter((signal) => types.has(signal.type))
      .map((signal) => AnalysisService.partOf(signal.cost, fixLoops));
    const sumOf = (field: keyof CostSummary): number => figures.reduce((total, figure) => total + figure[field], 0);
    return {
      activeMinutes: NumberUtil.round(sumOf("activeMinutes"), 1),
      tokens: Math.round(sumOf("tokens")),
      inputTokens: Math.round(sumOf("inputTokens")),
      outputTokens: Math.round(sumOf("outputTokens")),
      usd: NumberUtil.round(sumOf("usd")),
    };
  }

  private static partOf(cost: SignalCost, fixLoops: FixLoopPart): CostSummary {
    const fixLoop = cost.fixLoop ?? {
      activeMinutes: 0,
      tokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      usd: 0,
    };
    return AnalysisService.FIX_LOOP_PART_TO_SUMMARY[fixLoops](cost, fixLoop);
  }

  private static offset(cost: CostSummary, fixLoop: CostSummary, sign: number): CostSummary {
    return {
      activeMinutes: cost.activeMinutes + sign * fixLoop.activeMinutes,
      tokens: cost.tokens + sign * fixLoop.tokens,
      inputTokens: cost.inputTokens + sign * fixLoop.inputTokens,
      outputTokens: cost.outputTokens + sign * fixLoop.outputTokens,
      usd: cost.usd + sign * fixLoop.usd,
    };
  }
}
