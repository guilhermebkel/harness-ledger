import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AntigravityFixture } from "@/Providers/Antigravity/Protocols/AntigravityFixtureProtocol.ts";

export interface PlannerResponseOptions {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  content?: string;
  thinking?: string;
  stepIndex?: number;
  createdAt?: string;
}

export interface LineOptions {
  stepIndex?: number;
  createdAt?: string;
}

export class AntigravityTranscriptBuilder {
  private readonly lines: string[] = [];
  private stepCounter = 0;

  userInput(content: string, options?: LineOptions): this {
    return this.appendEntry("USER_EXPLICIT", "USER_INPUT", "DONE", options, { content });
  }

  plannerResponse(options?: PlannerResponseOptions): this {
    const inputTokens = options?.inputTokens ?? 0;
    const outputTokens = options?.outputTokens ?? 0;
    const cacheReadTokens = options?.cacheReadTokens ?? 0;
    const content = options?.content ?? "Sample response";
    return this.appendEntry("MODEL", "PLANNER_RESPONSE", "DONE", options, {
      input_tokens: inputTokens,
      cache_read_tokens: cacheReadTokens,
      output_tokens: outputTokens,
      content: content,
      thinking: options?.thinking,
    });
  }

  generic(content: string, options?: LineOptions): this {
    return this.appendEntry("SYSTEM", "GENERIC", "DONE", options, { content });
  }

  checkpoint(content: string, options?: LineOptions): this {
    return this.appendEntry("SYSTEM", "CHECKPOINT", "DONE", options, { content });
  }

  systemMessage(content: string, options?: LineOptions): this {
    return this.appendEntry("SYSTEM", "SYSTEM_MESSAGE", "DONE", options, { content });
  }

  errorMessage(error: string, options?: LineOptions): this {
    return this.appendEntry("SYSTEM", "ERROR_MESSAGE", "ERROR", options, { error });
  }

  unknownLine(type: string, payload: Record<string, unknown>): this {
    this.lines.push(JSON.stringify({
      step_index: this.nextStep(),
      source: "SYSTEM",
      type,
      ...payload,
    }));
    return this;
  }

  badLine(text: string): this {
    this.lines.push(text);
    return this;
  }

  writeTo(fixture: AntigravityFixture, conversationId: string): string {
    const file = join(fixture.antigravityHome, "brain", conversationId, ".system_generated", "logs", "transcript.jsonl");
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${this.lines.join("\n")}\n`);
    return file;
  }

  private appendEntry(
    source: string,
    type: string,
    status: string,
    options?: LineOptions,
    extraFields?: Record<string, unknown>,
  ): this {
    const stepIndex = options?.stepIndex ?? this.nextStep();
    const createdAt = options?.createdAt ?? new Date().toISOString();
    this.lines.push(JSON.stringify({
      step_index: stepIndex,
      source,
      type,
      status,
      created_at: createdAt,
      ...extraFields,
    }));
    return this;
  }

  private nextStep(): number {
    const current = this.stepCounter;
    this.stepCounter++;
    return current;
  }
}
