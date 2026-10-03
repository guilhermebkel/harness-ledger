import type { CompactAnalysis } from "@/Shared/Protocols/AnalysisProtocol.js";
import type { AnalyzeOptions } from "@/Shared/Protocols/CommandProtocol.js";
import { AnalysisService } from "@/Shared/Services/AnalysisService.js";
import { ContextService } from "@/Shared/Services/ContextService.js";

export class AnalyzeCommand {
  async run(options: AnalyzeOptions): Promise<CompactAnalysis> {
    const context = await ContextService.create(options);
    return new AnalysisService(context).analyze(options);
  }
}
