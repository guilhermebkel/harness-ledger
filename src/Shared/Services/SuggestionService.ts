import type {
  AddSuggestionsResult,
  FindingClass,
  NewSuggestion,
  Suggestion,
  SuggestionStatus,
} from "../Protocols/SuggestionProtocol.js";
import { GuardUtil } from "../Utils/GuardUtil.js";
import { HashUtil } from "../Utils/HashUtil.js";
import type { StoreService } from "./StoreService.js";

const SUGGESTION_ID_HASH_CHARS = 8;
const MAX_TITLE_CHARS = 200;
const MAX_CHANGE_CHARS = 2000;
const MAX_NOTE_CHARS = 500;

/** Suggestion state in `.imh/`, so the same problem is never suggested twice. */
export class SuggestionService {
  static readonly FINDING_CLASSES: FindingClass[] = [
    "rule_ignored",
    "partial_instruction",
    "missing_instruction",
    "structure_change",
    "out_of_scope",
    "already_handled",
  ];

  static readonly STATUSES: SuggestionStatus[] = ["pending", "accepted", "rejected", "applied"];

  constructor(private readonly store: StoreService) {}

  static idOf(suggestion: Pick<NewSuggestion, "signals" | "piece">): string {
    const sortedSignals = [...suggestion.signals].sort().join("|");
    return `sug-${HashUtil.sha(`${sortedSignals}@${suggestion.piece ?? ""}`, SUGGESTION_ID_HASH_CHARS)}`;
  }

  static isStatus(value: string): value is SuggestionStatus {
    return (SuggestionService.STATUSES as string[]).includes(value);
  }

  static isFindingClass(value: string): value is FindingClass {
    return (SuggestionService.FINDING_CLASSES as string[]).includes(value);
  }

  /** Validates suggestions written by the agent (from a file or stdin) before they are stored. */
  static parse(value: unknown): NewSuggestion[] {
    const items = Array.isArray(value) ? value : [value];
    return items.map((item, itemIndex) => {
      const record = GuardUtil.asRecord(item);
      const title = GuardUtil.asString(record?.title);
      const findingClass = GuardUtil.asString(record?.class);
      const signals = GuardUtil.asArray(record?.signals)
        .map((signalId) => GuardUtil.asString(signalId))
        .filter((signalId) => signalId !== undefined);
      const status = GuardUtil.asString(record?.status);
      const position = itemIndex + 1;
      if (!title || !signals.length || findingClass === undefined || !SuggestionService.isFindingClass(findingClass)) {
        throw new Error(
          `Suggestion ${position} needs a title, at least one signal id, `
          + `and a class (${SuggestionService.FINDING_CLASSES.join(", ")}).`,
        );
      }
      if (status !== undefined && !SuggestionService.isStatus(status)) {
        const validStatuses = SuggestionService.STATUSES.join(", ");
        throw new Error(`Suggestion ${position} has an invalid status. Use one of: ${validStatuses}.`);
      }
      return {
        title,
        class: findingClass,
        piece: GuardUtil.asString(record?.piece),
        signals,
        change: GuardUtil.asString(record?.change),
        status,
        note: GuardUtil.asString(record?.note),
      };
    });
  }

  async list(status?: SuggestionStatus): Promise<Suggestion[]> {
    const suggestions = await this.store.loadSuggestions();
    return status ? suggestions.filter((suggestion) => suggestion.status === status) : suggestions;
  }

  /** Stores new suggestions; one whose id already exists is reported with its status and left as is. */
  async add(newSuggestions: NewSuggestion[]): Promise<AddSuggestionsResult> {
    const suggestions = await this.store.loadSuggestions();
    const createdAt = new Date().toISOString();
    const result: AddSuggestionsResult = {
      added: [],
      existing: [],
      total: 0,
    };
    for (const newSuggestion of newSuggestions) {
      const id = SuggestionService.idOf(newSuggestion);
      const existing = suggestions.find((suggestion) => suggestion.id === id);
      if (existing) {
        result.existing.push({
          id,
          status: existing.status,
        });
        continue;
      }
      suggestions.push({
        id,
        title: newSuggestion.title.slice(0, MAX_TITLE_CHARS),
        class: newSuggestion.class,
        piece: newSuggestion.piece,
        signals: newSuggestion.signals,
        status: newSuggestion.status ?? "pending",
        createdAt,
        updatedAt: createdAt,
        change: newSuggestion.change?.slice(0, MAX_CHANGE_CHARS),
        note: newSuggestion.note?.slice(0, MAX_NOTE_CHARS),
      });
      result.added.push(id);
    }
    await this.store.saveSuggestions(suggestions);
    result.total = suggestions.length;
    return result;
  }

  /** `appliedFingerprint` is the harness fingerprint right after the change, recorded for before/after. */
  async setStatus(
    id: string,
    status: SuggestionStatus,
    note?: string,
    appliedFingerprint?: string,
  ): Promise<Suggestion> {
    const suggestions = await this.store.loadSuggestions();
    const suggestion = suggestions.find((candidate) => candidate.id === id);
    if (!suggestion) {
      throw new Error(`Suggestion not found: ${id}`);
    }
    suggestion.status = status;
    suggestion.updatedAt = new Date().toISOString();
    if (note) {
      suggestion.note = note.slice(0, MAX_NOTE_CHARS);
    }
    if (status === "applied") {
      suggestion.appliedAt = suggestion.updatedAt;
      suggestion.appliedFingerprint = appliedFingerprint;
    }
    await this.store.saveSuggestions(suggestions);
    return suggestion;
  }
}
