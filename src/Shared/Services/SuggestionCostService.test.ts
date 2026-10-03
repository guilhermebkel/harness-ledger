import { describe, expect, it } from "vitest";
import type { CostBound, Signal, SignalEvidence } from "@/Shared/Protocols/SignalProtocol.ts";
import type { NewSuggestion } from "@/Shared/Protocols/SuggestionProtocol.ts";
import { SuggestionCostService } from "@/Shared/Services/SuggestionCostService.ts";

const MINUTE_MS = 60_000;
const CORRECTIONS_ID = "user_correction:main";
const RULES = "Write the rules down";
const PLANNING = "Ask before planning";

function evidenceAt(line: number, minutes: number, tokens: number): SignalEvidence {
  return {
    line,
    sessionId: "s1",
    file: "/transcripts/s1.jsonl",
    thread: "main",
    cost: {
      tokens,
      activeMs: minutes * MINUTE_MS,
      inputTokens: tokens - 100,
      outputTokens: 100,
      usd: tokens / 10_000,
    },
  };
}

function signalWith(id: string, evidence: SignalEvidence[], bound: CostBound = "upper"): Signal {
  const minutes = evidence.reduce((total, item) => total + item.cost.activeMs / MINUTE_MS, 0);
  const tokens = evidence.reduce((total, item) => total + item.cost.tokens, 0);
  return {
    id,
    evidence,
    type: "user_correction",
    title: id,
    pieces: ["main"],
    occurrences: evidence.length,
    sessions: 1,
    isPartial: false,
    partialReasons: [],
    cost: {
      bound,
      tokens,
      activeMinutes: minutes,
      inputTokens: tokens - 100 * evidence.length,
      outputTokens: 100 * evidence.length,
      usd: tokens / 10_000,
      isEstimated: true,
      method: "test",
    },
    details: {},
    evidenceTotal: evidence.length,
    score: 0,
  };
}

const corrections = signalWith(CORRECTIONS_ID, [
  evidenceAt(10, 2, 1000),
  evidenceAt(20, 3, 2000),
  evidenceAt(30, 5, 4000),
]);

function suggestion(title: string, fields: Partial<NewSuggestion> = {}): NewSuggestion {
  return {
    title,
    class: "missing_instruction",
    signals: [CORRECTIONS_ID],
    ...fields,
  };
}

describe("SuggestionCostService", () => {
  it("splits one signal between two suggestions by the occurrences each one covers", () => {
    const [rules, planning] = new SuggestionCostService([corrections]).costsOf([
      suggestion(RULES, { occurrences: [{ sessionId: "s1", line: 10 }, { sessionId: "s1", line: 30 }] }),
      suggestion(PLANNING, { occurrences: [{ sessionId: "s1", line: 20 }] }),
    ]);
    expect(rules).toMatchObject({ activeMinutes: 7, tokens: 5000, occurrences: 2, bound: "upper" });
    expect(planning).toMatchObject({ activeMinutes: 3, tokens: 2000, occurrences: 1, bound: "upper" });
  });

  it("gives the rest of the signal to the suggestion that lists none of its occurrences", () => {
    const [rules, planning] = new SuggestionCostService([corrections]).costsOf([
      suggestion(RULES, { occurrences: [{ sessionId: "s1", line: 20 }] }),
      suggestion(PLANNING),
    ]);
    expect(rules).toMatchObject({ activeMinutes: 3, tokens: 2000, occurrences: 1 });
    expect(planning).toMatchObject({ activeMinutes: 7, tokens: 5000, occurrences: 2 });
  });

  it("refuses an occurrence in two suggestions", () => {
    const costs = new SuggestionCostService([corrections]);
    expect(() => costs.costsOf([
      suggestion(RULES, { occurrences: [{ sessionId: "s1", line: 20 }] }),
      suggestion(PLANNING, { occurrences: [{ sessionId: "s1", line: 20 }] }),
    ])).toThrow("Session s1 line 20 is in suggestions 1 and 2.");
  });

  it("refuses two suggestions that both take the whole signal", () => {
    const costs = new SuggestionCostService([corrections]);
    expect(() => costs.costsOf([suggestion(RULES), suggestion(PLANNING)]))
      .toThrow("Suggestions 1 and 2 both take all of user_correction:main.");
  });

  it("refuses an occurrence that isn't in the signal's evidence", () => {
    const costs = new SuggestionCostService([corrections]);
    expect(() => costs.costsOf([suggestion(RULES, { occurrences: [{ sessionId: "s1", line: 99 }] })]))
      .toThrow("Suggestion 1 lists session s1 line 99, which isn't in the evidence of its signals.");
  });

  it("adds signals together, says when the bounds differ, and is partial for a signal it doesn't know", () => {
    const failures = signalWith("failed_command:npm test", [evidenceAt(40, 1, 500)], "estimate");
    const [cost] = new SuggestionCostService([corrections, failures]).costsOf([
      suggestion("Use pnpm", { signals: [CORRECTIONS_ID, "failed_command:npm test", "failed_command:gone"] }),
    ]);
    expect(cost).toStrictEqual({
      activeMinutes: 11,
      tokens: 7500,
      inputTokens: 7100,
      outputTokens: 400,
      usd: 0.75,
      bound: "estimate",
      occurrences: 4,
      isPartial: true,
      partialReasons: ["signal not in the last analysis: failed_command:gone"],
    });
  });

  it("never repeats a secret from a signal id it doesn't know", () => {
    const secretSignal = "failed_command:curl -H \"Authorization: Bearer abcdefghijklmnop1234567\"";
    const [cost] = new SuggestionCostService([corrections]).costsOf([suggestion(RULES, { signals: [secretSignal] })]);
    expect(cost?.partialReasons).toStrictEqual([
      "signal not in the last analysis: failed_command:curl -H \"Authorization: [REDACTED] [REDACTED]\"",
    ]);
  });
});
