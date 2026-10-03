import type {
  CountedDetail,
  Occurrence,
  OccurrenceGroup,
  SignalType,
} from "@/Shared/Protocols/SignalProtocol.ts";

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

  // Why: amounts other than 1 weigh a value, e.g. by tokens.
  count(group: OccurrenceGroup, detail: CountedDetail, value: string, amount = 1): void {
    const valueToCount = group.counters[detail] ?? new Map<string, number>();
    valueToCount.set(value, (valueToCount.get(value) ?? 0) + amount);
    group.counters[detail] = valueToCount;
  }

  groups(): OccurrenceGroup[] {
    return [...this.idToGroup.values()];
  }
}
