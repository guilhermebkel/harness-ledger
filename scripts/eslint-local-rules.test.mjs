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
      code: "function f(kind) { if (kind === \"a\") { return 1; } } function g(kind) { return kind === \"b\"; }",
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
      name: "a comparison that only becomes a value, in a callback or an argument",
      code: "function f(calls) { return calls.filter((call) => call.category === \"edit\"); }",
    },
    {
      name: "a guard that throws or continues",
      code: "function f(items) { for (const item of items) { if (item.kind === \"skip\") continue; } if (items.mode === \"x\") { throw new Error(); } }",
    },
    {
      name: "type checks and emptiness checks",
      code: "function f(value) { return typeof value === \"string\" && value !== \"\" ? value : undefined; }",
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
      errors: [{ messageId: "branch" }, { messageId: "repeated" }],
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
      name: "a single if that does work instead of leaving",
      code: "function f(options) { let fingerprint; if (options.status === \"applied\") { fingerprint = 1; } return fingerprint; }",
      errors: [{ messageId: "branch", data: { subject: "options.status" } }],
    },
    {
      name: "a single ternary, also inside && or ||",
      code: "function f(metadata, isOn) { return isOn && metadata?.trigger === \"manual\" ? \"manual\" : \"auto\"; }",
      errors: [{ messageId: "branch", data: { subject: "metadata.trigger" } }],
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

ruleTester.run("class-matches-file", localRules.rules["class-matches-file"], {
  valid: [
    {
      name: "one exported class named after its file",
      filename: "src/Shared/Utils/TimeUtil.ts",
      code: "export class TimeUtil {}",
    },
    {
      name: "a class expression inside a function is not the file's class",
      filename: "src/Shared/Utils/TimeUtil.ts",
      code: "export class TimeUtil { static make() { return class {}; } }",
    },
  ],
  invalid: [
    {
      name: "a second class in the file",
      filename: "src/Providers/ClaudeCode/Services/ClaudeCodeInventoryService.ts",
      code: "class InventoryBuilder {} export class ClaudeCodeInventoryService {}",
      errors: [{ messageId: "mismatch", data: { name: "InventoryBuilder", file: "ClaudeCodeInventoryService" } }],
    },
    {
      name: "a file named after something else",
      filename: "src/Shared/Utils/SessionFactsFixtureUtil.ts",
      code: "export class SessionFactsBuilder {}",
      errors: [{ messageId: "mismatch", data: { name: "SessionFactsBuilder", file: "SessionFactsFixtureUtil" } }],
    },
  ],
});

const TIME_UTIL_TEST = "src/Shared/Utils/TimeUtil.test.ts";
const ADAPTER_TEST = "src/Providers/ClaudeCode/Adapters/ClaudeCodeProviderAdapter.test.ts";

ruleTester.run("describe-target", localRules.rules["describe-target"], {
  valid: [
    {
      name: "the outer describe names the class and a public static method, with contexts inside",
      filename: TIME_UTIL_TEST,
      code: "describe(\"TimeUtil.parsePointInTime()\", () => { describe(\"on a period\", () => { it(\"reads days\", () => {}); }); });",
    },
    {
      name: "a public instance method, next to hooks at the top level",
      filename: ADAPTER_TEST,
      code: "beforeEach(() => {}); describe(\"ClaudeCodeProviderAdapter.parseSession()\", () => {});",
    },
  ],
  invalid: [
    {
      name: "a method without the class",
      filename: TIME_UTIL_TEST,
      code: "describe(\"parsePointInTime\", () => {});",
      errors: [{ messageId: "format", data: { className: "TimeUtil" } }],
    },
    {
      name: "a theme instead of a method",
      filename: TIME_UTIL_TEST,
      code: "describe(\"TimeUtil\", () => {});",
      errors: [{ messageId: "format", data: { className: "TimeUtil" } }],
    },
    {
      name: "another class than the file's",
      filename: TIME_UTIL_TEST,
      code: "describe(\"RedactUtil.redact()\", () => {});",
      errors: [{ messageId: "otherClass", data: { className: "TimeUtil", named: "RedactUtil" } }],
    },
    {
      name: "a private method",
      filename: ADAPTER_TEST,
      code: "describe(\"ClaudeCodeProviderAdapter.sessionService()\", () => {});",
      errors: [{
        messageId: "notPublic",
        data: { className: "ClaudeCodeProviderAdapter", method: "sessionService", source: "ClaudeCodeProviderAdapter.ts" },
      }],
    },
    {
      name: "a method the class doesn't have, as after a rename",
      filename: TIME_UTIL_TEST,
      code: "describe(\"TimeUtil.parseDate()\", () => {});",
      errors: [{ messageId: "notPublic", data: { className: "TimeUtil", method: "parseDate", source: "TimeUtil.ts" } }],
    },
    {
      name: "a test outside any describe",
      filename: TIME_UTIL_TEST,
      code: "it(\"reads days\", () => {});",
      errors: [{ messageId: "outside", data: { className: "TimeUtil" } }],
    },
  ],
});
