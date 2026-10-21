import { describe, expect, it } from "vitest";
import { SessionFactsBuilder } from "@/Shared/Utils/SessionFactsBuilder.ts";
import { UnknownLineUtil } from "@/Shared/Utils/UnknownLineUtil.ts";

describe("UnknownLineUtil.record()", () => {
  it("counts lines of the same type and shape together and keeps new shapes apart", () => {
    const facts = new SessionFactsBuilder().build();
    UnknownLineUtil.record(facts, { b: 1, a: 2 }, "novel");
    UnknownLineUtil.record(facts, { a: 3, b: 4 }, "novel");
    UnknownLineUtil.record(facts, { a: 5 }, "novel");
    expect(facts.unknownLines).toStrictEqual([
      { type: "novel", keys: ["a", "b"], count: 2 },
      { type: "novel", keys: ["a"], count: 1 },
    ]);
  });

  it("redacts a secret that ended up in a type or key", () => {
    const facts = new SessionFactsBuilder().build();
    UnknownLineUtil.record(facts, { token: "x" }, "ghp_abcdefghijklmnopqrstuvwxyz123456");
    expect(facts.unknownLines?.[0]?.type).toBe("[REDACTED]");
  });
});
