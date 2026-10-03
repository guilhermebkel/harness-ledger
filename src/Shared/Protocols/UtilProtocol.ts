export type UnknownRecord = Record<string, unknown>;

export type FrontmatterValue = string | string[];

export interface Frontmatter {
  data: Record<string, FrontmatterValue>;
  body: string;
}

export interface JsonLineHandlers {
  onRecord: (record: unknown, lineNumber: number) => void;
  // Why: also called when the handler throws.
  onBadLine: () => void;
}

export interface GitChangeDates {
  pathToCommittedAt: Map<string, string>;
  // Why: their commit date doesn't describe the file on disk.
  dirtyPaths: Set<string>;
}

export interface CleanPrompt {
  text: string;
  command?: string;
}
