export interface CodexFixture {
  root: string;
  codexHome: string;
  agentsHome: string;
  projectDir: string;
  dataDir: string;
}

export interface CodexSubagentOptions {
  parentId: string;
  role: string;
}

export interface CodexCallOptions { secondsLater?: number }

export interface CodexTokenOptions {
  total: number;
  input: number;
  cached: number;
  output: number;
}
