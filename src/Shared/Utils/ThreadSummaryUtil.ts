import type { SessionFacts, ThreadFacts, ThreadRef } from "@/Shared/Protocols/SessionProtocol.ts";
import { SessionUtil } from "@/Shared/Utils/SessionUtil.ts";
import { TimeUtil } from "@/Shared/Utils/TimeUtil.ts";

const UNKNOWN_SUBAGENT_TYPE = "subagent";

export interface ThreadSummaryInput {
  facts: SessionFacts;
  idleMs: number;
  threadIdToEventsAtMs: Map<string, number[]>;
  threadIdToFirstPromptHash: Map<string, string>;
}

export class ThreadSummaryUtil {
  static summarize(input: ThreadSummaryInput): void {
    const { facts, idleMs } = input;
    for (const [threadId, eventsAtMs] of input.threadIdToEventsAtMs) {
      eventsAtMs.sort((left, right) => left - right);
      const isMain = threadId === SessionUtil.MAIN_THREAD_ID;
      const threadFacts: ThreadFacts = {
        thread: isMain ? SessionUtil.mainThread() : ThreadSummaryUtil.threadRefOf(facts, threadId),
        activeMs: TimeUtil.activeTime(eventsAtMs, idleMs),
        firstEventAtMs: eventsAtMs[0],
        lastEventAtMs: eventsAtMs.at(-1),
        promptHash: input.threadIdToFirstPromptHash.get(threadId),
      };
      facts.threads.push(threadFacts);
      if (isMain) {
        facts.activeMs = threadFacts.activeMs;
        facts.startedAtMs = threadFacts.firstEventAtMs;
        facts.endedAtMs = threadFacts.lastEventAtMs;
      }
    }
  }

  static threadRefOf(facts: SessionFacts, threadId: string): ThreadRef {
    const typeOf = facts.tools.find((call) => call.thread.id === threadId)?.thread.agentType
      ?? facts.messages.find((message) => message.thread.id === threadId)?.thread.agentType
      ?? UNKNOWN_SUBAGENT_TYPE;
    return { id: threadId, agentType: typeOf };
  }
}
