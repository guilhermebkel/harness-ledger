import { resolve } from "node:path";
import type { BaseProviderAdapter } from "@/Shared/Adapters/BaseProviderAdapter.js";
import { ProviderModule } from "@/Shared/Modules/ProviderModule.js";
import type { LoadResult, Period } from "@/Shared/Protocols/AnalysisProtocol.js";
import type { CommonOptions } from "@/Shared/Protocols/CommandProtocol.js";
import type { Config } from "@/Shared/Protocols/ConfigProtocol.js";
import type { Inventory } from "@/Shared/Protocols/HarnessProtocol.js";
import { TimeUtil } from "@/Shared/Utils/TimeUtil.js";
import { ConfigService } from "./ConfigService.js";
import { SessionLoaderService } from "./SessionLoaderService.js";
import { StoreService } from "./StoreService.js";

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
