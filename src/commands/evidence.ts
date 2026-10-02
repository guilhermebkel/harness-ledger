import type { Signal } from "../analysis/signals.js";
import { LAST_ANALYSIS_FILE, type Analysis } from "./analyze.js";
import { createContext, type CommonOptions } from "./context.js";

const DEFAULT_MAX_EVIDENCE = 50;

export interface EvidenceOptions extends CommonOptions {
  /** A signal id, or a unique prefix of one. */
  signalId: string;
  maxEvidence?: number;
}

export type EvidenceResult = Signal & { generatedAt: string };

/** All saved evidence for one signal of the last analysis. */
export async function runEvidence(options: EvidenceOptions): Promise<EvidenceResult> {
  const context = await createContext(options);
  const analysis = await context.store.readJson<Analysis>(LAST_ANALYSIS_FILE);
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
