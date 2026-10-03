export type CheckCategory
  = | "lint"
    | "types"
    | "complexity"
    | "deadCode"
    | "duplication"
    | "cycles"
    | "boundaries"
    | "tests"
    | "monorepo"
    | "package";

export type CheckSource = "package.json" | "eslint config" | "python config" | "golangci config" | "ci";

export type CheckRunPlace = "sessions" | "ci";

export interface CheckToolDefinition {
  name: string;
  // Why: "*" means any language (jscpd reads most of them).
  languages: string[];
  categories: CheckCategory[];
  packages?: string[];
  commands?: string[];
  configMarkers?: ConfigMarker[];
}

// Why: words that, found in the tool's own config file, turn on extra categories (`C901` in ruff's config).
export interface ConfigMarker {
  pattern: RegExp;
  categories: CheckCategory[];
}

export interface ProjectCheckTool {
  name: string;
  categories: CheckCategory[];
  foundIn: CheckSource[];
  runsIn: CheckRunPlace[];
  // Why: sessions in which the agent ran the tool, directly or through a package.json script.
  sessions: number;
}

export type LanguageMatch
  = | {
    kind: "language";
    language: string;
  }
  | { kind: "notCode" }
  | {
    kind: "unmapped";
    extension: string;
  };

// Why: an extension with no known language is listed as "unmapped" with the extension itself, never dropped.
export interface LanguageEdits {
  language: string;
  edits: number;
  extension?: string;
}

export interface MissingCheck {
  language: string;
  category: CheckCategory;
}

export interface ProjectChecks {
  languages: LanguageEdits[];
  tools: ProjectCheckTool[];
  // Why: every hook as "event matcher: handler shapes"; which events run after edits is the provider's vocabulary,
  // so the skill decides, not shared code (ADR 0008).
  hooks: string[];
  isMonorepo: boolean;
  isPublishedPackage: boolean;
  missing: MissingCheck[];
  // Why: dependencies whose names look like checks but aren't in the catalog; they may cover a "missing" category.
  unmappedTools: string[];
  isMissingPartial: boolean;
  partialReasons: string[];
}
