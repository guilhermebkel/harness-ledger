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
      detailToValueToCount: {},
      details: {},
    };
    group.occurrences.push(occurrence);
    this.idToGroup.set(id, group);
    return group;
  }

  count(group: OccurrenceGroup, detail: CountedDetail, value: string, amount = 1): void {
    const valueToCount = group.detailToValueToCount[detail] ?? new Map<string, number>();
    valueToCount.set(value, (valueToCount.get(value) ?? 0) + amount);
    group.detailToValueToCount[detail] = valueToCount;
  }

  groups(): OccurrenceGroup[] {
    return [...this.idToGroup.values()];
  }
}
