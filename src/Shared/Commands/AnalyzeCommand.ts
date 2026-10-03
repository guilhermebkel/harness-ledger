import type { CompactAnalysis } from "@/Shared/Protocols/AnalysisProtocol.ts";
import type { AnalyzeOptions } from "@/Shared/Protocols/CommandProtocol.ts";
import { AnalysisService } from "@/Shared/Services/AnalysisService.ts";
import { ContextService } from "@/Shared/Services/ContextService.ts";

export class AnalyzeCommand {
  async run(options: AnalyzeOptions): Promise<CompactAnalysis> {
    const context = await ContextService.create(options);
    return new AnalysisService(context).analyze(options);
  }
}
