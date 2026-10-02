// Per-piece usage: how often each agent, skill, command and MCP server ran, what it cost and
// how often its steps failed. Answers "is this piece worth it?" and feeds before/after.

import { msToMinutes } from "../core/time.js";
import { MAIN_THREAD_ID, type SessionFacts, type TokenUsage } from "../core/types.js";
import { round } from "../core/util.js";
import { buildSessionIndex, commandPieceId, MAIN_PIECE, withoutBuiltInSuffix } from "./attribution.js";
import { addUsage, totalTokens, usageCostUsd, ZERO_USAGE, type PriceTable } from "./cost.js";

const RATE_DIGITS = 3;
const PER_INVOCATION_USD_DIGITS = 3;

export interface PerInvocation {
  activeMinutes: number;
  tokens: number;
  usd: number;
  toolCalls: number;
}

export interface PieceUsage {
  piece: string;
  invocations: number;
  sessions: number;
  toolCalls: number;
  toolErrors: number;
  errorRate: number;
  activeMinutes: number;
  tokens: number;
  usd: number;
  models: string[];
  /** Only when the piece was invoked at least once. */
  perInvocation?: PerInvocation;
}

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

class UsageAccumulator {
  private readonly pieceToTotals = new Map<string, UsageTotals>();

  totalsOf(piece: string): UsageTotals {
    const totals = this.pieceToTotals.get(piece) ?? {
      invocations: 0,
      sessionIds: new Set<string>(),
      toolCalls: 0,
      toolErrors: 0,
      activeMs: 0,
      usage: ZERO_USAGE,
      usd: 0,
      models: new Set<string>(),
    };
    this.pieceToTotals.set(piece, totals);
    return totals;
  }

  entries(): [string, UsageTotals][] {
    return [...this.pieceToTotals.entries()];
  }
}

export function pieceUsage(sessions: SessionFacts[], pieceIds: Set<string>, prices: PriceTable): PieceUsage[] {
  const accumulator = new UsageAccumulator();
  for (const session of sessions) {
    accumulateSession(accumulator, session, pieceIds, prices);
  }
  return accumulator
    .entries()
    .map(([piece, totals]) => toPieceUsage(piece, totals))
    .sort((left, right) => right.usd - left.usd || right.toolCalls - left.toolCalls);
}

function accumulateSession(
  accumulator: UsageAccumulator,
  session: SessionFacts,
  pieceIds: Set<string>,
  prices: PriceTable,
): void {
  const index = buildSessionIndex(session, pieceIds);
  const mainTotals = accumulator.totalsOf(MAIN_PIECE);
  mainTotals.invocations++;
  mainTotals.sessionIds.add(session.sessionId);
  mainTotals.activeMs += session.activeMs;

  for (const threadFacts of session.threads.filter((thread) => thread.thread.id !== MAIN_THREAD_ID)) {
    const agentTotals = accumulator.totalsOf(`agent:${threadFacts.thread.agentType}`);
    agentTotals.invocations++;
    agentTotals.sessionIds.add(session.sessionId);
    agentTotals.activeMs += threadFacts.activeMs;
  }
  for (const message of session.messages) {
    const isMainThread = message.thread.id === MAIN_THREAD_ID;
    const totals = accumulator.totalsOf(isMainThread ? MAIN_PIECE : `agent:${message.thread.agentType}`);
    totals.usage = addUsage(totals.usage, message.usage);
    totals.usd += usageCostUsd(message.usage, message.model, prices);
    if (message.model) {
      totals.models.add(message.model);
    }
  }
  for (const call of session.tools) {
    const isError = call.result?.isError === true;
    for (const piece of index.toolCallIdToPieces.get(call.id) ?? [MAIN_PIECE]) {
      const totals = accumulator.totalsOf(withoutBuiltInSuffix(piece));
      totals.toolCalls++;
      totals.toolErrors += isError ? 1 : 0;
      totals.sessionIds.add(session.sessionId);
    }
    if (call.skill) {
      accumulator.totalsOf(`skill:${call.skill}`).invocations++;
    }
    if (call.key.startsWith("mcp:")) {
      const serverTotals = accumulator.totalsOf(call.key);
      serverTotals.invocations++;
      serverTotals.toolCalls++;
      serverTotals.toolErrors += isError ? 1 : 0;
      serverTotals.sessionIds.add(session.sessionId);
    }
  }
  for (const command of session.prompts.map((prompt) => prompt.command).filter((name) => name !== undefined)) {
    const commandTotals = accumulator.totalsOf(commandPieceId(command, pieceIds));
    commandTotals.invocations++;
    commandTotals.sessionIds.add(session.sessionId);
  }
}

function toPieceUsage(piece: string, totals: UsageTotals): PieceUsage {
  const tokens = totalTokens(totals.usage);
  const pieceUsageResult: PieceUsage = {
    piece,
    invocations: totals.invocations,
    sessions: totals.sessionIds.size,
    toolCalls: totals.toolCalls,
    toolErrors: totals.toolErrors,
    errorRate: totals.toolCalls ? round(totals.toolErrors / totals.toolCalls, RATE_DIGITS) : 0,
    activeMinutes: msToMinutes(totals.activeMs),
    tokens,
    usd: round(totals.usd),
    models: [...totals.models],
  };
  if (totals.invocations > 0) {
    pieceUsageResult.perInvocation = {
      activeMinutes: msToMinutes(totals.activeMs / totals.invocations),
      tokens: Math.round(tokens / totals.invocations),
      usd: round(totals.usd / totals.invocations, PER_INVOCATION_USD_DIGITS),
      toolCalls: round(totals.toolCalls / totals.invocations, 1),
    };
  }
  return pieceUsageResult;
}
