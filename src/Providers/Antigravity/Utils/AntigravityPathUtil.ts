import { homedir } from "node:os";
import { join } from "node:path";
import { EnvUtil } from "@/Shared/Utils/EnvUtil.ts";

export class AntigravityPathUtil {
  static homeDir(): string {
    // Why: `HARNESS_LEDGER_ANTIGRAVITY_HOME` exists so tests can point at a fixture.
    return EnvUtil.read("HARNESS_LEDGER_ANTIGRAVITY_HOME") ?? join(homedir(), ".gemini", "antigravity-cli");
  }

  static brainDir(homeDir: string): string {
    return join(homeDir, "brain");
  }

  static historyFile(homeDir: string): string {
    return join(homeDir, "history.jsonl");
  }

  static lastConversationsFile(homeDir: string): string {
    return join(homeDir, "cache", "last_conversations.json");
  }

  static builtinSkillsDir(homeDir: string): string {
    return join(homeDir, "builtin", "skills");
  }
}
