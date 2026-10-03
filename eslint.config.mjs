// Why: each rule is documented in docs/code-standards.md; change both together.
import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import sonarjs from "eslint-plugin-sonarjs";
import globals from "globals";
import tseslint from "typescript-eslint";

const NO_PARENT_IMPORTS = { group: ["../*", "../**"], message: "Import from \"@/...\" instead of a relative parent path." };
const NO_PROVIDER_IMPORTS = {
  group: ["@/Providers/**", "**/Providers/**"],
  message: "Shared code must not import a provider. Go through ProviderModule (ADR 0008).",
};
const NO_OTHER_PROVIDER_IMPORTS = {
  group: ["@/Providers/*/**", "**/Providers/*/**", "!@/Providers/ClaudeCode/**", "!**/Providers/ClaudeCode/**"],
  message: "A provider must not import another provider (ADR 0008).",
};

const LAYER_TO_FORBIDDEN_LAYERS = {
  Protocols: ["Utils", "Services", "Adapters", "Commands", "Modules"],
  Utils: ["Services", "Adapters", "Commands", "Modules"],
  Services: ["Commands", "Modules"],
  Adapters: ["Commands", "Modules"],
  Commands: ["Modules"],
};
const SCOPES = [
  { dir: "src/Shared", patterns: [NO_PARENT_IMPORTS, NO_PROVIDER_IMPORTS] },
  { dir: "src/Providers/ClaudeCode", patterns: [NO_PARENT_IMPORTS, NO_OTHER_PROVIDER_IMPORTS] },
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
    ignores: ["src/**/*.test.ts", ...Object.keys(LAYER_EXCEPTIONS)],
    rules: { "no-restricted-imports": ["error", { patterns: [...patterns, layerPattern(layer, forbiddenLayers)] }] },
  })),
);
const layerExceptionConfigs = Object.entries(LAYER_EXCEPTIONS).map(([file, forbiddenLayers]) => ({
  files: [file],
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [NO_PARENT_IMPORTS, NO_PROVIDER_IMPORTS, layerPattern("Services", forbiddenLayers)],
    }],
  },
}));

const MAX_COGNITIVE_COMPLEXITY = 15;
const MAX_DEPTH = 3;
const MAX_PARAMS = 5;

// Why: a comment must protect a rule the code doesn't show, so it says which one up front (docs/code-standards.md).
const COMMENT_MARKER = /^Why: \S/;
const TOOL_DIRECTIVE = /^(eslint-disable|eslint-enable|@ts-expect-error|global )/;
const localPlugin = {
  rules: {
    "comment-marker": {
      meta: { type: "suggestion", messages: { missing: "Delete this comment, or start it with \"Why:\" and the hidden rule it protects." } },
      create(context) {
        return {
          "Program:exit"() {
            let previousLineCommentEnd = -1;
            for (const comment of context.sourceCode.getAllComments()) {
              // Why: consecutive line comments are one comment; only the first line carries the marker.
              const isContinuation = comment.type === "Line" && comment.loc.start.line === previousLineCommentEnd + 1;
              previousLineCommentEnd = comment.type === "Line" ? comment.loc.end.line : -1;
              const firstLine = comment.value.split("\n").map((line) => line.replace(/^\s*\*?\s?/, "").trim()).find(Boolean) ?? "";
              const isAllowed = COMMENT_MARKER.test(firstLine) || TOOL_DIRECTIVE.test(firstLine);
              if (comment.type !== "Shebang" && !isContinuation && !isAllowed) {
                context.report({ loc: comment.loc, messageId: "missing" });
              }
            }
          },
        };
      },
    },
  },
};

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
    plugins: { sonarjs, local: localPlugin },
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
      "sonarjs/expression-complexity": "error",
      "sonarjs/no-nested-template-literals": "error",
      "sonarjs/no-nested-functions": "error",
      "sonarjs/no-nested-switch": "error",
      "sonarjs/no-nested-assignment": "error",
      "sonarjs/no-nested-incdec": "error",
      "sonarjs/shorthand-property-grouping": "error",
      "sonarjs/function-name": "error",
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
    files: ["src/Shared/Utils/EnvUtil.ts"],
    rules: { "no-restricted-properties": "off" },
  },
  {
    // Why: shared code never knows a provider; ProviderModule is the one bridge (ADR 0008).
    files: ["src/Shared/**/*.ts"],
    ignores: ["src/Shared/Modules/ProviderModule.ts", "src/Shared/**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [NO_PARENT_IMPORTS, NO_PROVIDER_IMPORTS] }],
    },
  },
  {
    files: ["src/Providers/ClaudeCode/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [NO_PARENT_IMPORTS, NO_OTHER_PROVIDER_IMPORTS] }],
    },
  },
  ...layerConfigs,
  ...layerExceptionConfigs,
  {
    files: ["src/**/*.test.ts", "src/Providers/*/Utils/*FixtureUtil.ts"],
    rules: {
      "@typescript-eslint/no-magic-numbers": "off",
      "no-restricted-properties": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      // Why: fixtures write external formats (settings.json, env blocks) with their own key spelling.
      "@typescript-eslint/naming-convention": "off",
    },
  },
  {
    files: ["**/*.mjs", "**/*.js"],
    ...tseslint.configs.disableTypeChecked,
  },
);
