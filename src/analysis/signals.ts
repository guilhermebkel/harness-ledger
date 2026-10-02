// Deterministic pattern extraction. Every number here comes from the transcripts;
// nothing is guessed by a model. The skill turns these signals into classified findings.

import type { AssistantMessage, EvidenceRef, HarnessPiece, Inventory, SessionFacts, TokenUsage, ToolCall, UserPrompt } from "../core/types.js";
import { jaccard, shingles } from "../core/normalize.js";
import { excerpt } from "../core/redact.js";
import { minutes, round, sha } from "../core/util.js";
import { addUsage, totalTokens, usd, ZERO, type PriceTable } from "./cost.js";

export type SignalType =
  | "failed_command"
  | "tool_error"
  | "permission_denied"
  | "hook_blocked"
  | "repeated_read"
  | "subagent_reread"
  | "repeated_request"
  | "user_correction"
  | "interruption"
  | "unused_piece"
  | "large_piece";

export interface Signal {
  id: string;
  type: SignalType;
  title: string;
  /** Harness pieces involved (inventory ids when known, e.g. "agent:code-reviewer"; "main" for the main thread). */
  pieces: string[];
  occurrences: number;
  sessions: number;
  /** True when the evidence is incomplete (few sessions, unknown subagent type, piece changed since). */
  partial: boolean;
  partialReasons: string[];
  cost: { activeMinutes: number; tokens: number; usd: number; estimated: true };
  details: Record<string, unknown>;
  evidence: EvidenceRef[];
  evidenceTotal: number;
  firstSeen?: string;
  lastSeen?: string;
  /** Pieces that changed after the newest evidence: the problem may already be fixed. */
  changedAfterEvidence?: Array<{ piece: string; modifiedAt: string }>;
  /** Set when a suggestion for this signal already exists. */
  handled?: { suggestionId: string; status: string };
  score: number;
}

export interface SignalOptions {
  idleMs: number;
  prices: PriceTable;
  maxEvidence: number;
  minSessionsForUnused: number;
  largePieceTokens: number;
}

interface Occurrence {
  session: SessionFacts;
  ref: EvidenceRef;
  pieces: string[];
  activeMs: number;
  usage: TokenUsage;
  model?: string;
  extra?: Record<string, string>;
}

/** Per-session lookup tables used by the cost estimates. */
export interface SessionIndex {
  byThread: Map<string, AssistantMessage[]>; // sorted by time
  attribution: Map<string, string[]>; // tool call id → pieces
  promptPieces: Map<UserPrompt, string[]>;
}

