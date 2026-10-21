import type { SessionFacts } from "@/Shared/Protocols/SessionProtocol.ts";
import type { UnknownRecord } from "@/Shared/Protocols/UtilProtocol.ts";
import { CollectionUtil } from "@/Shared/Utils/CollectionUtil.ts";
import { RedactUtil } from "@/Shared/Utils/RedactUtil.ts";

const MAX_UNKNOWN_TYPE_CHARS = 60;
const MAX_UNKNOWN_KEYS = 40;

export class UnknownLineUtil {
  static record(facts: SessionFacts, record: UnknownRecord, lineType: string | undefined): void {
    const type = RedactUtil.excerpt(lineType ?? "(no type)", MAX_UNKNOWN_TYPE_CHARS);
    const keys = Object.keys(record).sort(CollectionUtil.compareCodeUnits).slice(0, MAX_UNKNOWN_KEYS)
      .map((key) => RedactUtil.excerpt(key, MAX_UNKNOWN_TYPE_CHARS));
    const shapes = facts.unknownLines ?? [];
    const signature = keys.join(",");
    const known = shapes.find((shape) => shape.type === type && shape.keys.join(",") === signature);
    if (known) {
      known.count++;
    } else {
      shapes.push({ type, keys, count: 1 });
    }
    facts.unknownLines = shapes;
  }
}
