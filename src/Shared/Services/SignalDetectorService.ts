// Detectors over session facts. Each one adds occurrences of one kind of pattern to the collector,
// with the cost it estimates for each occurrence. Every number comes from the transcripts (ADR 0002).

import type { SessionIndex } from "@/Shared/Protocols/AnalysisProtocol.js";
import type { ApiError, SessionFacts, ToolCall, UserPrompt } from "@/Shared/Protocols/SessionProtocol.js";
import type { Occurrence, SignalOptions, SignalType, StepCost } from "@/Shared/Protocols/SignalProtocol.js";
import { CollectionUtil } from "@/Shared/Utils/CollectionUtil.js";
import { HashUtil } from "@/Shared/Utils/HashUtil.js";
import { NormalizeUtil } from "@/Shared/Utils/NormalizeUtil.js";
import { NumberUtil } from "@/Shared/Utils/NumberUtil.js";
import { RedactUtil } from "@/Shared/Utils/RedactUtil.js";
import { SessionUtil } from "@/Shared/Utils/SessionUtil.js";
import { TimeUtil } from "@/Shared/Utils/TimeUtil.js";
import { TokenUsageUtil } from "@/Shared/Utils/TokenUsageUtil.js";
import { AttributionService } from "./AttributionService.js";
import type { OccurrenceCollectorService } from "./OccurrenceCollectorService.js";

const ERROR_HASH_CHARS = 6;
const REQUEST_HASH_CHARS = 8;
const MAX_FAILURE_EXCERPT_CHARS = 240;
const ASKED_EXCERPT_CHARS = 90;
const REPLY_EXCERPT_CHARS = 110;
const TITLE_EXCERPT_CHARS = 80;
const EXAMPLE_EXCERPT_CHARS = 200;
/** A failure counts as recovered when one of the next few commands in the thread succeeds. */
const RECOVERY_WINDOW_CALLS = 3;
const MIN_REQUEST_WORDS = 3;
const MAX_REQUEST_CHARS = 600;
/** Commands that change files on disk, so reading a file again afterwards is legitimate. */
const FILE_CHANGING_COMMAND = /\b(git (checkout|pull|merge|rebase|stash)|sed -i|prettier|eslint --fix|npm run format)/;

interface CandidateRequest {
  session: SessionFacts;
  prompt: UserPrompt;
  words: Set<string>;
}

export class SignalDetectorService {
  constructor(
    private readonly options: SignalOptions,
    private readonly attribution: AttributionService,
    private readonly collector: OccurrenceCollectorService,
  ) {}

  /** Runs every per-session detector. */
  detectInSession(session: SessionFacts, index: SessionIndex): void {
    this.detectToolFailures(session, index);
    this.detectRepeatedReads(session, index);
    this.detectSubagentRereads(session, index);
    this.detectCorrectionsAndInterruptions(session, index);
    this.detectApiErrors(session, index);
  }

  /** Greedy clustering of prompts by word-set similarity; a cluster seen in enough sessions is a repeated request. */
  detectRepeatedRequests(sessions: SessionFacts[]): void {
    const thresholds = this.options.thresholds;
    const clusters: CandidateRequest[][] = [];
    for (const candidate of this.candidateRequests(sessions)) {
      const similarCluster = clusters.find((cluster) => {
        const seedWords = cluster[0]?.words;
        const similarity = seedWords === undefined ? 0 : NormalizeUtil.jaccard(seedWords, candidate.words);
        return similarity >= thresholds.repeatedRequestSimilarity;
      });
      if (similarCluster) {
        similarCluster.push(candidate);
      } else {
        clusters.push([candidate]);
      }
    }
    for (const cluster of clusters) {
      const seed = cluster[0];
      const sessionIds = new Set(cluster.map((candidate) => candidate.session.sessionId));
      if (!seed || sessionIds.size < thresholds.minRepeatedRequestSessions) {
        continue;
      }
      const label = seed.prompt.text;
      const signalId = `repeated_request:${HashUtil.sha(label, REQUEST_HASH_CHARS)}`;
      const title = `Similar request in ${sessionIds.size} sessions: "${RedactUtil.excerpt(label, TITLE_EXCERPT_CHARS)}"`;
      const commands = CollectionUtil.unique(
        cluster.map((candidate) => candidate.prompt.command).filter((command) => command !== undefined),
      );
      for (const candidate of this.firstPerSession(cluster)) {
        const group = this.collector.add(signalId, "repeated_request", title, {
          session: candidate.session,
          ref: candidate.prompt.ref,
          pieces: [AttributionService.MAIN_PIECE],
          activeMs: 0,
          usage: TokenUsageUtil.zero(),
        });
        group.details.example = RedactUtil.excerpt(label, EXAMPLE_EXCERPT_CHARS);
        group.details.commands = commands;
      }
    }
  }

