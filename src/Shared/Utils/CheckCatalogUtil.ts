import { extname } from "node:path";
import type { CheckCategory, CheckToolDefinition, LanguageMatch } from "@/Shared/Protocols/CheckProtocol.js";

const JS_LANGUAGES = ["javascript", "typescript"];

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".vue": "javascript",
  ".svelte": "javascript",
  ".py": "python",
  ".go": "go",
  ".rb": "ruby",
  ".java": "java",
  ".kt": "kotlin",
  ".rs": "rust",
  ".php": "php",
  ".cs": "csharp",
  ".swift": "swift",
  ".sh": "shell",
  ".bash": "shell",
  ".sql": "sql",
};
const NOT_CODE_EXTENSIONS = new Set([
  "",
  ".md",
  ".mdx",
  ".txt",
  ".json",
  ".jsonc",
  ".yml",
  ".yaml",
  ".toml",
  ".ini",
  ".cfg",
  ".env",
  ".lock",
  ".csv",
  ".xml",
  ".html",
  ".htm",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".pdf",
  ".log",
]);
// Why: the core checks are only expected where the catalog knows tools for them; other languages are listed
// without a "missing" claim.
const LANGUAGES_WITH_CORE_CHECKS = new Set(["javascript", "typescript", "python", "go"]);
const CHECK_LIKE_WORDS = [
  "lint",
  "eslint-plugin",
  "eslint-config",
  "prettier",
  "sonar",
  "complex",
  "cpd",
  "dupl",
  "dead",
  "unused",
  "prune",
  "cruiser",
  "boundar",
  "circular",
  "cycle",
  "depcheck",
  "check",
  "analyz",
  "analys",
  "audit",
  "style",
];
const CHECK_LIKE_NAME = new RegExp(CHECK_LIKE_WORDS.join("|"), "i");

export class CheckCatalogUtil {
  // Why: every language with edits should have these; a missing one is what the skill may suggest.
  static readonly CORE_CATEGORIES: CheckCategory[] = ["complexity", "deadCode", "duplication"];

