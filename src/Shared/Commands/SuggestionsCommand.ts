import type {
  AddSuggestionsOptions,
  ListSuggestionsOptions,
  SetSuggestionStatusOptions,
} from "@/Shared/Protocols/CommandProtocol.ts";
import type { AddSuggestionsResult, Suggestion, SuggestionStatus } from "@/Shared/Protocols/SuggestionProtocol.ts";
import type { Analysis } from "@/Shared/Protocols/AnalysisProtocol.ts";
import { AnalysisService } from "@/Shared/Services/AnalysisService.ts";
import { ContextService } from "@/Shared/Services/ContextService.ts";
import { SuggestionCostService } from "@/Shared/Services/SuggestionCostService.ts";
import { SuggestionService } from "@/Shared/Services/SuggestionService.ts";

const noFingerprint = (): Promise<undefined> => Promise.resolve(undefined);

// Why: an applied suggestion records the harness as it is now, so a later comparison knows what changed.
const STATUS_TO_FINGERPRINT: Record<SuggestionStatus, (context: ContextService) => Promise<string | undefined>> = {
  applied: async (context) => {
    const inventory = await context.takeInventory();
    await context.store.saveInventory(inventory);
    return inventory.fingerprint;
  },
  pending: noFingerprint,
  accepted: noFingerprint,
  rejected: noFingerprint,
};

export class SuggestionsCommand {
  async list(options: ListSuggestionsOptions): Promise<Suggestion[]> {
    const context = await ContextService.create(options);
    return new SuggestionService(context.store).list(options.status);
  }

  // Why: costs are computed (and conflicts refused) before anything is saved, from the last analysis.
  async add(options: AddSuggestionsOptions): Promise<AddSuggestionsResult> {
    const newSuggestions = SuggestionService.parse(options.items);
    const context = await ContextService.create(options);
    const analysis = await context.store.readJson<Analysis>(AnalysisService.LAST_ANALYSIS_FILE);
    const costs = analysis ? new SuggestionCostService(analysis.signals).costsOf(newSuggestions) : [];
    const result = await new SuggestionService(context.store).add(newSuggestions, costs);
    return costs.length
      ? {
          ...result,
          covered: SuggestionCostService.coveredBy(costs),
        }
      : result;
  }

  async setStatus(options: SetSuggestionStatusOptions): Promise<Suggestion> {
    const context = await ContextService.create(options);
    const appliedFingerprint = await STATUS_TO_FINGERPRINT[options.status](context);
    return new SuggestionService(context.store).setStatus(options.id, options.status, options.note, appliedFingerprint);
  }
}
