import { homedir } from "node:os";
import { join } from "node:path";
import { readEnv } from "../../core/env.js";

/** Claude Code's config directory. `IMH_CLAUDE_HOME` exists for tests. */
export function claudeHome(): string {
  return readEnv("IMH_CLAUDE_HOME") ?? readEnv("CLAUDE_CONFIG_DIR") ?? join(homedir(), ".claude");
}

/** The user-level `.claude.json`, which holds user and per-project MCP servers. */
export function claudeJsonPath(): string {
  const configDir = readEnv("CLAUDE_CONFIG_DIR");
  const defaultPath = configDir ? join(configDir, ".claude.json") : join(homedir(), ".claude.json");
  return readEnv("IMH_CLAUDE_JSON") ?? defaultPath;
}

/** Claude Code keeps a project's transcripts in `projects/<cwd with every non-alphanumeric replaced by "-">`. */
export function encodeProjectDir(projectDir: string): string {
  return projectDir.replace(/[^a-zA-Z0-9]/g, "-");
}
