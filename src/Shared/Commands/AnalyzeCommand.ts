import type { CompactAnalysis } from "../Protocols/AnalysisProtocol.js";
import type { AnalyzeOptions } from "../Protocols/CommandProtocol.js";
import { AnalysisService } from "../Services/AnalysisService.js";
import { ContextService } from "../Services/ContextService.js";

/** `imh analyze`: maps the harness, reads the sessions and extracts signals. */
export class AnalyzeCommand {
  async run(options: AnalyzeOptions): Promise<CompactAnalysis> {
    const context = await ContextService.create(options);
    return new AnalysisService(context).analyze(options);
  }
}
