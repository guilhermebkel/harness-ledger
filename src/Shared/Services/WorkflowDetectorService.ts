// Why: exploration (ls, cat, grep) is left out: reading around is not a procedure.

import type { SessionIndex } from "@/Shared/Protocols/AnalysisProtocol.ts";
import type { SessionFacts, ToolCall } from "@/Shared/Protocols/SessionProtocol.ts";
import type { Occurrence, SignalOptions, StepCost } from "@/Shared/Protocols/SignalProtocol.ts";
import { CollectionUtil } from "@/Shared/Utils/CollectionUtil.ts";
import { HashUtil } from "@/Shared/Utils/HashUtil.ts";
import { NormalizeUtil } from "@/Shared/Utils/NormalizeUtil.ts";
import { TimeUtil } from "@/Shared/Utils/TimeUtil.ts";
import { TokenUsageUtil } from "@/Shared/Utils/TokenUsageUtil.ts";
import { AttributionService } from "@/Shared/Services/AttributionService.ts";
import type { OccurrenceCollectorService } from "@/Shared/Services/OccurrenceCollectorService.ts";

const MAX_WORKFLOW_STEPS = 5;
const WORKFLOW_HASH_CHARS = 8;
const MAX_WORKFLOW_SIGNALS = 10;
const STEP_SEPARATOR = " → ";
// Why: a shorter sequence run about as often as a longer one that contains it is the same workflow.
const SUBSUMED_SESSION_RATIO = 0.75;
// Why: steps spread over a longer stretch are separate pieces of work, not one procedure.
const MAX_WORKFLOW_SPAN_MINUTES = 15;

interface WorkflowCandidate {
  steps: string[];
  sessionIdToRuns: Map<string, ToolCall[][]>;
}

export class WorkflowDetectorService {
  constructor(
    private readonly options: SignalOptions,
    private readonly collector: OccurrenceCollectorService,
  ) {}

  detect(sessions: SessionFacts[], sessionIdToIndex: Map<string, SessionIndex>): void {
    const thresholds = this.options.thresholds;
    // Why: across sessions, or many times within long sessions (an edit → lint → diff loop done by hand).
    const candidates = this.candidatesOf(sessions).filter((candidate) => {
      const isAcrossSessions = candidate.sessionIdToRuns.size >= thresholds.minWorkflowSessions;
      return isAcrossSessions || this.runCountOf(candidate) >= thresholds.minWorkflowRuns;
    });
    const sessionIdToSession = new Map(sessions.map((session) => [session.sessionId, session]));
    for (const workflow of this.withoutSubsumed(candidates).slice(0, MAX_WORKFLOW_SIGNALS)) {
      const gram = workflow.steps.join(STEP_SEPARATOR);
      const runCount = this.runCountOf(workflow);
      const sessionCount = workflow.sessionIdToRuns.size;
      const title = `Same steps ${runCount} times in ${sessionCount} session${sessionCount === 1 ? "" : "s"}: ${gram}`;
      const signalId = `repeated_workflow:${HashUtil.sha(gram, WORKFLOW_HASH_CHARS)}`;
      const runs = [...workflow.sessionIdToRuns.entries()]
        .flatMap(([sessionId, sessionRuns]) => sessionRuns.map((calls) => ({
          sessionId,
          calls,
        })));
      for (const { sessionId, calls } of runs) {
        const session = sessionIdToSession.get(sessionId);
        const index = sessionIdToIndex.get(sessionId);
        const [firstCall] = calls;
        if (!session || !index || !firstCall) {
          continue;
        }
        const occurrence: Occurrence = {
          session,
          ref: {
            ...firstCall.ref,
            excerpt: calls.map((call) => call.summary).join(" ; "),
          },
          pieces: CollectionUtil.unique(
            calls.flatMap((call) => index.toolCallIdToPieces.get(call.id) ?? [AttributionService.MAIN_PIECE]),
          ),
          ...this.workflowCost(calls, index),
        };
        const group = this.collector.add(signalId, "repeated_workflow", title, occurrence);
        group.details.steps = workflow.steps;
      }
    }
  }

  private candidatesOf(sessions: SessionFacts[]): WorkflowCandidate[] {
    const gramToCandidate = new Map<string, WorkflowCandidate>();
    for (const session of sessions) {
      for (const window of this.workCommandsByThread(session).flatMap((calls) => this.windowsOf(calls))) {
        this.addWindow(gramToCandidate, session.sessionId, window);
      }
    }
    return [...gramToCandidate.values()];
  }

  private windowsOf(calls: ToolCall[]): ToolCall[][] {
    const windows: ToolCall[][] = [];
    for (let length = this.options.thresholds.minWorkflowSteps; length <= MAX_WORKFLOW_STEPS; length++) {
      for (let start = 0; start + length <= calls.length; start++) {
        windows.push(calls.slice(start, start + length));
      }
    }
    return windows;
  }

