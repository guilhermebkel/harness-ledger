import type { SessionIndex } from "@/Shared/Protocols/AnalysisProtocol.ts";
import type { AssistantMessage, SessionFacts, ToolCall, ToolResultKind } from "@/Shared/Protocols/SessionProtocol.ts";
import type { FailureChain, FailureChainKind, StepCost } from "@/Shared/Protocols/SignalProtocol.ts";
import { CollectionUtil } from "@/Shared/Utils/CollectionUtil.ts";
import { NormalizeUtil } from "@/Shared/Utils/NormalizeUtil.ts";
import { TimeUtil } from "@/Shared/Utils/TimeUtil.ts";
import { TokenUsageUtil } from "@/Shared/Utils/TokenUsageUtil.ts";

// Why: past this many attempts at the same job, the agent is stuck rather than recovering; the chain closes.
const MAX_CHAIN_ATTEMPTS = 10;
// Why: an attempt this far from the previous one (in calls, or past the idle threshold) is new work, not a retry;
// without the limit, a tool that fails once and works an hour later swallows everything in between.
const MAX_CALLS_BETWEEN_ATTEMPTS = 10;

type ChainStep = "skip" | "failure" | "recovery" | "stop";

// Why: the person stopped or refused the call, so what follows is a new turn, not another attempt.
const STOPPING_RESULT_KINDS = new Set<ToolResultKind>(["interrupted", "user_rejected"]);

export class FailureChainService {
  constructor(private readonly idleMs: number) {}

  chainsOf(session: SessionFacts, index: SessionIndex): FailureChain[] {
    const threadIdToCalls = new Map<string, ToolCall[]>();
    for (const call of session.tools) {
      CollectionUtil.pushTo(threadIdToCalls, call.thread.id, call);
    }
    const chainedCallIds = new Set<string>();
    const chains: FailureChain[] = [];
    for (const calls of threadIdToCalls.values()) {
      calls.forEach((call, callIndex) => {
        if (!FailureChainService.isChainableFailure(call) || chainedCallIds.has(call.id)) {
          return;
        }
        const chain = this.chainFrom(call, calls.slice(callIndex + 1), index);
        for (const failure of chain.failures) {
          chainedCallIds.add(failure.id);
        }
        chains.push(chain);
      });
    }
    return chains;
  }

  static isChainableFailure(call: ToolCall): boolean {
    const result = call.result;
    return result?.isError === true && !STOPPING_RESULT_KINDS.has(result.kind);
  }

  private chainFrom(first: ToolCall, laterCalls: ToolCall[], index: SessionIndex): FailureChain {
    const failures = [first];
    let recovery: ToolCall | undefined;
    let callsSinceAttempt = 0;
    const stepToIsLast: Record<ChainStep, (candidate: ToolCall) => boolean> = {
      stop: () => true,
      skip: () => {
        callsSinceAttempt += 1;
        return false;
      },
      failure: (candidate) => {
        callsSinceAttempt = 0;
        failures.push(candidate);
        return failures.length >= MAX_CHAIN_ATTEMPTS;
      },
      recovery: (candidate) => {
        recovery = candidate;
        return true;
      },
    };
    laterCalls.some((candidate) => {
      const lastAttempt = failures.at(-1) ?? first;
      const isTooFar = callsSinceAttempt >= MAX_CALLS_BETWEEN_ATTEMPTS
        || (candidate.calledAtMs ?? 0) - (lastAttempt.calledAtMs ?? 0) > this.idleMs;
      const step = isTooFar ? "stop" : this.stepOf(first, candidate);
      return stepToIsLast[step](candidate);
    });
    const window = this.chainWindow(first, failures, recovery, index);
    return {
      failures,
      recovery,
      kind: FailureChainService.kindOf(first, recovery),
      cost: window.cost,
      messageIds: window.messages.map((message) => message.id),
    };
  }

