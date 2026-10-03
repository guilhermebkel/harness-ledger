import { describe, expect, it } from "vitest";
import { ClaudeCodeTranscriptUtil } from "@/Providers/ClaudeCode/Utils/ClaudeCodeTranscriptUtil.ts";

describe("ClaudeCodeTranscriptUtil.cleanPrompt()", () => {
  it("strips system reminders and reads slash commands", () => {
    const prompt = ClaudeCodeTranscriptUtil.cleanPrompt(
      "<system-reminder>x</system-reminder><command-name>/changelog</command-name><command-args>for v2</command-args>",
    );
    expect(prompt).toStrictEqual({ text: "for v2", command: "changelog" });
  });
});

describe("ClaudeCodeTranscriptUtil.errorText()", () => {
  it("strips the tool_use_error wrapper", () => {
    expect(ClaudeCodeTranscriptUtil.errorText("<tool_use_error>File not found</tool_use_error>")).toBe("File not found");
  });
});

describe("ClaudeCodeTranscriptUtil.classifyResult()", () => {
  const failed = { isMarkedError: true, wasInterrupted: false };

  it("reads Claude Code's own denials", () => {
    const denied = "Permission to use Bash with command rm -rf dist has been denied.";
    expect(ClaudeCodeTranscriptUtil.classifyResult(denied, failed)).toBe("permission_denied");
    const blocked = "Permission for this action was denied by the Claude Code auto mode classifier.";
    expect(ClaudeCodeTranscriptUtil.classifyResult(blocked, failed)).toBe("permission_denied");
  });

  it("trusts toolDenialKind over the text", () => {
    const rejected = "The user doesn't want to proceed with this tool use.";
    expect(ClaudeCodeTranscriptUtil.classifyResult(rejected, { ...failed, denialKind: "user-rejected" })).toBe("user_rejected");
    expect(ClaudeCodeTranscriptUtil.classifyResult("blocked", { ...failed, denialKind: "automode-blocked" }))
      .toBe("permission_denied");
  });

  it("treats an OS permission error as an ordinary failure", () => {
    expect(ClaudeCodeTranscriptUtil.classifyResult("bfs: error: /root/.cache: Permission denied.", failed)).toBe("error");
  });

  it("never classifies a successful result by its content", () => {
    const fileContent = "1 ---\n2 Permission to use Bash has been denied when the hook blocked it";
    expect(ClaudeCodeTranscriptUtil.classifyResult(fileContent, { isMarkedError: false, wasInterrupted: false })).toBe("ok");
  });
});
