import type {
  AddSuggestionsOptions,
  ListSuggestionsOptions,
  SetSuggestionStatusOptions,
} from "@/Shared/Protocols/CommandProtocol.js";
import type { AddSuggestionsResult, Suggestion } from "@/Shared/Protocols/SuggestionProtocol.js";
import { ContextService } from "@/Shared/Services/ContextService.js";
import { SuggestionService } from "@/Shared/Services/SuggestionService.js";

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
