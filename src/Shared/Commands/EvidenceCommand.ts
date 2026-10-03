import type { EvidenceOptions, EvidenceResult } from "@/Shared/Protocols/CommandProtocol.js";
import { AnalysisService } from "@/Shared/Services/AnalysisService.js";
import { ContextService } from "@/Shared/Services/ContextService.js";

const DEFAULT_MAX_EVIDENCE = 50;

export class EvidenceCommand {
  async run(options: EvidenceOptions): Promise<EvidenceResult> {
    const context = await ContextService.create(options);
    const analysis = await AnalysisService.lastAnalysis(context.store);
    const signal = AnalysisService.signalById(analysis, options.signalId);
    return {
      generatedAt: analysis.generatedAt,
      ...signal,
      evidence: signal.evidence.slice(0, options.maxEvidence ?? DEFAULT_MAX_EVIDENCE),
    };
  }
}