  static readonly TOOLS: CheckToolDefinition[] = [
    {
      name: "eslint",
      languages: JS_LANGUAGES,
      categories: ["lint"],
      packages: ["eslint"],
      commands: ["eslint"],
      configSource: "eslint config",
      configMarkers: [{ pattern: /["'](complexity|max-depth|max-nested-callbacks)["']/, categories: ["complexity"] }],
    },
    {
      name: "eslint-plugin-sonarjs",
      languages: JS_LANGUAGES,
      categories: ["complexity"],
      packages: ["eslint-plugin-sonarjs"],
    },
    {
      name: "@vitest/eslint-plugin",
      languages: JS_LANGUAGES,
      categories: ["testLint"],
      packages: ["@vitest/eslint-plugin", "eslint-plugin-vitest"],
    },
    {
      name: "eslint-plugin-jest",
      languages: JS_LANGUAGES,
      categories: ["testLint"],
      packages: ["eslint-plugin-jest"],
    },
    {
      name: "eslint-plugin-testing-library",
      languages: JS_LANGUAGES,
      categories: ["testLint"],
      packages: ["eslint-plugin-testing-library"],
    },
    {
      name: "eslint-plugin-playwright",
      languages: JS_LANGUAGES,
      categories: ["testLint"],
      packages: ["eslint-plugin-playwright"],
    },
    {
      name: "eslint-plugin-boundaries",
      languages: JS_LANGUAGES,
      categories: ["boundaries"],
      packages: ["eslint-plugin-boundaries"],
    },
    {
      name: "biome",
      languages: JS_LANGUAGES,
      categories: ["lint"],
      packages: ["@biomejs/biome"],
      commands: ["biome"],
    },
    {
      name: "oxlint",
      languages: JS_LANGUAGES,
      categories: ["lint"],
      packages: ["oxlint"],
      commands: ["oxlint"],
    },
    {
      name: "typescript",
      languages: ["typescript"],
      categories: ["types"],
      packages: ["typescript"],
      commands: ["tsc"],
    },
    {
      name: "knip",
      languages: JS_LANGUAGES,
      categories: ["deadCode"],
      packages: ["knip"],
      commands: ["knip"],
    },
    {
      name: "ts-prune",
      languages: ["typescript"],
      categories: ["deadCode"],
      packages: ["ts-prune"],
      commands: ["ts-prune"],
    },
    {
      name: "jscpd",
      languages: ["*"],
      categories: ["duplication"],
      packages: ["jscpd"],
      commands: ["jscpd"],
    },
    {
      name: "fallow",
      languages: JS_LANGUAGES,
      categories: ["deadCode", "duplication", "complexity", "cycles"],
      packages: ["fallow"],
      commands: ["fallow"],
    },
    {
      name: "dpdm",
      languages: JS_LANGUAGES,
      categories: ["cycles"],
      packages: ["dpdm"],
      commands: ["dpdm"],
    },
    {
      name: "madge",
      languages: JS_LANGUAGES,
      categories: ["cycles"],
      packages: ["madge"],
      commands: ["madge"],
    },
    {
      name: "dependency-cruiser",
      languages: JS_LANGUAGES,
      categories: ["cycles", "boundaries"],
      packages: ["dependency-cruiser"],
      commands: ["depcruise"],
    },
    {
      name: "vitest",
      languages: JS_LANGUAGES,
      categories: ["tests"],
      packages: ["vitest"],
      commands: ["vitest"],
    },
    {
      name: "jest",
      languages: JS_LANGUAGES,
      categories: ["tests"],
      packages: ["jest"],
      commands: ["jest"],
    },
    {
      name: "sherif",
      languages: JS_LANGUAGES,
      categories: ["monorepo"],
      packages: ["sherif"],
      commands: ["sherif"],
    },
    {
      name: "syncpack",
      languages: JS_LANGUAGES,
      categories: ["monorepo"],
      packages: ["syncpack"],
      commands: ["syncpack"],
    },
    {
      name: "publint",
      languages: JS_LANGUAGES,
      categories: ["package"],
      packages: ["publint"],
      commands: ["publint"],
    },
    {
      name: "arethetypeswrong",
      languages: ["typescript"],
      categories: ["package"],
      packages: ["@arethetypeswrong/cli"],
      commands: ["attw"],
    },
    {
      name: "ruff",
      languages: ["python"],
      categories: ["lint"],
      packages: ["ruff"],
      commands: ["ruff"],
      configSource: "python config",
      configMarkers: [
        { pattern: /\bC90\d?\b|mccabe/, categories: ["complexity"] },
        { pattern: /["']PT\d*["']|flake8-pytest-style/, categories: ["testLint"] },
      ],
    },
    {
      name: "flake8-pytest-style",
      languages: ["python"],
      categories: ["testLint"],
      packages: ["flake8-pytest-style"],
    },
    {
      name: "flake8",
      languages: ["python"],
      categories: ["lint"],
      packages: ["flake8"],
      commands: ["flake8"],
      configSource: "python config",
      configMarkers: [{ pattern: /max-complexity/, categories: ["complexity"] }],
    },
    {
      name: "pylint",
      languages: ["python"],
      categories: ["lint"],
      packages: ["pylint"],
      commands: ["pylint"],
    },
    {
      name: "mypy",
      languages: ["python"],
      categories: ["types"],
      packages: ["mypy"],
      commands: ["mypy"],
    },
    {
      name: "pyright",
      languages: ["python"],
      categories: ["types"],
      packages: ["pyright"],
      commands: ["pyright"],
    },
    {
      name: "radon",
      languages: ["python"],
      categories: ["complexity"],
      packages: ["radon"],
      commands: ["radon"],
    },
    {
      name: "xenon",
      languages: ["python"],
      categories: ["complexity"],
      packages: ["xenon"],
      commands: ["xenon"],
    },
    {
      name: "vulture",
      languages: ["python"],
      categories: ["deadCode"],
      packages: ["vulture"],
      commands: ["vulture"],
    },
    {
      name: "pytest",
      languages: ["python"],
      categories: ["tests"],
      packages: ["pytest"],
      commands: ["pytest"],
    },
    {
      name: "golangci-lint",
      languages: ["go"],
      categories: ["lint"],
      commands: ["golangci-lint"],
      configSource: "golangci config",
      configMarkers: [
        { pattern: /\b(gocognit|gocyclo|cyclop)\b/, categories: ["complexity"] },
        { pattern: /\b(unused|deadcode)\b/, categories: ["deadCode"] },
        { pattern: /\bdupl\b/, categories: ["duplication"] },
        { pattern: /\b(testifylint|thelper|tparallel|paralleltest)\b/, categories: ["testLint"] },
      ],
    },
    {
      name: "lizard",
      languages: ["*"],
      categories: ["complexity"],
      packages: ["lizard"],
      commands: ["lizard"],
    },
  ];

  static languageOf(filePath: string): LanguageMatch {
    const extension = extname(filePath).toLowerCase();
    const language = EXTENSION_TO_LANGUAGE[extension];
    if (language !== undefined) {
      return {
        language,
        kind: "language",
      };
    }
    return NOT_CODE_EXTENSIONS.has(extension)
      ? { kind: "notCode" }
      : {
          extension,
          kind: "unmapped",
        };
  }

  static hasCoreChecks(language: string): boolean {
    return LANGUAGES_WITH_CORE_CHECKS.has(language);
  }

  static isCheckLikeName(packageName: string): boolean {
    return CHECK_LIKE_NAME.test(packageName);
  }

  static knownPackages(): Set<string> {
    return new Set(CheckCatalogUtil.TOOLS.flatMap((tool) => [tool.name, ...(tool.packages ?? [])]));
  }

  static coversLanguage(tool: Pick<CheckToolDefinition, "languages">, language: string): boolean {
    return tool.languages.includes("*") || tool.languages.includes(language);
  }
}
