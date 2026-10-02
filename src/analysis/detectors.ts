// Detectors over session facts. Each one adds occurrences of one kind of pattern to the collector,
// with the cost it estimates for each occurrence. Every number comes from the transcripts (ADR 0002).

import { jaccard, wordSet } from "../core/normalize.js";
import { excerpt } from "../core/redact.js";
import { activeTime } from "../core/time.js";
import { MAIN_THREAD_ID, type SessionFacts, type TokenUsage, type ToolCall, type UserPrompt } from "../core/types.js";
import { sha, unique } from "../core/util.js";
import { MAIN_PIECE, pieceIdFor, type SessionIndex } from "./attribution.js";
import { addUsage, ZERO_USAGE } from "./cost.js";
import { countDetail, type OccurrenceCollector, type SignalOptions, type SignalType } from "./signal-model.js";

const CHARS_PER_TOKEN = 4;
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
const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
/** Commands that change files on disk, so reading a file again afterwards is legitimate. */
const FILE_CHANGING_COMMAND = /\b(git (checkout|pull|merge|rebase|stash)|sed -i|prettier|eslint --fix|npm run format)/;

interface StepCost {
  activeMs: number;
  usage: TokenUsage;
  model?: string;
}

export interface DetectorContext {
  session: SessionFacts;
  index: SessionIndex;
  pieceIds: Set<string>;
  options: SignalOptions;
  collector: OccurrenceCollector;
}

export function detectToolFailures(context: DetectorContext): void {
  const { session, index, collector } = context;
  const threadIdToCommands = new Map<string, ToolCall[]>();
  for (const call of session.tools.filter((toolCall) => toolCall.name === "Bash")) {
    const threadCommands = threadIdToCommands.get(call.thread.id) ?? [];
    threadCommands.push(call);
    threadIdToCommands.set(call.thread.id, threadCommands);
  }
  for (const call of session.tools) {
    const result = call.result;
    // Interrupted calls are counted with the user's interruptions.
    if (!result?.isError || result.kind === "interrupted") {
      continue;
    }
    const occurrence = {
      session,
      ref: {
        ...call.ref,
        excerpt: `${call.summary} → ${result.ref.excerpt ?? ""}`.slice(0, MAX_FAILURE_EXCERPT_CHARS),
      },
      pieces: index.toolCallIdToPieces.get(call.id) ?? [MAIN_PIECE],
      ...reactionCost(call, index, context.options.idleMs),
    };
    const errorHead = result.errorHead ?? "error";
    if (result.kind === "permission_denied") {
      const title = `Permission denied for ${call.key}`;
      collector.add(`permission_denied:${call.key}`, "permission_denied", title, occurrence);
    } else if (result.kind === "hook_blocked") {
      collector.add(`hook_blocked:${call.key}`, "hook_blocked", `Hook blocked ${call.key}`, occurrence);
    } else if (call.name === "Bash") {
      const title = `Command fails: ${call.key}`;
      const group = collector.add(`failed_command:${call.key}`, "failed_command", title, occurrence);
      countDetail(group, "errors", errorHead);
      const recoveredWith = recoveryOf(call, threadIdToCommands.get(call.thread.id) ?? []);
      if (recoveredWith) {
        countDetail(group, "recoveredWith", recoveredWith);
      }
    } else {
      const signalId = `tool_error:${call.key}:${sha(errorHead, ERROR_HASH_CHARS)}`;
      const group = collector.add(signalId, "tool_error", `${call.key} error: ${errorHead}`, occurrence);
      group.details.tool = call.key;
      group.details.error = errorHead;
    }
  }
}

export function detectRepeatedReads(context: DetectorContext): void {
  const { session, index, options, collector } = context;
  const threadFileToReads = new Map<string, ToolCall[]>();
  for (const call of session.tools.filter(isSuccessfulRead)) {
    const threadFileKey = `${call.thread.id}\u0000${call.filePath ?? ""}`;
    const reads = threadFileToReads.get(threadFileKey) ?? [];
    reads.push(call);
    threadFileToReads.set(threadFileKey, reads);
  }
  for (const reads of threadFileToReads.values()) {
    const [firstRead] = reads;
    if (!firstRead || reads.length < options.thresholds.minReadsPerFile) {
      continue;
    }
    const extraReads = reads.slice(1).filter((read) => !wasChangedBetween(session, firstRead, read));
    if (extraReads.length < options.thresholds.minExtraReads) {
      continue;
    }
    const agentType = firstRead.thread.agentType;
    const filePath = firstRead.filePath ?? "";
    for (const read of extraReads) {
      collector.add(`repeated_read:${agentType}:${filePath}`, "repeated_read", `Re-reads ${filePath} (${agentType})`, {
        session,
        ref: read.ref,
        pieces: index.toolCallIdToPieces.get(read.id) ?? [MAIN_PIECE],
        ...readCost(read, index, options.idleMs),
      });
    }
  }
}

