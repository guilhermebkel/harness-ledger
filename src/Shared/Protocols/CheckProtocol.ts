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
  languages: string[];
  categories: CheckCategory[];
  packages?: string[];
  commands?: string[];
  configMarkers?: ConfigMarker[];
  configSource?: ConfigFileSource;
}

export interface ConfigMarker {
  pattern: RegExp;
  categories: CheckCategory[];
}

export interface ProjectCheckTool {
  name: string;
  categories: CheckCategory[];
  foundIn: CheckSource[];
  runsIn: CheckRunPlace[];
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

export type LanguageMatch = { [Kind in LanguageMatchKind]: LanguageMatchOf<Kind> }[LanguageMatchKind];

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
  hooks: string[];
  isMonorepo: boolean;
  isPublishedPackage: boolean;
  missing: MissingCheck[];
  unmappedTools: string[];
  isMissingPartial: boolean;
  partialReasons: string[];
}
