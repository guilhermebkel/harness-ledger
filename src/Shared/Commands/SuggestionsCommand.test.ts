import { describe, expect, it } from "vitest";
import { ClaudeCodeFixtureUtil } from "@/Providers/ClaudeCode/Utils/ClaudeCodeFixtureUtil.js";
import { SuggestionService } from "@/Shared/Services/SuggestionService.js";
import { AnalyzeCommand } from "./AnalyzeCommand.js";
import { SuggestionsCommand } from "./SuggestionsCommand.js";

const command = new SuggestionsCommand();

const history = ClaudeCodeFixtureUtil.useHistoryFixture();

describe("SuggestionsCommand", () => {
  it("gives stable ids, never duplicates, and marks signals as handled", async () => {
    const suggestion = {
      title: "Enforce pnpm in test-runner",
      class: "rule_ignored",
      piece: "agent:test-runner",
      signals: ["failed_command:npm test"],
    };
    const firstAdd = await command.add({ ...history.commonOptions(), items: [suggestion] });
    const secondAdd = await command.add({ ...history.commonOptions(), items: [suggestion] });
    const id = SuggestionService.idOf(suggestion);
    expect(firstAdd.added).toEqual([id]);
    expect(secondAdd.added).toEqual([]);
    expect(secondAdd.existing).toEqual([{ id, status: "pending" }]);

    await command.setStatus({ ...history.commonOptions(), id, status: "rejected", note: "we keep npm in CI" });
    const analysis = await new AnalyzeCommand().run(history.commonOptions());
    const npmTest = analysis.signals.find((signal) => signal.id === "failed_command:npm test");
    expect(npmTest?.handledBy).toEqual({ suggestionId: id, status: "rejected" });
    expect(await command.list({ ...history.commonOptions(), status: "rejected" })).toHaveLength(1);
  });

  it("records the harness fingerprint when a suggestion is applied", async () => {
    const { added } = await command.add({
      ...history.commonOptions(),
      items: [{ title: "Trim reviewer", class: "structure_change", piece: "agent:code-reviewer", signals: ["x"] }],
    });
    const applied = await command.setStatus({ ...history.commonOptions(), id: added[0]!, status: "applied" });
    expect(applied.appliedAt).toBeDefined();
    expect(applied.appliedFingerprint).toMatch(/\w+/);
  });

  it("rejects suggestions without signals or with an unknown class", async () => {
    await expect(command.add({ ...history.commonOptions(), items: [{ title: "x", class: "rule_ignored", signals: [] }] })).rejects.toThrow();
    await expect(command.add({ ...history.commonOptions(), items: [{ title: "x", class: "other", signals: ["a"] }] })).rejects.toThrow();
  });
});
