// Integration test against a fake Claude Code home (see AnalyzeCommand.test.ts).

import { describe, expect, it } from "vitest";
import { ClaudeCodeFixtureUtil, ClaudeCodeTranscriptBuilder } from "@/Providers/ClaudeCode/Utils/ClaudeCodeFixtureUtil.js";
import { AnalyzeCommand } from "./AnalyzeCommand.js";
import { EvidenceCommand } from "./EvidenceCommand.js";

const MAKE_FAILURE_SIGNAL = "failed_command:make";

const history = ClaudeCodeFixtureUtil.useHistoryFixture((fixture) => {
  // Two sessions where `npm test` fails and `pnpm test` works after a look around, and a script fails before other work.
  for (const sessionId of ["r1", "r2"]) {
    new ClaudeCodeTranscriptBuilder(sessionId, fixture.projectDir, `2026-09-2${sessionId.at(-1)}T10:00:00.000Z`)
      .user("Run the tests and the report")
      .tool(`a_${sessionId}`, "Bash", { command: "npm test" })
      .result(`a_${sessionId}`, "Exit code 1\nnpm ERR! Missing script", { isError: true })
      .tool(`b_${sessionId}`, "Bash", { command: "ls" })
      .result(`b_${sessionId}`, "src")
      .tool(`c_${sessionId}`, "Bash", { command: "pnpm test" })
      .result(`c_${sessionId}`, "ok")
      .tool(`d_${sessionId}`, "Bash", { command: "python3 report.py" })
      .result(`d_${sessionId}`, "Exit code 1\nModuleNotFoundError: No module named 'pandas'", { isError: true })
      .tool(`e_${sessionId}`, "Bash", { command: "git add -A" })
      .result(`e_${sessionId}`, "")
      .tool(`f_${sessionId}`, "Bash", { command: "make build" })
      .result(`f_${sessionId}`, "Exit code 2\nmake: *** No rule to make target 'build'.", { isError: true })
      .tool(`g_${sessionId}`, "Bash", { command: "make build" })
      .result(`g_${sessionId}`, "Exit code 2\nmake: *** No rule to make target 'build'.", { isError: true })
      .tool(`h_${sessionId}`, "Bash", { command: "make" })
      .result(`h_${sessionId}`, "Exit code 2\nmake: *** No targets.", { isError: true })
      .write(ClaudeCodeFixtureUtil.sessionPath(fixture, sessionId));
  }
});

describe("EvidenceCommand", () => {
  it("returns the exact signal even when a longer id starts with it", async () => {
    const analysis = await new AnalyzeCommand().run(history.commonOptions());
    const ids = analysis.signals.map((signal) => signal.id);
    expect(ids.indexOf("failed_command:make build")).toBeLessThan(ids.indexOf(MAKE_FAILURE_SIGNAL));
    const evidence = await new EvidenceCommand().run({ ...history.commonOptions(), signalId: MAKE_FAILURE_SIGNAL });
    expect(evidence.id).toBe(MAKE_FAILURE_SIGNAL);
  });
});

describe("recoveries", () => {
  it("counts the same job done another way, not looking around or moving on", async () => {
    const analysis = await new AnalyzeCommand().run(history.commonOptions());
    const npmTest = analysis.signals.find((signal) => signal.id === "failed_command:npm test");
    expect(npmTest?.details.recoveredWith).toEqual(expect.arrayContaining([{ value: "pnpm test", count: 5 }]));
    const script = analysis.signals.find((signal) => signal.id === "failed_command:python3 report.py");
    expect(script?.details.recoveredWith).toBeUndefined();
  });
});
