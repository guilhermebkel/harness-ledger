export type UnknownRecord = Record<string, unknown>;

export type FrontmatterValue = string | string[];

export interface Frontmatter {
  keyToValue: Record<string, FrontmatterValue>;
  body: string;
}

export interface JsonLineHandlers {
  onRecord: (record: unknown, lineNumber: number) => void;
  onBadLine: () => void;
}

export interface GitChangeDates {
  pathToCommittedAt: Map<string, string>;
  dirtyPaths: Set<string>;
}

export interface CleanPrompt {
  text: string;
  command?: string;
}
