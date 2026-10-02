// Rules map to docs/code-standards.md. Change both together.
import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import globals from "globals";
import tseslint from "typescript-eslint";

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
        // Build-time constants injected by esbuild's `define`.
        { selector: "variable", format: null, filter: { regex: "^__[A-Z_]+__$", match: true } },
      ],

      // TypeScript
      "@typescript-eslint/no-explicit-any": "error",
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

      // Boundaries
      "no-restricted-properties": ["error", { object: "process", property: "env", message: "Read environment variables through src/core/env.ts." }],

      // Formatting
      "@stylistic/max-len": ["error", { code: 120, ignoreUrls: true, ignoreStrings: true, ignoreTemplateLiterals: true, ignoreRegExpLiterals: true, ignoreComments: true }],
      "@stylistic/no-multi-spaces": "error",
      "@stylistic/brace-style": ["error", "1tbs", { allowSingleLine: false }],
      "@stylistic/key-spacing": ["error", { beforeColon: false, afterColon: true, mode: "strict" }],
    },
  },
  {
    files: ["src/core/env.ts"],
    rules: { "no-restricted-properties": "off" },
  },
  {
    files: ["test/**/*.ts"],
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
