export type ProviderType = "claude-code";

export interface TranscriptFileStat {
  file: string;
  modifiedAtMs: number;
  bytes: number;
}

export interface TranscriptFile extends TranscriptFileStat {
  sessionId: string;
  subagentFiles: TranscriptFileStat[];
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

export interface ProviderPaths { homeDir: string }
