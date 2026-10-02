// What every provider adapter (an agentic coding tool: Claude Code today; Codex and Cursor later)
// receives and returns.

export type ProviderType = "claude-code";

export interface TranscriptFileStat {
  file: string;
  modifiedAtMs: number;
  bytes: number;
}

export interface TranscriptFile extends TranscriptFileStat {
  sessionId: string;
  subagentFiles: TranscriptFileStat[];
  /** In this project's own folder, as opposed to a prefix match such as `my-app-2` or a subfolder. */
  isExactProject: boolean;
}

export interface DiscoverOptions {
  projectDir: string;
  shouldReadAllProjects?: boolean;
}

export interface ParseOptions {
  /** Gaps longer than this are idle time and are not counted. */
  idleMs: number;
  projectDir?: string;
}

export interface InventoryOptions {
  projectDir: string;
  /** Only what's in the project: no user-level or plugin pieces. */
  isProjectOnly?: boolean;
}

/** Where the provider keeps its data. Overridable so tests can point at a fixture. */
export interface ProviderPaths { homeDir: string }
