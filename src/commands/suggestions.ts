import { takeInventory } from "../adapters/claude-code/inventory.js";
import { asArray, asRecord, asString } from "../core/guards.js";
import { sha } from "../core/util.js";
import {
  FINDING_CLASSES,
  SUGGESTION_STATUSES,
  type FindingClass,
  type Suggestion,
  type SuggestionStatus,
} from "../state/store.js";
import { createContext, type CommonOptions } from "./context.js";

const SUGGESTION_ID_HASH_CHARS = 8;
const MAX_TITLE_CHARS = 200;
const MAX_CHANGE_CHARS = 2000;
const MAX_NOTE_CHARS = 500;

export interface NewSuggestion {
  title: string;
  class: FindingClass;
  piece?: string;
  signals: string[];
  change?: string;
  status?: SuggestionStatus;
  note?: string;
}

export interface ExistingSuggestion {
  id: string;
  status: SuggestionStatus;
}

export interface AddSuggestionsResult {
  added: string[];
  existing: ExistingSuggestion[];
  total: number;
}

export function suggestionId(suggestion: Pick<NewSuggestion, "signals" | "piece">): string {
  const sortedSignals = [...suggestion.signals].sort().join("|");
  return `sug-${sha(`${sortedSignals}@${suggestion.piece ?? ""}`, SUGGESTION_ID_HASH_CHARS)}`;
}

export function isSuggestionStatus(value: string): value is SuggestionStatus {
  return (SUGGESTION_STATUSES as readonly string[]).includes(value);
}

function isFindingClass(value: string): value is FindingClass {
  return (FINDING_CLASSES as readonly string[]).includes(value);
}

/** Validates suggestions written by the agent (from a file or stdin) before they are stored. */
export function parseNewSuggestions(value: unknown): NewSuggestion[] {
  const items = Array.isArray(value) ? value : [value];
  return items.map((item, itemIndex) => {
    const record = asRecord(item);
    const title = asString(record?.title);
    const findingClass = asString(record?.class);
    const signals = asArray(record?.signals).map(asString).filter((signalId) => signalId !== undefined);
    const status = asString(record?.status);
    if (!title || !signals.length || findingClass === undefined || !isFindingClass(findingClass)) {
      throw new Error(
        `Suggestion ${itemIndex + 1} needs a title, at least one signal id, `
        + `and a class (${FINDING_CLASSES.join(", ")}).`,
      );
    }
    if (status !== undefined && !isSuggestionStatus(status)) {
      const validStatuses = SUGGESTION_STATUSES.join(", ");
      throw new Error(`Suggestion ${itemIndex + 1} has an invalid status. Use one of: ${validStatuses}.`);
    }
    return {
      title,
      class: findingClass,
      piece: asString(record?.piece),
      signals,
      change: asString(record?.change),
      status,
      note: asString(record?.note),
    };
  });
}

export interface ListSuggestionsOptions extends CommonOptions { status?: SuggestionStatus }

export async function runListSuggestions(options: ListSuggestionsOptions): Promise<Suggestion[]> {
  const context = await createContext(options);
  const suggestions = await context.store.loadSuggestions();
  return options.status ? suggestions.filter((suggestion) => suggestion.status === options.status) : suggestions;
}

export interface AddSuggestionsOptions extends CommonOptions {
  /** Raw input; validated here, where it enters the program. */
  items: unknown;
}

/** Stores new suggestions; one whose id already exists is reported with its status and left as is. */
export async function runAddSuggestions(options: AddSuggestionsOptions): Promise<AddSuggestionsResult> {
  const newSuggestions = parseNewSuggestions(options.items);
  const context = await createContext(options);
  const suggestions = await context.store.loadSuggestions();
  const createdAt = new Date().toISOString();
  const result: AddSuggestionsResult = {
    added: [],
    existing: [],
    total: 0,
  };
  for (const newSuggestion of newSuggestions) {
    const id = suggestionId(newSuggestion);
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
  await context.store.saveSuggestions(suggestions);
  result.total = suggestions.length;
  return result;
}

export interface SetSuggestionStatusOptions extends CommonOptions {
  id: string;
  status: SuggestionStatus;
  note?: string;
}

/** Applied suggestions also record the harness fingerprint after the change, for before/after. */
export async function runSetSuggestionStatus(options: SetSuggestionStatusOptions): Promise<Suggestion> {
  const context = await createContext(options);
  const suggestions = await context.store.loadSuggestions();
  const suggestion = suggestions.find((candidate) => candidate.id === options.id);
  if (!suggestion) {
    throw new Error(`Suggestion not found: ${options.id}`);
  }
  suggestion.status = options.status;
  suggestion.updatedAt = new Date().toISOString();
  if (options.note) {
    suggestion.note = options.note.slice(0, MAX_NOTE_CHARS);
  }
  if (options.status === "applied") {
    const inventory = await takeInventory({
      projectDir: context.projectDir,
      isProjectOnly: options.isProjectOnly,
    });
    await context.store.saveInventory(inventory);
    suggestion.appliedAt = suggestion.updatedAt;
    suggestion.appliedFingerprint = inventory.fingerprint;
  }
  await context.store.saveSuggestions(suggestions);
  return suggestion;
}
