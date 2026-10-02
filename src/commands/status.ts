import { takeInventory } from "../adapters/claude-code/inventory.js";
import type { AvailableHistory } from "../analysis/load.js";
import type { Retention } from "../core/types.js";
import { countBy } from "../core/util.js";
import type { Config } from "../state/config.js";
import { createContext, loadProjectSessions, VERSION, type CommonOptions } from "./context.js";

export interface StatusResult {
  version: string;
  project: string;
  node: string;
  transcripts: AvailableHistory;
  retention: Retention;
  pieces: Record<string, number>;
  suggestions: Record<string, number>;
  dataDir: string;
  config: Config;
}

/** How much history exists, what the harness holds and how the tool is configured. */
export async function runStatus(options: CommonOptions): Promise<StatusResult> {
  const context = await createContext(options);
  const inventory = await takeInventory({
    projectDir: context.projectDir,
    isProjectOnly: options.isProjectOnly,
  });
  const loaded = await loadProjectSessions(context, options);
  const suggestions = await context.store.loadSuggestions();
  return {
    version: VERSION,
    project: context.projectDir,
    node: process.version,
    transcripts: loaded.available,
    retention: inventory.retention,
    pieces: countBy(inventory.pieces.map((piece) => piece.kind)),
    suggestions: countBy(suggestions.map((suggestion) => suggestion.status)),
    dataDir: context.store.root,
    config: context.config,
  };
}
