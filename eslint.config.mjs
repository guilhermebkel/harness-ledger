// Why: each rule is documented in docs/code-standards.md (tests: docs/test-standards.md); change both together.
import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import vitest from "@vitest/eslint-plugin";
import sonarjs from "eslint-plugin-sonarjs";
import globals from "globals";
import tseslint from "typescript-eslint";
import { localRules } from "./scripts/eslint-local-rules.mjs";

const NO_PARENT_IMPORTS = { group: ["../*", "../**"], message: "Import from \"@/...\" instead of a relative parent path." };
// Why: one import style in src/, so every importer of a file is found by searching its "@/" path.
const NO_SAME_FOLDER_IMPORTS = { group: ["./*", "./**"], message: "Import from \"@/...\" even within the same folder." };
const NO_JS_SOURCE_IMPORTS = { regex: "^@/.*\\.js$", message: "Import the source file itself: \"@/....ts\" (allowImportingTsExtensions)." };
const SOURCE_IMPORTS = [NO_PARENT_IMPORTS, NO_SAME_FOLDER_IMPORTS, NO_JS_SOURCE_IMPORTS];
const NO_PROVIDER_IMPORTS = {
  group: ["@/Providers/**", "**/Providers/**"],
  message: "Shared code must not import a provider. Go through ProviderModule (ADR 0008).",
};
const NO_OTHER_PROVIDER_IMPORTS = {
  group: ["@/Providers/*/**", "**/Providers/*/**", "!@/Providers/ClaudeCode/**", "!**/Providers/ClaudeCode/**"],
  message: "A provider must not import another provider (ADR 0008).",
};

const TEST_FILES = ["src/**/*.test.ts", "scripts/**/*.test.mjs"];

const LAYER_TO_FORBIDDEN_LAYERS = {
  Protocols: ["Utils", "Services", "Adapters", "Commands", "Modules"],
  Utils: ["Services", "Adapters", "Commands", "Modules"],
  Services: ["Commands", "Modules"],
  Adapters: ["Commands", "Modules"],
  Commands: ["Modules"],
};
const SCOPES = [
  { dir: "src/Shared", patterns: [...SOURCE_IMPORTS, NO_PROVIDER_IMPORTS] },
  { dir: "src/Providers/ClaudeCode", patterns: [...SOURCE_IMPORTS, NO_OTHER_PROVIDER_IMPORTS] },
];
// Why: ContextService creates the provider for every command, so it reaches ProviderModule (ADR 0008).
const LAYER_EXCEPTIONS = { "src/Shared/Services/ContextService.ts": ["Commands"] };

function layerPattern(layer, forbiddenLayers) {
  return {
    group: forbiddenLayers.map((forbidden) => `@/**/${forbidden}/**`),
    message: `${layer} must not import ${forbiddenLayers.join(", ")}: layers only import the ones below them.`,
  };
}

