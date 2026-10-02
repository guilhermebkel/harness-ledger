import { resolve } from "node:path";
import type { Inventory, SessionFacts } from "./core/types.js";
import { parseSince, round, sha, minutes } from "./core/util.js";
import { takeInventory } from "./adapters/claude-code/inventory.js";
import { loadSessions } from "./analysis/load.js";
import { extractSignals, type Signal } from "./analysis/signals.js";
import { pieceUsage } from "./analysis/usage.js";
import { findMentions } from "./analysis/mentions.js";
import { comparePiece, usesPiece } from "./analysis/compare.js";
import { addUsage, totalTokens, usd, ZERO } from "./analysis/cost.js";
import { Store, type Suggestion, type SuggestionStatus } from "./state/store.js";
import { loadConfig } from "./state/config.js";

declare const __IMH_VERSION__: string;
export const VERSION = typeof __IMH_VERSION__ === "string" ? __IMH_VERSION__ : "dev";

export interface CommonOptions {
  project?: string;
  dataDir?: string;
  projectOnly?: boolean;
  allProjects?: boolean;
  noCache?: boolean;
  excludeSessions?: string[];
}

function setup(o: CommonOptions) {
  const projectDir = resolve(o.project ?? process.cwd());
  const store = Store.forProject(projectDir, o.dataDir);
  return { projectDir, store };
}

/** Snapshot of the harness, saved only when something changed. */
export async function cmdInventory(o: CommonOptions) {
  const { projectDir, store } = setup(o);
  const inv = await takeInventory({ projectDir, projectOnly: o.projectOnly });
  const { previous, changed } = await store.saveInventory(inv);
  return {
    project: projectDir,
    fingerprint: inv.fingerprint,
    changedSinceLastSnapshot: changed,
    changes: diffInventory(previous, inv),
    retention: inv.retention,
    pieces: inv.pieces.map(compactPiece),
    notes: inv.notes,
  };
}

export interface AnalyzeOptions extends CommonOptions {
  since?: string;
  until?: string;
  pieces?: string[];
  maxSignals?: number;
  maxEvidence?: number;
}

export async function cmdAnalyze(o: AnalyzeOptions) {
  const { projectDir, store } = setup(o);
  const config = await loadConfig(store);
  const idleMs = config.idleMinutes * 60000;
  const sinceMs = parseSince(o.since);
  const untilMs = parseSince(o.until);

  const inv = await takeInventory({ projectDir, projectOnly: o.projectOnly });
  const { previous, changed } = await store.saveInventory(inv);
  const loaded = await loadSessions({ projectDir, allProjects: o.allProjects, sinceMs, untilMs, idleMs, store, noCache: o.noCache, excludeSessions: o.excludeSessions });

  let sessions = loaded.sessions;
  const focus = o.pieces?.filter(Boolean) ?? [];
  if (focus.length) sessions = sessions.filter((s) => focus.some((p) => usesPiece(s, p)));

  const maxEvidence = o.maxEvidence ?? 5;
  let signals = extractSignals(sessions, inv, {
    idleMs,
    prices: config.prices,
    maxEvidence: Math.max(maxEvidence, 50),
    minSessionsForUnused: config.minSessionsForUnused,
    largePieceTokens: config.largePieceTokens,
  });
  if (focus.length) signals = signals.filter((s) => s.pieces.some((p) => focus.some((f) => p === f || p.startsWith(`${f} `))));

  // Mark signals that already have a suggestion, so they're never repeated.
  const suggestions = await store.suggestions();
  const bySignal = new Map<string, Suggestion>();
  for (const sug of suggestions) for (const sid of sug.signals) bySignal.set(sid, sug);
  for (const s of signals) {
    const sug = bySignal.get(s.id);
    if (sug) s.handled = { suggestionId: sug.id, status: sug.status };
  }

  // Where the harness already mentions the failing/working command.
  for (const s of signals.filter((x) => x.type === "failed_command").slice(0, 15)) {
    const recovered = ((s.details.recoveredWith as Array<{ value: string }> | undefined) ?? []).map((r) => r.value);
    const failed = s.id.slice("failed_command:".length);
    const mentions = await findMentions(inv, [failed, ...recovered]);
    if (mentions.length) s.details.mentions = mentions;
  }

  const usage = pieceUsage(sessions, inv, config.prices);
  const totals = sessionTotals(sessions, config.prices);
  const lostTypes = new Set(["failed_command", "tool_error", "permission_denied", "hook_blocked", "repeated_read", "subagent_reread"]);
  const lost = signals.filter((s) => lostTypes.has(s.type));
  const corrected = signals.filter((s) => s.type === "user_correction" || s.type === "interruption");

  const full = {
    tool: { name: "improve-my-harness", version: VERSION },
    generatedAt: new Date().toISOString(),
    project: projectDir,
    agent: "claude-code",
    period: {
      since: sinceMs ? new Date(sinceMs).toISOString() : loaded.available.oldest,
      until: untilMs ? new Date(untilMs).toISOString() : new Date().toISOString(),
      focus,
    },
    history: {
      transcriptsAvailable: loaded.available.count,
      oldest: loaded.available.oldest,
      newest: loaded.available.newest,
      retentionDays: inv.retention.days,
      retentionSource: inv.retention.source,
      note: `Claude Code deletes transcripts older than ${inv.retention.days} days at startup. improve-my-harness never changes this setting.`,
    },
    analyzed: {
      sessions: sessions.length,
      subagentRuns: sessions.reduce((n, s) => n + s.threads.filter((t) => t.thread.id !== "main").length, 0),
      parsedNow: loaded.parsed,
      fromCache: loaded.fromCache,
      unparsedLines: loaded.unparsedLines,
    },
    totals: {
      ...totals,
      lostToFailures: sumCost(lost),
      inCorrectedOrInterruptedTurns: sumCost(corrected),
      estimated: true,
      method:
        "Active time sums gaps between transcript events up to the idle threshold; subagent time is reported per agent and not added to session time. Failure cost = time until the agent reacted + tokens of the reaction turn. Correction cost = the corrected turn (upper bound). Categories can overlap.",
      idleMinutes: config.idleMinutes,
    },
    inventory: {
      fingerprint: inv.fingerprint,
      changedSinceLastRun: changed,
      changes: diffInventory(previous, inv),
      pieces: inv.pieces.map(compactPiece),
      notes: inv.notes,
    },
    usage,
    signals,
    suggestions: countBy(suggestions.map((s) => s.status)),
    dataDir: store.root,
  };
  await store.writeJson("last-analysis.json", full);

  // Compact view for the agent's context: fewer signals, fewer evidence items.
  return {
    ...full,
    usage: usage.slice(0, 15),
    signals: signals.slice(0, o.maxSignals ?? 25).map((s) => ({ ...s, evidence: s.evidence.slice(0, maxEvidence) })),
    omittedSignals: Math.max(0, signals.length - (o.maxSignals ?? 25)),
    hint: "Full result in .imh/last-analysis.json. Use `imh evidence <signal-id>` for all evidence of one signal.",
  };
}