export function extractSignals(sessions: SessionFacts[], inventory: Inventory | undefined, opts: SignalOptions): Signal[] {
  const pieceIds = new Set(inventory?.pieces.map((p) => p.id) ?? []);
  const indexes = new Map<SessionFacts, SessionIndex>();
  for (const s of sessions) indexes.set(s, indexSession(s, pieceIds));

  const groups = new Map<string, { type: SignalType; title: string; occ: Occurrence[]; details: Record<string, unknown> }>();
  const push = (id: string, type: SignalType, title: string, occ: Occurrence, details?: (d: Record<string, unknown>) => void) => {
    let g = groups.get(id);
    if (!g) groups.set(id, (g = { type, title, occ: [], details: {} }));
    g.occ.push(occ);
    details?.(g.details);
  };

  for (const s of sessions) {
    const idx = indexes.get(s)!;
    const toolCost = (c: ToolCall) => reactionCost(c, idx, opts);

    // --- tool failures, permission denials, hook blocks -------------------
    const bashByThread = new Map<string, ToolCall[]>();
    for (const c of s.tools) {
      if (c.name === "Bash") {
        const arr = bashByThread.get(c.thread.id) ?? [];
        arr.push(c);
        bashByThread.set(c.thread.id, arr);
      }
    }
    for (const c of s.tools) {
      const r = c.result;
      if (!r || !r.isError) continue;
      const pieces = idx.attribution.get(c.id) ?? ["main"];
      const cost = toolCost(c);
      const occ: Occurrence = { session: s, ref: { ...c.ref, excerpt: `${c.summary} → ${r.ref.excerpt ?? ""}`.slice(0, 240) }, pieces, ...cost };
      if (r.kind === "permission_denied") {
        push(`permission_denied:${c.key}`, "permission_denied", `Permission denied for ${c.key}`, occ);
      } else if (r.kind === "hook_blocked") {
        push(`hook_blocked:${c.key}`, "hook_blocked", `Hook blocked ${c.key}`, occ);
      } else if (r.kind === "interrupted") {
        continue; // counted with user interruptions
      } else if (c.name === "Bash") {
        const recovered = recoveryOf(c, bashByThread.get(c.thread.id) ?? []);
        push(`failed_command:${c.key}`, "failed_command", `Command fails: ${c.key}`, occ, (d) => {
          countInto(d, "errors", r.errorHead ?? "error");
          if (recovered) countInto(d, "recoveredWith", recovered);
        });
      } else {
        push(`tool_error:${c.key}:${sha(r.errorHead ?? "", 6)}`, "tool_error", `${c.key} error: ${r.errorHead ?? "error"}`, occ, (d) => {
          d.tool = c.key;
          d.error = r.errorHead;
        });
      }
    }

    // --- repeated reads within one thread ----------------------------------
    const readsByThread = new Map<string, ToolCall[]>();
    for (const c of s.tools) {
      if (c.name !== "Read" || !c.filePath || c.result?.isError) continue;
      const key = `${c.thread.id}\u0000${c.filePath}`;
      const arr = readsByThread.get(key) ?? [];
      arr.push(c);
      readsByThread.set(key, arr);
    }
    for (const reads of readsByThread.values()) {
      if (reads.length < 3) continue;
      // A re-read right after an edit of the same file is legitimate; drop those.
      const extra = reads.slice(1).filter((r) => !editedBetween(s, reads[0]!, r));
      if (extra.length < 2) continue;
      const first = reads[0]!;
      for (const r of extra) {
        push(`repeated_read:${first.thread.agentType}:${first.filePath}`, "repeated_read", `Re-reads ${first.filePath} (${first.thread.agentType})`, {
          session: s,
          ref: r.ref,
          pieces: idx.attribution.get(r.id) ?? ["main"],
          activeMs: Math.min(opts.idleMs, Math.max(0, (r.result?.timestampMs ?? 0) - (r.timestampMs ?? 0))),
          usage: { ...ZERO, input: Math.round((r.result?.contentChars ?? 0) / 4) },
          model: idx.byThread.get(r.thread.id)?.[0]?.model,
        });
      }
    }

    // --- subagents re-reading what the main thread had just read --------------
    const mainReads = s.tools.filter((c) => c.thread.id === "main" && c.name === "Read" && c.filePath && !c.result?.isError);
    for (const c of s.tools) {
      if (c.thread.id === "main" || c.name !== "Read" || !c.filePath || c.result?.isError) continue;
      const before = mainReads.find((m) => m.filePath === c.filePath && (m.timestampMs ?? 0) <= (c.timestampMs ?? 0));
      if (!before) continue;
      push(`subagent_reread:${c.thread.agentType}`, "subagent_reread", `Subagent ${c.thread.agentType} re-reads files the main thread already read`, {
        session: s,
        ref: c.ref,
        pieces: [pieceFor("agent", c.thread.agentType, pieceIds)],
        activeMs: Math.min(opts.idleMs, Math.max(0, (c.result?.timestampMs ?? 0) - (c.timestampMs ?? 0))),
        usage: { ...ZERO, input: Math.round((c.result?.contentChars ?? 0) / 4) },
        model: idx.byThread.get(c.thread.id)?.[0]?.model,
      }, (d) => countInto(d, "files", c.filePath!));
    }

    // --- corrections and interruptions -------------------------------------
    s.prompts.forEach((p, i) => {
      if (!p.isCorrection && !p.isInterruption) return;
      const prev = s.prompts[i - 1];
      const cost = turnCost(s, idx, prev?.timestampMs, p.timestampMs, opts);
      const pieces = idx.promptPieces.get(p) ?? ["main"];
      const type: SignalType = p.isInterruption ? "interruption" : "user_correction";
      const attributed = pieces.join(",");
      push(`${type}:${attributed}`, type, p.isInterruption ? `User interrupted the agent (${attributed})` : `User corrected the agent (${attributed})`, {
        session: s,
        ref: { ...p.ref, excerpt: prev ? `asked: "${excerpt(prev.text, 90)}" → then: "${excerpt(p.text, 110)}"` : p.ref.excerpt },
        pieces,
        ...cost,
      });
    });
  }

  // --- repeated requests across sessions (structure-change candidates) -------
  for (const cluster of clusterPrompts(sessions)) {
    const id = `repeated_request:${sha(cluster.label, 8)}`;
    for (const { s, p } of cluster.items) {
      push(id, "repeated_request", `Similar request in ${cluster.sessions} sessions: "${excerpt(cluster.label, 80)}"`, {
        session: s,
        ref: p.ref,
        pieces: ["main"],
        activeMs: 0,
        usage: ZERO,
      }, (d) => {
        d.example = excerpt(cluster.label, 200);
        d.commands = cluster.commands;
      });
    }
  }

  // --- build signals ------------------------------------------------------
  const signals: Signal[] = [];
  for (const [id, g] of groups) {
    const sessionsSet = new Set(g.occ.map((o) => o.session.sessionId));
    const n = g.occ.length;
    if (!passesThreshold(g.type, n, sessionsSet.size)) continue;
    const usage = g.occ.reduce((u, o) => addUsage(u, o.usage), ZERO);
    const dollars = g.occ.reduce((sum, o) => sum + usd(o.usage, o.model, opts.prices), 0);
    const activeMs = g.occ.reduce((sum, o) => sum + o.activeMs, 0);
    const pieces = uniq(g.occ.flatMap((o) => o.pieces));
    const sorted = [...g.occ].sort((a, b) => (a.ref.timestamp ?? "").localeCompare(b.ref.timestamp ?? ""));
    const partialReasons: string[] = [];
    if (pieces.some((p) => p === "agent:subagent")) partialReasons.push("subagent type could not be resolved for some steps");
    if (sessionsSet.size < 2 && g.type !== "repeated_read") partialReasons.push("seen in a single session");
    const details = finalizeDetails(g.details);
    signals.push({
      id,
      type: g.type,
      title: g.title,
      pieces,
      occurrences: n,
      sessions: sessionsSet.size,
      partial: partialReasons.length > 0,
      partialReasons,
      cost: { activeMinutes: minutes(activeMs), tokens: totalTokens(usage), usd: round(dollars, 2), estimated: true },
      details,
      evidence: spreadEvidence(sorted, opts.maxEvidence),
      evidenceTotal: n,
      firstSeen: sorted[0]?.ref.timestamp,
      lastSeen: sorted[sorted.length - 1]?.ref.timestamp,
      score: 0,
    });
  }

  if (inventory) {
    signals.push(...unusedPieces(sessions, inventory, opts));
    signals.push(...largePieces(inventory, opts));
    markChangedAfter(signals, inventory);
  }

  for (const s of signals) {
    s.score = round(s.cost.activeMinutes + s.cost.usd * 2 + s.sessions * 2 + Math.min(s.occurrences, 30) * 0.3 - (s.partial ? 2 : 0), 2);
  }
  return signals.sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------

export function indexSession(s: SessionFacts, pieceIds: Set<string>): SessionIndex {
  const byThread = new Map<string, AssistantMessage[]>();
  for (const m of s.messages) {
    const arr = byThread.get(m.thread.id) ?? [];
    arr.push(m);
    byThread.set(m.thread.id, arr);
  }
  for (const arr of byThread.values()) arr.sort((a, b) => (a.timestampMs ?? 0) - (b.timestampMs ?? 0));

  // Attribution: subagent steps → the agent; main-thread steps after a skill or slash
  // command (until the next prompt) → that skill/command.
  const attribution = new Map<string, string[]>();
  const promptPieces = new Map<UserPrompt, string[]>();
  const mainEvents: Array<{ line: number; prompt?: UserPrompt; call?: ToolCall }> = [];
  for (const p of s.prompts) if (p.ref.file === s.file) mainEvents.push({ line: p.ref.line, prompt: p });
  for (const c of s.tools) {
    if (c.thread.id !== "main") {
      attribution.set(c.id, [pieceFor("agent", c.thread.agentType, pieceIds)]);
    } else if (c.ref.file === s.file) {
      mainEvents.push({ line: c.ref.line, call: c });
    }
  }
  mainEvents.sort((a, b) => a.line - b.line);
  let active: string[] = [];
  let lastActive: string[] = [];
  for (const e of mainEvents) {
    if (e.prompt) {
      // A correction is about what ran in the previous turn.
      promptPieces.set(e.prompt, lastActive.length ? lastActive : ["main"]);
      active = e.prompt.command ? [commandPiece(e.prompt.command, pieceIds)] : [];
      lastActive = active;
      continue;
    }
    const c = e.call!;
    if (c.skill) {
      active = uniq([...active, pieceFor("skill", c.skill, pieceIds)]);
      lastActive = active;
    }
    if (c.subagentType) lastActive = uniq([...active, pieceFor("agent", c.subagentType, pieceIds)]);
    attribution.set(c.id, active.length ? active : ["main"]);
  }
  return { byThread, attribution, promptPieces };
}

function pieceFor(kind: "agent" | "skill" | "command", name: string, pieceIds: Set<string>): string {
  const id = `${kind}:${name}`;
  if (pieceIds.has(id) || pieceIds.size === 0) return id;
  // Built-in agent or a piece from a plugin we couldn't map.
  return kind === "agent" && name !== "subagent" ? `agent:${name} (built-in)` : id;
}

function commandPiece(name: string, pieceIds: Set<string>): string {
  if (pieceIds.has(`skill:${name}`)) return `skill:${name}`;
  if (pieceIds.has(`command:${name}`)) return `command:${name}`;
  return `command:${name}`;
}

/** Cost of a failed step: time until the agent reacted, and the tokens of the reaction turn. */
function reactionCost(c: ToolCall, idx: SessionIndex, opts: SignalOptions): { activeMs: number; usage: TokenUsage; model?: string } {
  const msgs = idx.byThread.get(c.thread.id) ?? [];
  const after = c.result?.timestampMs ?? c.timestampMs ?? 0;
  const reaction = msgs.find((m) => (m.timestampMs ?? 0) >= after && m.id !== c.messageId);
  const end = reaction?.timestampMs ?? after;
  const activeMs = c.timestampMs ? Math.min(opts.idleMs, Math.max(0, end - c.timestampMs)) : 0;
  return { activeMs, usage: reaction?.usage ?? ZERO, model: reaction?.model };
}

/** Cost of a turn the user corrected or interrupted: main-thread active time and tokens in that window. */
function turnCost(s: SessionFacts, idx: SessionIndex, fromMs: number | undefined, toMs: number | undefined, opts: SignalOptions) {
  if (fromMs === undefined || toMs === undefined) return { activeMs: 0, usage: ZERO };
  const msgs = (idx.byThread.get("main") ?? []).filter((m) => (m.timestampMs ?? 0) > fromMs && (m.timestampMs ?? 0) <= toMs);
  const stamps = [fromMs, ...msgs.map((m) => m.timestampMs ?? fromMs)].sort((a, b) => a - b);
  let activeMs = 0;
  for (let i = 1; i < stamps.length; i++) {
    const gap = stamps[i]! - stamps[i - 1]!;
    if (gap <= opts.idleMs) activeMs += gap;
  }
  const usage = msgs.reduce((u, m) => addUsage(u, m.usage), ZERO);
  return { activeMs, usage, model: msgs[0]?.model };
}

/** The command that worked after a failure (next successful Bash within 3 calls with a different key). */
function recoveryOf(failed: ToolCall, threadBash: ToolCall[]): string | undefined {
  const i = threadBash.indexOf(failed);
  for (const next of threadBash.slice(i + 1, i + 4)) {
    if (next.result && !next.result.isError) return next.key !== failed.key ? next.key : undefined;
  }
  return undefined;
}

function editedBetween(s: SessionFacts, a: ToolCall, b: ToolCall): boolean {
  return s.tools.some(
    (c) =>
      c.thread.id === a.thread.id &&
      ["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(c.name) &&
      c.filePath === a.filePath &&
      (c.timestampMs ?? 0) >= (a.timestampMs ?? 0) &&
      (c.timestampMs ?? 0) <= (b.timestampMs ?? 0),
  ) || s.tools.some((c) => c.thread.id === a.thread.id && c.name === "Bash" && (c.timestampMs ?? 0) > (a.timestampMs ?? 0) && (c.timestampMs ?? 0) < (b.timestampMs ?? 0) && /\b(git (checkout|pull|merge|rebase|stash)|sed -i|prettier|eslint --fix|npm run format)/.test(c.summary));
}

function passesThreshold(type: SignalType, n: number, sessions: number): boolean {
  switch (type) {
    case "failed_command":
    case "tool_error":
      return n >= 3 || sessions >= 2;
    case "permission_denied":
    case "hook_blocked":
    case "user_correction":
    case "interruption":
      return n >= 2;
    case "repeated_read":
      return n >= 2;
    case "subagent_reread":
      return n >= 3;
    case "repeated_request":
      return sessions >= 3;
    default:
      return true;
  }
}

interface PromptCluster {
  label: string;
  sessions: number;
  items: Array<{ s: SessionFacts; p: UserPrompt }>;
  commands: string[];
}

/** Greedy clustering of first prompts and slash commands across sessions. */
function clusterPrompts(sessions: SessionFacts[]): PromptCluster[] {
  type Item = { s: SessionFacts; p: UserPrompt; sh: Set<string> };
  const items: Item[] = [];
  for (const s of sessions) {
    for (const p of s.prompts) {
      if (p.isInterruption || p.isCorrection) continue;
      const sh = shingles(p.text);
      if (sh.size < 3 || p.text.length > 600) continue;
      items.push({ s, p, sh });
    }
  }
  const clusters: Array<{ seed: Item; members: Item[] }> = [];
  for (const it of items) {
    const c = clusters.find((cl) => jaccard(cl.seed.sh, it.sh) >= 0.5);
    if (c) c.members.push(it);
    else clusters.push({ seed: it, members: [it] });
  }
  const out: PromptCluster[] = [];
  for (const c of clusters) {
    const sessionsSet = new Set(c.members.map((m) => m.s.sessionId));
    if (sessionsSet.size < 3) continue;
    // One evidence item per session.
    const seen = new Set<string>();
    const perSession = c.members.filter((m) => (seen.has(m.s.sessionId) ? false : (seen.add(m.s.sessionId), true)));
    out.push({
      label: c.seed.p.text,
      sessions: sessionsSet.size,
      items: perSession.map(({ s, p }) => ({ s, p })),
      commands: uniq(c.members.map((m) => m.p.command).filter((x): x is string => !!x)),
    });
  }
  return out;
}

function unusedPieces(sessions: SessionFacts[], inventory: Inventory, opts: SignalOptions): Signal[] {
  if (sessions.length < opts.minSessionsForUnused) return [];
  const used = new Set<string>();
  for (const s of sessions) {
    for (const c of s.tools) {
      if (c.subagentType) used.add(`agent:${c.subagentType}`);
      if (c.skill) used.add(`skill:${c.skill}`);
      if (c.key.startsWith("mcp:")) used.add(`mcp:${c.key.slice(4)}`);
    }
    for (const t of s.threads) if (t.thread.id !== "main") used.add(`agent:${t.thread.agentType}`);
    for (const p of s.prompts) if (p.command) {
      used.add(`skill:${p.command}`);
      used.add(`command:${p.command}`);
    }
  }
  const windowStart = Math.min(...sessions.map((s) => s.startMs ?? Date.now()));
  const out: Signal[] = [];
  for (const p of inventory.pieces) {
    if (!["skill", "agent", "command", "mcp"].includes(p.kind) || used.has(p.id)) continue;
    if (p.kind === "skill" && /(^|:)improve-my-harness$/.test(p.name)) continue;
    const newer = p.modifiedAt ? Date.parse(p.modifiedAt) > windowStart : false;
    out.push({
      id: `unused_piece:${p.id}`,
      type: "unused_piece",
      title: `Not used in ${sessions.length} sessions: ${p.id}`,
      pieces: [p.id],
      occurrences: 0,
      sessions: sessions.length,
      partial: newer || !p.editable,
      partialReasons: [
        ...(newer ? ["piece was added or changed during the analyzed period"] : []),
        ...(!p.editable ? ["piece comes from a plugin"] : []),
      ],
      cost: { activeMinutes: 0, tokens: 0, usd: 0, estimated: true },
      details: { scope: p.scope, path: p.path, approxTokens: p.approxTokens, description: p.description },
      evidence: [],
      evidenceTotal: 0,
      score: 0,
    });
  }
  return out;
}

function largePieces(inventory: Inventory, opts: SignalOptions): Signal[] {
  return inventory.pieces
    .filter((p) => p.editable && (p.kind === "instructions" || p.kind === "skill" || p.kind === "agent") && p.approxTokens >= opts.largePieceTokens)
    .map((p) => ({
      id: `large_piece:${p.id}`,
      type: "large_piece" as const,
      title: `${p.id} is large (~${p.approxTokens} tokens)`,
      pieces: [p.id],
      occurrences: 0,
      sessions: 0,
      partial: false,
      partialReasons: [],
      cost: { activeMinutes: 0, tokens: 0, usd: 0, estimated: true as const },
      details: {
        path: p.path,
        approxTokens: p.approxTokens,
        loadedEveryTurn: p.kind === "instructions",
      },
      evidence: [],
      evidenceTotal: 0,
      score: 0,
    }));
}

function markChangedAfter(signals: Signal[], inventory: Inventory): void {
  const byId = new Map<string, HarnessPiece>(inventory.pieces.map((p) => [p.id, p]));
  for (const s of signals) {
    if (!s.lastSeen) continue;
    const changed = s.pieces
      .map((id) => byId.get(id))
      .filter((p): p is HarnessPiece => !!p && !!p.modifiedAt && Date.parse(p.modifiedAt) > Date.parse(s.lastSeen!))
      .map((p) => ({ piece: p.id, modifiedAt: p.modifiedAt! }));
    if (changed.length) {
      s.changedAfterEvidence = changed;
      s.partial = true;
      s.partialReasons.push("piece changed after this evidence");
    }
  }
}

/** Picks evidence across sessions and time instead of the first N. */
function spreadEvidence(sorted: Occurrence[], max: number): EvidenceRef[] {
  const bySession = new Map<string, Occurrence[]>();
  for (const o of sorted) {
    const arr = bySession.get(o.session.sessionId) ?? [];
    arr.push(o);
    bySession.set(o.session.sessionId, arr);
  }
  const out: EvidenceRef[] = [];
  let round = 0;
  while (out.length < max) {
    let added = false;
    for (const arr of bySession.values()) {
      const o = arr[round];
      if (o && out.length < max) {
        out.push(o.ref);
        added = true;
      }
    }
    if (!added) break;
    round++;
  }
  return out;
}

function countInto(d: Record<string, unknown>, field: string, key: string): void {
  const m = (d[field] as Record<string, number> | undefined) ?? {};
  m[key] = (m[key] ?? 0) + 1;
  d[field] = m;
}

function finalizeDetails(d: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = Object.entries(v as Record<string, number>)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([value, count]) => ({ value, count }));
    } else out[k] = v;
  }
  return out;
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}
