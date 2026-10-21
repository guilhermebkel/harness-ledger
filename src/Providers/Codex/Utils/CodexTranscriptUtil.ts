import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import type { UnknownRecord } from "@/Shared/Protocols/UtilProtocol.ts";
import { GuardUtil } from "@/Shared/Utils/GuardUtil.ts";
import type { CodexSessionMeta } from "@/Providers/Codex/Protocols/CodexProtocol.ts";

const EXIT_CODE_PATTERNS = [/Process exited with code (-?\d+)/, /^Exit code: (-?\d+)/m];
const UNKNOWN_SUBAGENT = "subagent";

export class CodexTranscriptUtil {
  static async readSessionMeta(file: string): Promise<CodexSessionMeta> {
    const first = await CodexTranscriptUtil.firstLine(file);
    const record = GuardUtil.asRecord(first === undefined ? undefined : GuardUtil.parseJson(first));
    const payload = GuardUtil.asRecord(record?.payload);
    if (record?.type !== "session_meta" || !payload) {
      return {};
    }
    const spawn = GuardUtil.asRecord(GuardUtil.asRecord(GuardUtil.asRecord(payload.source)?.subagent)?.thread_spawn);
    return {
      id: GuardUtil.asString(payload.id),
      cwd: GuardUtil.asString(payload.cwd),
      parentThreadId: GuardUtil.asString(spawn?.parent_thread_id),
      agentType: spawn ? CodexTranscriptUtil.agentTypeOf(spawn) : undefined,
    };
  }

  static exitCodeOf(text: string): number | undefined {
    for (const pattern of EXIT_CODE_PATTERNS) {
      const match = pattern.exec(text);
      if (match?.[1] !== undefined) {
        return Number(match[1]);
      }
    }
    return undefined;
  }

  static outputText(output: unknown): string {
    const text = GuardUtil.asString(output);
    if (text !== undefined) {
      return text;
    }
    return GuardUtil.asArray(output)
      .map((item) => GuardUtil.asString(GuardUtil.asRecord(item)?.text) ?? "")
      .join("\n");
  }

  static isInjectedContext(text: string): boolean {
    return /^\s*(# AGENTS\.md instructions|<environment_context>|<turn_aborted>|<recommended_plugins>|<user_instructions>)/.test(text);
  }

  static argumentsOf(value: unknown): UnknownRecord {
    return GuardUtil.asRecord(typeof value === "string" ? GuardUtil.parseJson(value) : value) ?? {};
  }

  private static agentTypeOf(spawn: UnknownRecord): string {
    return GuardUtil.firstString(spawn, ["agent_role", "agent_nickname"]) ?? UNKNOWN_SUBAGENT;
  }

  private static async firstLine(file: string): Promise<string | undefined> {
    const lines = createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
    try {
      for await (const line of lines) {
        return line;
      }
      return undefined;
    } catch {
      return undefined;
    } finally {
      lines.close();
    }
  }
}
