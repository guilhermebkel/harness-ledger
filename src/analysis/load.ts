import { cpus } from "node:os";
import type { SessionFacts } from "../core/types.js";
import { mapLimit } from "../core/util.js";
import { discoverTranscripts, parseSession, type TranscriptFile } from "../adapters/claude-code/sessions.js";
import type { Store } from "../state/store.js";

export interface LoadOptions {
  projectDir: string;
  allProjects?: boolean;
  sinceMs?: number;
  untilMs?: number;
  idleMs: number;
  store: Store;
  noCache?: boolean;
  /** Session ids to leave out (e.g. the session running the analysis). */
  excludeSessions?: string[];
}

export interface LoadResult {
  sessions: SessionFacts[];
  /** All transcripts found for the project, before the time filter. */
  available: { count: number; oldest?: string; newest?: string };
  parsed: number;
  fromCache: number;
  unparsedLines: number;
}

function signature(t: TranscriptFile, idleMs: number): string {
  const subs = t.subagentFiles.map((s) => `${s.file}:${s.mtimeMs}:${s.size}`).join("|");
  return `${t.mtimeMs}:${t.size}:${idleMs}:${subs}`;
}

/** Discovers transcripts, parses new or changed ones (cache by mtime+size), and filters by period. */
export async function loadSessions(opts: LoadOptions): Promise<LoadResult> {
  const transcripts = await discoverTranscripts({ projectDir: opts.projectDir, allProjects: opts.allProjects });
  const cache = opts.noCache ? { version: 0, entries: {} as Record<string, never> } : await opts.store.loadFactsCache();
  let parsed = 0;
  let fromCache = 0;

  const all = await mapLimit(transcripts, Math.max(2, Math.min(8, cpus().length)), async (t) => {
    const sig = signature(t, opts.idleMs);
    const hit = cache.entries[t.file];
    if (hit && hit.signature === sig) {
      fromCache++;
      return hit.facts;
    }
    const facts = await parseSession(t, { idleMs: opts.idleMs, projectDir: opts.projectDir });
    parsed++;
    (cache.entries as Record<string, { signature: string; facts: SessionFacts }>)[t.file] = { signature: sig, facts };
    return facts;
  });

  // Drop cache entries for transcripts that no longer exist (retention cleanup).
  const live = new Set(transcripts.map((t) => t.file));
  for (const k of Object.keys(cache.entries)) if (!live.has(k)) delete (cache.entries as Record<string, unknown>)[k];
  if (!opts.noCache && parsed > 0) await opts.store.saveFactsCache(cache as never);

  // Transcripts in the project's own folder always count (even if the project moved since).
  // Prefix-matched folders only count when their cwd is this project or a subfolder of it.
  const excluded = new Set(opts.excludeSessions ?? []);
  const inProject = all.filter(
    (s, i) =>
      !excluded.has(s.sessionId) &&
      (opts.allProjects ||
      transcripts[i]!.exactProject ||
      (!!s.projectDir && (s.projectDir === opts.projectDir || s.projectDir.startsWith(`${opts.projectDir}/`)))),
  );
  const starts = inProject.map((s) => s.startMs).filter((v): v is number => v !== undefined).sort((a, b) => a - b);
  const sessions = inProject.filter((s) => {
    const t = s.startMs ?? 0;
    if (opts.sinceMs !== undefined && (s.endMs ?? t) < opts.sinceMs) return false;
    if (opts.untilMs !== undefined && t > opts.untilMs) return false;
    return s.tools.length > 0 || s.prompts.length > 0;
  });
  return {
    sessions,
    available: {
      count: inProject.length,
      oldest: starts.length ? new Date(starts[0]!).toISOString() : undefined,
      newest: starts.length ? new Date(starts[starts.length - 1]!).toISOString() : undefined,
    },
    parsed,
    fromCache,
    unparsedLines: sessions.reduce((n, s) => n + s.unparsedLines, 0),
  };
}
