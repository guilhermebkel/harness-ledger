// Why: each rule is documented in docs/code-standards.md (describe-target: docs/test-standards.md); change both together.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import tseslint from "typescript-eslint";

const COMMENT_MARKER = /^Why: \S/;
const TOOL_DIRECTIVE = /^(eslint-disable|eslint-enable|@ts-expect-error|global )/;
const EQUALITY_OPERATORS = new Set(["===", "==", "!==", "!="]);
const MIN_CASES_FOR_MAP = 2;
const PASSTHROUGH_TYPES = new Set(["LogicalExpression", "UnaryExpression"]);
const EXIT_TYPES = new Set(["ReturnStatement", "ThrowStatement", "ContinueStatement", "BreakStatement"]);

const COMMENT_TYPE_TO_TRAITS = {
  Line: { isLineComment: true, isDirective: false },
  Block: { isLineComment: false, isDirective: false },
  Shebang: { isLineComment: false, isDirective: true },
};

function firstLineOf(comment) {
  return comment.value.split("\n").map((line) => line.replace(/^\s*\*?\s?/, "").trim()).find(Boolean) ?? "";
}

const commentMarker = {
  meta: {
    type: "suggestion",
    messages: { missing: "Delete this comment, or start it with \"Why:\" and the hidden rule it protects." },
  },
  create(context) {
    return {
      "Program:exit"() {
        let previousLineCommentEnd = -1;
        for (const comment of context.sourceCode.getAllComments()) {
          const { isLineComment, isDirective } = COMMENT_TYPE_TO_TRAITS[comment.type];
          // Why: consecutive line comments are one comment; only the first line carries the marker.
          const isContinuation = isLineComment && comment.loc.start.line === previousLineCommentEnd + 1;
          previousLineCommentEnd = isLineComment ? comment.loc.end.line : -1;
          const firstLine = firstLineOf(comment);
          const isAllowed = isDirective || COMMENT_MARKER.test(firstLine) || TOOL_DIRECTIVE.test(firstLine);
          if (!isContinuation && !isAllowed) {
            context.report({ loc: comment.loc, messageId: "missing" });
          }
        }
      },
    };
  },
};

const NODE_TYPE_TO_IS_FIXED = new Map([
  ["Literal", (node) => typeof node.value === "string" && node.value !== ""],
  ["TemplateLiteral", (node) => node.expressions.length === 0 && node.quasis[0]?.value.cooked !== ""],
]);

function isFixedValue(node) {
  return NODE_TYPE_TO_IS_FIXED.get(node.type)?.(node) ?? false;
}

function isTypeCheck(subject) {
  return subject.type === "UnaryExpression" && subject.operator === "typeof";
}

function comparedSubject(comparison) {
  if (!EQUALITY_OPERATORS.has(comparison.operator)) {
    return undefined;
  }
  const isRightFixed = isFixedValue(comparison.right);
  if (isRightFixed === isFixedValue(comparison.left)) {
    return undefined;
  }
  const subject = isRightFixed ? comparison.left : comparison.right;
  return isTypeCheck(subject) ? undefined : subject;
}

function lastStatementOf(statement) {
  return Array.isArray(statement.body) ? statement.body.at(-1) : statement;
}

function isGuard(ifStatement) {
  const lastStatement = lastStatementOf(ifStatement.consequent);
  return !ifStatement.alternate && lastStatement !== undefined && EXIT_TYPES.has(lastStatement.type);
}

const DECISION_TYPE_TO_IS_BRANCH = new Map([
  ["IfStatement", (ifStatement) => !isGuard(ifStatement)],
  ["ConditionalExpression", () => true],
]);

// Why: an empty string ("") is an emptiness check and `typeof` a type check, not a choice between values.
// A comparison that decides which code runs (a non-guard if, a ternary) is a dispatch even alone; one that
// only becomes a value (returned, passed, stored) or leaves early is not.
function isBranchCondition(comparison) {
  let condition = comparison;
  while (PASSTHROUGH_TYPES.has(condition.parent?.type)) {
    condition = condition.parent;
  }
  const decision = condition.parent;
  const isBranch = DECISION_TYPE_TO_IS_BRANCH.get(decision?.type);
  return decision?.test === condition && isBranch !== undefined && isBranch(decision);
}