  private detectToolFailures(session: SessionFacts, index: SessionIndex): void {
    const threadIdToCommands = new Map<string, ToolCall[]>();
    for (const call of session.tools.filter((toolCall) => toolCall.category === "shell")) {
      CollectionUtil.pushTo(threadIdToCommands, call.thread.id, call);
    }
    for (const call of session.tools) {
      const result = call.result;
      // Interrupted calls are counted with the user's interruptions.
      if (!result?.isError || result.kind === "interrupted") {
        continue;
      }
      const occurrence: Occurrence = {
        session,
        ref: {
          ...call.ref,
          excerpt: `${call.summary} → ${result.ref.excerpt ?? ""}`.slice(0, MAX_FAILURE_EXCERPT_CHARS),
        },
        pieces: index.toolCallIdToPieces.get(call.id) ?? [AttributionService.MAIN_PIECE],
        ...this.reactionCost(call, index),
      };
      const errorHead = result.errorHead ?? "error";
      if (result.kind === "user_rejected") {
        // The person said no to the call (a plan, a command): that is a correction of the turn, not a failure.
        const attributedTo = occurrence.pieces.join(",");
        const title = `User corrected the agent (${attributedTo})`;
        this.collector.add(`user_correction:${attributedTo}`, "user_correction", title, {
          ...occurrence,
          ref: {
            ...occurrence.ref,
            excerpt: `rejected ${call.summary} → ${result.ref.excerpt ?? ""}`.slice(0, MAX_FAILURE_EXCERPT_CHARS),
          },
        });
      } else if (result.kind === "permission_denied") {
        const title = `Permission denied for ${call.key}`;
        const group = this.collector.add(`permission_denied:${call.key}`, "permission_denied", title, occurrence);
        this.collector.count(group, "errors", errorHead);
      } else if (result.kind === "hook_blocked") {
        this.collector.add(`hook_blocked:${call.key}`, "hook_blocked", `Hook blocked ${call.key}`, occurrence);
      } else if (call.category === "shell") {
        const title = `Command fails: ${call.key}`;
        const group = this.collector.add(`failed_command:${call.key}`, "failed_command", title, occurrence);
        this.collector.count(group, "errors", errorHead);
        const recoveredWith = this.recoveryOf(call, threadIdToCommands.get(call.thread.id) ?? []);
        if (recoveredWith) {
          this.collector.count(group, "recoveredWith", recoveredWith);
        }
      } else {
        const signalId = `tool_error:${call.key}:${HashUtil.sha(errorHead, ERROR_HASH_CHARS)}`;
        const group = this.collector.add(signalId, "tool_error", `${call.key} error: ${errorHead}`, occurrence);
        group.details.tool = call.key;
        group.details.error = errorHead;
      }
    }
  }

  /** Failed model API requests: a wrong model name or expired credentials are harness problems. */
  private detectApiErrors(session: SessionFacts, index: SessionIndex): void {
    for (const apiError of session.apiErrors) {
      const isSubagent = !SessionUtil.isMainThread(apiError.thread);
      const piece = isSubagent
        ? this.attribution.pieceIdFor("agent", apiError.thread.agentType)
        : AttributionService.MAIN_PIECE;
      const title = `Model API error: ${apiError.code}`;
      const group = this.collector.add(`api_error:${apiError.code}`, "api_error", title, {
        session,
        ref: apiError.ref,
        pieces: [piece],
        ...this.apiErrorCost(apiError, index),
      });
      if (apiError.model) {
        this.collector.count(group, "models", RedactUtil.redact(apiError.model));
      }
    }
  }

  private detectRepeatedReads(session: SessionFacts, index: SessionIndex): void {
    const thresholds = this.options.thresholds;
    const threadFileToReads = new Map<string, ToolCall[]>();
    for (const call of session.tools.filter((toolCall) => this.isSuccessfulRead(toolCall))) {
      CollectionUtil.pushTo(threadFileToReads, `${call.thread.id}\u0000${call.filePath ?? ""}`, call);
    }
    for (const reads of threadFileToReads.values()) {
      const [firstRead] = reads;
      if (!firstRead || reads.length < thresholds.minReadsPerFile) {
        continue;
      }
      const extraReads = reads.slice(1).filter((read) => !this.wasChangedBetween(session, firstRead, read));
      if (extraReads.length < thresholds.minExtraReads) {
        continue;
      }
      // One signal per agent: the finding is "this agent re-reads files"; which files is a detail.
      const agentType = firstRead.thread.agentType;
      const filePath = firstRead.filePath ?? "";
      for (const read of extraReads) {
        const title = `${agentType} re-reads files it already read`;
        const group = this.collector.add(`repeated_read:${agentType}`, "repeated_read", title, {
          session,
          ref: read.ref,
          pieces: index.toolCallIdToPieces.get(read.id) ?? [AttributionService.MAIN_PIECE],
          ...this.readCost(read, index),
        });
        this.collector.count(group, "files", filePath);
      }
    }
  }