const layerConfigs = SCOPES.flatMap(({ dir, patterns }) =>
  Object.entries(LAYER_TO_FORBIDDEN_LAYERS).map(([layer, forbiddenLayers]) => ({
    files: [`${dir}/${layer}/**/*.ts`],
    ignores: [...TEST_FILES, ...Object.keys(LAYER_EXCEPTIONS)],
    rules: { "no-restricted-imports": ["error", { patterns: [...patterns, layerPattern(layer, forbiddenLayers)] }] },
  })),
);
const layerExceptionConfigs = Object.entries(LAYER_EXCEPTIONS).map(([file, forbiddenLayers]) => ({
  files: [file],
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [...SOURCE_IMPORTS, NO_PROVIDER_IMPORTS, layerPattern("Services", forbiddenLayers)],
    }],
  },
}));

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
    plugins: { sonarjs, local: localRules },
    languageOptions: {
      globals: globals.node,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "id-length": ["error", { min: 2, exceptionPatterns: ["^_$"], properties: "never" }],
      "@typescript-eslint/naming-convention": [
        "error",
        { selector: "default", format: ["camelCase"], leadingUnderscore: "allow" },
        { selector: "import", format: ["camelCase", "PascalCase"] },
        { selector: "typeLike", format: ["PascalCase"] },
        { selector: "variable", modifiers: ["const", "global"], format: ["UPPER_CASE", "camelCase"] },
        { selector: "variable", modifiers: ["const", "global"], types: ["boolean", "number", "string", "array"], format: ["UPPER_CASE"] },
        { selector: ["variable", "parameter"], types: ["boolean"], format: ["PascalCase"], prefix: BOOLEAN_PREFIXES },
        // Why: object literal keys are checked through the type they satisfy; library option objects (`{ recursive: true }`) keep the library's names.
        { selector: ["typeProperty", "classProperty", "parameterProperty", "accessor"], types: ["boolean"], format: ["PascalCase"], prefix: BOOLEAN_PREFIXES },
        // Why: keys of external formats (agent JSON, CLI flags, snake_case signal ids) keep their spelling.
        { selector: ["objectLiteralProperty", "objectLiteralMethod", "typeProperty"], modifiers: ["requiresQuotes"], format: null },
        { selector: ["objectLiteralProperty", "objectLiteralMethod"], format: null, filter: { regex: "^[a-z]+(_[a-z]+)+$", match: true } },
        { selector: "classProperty", modifiers: ["static", "readonly"], format: ["UPPER_CASE", "camelCase"] },
        // Why: esbuild's `define` injects these build-time constants.
        { selector: "variable", format: null, filter: { regex: "^__[A-Z_]+__$", match: true } },
      ],

      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-extraneous-class": ["error", { allowStaticOnly: true }],
      "@typescript-eslint/switch-exhaustiveness-check": ["error", { requireDefaultForNonUnion: true, considerDefaultExhaustiveForUnions: true }],
      "@typescript-eslint/consistent-type-definitions": ["error", "interface"],
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "@stylistic/object-curly-newline": ["error", {
        TSTypeLiteral: { multiline: true, minProperties: 2 },
        TSInterfaceBody: { multiline: true, minProperties: 2 },
      }],
      "@stylistic/member-delimiter-style": "error",

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
      // Why: it asks for `value!` where `no-non-null-assertion` forbids it; code narrows with a guard instead.
      "@typescript-eslint/non-nullable-type-assertion-style": "off",

      "sonarjs/cognitive-complexity": ["error", MAX_COGNITIVE_COMPLEXITY],
      "max-depth": ["error", MAX_DEPTH],
      "max-params": ["error", MAX_PARAMS],
      "sonarjs/no-nested-conditional": "error",
      "sonarjs/no-collapsible-if": "error",
      "sonarjs/no-identical-functions": "error",
      "sonarjs/no-duplicated-branches": "error",
      "sonarjs/no-all-duplicated-branches": "error",
      "sonarjs/no-identical-conditions": "error",
      "local/comment-marker": "error",
      "local/literal-dispatch": "error",
      "max-classes-per-file": ["error", 1],
      "local/class-matches-file": "error",
      "sonarjs/expression-complexity": "error",
      "sonarjs/no-nested-template-literals": "error",
      "sonarjs/no-nested-functions": "error",
      "sonarjs/no-nested-switch": "error",
      "sonarjs/no-nested-assignment": "error",
      "sonarjs/no-nested-incdec": "error",
      "sonarjs/shorthand-property-grouping": "error",
      // Why: handler maps keyed by snake_case ids (`user_rejected: (failure) => …`) keep the id's spelling, like any
      // other external key; declared functions are still camelCase through naming-convention.
      "sonarjs/function-name": ["error", { format: "^(?:[_a-z][a-zA-Z0-9]*|[a-z]+(?:_[a-z]+)+)$" }],
      "sonarjs/super-linear-regex": "error",
      "sonarjs/elseif-without-else": "error",
      "sonarjs/no-duplicate-string": "error",
      "sonarjs/duplicates-in-character-class": "error",
      "sonarjs/too-many-break-or-continue-in-loop": "error",
      "sonarjs/no-alphabetical-sort": "error",
      "sonarjs/regex-complexity": "error",
      "sonarjs/concise-regex": "error",
      "sonarjs/no-misleading-array-reverse": "error",
      "sonarjs/misplaced-loop-counter": "error",
      "sonarjs/function-return-type": "error",
      "sonarjs/array-constructor": "error",
      "no-restricted-syntax": ["error", {
        selector: [
          "CallExpression > CallExpression.arguments:matches([arguments.length>=3], :has(> CallExpression.arguments))",
          "CallExpression > SpreadElement > CallExpression:matches([arguments.length>=3], :has(> CallExpression.arguments))",
        ].join(", "),
        message: "Store this call's result in a named variable before passing it to another call.",
      }],

      "no-restricted-imports": ["error", { patterns: [NO_PARENT_IMPORTS] }],
      "no-restricted-properties": ["error", { object: "process", property: "env", message: "Read environment variables through EnvUtil (src/Shared/Utils/EnvUtil.ts)." }],

      "@stylistic/max-len": ["error", { code: 120, ignoreUrls: true, ignoreStrings: true, ignoreTemplateLiterals: true, ignoreRegExpLiterals: true, ignoreComments: true }],
      "@stylistic/no-multi-spaces": "error",
      "@stylistic/brace-style": ["error", "1tbs", { allowSingleLine: false }],
      "@stylistic/key-spacing": ["error", { beforeColon: false, afterColon: true, mode: "strict" }],
    },
  },
  {
    // Why: these may import a provider (tests through its fixture, ProviderModule to create it), so only the style applies.
    files: ["src/*.ts", "src/Shared/**/*.test.ts", "src/Shared/Modules/ProviderModule.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: SOURCE_IMPORTS }] },
  },
  {
    files: ["src/Shared/Utils/EnvUtil.ts"],
    rules: { "no-restricted-properties": "off" },
  },
  {
    // Why: shared code never knows a provider; ProviderModule is the one bridge (ADR 0008).
    files: ["src/Shared/**/*.ts"],
    ignores: ["src/Shared/Modules/ProviderModule.ts", "src/Shared/**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [...SOURCE_IMPORTS, NO_PROVIDER_IMPORTS] }],
    },
  },
  {
    files: ["src/Providers/ClaudeCode/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [...SOURCE_IMPORTS, NO_OTHER_PROVIDER_IMPORTS] }],
    },
  },
  ...layerConfigs,
  ...layerExceptionConfigs,
  {
    files: [...TEST_FILES, "src/Providers/*/Utils/*FixtureUtil.ts", "src/Providers/*/Utils/*TranscriptBuilder.ts"],
    rules: {
      "@typescript-eslint/no-magic-numbers": "off",
      "no-restricted-properties": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      // Why: fixtures write external formats (settings.json, env blocks) with their own key spelling.
      "@typescript-eslint/naming-convention": "off",
    },
  },
  {
    files: TEST_FILES,
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      "vitest/no-conditional-expect": "error",
      "vitest/no-conditional-in-test": "error",
      "vitest/no-conditional-tests": "error",
      "vitest/no-disabled-tests": "error",
      "vitest/no-focused-tests": "error",
      "vitest/no-standalone-expect": "error",
      "vitest/no-test-return-statement": "error",
      "vitest/no-duplicate-hooks": "error",
      "vitest/prefer-hooks-on-top": "error",
      "vitest/prefer-hooks-in-order": "error",
      "vitest/prefer-each": "error",
      "vitest/prefer-strict-equal": "error",
      "vitest/prefer-to-be": "error",
      "vitest/prefer-to-have-length": "error",
      "vitest/prefer-to-contain": "error",
      "vitest/prefer-comparison-matcher": "error",
      "vitest/prefer-equality-matcher": "error",
      "vitest/prefer-called-with": "error",
      "vitest/no-alias-methods": "error",
      "vitest/require-to-throw-message": "error",
      "vitest/no-restricted-matchers": ["error", {
        toBeDefined: "Assert the value itself (toBe, toStrictEqual, toMatchObject).",
        toBeTruthy: "Assert the exact value: toBe(true) or the expected value.",
        toBeFalsy: "Assert the exact value: toBe(false), toBeUndefined() or the expected value.",
      }],
    },
  },
  {
    files: ["**/*.mjs", "**/*.js"],
    ...tseslint.configs.disableTypeChecked,
  },
);
