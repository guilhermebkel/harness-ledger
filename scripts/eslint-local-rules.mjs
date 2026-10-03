// Why: each rule is documented in docs/code-standards.md; change both together.
const COMMENT_MARKER = /^Why: \S/;
const TOOL_DIRECTIVE = /^(eslint-disable|eslint-enable|@ts-expect-error|global )/;
const EQUALITY_OPERATORS = new Set(["===", "==", "!==", "!="]);
const MIN_CASES_FOR_MAP = 2;

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
  ["Literal", (node) => typeof node.value === "string"],
  ["TemplateLiteral", (node) => node.expressions.length === 0],
]);

function isFixedValue(node) {
  return NODE_TYPE_TO_IS_FIXED.get(node.type)?.(node) ?? false;
}

function comparedSubject(comparison) {
  if (!EQUALITY_OPERATORS.has(comparison.operator)) {
    return undefined;
  }
  const isRightFixed = isFixedValue(comparison.right);
  if (isRightFixed === isFixedValue(comparison.left)) {
    return undefined;
  }
  return isRightFixed ? comparison.left : comparison.right;
}

const literalDispatch = {
  meta: {
    type: "suggestion",
    messages: {
      repeated: "\"{{subject}}\" is compared with a fixed value again in this function. Dispatch through a Record<Key, Handler> map instead.",
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

export const localRules = {
  rules: {
    "comment-marker": commentMarker,
    "literal-dispatch": literalDispatch,
  },
};