  private detectSubagentRereads(session: SessionFacts, index: SessionIndex): void {
    const reads = session.tools.filter((call) => this.isSuccessfulRead(call));
    const mainThreadReads = reads.filter((call) => SessionUtil.isMainThread(call.thread));
    const subagentReads = reads.filter((call) => !SessionUtil.isMainThread(call.thread));
    for (const read of subagentReads) {
      const wasReadByMainBefore = mainThreadReads.some(
        (mainRead) => mainRead.filePath === read.filePath && (mainRead.calledAtMs ?? 0) <= (read.calledAtMs ?? 0),
      );
      if (!wasReadByMainBefore) {
        continue;
      }
      const agentType = read.thread.agentType;
      const title = `Subagent ${agentType} re-reads files the main thread already read`;
      const group = this.collector.add(`subagent_reread:${agentType}`, "subagent_reread", title, {
        session,
        ref: read.ref,
        pieces: [this.attribution.pieceIdFor("agent", agentType)],
        ...this.readCost(read, index),
      });
      this.collector.count(group, "files", read.filePath ?? "");
    }
  }

  private detectCorrectionsAndInterruptions(session: SessionFacts, index: SessionIndex): void {
    session.prompts.forEach((prompt, promptIndex) => {
      if (!prompt.isCorrection && !prompt.isInterruption) {
        return;
      }
      const previousPrompt = session.prompts[promptIndex - 1];
      const pieces = index.promptToPreviousTurnPieces.get(prompt) ?? [AttributionService.MAIN_PIECE];
      const attributedTo = pieces.join(",");
      const type: SignalType = prompt.isInterruption ? "interruption" : "user_correction";
      const title = prompt.isInterruption
        ? `User interrupted the agent (${attributedTo})`
        : `User corrected the agent (${attributedTo})`;
      const askedExcerpt = previousPrompt ? RedactUtil.excerpt(previousPrompt.text, ASKED_EXCERPT_CHARS) : undefined;
      const conversationExcerpt = askedExcerpt === undefined
        ? prompt.ref.excerpt
        : `asked: "${askedExcerpt}" → then: "${RedactUtil.excerpt(prompt.text, REPLY_EXCERPT_CHARS)}"`;
      this.collector.add(`${type}:${attributedTo}`, type, title, {
        session,
        ref: {
          ...prompt.ref,
          excerpt: conversationExcerpt,
        },
        pieces,
        ...this.correctedTurnCost(index, previousPrompt?.sentAtMs, prompt.sentAtMs),
      });
    });
  }

  private candidateRequests(sessions: SessionFacts[]): CandidateRequest[] {
    return sessions.flatMap((session) =>
      session.prompts
        .filter((prompt) => !prompt.isInterruption && !prompt.isCorrection && prompt.text.length <= MAX_REQUEST_CHARS)
        .map((prompt) => ({
          session,
          prompt,
          words: NormalizeUtil.wordSet(prompt.text),
        }))
        .filter((candidate) => candidate.words.size >= MIN_REQUEST_WORDS),
    );
  }

  private firstPerSession(cluster: CandidateRequest[]): CandidateRequest[] {
    const seenSessionIds = new Set<string>();
    return cluster.filter((candidate) => {
      const isFirst = !seenSessionIds.has(candidate.session.sessionId);
      seenSessionIds.add(candidate.session.sessionId);
      return isFirst;
    });
  }

  private isSuccessfulRead(call: ToolCall): boolean {
    return call.category === "read" && call.filePath !== undefined && call.result?.isError !== true;
  }

