import { homedir } from "node:os";
import { join } from "node:path";
import { EnvUtil } from "../../../Shared/Utils/EnvUtil.js";

export class ClaudeCodePathUtil {
  /** Claude Code's config directory. `IMH_CLAUDE_HOME` exists for tests. */
  static homeDir(): string {
    return EnvUtil.read("IMH_CLAUDE_HOME") ?? EnvUtil.read("CLAUDE_CONFIG_DIR") ?? join(homedir(), ".claude");
  }

  /** The user-level `.claude.json`, which holds user and per-project MCP servers. */
  static claudeJsonPath(): string {
    const configDir = EnvUtil.read("CLAUDE_CONFIG_DIR");
    const defaultPath = configDir ? join(configDir, ".claude.json") : join(homedir(), ".claude.json");
    return EnvUtil.read("IMH_CLAUDE_JSON") ?? defaultPath;
  }

  /** Claude Code keeps a project's transcripts in `projects/<cwd with every non-alphanumeric replaced by "-">`. */
  static encodeProjectDir(projectDir: string): string {
    return projectDir.replace(/[^a-zA-Z0-9]/g, "-");
  }
}
