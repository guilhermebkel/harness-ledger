// Rules map to docs/code-standards.md. Change both together.
import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import sonarjs from "eslint-plugin-sonarjs";
import globals from "globals";
import tseslint from "typescript-eslint";

// Imports go through the `@/` alias (tsconfig `paths`), never up the tree with `../`.
const NO_PARENT_IMPORTS = { group: ["../*", "../**"], message: "Import from \"@/...\" instead of a relative parent path." };

// Complexity limits (SonarSource's default for cognitive complexity).
const MAX_COGNITIVE_COMPLEXITY = 15;
const MAX_DEPTH = 3;
const MAX_PARAMS = 5;

const BOOLEAN_PREFIXES = ["is", "has", "should", "can", "must", "was", "did"];

export default tseslint.config(
  { ignores: ["dist/", "node_modules/", "coverage/"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  stylistic.configs.customize({
    indent: 2,
    quotes: "double",
    semi: true,
    braceStyle: "1tbs",
    commaDangle: "always-multiline",
    arrowParens: true,
  }),
  {
    plugins: { sonarjs },
    languageOptions: {
      globals: globals.node,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // Naming
      "id-length": ["error", { min: 2, exceptionPatterns: ["^_$"], properties: "never" }],
      "@typescript-eslint/naming-convention": [
        "error",
        { selector: "default", format: ["camelCase"], leadingUnderscore: "allow" },
        { selector: "import", format: ["camelCase", "PascalCase"] },
        { selector: "typeLike", format: ["PascalCase"] },
        { selector: "variable", modifiers: ["const", "global"], format: ["UPPER_CASE", "camelCase"] },
        { selector: "variable", modifiers: ["const", "global"], types: ["boolean", "number", "string", "array"], format: ["UPPER_CASE"] },
        { selector: ["variable", "parameter"], types: ["boolean"], format: ["PascalCase"], prefix: BOOLEAN_PREFIXES },
        // Object literal keys are checked through the type they satisfy; library option objects
        // (`{ recursive: true }`) keep the library's names.
        { selector: ["typeProperty", "classProperty", "parameterProperty", "accessor"], types: ["boolean"], format: ["PascalCase"], prefix: BOOLEAN_PREFIXES },
        // Keys of external formats (JSON from agents, CLI flags, snake_case ids such as signal types) keep their spelling.
        { selector: ["objectLiteralProperty", "objectLiteralMethod", "typeProperty"], modifiers: ["requiresQuotes"], format: null },
        { selector: ["objectLiteralProperty", "objectLiteralMethod"], format: null, filter: { regex: "^[a-z]+(_[a-z]+)+$", match: true } },
        // Class constants (`static readonly MAIN_PIECE`) read like module constants.
        { selector: "classProperty", modifiers: ["static", "readonly"], format: ["UPPER_CASE", "camelCase"] },
        // Build-time constants injected by esbuild's `define`.
        { selector: "variable", format: null, filter: { regex: "^__[A-Z_]+__$", match: true } },
      ],

      // TypeScript
      "@typescript-eslint/no-explicit-any": "error",
      // Utils are classes with static methods only (docs/code-standards.md, "Architecture").
      "@typescript-eslint/no-extraneous-class": ["error", { allowStaticOnly: true }],
      "@typescript-eslint/switch-exhaustiveness-check": ["error", { requireDefaultForNonUnion: true, considerDefaultExhaustiveForUnions: true }],
      "@typescript-eslint/consistent-type-definitions": ["error", "interface"],
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "@stylistic/object-curly-newline": ["error", {
        TSTypeLiteral: { multiline: true, minProperties: 2 },
        TSInterfaceBody: { multiline: true, minProperties: 2 },
      }],
      "@stylistic/member-delimiter-style": "error",

      // Logic
      "curly": ["error", "all"],
      "no-nested-ternary": "error",
      "no-console": "error",
      "@typescript-eslint/no-magic-numbers": ["error", {
        ignore: [-1, 0, 1],
        ignoreArrayIndexes: true,
        ignoreDefaultValues: true,
        ignoreEnums: true,
        ignoreNumericLiteralTypes: true,
        ignoreReadonlyClassProperties: true,
        ignoreTypeIndexes: true,
      }],
      "@typescript-eslint/no-floating-promises": "error",

      // Complexity: keep functions small enough to read in one pass (SonarSource defaults).
      "sonarjs/cognitive-complexity": ["error", MAX_COGNITIVE_COMPLEXITY],
      "max-depth": ["error", MAX_DEPTH],
      "max-params": ["error", MAX_PARAMS],
      "sonarjs/no-nested-conditional": "error",
      "sonarjs/no-collapsible-if": "error",
      "sonarjs/no-identical-functions": "error",
      "sonarjs/no-duplicated-branches": "error",
      "sonarjs/no-all-duplicated-branches": "error",
      "sonarjs/no-identical-conditions": "error",
      "no-restricted-syntax": ["error", {
        selector: [
          "CallExpression > CallExpression.arguments:matches([arguments.length>=3], :has(> CallExpression.arguments))",
          "CallExpression > SpreadElement > CallExpression:matches([arguments.length>=3], :has(> CallExpression.arguments))",
        ].join(", "),
        message: "Store this call's result in a named variable before passing it to another call.",
      }],

      // Boundaries
      "no-restricted-imports": ["error", { patterns: [NO_PARENT_IMPORTS] }],
      "no-restricted-properties": ["error", { object: "process", property: "env", message: "Read environment variables through EnvUtil (src/Shared/Utils/EnvUtil.ts)." }],

      // Formatting
      "@stylistic/max-len": ["error", { code: 120, ignoreUrls: true, ignoreStrings: true, ignoreTemplateLiterals: true, ignoreRegExpLiterals: true, ignoreComments: true }],
      "@stylistic/no-multi-spaces": "error",
      "@stylistic/brace-style": ["error", "1tbs", { allowSingleLine: false }],
      "@stylistic/key-spacing": ["error", { beforeColon: false, afterColon: true, mode: "strict" }],
    },
  },
  {
    files: ["src/Shared/Utils/EnvUtil.ts"],
    rules: { "no-restricted-properties": "off" },
  },
  {
    // Shared code never knows a provider (ADR 0008). ProviderModule is the one bridge.
    files: ["src/Shared/**/*.ts"],
    ignores: ["src/Shared/Modules/ProviderModule.ts", "src/Shared/**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [NO_PARENT_IMPORTS, { group: ["@/Providers/**", "**/Providers/**"], message: "Shared code must not import a provider. Go through ProviderModule (ADR 0008)." }],
      }],
    },
  },
  {
    // A provider never reaches into another provider.
    files: ["src/Providers/ClaudeCode/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [NO_PARENT_IMPORTS, { group: ["@/Providers/*/**", "**/Providers/*/**", "!@/Providers/ClaudeCode/**", "!**/Providers/ClaudeCode/**"], message: "A provider must not import another provider (ADR 0008)." }],
      }],
    },
  },
  {
    files: ["src/**/*.test.ts", "src/Providers/*/Utils/*FixtureUtil.ts"],
    rules: {
      "@typescript-eslint/no-magic-numbers": "off",
      "no-restricted-properties": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      // Fixtures write external formats (settings.json, env blocks) with their own key spelling.
      "@typescript-eslint/naming-convention": "off",
    },
  },
  {
    files: ["**/*.mjs", "**/*.js"],
    ...tseslint.configs.disableTypeChecked,
  },
);
