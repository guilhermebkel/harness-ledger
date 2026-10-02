import type {
  AddSuggestionsOptions,
  ListSuggestionsOptions,
  SetSuggestionStatusOptions,
} from "../Protocols/CommandProtocol.js";
import type { AddSuggestionsResult, Suggestion } from "../Protocols/SuggestionProtocol.js";
import { ContextService } from "../Services/ContextService.js";
import { SuggestionService } from "../Services/SuggestionService.js";

/** `imh suggestions list|add|set`: suggestion state, so the same problem is never suggested twice. */
export class SuggestionsCommand {
  async list(options: ListSuggestionsOptions): Promise<Suggestion[]> {
    const context = await ContextService.create(options);
    return new SuggestionService(context.store).list(options.status);
  }

  async add(options: AddSuggestionsOptions): Promise<AddSuggestionsResult> {
    const newSuggestions = SuggestionService.parse(options.items);
    const context = await ContextService.create(options);
    return new SuggestionService(context.store).add(newSuggestions);
  }

  /** Applied suggestions also record the harness fingerprint after the change, for before/after. */
  async setStatus(options: SetSuggestionStatusOptions): Promise<Suggestion> {
    const context = await ContextService.create(options);
    let appliedFingerprint: string | undefined;
    if (options.status === "applied") {
      const inventory = await context.takeInventory();
      await context.store.saveInventory(inventory);
      appliedFingerprint = inventory.fingerprint;
    }
    return new SuggestionService(context.store).setStatus(options.id, options.status, options.note, appliedFingerprint);
  }
}
