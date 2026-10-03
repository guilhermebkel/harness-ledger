import type { SessionIndex } from "@/Shared/Protocols/AnalysisProtocol.js";
import type { ApiError, ContextCompaction, SessionFacts, ToolCall, UserPrompt } from "@/Shared/Protocols/SessionProtocol.js";
import type {
  FailureChain,
  Occurrence,
  OccurrenceGroup,
  SignalOptions,
  SignalType,
  StepCost,
} from "@/Shared/Protocols/SignalProtocol.js";
import { CollectionUtil } from "@/Shared/Utils/CollectionUtil.js";
import { HashUtil } from "@/Shared/Utils/HashUtil.js";
import { NormalizeUtil } from "@/Shared/Utils/NormalizeUtil.js";
import { NumberUtil } from "@/Shared/Utils/NumberUtil.js";
import { RedactUtil } from "@/Shared/Utils/RedactUtil.js";
import { SessionUtil } from "@/Shared/Utils/SessionUtil.js";
import { TimeUtil } from "@/Shared/Utils/TimeUtil.js";
import { TokenUsageUtil } from "@/Shared/Utils/TokenUsageUtil.js";
import { AttributionService } from "./AttributionService.js";
import { FailureChainService } from "./FailureChainService.js";
import type { OccurrenceCollectorService } from "./OccurrenceCollectorService.js";

const ERROR_HASH_CHARS = 6;
const REQUEST_HASH_CHARS = 8;
const MAX_FAILURE_EXCERPT_CHARS = 240;
const ASKED_EXCERPT_CHARS = 90;
const REPLY_EXCERPT_CHARS = 110;
const TITLE_EXCERPT_CHARS = 80;
const EXAMPLE_EXCERPT_CHARS = 200;
const MIN_REQUEST_WORDS = 3;
const MAX_REQUEST_CHARS = 600;
// Why: after these commands, reading a file again is legitimate.
const FILE_CHANGING_COMMAND = /\b(git (checkout|pull|merge|rebase|stash)|sed -i|prettier|eslint --fix|npm run format)/;

interface CandidateRequest {
  session: SessionFacts;
  prompt: UserPrompt;
  words: Set<string>;
}

export class SignalDetectorService {
  private readonly failureChains: FailureChainService;
  private countedMessageIds = new Set<string>();

  constructor(
    private readonly options: SignalOptions,
    private readonly attribution: AttributionService,
    private readonly collector: OccurrenceCollectorService,
  ) {
    this.failureChains = new FailureChainService(options.idleMs);
  }