  private stepOf(first: ToolCall, candidate: ToolCall): ChainStep {
    if (!FailureChainService.doesSameJob(first, candidate)) {
      return FailureChainService.hasMovedOn(first, candidate) ? "stop" : "skip";
    }
    const result = candidate.result;
    if (result === undefined) {
      return "skip";
    }
    if (STOPPING_RESULT_KINDS.has(result.kind)) {
      return "stop";
    }
    return result.isError ? "failure" : "recovery";
  }

  // Why: a recovery does the same job another way (`npm test` → `pnpm test`) or reruns it after a fix; looking
  // around (`ls`, `cat`) or moving on to other work (`git add` after a failed script) is not one.
  private static doesSameJob(first: ToolCall, candidate: ToolCall): boolean {
    if (candidate.category !== first.category) {
      return false;
    }
    if (first.category !== "shell") {
      return candidate.key === first.key && candidate.filePath === first.filePath;
    }
    if (candidate.key === first.key) {
      return true;
    }
    if (NormalizeUtil.isExplorationCommand(candidate.key)) {
      return false;
    }
    const failedStage = NormalizeUtil.commandStage(first.key);
    if (failedStage !== undefined) {
      return NormalizeUtil.commandStage(candidate.key) === failedStage;
    }
    return candidate.key.split(" ")[0] === first.key.split(" ")[0];
  }

  private static hasMovedOn(first: ToolCall, candidate: ToolCall): boolean {
    const isOtherWork = candidate.category === "shell" && !NormalizeUtil.isExplorationCommand(candidate.key);
    return candidate.category === first.category && (first.category !== "shell" || isOtherWork);
  }

  // Why: a fix loop reruns the identical command after changes; the same key with other arguments
  // (`python3 a.py`, `python3 b.py`) is a different command.
  private static kindOf(first: ToolCall, recovery: ToolCall | undefined): FailureChainKind {
    if (recovery === undefined) {
      return "unrecovered";
    }
    if (first.category !== "shell") {
      return "retry";
    }
    return recovery.summary === first.summary ? "fix_loop" : "wrong_command";
  }

  // Why: the cost runs from the first failed call until the call that worked was issued, with every message in
  // between (reasoning, looking around, fixes); the working call's own run is not waste. Unrecovered chains end
  // at the agent's reaction to the last failure.
  private chainWindow(
    first: ToolCall,
    failures: ToolCall[],
    recovery: ToolCall | undefined,
    index: SessionIndex,
  ): {
    cost: StepCost; messages: AssistantMessage[];
  } {
    const startAtMs = first.calledAtMs;
    const messages = index.threadIdToMessages.get(first.thread.id) ?? [];
    if (startAtMs === undefined) {
      return {
        cost: {
          activeMs: 0,
          usage: TokenUsageUtil.zero(),
        },
        messages: [],
      };
    }
    const lastFailure = failures.at(-1) ?? first;
    const endAtMs = recovery?.calledAtMs ?? FailureChainService.reactionAtMs(lastFailure, messages);
    const windowMessages = messages.filter((message) => {
      const sentAtMs = message.sentAtMs ?? 0;
      return message.id !== first.messageId && sentAtMs > startAtMs && sentAtMs <= endAtMs;
    });
    const eventsAtMs = [startAtMs, ...windowMessages.map((message) => message.sentAtMs ?? startAtMs), endAtMs]
      .sort((left, right) => left - right);
    return {
      cost: {
        activeMs: TimeUtil.activeTime(eventsAtMs, this.idleMs),
        usage: TokenUsageUtil.sum(windowMessages.map((message) => message.usage)),
        model: windowMessages[0]?.model,
      },
      messages: windowMessages,
    };
  }

  private static reactionAtMs(call: ToolCall, messages: AssistantMessage[]): number {
    const resultAtMs = call.result?.returnedAtMs ?? call.calledAtMs ?? 0;
    const reaction = messages.find((message) => (message.sentAtMs ?? 0) >= resultAtMs && message.id !== call.messageId);
    return reaction?.sentAtMs ?? resultAtMs;
  }
}
