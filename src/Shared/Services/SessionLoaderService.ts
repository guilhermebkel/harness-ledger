import { cpus } from "node:os";
import type { BaseProviderAdapter } from "@/Shared/Adapters/BaseProviderAdapter.ts";
import type { LoadOptions, LoadResult } from "@/Shared/Protocols/AnalysisProtocol.ts";
import type { TranscriptFile } from "@/Shared/Protocols/ProviderProtocol.ts";
import type { SessionFacts } from "@/Shared/Protocols/SessionProtocol.ts";
import type { FactsCache } from "@/Shared/Protocols/StoreProtocol.ts";
import { CollectionUtil } from "@/Shared/Utils/CollectionUtil.ts";
import { TimeUtil } from "@/Shared/Utils/TimeUtil.ts";
import { StoreService } from "@/Shared/Services/StoreService.ts";

const MIN_PARSE_CONCURRENCY = 2;
const MAX_PARSE_CONCURRENCY = 8;

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

    // Why: transcripts deleted by the provider's retention cleanup leave the cache too.
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
      parsedCount,
      cachedCount,
      available: {
        count: projectSessions.length,
        oldestAt: TimeUtil.toIso(startsAtMs[0]),
        newestAt: TimeUtil.toIso(startsAtMs.at(-1)),
      },
      unparsedLines: sessions.reduce((total, facts) => total + facts.unparsedLines, 0),
    };
  }

  private cacheSignature(transcript: TranscriptFile, idleMs: number): string {
    const subagentSignature = transcript.subagentFiles
      .map((subagentFile) => `${subagentFile.file}:${subagentFile.modifiedAtMs}:${subagentFile.bytes}`)
      .join("|");
    // Why: the idle threshold is part of the parsed facts, so changing it invalidates the cache.
    return `${this.provider.type}:${transcript.modifiedAtMs}:${transcript.bytes}:${idleMs}:${subagentSignature}`;
  }

  private belongsToProject(facts: SessionFacts, transcript: TranscriptFile | undefined, options: LoadOptions): boolean {
    if (options.shouldReadAllProjects || transcript?.isExactProject) {
      return true;
    }
    // Why: a transcript in the project's own folder belongs to it even if the project moved since; one in a
    // prefix-matched folder (`my-app-2`, a subfolder) only when its cwd is inside the project.
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
