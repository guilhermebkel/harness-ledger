import { describe, expect, it } from "vitest";
import { CodexTranscriptUtil } from "@/Providers/Codex/Utils/CodexTranscriptUtil.ts";

describe("CodexTranscriptUtil.exitCodeOf()", () => {
  it.each([
    ["Chunk ID: a\nProcess exited with code 2\nOutput:\nboom", 2],
    ["Exit code: 128\nWall time: 0.1 seconds", 128],
    ["Script completed", undefined],
  ])("reads the exit code from %j", (text, expected) => {
    expect(CodexTranscriptUtil.exitCodeOf(text)).toBe(expected);
  });
});

describe("CodexTranscriptUtil.isInjectedContext()", () => {
  it.each([
    ["# AGENTS.md instructions for /work/app", true],
    ["<environment_context>\n  <cwd>/work</cwd>", true],
    ["Fix the AGENTS.md typo", false],
  ])("tells whether %j was added by Codex", (text, expected) => {
    expect(CodexTranscriptUtil.isInjectedContext(text)).toBe(expected);
  });
});

describe("CodexTranscriptUtil.outputText()", () => {
  it("joins the text parts of a list output", () => {
    const output = [{ type: "input_text", text: "one" }, { type: "input_text", text: "two" }];
    expect(CodexTranscriptUtil.outputText(output)).toBe("one\ntwo");
  });
});