const literalDispatch = {
  meta: {
    type: "suggestion",
    messages: {
      repeated: "\"{{subject}}\" is compared with a fixed value again in this function. Dispatch through a Record<Key, Handler> map instead.",
      branch: "This branch picks code by comparing \"{{subject}}\" with a fixed value. Dispatch through a Record<Key, Handler> map, or make it a guard that leaves early.",
      switchCases: "This switch dispatches on fixed values. Use a Record<Key, Handler> map instead.",
    },
  },
  create(context) {
    const scopes = [new Map()];
    const record = (comparison) => {
      const subject = comparedSubject(comparison);
      if (!subject) {
        return;
      }
      const key = context.sourceCode.getText(subject).replaceAll("?.", ".");
      const seen = scopes.at(-1);
      const count = (seen.get(key) ?? 0) + 1;
      seen.set(key, count);
      if (count >= MIN_CASES_FOR_MAP) {
        context.report({ node: comparison, messageId: "repeated", data: { subject: key } });
        return;
      }
      if (isBranchCondition(comparison)) {
        context.report({ node: comparison, messageId: "branch", data: { subject: key } });
      }
    };
    return {
      ":function"() {
        scopes.push(new Map());
      },
      ":function:exit"() {
        scopes.pop();
      },
      "BinaryExpression"(node) {
        record(node);
      },
      "SwitchStatement"(node) {
        const fixedCases = node.cases.filter((switchCase) => switchCase.test && isFixedValue(switchCase.test));
        if (fixedCases.length >= MIN_CASES_FOR_MAP) {
          context.report({ node, messageId: "switchCases" });
        }
      },
    };
  },
};

function fileStemOf(filename) {
  const base = filename.split(/[\\/]/).at(-1) ?? "";
  return base.replace(/\.[^.]+$/, "");
}

const classMatchesFile = {
  meta: {
    type: "suggestion",
    messages: { mismatch: "Class \"{{name}}\" lives in \"{{file}}\"; name the file after its one class." },
  },
  create(context) {
    const stem = fileStemOf(context.filename);
    return {
      "Program > ClassDeclaration, Program > ExportNamedDeclaration > ClassDeclaration"(node) {
        const name = node.id?.name;
        if (name && name !== stem) {
          context.report({ node: node.id, messageId: "mismatch", data: { name, file: stem } });
        }
      },
    };
  },
};

const DESCRIBE_TARGET = /^([A-Z]\w*)\.(\w+)\(\)$/;
const HIDDEN_ACCESSIBILITY = new Set(["private", "protected"]);
const TEST_SUFFIX = /\.test$/;
const SOURCE_EXTENSION = ".ts";

function isPublicMember(member) {
  const isNamed = member.key?.type === "Identifier";
  return isNamed && !HIDDEN_ACCESSIBILITY.has(member.accessibility) && member.kind !== "constructor";
}

function publicMethodsOf(sourcePath, className) {
  const { ast: program } = tseslint.parser.parseForESLint(readFileSync(sourcePath, "utf8"), { sourceType: "module" });
  const declarations = program.body.map((node) => node.declaration ?? node);
  const classNode = declarations.find((node) => node.type === "ClassDeclaration" && node.id?.name === className);
  const members = classNode?.body.body ?? [];
  return new Set(members.filter((member) => isPublicMember(member)).map((member) => member.key.name));
}

function calleeNameOf(statement) {
  return statement.expression?.callee?.name;
}

const describeTarget = {
  meta: {
    type: "suggestion",
    messages: {
      format: "Name the outer describe \"{{className}}.<method>()\": the class this file tests and the public method the tests go through.",
      otherClass: "This file tests {{className}}; the outer describe names \"{{named}}\".",
      notPublic: "{{className}} has no public method \"{{method}}\" in {{source}}; test through a public method.",
      outside: "Put this test inside a describe named \"{{className}}.<method>()\".",
    },
  },
  create(context) {
    const className = fileStemOf(context.filename).replace(TEST_SUFFIX, "");
    const testFolder = dirname(resolve(context.filename));
    const sourcePath = join(testFolder, `${className}${SOURCE_EXTENSION}`);
    let publicMethods;
    const methodsOfSource = () => {
      publicMethods ??= existsSync(sourcePath) ? publicMethodsOf(sourcePath, className) : new Set();
      return publicMethods;
    };
    const checkDescribe = (call) => {
      const title = call.arguments[0];
      const match = DESCRIBE_TARGET.exec(typeof title?.value === "string" ? title.value : "");
      if (!match) {
        context.report({ node: title ?? call, messageId: "format", data: { className } });
        return;
      }
      const [, named, method] = match;
      if (named !== className) {
        context.report({ node: title, messageId: "otherClass", data: { className, named } });
        return;
      }
      if (!methodsOfSource().has(method)) {
        context.report({ node: title, messageId: "notPublic", data: { className, method, source: `${className}${SOURCE_EXTENSION}` } });
      }
    };
    const reportOutside = (call) => {
      context.report({ node: call, messageId: "outside", data: { className } });
    };
    const CALLEE_TO_CHECK = { describe: checkDescribe, it: reportOutside, test: reportOutside };
    return {
      "Program"(program) {
        for (const statement of program.body) {
          const name = calleeNameOf(statement);
          const check = Object.hasOwn(CALLEE_TO_CHECK, name ?? "") ? CALLEE_TO_CHECK[name] : undefined;
          check?.(statement.expression);
        }
      },
    };
  },
};

export const localRules = {
  rules: {
    "comment-marker": commentMarker,
    "literal-dispatch": literalDispatch,
    "class-matches-file": classMatchesFile,
    "describe-target": describeTarget,
  },
};
