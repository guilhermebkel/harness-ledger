import type {
  AddSuggestionsResult,
  FindingClass,
  NewSuggestion,
  OccurrenceRef,
  Suggestion,
  SuggestionCost,
  SuggestionStatus,
} from "@/Shared/Protocols/SuggestionProtocol.ts";
import { GuardUtil } from "@/Shared/Utils/GuardUtil.ts";
import { HashUtil } from "@/Shared/Utils/HashUtil.ts";
import type { StoreService } from "@/Shared/Services/StoreService.ts";
import { CollectionUtil } from "@/Shared/Utils/CollectionUtil.ts";

const SUGGESTION_ID_HASH_CHARS = 8;
const MAX_TITLE_CHARS = 200;
const MAX_CHANGE_CHARS = 2000;
const MAX_NOTE_CHARS = 500;

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

  // Why: occurrences join the identity only when listed, so ids of suggestions without them never change.
  static idOf(suggestion: Pick<NewSuggestion, "signals" | "piece" | "occurrences">): string {
    const sortedSignals = suggestion.signals.toSorted(CollectionUtil.compareCodeUnits).join("|");
    const occurrenceKeys = (suggestion.occurrences ?? []).map((occurrence) => `${occurrence.sessionId}:${occurrence.line}`);
    const sortedOccurrences = occurrenceKeys.toSorted(CollectionUtil.compareCodeUnits).join("|");
    const occurrencePart = sortedOccurrences ? `#${sortedOccurrences}` : "";
    const identity = `${sortedSignals}@${suggestion.piece ?? ""}${occurrencePart}`;
    return `sug-${HashUtil.sha(identity, SUGGESTION_ID_HASH_CHARS)}`;
  }

  static isStatus(value: string): value is SuggestionStatus {
    return (SuggestionService.STATUSES as string[]).includes(value);
  }

  static isFindingClass(value: string): value is FindingClass {
    return (SuggestionService.FINDING_CLASSES as string[]).includes(value);
  }

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
        signals,
        status,
        occurrences: SuggestionService.parseOccurrences(record?.occurrences, position),
        class: findingClass,
        piece: GuardUtil.asString(record?.piece),
        change: GuardUtil.asString(record?.change),
        note: GuardUtil.asString(record?.note),
      };
    });
  }

  private static parseOccurrences(value: unknown, position: number): OccurrenceRef[] | undefined {
    if (value === undefined) {
      return undefined;
    }
    return GuardUtil.asArray(value).map((item) => {
      const record = GuardUtil.asRecord(item);
      const sessionId = GuardUtil.asString(record?.sessionId);
      const line = GuardUtil.asNumber(record?.line);
      if (sessionId === undefined || line === undefined) {
        throw new Error(`Suggestion ${position} has an occurrence without a "sessionId" and a "line".`);
      }
      return {
        sessionId,
        line,
      };
    });
  }

  async list(status?: SuggestionStatus): Promise<Suggestion[]> {
    const suggestions = await this.store.loadSuggestions();
    return status ? suggestions.filter((suggestion) => suggestion.status === status) : suggestions;
  }

  // Why: a suggestion whose id already exists is left as is.
  async add(
    newSuggestions: NewSuggestion[],
    costs: (SuggestionCost | undefined)[] = [],
  ): Promise<AddSuggestionsResult> {
    const suggestions = await this.store.loadSuggestions();
    const createdAt = new Date().toISOString();
    const result: AddSuggestionsResult = {
      added: [],
      existing: [],
      total: 0,
      costs: {},
    };
    for (const [itemIndex, newSuggestion] of newSuggestions.entries()) {
      const id = SuggestionService.idOf(newSuggestion);
      const cost = costs[itemIndex];
      if (cost) {
        result.costs[id] = cost;
      }
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
        createdAt,
        cost,
        title: newSuggestion.title.slice(0, MAX_TITLE_CHARS),
        class: newSuggestion.class,
        piece: newSuggestion.piece,
        signals: newSuggestion.signals,
        occurrences: newSuggestion.occurrences,
        status: newSuggestion.status ?? "pending",
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
