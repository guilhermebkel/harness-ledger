import { describe, expect, it } from "vitest";
import { ClaudeCodeTranscriptUtil } from "./ClaudeCodeTranscriptUtil.js";

describe("cleanPrompt", () => {
  it("strips system reminders and reads slash commands", () => {
    const prompt = ClaudeCodeTranscriptUtil.cleanPrompt(
      "<system-reminder>x</system-reminder><command-name>/changelog</command-name><command-args>for v2</command-args>",
    );
    expect(prompt).toEqual({ text: "for v2", command: "changelog" });
  });
});

describe("errorText", () => {
  it("strips the tool_use_error wrapper", () => {
    expect(ClaudeCodeTranscriptUtil.errorText("<tool_use_error>File not found</tool_use_error>")).toBe("File not found");
  });
});
