import type {
  CountedDetail,
  Occurrence,
  OccurrenceGroup,
  SignalType,
} from "@/Shared/Protocols/SignalProtocol.js";

/** Collects occurrences of patterns into groups by signal id, before they become signals. */
export class OccurrenceCollectorService {
  private readonly idToGroup = new Map<string, OccurrenceGroup>();

  add(id: string, type: SignalType, title: string, occurrence: Occurrence): OccurrenceGroup {
    const group = this.idToGroup.get(id) ?? {
      id,
      type,
      title,
      occurrences: [],
      counters: {},
      details: {},
    };
    group.occurrences.push(occurrence);
    this.idToGroup.set(id, group);
    return group;
  }

  /** Counts a value (an error, a recovery command, a file) seen with an occurrence of the group. */
  count(group: OccurrenceGroup, detail: CountedDetail, value: string): void {
    const valueToCount = group.counters[detail] ?? new Map<string, number>();
    valueToCount.set(value, (valueToCount.get(value) ?? 0) + 1);
    group.counters[detail] = valueToCount;
  }

  groups(): OccurrenceGroup[] {
    return [...this.idToGroup.values()];
  }
}