  private addWindow(gramToCandidate: Map<string, WorkflowCandidate>, sessionId: string, window: ToolCall[]): void {
    const steps = window.map((call) => call.key);
    const isTooSpread = this.spanOf(window) > MAX_WORKFLOW_SPAN_MINUTES * TimeUtil.MS_PER_MINUTE;
    if (new Set(steps).size < window.length || isTooSpread) {
      return;
    }
    const gram = steps.join(STEP_SEPARATOR);
    const candidate = gramToCandidate.get(gram) ?? { steps, sessionIdToRuns: new Map<string, ToolCall[][]>() };
    const sessionRuns = candidate.sessionIdToRuns.get(sessionId) ?? [];
    const previousRunEnd = sessionRuns.at(-1)?.at(-1)?.calledAtMs ?? Number.NEGATIVE_INFINITY;
    if ((window[0]?.calledAtMs ?? 0) > previousRunEnd) {
      sessionRuns.push(window);
    }
    candidate.sessionIdToRuns.set(sessionId, sessionRuns);
    gramToCandidate.set(gram, candidate);
  }

  private workCommandsByThread(session: SessionFacts): ToolCall[][] {
    const threadIdToCalls = new Map<string, ToolCall[]>();
    const workCalls = session.tools.filter(
      (call) => call.category === "shell" && !NormalizeUtil.isExplorationCommand(call.key),
    );
    for (const call of workCalls) {
      const threadCalls = threadIdToCalls.get(call.thread.id) ?? [];
      // Why: running the same command twice in a row (a retry) is one step.
      if (threadCalls.at(-1)?.key !== call.key) {
        threadCalls.push(call);
      }
      threadIdToCalls.set(call.thread.id, threadCalls);
    }
    return [...threadIdToCalls.values()];
  }

  /**
   * Why: Longest workflows first, so the whole procedure wins over its pieces: a shorter sequence inside a kept
   * one is dropped when the kept one happens in about as many sessions. Then the most widespread first.
   */
  private withoutSubsumed(candidates: WorkflowCandidate[]): WorkflowCandidate[] {
    const longestFirst = candidates.toSorted((left, right) => {
      const lengthDifference = right.steps.length - left.steps.length;
      return lengthDifference || this.runCountOf(right) - this.runCountOf(left);
    });
    const kept: WorkflowCandidate[] = [];
    for (const candidate of longestFirst) {
      const gram = candidate.steps.join(STEP_SEPARATOR);
      const isCovered = kept.some((keptWorkflow) => {
        const hasCandidateInside = keptWorkflow.steps.join(STEP_SEPARATOR).includes(gram);
        const minimumRuns = this.runCountOf(candidate) * SUBSUMED_SESSION_RATIO;
        return hasCandidateInside && this.runCountOf(keptWorkflow) >= minimumRuns;
      });
      if (!isCovered) {
        kept.push(candidate);
      }
    }
    return kept.sort((left, right) => {
      const sessionDifference = right.sessionIdToRuns.size - left.sessionIdToRuns.size;
      return sessionDifference || this.runCountOf(right) - this.runCountOf(left);
    });
  }

  private runCountOf(candidate: WorkflowCandidate): number {
    return [...candidate.sessionIdToRuns.values()].reduce((total, sessionRuns) => total + sessionRuns.length, 0);
  }

  private spanOf(calls: ToolCall[]): number {
    const lastCall = calls.at(-1);
    const endedAtMs = lastCall?.result?.returnedAtMs ?? lastCall?.calledAtMs ?? 0;
    return endedAtMs - (calls[0]?.calledAtMs ?? endedAtMs);
  }

  // Why: a script still runs the commands and still takes one call; what it saves is everything the agent did
  // around them: the other messages in the window (reasoning, reading logs, rebuilding the next step).
  private workflowCost(calls: ToolCall[], index: SessionIndex): StepCost {
    const first = calls[0];
    const last = calls.at(-1);
    const startAtMs = first?.calledAtMs;
    const endAtMs = last?.result?.returnedAtMs ?? last?.calledAtMs;
    if (!first || startAtMs === undefined || endAtMs === undefined) {
      return {
        activeMs: 0,
        usage: TokenUsageUtil.zero(),
      };
    }
    const windowMessages = (index.threadIdToMessages.get(first.thread.id) ?? []).filter((message) => {
      const sentAtMs = message.sentAtMs ?? 0;
      return message.id !== first.messageId && sentAtMs >= startAtMs && sentAtMs <= endAtMs;
    });
    const eventsAtMs = [startAtMs, ...windowMessages.map((message) => message.sentAtMs ?? startAtMs), endAtMs]
      .sort((left, right) => left - right);
    const executionMs = calls.reduce((total, call) => total + this.executionMsOf(call), 0);
    return {
      activeMs: Math.max(0, TimeUtil.activeTime(eventsAtMs, this.options.idleMs) - executionMs),
      usage: TokenUsageUtil.sum(windowMessages.map((message) => message.usage)),
      model: windowMessages[0]?.model,
    };
  }

  private executionMsOf(call: ToolCall): number {
    const durationMs = (call.result?.returnedAtMs ?? call.calledAtMs ?? 0) - (call.calledAtMs ?? 0);
    return Math.min(this.options.idleMs, Math.max(0, durationMs));
  }
}