export function detectSubagentRereads(context: DetectorContext): void {
  const { session, index, pieceIds, options, collector } = context;
  const mainThreadReads = session.tools.filter((call) => call.thread.id === MAIN_THREAD_ID && isSuccessfulRead(call));
  const subagentReads = session.tools.filter((call) => call.thread.id !== MAIN_THREAD_ID && isSuccessfulRead(call));
  for (const read of subagentReads) {
    const wasReadByMainBefore = mainThreadReads.some(
      (mainRead) => mainRead.filePath === read.filePath && (mainRead.calledAtMs ?? 0) <= (read.calledAtMs ?? 0),
    );
    if (!wasReadByMainBefore) {
      continue;
    }
    const agentType = read.thread.agentType;
    const title = `Subagent ${agentType} re-reads files the main thread already read`;
    const group = collector.add(`subagent_reread:${agentType}`, "subagent_reread", title, {
      session,
      ref: read.ref,
      pieces: [pieceIdFor("agent", agentType, pieceIds)],
      ...readCost(read, index, options.idleMs),
    });
    countDetail(group, "files", read.filePath ?? "");
  }
}

export function detectCorrectionsAndInterruptions(context: DetectorContext): void {
  const { session, index, options, collector } = context;
  session.prompts.forEach((prompt, promptIndex) => {
    if (!prompt.isCorrection && !prompt.isInterruption) {
      return;
    }
    const previousPrompt = session.prompts[promptIndex - 1];
    const pieces = index.promptToPreviousTurnPieces.get(prompt) ?? [MAIN_PIECE];
    const attributedTo = pieces.join(",");
    const type: SignalType = prompt.isInterruption ? "interruption" : "user_correction";
    const title = prompt.isInterruption
      ? `User interrupted the agent (${attributedTo})`
      : `User corrected the agent (${attributedTo})`;
    const askedExcerpt = previousPrompt ? excerpt(previousPrompt.text, ASKED_EXCERPT_CHARS) : undefined;
    const conversationExcerpt = askedExcerpt === undefined
      ? prompt.ref.excerpt
      : `asked: "${askedExcerpt}" → then: "${excerpt(prompt.text, REPLY_EXCERPT_CHARS)}"`;
    collector.add(`${type}:${attributedTo}`, type, title, {
      session,
      ref: {
        ...prompt.ref,
        excerpt: conversationExcerpt,
      },
      pieces,
      ...correctedTurnCost(index, previousPrompt?.sentAtMs, prompt.sentAtMs, options.idleMs),
    });
  });
}

interface CandidateRequest {
  session: SessionFacts;
  prompt: UserPrompt;
  words: Set<string>;
}

