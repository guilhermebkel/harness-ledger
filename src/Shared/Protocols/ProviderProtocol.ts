export type ProviderType = "claude-code";

export interface TranscriptFileStat {
  file: string;
  modifiedAtMs: number;
  bytes: number;
}

export interface TranscriptFile extends TranscriptFileStat {
  sessionId: string;
  subagentFiles: TranscriptFileStat[];
  // Why: as opposed to a prefix match such as `my-app-2` or a subfolder.
  isExactProject: boolean;
}

export interface DiscoverOptions {
  projectDir: string;
  shouldReadAllProjects?: boolean;
}

export interface ParseOptions {
  idleMs: number;
  projectDir?: string;
}

export interface InventoryOptions {
  projectDir: string;
  isProjectOnly?: boolean;
}

// Why: overridable so tests can point at a fixture.
export interface ProviderPaths { homeDir: string }
