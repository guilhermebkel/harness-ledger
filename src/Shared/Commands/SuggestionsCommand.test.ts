// Integration test against a fake Claude Code home (see AnalyzeCommand.test.ts).

import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ClaudeCodeFixtureUtil, type Fixture } from "@/Providers/ClaudeCode/Utils/ClaudeCodeFixtureUtil.js";
import { SuggestionService } from "@/Shared/Services/SuggestionService.js";
import { AnalyzeCommand } from "./AnalyzeCommand.js";
import { SuggestionsCommand } from "./SuggestionsCommand.js";

const command = new SuggestionsCommand();

let fixture: Fixture;
let restoreEnv: () => void;

beforeAll(() => {
  fixture = ClaudeCodeFixtureUtil.makeFixture();
  ClaudeCodeFixtureUtil.writeHarness(fixture);
  ClaudeCodeFixtureUtil.writeHistory(fixture);
  restoreEnv = ClaudeCodeFixtureUtil.useFixtureEnv(fixture);
});

afterAll(() => {
  restoreEnv();
  rmSync(fixture.root, { recursive: true, force: true });
});

function commonOptions() {
  return { projectDir: fixture.projectDir, dataDir: fixture.dataDir };
}

describe("SuggestionsCommand", () => {
  it("gives stable ids, never duplicates, and marks signals as handled", async () => {
    const suggestion = {
      title: "Enforce pnpm in test-runner",
      class: "rule_ignored",
      piece: "agent:test-runner",
      signals: ["failed_command:npm test"],
    };
    const firstAdd = await command.add({ ...commonOptions(), items: [suggestion] });
    const secondAdd = await command.add({ ...commonOptions(), items: [suggestion] });
    const id = SuggestionService.idOf(suggestion);
    expect(firstAdd.added).toEqual([id]);
    expect(secondAdd.added).toEqual([]);
    expect(secondAdd.existing).toEqual([{ id, status: "pending" }]);

    await command.setStatus({ ...commonOptions(), id, status: "rejected", note: "we keep npm in CI" });
    const analysis = await new AnalyzeCommand().run(commonOptions());
    const npmTest = analysis.signals.find((signal) => signal.id === "failed_command:npm test");
    expect(npmTest?.handledBy).toEqual({ suggestionId: id, status: "rejected" });
    expect(await command.list({ ...commonOptions(), status: "rejected" })).toHaveLength(1);
  });

  it("records the harness fingerprint when a suggestion is applied", async () => {
    const { added } = await command.add({
      ...commonOptions(),
      items: [{ title: "Trim reviewer", class: "structure_change", piece: "agent:code-reviewer", signals: ["x"] }],
    });
    const applied = await command.setStatus({ ...commonOptions(), id: added[0]!, status: "applied" });
    expect(applied.appliedAt).toBeDefined();
    expect(applied.appliedFingerprint).toMatch(/\w+/);
  });

  it("rejects suggestions without signals or with an unknown class", async () => {
    await expect(command.add({ ...commonOptions(), items: [{ title: "x", class: "rule_ignored", signals: [] }] })).rejects.toThrow();
    await expect(command.add({ ...commonOptions(), items: [{ title: "x", class: "other", signals: ["a"] }] })).rejects.toThrow();
  });
});