/** Greedy clustering of prompts by word-set similarity; a cluster seen in enough sessions is a repeated request. */
export function detectRepeatedRequests(
  sessions: SessionFacts[],
  options: SignalOptions,
  collector: OccurrenceCollector,
): void {
  const candidates: CandidateRequest[] = sessions.flatMap((session) =>
    session.prompts
      .filter((prompt) => !prompt.isInterruption && !prompt.isCorrection && prompt.text.length <= MAX_REQUEST_CHARS)
      .map((prompt) => ({
        session,
        prompt,
        words: wordSet(prompt.text),
      }))
      .filter((candidate) => candidate.words.size >= MIN_REQUEST_WORDS),
  );
  const clusters: CandidateRequest[][] = [];
  for (const candidate of candidates) {
    const similarCluster = clusters.find((cluster) => {
      const seedWords = cluster[0]?.words;
      const similarity = seedWords === undefined ? 0 : jaccard(seedWords, candidate.words);
      return similarity >= options.thresholds.repeatedRequestSimilarity;
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
    if (!seed || sessionIds.size < options.thresholds.minRepeatedRequestSessions) {
      continue;
    }
    const label = seed.prompt.text;
    const signalId = `repeated_request:${sha(label, REQUEST_HASH_CHARS)}`;
    const title = `Similar request in ${sessionIds.size} sessions: "${excerpt(label, TITLE_EXCERPT_CHARS)}"`;
    const commands = unique(
      cluster.map((candidate) => candidate.prompt.command).filter((command) => command !== undefined),
    );
    for (const candidate of firstPerSession(cluster)) {
      const group = collector.add(signalId, "repeated_request", title, {
        session: candidate.session,
        ref: candidate.prompt.ref,
        pieces: [MAIN_PIECE],
        activeMs: 0,
        usage: ZERO_USAGE,
      });
      group.details.example = excerpt(label, EXAMPLE_EXCERPT_CHARS);
      group.details.commands = commands;
    }
  }
}

function firstPerSession(cluster: CandidateRequest[]): CandidateRequest[] {
  const seenSessionIds = new Set<string>();
  return cluster.filter((candidate) => {
    const isFirst = !seenSessionIds.has(candidate.session.sessionId);
    seenSessionIds.add(candidate.session.sessionId);
    return isFirst;
  });
}

function isSuccessfulRead(call: ToolCall): boolean {
  return call.name === "Read" && call.filePath !== undefined && call.result?.isError !== true;
}

/** Cost of a failed step: time until the agent reacted, and the tokens of the turn spent reacting. */
function reactionCost(call: ToolCall, index: SessionIndex, idleMs: number): StepCost {
  const threadMessages = index.threadIdToMessages.get(call.thread.id) ?? [];
  const resultAtMs = call.result?.returnedAtMs ?? call.calledAtMs ?? 0;
  const reaction = threadMessages.find(
    (message) => (message.sentAtMs ?? 0) >= resultAtMs && message.id !== call.messageId,
  );
  const reactedAtMs = reaction?.sentAtMs ?? resultAtMs;
  const activeMs = call.calledAtMs === undefined ? 0 : Math.min(idleMs, Math.max(0, reactedAtMs - call.calledAtMs));
  return {
    activeMs,
    usage: reaction?.usage ?? ZERO_USAGE,
    model: reaction?.model,
  };
}

/** Cost of an unnecessary read: its duration and the tokens it added to the context. */
function readCost(read: ToolCall, index: SessionIndex, idleMs: number): StepCost {
  const durationMs = (read.result?.returnedAtMs ?? 0) - (read.calledAtMs ?? 0);
  return {
    activeMs: Math.min(idleMs, Math.max(0, durationMs)),
    usage: {
      ...ZERO_USAGE,
      input: Math.round((read.result?.contentChars ?? 0) / CHARS_PER_TOKEN),
    },
    model: index.threadIdToMessages.get(read.thread.id)?.[0]?.model,
  };
}

/** Cost of a turn the user corrected or interrupted (an upper bound): main-thread time and tokens in it. */
function correctedTurnCost(
  index: SessionIndex,
  turnStartAtMs: number | undefined,
  turnEndAtMs: number | undefined,
  idleMs: number,
): StepCost {
  if (turnStartAtMs === undefined || turnEndAtMs === undefined) {
    return {
      activeMs: 0,
      usage: ZERO_USAGE,
    };
  }
  const turnMessages = (index.threadIdToMessages.get(MAIN_THREAD_ID) ?? []).filter((message) => {
    const sentAtMs = message.sentAtMs ?? 0;
    return sentAtMs > turnStartAtMs && sentAtMs <= turnEndAtMs;
  });
  const eventsAtMs = [turnStartAtMs, ...turnMessages.map((message) => message.sentAtMs ?? turnStartAtMs)].sort(
    (left, right) => left - right,
  );
  return {
    activeMs: activeTime(eventsAtMs, idleMs),
    usage: turnMessages.reduce((total, message) => addUsage(total, message.usage), ZERO_USAGE),
    model: turnMessages[0]?.model,
  };
}

/** The command that worked after a failure: the next successful command in the thread, if it is a different one. */
function recoveryOf(failedCall: ToolCall, threadCommands: ToolCall[]): string | undefined {
  const failedIndex = threadCommands.indexOf(failedCall);
  const nextCommands = threadCommands.slice(failedIndex + 1, failedIndex + 1 + RECOVERY_WINDOW_CALLS);
  const firstSuccess = nextCommands.find((call) => call.result !== undefined && !call.result.isError);
  return firstSuccess && firstSuccess.key !== failedCall.key ? firstSuccess.key : undefined;
}

/** Reading a file again is legitimate after it was edited or changed by a command in between. */
function wasChangedBetween(session: SessionFacts, firstRead: ToolCall, laterRead: ToolCall): boolean {
  const fromAtMs = firstRead.calledAtMs ?? 0;
  const toAtMs = laterRead.calledAtMs ?? 0;
  return session.tools.some((call) => {
    const calledAtMs = call.calledAtMs ?? 0;
    const isSameThread = call.thread.id === firstRead.thread.id;
    const isEditOfFile = EDIT_TOOLS.has(call.name) && call.filePath === firstRead.filePath;
    const isFileChangingCommand = call.name === "Bash" && FILE_CHANGING_COMMAND.test(call.summary);
    const isBetween = calledAtMs >= fromAtMs && calledAtMs <= toAtMs;
    return isSameThread && isBetween && (isEditOfFile || isFileChangingCommand);
  });
}
