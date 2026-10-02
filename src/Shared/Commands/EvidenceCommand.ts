import type { Analysis } from "@/Shared/Protocols/AnalysisProtocol.js";
import type { EvidenceOptions, EvidenceResult } from "@/Shared/Protocols/CommandProtocol.js";
import { AnalysisService } from "@/Shared/Services/AnalysisService.js";
import { ContextService } from "@/Shared/Services/ContextService.js";

const DEFAULT_MAX_EVIDENCE = 50;

/** `imh evidence <signal-id>`: all saved evidence for one signal of the last analysis. */
export class EvidenceCommand {
  async run(options: EvidenceOptions): Promise<EvidenceResult> {
    const context = await ContextService.create(options);
    const analysis = await context.store.readJson<Analysis>(AnalysisService.LAST_ANALYSIS_FILE);
    if (!analysis) {
      throw new Error("No analysis yet. Run `imh analyze` first.");
    }
    const signal = analysis.signals.find(
      (candidate) => candidate.id === options.signalId || candidate.id.startsWith(options.signalId),
    );
    if (!signal) {
      throw new Error(`Signal not found: ${options.signalId}`);
    }
    return {
      generatedAt: analysis.generatedAt,
      ...signal,
      evidence: signal.evidence.slice(0, options.maxEvidence ?? DEFAULT_MAX_EVIDENCE),
    };
  }
}