  // Why: failures run first and corrections last: a turn's messages already in a failure chain or a rejected
  // plan are left out of the correction that follows, so no turn is counted twice.
  detectInSession(session: SessionFacts, index: SessionIndex): void {
    this.countedMessageIds = new Set();
    this.detectToolFailures(session, index);
    this.detectRepeatedReads(session, index);
    this.detectSubagentRereads(session, index);
    this.detectCorrectionsAndInterruptions(session, index);
    this.detectApiErrors(session, index);
    this.detectCompactions(session, index);
  }

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
    const callIdToChain = new Map<string, FailureChain>();
    for (const chain of this.failureChains.chainsOf(session, index)) {
      for (const failure of chain.failures) {
        callIdToChain.set(failure.id, chain);
      }
      for (const messageId of chain.messageIds) {
        this.countedMessageIds.add(messageId);
      }
    }
    for (const call of session.tools) {
      const result = call.result;
      // Why: interrupted calls are counted with the user's interruptions.
      if (!result?.isError || result.kind === "interrupted") {
        continue;
      }
      const chain = callIdToChain.get(call.id);
      const occurrence: Occurrence = {
        session,
        ref: {
          ...call.ref,
          excerpt: `${call.summary} → ${result.ref.excerpt ?? ""}`.slice(0, MAX_FAILURE_EXCERPT_CHARS),
        },
        pieces: index.toolCallIdToPieces.get(call.id) ?? [AttributionService.MAIN_PIECE],
        ...this.failureCost(session, index, call, chain),
        isFixLoop: chain?.kind === "fix_loop",
      };
      const group = this.addFailure(call, occurrence);
      if (group && chain?.failures[0] === call) {
        this.addChainDetails(group, chain);
      }
    }
  }

  private addFailure(call: ToolCall, occurrence: Occurrence): OccurrenceGroup | undefined {
    const result = call.result;
    const errorHead = result?.errorHead ?? "error";
    if (result?.kind === "user_rejected") {
      // Why: the person said no to the call (a plan, a command): that is a correction of the turn, not a failure.
      const attributedTo = occurrence.pieces.join(",");
      const title = `User corrected the agent (${attributedTo})`;
      this.collector.add(`user_correction:${attributedTo}`, "user_correction", title, {
        ...occurrence,
        ref: {
          ...occurrence.ref,
          excerpt: `rejected ${call.summary} → ${result.ref.excerpt ?? ""}`.slice(0, MAX_FAILURE_EXCERPT_CHARS),
        },
      });
      return undefined;
    }
    if (result?.kind === "permission_denied") {
      const group = this.collector.add(`permission_denied:${call.key}`, "permission_denied", `Permission denied for ${call.key}`, occurrence);
      this.collector.count(group, "errors", errorHead);
      return group;
    }
    if (result?.kind === "hook_blocked") {
      return this.collector.add(`hook_blocked:${call.key}`, "hook_blocked", `Hook blocked ${call.key}`, occurrence);
    }
    if (call.category === "shell") {
      const group = this.collector.add(`failed_command:${call.key}`, "failed_command", `Command fails: ${call.key}`, occurrence);
      this.collector.count(group, "errors", errorHead);
      return group;
    }
    const signalId = `tool_error:${call.key}:${HashUtil.sha(errorHead, ERROR_HASH_CHARS)}`;
    const group = this.collector.add(signalId, "tool_error", `${call.key} error: ${errorHead}`, occurrence);
    group.details.tool = call.key;
    group.details.error = errorHead;
    return group;
  }

  private failureCost(session: SessionFacts, index: SessionIndex, call: ToolCall, chain?: FailureChain): StepCost {
    if (chain) {
      return SignalDetectorService.shareOf(chain);
    }
    // Why: a rejected plan costs the work that built it: from the turn's prompt (or the previous rejection)
    // until the rejection.
    const rejectedAtMs = call.result?.returnedAtMs ?? call.calledAtMs;
    const turnStartAtMs = [
      ...session.prompts.map((prompt) => prompt.sentAtMs),
      ...session.tools.filter((other) => other.result?.kind === "user_rejected").map((other) => other.result?.returnedAtMs),
    ]
      .filter((atMs): atMs is number => atMs !== undefined && rejectedAtMs !== undefined && atMs < rejectedAtMs)
      .reduce((latest, atMs) => Math.max(latest, atMs), Number.NEGATIVE_INFINITY);
    return this.turnCost(index, turnStartAtMs, rejectedAtMs);
  }

  // Why: a chain's cost is shared equally by its failures, so the totals add up to the chain once.
  private static shareOf(chain: FailureChain): StepCost {
    const share = 1 / chain.failures.length;
    return {
      activeMs: chain.cost.activeMs * share,
      usage: TokenUsageUtil.scale(chain.cost.usage, share),
      model: chain.cost.model,
    };
  }

  private addChainDetails(group: OccurrenceGroup, chain: FailureChain): void {
    const summary = group.details.chains ?? {
      chains: 0,
      recovered: 0,
      attempts: 0,
      fixLoops: 0,
    };
    summary.chains++;
    summary.attempts += chain.failures.length;
    summary.recovered += chain.recovery ? 1 : 0;
    summary.fixLoops += chain.kind === "fix_loop" ? 1 : 0;
    group.details.chains = summary;
    if (chain.kind === "wrong_command" && chain.recovery && chain.recovery.key !== chain.failures[0]?.key) {
      this.collector.count(group, "recoveredWith", chain.recovery.key);
    }
  }

  private detectCompactions(session: SessionFacts, index: SessionIndex): void {
    for (const compaction of session.compactions) {
      const isSubagent = !SessionUtil.isMainThread(compaction.thread);
      const piece = isSubagent
        ? this.attribution.pieceIdFor("agent", compaction.thread.agentType)
        : AttributionService.MAIN_PIECE;
      const turnsBefore = session.reported.turns.filter(
        (turn) => (turn.endedAtMs ?? 0) <= (compaction.occurredAtMs ?? 0),
      ).length;
      const title = compaction.trigger === "manual"
        ? "Context compacted by hand during long sessions"
        : "Sessions outgrow the context window and auto-compact";
      const group = this.collector.add(`context_compaction:${compaction.trigger}`, "context_compaction", title, {
        session,
        ref: {
          ...compaction.ref,
          excerpt: turnsBefore ? `${compaction.ref.excerpt ?? ""} after ${turnsBefore} turns` : compaction.ref.excerpt,
        },
        pieces: [piece],
        ...this.compactionCost(session, index, compaction),
      });
      const contextTokens = compaction.contextTokens ?? 0;
      group.details.maxContextTokens = Math.max(group.details.maxContextTokens ?? 0, contextTokens) || undefined;
    }
  }

  // Why: what a compaction costs is reading again, after it, the files the thread had read before it.
  private compactionCost(session: SessionFacts, index: SessionIndex, compaction: ContextCompaction): StepCost {
    const compactedAtMs = compaction.occurredAtMs ?? 0;
    const nextCompactionAtMs = session.compactions
      .filter((other) => other.thread.id === compaction.thread.id && (other.occurredAtMs ?? 0) > compactedAtMs)
      .reduce((earliest, other) => Math.min(earliest, other.occurredAtMs ?? Infinity), Infinity);
    const threadReads = session.tools
      .filter((call) => call.thread.id === compaction.thread.id && this.isSuccessfulRead(call));
    const filesReadBefore = new Set(threadReads
      .filter((call) => (call.calledAtMs ?? 0) < compactedAtMs)
      .map((call) => call.filePath));
    const seenFiles = new Set<string | undefined>();
    const rereads = threadReads.filter((call) => {
      const calledAtMs = call.calledAtMs ?? 0;
      const isAfterCompaction = calledAtMs > compactedAtMs && calledAtMs < nextCompactionAtMs;
      const isReread = isAfterCompaction && filesReadBefore.has(call.filePath);
      const isFirstReread = isReread && !seenFiles.has(call.filePath);
      seenFiles.add(isReread ? call.filePath : undefined);
      return isFirstReread;
    });
    const rereadCosts = rereads.map((read) => this.readCost(read, index));
    return {
      activeMs: rereadCosts.reduce((total, cost) => total + cost.activeMs, 0),
      usage: TokenUsageUtil.sum(rereadCosts.map((cost) => cost.usage)),
      model: rereadCosts[0]?.model,
    };
  }

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
    const threadFileToReads = new Map<string, ToolCall[]>();
    for (const call of session.tools.filter((toolCall) => this.isSuccessfulRead(toolCall))) {
      CollectionUtil.pushTo(threadFileToReads, `${call.thread.id}\u0000${call.filePath ?? ""}`, call);
    }
    for (const reads of threadFileToReads.values()) {
      // Why: one signal per agent: the finding is "this agent re-reads files"; which files is a detail.
      for (const read of this.extraReadsOf(session, reads)) {
        const agentType = read.thread.agentType;
        const filePath = read.filePath ?? "";
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

  private extraReadsOf(session: SessionFacts, reads: ToolCall[]): ToolCall[] {
    const thresholds = this.options.thresholds;
    const [firstRead] = reads;
    if (!firstRead || reads.length < thresholds.minReadsPerFile) {
      return [];
    }
    const extraReads = reads.slice(1).filter((read) => !this.wasChangedBetween(session, firstRead, read));
    return extraReads.length < thresholds.minExtraReads ? [] : extraReads;
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
        ...this.turnCost(index, previousPrompt?.sentAtMs, prompt.sentAtMs),
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

  // Why: cost of a failed request: the wait until the thread got a real answer (retries and fallbacks).
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

  // Why: cost of an unnecessary read: its duration and the tokens it added to the context.
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

  // Why: a turn's cost is an upper bound: every message of every thread in it, minus messages another signal
  // already counted. The messages it counts are then marked counted too.
  private turnCost(index: SessionIndex, turnStartAtMs?: number, turnEndAtMs?: number): StepCost {
    const isOpenTurn = turnStartAtMs === undefined || !Number.isFinite(turnStartAtMs);
    if (isOpenTurn || turnEndAtMs === undefined) {
      return {
        activeMs: 0,
        usage: TokenUsageUtil.zero(),
      };
    }
    const turnMessages = [...index.threadIdToMessages.values()].flat().filter((message) => {
      const sentAtMs = message.sentAtMs ?? 0;
      return !this.countedMessageIds.has(message.id) && sentAtMs > turnStartAtMs && sentAtMs <= turnEndAtMs;
    });
    for (const message of turnMessages) {
      this.countedMessageIds.add(message.id);
    }
    const eventsAtMs = [turnStartAtMs, ...turnMessages.map((message) => message.sentAtMs ?? turnStartAtMs)]
      .sort((left, right) => left - right);
    return {
      activeMs: TimeUtil.activeTime(eventsAtMs, this.options.idleMs),
      usage: TokenUsageUtil.sum(turnMessages.map((message) => message.usage)),
      model: turnMessages[0]?.model,
    };
  }

  // Why: reading a file again is legitimate after it was edited, changed by a command, or compacted out of context.
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
    }) || session.compactions.some((compaction) => {
      const compactedAtMs = compaction.occurredAtMs ?? 0;
      return compaction.thread.id === firstRead.thread.id && compactedAtMs >= fromAtMs && compactedAtMs <= toAtMs;
    });
  }
}
