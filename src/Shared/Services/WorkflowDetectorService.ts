// The same sequence of work commands in many sessions: a procedure the agent rebuilds by hand each time,
// which a script or a skill could do in one step. Exploration (ls, cat, grep...) is left out: reading
// around is not a procedure.

import type { SessionIndex } from "@/Shared/Protocols/AnalysisProtocol.js";
import type { SessionFacts, ToolCall } from "@/Shared/Protocols/SessionProtocol.js";
import type { Occurrence, SignalOptions, StepCost } from "@/Shared/Protocols/SignalProtocol.js";
import { CollectionUtil } from "@/Shared/Utils/CollectionUtil.js";
import { HashUtil } from "@/Shared/Utils/HashUtil.js";
import { NormalizeUtil } from "@/Shared/Utils/NormalizeUtil.js";
import { TimeUtil } from "@/Shared/Utils/TimeUtil.js";
import { TokenUsageUtil } from "@/Shared/Utils/TokenUsageUtil.js";
import { AttributionService } from "./AttributionService.js";
import type { OccurrenceCollectorService } from "./OccurrenceCollectorService.js";

const MAX_WORKFLOW_STEPS = 5;
const WORKFLOW_HASH_CHARS = 8;
const MAX_WORKFLOW_SIGNALS = 10;
const STEP_SEPARATOR = " → ";
/** A shorter sequence seen in about as many sessions as a longer one that contains it is the same workflow. */
const SUBSUMED_SESSION_RATIO = 0.75;
/** Steps spread over a longer stretch are separate pieces of work, not one procedure. */
const MAX_WORKFLOW_SPAN_MINUTES = 15;

interface WorkflowCandidate {
  steps: string[];
  /** The first time each session ran the sequence. */
  sessionIdToCalls: Map<string, ToolCall[]>;
}

export class WorkflowDetectorService {
  constructor(
    private readonly options: SignalOptions,
    private readonly collector: OccurrenceCollectorService,
  ) {}

  detect(sessions: SessionFacts[], sessionIdToIndex: Map<string, SessionIndex>): void {
    const candidates = this.candidatesOf(sessions)
      .filter((candidate) => candidate.sessionIdToCalls.size >= this.options.thresholds.minWorkflowSessions);
    const sessionIdToSession = new Map(sessions.map((session) => [session.sessionId, session]));
    for (const workflow of this.withoutSubsumed(candidates).slice(0, MAX_WORKFLOW_SIGNALS)) {
      const gram = workflow.steps.join(STEP_SEPARATOR);
      const title = `Same steps in ${workflow.sessionIdToCalls.size} sessions: ${gram}`;
      const signalId = `repeated_workflow:${HashUtil.sha(gram, WORKFLOW_HASH_CHARS)}`;
      for (const [sessionId, calls] of workflow.sessionIdToCalls) {
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

  /** Every run of distinct work commands, per thread, keeping the first time each session ran it. */
  private candidatesOf(sessions: SessionFacts[]): WorkflowCandidate[] {
    const gramToCandidate = new Map<string, WorkflowCandidate>();
    for (const session of sessions) {
      for (const calls of this.workCommandsByThread(session)) {
        for (let length = this.options.thresholds.minWorkflowSteps; length <= MAX_WORKFLOW_STEPS; length++) {
          for (let start = 0; start + length <= calls.length; start++) {
            const window = calls.slice(start, start + length);
            const steps = window.map((call) => call.key);
            const isTooSpread = this.spanOf(window) > MAX_WORKFLOW_SPAN_MINUTES * TimeUtil.MS_PER_MINUTE;
            if (new Set(steps).size < length || isTooSpread) {
              continue;
            }
            const gram = steps.join(STEP_SEPARATOR);
            const candidate = gramToCandidate.get(gram) ?? {
              steps,
              sessionIdToCalls: new Map<string, ToolCall[]>(),
            };
            if (!candidate.sessionIdToCalls.has(session.sessionId)) {
              candidate.sessionIdToCalls.set(session.sessionId, window);
            }
            gramToCandidate.set(gram, candidate);
          }
        }
      }
    }
    return [...gramToCandidate.values()];
  }

  private workCommandsByThread(session: SessionFacts): ToolCall[][] {
    const threadIdToCalls = new Map<string, ToolCall[]>();
    const workCalls = session.tools.filter(
      (call) => call.category === "shell" && !NormalizeUtil.isExplorationCommand(call.key),
    );
    for (const call of workCalls) {
      const threadCalls = threadIdToCalls.get(call.thread.id) ?? [];
      // Running the same command twice in a row (a retry) is one step.
      if (threadCalls.at(-1)?.key !== call.key) {
        threadCalls.push(call);
      }
      threadIdToCalls.set(call.thread.id, threadCalls);
    }
    return [...threadIdToCalls.values()];
  }

  /**
   * Longest workflows first, so the whole procedure wins over its pieces: a shorter sequence inside a kept
   * one is dropped when the kept one happens in about as many sessions. Then the most widespread first.
   */
  private withoutSubsumed(candidates: WorkflowCandidate[]): WorkflowCandidate[] {
    const longestFirst = [...candidates].sort((left, right) => {
      const lengthDifference = right.steps.length - left.steps.length;
      return lengthDifference || right.sessionIdToCalls.size - left.sessionIdToCalls.size;
    });
    const kept: WorkflowCandidate[] = [];
    for (const candidate of longestFirst) {
      const gram = candidate.steps.join(STEP_SEPARATOR);
      const isCovered = kept.some((keptWorkflow) => {
        const hasCandidateInside = keptWorkflow.steps.join(STEP_SEPARATOR).includes(gram);
        const minimumSessions = candidate.sessionIdToCalls.size * SUBSUMED_SESSION_RATIO;
        return hasCandidateInside && keptWorkflow.sessionIdToCalls.size >= minimumSessions;
      });
      if (!isCovered) {
        kept.push(candidate);
      }
    }
    return kept.sort((left, right) => right.sessionIdToCalls.size - left.sessionIdToCalls.size);
  }

  private spanOf(calls: ToolCall[]): number {
    const lastCall = calls.at(-1);
    const endedAtMs = lastCall?.result?.returnedAtMs ?? lastCall?.calledAtMs ?? 0;
    return endedAtMs - (calls[0]?.calledAtMs ?? endedAtMs);
  }

  /** Time from the first step until the last one returned, and the tokens of the messages that issued the steps. */
  private workflowCost(calls: ToolCall[], index: SessionIndex): StepCost {
    const messageIds = new Set(calls.map((call) => call.messageId));
    const stepMessages = (index.threadIdToMessages.get(calls[0]?.thread.id ?? "") ?? [])
      .filter((message) => messageIds.has(message.id));
    return {
      activeMs: Math.min(this.options.idleMs * calls.length, Math.max(0, this.spanOf(calls))),
      usage: stepMessages.reduce((total, message) => TokenUsageUtil.add(total, message.usage), TokenUsageUtil.zero()),
      model: stepMessages[0]?.model,
    };
  }
}
