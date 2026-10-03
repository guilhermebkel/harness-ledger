import { resolve } from "node:path";
import type { BaseProviderAdapter } from "@/Shared/Adapters/BaseProviderAdapter.ts";
import { ProviderModule } from "@/Shared/Modules/ProviderModule.ts";
import type { LoadResult, Period } from "@/Shared/Protocols/AnalysisProtocol.ts";
import type { CommonOptions } from "@/Shared/Protocols/CommandProtocol.ts";
import type { Config } from "@/Shared/Protocols/ConfigProtocol.ts";
import type { Inventory } from "@/Shared/Protocols/HarnessProtocol.ts";
import { TimeUtil } from "@/Shared/Utils/TimeUtil.ts";
import { ConfigService } from "@/Shared/Services/ConfigService.ts";
import { SessionLoaderService } from "@/Shared/Services/SessionLoaderService.ts";
import { StoreService } from "@/Shared/Services/StoreService.ts";

export class ContextService {
  private constructor(
    readonly projectDir: string,
    readonly store: StoreService,
    readonly config: Config,
    readonly provider: BaseProviderAdapter,
    private readonly options: CommonOptions,
  ) {}

  static async create(options: CommonOptions): Promise<ContextService> {
    const projectDir = resolve(options.projectDir ?? process.cwd());
    const store = StoreService.forProject(projectDir, options.dataDir);
    const config = await new ConfigService(store).load();
    return new ContextService(projectDir, store, config, ProviderModule.create(options.provider), options);
  }

  get idleMs(): number {
    return this.config.idleMinutes * TimeUtil.MS_PER_MINUTE;
  }

  async takeInventory(): Promise<Inventory> {
    return this.provider.takeInventory({
      projectDir: this.projectDir,
      isProjectOnly: this.options.isProjectOnly,
    });
  }

  async loadSessions(period: Period = {}): Promise<LoadResult> {
    return new SessionLoaderService(this.provider, this.store).load({
      projectDir: this.projectDir,
      shouldReadAllProjects: this.options.shouldReadAllProjects,
      ...period,
      idleMs: this.idleMs,
      shouldSkipCache: this.options.shouldSkipCache,
      excludedSessionIds: this.options.excludedSessionIds,
    });
  }
}
