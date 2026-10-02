import { homedir } from "node:os";
import { join } from "node:path";

/** Claude Code's config directory (honors CLAUDE_CONFIG_DIR). */
export function claudeHome(): string {
  return process.env.IMH_CLAUDE_HOME || process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
}

/** The user-level ~/.claude.json, which holds per-project MCP servers. */
export function claudeJsonPath(): string {
  if (process.env.IMH_CLAUDE_JSON) return process.env.IMH_CLAUDE_JSON;
  if (process.env.CLAUDE_CONFIG_DIR) return join(process.env.CLAUDE_CONFIG_DIR, ".claude.json");
  return join(homedir(), ".claude.json");
}

/** Claude Code stores a project's transcripts under projects/<cwd with non-alphanumerics replaced by "-">. */
export function encodeProjectDir(dir: string): string {
  return dir.replace(/[^a-zA-Z0-9]/g, "-");
}
