// Per-piece usage: how often each agent, skill, command and MCP server ran, what it cost and
// how often its steps failed. Answers "is this piece worth it?" and feeds before/after.

import type { PieceUsage, SessionIndex } from "@/Shared/Protocols/AnalysisProtocol.js";
import type { PriceTable } from "@/Shared/Protocols/ConfigProtocol.js";
import type { SessionFacts, TokenUsage } from "@/Shared/Protocols/SessionProtocol.js";
import { NumberUtil } from "@/Shared/Utils/NumberUtil.js";
import { SessionUtil } from "@/Shared/Utils/SessionUtil.js";
import { TimeUtil } from "@/Shared/Utils/TimeUtil.js";
import { TokenUsageUtil } from "@/Shared/Utils/TokenUsageUtil.js";
import { AttributionService } from "./AttributionService.js";
import { CostService } from "./CostService.js";

const RATE_DIGITS = 3;
const PER_INVOCATION_USD_DIGITS = 3;

interface UsageTotals {
  invocations: number;
  sessionIds: Set<string>;
  toolCalls: number;
  toolErrors: number;
  activeMs: number;
  usage: TokenUsage;
  usd: number;
  models: Set<string>;
}

export class UsageService {
  private readonly costService: CostService;
  private readonly attribution: AttributionService;

  constructor(prices: PriceTable, pieceIds: Set<string>) {
    this.costService = new CostService(prices);
    this.attribution = new AttributionService(pieceIds);
  }

  pieceUsage(sessions: SessionFacts[]): PieceUsage[] {
    const pieceToTotals = new Map<string, UsageTotals>();
    for (const session of sessions) {
      this.accumulateSession(pieceToTotals, session);
    }
    return [...pieceToTotals.entries()]
      .map(([piece, totals]) => this.toPieceUsage(piece, totals))
      .sort((left, right) => right.usd - left.usd || right.toolCalls - left.toolCalls);
  }

  private totalsOf(pieceToTotals: Map<string, UsageTotals>, piece: string): UsageTotals {
    const totals = pieceToTotals.get(piece) ?? {
      invocations: 0,
      sessionIds: new Set<string>(),
      toolCalls: 0,
      toolErrors: 0,
      activeMs: 0,
      usage: TokenUsageUtil.zero(),
      usd: 0,
      models: new Set<string>(),
    };
    pieceToTotals.set(piece, totals);
    return totals;
  }

  private accumulateSession(pieceToTotals: Map<string, UsageTotals>, session: SessionFacts): void {
    const index = this.attribution.buildSessionIndex(session);
    const mainTotals = this.totalsOf(pieceToTotals, AttributionService.MAIN_PIECE);
    mainTotals.invocations++;
    mainTotals.sessionIds.add(session.sessionId);
    mainTotals.activeMs += session.activeMs;

    for (const threadFacts of session.threads.filter((thread) => !SessionUtil.isMainThread(thread.thread))) {
      const agentTotals = this.totalsOf(pieceToTotals, `agent:${threadFacts.thread.agentType}`);
      agentTotals.invocations++;
      agentTotals.sessionIds.add(session.sessionId);
      agentTotals.activeMs += threadFacts.activeMs;
    }
    this.accumulateMessages(pieceToTotals, session);
    this.accumulateToolCalls(pieceToTotals, session, index);
    for (const command of session.prompts.map((prompt) => prompt.command).filter((name) => name !== undefined)) {
      const commandTotals = this.totalsOf(pieceToTotals, this.attribution.commandPieceId(command));
      commandTotals.invocations++;
      commandTotals.sessionIds.add(session.sessionId);
    }
  }

  private accumulateMessages(pieceToTotals: Map<string, UsageTotals>, session: SessionFacts): void {
    for (const message of session.messages) {
      const threadPiece = SessionUtil.isMainThread(message.thread)
        ? AttributionService.MAIN_PIECE
        : `agent:${message.thread.agentType}`;
      // A skill's tokens also count toward the thread it ran in; skill rows overlap main and agent rows.
      const skillPieces = message.skillInUse ? [this.attribution.pieceIdFor("skill", message.skillInUse)] : [];
      for (const piece of [threadPiece, ...skillPieces]) {
        const totals = this.totalsOf(pieceToTotals, piece);
        totals.usage = TokenUsageUtil.add(totals.usage, message.usage);
        totals.usd += this.costService.costUsd(message.usage, message.model);
        totals.sessionIds.add(session.sessionId);
        if (message.model) {
          totals.models.add(message.model);
        }
      }
    }
  }

  private accumulateToolCalls(
    pieceToTotals: Map<string, UsageTotals>,
    session: SessionFacts,
    index: SessionIndex,
  ): void {
    for (const call of session.tools) {
      const errorCount = call.result?.isError === true ? 1 : 0;
      for (const piece of index.toolCallIdToPieces.get(call.id) ?? [AttributionService.MAIN_PIECE]) {
        const totals = this.totalsOf(pieceToTotals, AttributionService.withoutBuiltInSuffix(piece));
        totals.toolCalls++;
        totals.toolErrors += errorCount;
        totals.sessionIds.add(session.sessionId);
      }
      if (call.skill) {
        this.totalsOf(pieceToTotals, `skill:${call.skill}`).invocations++;
      }
      if (call.category === "mcp") {
        const serverTotals = this.totalsOf(pieceToTotals, call.key);
        serverTotals.invocations++;
        serverTotals.toolCalls++;
        serverTotals.toolErrors += errorCount;
        serverTotals.sessionIds.add(session.sessionId);
      }
    }
  }

  private toPieceUsage(piece: string, totals: UsageTotals): PieceUsage {
    const tokens = TokenUsageUtil.total(totals.usage);
    const pieceUsage: PieceUsage = {
      piece,
      invocations: totals.invocations,
      sessions: totals.sessionIds.size,
      toolCalls: totals.toolCalls,
      toolErrors: totals.toolErrors,
      errorRate: totals.toolCalls ? NumberUtil.round(totals.toolErrors / totals.toolCalls, RATE_DIGITS) : 0,
      activeMinutes: TimeUtil.msToMinutes(totals.activeMs),
      tokens,
      usd: NumberUtil.round(totals.usd),
      models: [...totals.models],
    };
    if (totals.invocations > 0) {
      pieceUsage.perInvocation = {
        activeMinutes: TimeUtil.msToMinutes(totals.activeMs / totals.invocations),
        tokens: Math.round(tokens / totals.invocations),
        inputTokens: Math.round(this.inputTokensOf(totals.usage) / totals.invocations),
        outputTokens: Math.round(totals.usage.output / totals.invocations),
        usd: NumberUtil.round(totals.usd / totals.invocations, PER_INVOCATION_USD_DIGITS),
        toolCalls: NumberUtil.round(totals.toolCalls / totals.invocations, 1),
      };
    }
    return pieceUsage;
  }

  private inputTokensOf(usage: TokenUsage): number {
    return usage.input + usage.cacheRead + usage.cacheWrite;
  }
}
