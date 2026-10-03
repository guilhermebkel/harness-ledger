export type CheckCategory
  = | "lint"
    | "types"
    | "complexity"
    | "deadCode"
    | "duplication"
    | "cycles"
    | "boundaries"
    | "tests"
    | "testLint"
    | "monorepo"
    | "package";

export type CheckSource = "package.json" | "eslint config" | "python config" | "golangci config" | "ci";

export type ConfigFileSource = Exclude<CheckSource, "package.json" | "ci">;

export type CheckRunPlace = "sessions" | "ci";

export interface CheckToolDefinition {
  name: string;
  // Why: "*" means any language (jscpd reads most of them).
  languages: string[];
  categories: CheckCategory[];
  packages?: string[];
  commands?: string[];
  configMarkers?: ConfigMarker[];
  configSource?: ConfigFileSource;
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

export interface LanguageMatchFields {
  language: {
    kind: "language";
    language: string;
  };
  notCode: { kind: "notCode" };
  unmapped: {
    kind: "unmapped";
    extension: string;
  };
}

export type LanguageMatchKind = keyof LanguageMatchFields;

export type LanguageMatchOf<Kind extends LanguageMatchKind> = { kind: Kind } & LanguageMatchFields[Kind];

// Why: written as a map of kinds so a Record of handlers keeps each kind's fields when called (correlated union).
export type LanguageMatch = { [Kind in LanguageMatchKind]: LanguageMatchOf<Kind> }[LanguageMatchKind];

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
