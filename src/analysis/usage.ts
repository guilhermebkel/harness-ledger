// Per-piece usage: how often each agent, skill and MCP server ran, how much it cost,
// and how often its steps failed. Used for "is this piece worth it?" and for before/after.

import type { Inventory, SessionFacts, TokenUsage } from "../core/types.js";
import { minutes, round } from "../core/util.js";
import { addUsage, totalTokens, usd, ZERO, type PriceTable } from "./cost.js";
import { indexSession } from "./signals.js";

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
  /** Per-invocation averages (only when invocations > 0). */
  perInvocation?: { activeMinutes: number; tokens: number; usd: number; toolCalls: number };
}

interface Acc {
  invocations: number;
  sessions: Set<string>;
  toolCalls: number;
  toolErrors: number;
  activeMs: number;
  usage: TokenUsage;
  dollars: number;
  models: Set<string>;
}

export function pieceUsage(sessions: SessionFacts[], inventory: Inventory | undefined, prices: PriceTable): PieceUsage[] {
  const pieceIds = new Set(inventory?.pieces.map((p) => p.id) ?? []);
  const acc = new Map<string, Acc>();
  const get = (id: string) => {
    let a = acc.get(id);
    if (!a) acc.set(id, (a = { invocations: 0, sessions: new Set(), toolCalls: 0, toolErrors: 0, activeMs: 0, usage: ZERO, dollars: 0, models: new Set() }));
    return a;
  };

  for (const s of sessions) {
    const idx = indexSession(s, pieceIds);
    const main = get("main");
    main.invocations++;
    main.sessions.add(s.sessionId);
    main.activeMs += s.activeMs;

    for (const t of s.threads) {
      if (t.thread.id === "main") continue;
      const a = get(`agent:${t.thread.agentType}`);
      a.invocations++;
      a.sessions.add(s.sessionId);
      a.activeMs += t.activeMs;
    }
    for (const m of s.messages) {
      const a = get(m.thread.id === "main" ? "main" : `agent:${m.thread.agentType}`);
      a.usage = addUsage(a.usage, m.usage);
      a.dollars += usd(m.usage, m.model, prices);
      if (m.model) a.models.add(m.model);
    }
    for (const c of s.tools) {
      const pieces = idx.attribution.get(c.id) ?? ["main"];
      for (const p of pieces) {
        const a = get(p.replace(/ \(built-in\)$/, ""));
        a.toolCalls++;
        if (c.result?.isError) a.toolErrors++;
        a.sessions.add(s.sessionId);
      }
      if (c.skill) get(`skill:${c.skill}`).invocations++;
      if (c.key.startsWith("mcp:")) {
        const a = get(`mcp:${c.key.slice(4)}`);
        a.invocations++;
        a.toolCalls++;
        if (c.result?.isError) a.toolErrors++;
        a.sessions.add(s.sessionId);
      }
    }
    for (const p of s.prompts) {
      if (!p.command) continue;
      const id = pieceIds.has(`skill:${p.command}`) ? `skill:${p.command}` : `command:${p.command}`;
      const a = get(id);
      a.invocations++;
      a.sessions.add(s.sessionId);
    }
  }

  return [...acc.entries()]
    .map(([piece, a]) => {
      const tokens = totalTokens(a.usage);
      const u: PieceUsage = {
        piece,
        invocations: a.invocations,
        sessions: a.sessions.size,
        toolCalls: a.toolCalls,
        toolErrors: a.toolErrors,
        errorRate: a.toolCalls ? round(a.toolErrors / a.toolCalls, 3) : 0,
        activeMinutes: minutes(a.activeMs),
        tokens,
        usd: round(a.dollars, 2),
        models: [...a.models],
      };
      if (a.invocations > 0) {
        u.perInvocation = {
          activeMinutes: minutes(a.activeMs / a.invocations),
          tokens: Math.round(tokens / a.invocations),
          usd: round(a.dollars / a.invocations, 3),
          toolCalls: round(a.toolCalls / a.invocations, 1),
        };
      }
      return u;
    })
    .sort((a, b) => b.usd - a.usd || b.toolCalls - a.toolCalls);
}
