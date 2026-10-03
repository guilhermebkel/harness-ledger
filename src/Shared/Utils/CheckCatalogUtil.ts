import { extname } from "node:path";
import type { CheckCategory, CheckToolDefinition } from "@/Shared/Protocols/CheckProtocol.js";

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
};

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
      configMarkers: [{ pattern: /["'](complexity|max-depth|max-nested-callbacks)["']/, categories: ["complexity"] }],
    },
    {
      name: "eslint-plugin-sonarjs",
      languages: JS_LANGUAGES,
      categories: ["complexity"],
      packages: ["eslint-plugin-sonarjs"],
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
      configMarkers: [{ pattern: /\bC90\d?\b|mccabe/, categories: ["complexity"] }],
    },
    {
      name: "flake8",
      languages: ["python"],
      categories: ["lint"],
      packages: ["flake8"],
      commands: ["flake8"],
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
      configMarkers: [
        { pattern: /\b(gocognit|gocyclo|cyclop)\b/, categories: ["complexity"] },
        { pattern: /\b(unused|deadcode)\b/, categories: ["deadCode"] },
        { pattern: /\bdupl\b/, categories: ["duplication"] },
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

  static languageOf(filePath: string): string | undefined {
    return EXTENSION_TO_LANGUAGE[extname(filePath).toLowerCase()];
  }

  static coversLanguage(tool: Pick<CheckToolDefinition, "languages">, language: string): boolean {
    return tool.languages.includes("*") || tool.languages.includes(language);
  }
}
