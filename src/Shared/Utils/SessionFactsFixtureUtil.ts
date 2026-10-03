import type {
  AssistantMessage,
  EvidenceRef,
  SessionFacts,
  ThreadRef,
  TokenUsage,
  ToolCategory,
  ToolResultKind,
} from "@/Shared/Protocols/SessionProtocol.ts";
import { SessionUtil } from "@/Shared/Utils/SessionUtil.ts";

const MS_PER_SECOND = 1000;
const DEFAULT_USAGE: TokenUsage = {
  input: 1000,
  output: 100,
  cacheRead: 0,
  cacheWrite: 0,
};

export interface CallOptions {
  category?: ToolCategory;
  isError?: boolean;
  kind?: ToolResultKind;
  runSeconds?: number;
  filePath?: string;
  usage?: TokenUsage;
}

export class SessionFactsBuilder {
  private atMs: number;
  private lineNumber = 0;
  private readonly facts: SessionFacts;
  private thread: ThreadRef = SessionUtil.mainThread();

  constructor(sessionId = "s1", startedAt = "2026-09-01T10:00:00.000Z") {
    this.atMs = Date.parse(startedAt);
    this.facts = {
      sessionId,
      provider: "test",
      file: `/transcripts/${sessionId}.jsonl`,
      startedAtMs: this.atMs,
      activeMs: 0,
      threads: [],
      prompts: [],
      tools: [],
      messages: [],
      apiErrors: [],
      compactions: [],
      environment: {},
      reported: {
        isCostPartial: false,
        turns: [],
      },
      files: [],
      unparsedLines: 0,
    };
  }

  inThread(thread: ThreadRef): this {
    this.thread = thread;
    return this;
  }

  wait(seconds: number): this {
    this.atMs += seconds * MS_PER_SECOND;
    return this;
  }

  say(usage: TokenUsage = DEFAULT_USAGE): this {
    this.message(usage);
    return this;
  }

  prompt(text: string, flags: {
    isCorrection?: boolean; isInterruption?: boolean;
  } = {}): this {
    this.facts.prompts.push({
      text,
      ref: this.ref(),
      sentAtMs: this.atMs,
      isCorrection: flags.isCorrection === true,
      isInterruption: flags.isInterruption === true,
    });
    return this;
  }

  call(key: string, callOptions: CallOptions = {}): this {
    const message = this.message(callOptions.usage ?? DEFAULT_USAGE);
    const calledAtMs = this.atMs;
    const isError = callOptions.isError === true;
    this.atMs += (callOptions.runSeconds ?? 1) * MS_PER_SECOND;
    this.facts.tools.push({
      key,
      calledAtMs,
      id: `call${this.facts.tools.length}`,
      name: key,
      category: callOptions.category ?? "shell",
      summary: key,
      filePath: callOptions.filePath,
      thread: this.thread,
      ref: this.ref(),
      messageId: message.id,
      result: {
        isError,
        kind: callOptions.kind ?? (isError ? "error" : "ok"),
        errorHead: isError ? "error" : undefined,
        contentChars: 100,
        ref: this.ref(),
        returnedAtMs: this.atMs,
      },
    });
    return this;
  }

  compact(): this {
    this.facts.compactions.push({
      trigger: "auto",
      thread: this.thread,
      ref: this.ref(),
      occurredAtMs: this.atMs,
    });
    this.atMs += MS_PER_SECOND;
    return this;
  }

  build(): SessionFacts {
    this.facts.endedAtMs = this.atMs;
    return this.facts;
  }

  private message(usage: TokenUsage): AssistantMessage {
    const message: AssistantMessage = {
      usage,
      id: `msg${this.facts.messages.length}`,
      model: "claude-sonnet-4-5",
      thread: this.thread,
      sentAtMs: this.atMs,
      ref: this.ref(),
    };
    this.facts.messages.push(message);
    return message;
  }

  private ref(): EvidenceRef {
    this.lineNumber++;
    return {
      sessionId: this.facts.sessionId,
      file: this.facts.file,
      line: this.lineNumber,
      thread: this.thread.agentType,
    };
  }
}
