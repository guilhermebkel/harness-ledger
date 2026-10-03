import { homedir } from "node:os";
import { join } from "node:path";
import { EnvUtil } from "@/Shared/Utils/EnvUtil.js";

export class ClaudeCodePathUtil {
  // Why: `IMH_CLAUDE_HOME` exists so tests can point at a fixture.
  static homeDir(): string {
    return EnvUtil.read("IMH_CLAUDE_HOME") ?? EnvUtil.read("CLAUDE_CONFIG_DIR") ?? join(homedir(), ".claude");
  }

  static claudeJsonPath(): string {
    const configDir = EnvUtil.read("CLAUDE_CONFIG_DIR");
    const defaultPath = configDir ? join(configDir, ".claude.json") : join(homedir(), ".claude.json");
    return EnvUtil.read("IMH_CLAUDE_JSON") ?? defaultPath;
  }

  // Why: Claude Code keeps a project's transcripts in `projects/<cwd with every non-alphanumeric character replaced by "-">`.
  static encodeProjectDir(projectDir: string): string {
    return projectDir.replace(/[^a-zA-Z0-9]/g, "-");
  }
}