  /** Cost of a failed step: time until the agent reacted, and the tokens of the turn spent reacting. */
  private reactionCost(call: ToolCall, index: SessionIndex): StepCost {
    const threadMessages = index.threadIdToMessages.get(call.thread.id) ?? [];
    const resultAtMs = call.result?.returnedAtMs ?? call.calledAtMs ?? 0;
    const reaction = threadMessages.find(
      (message) => (message.sentAtMs ?? 0) >= resultAtMs && message.id !== call.messageId,
    );
    const reactedAtMs = reaction?.sentAtMs ?? resultAtMs;
    const elapsedMs = call.calledAtMs === undefined ? 0 : Math.max(0, reactedAtMs - call.calledAtMs);
    return {
      activeMs: Math.min(this.options.idleMs, elapsedMs),
      usage: reaction?.usage ?? TokenUsageUtil.zero(),
      model: reaction?.model,
    };
  }

  /** Wait until the thread got a real answer after the failed request (retries and fallbacks). */
  private apiErrorCost(apiError: ApiError, index: SessionIndex): StepCost {
    const failedAtMs = apiError.occurredAtMs ?? 0;
    const answer = (index.threadIdToMessages.get(apiError.thread.id) ?? []).find(
      (message) => message.model !== undefined && (message.sentAtMs ?? 0) > failedAtMs,
    );
    const elapsedMs = answer?.sentAtMs === undefined ? 0 : answer.sentAtMs - failedAtMs;
    return {
      activeMs: Math.min(this.options.idleMs, Math.max(0, elapsedMs)),
      usage: TokenUsageUtil.zero(),
      model: answer?.model,
    };
  }

  /** Cost of an unnecessary read: its duration and the tokens it added to the context. */
  private readCost(read: ToolCall, index: SessionIndex): StepCost {
    const durationMs = (read.result?.returnedAtMs ?? 0) - (read.calledAtMs ?? 0);
    return {
      activeMs: Math.min(this.options.idleMs, Math.max(0, durationMs)),
      usage: {
        ...TokenUsageUtil.zero(),
        input: NumberUtil.charsToTokens(read.result?.contentChars ?? 0),
      },
      model: index.threadIdToMessages.get(read.thread.id)?.[0]?.model,
    };
  }

  /** Cost of a turn the user corrected or interrupted (an upper bound): main-thread time and tokens in it. */
  private correctedTurnCost(index: SessionIndex, turnStartAtMs?: number, turnEndAtMs?: number): StepCost {
    if (turnStartAtMs === undefined || turnEndAtMs === undefined) {
      return {
        activeMs: 0,
        usage: TokenUsageUtil.zero(),
      };
    }
    const mainMessages = index.threadIdToMessages.get(SessionUtil.MAIN_THREAD_ID) ?? [];
    const turnMessages = mainMessages.filter((message) => {
      const sentAtMs = message.sentAtMs ?? 0;
      return sentAtMs > turnStartAtMs && sentAtMs <= turnEndAtMs;
    });
    const eventsAtMs = [turnStartAtMs, ...turnMessages.map((message) => message.sentAtMs ?? turnStartAtMs)]
      .sort((left, right) => left - right);
    return {
      activeMs: TimeUtil.activeTime(eventsAtMs, this.options.idleMs),
      usage: turnMessages.reduce((total, message) => TokenUsageUtil.add(total, message.usage), TokenUsageUtil.zero()),
      model: turnMessages[0]?.model,
    };
  }

  /** The command that worked after a failure: the next successful command in the thread, if it is a different one. */
  private recoveryOf(failedCall: ToolCall, threadCommands: ToolCall[]): string | undefined {
    const failedIndex = threadCommands.indexOf(failedCall);
    const nextCommands = threadCommands.slice(failedIndex + 1, failedIndex + 1 + RECOVERY_WINDOW_CALLS);
    const firstSuccess = nextCommands.find((call) => call.result !== undefined && !call.result.isError);
    return firstSuccess && firstSuccess.key !== failedCall.key ? firstSuccess.key : undefined;
  }

  /** Reading a file again is legitimate after it was edited or changed by a command in between. */
  private wasChangedBetween(session: SessionFacts, firstRead: ToolCall, laterRead: ToolCall): boolean {
    const fromAtMs = firstRead.calledAtMs ?? 0;
    const toAtMs = laterRead.calledAtMs ?? 0;
    return session.tools.some((call) => {
      const calledAtMs = call.calledAtMs ?? 0;
      const isSameThread = call.thread.id === firstRead.thread.id;
      const isEditOfFile = call.category === "edit" && call.filePath === firstRead.filePath;
      const isFileChangingCommand = call.category === "shell" && FILE_CHANGING_COMMAND.test(call.summary);
      const isBetween = calledAtMs >= fromAtMs && calledAtMs <= toAtMs;
      return isSameThread && isBetween && (isEditOfFile || isFileChangingCommand);
    });
  }
}
