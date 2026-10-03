export interface Fixture {
  root: string;
  claudeHome: string;
  projectDir: string;
  claudeJson: string;
  dataDir: string;
}

export interface HistoryFixture {
  readonly fixture: Fixture;
  commonOptions: () => {
    projectDir: string;
    dataDir: string;
  };
}

export interface TranscriptOptions {
  isSidechain?: boolean;
  agentId?: string;
}

export interface ToolStepOptions {
  secondsLater?: number;
  model?: string;
  lineFields?: Record<string, unknown>;
  outputTokens?: number;
}

export interface TestRunOptions {
  commandSeconds?: number;
  model?: string;
  outputTokens?: number;
}

export interface TestRun extends TestRunOptions {
  command: string;
  isFailing?: boolean;
}

export interface ResultOptions {
  isError?: boolean;
  secondsLater?: number;
  toolUseResult?: unknown;
  denialKind?: string;
}
