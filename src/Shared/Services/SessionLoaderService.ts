import { cpus } from "node:os";
import type { BaseProviderAdapter } from "../Adapters/BaseProviderAdapter.js";
import type { LoadOptions, LoadResult } from "../Protocols/AnalysisProtocol.js";
import type { TranscriptFile } from "../Protocols/ProviderProtocol.js";
import type { SessionFacts } from "../Protocols/SessionProtocol.js";
import type { FactsCache } from "../Protocols/StoreProtocol.js";
import { CollectionUtil } from "../Utils/CollectionUtil.js";
import { TimeUtil } from "../Utils/TimeUtil.js";
import { StoreService } from "./StoreService.js";

const MIN_PARSE_CONCURRENCY = 2;
const MAX_PARSE_CONCURRENCY = 8;

/** Finds a provider's transcripts, parses only new or changed ones, and keeps the sessions of this project and period. */
export class SessionLoaderService {
  constructor(
    private readonly provider: BaseProviderAdapter,
    private readonly store: StoreService,
  ) {}

  async load(options: LoadOptions): Promise<LoadResult> {
    const transcripts = await this.provider.discoverTranscripts({
      projectDir: options.projectDir,
      shouldReadAllProjects: options.shouldReadAllProjects,
    });
    const cache: FactsCache = options.shouldSkipCache
      ? StoreService.emptyFactsCache()
      : await this.store.loadFactsCache();
    let parsedCount = 0;
    let cachedCount = 0;
    const concurrency = Math.max(MIN_PARSE_CONCURRENCY, Math.min(MAX_PARSE_CONCURRENCY, cpus().length));

    const allFacts = await CollectionUtil.mapWithConcurrency(transcripts, concurrency, async (transcript) => {
      const signature = this.cacheSignature(transcript, options.idleMs);
      const cached = cache.fileToEntry[transcript.file];
      if (cached?.signature === signature) {
        cachedCount++;
        return cached.facts;
      }
      const facts = await this.provider.parseSession(transcript, {
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

    // Transcripts deleted by the provider's retention cleanup leave the cache too.
    const liveFiles = new Set(transcripts.map((transcript) => transcript.file));
    for (const file of Object.keys(cache.fileToEntry)) {
      if (!liveFiles.has(file)) {
        cache.fileToEntry[file] = undefined;
      }
    }
    if (!options.shouldSkipCache && parsedCount > 0) {
      await this.store.saveFactsCache(cache);
    }

    const excludedSessionIds = new Set(options.excludedSessionIds ?? []);
    const projectSessions = allFacts.filter((facts, index) => {
      const isExcluded = excludedSessionIds.has(facts.sessionId);
      return !isExcluded && this.belongsToProject(facts, transcripts[index], options);
    });
    const startsAtMs = projectSessions
      .map((facts) => facts.startedAtMs)
      .filter((startedAtMs) => startedAtMs !== undefined)
      .sort((left, right) => left - right);
    const sessions = projectSessions.filter((facts) => this.isInPeriod(facts, options) && this.hasActivity(facts));
    return {
      sessions,
      available: {
        count: projectSessions.length,
        oldestAt: TimeUtil.toIso(startsAtMs[0]),
        newestAt: TimeUtil.toIso(startsAtMs.at(-1)),
      },
      parsedCount,
      cachedCount,
      unparsedLines: sessions.reduce((total, facts) => total + facts.unparsedLines, 0),
    };
  }

  /** Changes when the transcript or any of its subagent transcripts changes, or when the idle threshold changes. */
  private cacheSignature(transcript: TranscriptFile, idleMs: number): string {
    const subagentSignature = transcript.subagentFiles
      .map((subagentFile) => `${subagentFile.file}:${subagentFile.modifiedAtMs}:${subagentFile.bytes}`)
      .join("|");
    return `${this.provider.type}:${transcript.modifiedAtMs}:${transcript.bytes}:${idleMs}:${subagentSignature}`;
  }

  /**
   * A transcript in the project's own folder always belongs to it, even if the project moved since.
   * One in a prefix-matched folder (`my-app-2`, a subfolder) belongs only when its cwd is inside the project.
   */
  private belongsToProject(facts: SessionFacts, transcript: TranscriptFile | undefined, options: LoadOptions): boolean {
    if (options.shouldReadAllProjects || transcript?.isExactProject) {
      return true;
    }
    const sessionDir = facts.projectDir;
    const isInsideProject = sessionDir === options.projectDir || sessionDir?.startsWith(`${options.projectDir}/`) === true;
    return sessionDir !== undefined && isInsideProject;
  }

  private isInPeriod(facts: SessionFacts, options: LoadOptions): boolean {
    const startedAtMs = facts.startedAtMs ?? 0;
    const endedAtMs = facts.endedAtMs ?? startedAtMs;
    const isBeforePeriod = options.periodStartAtMs !== undefined && endedAtMs < options.periodStartAtMs;
    const isAfterPeriod = options.periodEndAtMs !== undefined && startedAtMs > options.periodEndAtMs;
    return !isBeforePeriod && !isAfterPeriod;
  }

  private hasActivity(facts: SessionFacts): boolean {
    return facts.tools.length > 0 || facts.prompts.length > 0;
  }
}
