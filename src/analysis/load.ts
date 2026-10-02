import { cpus } from "node:os";
import { discoverTranscripts, parseSession, type TranscriptFile } from "../adapters/claude-code/sessions.js";
import { toIso } from "../core/time.js";
import type { SessionFacts } from "../core/types.js";
import { mapWithConcurrency } from "../core/util.js";
import { FACTS_VERSION, type FactsCache, type Store } from "../state/store.js";

const MIN_PARSE_CONCURRENCY = 2;
const MAX_PARSE_CONCURRENCY = 8;

export interface LoadOptions {
  projectDir: string;
  shouldReadAllProjects?: boolean;
  periodStartAtMs?: number;
  periodEndAtMs?: number;
  idleMs: number;
  store: Store;
  shouldSkipCache?: boolean;
  /** Session ids to leave out, such as the session running the analysis. */
  excludedSessionIds?: string[];
}

export interface AvailableHistory {
  /** Transcripts for the project before the period filter. */
  count: number;
  oldestAt?: string;
  newestAt?: string;
}

export interface LoadResult {
  sessions: SessionFacts[];
  available: AvailableHistory;
  parsedCount: number;
  cachedCount: number;
  unparsedLines: number;
}

/** Changes when the transcript or any of its subagent transcripts changes, or when the idle threshold changes. */
function cacheSignature(transcript: TranscriptFile, idleMs: number): string {
  const subagentSignature = transcript.subagentFiles
    .map((subagentFile) => `${subagentFile.file}:${subagentFile.modifiedAtMs}:${subagentFile.bytes}`)
    .join("|");
  return `${transcript.modifiedAtMs}:${transcript.bytes}:${idleMs}:${subagentSignature}`;
}

/** Finds transcripts, parses only new or changed ones, and keeps the sessions of this project and period. */
export async function loadSessions(options: LoadOptions): Promise<LoadResult> {
  const transcripts = await discoverTranscripts({
    projectDir: options.projectDir,
    shouldReadAllProjects: options.shouldReadAllProjects,
  });
  const cache: FactsCache = options.shouldSkipCache
    ? {
        version: FACTS_VERSION,
        fileToEntry: {},
      }
    : await options.store.loadFactsCache();
  let parsedCount = 0;
  let cachedCount = 0;
  const concurrency = Math.max(MIN_PARSE_CONCURRENCY, Math.min(MAX_PARSE_CONCURRENCY, cpus().length));

  const allFacts = await mapWithConcurrency(transcripts, concurrency, async (transcript) => {
    const signature = cacheSignature(transcript, options.idleMs);
    const cached = cache.fileToEntry[transcript.file];
    if (cached?.signature === signature) {
      cachedCount++;
      return cached.facts;
    }
    const facts = await parseSession(transcript, {
      idleMs: options.idleMs,
      projectDir: options.projectDir,
    });
    parsedCount++;
    cache.fileToEntry[transcript.file] = {
      signature,
      facts,
    };
    return facts;
  });

  // Transcripts deleted by the agent's retention cleanup leave the cache too.
  const liveFiles = new Set(transcripts.map((transcript) => transcript.file));
  for (const file of Object.keys(cache.fileToEntry)) {
    if (!liveFiles.has(file)) {
      cache.fileToEntry[file] = undefined;
    }
  }
  if (!options.shouldSkipCache && parsedCount > 0) {
    await options.store.saveFactsCache(cache);
  }

  const excludedSessionIds = new Set(options.excludedSessionIds ?? []);
  const projectSessions = allFacts.filter((facts, index) => {
    const isExcluded = excludedSessionIds.has(facts.sessionId);
    return !isExcluded && belongsToProject(facts, transcripts[index], options);
  });
  const startsAtMs = projectSessions
    .map((facts) => facts.startedAtMs)
    .filter((startedAtMs): startedAtMs is number => startedAtMs !== undefined)
    .sort((left, right) => left - right);
  const sessions = projectSessions.filter((facts) => isInPeriod(facts, options) && hasActivity(facts));
  return {
    sessions,
    available: {
      count: projectSessions.length,
      oldestAt: toIso(startsAtMs[0]),
      newestAt: toIso(startsAtMs.at(-1)),
    },
    parsedCount,
    cachedCount,
    unparsedLines: sessions.reduce((total, facts) => total + facts.unparsedLines, 0),
  };
}

/**
 * A transcript in the project's own folder always belongs to it, even if the project moved since.
 * One in a prefix-matched folder (`my-app-2`, a subfolder) belongs only when its cwd is inside the project.
 */
function belongsToProject(facts: SessionFacts, transcript: TranscriptFile | undefined, options: LoadOptions): boolean {
  if (options.shouldReadAllProjects || transcript?.isExactProject) {
    return true;
  }
  const sessionDir = facts.projectDir;
  const isInsideProject = sessionDir === options.projectDir || sessionDir?.startsWith(`${options.projectDir}/`) === true;
  return sessionDir !== undefined && isInsideProject;
}

function isInPeriod(facts: SessionFacts, options: LoadOptions): boolean {
  const startedAtMs = facts.startedAtMs ?? 0;
  const endedAtMs = facts.endedAtMs ?? startedAtMs;
  const isBeforePeriod = options.periodStartAtMs !== undefined && endedAtMs < options.periodStartAtMs;
  const isAfterPeriod = options.periodEndAtMs !== undefined && startedAtMs > options.periodEndAtMs;
  return !isBeforePeriod && !isAfterPeriod;
}

function hasActivity(facts: SessionFacts): boolean {
  return facts.tools.length > 0 || facts.prompts.length > 0;
}
