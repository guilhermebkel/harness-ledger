import { homedir } from "node:os";
import { join } from "node:path";
import { EnvUtil } from "@/Shared/Utils/EnvUtil.ts";

export class CursorPathUtil {
  static homeDir(): string {
    // Why: `HARNESS_LEDGER_CURSOR_HOME` exists so tests can point at a fixture.
    return EnvUtil.read("HARNESS_LEDGER_CURSOR_HOME") ?? join(homedir(), ".cursor");
  }

  static projectsDir(homeDir: string): string {
    return join(homeDir, "projects");
  }

  static encodeProjectDir(projectDir: string): string {
    return projectDir.split(/[^a-zA-Z0-9]/).filter((part) => part !== "").join("-");
  }
}
