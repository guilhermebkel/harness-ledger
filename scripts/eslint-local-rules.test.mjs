import { RuleTester } from "eslint";
import { afterAll, describe, it } from "vitest";
import { localRules } from "./eslint-local-rules.mjs";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({ languageOptions: { ecmaVersion: 2024, sourceType: "module" } });

ruleTester.run("literal-dispatch", localRules.rules["literal-dispatch"], {
  valid: [
    {
      name: "one comparison that leaves early is a guard",
      code: "function f(threshold) { if (threshold === \"always\") { return true; } return false; }",
    },
    {
      name: "the same subject in different functions",
      code: "function f(kind) { if (kind === \"a\") { return 1; } } function g(kind) { return kind === \"b\" ? 2 : 3; }",
    },
    {
      name: "comparisons with values that aren't fixed",
      code: "function f(kind, other) { if (kind === other) { return 1; } if (kind === other.kind) { return 2; } }",
    },
    {
      name: "a comparison stored once and reused",
      code: "function f(mode) { const isText = mode === \"text\"; if (isText) { return 1; } return isText ? 2 : 3; }",
    },
    {
      name: "a lookup in a map",
      code: "const KIND_TO_HANDLER = { a: () => 1, b: () => 2 }; function f(kind) { return KIND_TO_HANDLER[kind](); }",
    },
  ],
  invalid: [
    {
      name: "if statements one after another",
      code: "function f(lineType) { if (lineType === \"user\") { return 1; } if (lineType === \"assistant\") { return 2; } }",
      errors: [{ messageId: "repeated", data: { subject: "lineType" } }],
    },
    {
      name: "an else-if chain",
      code: "function f(kind) { if (kind === \"a\") { return 1; } else if (kind === \"b\") { return 2; } else { return 3; } }",
      errors: [{ messageId: "repeated" }],
    },
    {
      name: "a ternary after an if, through optional chaining",
      code: "function f(match) { if (match?.kind === \"none\") { return []; } return match.kind === \"language\" ? [1] : [2]; }",
      errors: [{ messageId: "repeated", data: { subject: "match.kind" } }],
    },
    {
      name: "comparisons joined by || or &&",
      code: "function f(result) { return result.kind !== \"interrupted\" && result.kind !== \"user_rejected\"; }"
        + " function g(result) { if (result.kind === \"interrupted\" || result.kind === \"user_rejected\") { return 1; } }",
      errors: [{ messageId: "repeated" }, { messageId: "repeated" }],
    },
    {
      name: "a switch over fixed values",
      code: "function f(kind) { switch (kind) { case \"a\": return 1; case \"b\": return 2; default: return 3; } }",
      errors: [{ messageId: "switchCases" }],
    },
  ],
});

ruleTester.run("comment-marker", localRules.rules["comment-marker"], {
  valid: [
    {
      name: "a comment that names the hidden rule, over two lines",
      code: "// Why: the provider repeats usage on every line.\n// Count it once per message.\nconst usage = 1;",
    },
    {
      name: "tool directives",
      code: "// eslint-disable-next-line no-console\nconsole.log(1);\n/* global window */",
    },
  ],
  invalid: [
    {
      name: "a comment that narrates the code",
      code: "// Add one to the total.\nconst total = 1;",
      errors: [{ messageId: "missing" }],
    },
    {
      name: "a doc block that repeats the name",
      code: "/** Parses the line. */\nfunction parseLine() {}",
      errors: [{ messageId: "missing" }],
    },
  ],
});