export async function cmdEvidence(o: CommonOptions & { signal: string; max?: number }) {
  const { store } = setup(o);
  const last = await store.readJson<{ signals: Signal[]; generatedAt: string }>("last-analysis.json");
  if (!last) throw new Error("No analysis yet. Run `imh analyze` first.");
  const s = last.signals.find((x) => x.id === o.signal || x.id.startsWith(o.signal));
  if (!s) throw new Error(`Signal not found: ${o.signal}`);
  return { generatedAt: last.generatedAt, ...s, evidence: s.evidence.slice(0, o.max ?? 50) };
}

export async function cmdCompare(o: CommonOptions & { piece: string; at?: string; since?: string }) {
  const { projectDir, store } = setup(o);
  const config = await loadConfig(store);
  const idleMs = config.idleMinutes * 60000;
  let changedAtMs: number | undefined;
  let source = "";
  if (o.at) {
    changedAtMs = parseSince(o.at);
    source = "--at";
  } else {
    const applied = (await store.suggestions())
      .filter((s) => s.piece === o.piece && s.appliedAt)
      .sort((a, b) => (b.appliedAt ?? "").localeCompare(a.appliedAt ?? ""))[0];
    if (applied?.appliedAt) {
      changedAtMs = Date.parse(applied.appliedAt);
      source = `suggestion ${applied.id} applied`;
    } else {
      const inv = await takeInventory({ projectDir, projectOnly: o.projectOnly });
      const p = inv.pieces.find((x) => x.id === o.piece);
      if (p?.modifiedAt) {
        changedAtMs = Date.parse(p.modifiedAt);
        source = `${p.path} last changed (${p.modifiedSource})`;
      }
    }
  }
  if (changedAtMs === undefined) throw new Error(`Don't know when ${o.piece} changed. Pass --at <date>.`);
  const loaded = await loadSessions({ projectDir, allProjects: o.allProjects, sinceMs: parseSince(o.since), idleMs, store, noCache: o.noCache, excludeSessions: o.excludeSessions });
  return comparePiece(loaded.sessions, o.piece, changedAtMs, source, { minSessions: config.minSessionsCompare, prices: config.prices, idleMs });
}

export async function cmdStatus(o: CommonOptions) {
  const { projectDir, store } = setup(o);
  const config = await loadConfig(store);
  const inv = await takeInventory({ projectDir, projectOnly: o.projectOnly });
  const loaded = await loadSessions({ projectDir, allProjects: o.allProjects, idleMs: config.idleMinutes * 60000, store, noCache: o.noCache, excludeSessions: o.excludeSessions });
  const suggestions = await store.suggestions();
  return {
    version: VERSION,
    project: projectDir,
    node: process.version,
    transcripts: loaded.available,
    retention: inv.retention,
    pieces: countBy(inv.pieces.map((p) => p.kind)),
    suggestions: countBy(suggestions.map((s) => s.status)),
    dataDir: store.root,
    config,
  };
}

