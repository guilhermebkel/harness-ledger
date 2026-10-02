/** External data narrowed to an object, before its fields are read through `GuardUtil`. */
export type UnknownRecord = Record<string, unknown>;

export type FrontmatterValue = string | string[];

export interface Frontmatter {
  data: Record<string, FrontmatterValue>;
  body: string;
}

export interface JsonLineHandlers {
  /** Called for each line that parses as JSON, with its 1-based line number. */
  onRecord: (record: unknown, lineNumber: number) => void;
  /** Called for each line that doesn't parse, or whose handler throws. */
  onBadLine: () => void;
}

export interface GitChangeDates {
  /** Repository-relative path → ISO date of the last commit that touched it. */
  pathToCommittedAt: Map<string, string>;
  /** Paths with uncommitted or untracked changes: their commit date doesn't describe the file on disk. */
  dirtyPaths: Set<string>;
}

export interface CleanPrompt {
  text: string;
  command?: string;
}
