import { homedir } from "node:os";
import { join } from "node:path";
import { EnvUtil } from "@/Shared/Utils/EnvUtil.ts";

export class CodexPathUtil {
  static homeDir(): string {
    // Why: `HARNESS_LEDGER_CODEX_HOME` exists so tests can point at a fixture.
    return EnvUtil.read("HARNESS_LEDGER_CODEX_HOME") ?? EnvUtil.read("CODEX_HOME") ?? join(homedir(), ".codex");
  }

  static userAgentsDir(userHome: string): string {
    // Why: `HARNESS_LEDGER_CODEX_AGENTS_HOME` exists so tests don't read the real ~/.agents folder.
    return EnvUtil.read("HARNESS_LEDGER_CODEX_AGENTS_HOME") ?? join(userHome, ".agents");
  }

  static sessionsDir(homeDir: string): string {
    return join(homeDir, "sessions");
  }
}