// ---- suggestions -----------------------------------------------------------

export interface NewSuggestion {
  title: string;
  class: string;
  piece?: string;
  signals: string[];
  change?: string;
  status?: SuggestionStatus;
  note?: string;
}

export function suggestionId(s: Pick<NewSuggestion, "signals" | "piece">): string {
  return `sug-${sha(`${[...s.signals].sort().join("|")}@${s.piece ?? ""}`, 8)}`;
}

export async function cmdSuggestionsList(o: CommonOptions & { status?: string }) {
  const { store } = setup(o);
  const list = await store.suggestions();
  return o.status ? list.filter((s) => s.status === o.status) : list;
}

export async function cmdSuggestionsAdd(o: CommonOptions & { items: NewSuggestion[] }) {
  const { store } = setup(o);
  const list = await store.suggestions();
  const now = new Date().toISOString();
  const added: string[] = [];
  const existing: Array<{ id: string; status: string }> = [];
  for (const item of o.items) {
    if (!item.title || !item.class || !Array.isArray(item.signals) || !item.signals.length) {
      throw new Error("Each suggestion needs title, class and at least one signal id.");
    }
    const id = suggestionId(item);
    const found = list.find((s) => s.id === id);
    if (found) {
      existing.push({ id, status: found.status });
      continue;
    }
    list.push({
      id,
      title: item.title.slice(0, 200),
      class: item.class,
      piece: item.piece,
      signals: item.signals,
      status: item.status ?? "pending",
      createdAt: now,
      updatedAt: now,
      change: item.change?.slice(0, 2000),
      note: item.note?.slice(0, 500),
    });
    added.push(id);
  }
  await store.saveSuggestions(list);
  return { added, existing, total: list.length };
}

export async function cmdSuggestionsSet(o: CommonOptions & { id: string; status: SuggestionStatus; note?: string }) {
  const { projectDir, store } = setup(o);
  const valid: SuggestionStatus[] = ["pending", "accepted", "rejected", "applied"];
  if (!valid.includes(o.status)) throw new Error(`Status must be one of: ${valid.join(", ")}`);
  const list = await store.suggestions();
  const s = list.find((x) => x.id === o.id);
  if (!s) throw new Error(`Suggestion not found: ${o.id}`);
  s.status = o.status;
  s.updatedAt = new Date().toISOString();
  if (o.note) s.note = o.note.slice(0, 500);
  if (o.status === "applied") {
    s.appliedAt = s.updatedAt;
    const inv = await takeInventory({ projectDir, projectOnly: o.projectOnly });
    await store.saveInventory(inv);
    s.appliedFingerprint = inv.fingerprint;
  }
  await store.saveSuggestions(list);
  return s;
}

// ---- helpers ---------------------------------------------------------------

function compactPiece(p: Inventory["pieces"][number]) {
  return {
    id: p.id,
    scope: p.scope,
    path: p.path,
    approxTokens: p.approxTokens || undefined,
    modifiedAt: p.modifiedAt,
    editable: p.editable,
    model: p.model,
    description: p.description?.slice(0, 120),
  };
}

function diffInventory(prev: Inventory | undefined, cur: Inventory) {
  if (!prev) return [];
  const before = new Map(prev.pieces.map((p) => [p.id, p.hash]));
  const after = new Map(cur.pieces.map((p) => [p.id, p.hash]));
  const out: Array<{ id: string; change: "added" | "removed" | "modified" }> = [];
  for (const [id, h] of after) {
    if (!before.has(id)) out.push({ id, change: "added" });
    else if (before.get(id) !== h) out.push({ id, change: "modified" });
  }
  for (const id of before.keys()) if (!after.has(id)) out.push({ id, change: "removed" });
  return out;
}

function sessionTotals(sessions: SessionFacts[], prices: Parameters<typeof usd>[2]) {
  let usage = ZERO;
  let dollars = 0;
  let mainMs = 0;
  let subMs = 0;
  for (const s of sessions) {
    mainMs += s.activeMs;
    subMs += s.threads.filter((t) => t.thread.id !== "main").reduce((n, t) => n + t.activeMs, 0);
    for (const m of s.messages) {
      usage = addUsage(usage, m.usage);
      dollars += usd(m.usage, m.model, prices);
    }
  }
  return {
    activeMinutes: minutes(mainMs),
    subagentActiveMinutes: minutes(subMs),
    tokens: totalTokens(usage),
    usd: round(dollars, 2),
  };
}

function sumCost(signals: Signal[]) {
  return {
    activeMinutes: round(signals.reduce((n, s) => n + s.cost.activeMinutes, 0), 1),
    tokens: signals.reduce((n, s) => n + s.cost.tokens, 0),
    usd: round(signals.reduce((n, s) => n + s.cost.usd, 0), 2),
  };
}

function countBy(xs: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of xs) out[x] = (out[x] ?? 0) + 1;
  return out;
}
