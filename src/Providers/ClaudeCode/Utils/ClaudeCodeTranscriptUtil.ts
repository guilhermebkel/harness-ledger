import type { ToolResultKind } from "@/Shared/Protocols/SessionProtocol.js";
import type { CleanPrompt } from "@/Shared/Protocols/UtilProtocol.js";
import type { ClaudeCodeResultSignals } from "@/Providers/ClaudeCode/Protocols/ClaudeCodeProtocol.js";

const HARNESS_INJECTED_BLOCKS
  = /<(system-reminder|command-message|command-args|local-command-stdout|local-command-stderr|local-command-caveat|bash-input|bash-stdout|bash-stderr|user-prompt-submit-hook|task-notification)>[\s\S]*?<\/\1>/g;
const INTERRUPTION_PREFIX = "[Request interrupted by user";
const PERMISSION_DENIED
  = /(permission to use .+ (?:has been|was) denied|permission for this action was denied|denied by (?:the )?(?:claude code )?(?:permission|auto[- ]mode)|requires approval|not allowed by your permission settings)/i;
// Why: the person said no (often with feedback), as opposed to a rule or classifier blocking the call.
const USER_REJECTED = /(doesn'?t want to proceed with this tool use|tool use was rejected|denied by (?:the )?user)/i;
const REJECTION_FEEDBACK_MARKER = /the user said:/i;
// Why: recent versions write `toolDenialKind` on the result line; it is more reliable than the text.
const DENIAL_KIND_TO_RESULT_KIND: Record<string, ToolResultKind> = {
  "user-rejected": "user_rejected",
  "automode-blocked": "permission_denied",
  "automode-unavailable": "permission_denied",
};
const HOOK_BLOCKED = /(hook (?:error|blocked|denied)|blocked by (?:a |the )?(?:\w+ )?hook|PreToolUse:\w+ hook)/i;
const COMPACTION_CAVEAT = /^Caveat: The messages below were generated/i;
// Why: classification looks only at the start; the rest of a result is output and may quote these words.
const RESULT_HEAD_CHARS = 600;

export class ClaudeCodeTranscriptUtil {
  static cleanPrompt(rawText: string): CleanPrompt {
    const commandName = /<command-name>\s*\/?([^<\s]+)\s*<\/command-name>/.exec(rawText)?.[1];
    const commandArguments = /<command-args>([\s\S]*?)<\/command-args>/.exec(rawText)?.[1];
    const withoutInjectedBlocks = rawText
      .replace(HARNESS_INJECTED_BLOCKS, " ")
      .replace(/<command-name>[\s\S]*?<\/command-name>/g, " ");
    const withArguments = commandName && commandArguments
      ? `${withoutInjectedBlocks} ${commandArguments}`
      : withoutInjectedBlocks;
    return {
      text: withArguments.replace(/\s+/g, " ").trim(),
      command: commandName,
    };
  }

  static isInterruption(text: string): boolean {
    return text.trim().startsWith(INTERRUPTION_PREFIX);
  }

  // Why: Claude Code writes this notice when it compacts a conversation; the person didn't type it.
  static isCompactionCaveat(text: string): boolean {
    return COMPACTION_CAVEAT.test(text);
  }

  static classifyResult(text: string, signals: ClaudeCodeResultSignals): ToolResultKind {
    const { isMarkedError, wasInterrupted, denialKind } = signals;
    const head = text.slice(0, RESULT_HEAD_CHARS);
    if (ClaudeCodeTranscriptUtil.isInterruption(text)) {
      return "interrupted";
    }
    if (denialKind !== undefined) {
      return DENIAL_KIND_TO_RESULT_KIND[denialKind] ?? "permission_denied";
    }
    // Why: denials are always marked as errors; a successful result that mentions "denied" is just output.
    if (isMarkedError && USER_REJECTED.test(head)) {
      return "user_rejected";
    }
    if (isMarkedError && PERMISSION_DENIED.test(head)) {
      return "permission_denied";
    }
    if (isMarkedError && HOOK_BLOCKED.test(head)) {
      return "hook_blocked";
    }
    return isMarkedError || wasInterrupted ? "error" : "ok";
  }

  static rejectionFeedback(text: string): string | undefined {
    const marker = REJECTION_FEEDBACK_MARKER.exec(text);
    if (!marker) {
      return undefined;
    }
    const feedback = text.slice(marker.index + marker[0].length).trim();
    return feedback === "" ? undefined : feedback;
  }

  static errorText(text: string): string {
    return text.replace(/<\/?tool_use_error>/g, "");
  }
}
