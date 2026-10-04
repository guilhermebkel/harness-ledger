#!/usr/bin/env node
// improve-my-harness — generated file, edit src/ and run `pnpm build`.

// src/Shared/Modules/CLIModule.ts
import { readFile as readFile7 } from "node:fs/promises";
import { parseArgs } from "node:util";

// src/Shared/Utils/CollectionUtil.ts
var CollectionUtil = class {
  static compareCodeUnits = (left, right) => {
    if (left === right) {
      return 0;
    }
    return left < right ? -1 : 1;
  };
  static unique(items) {
    return [...new Set(items)];
  }
  static countBy(values) {
    const valueToCount = {};
    for (const value of values) {
      valueToCount[value] = (valueToCount[value] ?? 0) + 1;
    }
    return valueToCount;
  }
  static pushTo(keyToItems, key, item) {
    const items = keyToItems.get(key) ?? [];
    items.push(item);
    keyToItems.set(key, items);
  }
  static async mapWithConcurrency(items, concurrency, work) {
    const results = [];
    let nextIndex = 0;
    const workerCount = Math.max(1, Math.min(concurrency, items.length));
    const runWorker = async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex++;
        results[index] = await work(items[index]);
      }
    };
    await Promise.all(Array.from({ length: workerCount }, runWorker));
    return results;
  }
};

// src/Shared/Utils/RedactUtil.ts
import { homedir } from "node:os";

// src/Shared/Utils/RegExpUtil.ts
var RegExpUtil = class _RegExpUtil {
  static escape(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  static wholeTerm(term, flags = "") {
    return new RegExp(`(?<![\\w-])${_RegExpUtil.escape(term)}(?![\\w-])`, flags);
  }
};

// src/Shared/Utils/RedactUtil.ts
var MASK = "[REDACTED]";
var DEFAULT_EXCERPT_CHARS = 200;
var SECRET_PATTERNS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, MASK],
  [/\bsk-(?:ant-|proj-|live-|test-)?[A-Za-z0-9_-]{16,}/g, MASK],
  [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g, MASK],
  [/\bgithub_pat_\w{20,}/g, MASK],
  [/\bglpat-[A-Za-z0-9_-]{16,}/g, MASK],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/g, MASK],
  [/\bAKIA[0-9A-Z]{16}\b/g, MASK],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, MASK],
  [/\b(?:rk|pk|sk)_(?:live|test)_[A-Za-z0-9]{16,}/g, MASK],
  [/\bnpm_[A-Za-z0-9]{30,}/g, MASK],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, MASK],
  [/\b(Bearer|Basic|Token)\s+[a-z0-9._~+/=-]{12,}/gi, `$1 ${MASK}`],
  [/([a-z][a-z0-9+.-]{0,30}:\/\/)[^\s:/@]{1,256}:[^\s@/]{1,256}@/gi, `$1${MASK}@`]
];
var SENSITIVE_KEY_WORDS = ["pass", "secret", "token", "api[_-]?key", "access[_-]?key", "private[_-]?key", "credential", "auth"];
var MAX_KEY_AFFIX_CHARS = 40;
var KEY_AFFIX = `[\\w.-]{0,${MAX_KEY_AFFIX_CHARS}}`;
var SENSITIVE_ASSIGNMENT = new RegExp(
  `(["']?${KEY_AFFIX}(?:${SENSITIVE_KEY_WORDS.join("|")})${KEY_AFFIX}["']?\\s{0,4}[:=]\\s{0,4})(["']?)([^\\s"',;&]{4,})\\2`,
  "gi"
);
var RedactUtil = class _RedactUtil {
  static redact(text) {
    if (!text) {
      return text;
    }
    let redacted = text;
    for (const [pattern, replacement] of SECRET_PATTERNS) {
      redacted = redacted.replace(pattern, replacement);
    }
    const withoutSecrets = redacted.replace(
      SENSITIVE_ASSIGNMENT,
      (_match, keyPart, quote) => `${keyPart}${quote}${MASK}${quote}`
    );
    return _RedactUtil.withoutHomeFolder(withoutSecrets);
  }
  static withoutHomeFolder(text) {
    const home = homedir();
    const isUsableHome = home.length > 1 && home !== "/";
    if (!isUsableHome) {
      return text;
    }
    const escapedHome = RegExpUtil.escape(home);
    return text.replace(new RegExp(`${escapedHome}(?![\\w.-])`, "g"), "~");
  }
  static excerpt(text, maxChars = DEFAULT_EXCERPT_CHARS) {
    const oneLine = _RedactUtil.redact(text).replace(/\s+/g, " ").trim();
    return oneLine.length > maxChars ? `${oneLine.slice(0, maxChars - 1)}\u2026` : oneLine;
  }
};

// src/Shared/Utils/NormalizeUtil.ts
var EXPLORATION_PROGRAMS = /* @__PURE__ */ new Set([
  "ls",
  "cat",
  "find",
  "grep",
  "rg",
  "sed",
  "head",
  "tail",
  "wc",
  "echo",
  "pwd",
  "tree",
  "which",
  "sort",
  "awk",
  "cut",
  "jq",
  "file",
  "stat",
  "du",
  "diff",
  "true",
  "sleep",
  "less",
  "printf",
  "date",
  "env",
  "type"
]);
var VALIDATION_COMMAND = /\b(test|tests|jest|vitest|mocha|pytest|rspec|phpunit|lint|eslint|prettier|ruff|flake8|mypy|tsc|typecheck|check|build|clippy|vet)\b/;
var DELIVERY_COMMAND = /^(git (commit|push|tag)|gh pr|gh release|glab mr|vercel|netlify|fly deploy|kubectl apply)\b/;
var SETUP_COMMAND = /^(git (checkout|switch|pull|fetch|worktree|branch|clone|stash|rebase)|npm (install|ci)|pnpm install|yarn install|pip install|uv sync|bundle install|docker compose up)\b/;
var COMMAND_WRAPPERS = /* @__PURE__ */ new Set(["sudo", "time", "nohup", "env", "command", "exec", "timeout", "do", "then", "else"]);
var NAVIGATION_COMMAND = /^(cd|pushd|popd|export|source|\.|set|for|while|until|if|elif|done|fi|esac|nvm use|conda activate|pyenv shell)\b/;
var ENV_ASSIGNMENT = /^[A-Za-z_]\w*=/;
var WRAPPER_ARGUMENT = /^(-\S*|\d+(\.\d+)?[smhd]?)$/;
var PROGRAMS_WITH_SUBCOMMAND = /* @__PURE__ */ new Set([
  "npm",
  "pnpm",
  "yarn",
  "bun",
  "npx",
  "bunx",
  "git",
  "gh",
  "docker",
  "kubectl",
  "helm",
  "cargo",
  "go",
  "make",
  "pip",
  "pip3",
  "uv",
  "poetry",
  "dotnet",
  "mvn",
  "gradle",
  "./gradlew",
  "terraform",
  "aws",
  "gcloud",
  "az",
  "brew",
  "apt",
  "apt-get",
  "composer",
  "bundle",
  "rails",
  "mix",
  "deno",
  "turbo",
  "nx"
]);
var RUNNER_SUBCOMMANDS = /* @__PURE__ */ new Set(["run", "exec", "x", "dlx", "-m"]);
var MAX_SUBCOMMAND_CHARS = 30;
var PROGRAM_TO_GLOBAL_OPTIONS = {
  git: {
    withValue: /* @__PURE__ */ new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace"]),
    prefixes: ["--no-", "--git-dir=", "--work-tree=", "--namespace=", "--exec-path", "--bare", "--paginate"]
  }
};
var ERROR_LINES_TO_SCAN = 8;
var WARNING_LINE = /^(warning\b|npm warn\b)|\b\w*Warning:|^\s*warnings\.warn\(/i;
var PYTHON_TRACEBACK = "Traceback (most recent call last):";
var OPTION_WITH_VALUE_TOKENS = 2;
var PYTHON_EXCEPTION_LINE = /^[\w.]+(Error|Exception|Exit|Interrupt)\b/;
var ANSI_ESCAPE = /\u001b\[[0-9;]*[A-Za-z]/g;
var ERROR_HEADER_LINE = /^[^:]{0,60}\berrors?\b[^:]{0,30}:$/i;
var LEADING_CLOCK_TIME = /^\d{1,2}:\d{2}:\d{2}(\.\d+)?\s+/;
var MAX_ERROR_KEY_CHARS = 160;
var ERROR_LOOKING_LINE = /error|fail|denied|not found|no such|invalid|cannot|can't|unable|exception|refused|timed? ?out|"reason"/i;
var CORRECTION_PREFIX_CHARS = 80;
var CORRECTION_OPENERS = [
  "no(?=[,.!]|\\s*$)",
  "nope",
  "n\xE3o",
  "nao",
  "wrong",
  "errado",
  "actually",
  "na verdade",
  "instead",
  "ao inv\xE9s",
  "em vez",
  "stop",
  "pare",
  "para de",
  "don'?t",
  "do not",
  "n\xE3o fa\xE7a",
  "nao faca",
  "that'?s not",
  "isso n\xE3o",
  "isso nao",
  "you should",
  "you shouldn'?t",
  "voc\xEA deveria",
  "voce deveria",
  "why did you",
  "por que voc\xEA",
  "por que voce",
  "undo",
  "revert",
  "desfaz",
  "desfa\xE7a",
  "again",
  "de novo",
  "still (?:not|wrong|failing)",
  "ainda (?:n\xE3o|nao|est\xE1|esta)"
];
var CORRECTION_START = new RegExp(`^(?:${CORRECTION_OPENERS.join("|")})\\b`, "i");
var MIN_WORD_CHARS = 3;
var STOPWORDS = new Set(
  "the and for with that this from you your are was were can could would should please into have has had not but all any some what when where which who how why its it's our out then than them they there here tamb\xE9m para com que uma umas uns dos das por pelo pela isso isto esse essa este esta voc\xEA voce seu sua nos nas n\xE3o nao mais muito pode poderia favor ser ter tem foi vai fazer faz como quando onde qual quais".split(" ")
);
var KEPT_OPTION_SUBCOMMANDS = /* @__PURE__ */ new Set(["-m"]);
var NormalizeUtil = class _NormalizeUtil {
  static commandKey(command) {
    const segments = command.split(/&&|\|\||;|\n/).map((segment) => segment.trim()).filter(Boolean);
    let tokens = [];
    let programIndex = -1;
    for (const segment of segments.filter((candidate) => !NAVIGATION_COMMAND.test(candidate))) {
      const firstPipelineStage = segment.split(/\s\|\s?/)[0] ?? segment;
      tokens = firstPipelineStage.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
      programIndex = _NormalizeUtil.programIndexOf(tokens);
      if (programIndex !== -1) {
        break;
      }
    }
    const programToken = programIndex === -1 ? void 0 : tokens[programIndex];
    if (!programToken) {
      return "(empty)";
    }
    const isPathToProgram = programToken.includes("/") && !programToken.startsWith("./gradlew");
    const program = isPathToProgram ? programToken.split("/").pop() ?? programToken : programToken;
    const keyParts = [program];
    const hasSubcommand = PROGRAMS_WITH_SUBCOMMAND.has(program) || program.startsWith("python");
    if (hasSubcommand) {
      const [subcommand, target] = _NormalizeUtil.withoutGlobalOptions(program, tokens.slice(programIndex + 1));
      if (subcommand && (_NormalizeUtil.isPlainWord(subcommand) || KEPT_OPTION_SUBCOMMANDS.has(subcommand))) {
        keyParts.push(subcommand);
        if (RUNNER_SUBCOMMANDS.has(subcommand) && target && _NormalizeUtil.isPlainWord(target)) {
          keyParts.push(target);
        }
      }
    }
    return RedactUtil.redact(keyParts.join(" "));
  }
  static commandStage(commandKey) {
    if (_NormalizeUtil.isExplorationCommand(commandKey)) {
      return "exploration";
    }
    if (DELIVERY_COMMAND.test(commandKey)) {
      return "delivery";
    }
    if (SETUP_COMMAND.test(commandKey)) {
      return "setup";
    }
    return VALIDATION_COMMAND.test(commandKey) ? "validation" : void 0;
  }
  static isExplorationCommand(commandKey) {
    return EXPLORATION_PROGRAMS.has(commandKey.split(" ")[0] ?? "");
  }
  static errorKey(text) {
    const lines = text.replace(ANSI_ESCAPE, "").split(/\r?\n/).map((line) => line.replace(LEADING_CLOCK_TIME, "").trim()).filter((line) => line && !/^exit code \d+$/i.test(line) && !/^<\/?[\w-]+\s*\/?>$/.test(line)).filter((line) => /[A-Za-z]/.test(line));
    const nonWarningLines = lines.filter((line) => !WARNING_LINE.test(line));
    const errorIndex = nonWarningLines.slice(0, ERROR_LINES_TO_SCAN).findIndex((line) => ERROR_LOOKING_LINE.test(line));
    const isHeaderOnly = errorIndex !== -1 && ERROR_HEADER_LINE.test(nonWarningLines[errorIndex] ?? "");
    const announcedErrorLine = isHeaderOnly ? nonWarningLines[errorIndex + 1] : void 0;
    const firstErrorLine = errorIndex === -1 ? void 0 : nonWarningLines[errorIndex];
    const errorLine = _NormalizeUtil.pythonException(lines) ?? announcedErrorLine ?? firstErrorLine;
    const head = errorLine ?? nonWarningLines[0] ?? lines[0] ?? text.trim();
    const structuredReason = /"reason"\s*:\s*"([^"]{1,60})"/.exec(head)?.[1];
    const errorText = structuredReason ? `reason: ${structuredReason}` : head;
    return RedactUtil.redact(errorText).replace(/(["'`]).{1,200}?\1/g, "'\u2026'").replace(/(?:[A-Za-z]:)?[~.]?\/[\w@.+-]+(?:\/[\w@.+-]+)*/g, "<path>").replace(/\b\d+(\.\d+)*\b/g, "N").replace(/\s+/g, " ").slice(0, MAX_ERROR_KEY_CHARS).trim();
  }
  static isCorrection(text) {
    return CORRECTION_START.test(text.trim().slice(0, CORRECTION_PREFIX_CHARS));
  }
  static wordSet(text) {
    const words = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/https?:\/\/\S+/g, " ").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((word) => word.length >= MIN_WORD_CHARS && !STOPWORDS.has(word));
    return new Set(words);
  }
  static jaccard(left, right) {
    if (!left.size || !right.size) {
      return 0;
    }
    let sharedCount = 0;
    for (const word of left) {
      if (right.has(word)) {
        sharedCount++;
      }
    }
    return sharedCount / (left.size + right.size - sharedCount);
  }
  static programIndexOf(tokens) {
    let isAfterWrapper = false;
    for (const [index, token] of tokens.entries()) {
      const isWrapper = COMMAND_WRAPPERS.has(token);
      const isWrapperArgument = isAfterWrapper && WRAPPER_ARGUMENT.test(token);
      if (!isWrapper && !isWrapperArgument && !ENV_ASSIGNMENT.test(token)) {
        return index;
      }
      isAfterWrapper ||= isWrapper;
    }
    return -1;
  }
  static pythonException(lines) {
    const tracebackIndex = lines.findIndex((line) => line.startsWith(PYTHON_TRACEBACK));
    if (tracebackIndex === -1) {
      return void 0;
    }
    const afterTraceback = lines.slice(tracebackIndex + 1);
    const fromLastLine = afterTraceback.toReversed();
    return fromLastLine.find((line) => PYTHON_EXCEPTION_LINE.test(line)) ?? fromLastLine[0];
  }
  static withoutGlobalOptions(program, argumentTokens) {
    const globalOptions = PROGRAM_TO_GLOBAL_OPTIONS[program];
    if (!globalOptions) {
      return argumentTokens;
    }
    let index = 0;
    while (index < argumentTokens.length) {
      const token = argumentTokens[index] ?? "";
      if (globalOptions.withValue.has(token)) {
        index += OPTION_WITH_VALUE_TOKENS;
      } else if (globalOptions.prefixes.some((prefix) => token.startsWith(prefix))) {
        index += 1;
      } else {
        break;
      }
    }
    return argumentTokens.slice(index);
  }
  static isPlainWord(token) {
    return /^[a-z][\w:.@-]*$/i.test(token) && token.length <= MAX_SUBCOMMAND_CHARS && !token.includes("/");
  }
};

// src/Shared/Utils/NumberUtil.ts
var DECIMAL_BASE = 10;
var CHARS_PER_TOKEN = 4;
var NumberUtil = class {
  static round(value, digits = 2) {
    const factor = DECIMAL_BASE ** digits;
    return Math.round(value * factor) / factor;
  }
  static approxTokens(text) {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }
  static charsToTokens(chars) {
    return Math.round(chars / CHARS_PER_TOKEN);
  }
};

// src/Shared/Utils/SessionUtil.ts
var SessionUtil = class _SessionUtil {
  static MAIN_THREAD_ID = "main";
  // Why: a call's key is a command for these categories and an MCP server for those; shared code reads it by role.
  static COMMAND_CATEGORIES = /* @__PURE__ */ new Set(["shell"]);
  static MCP_CATEGORIES = /* @__PURE__ */ new Set(["mcp"]);
  static mainThread() {
    return {
      id: _SessionUtil.MAIN_THREAD_ID,
      agentType: _SessionUtil.MAIN_THREAD_ID
    };
  }
  static isMainThread(thread) {
    return thread.id === _SessionUtil.MAIN_THREAD_ID;
  }
};

// src/Shared/Utils/TimeUtil.ts
var SECONDS_PER_MINUTE = 60;
var MINUTES_PER_HOUR = 60;
var HOURS_PER_DAY = 24;
var DAYS_PER_WEEK = 7;
var DAYS_PER_MONTH = 30;
var MS_PER_SECOND = 1e3;
var TimeUtil = class _TimeUtil {
  static MS_PER_MINUTE = SECONDS_PER_MINUTE * MS_PER_SECOND;
  static MS_PER_HOUR = MINUTES_PER_HOUR * _TimeUtil.MS_PER_MINUTE;
  static MS_PER_DAY = HOURS_PER_DAY * _TimeUtil.MS_PER_HOUR;
  static PERIOD_UNIT_TO_MS = {
    h: _TimeUtil.MS_PER_HOUR,
    d: _TimeUtil.MS_PER_DAY,
    w: DAYS_PER_WEEK * _TimeUtil.MS_PER_DAY,
    // Why: "m" is months, not minutes ("3m").
    m: DAYS_PER_MONTH * _TimeUtil.MS_PER_DAY
  };
  static parsePointInTime(value, nowAtMs = Date.now()) {
    if (!value) {
      return void 0;
    }
    const relative4 = /^(\d+)\s*([hdwm])$/i.exec(value.trim());
    if (relative4) {
      const amount = Number(relative4[1]);
      const unit = (relative4[2] ?? "d").toLowerCase();
      return nowAtMs - amount * _TimeUtil.PERIOD_UNIT_TO_MS[unit];
    }
    const absoluteAtMs = Date.parse(value);
    if (Number.isNaN(absoluteAtMs)) {
      throw new Error(`Invalid date or period: "${value}". Use e.g. 14d, 2w, 6h or 2026-09-01.`);
    }
    return absoluteAtMs;
  }
  static msToMinutes(durationMs) {
    return NumberUtil.round(durationMs / _TimeUtil.MS_PER_MINUTE, 1);
  }
  static toIso(atMs) {
    return atMs === void 0 ? void 0 : new Date(atMs).toISOString();
  }
  static activeTime(sortedEventsAtMs, idleMs) {
    let activeMs = 0;
    for (let index = 1; index < sortedEventsAtMs.length; index++) {
      const gapMs = (sortedEventsAtMs[index] ?? 0) - (sortedEventsAtMs[index - 1] ?? 0);
      const isWithinActivity = gapMs > 0 && gapMs <= idleMs;
      if (isWithinActivity) {
        activeMs += gapMs;
      }
    }
    return activeMs;
  }
};

// src/Shared/Utils/TokenUsageUtil.ts
var TokenUsageUtil = class _TokenUsageUtil {
  static zero() {
    return {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0
    };
  }
  static add(left, right) {
    return {
      input: left.input + right.input,
      output: left.output + right.output,
      cacheRead: left.cacheRead + right.cacheRead,
      cacheWrite: left.cacheWrite + right.cacheWrite
    };
  }
  static scale(usage, factor) {
    return {
      input: usage.input * factor,
      output: usage.output * factor,
      cacheRead: usage.cacheRead * factor,
      cacheWrite: usage.cacheWrite * factor
    };
  }
  static sum(usages) {
    return usages.reduce((total, usage) => _TokenUsageUtil.add(total, usage), _TokenUsageUtil.zero());
  }
  static inputWithCache(usage) {
    return usage.input + usage.cacheRead + usage.cacheWrite;
  }
  static total(usage) {
    return usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
  }
};

// src/Shared/Utils/VersionUtil.ts
var VersionUtil = class {
  // Why: esbuild replaces it at build time; "dev" when running from source.
  static VERSION = true ? "0.2.1" : "dev";
};

// src/Shared/Services/AttributionService.ts
var UNKNOWN_SUBAGENT_TYPE = "subagent";
var AttributionService = class _AttributionService {
  constructor(pieceIds) {
    this.pieceIds = pieceIds;
  }
  static MAIN_PIECE = "main";
  // Why: agents missing from the inventory are built-in ones (general-purpose, Explore).
  static BUILT_IN_SUFFIX = " (built-in)";
  static UNRESOLVED_SUBAGENT_PIECE = `agent:${UNKNOWN_SUBAGENT_TYPE}`;
  static withoutBuiltInSuffix(pieceId) {
    const suffix = _AttributionService.BUILT_IN_SUFFIX;
    return pieceId.endsWith(suffix) ? pieceId.slice(0, -suffix.length) : pieceId;
  }
  static isSamePiece(signalPiece, piece) {
    return signalPiece === piece || signalPiece.startsWith(`${piece} `);
  }
  buildSessionIndex(session) {
    const index = {
      threadIdToMessages: this.groupMessagesByThread(session.messages),
      toolCallIdToPieces: /* @__PURE__ */ new Map(),
      promptToPreviousTurnPieces: /* @__PURE__ */ new Map()
    };
    const mainEvents = session.prompts.filter((prompt) => prompt.ref.file === session.file).map((prompt) => ({
      line: prompt.ref.line,
      prompt
    }));
    for (const call of session.tools) {
      const isMainThread = SessionUtil.isMainThread(call.thread);
      if (!isMainThread) {
        const agentPiece = this.pieceIdFor("agent", call.thread.agentType);
        const skillPieces = call.skillInUse ? [this.pieceIdFor("skill", call.skillInUse)] : [];
        index.toolCallIdToPieces.set(call.id, [agentPiece, ...skillPieces]);
      }
      if (isMainThread && call.ref.file === session.file) {
        mainEvents.push({
          line: call.ref.line,
          call
        });
      }
    }
    mainEvents.sort((left, right) => left.line - right.line);
    this.attributeMainThread(mainEvents, index);
    return index;
  }
  pieceIdFor(kind, name) {
    const pieceId = `${kind}:${name}`;
    const isKnown = this.pieceIds.has(pieceId) || this.pieceIds.size === 0;
    const isBuiltInAgent = !isKnown && kind === "agent" && name !== UNKNOWN_SUBAGENT_TYPE;
    return isBuiltInAgent ? `${pieceId}${_AttributionService.BUILT_IN_SUFFIX}` : pieceId;
  }
  commandPieceId(name) {
    return this.pieceIds.has(`skill:${name}`) ? `skill:${name}` : `command:${name}`;
  }
  attributeMainThread(mainEvents, index) {
    const turn = { current: [], last: [] };
    for (const event of mainEvents) {
      if (event.prompt) {
        const previousPieces = turn.last.length ? turn.last : [_AttributionService.MAIN_PIECE];
        index.promptToPreviousTurnPieces.set(event.prompt, previousPieces);
        turn.current = event.prompt.command ? [this.commandPieceId(event.prompt.command)] : [];
        turn.last = turn.current;
      }
      if (event.call) {
        this.attributeCall(event.call, turn, index);
      }
    }
  }
  attributeCall(call, turn, index) {
    const skillName = call.skillInUse ?? call.skill;
    if (skillName) {
      turn.current = CollectionUtil.unique([...turn.current, this.pieceIdFor("skill", skillName)]);
      turn.last = turn.current;
    }
    if (call.subagentType) {
      turn.last = CollectionUtil.unique([...turn.current, this.pieceIdFor("agent", call.subagentType)]);
    }
    index.toolCallIdToPieces.set(call.id, turn.current.length ? turn.current : [_AttributionService.MAIN_PIECE]);
  }
  groupMessagesByThread(messages) {
    const threadIdToMessages = /* @__PURE__ */ new Map();
    for (const message of messages) {
      CollectionUtil.pushTo(threadIdToMessages, message.thread.id, message);
    }
    for (const threadMessages of threadIdToMessages.values()) {
      threadMessages.sort((left, right) => (left.sentAtMs ?? 0) - (right.sentAtMs ?? 0));
    }
    return threadIdToMessages;
  }
};

// src/Shared/Services/CostService.ts
var DEFAULT_FAMILY = "default";
var TOKENS_PER_MILLION = 1e6;
var CACHE_READ_INPUT_RATIO = 0.1;
var CACHE_WRITE_INPUT_RATIO = 1.25;
var DEFAULT_PRICED_VENDOR = "claude";
var CostService = class _CostService {
  constructor(modelFamilyToPrice) {
    this.modelFamilyToPrice = modelFamilyToPrice;
  }
  // Why: list prices may be outdated; .imh/config.json overrides them.
  static DEFAULT_MODEL_FAMILY_TO_PRICE = {
    opus: {
      inputUsdPerMillionTokens: 5,
      outputUsdPerMillionTokens: 25
    },
    sonnet: {
      inputUsdPerMillionTokens: 3,
      outputUsdPerMillionTokens: 15
    },
    haiku: {
      inputUsdPerMillionTokens: 1,
      outputUsdPerMillionTokens: 5
    },
    [DEFAULT_FAMILY]: {
      inputUsdPerMillionTokens: 3,
      outputUsdPerMillionTokens: 15
    }
  };
  modelFamily(model) {
    const normalizedModel = model?.toLowerCase();
    if (!normalizedModel) {
      return DEFAULT_FAMILY;
    }
    const listedFamilies = Object.keys(this.modelFamilyToPrice);
    const family = listedFamilies.find((key) => key !== DEFAULT_FAMILY && normalizedModel.includes(key));
    if (family) {
      return family;
    }
    return normalizedModel.includes(DEFAULT_PRICED_VENDOR) ? DEFAULT_FAMILY : void 0;
  }
  isPriced(model) {
    return this.modelFamily(model) !== void 0;
  }
  costUsd(usage, model) {
    const family = this.modelFamily(model);
    if (family === void 0) {
      return 0;
    }
    const price = this.modelFamilyToPrice[family] ?? this.modelFamilyToPrice[DEFAULT_FAMILY] ?? _CostService.DEFAULT_MODEL_FAMILY_TO_PRICE[DEFAULT_FAMILY];
    if (!price) {
      return 0;
    }
    const inputPrice = price.inputUsdPerMillionTokens;
    const cacheReadPrice = price.cacheReadUsdPerMillionTokens ?? inputPrice * CACHE_READ_INPUT_RATIO;
    const cacheWritePrice = price.cacheWriteUsdPerMillionTokens ?? inputPrice * CACHE_WRITE_INPUT_RATIO;
    const weightedTokens = usage.input * inputPrice + usage.output * price.outputUsdPerMillionTokens + usage.cacheRead * cacheReadPrice + usage.cacheWrite * cacheWritePrice;
    return weightedTokens / TOKENS_PER_MILLION;
  }
};

// src/Shared/Services/OccurrenceCollectorService.ts
var OccurrenceCollectorService = class {
  idToGroup = /* @__PURE__ */ new Map();
  add(id, type, title, occurrence) {
    const group = this.idToGroup.get(id) ?? {
      id,
      type,
      title,
      occurrences: [],
      detailToValueToCount: {},
      details: {}
    };
    group.occurrences.push(occurrence);
    this.idToGroup.set(id, group);
    return group;
  }
  count(group, detail, value, amount = 1) {
    const valueToCount = group.detailToValueToCount[detail] ?? /* @__PURE__ */ new Map();
    valueToCount.set(value, (valueToCount.get(value) ?? 0) + amount);
    group.detailToValueToCount[detail] = valueToCount;
  }
  groups() {
    return [...this.idToGroup.values()];
  }
};

// src/Shared/Utils/HashUtil.ts
import { createHash } from "node:crypto";
var DEFAULT_HASH_CHARS = 12;
var HashUtil = class {
  static sha(text, length = DEFAULT_HASH_CHARS) {
    return createHash("sha256").update(text).digest("hex").slice(0, length);
  }
};

// src/Shared/Services/FailureChainService.ts
var MAX_CHAIN_ATTEMPTS = 10;
var MAX_CALLS_BETWEEN_ATTEMPTS = 10;
var STOPPING_RESULT_KINDS = /* @__PURE__ */ new Set(["interrupted", "user_rejected"]);
var FailureChainService = class _FailureChainService {
  constructor(idleMs) {
    this.idleMs = idleMs;
  }
  chainsOf(session, index) {
    const threadIdToCalls = /* @__PURE__ */ new Map();
    for (const call of session.tools) {
      CollectionUtil.pushTo(threadIdToCalls, call.thread.id, call);
    }
    const chainedCallIds = /* @__PURE__ */ new Set();
    const chains = [];
    for (const calls of threadIdToCalls.values()) {
      calls.forEach((call, callIndex) => {
        if (!_FailureChainService.isChainableFailure(call) || chainedCallIds.has(call.id)) {
          return;
        }
        const chain = this.chainFrom(call, calls.slice(callIndex + 1), index);
        for (const failure of chain.failures) {
          chainedCallIds.add(failure.id);
        }
        chains.push(chain);
      });
    }
    return chains;
  }
  static isChainableFailure(call) {
    const result = call.result;
    return result?.isError === true && !STOPPING_RESULT_KINDS.has(result.kind);
  }
  chainFrom(first, laterCalls, index) {
    const failures = [first];
    let recovery;
    let callsSinceAttempt = 0;
    const stepToIsLast = {
      stop: () => true,
      skip: () => {
        callsSinceAttempt += 1;
        return false;
      },
      failure: (candidate) => {
        callsSinceAttempt = 0;
        failures.push(candidate);
        return failures.length >= MAX_CHAIN_ATTEMPTS;
      },
      recovery: (candidate) => {
        recovery = candidate;
        return true;
      }
    };
    laterCalls.some((candidate) => {
      const lastAttempt = failures.at(-1) ?? first;
      const isTooFar = callsSinceAttempt >= MAX_CALLS_BETWEEN_ATTEMPTS || (candidate.calledAtMs ?? 0) - (lastAttempt.calledAtMs ?? 0) > this.idleMs;
      const step = isTooFar ? "stop" : this.stepOf(first, candidate);
      return stepToIsLast[step](candidate);
    });
    const window = this.chainWindow(first, failures, recovery, index);
    return {
      failures,
      recovery,
      kind: _FailureChainService.kindOf(first, recovery),
      cost: window.cost,
      messageIds: window.messages.map((message) => message.id)
    };
  }
  stepOf(first, candidate) {
    if (!_FailureChainService.doesSameJob(first, candidate)) {
      return _FailureChainService.hasMovedOn(first, candidate) ? "stop" : "skip";
    }
    const result = candidate.result;
    if (result === void 0) {
      return "skip";
    }
    if (STOPPING_RESULT_KINDS.has(result.kind)) {
      return "stop";
    }
    return result.isError ? "failure" : "recovery";
  }
  static doesSameJob(first, candidate) {
    if (candidate.category !== first.category) {
      return false;
    }
    if (first.category !== "shell") {
      return candidate.key === first.key && candidate.filePath === first.filePath;
    }
    if (candidate.key === first.key) {
      return true;
    }
    if (NormalizeUtil.isExplorationCommand(candidate.key)) {
      return false;
    }
    const failedStage = NormalizeUtil.commandStage(first.key);
    if (failedStage !== void 0) {
      return NormalizeUtil.commandStage(candidate.key) === failedStage;
    }
    return candidate.key.split(" ")[0] === first.key.split(" ")[0];
  }
  static hasMovedOn(first, candidate) {
    const isOtherWork = candidate.category === "shell" && !NormalizeUtil.isExplorationCommand(candidate.key);
    return candidate.category === first.category && (first.category !== "shell" || isOtherWork);
  }
  static kindOf(first, recovery) {
    if (recovery === void 0) {
      return "unrecovered";
    }
    if (first.category !== "shell") {
      return "retry";
    }
    return recovery.summary === first.summary ? "fix_loop" : "wrong_command";
  }
  chainWindow(first, failures, recovery, index) {
    const startAtMs = first.calledAtMs;
    const messages = index.threadIdToMessages.get(first.thread.id) ?? [];
    if (startAtMs === void 0) {
      return {
        cost: {
          activeMs: 0,
          usage: TokenUsageUtil.zero()
        },
        messages: []
      };
    }
    const lastFailure = failures.at(-1) ?? first;
    const endAtMs = recovery?.calledAtMs ?? _FailureChainService.reactionAtMs(lastFailure, messages);
    const windowMessages = messages.filter((message) => {
      const sentAtMs = message.sentAtMs ?? 0;
      return message.id !== first.messageId && sentAtMs > startAtMs && sentAtMs <= endAtMs;
    });
    const eventsAtMs = [startAtMs, ...windowMessages.map((message) => message.sentAtMs ?? startAtMs), endAtMs].sort((left, right) => left - right);
    return {
      cost: {
        activeMs: TimeUtil.activeTime(eventsAtMs, this.idleMs),
        usage: TokenUsageUtil.sum(windowMessages.map((message) => message.usage)),
        model: windowMessages[0]?.model
      },
      messages: windowMessages
    };
  }
  static reactionAtMs(call, messages) {
    const resultAtMs = call.result?.returnedAtMs ?? call.calledAtMs ?? 0;
    const reaction = messages.find((message) => (message.sentAtMs ?? 0) >= resultAtMs && message.id !== call.messageId);
    return reaction?.sentAtMs ?? resultAtMs;
  }
};

// src/Shared/Services/SignalDetectorService.ts
var ERROR_HASH_CHARS = 6;
var REQUEST_HASH_CHARS = 8;
var MAX_FAILURE_EXCERPT_CHARS = 240;
var ASKED_EXCERPT_CHARS = 90;
var REPLY_EXCERPT_CHARS = 110;
var TITLE_EXCERPT_CHARS = 80;
var EXAMPLE_EXCERPT_CHARS = 200;
var MIN_REQUEST_WORDS = 3;
var MAX_REQUEST_CHARS = 600;
var FILE_CHANGING_COMMAND = /\b(git (checkout|pull|merge|rebase|stash)|sed -i|prettier|eslint --fix|npm run format)/;
var COMPACTION_TRIGGER_TO_TITLE = {
  manual: "Context compacted by hand during long sessions",
  auto: "Sessions outgrow the context window and auto-compact"
};
var changesNothing = () => false;
var CATEGORY_TO_CHANGES_FILE = {
  edit: (call, read) => call.filePath === read.filePath,
  shell: (call) => FILE_CHANGING_COMMAND.test(call.summary),
  read: changesNothing,
  search: changesNothing,
  plan: changesNothing,
  delegation: changesNothing,
  skill: changesNothing,
  mcp: changesNothing,
  other: changesNothing
};
var SignalDetectorService = class _SignalDetectorService {
  constructor(options, attribution, collector) {
    this.options = options;
    this.attribution = attribution;
    this.collector = collector;
    this.failureChains = new FailureChainService(options.idleMs);
  }
  failureChains;
  countedMessageIds = /* @__PURE__ */ new Set();
  resultKindToRecorder = {
    user_rejected: (failure) => {
      this.addRejection(failure);
      return void 0;
    },
    permission_denied: (failure) => this.addPermissionDenied(failure),
    hook_blocked: (failure) => this.addHookBlocked(failure),
    error: (failure) => this.addCallFailure(failure),
    interrupted: (failure) => this.addCallFailure(failure),
    ok: (failure) => this.addCallFailure(failure)
  };
  chainKindToDetail = {
    fix_loop: (group) => {
      if (group.details.chains) {
        group.details.chains.fixLoops++;
      }
    },
    wrong_command: (group, chain) => {
      if (chain.recovery && chain.recovery.key !== chain.failures[0]?.key) {
        this.collector.count(group, "recoveredWith", chain.recovery.key);
      }
    },
    retry: () => void 0,
    unrecovered: () => void 0
  };
  detectInSession(session, index) {
    this.countedMessageIds = /* @__PURE__ */ new Set();
    this.detectToolFailures(session, index);
    this.detectRepeatedReads(session, index);
    this.detectSubagentRereads(session, index);
    this.detectCorrectionsAndInterruptions(session, index);
    this.detectApiErrors(session, index);
    this.detectCompactions(session, index);
  }
  detectRepeatedRequests(sessions) {
    const thresholds = this.options.thresholds;
    const clusters = [];
    for (const candidate of this.candidateRequests(sessions)) {
      const similarCluster = clusters.find((cluster) => {
        const seedWords = cluster[0]?.words;
        const similarity = seedWords === void 0 ? 0 : NormalizeUtil.jaccard(seedWords, candidate.words);
        return similarity >= thresholds.repeatedRequestSimilarity;
      });
      if (similarCluster) {
        similarCluster.push(candidate);
      } else {
        clusters.push([candidate]);
      }
    }
    for (const cluster of clusters) {
      const seed = cluster[0];
      const sessionIds = new Set(cluster.map((candidate) => candidate.session.sessionId));
      if (!seed || sessionIds.size < thresholds.minRepeatedRequestSessions) {
        continue;
      }
      const label = seed.prompt.text;
      const signalId = `repeated_request:${HashUtil.sha(label, REQUEST_HASH_CHARS)}`;
      const title = `Similar request in ${sessionIds.size} sessions: "${RedactUtil.excerpt(label, TITLE_EXCERPT_CHARS)}"`;
      const commands = CollectionUtil.unique(
        cluster.map((candidate) => candidate.prompt.command).filter((command) => command !== void 0)
      );
      for (const candidate of this.firstPerSession(cluster)) {
        const group = this.collector.add(signalId, "repeated_request", title, {
          session: candidate.session,
          ref: candidate.prompt.ref,
          pieces: [AttributionService.MAIN_PIECE],
          activeMs: 0,
          usage: TokenUsageUtil.zero()
        });
        group.details.example = RedactUtil.excerpt(label, EXAMPLE_EXCERPT_CHARS);
        group.details.commands = commands;
      }
    }
  }
  detectToolFailures(session, index) {
    const callIdToChain = /* @__PURE__ */ new Map();
    for (const chain of this.failureChains.chainsOf(session, index)) {
      for (const failure of chain.failures) {
        callIdToChain.set(failure.id, chain);
      }
      for (const messageId of chain.messageIds) {
        this.countedMessageIds.add(messageId);
      }
    }
    for (const call of session.tools) {
      const result = call.result;
      if (!result?.isError || result.kind === "interrupted") {
        continue;
      }
      const chain = callIdToChain.get(call.id);
      const occurrence = {
        session,
        ref: {
          ...call.ref,
          excerpt: `${call.summary} \u2192 ${result.ref.excerpt ?? ""}`.slice(0, MAX_FAILURE_EXCERPT_CHARS)
        },
        pieces: index.toolCallIdToPieces.get(call.id) ?? [AttributionService.MAIN_PIECE],
        ...this.failureCost(session, index, call, chain),
        isFixLoop: chain?.kind === "fix_loop"
      };
      const group = this.addFailure(call, occurrence);
      if (group && chain?.failures[0] === call) {
        this.addChainDetails(group, chain);
      }
    }
  }
  addFailure(call, occurrence) {
    const result = call.result;
    if (!result) {
      return void 0;
    }
    const failure = {
      call,
      result,
      occurrence,
      errorHead: result.errorHead ?? "error"
    };
    return this.resultKindToRecorder[result.kind](failure);
  }
  addRejection({ call, result, occurrence }) {
    const attributedTo = occurrence.pieces.join(",");
    const title = `User corrected the agent (${attributedTo})`;
    this.collector.add(`user_correction:${attributedTo}`, "user_correction", title, {
      ...occurrence,
      ref: {
        ...occurrence.ref,
        excerpt: `rejected ${call.summary} \u2192 ${result.ref.excerpt ?? ""}`.slice(0, MAX_FAILURE_EXCERPT_CHARS)
      }
    });
  }
  addPermissionDenied({ call, occurrence, errorHead }) {
    const group = this.collector.add(`permission_denied:${call.key}`, "permission_denied", `Permission denied for ${call.key}`, occurrence);
    this.collector.count(group, "errors", errorHead);
    return group;
  }
  addHookBlocked({ call, occurrence }) {
    return this.collector.add(`hook_blocked:${call.key}`, "hook_blocked", `Hook blocked ${call.key}`, occurrence);
  }
  addCallFailure({ call, occurrence, errorHead }) {
    if (call.category === "shell") {
      const group2 = this.collector.add(`failed_command:${call.key}`, "failed_command", `Command fails: ${call.key}`, occurrence);
      this.collector.count(group2, "errors", errorHead);
      return group2;
    }
    const signalId = `tool_error:${call.key}:${HashUtil.sha(errorHead, ERROR_HASH_CHARS)}`;
    const group = this.collector.add(signalId, "tool_error", `${call.key} error: ${errorHead}`, occurrence);
    group.details.tool = call.key;
    group.details.error = errorHead;
    return group;
  }
  failureCost(session, index, call, chain) {
    if (chain) {
      return _SignalDetectorService.shareOf(chain);
    }
    const rejectedAtMs = call.result?.returnedAtMs ?? call.calledAtMs;
    const turnStartAtMs = [
      ...session.prompts.map((prompt) => prompt.sentAtMs),
      ...session.tools.filter((other) => other.result?.kind === "user_rejected").map((other) => other.result?.returnedAtMs)
    ].filter((atMs) => atMs !== void 0 && rejectedAtMs !== void 0 && atMs < rejectedAtMs).reduce((latest, atMs) => Math.max(latest, atMs), Number.NEGATIVE_INFINITY);
    return this.turnCost(index, turnStartAtMs, rejectedAtMs);
  }
  static shareOf(chain) {
    const share = 1 / chain.failures.length;
    return {
      activeMs: chain.cost.activeMs * share,
      usage: TokenUsageUtil.scale(chain.cost.usage, share),
      model: chain.cost.model
    };
  }
  addChainDetails(group, chain) {
    const summary = group.details.chains ?? {
      chains: 0,
      recovered: 0,
      attempts: 0,
      fixLoops: 0
    };
    summary.chains++;
    summary.attempts += chain.failures.length;
    summary.recovered += chain.recovery ? 1 : 0;
    group.details.chains = summary;
    this.chainKindToDetail[chain.kind](group, chain);
  }
  detectCompactions(session, index) {
    for (const compaction of session.compactions) {
      const isSubagent = !SessionUtil.isMainThread(compaction.thread);
      const piece = isSubagent ? this.attribution.pieceIdFor("agent", compaction.thread.agentType) : AttributionService.MAIN_PIECE;
      const turnsBefore = session.reported.turns.filter(
        (turn) => (turn.endedAtMs ?? 0) <= (compaction.occurredAtMs ?? 0)
      ).length;
      const title = COMPACTION_TRIGGER_TO_TITLE[compaction.trigger];
      const group = this.collector.add(`context_compaction:${compaction.trigger}`, "context_compaction", title, {
        session,
        ref: {
          ...compaction.ref,
          excerpt: turnsBefore ? `${compaction.ref.excerpt ?? ""} after ${turnsBefore} turns` : compaction.ref.excerpt
        },
        pieces: [piece],
        ...this.compactionCost(session, index, compaction)
      });
      const contextTokens = compaction.contextTokens ?? 0;
      group.details.maxContextTokens = Math.max(group.details.maxContextTokens ?? 0, contextTokens) || void 0;
    }
  }
  compactionCost(session, index, compaction) {
    const compactedAtMs = compaction.occurredAtMs ?? 0;
    const nextCompactionAtMs = session.compactions.filter((other) => other.thread.id === compaction.thread.id && (other.occurredAtMs ?? 0) > compactedAtMs).reduce((earliest, other) => Math.min(earliest, other.occurredAtMs ?? Infinity), Infinity);
    const threadReads = session.tools.filter((call) => call.thread.id === compaction.thread.id && this.isSuccessfulRead(call));
    const filesReadBefore = new Set(threadReads.filter((call) => (call.calledAtMs ?? 0) < compactedAtMs).map((call) => call.filePath));
    const seenFiles = /* @__PURE__ */ new Set();
    const rereads = threadReads.filter((call) => {
      const calledAtMs = call.calledAtMs ?? 0;
      const isAfterCompaction = calledAtMs > compactedAtMs && calledAtMs < nextCompactionAtMs;
      const isReread = isAfterCompaction && filesReadBefore.has(call.filePath);
      const isFirstReread = isReread && !seenFiles.has(call.filePath);
      seenFiles.add(isReread ? call.filePath : void 0);
      return isFirstReread;
    });
    const rereadCosts = rereads.map((read) => this.readCost(read, index));
    return {
      activeMs: rereadCosts.reduce((total, cost) => total + cost.activeMs, 0),
      usage: TokenUsageUtil.sum(rereadCosts.map((cost) => cost.usage)),
      model: rereadCosts[0]?.model
    };
  }
  detectApiErrors(session, index) {
    for (const apiError of session.apiErrors) {
      const isSubagent = !SessionUtil.isMainThread(apiError.thread);
      const piece = isSubagent ? this.attribution.pieceIdFor("agent", apiError.thread.agentType) : AttributionService.MAIN_PIECE;
      const title = `Model API error: ${apiError.code}`;
      const group = this.collector.add(`api_error:${apiError.code}`, "api_error", title, {
        session,
        ref: apiError.ref,
        pieces: [piece],
        ...this.apiErrorCost(apiError, index)
      });
      if (apiError.model) {
        this.collector.count(group, "models", RedactUtil.redact(apiError.model));
      }
    }
  }
  detectRepeatedReads(session, index) {
    const threadFileToReads = /* @__PURE__ */ new Map();
    for (const call of session.tools.filter((toolCall) => this.isSuccessfulRead(toolCall))) {
      CollectionUtil.pushTo(threadFileToReads, `${call.thread.id}\0${call.filePath ?? ""}`, call);
    }
    for (const reads of threadFileToReads.values()) {
      for (const read of this.extraReadsOf(session, reads)) {
        const agentType = read.thread.agentType;
        const filePath = read.filePath ?? "";
        const title = `${agentType} re-reads files it already read`;
        const group = this.collector.add(`repeated_read:${agentType}`, "repeated_read", title, {
          session,
          ref: read.ref,
          pieces: index.toolCallIdToPieces.get(read.id) ?? [AttributionService.MAIN_PIECE],
          ...this.readCost(read, index)
        });
        this.collector.count(group, "files", filePath);
      }
    }
  }
  extraReadsOf(session, reads) {
    const thresholds = this.options.thresholds;
    const [firstRead] = reads;
    if (!firstRead || reads.length < thresholds.minReadsPerFile) {
      return [];
    }
    const extraReads = reads.slice(1).filter((read) => !this.wasChangedBetween(session, firstRead, read));
    return extraReads.length < thresholds.minExtraReads ? [] : extraReads;
  }
  detectSubagentRereads(session, index) {
    const reads = session.tools.filter((call) => this.isSuccessfulRead(call));
    const mainThreadReads = reads.filter((call) => SessionUtil.isMainThread(call.thread));
    const subagentReads = reads.filter((call) => !SessionUtil.isMainThread(call.thread));
    for (const read of subagentReads) {
      const wasReadByMainBefore = mainThreadReads.some(
        (mainRead) => mainRead.filePath === read.filePath && (mainRead.calledAtMs ?? 0) <= (read.calledAtMs ?? 0)
      );
      if (!wasReadByMainBefore) {
        continue;
      }
      const agentType = read.thread.agentType;
      const title = `Subagent ${agentType} re-reads files the main thread already read`;
      const group = this.collector.add(`subagent_reread:${agentType}`, "subagent_reread", title, {
        session,
        ref: read.ref,
        pieces: [this.attribution.pieceIdFor("agent", agentType)],
        ...this.readCost(read, index)
      });
      this.collector.count(group, "files", read.filePath ?? "");
    }
  }
  detectCorrectionsAndInterruptions(session, index) {
    session.prompts.forEach((prompt, promptIndex) => {
      if (!prompt.isCorrection && !prompt.isInterruption) {
        return;
      }
      const previousPrompt = session.prompts[promptIndex - 1];
      const pieces = index.promptToPreviousTurnPieces.get(prompt) ?? [AttributionService.MAIN_PIECE];
      const attributedTo = pieces.join(",");
      const type = prompt.isInterruption ? "interruption" : "user_correction";
      const title = prompt.isInterruption ? `User interrupted the agent (${attributedTo})` : `User corrected the agent (${attributedTo})`;
      const askedExcerpt = previousPrompt ? RedactUtil.excerpt(previousPrompt.text, ASKED_EXCERPT_CHARS) : void 0;
      const conversationExcerpt = askedExcerpt === void 0 ? prompt.ref.excerpt : `asked: "${askedExcerpt}" \u2192 then: "${RedactUtil.excerpt(prompt.text, REPLY_EXCERPT_CHARS)}"`;
      this.collector.add(`${type}:${attributedTo}`, type, title, {
        session,
        ref: {
          ...prompt.ref,
          excerpt: conversationExcerpt
        },
        pieces,
        ...this.turnCost(index, previousPrompt?.sentAtMs, prompt.sentAtMs)
      });
    });
  }
  candidateRequests(sessions) {
    return sessions.flatMap(
      (session) => session.prompts.filter((prompt) => !prompt.isInterruption && !prompt.isCorrection && prompt.text.length <= MAX_REQUEST_CHARS).map((prompt) => ({
        session,
        prompt,
        words: NormalizeUtil.wordSet(prompt.text)
      })).filter((candidate) => candidate.words.size >= MIN_REQUEST_WORDS)
    );
  }
  firstPerSession(cluster) {
    const seenSessionIds = /* @__PURE__ */ new Set();
    return cluster.filter((candidate) => {
      const isFirst = !seenSessionIds.has(candidate.session.sessionId);
      seenSessionIds.add(candidate.session.sessionId);
      return isFirst;
    });
  }
  isSuccessfulRead(call) {
    return call.category === "read" && call.filePath !== void 0 && call.result?.isError !== true;
  }
  apiErrorCost(apiError, index) {
    const failedAtMs = apiError.occurredAtMs ?? 0;
    const answer = (index.threadIdToMessages.get(apiError.thread.id) ?? []).find(
      (message) => message.model !== void 0 && (message.sentAtMs ?? 0) > failedAtMs
    );
    const elapsedMs = answer?.sentAtMs === void 0 ? 0 : answer.sentAtMs - failedAtMs;
    return {
      activeMs: Math.min(this.options.idleMs, Math.max(0, elapsedMs)),
      usage: TokenUsageUtil.zero(),
      model: answer?.model
    };
  }
  readCost(read, index) {
    const durationMs = (read.result?.returnedAtMs ?? 0) - (read.calledAtMs ?? 0);
    return {
      activeMs: Math.min(this.options.idleMs, Math.max(0, durationMs)),
      usage: {
        ...TokenUsageUtil.zero(),
        input: NumberUtil.charsToTokens(read.result?.contentChars ?? 0)
      },
      model: index.threadIdToMessages.get(read.thread.id)?.[0]?.model
    };
  }
  turnCost(index, turnStartAtMs, turnEndAtMs) {
    const isOpenTurn = turnStartAtMs === void 0 || !Number.isFinite(turnStartAtMs);
    if (isOpenTurn || turnEndAtMs === void 0) {
      return {
        activeMs: 0,
        usage: TokenUsageUtil.zero()
      };
    }
    const turnMessages = [...index.threadIdToMessages.values()].flat().filter((message) => {
      const sentAtMs = message.sentAtMs ?? 0;
      return !this.countedMessageIds.has(message.id) && sentAtMs > turnStartAtMs && sentAtMs <= turnEndAtMs;
    });
    for (const message of turnMessages) {
      this.countedMessageIds.add(message.id);
    }
    const eventsAtMs = [turnStartAtMs, ...turnMessages.map((message) => message.sentAtMs ?? turnStartAtMs)].sort((left, right) => left - right);
    return {
      activeMs: TimeUtil.activeTime(eventsAtMs, this.options.idleMs),
      usage: TokenUsageUtil.sum(turnMessages.map((message) => message.usage)),
      model: turnMessages[0]?.model
    };
  }
  wasChangedBetween(session, firstRead, laterRead) {
    const fromAtMs = firstRead.calledAtMs ?? 0;
    const toAtMs = laterRead.calledAtMs ?? 0;
    return session.tools.some((call) => {
      const calledAtMs = call.calledAtMs ?? 0;
      const isSameThread = call.thread.id === firstRead.thread.id;
      const isBetween = calledAtMs >= fromAtMs && calledAtMs <= toAtMs;
      return isSameThread && isBetween && CATEGORY_TO_CHANGES_FILE[call.category](call, firstRead);
    }) || session.compactions.some((compaction) => {
      const compactedAtMs = compaction.occurredAtMs ?? 0;
      return compaction.thread.id === firstRead.thread.id && compactedAtMs >= fromAtMs && compactedAtMs <= toAtMs;
    });
  }
};

// src/Shared/Services/WorkflowDetectorService.ts
var MAX_WORKFLOW_STEPS = 5;
var WORKFLOW_HASH_CHARS = 8;
var MAX_WORKFLOW_SIGNALS = 10;
var STEP_SEPARATOR = " \u2192 ";
var SUBSUMED_SESSION_RATIO = 0.75;
var MAX_WORKFLOW_SPAN_MINUTES = 15;
var WorkflowDetectorService = class {
  constructor(options, collector) {
    this.options = options;
    this.collector = collector;
  }
  detect(sessions, sessionIdToIndex) {
    const thresholds = this.options.thresholds;
    const candidates = this.candidatesOf(sessions).filter((candidate) => {
      const isAcrossSessions = candidate.sessionIdToRuns.size >= thresholds.minWorkflowSessions;
      return isAcrossSessions || this.runCountOf(candidate) >= thresholds.minWorkflowRuns;
    });
    const sessionIdToSession = new Map(sessions.map((session) => [session.sessionId, session]));
    for (const workflow of this.withoutSubsumed(candidates).slice(0, MAX_WORKFLOW_SIGNALS)) {
      const gram = workflow.steps.join(STEP_SEPARATOR);
      const runCount = this.runCountOf(workflow);
      const sessionCount = workflow.sessionIdToRuns.size;
      const title = `Same steps ${runCount} times in ${sessionCount} session${sessionCount === 1 ? "" : "s"}: ${gram}`;
      const signalId = `repeated_workflow:${HashUtil.sha(gram, WORKFLOW_HASH_CHARS)}`;
      const runs = [...workflow.sessionIdToRuns.entries()].flatMap(([sessionId, sessionRuns]) => sessionRuns.map((calls) => ({
        sessionId,
        calls
      })));
      for (const { sessionId, calls } of runs) {
        const session = sessionIdToSession.get(sessionId);
        const index = sessionIdToIndex.get(sessionId);
        const [firstCall] = calls;
        if (!session || !index || !firstCall) {
          continue;
        }
        const occurrence = {
          session,
          ref: {
            ...firstCall.ref,
            excerpt: calls.map((call) => call.summary).join(" ; ")
          },
          pieces: CollectionUtil.unique(
            calls.flatMap((call) => index.toolCallIdToPieces.get(call.id) ?? [AttributionService.MAIN_PIECE])
          ),
          ...this.workflowCost(calls, index)
        };
        const group = this.collector.add(signalId, "repeated_workflow", title, occurrence);
        group.details.steps = workflow.steps;
      }
    }
  }
  candidatesOf(sessions) {
    const gramToCandidate = /* @__PURE__ */ new Map();
    for (const session of sessions) {
      for (const window of this.workCommandsByThread(session).flatMap((calls) => this.windowsOf(calls))) {
        this.addWindow(gramToCandidate, session.sessionId, window);
      }
    }
    return [...gramToCandidate.values()];
  }
  windowsOf(calls) {
    const windows = [];
    for (let length = this.options.thresholds.minWorkflowSteps; length <= MAX_WORKFLOW_STEPS; length++) {
      for (let start = 0; start + length <= calls.length; start++) {
        windows.push(calls.slice(start, start + length));
      }
    }
    return windows;
  }
  addWindow(gramToCandidate, sessionId, window) {
    const steps = window.map((call) => call.key);
    const isTooSpread = this.spanOf(window) > MAX_WORKFLOW_SPAN_MINUTES * TimeUtil.MS_PER_MINUTE;
    if (new Set(steps).size < window.length || isTooSpread) {
      return;
    }
    const gram = steps.join(STEP_SEPARATOR);
    const candidate = gramToCandidate.get(gram) ?? { steps, sessionIdToRuns: /* @__PURE__ */ new Map() };
    const sessionRuns = candidate.sessionIdToRuns.get(sessionId) ?? [];
    const previousRunEnd = sessionRuns.at(-1)?.at(-1)?.calledAtMs ?? Number.NEGATIVE_INFINITY;
    if ((window[0]?.calledAtMs ?? 0) > previousRunEnd) {
      sessionRuns.push(window);
    }
    candidate.sessionIdToRuns.set(sessionId, sessionRuns);
    gramToCandidate.set(gram, candidate);
  }
  workCommandsByThread(session) {
    const threadIdToCalls = /* @__PURE__ */ new Map();
    const workCalls = session.tools.filter(
      (call) => call.category === "shell" && !NormalizeUtil.isExplorationCommand(call.key)
    );
    for (const call of workCalls) {
      const threadCalls = threadIdToCalls.get(call.thread.id) ?? [];
      if (threadCalls.at(-1)?.key !== call.key) {
        threadCalls.push(call);
      }
      threadIdToCalls.set(call.thread.id, threadCalls);
    }
    return [...threadIdToCalls.values()];
  }
  withoutSubsumed(candidates) {
    const longestFirst = candidates.toSorted((left, right) => {
      const lengthDifference = right.steps.length - left.steps.length;
      return lengthDifference || this.runCountOf(right) - this.runCountOf(left);
    });
    const kept = [];
    for (const candidate of longestFirst) {
      const gram = candidate.steps.join(STEP_SEPARATOR);
      const isCovered = kept.some((keptWorkflow) => {
        const hasCandidateInside = keptWorkflow.steps.join(STEP_SEPARATOR).includes(gram);
        const minimumRuns = this.runCountOf(candidate) * SUBSUMED_SESSION_RATIO;
        return hasCandidateInside && this.runCountOf(keptWorkflow) >= minimumRuns;
      });
      if (!isCovered) {
        kept.push(candidate);
      }
    }
    return kept.sort((left, right) => {
      const sessionDifference = right.sessionIdToRuns.size - left.sessionIdToRuns.size;
      return sessionDifference || this.runCountOf(right) - this.runCountOf(left);
    });
  }
  runCountOf(candidate) {
    return [...candidate.sessionIdToRuns.values()].reduce((total, sessionRuns) => total + sessionRuns.length, 0);
  }
  spanOf(calls) {
    const lastCall = calls.at(-1);
    const endedAtMs = lastCall?.result?.returnedAtMs ?? lastCall?.calledAtMs ?? 0;
    return endedAtMs - (calls[0]?.calledAtMs ?? endedAtMs);
  }
  workflowCost(calls, index) {
    const first = calls[0];
    const last = calls.at(-1);
    const startAtMs = first?.calledAtMs;
    const endAtMs = last?.result?.returnedAtMs ?? last?.calledAtMs;
    if (!first || startAtMs === void 0 || endAtMs === void 0) {
      return {
        activeMs: 0,
        usage: TokenUsageUtil.zero()
      };
    }
    const windowMessages = (index.threadIdToMessages.get(first.thread.id) ?? []).filter((message) => {
      const sentAtMs = message.sentAtMs ?? 0;
      return message.id !== first.messageId && sentAtMs >= startAtMs && sentAtMs <= endAtMs;
    });
    const eventsAtMs = [startAtMs, ...windowMessages.map((message) => message.sentAtMs ?? startAtMs), endAtMs].sort((left, right) => left - right);
    const executionMs = calls.reduce((total, call) => total + this.executionMsOf(call), 0);
    return {
      activeMs: Math.max(0, TimeUtil.activeTime(eventsAtMs, this.options.idleMs) - executionMs),
      usage: TokenUsageUtil.sum(windowMessages.map((message) => message.usage)),
      model: windowMessages[0]?.model
    };
  }
  executionMsOf(call) {
    const durationMs = (call.result?.returnedAtMs ?? call.calledAtMs ?? 0) - (call.calledAtMs ?? 0);
    return Math.min(this.options.idleMs, Math.max(0, durationMs));
  }
};

// src/Shared/Services/ContextLoadDetectorService.ts
var keyOf = (call) => call.key;
var CATEGORY_TO_SOURCE = {
  read: (call) => call.filePath ?? call.key,
  // Why: a command that only looks around is the material itself (`cat a.ts` and `cat b.ts` differ); any other is its
  // key (every `git diff` prints a diff).
  shell: (call) => NormalizeUtil.isExplorationCommand(call.key) ? call.summary : call.key,
  edit: keyOf,
  search: keyOf,
  plan: keyOf,
  delegation: keyOf,
  skill: keyOf,
  mcp: keyOf,
  other: keyOf
};
var TOKENS_PER_THOUSAND = 1e3;
var LOADING_CATEGORIES = /* @__PURE__ */ new Set(["read", "shell", "search", "mcp", "skill", "other"]);
var ContextLoadDetectorService = class _ContextLoadDetectorService {
  constructor(options, collector) {
    this.options = options;
    this.collector = collector;
  }
  detect(sessions, sessionIdToIndex) {
    for (const loads of this.heavySources(sessions, sessionIdToIndex)) {
      for (const { session, call, tokens } of loads.calls) {
        const title = `${loads.piece} keeps filling its context with the same material`;
        const group = this.collector.add(`context_heavy:${loads.piece}`, "context_heavy", title, {
          session,
          ref: {
            ...call.ref,
            excerpt: `${call.summary} \u2192 ~${this.inThousands(tokens)}k tokens`
          },
          pieces: [loads.piece],
          activeMs: 0,
          usage: {
            ...TokenUsageUtil.zero(),
            input: tokens,
            cacheRead: tokens * _ContextLoadDetectorService.laterMessagesOf(session, sessionIdToIndex, call)
          },
          model: void 0
        });
        this.collector.count(group, "sources", `${loads.source} (\xD7${loads.calls.length})`, tokens);
      }
    }
  }
  static laterMessagesOf(session, sessionIdToIndex, call) {
    const loadedAtMs = call.result?.returnedAtMs ?? call.calledAtMs ?? 0;
    const droppedAtMs = session.compactions.filter((compaction) => compaction.thread.id === call.thread.id && (compaction.occurredAtMs ?? 0) > loadedAtMs).reduce((earliest, compaction) => Math.min(earliest, compaction.occurredAtMs ?? Infinity), Infinity);
    const threadMessages = sessionIdToIndex.get(session.sessionId)?.threadIdToMessages.get(call.thread.id) ?? [];
    return threadMessages.filter((message) => {
      const sentAtMs = message.sentAtMs ?? 0;
      return sentAtMs > loadedAtMs && sentAtMs < droppedAtMs;
    }).length;
  }
  heavySources(sessions, sessionIdToIndex) {
    const thresholds = this.options.thresholds;
    const keyToLoads = /* @__PURE__ */ new Map();
    for (const session of sessions) {
      const index = sessionIdToIndex.get(session.sessionId);
      for (const call of session.tools.filter((toolCall) => LOADING_CATEGORIES.has(toolCall.category))) {
        const tokens = NumberUtil.charsToTokens(call.result?.contentChars ?? 0);
        if (!tokens || call.result?.isError) {
          continue;
        }
        const piece = index?.toolCallIdToPieces.get(call.id)?.[0] ?? AttributionService.MAIN_PIECE;
        const source = this.sourceOf(call);
        const pieceSourceKey = `${piece}\0${source}`;
        const loads = keyToLoads.get(pieceSourceKey) ?? {
          pieceSourceKey,
          piece,
          source,
          calls: []
        };
        loads.calls.push({
          session,
          call,
          tokens
        });
        keyToLoads.set(pieceSourceKey, loads);
      }
    }
    return [...keyToLoads.values()].filter((loads) => {
      const totalTokens = loads.calls.reduce((total, load) => total + load.tokens, 0);
      const isRepeated = loads.calls.length >= thresholds.minHeavySourceLoads;
      const hasHugeResult = loads.calls.some((load) => load.tokens >= thresholds.minHugeResultTokens);
      return totalTokens >= thresholds.minHeavySourceTokens && (isRepeated || hasHugeResult);
    });
  }
  sourceOf(call) {
    return CATEGORY_TO_SOURCE[call.category](call);
  }
  inThousands(tokens) {
    return NumberUtil.round(tokens / TOKENS_PER_THOUSAND, 1);
  }
};

// src/Shared/Services/SignalService.ts
var MAX_COUNTED_VALUES = 5;
var OCCURRENCE_USD_DIGITS = 6;
var MIN_SESSIONS_FOR_FULL_EVIDENCE = 2;
var SELF_SKILL_NAME = /(^|:)improve-my-harness$/;
var USAGE_KINDS = /* @__PURE__ */ new Set(["skill", "agent", "command", "mcp"]);
var SIZE_KINDS = /* @__PURE__ */ new Set(["instructions", "skill", "agent"]);
var SCORE_WEIGHTS = {
  perActiveMinute: 1,
  perUsd: 2,
  perSession: 2,
  perOccurrence: 0.3,
  maxCountedOccurrences: 30,
  partialPenalty: 2
};
var FAILURE_CHAIN_METHOD = {
  bound: "estimate",
  method: "Each chain of failed attempts, from the first failure until a call doing the same job worked: every message in between, idle gaps left out, shared by the chain's failures. `fixLoop` is the part spent rerunning the same command after fixes."
};
var REREAD_METHOD = {
  bound: "lower",
  method: "The re-read's duration and its content as input, once; the content also stays in context afterwards."
};
var NO_COST_METHOD = {
  bound: "estimate",
  method: "No cost: there is no clear counterfactual to price."
};
var SIGNAL_TYPE_TO_COST_METHOD = {
  failed_command: FAILURE_CHAIN_METHOD,
  tool_error: FAILURE_CHAIN_METHOD,
  permission_denied: FAILURE_CHAIN_METHOD,
  hook_blocked: FAILURE_CHAIN_METHOD,
  api_error: {
    bound: "estimate",
    method: "The wait from the failed request until the thread got a real answer (retries and fallbacks)."
  },
  context_compaction: {
    bound: "lower",
    method: "Re-reads after the compaction of files the thread had read before it."
  },
  repeated_workflow: {
    bound: "estimate",
    method: "Each run's window, from the first step to the last: every message around the steps, minus the steps' own runs and the one call a script would still need."
  },
  context_heavy: {
    bound: "estimate",
    method: "Each load's tokens, plus their carry: re-sent as cached input on every later message of the thread until a compaction."
  },
  repeated_read: REREAD_METHOD,
  subagent_reread: REREAD_METHOD,
  repeated_request: NO_COST_METHOD,
  user_correction: {
    bound: "upper",
    method: "The whole turn before the correction (all threads), or the turn that built a rejected plan, minus failure chains already counted."
  },
  interruption: {
    bound: "upper",
    method: "The whole turn before the interruption (all threads), minus failure chains already counted."
  },
  unused_piece: NO_COST_METHOD,
  large_piece: {
    bound: "estimate",
    method: "The piece's size, as cached input, times the messages that carried it: every message for instructions, the agent's messages for an agent, the messages after its first use in a thread for a skill."
  }
};
var SignalService = class _SignalService {
  constructor(options) {
    this.options = options;
    this.costService = new CostService(options.modelFamilyToPrice);
  }
  static SIGNAL_TYPE_TO_THRESHOLD = {
    failed_command: { minOccurrences: "minFailures", minSessions: "minFailureSessions" },
    tool_error: { minOccurrences: "minFailures", minSessions: "minFailureSessions" },
    permission_denied: { minOccurrences: "minRepeatedEvents" },
    hook_blocked: { minOccurrences: "minRepeatedEvents" },
    api_error: { minOccurrences: "minRepeatedEvents" },
    context_compaction: { minOccurrences: "minRepeatedEvents" },
    context_heavy: "always",
    repeated_workflow: { minOccurrences: "minWorkflowRuns", minSessions: "minWorkflowSessions" },
    user_correction: { minOccurrences: "minRepeatedEvents" },
    interruption: { minOccurrences: "minRepeatedEvents" },
    repeated_read: { minOccurrences: "minExtraReads" },
    subagent_reread: { minOccurrences: "minSubagentRereads" },
    repeated_request: { minSessions: "minRepeatedRequestSessions" },
    unused_piece: "always",
    large_piece: "always"
  };
  static afterFirstUse = (piece, session) => _SignalService.messagesAfterFirstUse(piece, session);
  // Why: what a piece adds to the context stays there: instructions in every message, an agent's prompt in its
  // thread, a skill or command from its first use on.
  static PIECE_KIND_TO_CARRIERS = {
    instructions: (_piece, session) => session.messages,
    agent: (piece, session) => session.messages.filter((message) => message.thread.agentType === piece.name),
    skill: _SignalService.afterFirstUse,
    command: _SignalService.afterFirstUse,
    hook: _SignalService.afterFirstUse,
    mcp: _SignalService.afterFirstUse,
    plugin: _SignalService.afterFirstUse,
    settings: _SignalService.afterFirstUse
  };
  costService;
  extract(sessions, inventory) {
    const pieceIds = new Set(inventory?.pieces.map((piece) => piece.id) ?? []);
    const attribution = new AttributionService(pieceIds);
    const collector = new OccurrenceCollectorService();
    const detector = new SignalDetectorService(this.options, attribution, collector);
    const sessionIdToIndex = /* @__PURE__ */ new Map();
    for (const session of sessions) {
      const index = attribution.buildSessionIndex(session);
      sessionIdToIndex.set(session.sessionId, index);
      detector.detectInSession(session, index);
    }
    detector.detectRepeatedRequests(sessions);
    new WorkflowDetectorService(this.options, collector).detect(sessions, sessionIdToIndex);
    new ContextLoadDetectorService(this.options, collector).detect(sessions, sessionIdToIndex);
    const signals = collector.groups().filter((group) => this.isStrongEnough(group)).map((group) => this.buildSignal(group));
    if (inventory) {
      signals.push(...this.unusedPieceSignals(sessions, inventory), ...this.largePieceSignals(sessions, inventory));
      this.markPiecesChangedAfterEvidence(signals, inventory);
    }
    for (const signal of signals) {
      signal.score = this.scoreOf(signal);
    }
    return signals.sort((left, right) => right.score - left.score);
  }
  isStrongEnough(group) {
    const sessionCount = new Set(group.occurrences.map((occurrence) => occurrence.session.sessionId)).size;
    const threshold = _SignalService.SIGNAL_TYPE_TO_THRESHOLD[group.type];
    if (threshold === "always") {
      return true;
    }
    const thresholds = this.options.thresholds;
    const hasEnoughOccurrences = threshold.minOccurrences !== void 0 && group.occurrences.length >= thresholds[threshold.minOccurrences];
    const hasEnoughSessions = threshold.minSessions !== void 0 && sessionCount >= thresholds[threshold.minSessions];
    return hasEnoughOccurrences || hasEnoughSessions;
  }
  buildSignal(group) {
    const occurrences = group.occurrences.toSorted(
      (left, right) => (left.ref.occurredAt ?? "").localeCompare(right.ref.occurredAt ?? "")
    );
    const sessionCount = new Set(occurrences.map((occurrence) => occurrence.session.sessionId)).size;
    const pieces = CollectionUtil.unique(occurrences.flatMap((occurrence) => occurrence.pieces));
    const partialReasons = [];
    if (pieces.includes(AttributionService.UNRESOLVED_SUBAGENT_PIECE)) {
      partialReasons.push("subagent type could not be resolved for some steps");
    }
    const isSingleSession = sessionCount < MIN_SESSIONS_FOR_FULL_EVIDENCE && group.type !== "repeated_read";
    if (isSingleSession) {
      partialReasons.push("seen in a single session");
    }
    return {
      pieces,
      partialReasons,
      id: group.id,
      type: group.type,
      title: group.title,
      occurrences: occurrences.length,
      sessions: sessionCount,
      isPartial: partialReasons.length > 0,
      cost: this.costOf(group.type, occurrences),
      details: {
        ...group.details,
        ...this.topCountedValues(group)
      },
      evidence: this.spreadEvidence(occurrences),
      evidenceTotal: occurrences.length,
      firstSeenAt: occurrences[0]?.ref.occurredAt,
      lastSeenAt: occurrences.at(-1)?.ref.occurredAt,
      score: 0
    };
  }
  costOf(type, occurrences) {
    const fixLoopOccurrences = occurrences.filter((occurrence) => occurrence.isFixLoop === true);
    return {
      ...this.figuresOf(occurrences),
      ...SIGNAL_TYPE_TO_COST_METHOD[type],
      ...fixLoopOccurrences.length ? { fixLoop: this.figuresOf(fixLoopOccurrences) } : {},
      isEstimated: true
    };
  }
  figuresOf(occurrences) {
    const usage = TokenUsageUtil.sum(occurrences.map((occurrence) => occurrence.usage));
    const usd = occurrences.reduce(
      (total, occurrence) => total + this.costService.costUsd(occurrence.usage, occurrence.model),
      0
    );
    const activeMs = occurrences.reduce((total, occurrence) => total + occurrence.activeMs, 0);
    return {
      activeMinutes: TimeUtil.msToMinutes(activeMs),
      tokens: TokenUsageUtil.total(usage),
      inputTokens: TokenUsageUtil.inputWithCache(usage),
      outputTokens: usage.output,
      usd: NumberUtil.round(usd)
    };
  }
  topCountedValues(group) {
    const countedDetails = {};
    const detailEntries = Object.entries(group.detailToValueToCount);
    for (const [detail, valueToCount] of detailEntries) {
      const countedValues = [...valueToCount.entries()].sort((left, right) => right[1] - left[1]).slice(0, MAX_COUNTED_VALUES).map(([value, count]) => ({
        value,
        count
      }));
      countedDetails[detail] = countedValues;
    }
    return countedDetails;
  }
  scoreOf(signal) {
    const countedOccurrences = Math.min(signal.occurrences, SCORE_WEIGHTS.maxCountedOccurrences);
    const score = signal.cost.activeMinutes * SCORE_WEIGHTS.perActiveMinute + signal.cost.usd * SCORE_WEIGHTS.perUsd + signal.sessions * SCORE_WEIGHTS.perSession + countedOccurrences * SCORE_WEIGHTS.perOccurrence - (signal.isPartial ? SCORE_WEIGHTS.partialPenalty : 0);
    return NumberUtil.round(score);
  }
  unusedPieceSignals(sessions, inventory) {
    if (sessions.length < this.options.minSessionsForUnused) {
      return [];
    }
    const usedPieceIds = this.usedPieceIdsIn(sessions);
    const periodStartAtMs = Math.min(...sessions.map((session) => session.startedAtMs ?? Date.now()));
    const unusedPieces = inventory.pieces.filter((piece) => {
      const isTrackedKind = USAGE_KINDS.has(piece.kind);
      const isThisTool = piece.kind === "skill" && SELF_SKILL_NAME.test(piece.name);
      return isTrackedKind && !isThisTool && !usedPieceIds.has(piece.id);
    });
    return unusedPieces.map((piece) => {
      const wasChangedDuringPeriod = piece.modifiedAt !== void 0 && Date.parse(piece.modifiedAt) > periodStartAtMs;
      const partialReasons = [
        ...wasChangedDuringPeriod ? ["piece was added or changed during the analyzed period"] : [],
        ...piece.isEditable ? [] : ["piece comes from a plugin"]
      ];
      return this.pieceSignal(piece, {
        partialReasons,
        type: "unused_piece",
        title: `Not used in ${sessions.length} sessions: ${piece.id}`,
        sessions: sessions.length,
        details: {
          scope: piece.scope,
          path: piece.path,
          approxTokens: piece.approxTokens,
          description: piece.description
        }
      });
    });
  }
  usedPieceIdsIn(sessions) {
    const usedPieceIds = /* @__PURE__ */ new Set();
    for (const session of sessions) {
      for (const pieceId of session.tools.flatMap((call) => this.piecesCalledBy(call))) {
        usedPieceIds.add(pieceId);
      }
      for (const threadFacts of session.threads.filter((thread) => !SessionUtil.isMainThread(thread.thread))) {
        usedPieceIds.add(`agent:${threadFacts.thread.agentType}`);
      }
      for (const command of session.prompts.map((prompt) => prompt.command).filter((name) => name !== void 0)) {
        usedPieceIds.add(`skill:${command}`);
        usedPieceIds.add(`command:${command}`);
      }
    }
    return usedPieceIds;
  }
  piecesCalledBy(call) {
    return [
      ...call.subagentType ? [`agent:${call.subagentType}`] : [],
      ...call.skill ? [`skill:${call.skill}`] : [],
      ...SessionUtil.MCP_CATEGORIES.has(call.category) ? [call.key] : []
    ];
  }
  largePieceSignals(sessions, inventory) {
    return inventory.pieces.filter((piece) => piece.isEditable && SIZE_KINDS.has(piece.kind)).filter((piece) => piece.approxTokens >= this.options.largePieceTokens).map((piece) => {
      const carriers = sessions.flatMap((session) => this.messagesCarrying(piece, session));
      return this.pieceSignal(piece, {
        type: "large_piece",
        title: `${piece.id} is large (~${piece.approxTokens} tokens)`,
        sessions: new Set(carriers.map((message) => message.ref.sessionId)).size,
        partialReasons: [],
        details: {
          path: piece.path,
          approxTokens: piece.approxTokens,
          isLoadedEveryTurn: piece.kind === "instructions"
        },
        usage: {
          ...TokenUsageUtil.zero(),
          cacheRead: piece.approxTokens * carriers.length
        }
      });
    });
  }
  messagesCarrying(piece, session) {
    return _SignalService.PIECE_KIND_TO_CARRIERS[piece.kind](piece, session);
  }
  static messagesAfterFirstUse(piece, session) {
    const threadIdToFirstUseAtMs = /* @__PURE__ */ new Map();
    for (const call of session.tools.filter((toolCall) => toolCall.skill === piece.name)) {
      const earlierUseAtMs = threadIdToFirstUseAtMs.get(call.thread.id) ?? Infinity;
      threadIdToFirstUseAtMs.set(call.thread.id, Math.min(earlierUseAtMs, call.calledAtMs ?? Infinity));
    }
    const commandAtMs = session.prompts.find((prompt) => prompt.command === piece.name)?.sentAtMs;
    if (commandAtMs !== void 0) {
      const mainFirstUseAtMs = threadIdToFirstUseAtMs.get(SessionUtil.MAIN_THREAD_ID) ?? Infinity;
      threadIdToFirstUseAtMs.set(SessionUtil.MAIN_THREAD_ID, Math.min(mainFirstUseAtMs, commandAtMs));
    }
    return session.messages.filter((message) => (message.sentAtMs ?? 0) >= (threadIdToFirstUseAtMs.get(message.thread.id) ?? Infinity));
  }
  pieceSignal(piece, { usage, ...fields }) {
    const loadedUsage = usage ?? TokenUsageUtil.zero();
    return {
      ...fields,
      id: `${fields.type}:${piece.id}`,
      pieces: [piece.id],
      occurrences: 0,
      isPartial: fields.partialReasons.length > 0,
      cost: {
        ...this.figuresOf([{ activeMs: 0, usage: loadedUsage }]),
        ...SIGNAL_TYPE_TO_COST_METHOD[fields.type],
        isEstimated: true
      },
      evidence: [],
      evidenceTotal: 0,
      score: 0
    };
  }
  markPiecesChangedAfterEvidence(signals, inventory) {
    const pieceIdToPiece = new Map(inventory.pieces.map((piece) => [piece.id, piece]));
    for (const signal of signals) {
      const lastSeenAtMs = signal.lastSeenAt === void 0 ? void 0 : Date.parse(signal.lastSeenAt);
      if (lastSeenAtMs === void 0) {
        continue;
      }
      const changedPieces = signal.pieces.flatMap((pieceId) => {
        const modifiedAt = pieceIdToPiece.get(pieceId)?.modifiedAt;
        const wasChangedAfter = modifiedAt !== void 0 && Date.parse(modifiedAt) > lastSeenAtMs;
        return wasChangedAfter ? [{
          piece: pieceId,
          modifiedAt
        }] : [];
      });
      if (changedPieces.length) {
        signal.changedAfterEvidence = changedPieces;
        signal.isPartial = true;
        signal.partialReasons.push("piece changed after this evidence");
      }
    }
  }
  spreadEvidence(sortedOccurrences) {
    const maxEvidence = this.options.maxEvidence;
    const sessionIdToOccurrences = /* @__PURE__ */ new Map();
    for (const occurrence of sortedOccurrences) {
      CollectionUtil.pushTo(sessionIdToOccurrences, occurrence.session.sessionId, occurrence);
    }
    const sessionsOccurrences = [...sessionIdToOccurrences.values()];
    const roundCount = Math.max(0, ...sessionsOccurrences.map((sessionOccurrences) => sessionOccurrences.length));
    const evidence = [];
    for (let roundIndex = 0; roundIndex < roundCount && evidence.length < maxEvidence; roundIndex++) {
      const roundEvidence = sessionsOccurrences.map((sessionOccurrences) => sessionOccurrences[roundIndex]).filter((occurrence) => occurrence !== void 0).map((occurrence) => ({
        ...occurrence.ref,
        cost: this.occurrenceCost(occurrence)
      }));
      evidence.push(...roundEvidence.slice(0, maxEvidence - evidence.length));
    }
    return evidence;
  }
  occurrenceCost(occurrence) {
    return {
      activeMs: occurrence.activeMs,
      tokens: TokenUsageUtil.total(occurrence.usage),
      inputTokens: TokenUsageUtil.inputWithCache(occurrence.usage),
      outputTokens: occurrence.usage.output,
      usd: NumberUtil.round(this.costService.costUsd(occurrence.usage, occurrence.model), OCCURRENCE_USD_DIGITS)
    };
  }
};

// src/Shared/Services/UsageService.ts
var RATE_DIGITS = 3;
var PER_INVOCATION_USD_DIGITS = 3;
var UsageService = class {
  costService;
  attribution;
  constructor(modelFamilyToPrice, pieceIds) {
    this.costService = new CostService(modelFamilyToPrice);
    this.attribution = new AttributionService(pieceIds);
  }
  pieceUsage(sessions) {
    const pieceToTotals = /* @__PURE__ */ new Map();
    for (const session of sessions) {
      this.accumulateSession(pieceToTotals, session);
    }
    return [...pieceToTotals.entries()].map(([piece, totals]) => this.toPieceUsage(piece, totals)).sort((left, right) => right.usd - left.usd || right.toolCalls - left.toolCalls);
  }
  totalsOf(pieceToTotals, piece) {
    const totals = pieceToTotals.get(piece) ?? {
      invocations: 0,
      sessionIds: /* @__PURE__ */ new Set(),
      toolCalls: 0,
      toolErrors: 0,
      activeMs: 0,
      usage: TokenUsageUtil.zero(),
      usd: 0,
      models: /* @__PURE__ */ new Set()
    };
    pieceToTotals.set(piece, totals);
    return totals;
  }
  accumulateSession(pieceToTotals, session) {
    const index = this.attribution.buildSessionIndex(session);
    const mainTotals = this.totalsOf(pieceToTotals, AttributionService.MAIN_PIECE);
    mainTotals.invocations++;
    mainTotals.sessionIds.add(session.sessionId);
    mainTotals.activeMs += session.activeMs;
    for (const threadFacts of session.threads.filter((thread) => !SessionUtil.isMainThread(thread.thread))) {
      const agentTotals = this.totalsOf(pieceToTotals, `agent:${threadFacts.thread.agentType}`);
      agentTotals.invocations++;
      agentTotals.sessionIds.add(session.sessionId);
      agentTotals.activeMs += threadFacts.activeMs;
    }
    this.accumulateMessages(pieceToTotals, session);
    this.accumulateToolCalls(pieceToTotals, session, index);
    for (const command of session.prompts.map((prompt) => prompt.command).filter((name) => name !== void 0)) {
      const commandTotals = this.totalsOf(pieceToTotals, this.attribution.commandPieceId(command));
      commandTotals.invocations++;
      commandTotals.sessionIds.add(session.sessionId);
    }
  }
  accumulateMessages(pieceToTotals, session) {
    for (const message of session.messages) {
      const threadPiece = SessionUtil.isMainThread(message.thread) ? AttributionService.MAIN_PIECE : `agent:${message.thread.agentType}`;
      const skillPieces = message.skillInUse ? [this.attribution.pieceIdFor("skill", message.skillInUse)] : [];
      for (const piece of [threadPiece, ...skillPieces]) {
        const totals = this.totalsOf(pieceToTotals, piece);
        totals.usage = TokenUsageUtil.add(totals.usage, message.usage);
        totals.usd += this.costService.costUsd(message.usage, message.model);
        totals.sessionIds.add(session.sessionId);
        if (message.model) {
          totals.models.add(message.model);
        }
      }
    }
  }
  accumulateToolCalls(pieceToTotals, session, index) {
    for (const call of session.tools) {
      const errorCount = call.result?.isError === true ? 1 : 0;
      for (const piece of index.toolCallIdToPieces.get(call.id) ?? [AttributionService.MAIN_PIECE]) {
        const totals = this.totalsOf(pieceToTotals, AttributionService.withoutBuiltInSuffix(piece));
        totals.toolCalls++;
        totals.toolErrors += errorCount;
        totals.sessionIds.add(session.sessionId);
      }
      if (call.skill) {
        this.totalsOf(pieceToTotals, `skill:${call.skill}`).invocations++;
      }
      if (SessionUtil.MCP_CATEGORIES.has(call.category)) {
        const serverTotals = this.totalsOf(pieceToTotals, call.key);
        serverTotals.invocations++;
        serverTotals.toolCalls++;
        serverTotals.toolErrors += errorCount;
        serverTotals.sessionIds.add(session.sessionId);
      }
    }
  }
  toPieceUsage(piece, totals) {
    const tokens = TokenUsageUtil.total(totals.usage);
    const pieceUsage = {
      piece,
      tokens,
      invocations: totals.invocations,
      sessions: totals.sessionIds.size,
      toolCalls: totals.toolCalls,
      toolErrors: totals.toolErrors,
      errorRate: totals.toolCalls ? NumberUtil.round(totals.toolErrors / totals.toolCalls, RATE_DIGITS) : 0,
      activeMinutes: TimeUtil.msToMinutes(totals.activeMs),
      usd: NumberUtil.round(totals.usd),
      models: [...totals.models]
    };
    if (totals.invocations > 0) {
      pieceUsage.perInvocation = {
        activeMinutes: TimeUtil.msToMinutes(totals.activeMs / totals.invocations),
        tokens: Math.round(tokens / totals.invocations),
        inputTokens: Math.round(this.inputTokensOf(totals.usage) / totals.invocations),
        outputTokens: Math.round(totals.usage.output / totals.invocations),
        usd: NumberUtil.round(totals.usd / totals.invocations, PER_INVOCATION_USD_DIGITS),
        toolCalls: NumberUtil.round(totals.toolCalls / totals.invocations, 1)
      };
    }
    return pieceUsage;
  }
  inputTokensOf(usage) {
    return usage.input + usage.cacheRead + usage.cacheWrite;
  }
};

// src/Shared/Services/CompareService.ts
var MAX_SIDE_SIGNALS = 10;
var DELTA_DIGITS = 3;
var RELATIVE_CHANGE_DIGITS = 2;
var GLOBAL_PIECE_PREFIXES = ["instructions:", "hook:", "settings:"];
var CompareService = class _CompareService {
  constructor(config, idleMs) {
    this.config = config;
    this.idleMs = idleMs;
  }
  // Why: instructions, hooks and settings apply to every session, so every session "uses" them.
  static PIECE_KIND_TO_USAGE_CHECK = {
    agent: (session, name) => session.threads.some((thread) => thread.thread.agentType === name) || session.tools.some((call) => call.subagentType === name),
    skill: (session, name) => session.tools.some((call) => call.skill === name) || session.prompts.some((prompt) => prompt.command === name),
    command: (session, name) => session.prompts.some((prompt) => prompt.command === name),
    mcp: (session, name) => session.tools.some((call) => call.category === "mcp" && call.key === `mcp:${name}`)
  };
  // Why: already priced into usdPerInvocation, so they inform the report but don't vote in the verdict.
  static TOKEN_METRICS = /* @__PURE__ */ new Set(["inputTokensPerInvocation", "outputTokensPerInvocation"]);
  static usesPiece(session, piece) {
    const [kind = "", ...nameParts] = piece.split(":");
    const usageCheck = _CompareService.PIECE_KIND_TO_USAGE_CHECK[kind];
    return usageCheck ? usageCheck(session, nameParts.join(":")) : true;
  }
  compare(sessions, piece, changedAtMs, changedAtSource) {
    const minSessions = this.config.minSessionsCompare;
    const sessionsUsingPiece = sessions.filter((session) => _CompareService.usesPiece(session, piece));
    const isBeforeChange = (session) => (session.startedAtMs ?? 0) < changedAtMs;
    const before = this.sideMetrics(sessionsUsingPiece.filter(isBeforeChange), piece);
    const after = this.sideMetrics(sessionsUsingPiece.filter((session) => !isBeforeChange(session)), piece);
    const caveats = [
      "Observational comparison: sessions before and after differ in tasks, not only in the harness.",
      "Time and cost are estimates; idle gaps are excluded."
    ];
    const hasEnoughData = before.sessions >= minSessions && after.sessions >= minSessions;
    const moves = hasEnoughData ? this.significantMoves(before, after) : [];
    if (!hasEnoughData) {
      caveats.push(
        `Need at least ${minSessions} sessions using ${piece} on each side (before: ${before.sessions}, after: ${after.sessions}).`
      );
    }
    return {
      piece,
      changedAtSource,
      minSessions,
      before,
      after,
      moves,
      caveats,
      changedAt: TimeUtil.toIso(changedAtMs),
      verdict: hasEnoughData ? this.verdictOf(moves) : "insufficient_data",
      deltas: {
        errorRate: this.difference(before.errorRate, after.errorRate),
        recoveryMinutesPerInvocation: this.difference(
          before.recoveryMinutesPerInvocation,
          after.recoveryMinutesPerInvocation
        ),
        correctionsPerSession: this.difference(before.correctionsPerSession, after.correctionsPerSession),
        activeMinutesPerInvocation: this.difference(
          before.perInvocation?.activeMinutes,
          after.perInvocation?.activeMinutes
        ),
        tokensPerInvocation: this.difference(before.perInvocation?.tokens, after.perInvocation?.tokens),
        inputTokensPerInvocation: this.difference(before.perInvocation?.inputTokens, after.perInvocation?.inputTokens),
        outputTokensPerInvocation: this.difference(
          before.perInvocation?.outputTokens,
          after.perInvocation?.outputTokens
        ),
        usdPerInvocation: this.difference(before.perInvocation?.usd, after.perInvocation?.usd)
      }
    };
  }
  significantMoves(before, after) {
    const metricToValues = {
      errorRate: [before.errorRate, after.errorRate],
      correctionsPerSession: [before.correctionsPerSession, after.correctionsPerSession],
      activeMinutesPerInvocation: [before.perInvocation?.activeMinutes, after.perInvocation?.activeMinutes],
      usdPerInvocation: [before.perInvocation?.usd, after.perInvocation?.usd],
      inputTokensPerInvocation: [before.perInvocation?.inputTokens, after.perInvocation?.inputTokens],
      outputTokensPerInvocation: [before.perInvocation?.outputTokens, after.perInvocation?.outputTokens],
      recoveryMinutesPerInvocation: [before.recoveryMinutesPerInvocation, after.recoveryMinutesPerInvocation]
    };
    return Object.entries(metricToValues).map(([metric, [beforeValue, afterValue]]) => {
      const relativeChange = this.relativeChange(beforeValue, afterValue);
      return {
        metric,
        relativeChange: NumberUtil.round(relativeChange, RELATIVE_CHANGE_DIGITS),
        // Why: lower is better for every metric, and time counts as much as money.
        direction: relativeChange < 0 ? "better" : "worse",
        isInVerdict: !_CompareService.TOKEN_METRICS.has(metric)
      };
    }).filter((move) => Math.abs(move.relativeChange) >= this.config.minRelativeChange);
  }
  verdictOf(allMoves) {
    const moves = allMoves.filter((move) => move.isInVerdict);
    if (!moves.length) {
      return "no_clear_change";
    }
    if (moves.every((move) => move.direction === "better")) {
      return "improved";
    }
    return moves.every((move) => move.direction === "worse") ? "worse" : "mixed";
  }
  usagePieceOf(piece) {
    const isGlobalPiece = GLOBAL_PIECE_PREFIXES.some((prefix) => piece.startsWith(prefix));
    return isGlobalPiece ? AttributionService.MAIN_PIECE : piece;
  }
  sideMetrics(sessions, piece) {
    const usage = new UsageService(this.config.modelFamilyToPrice, /* @__PURE__ */ new Set([piece])).pieceUsage(sessions).find((entry) => entry.piece === this.usagePieceOf(piece));
    const attributed = this.attributedToPiece(sessions, piece);
    const corrections = attributed.corrections;
    const invocations = usage?.invocations ?? 0;
    const signalService = new SignalService({
      idleMs: this.idleMs,
      modelFamilyToPrice: this.config.modelFamilyToPrice,
      maxEvidence: 0,
      minSessionsForUnused: Infinity,
      largePieceTokens: Infinity,
      thresholds: this.config.signalThresholds
    });
    const signals = signalService.extract(sessions).filter((signal) => signal.pieces.some((signalPiece) => AttributionService.isSamePiece(signalPiece, piece))).slice(0, MAX_SIDE_SIGNALS).map((signal) => ({
      id: signal.id,
      occurrences: signal.occurrences
    }));
    return {
      corrections,
      signals,
      invocations,
      sessions: sessions.length,
      toolCalls: usage?.toolCalls ?? 0,
      errorRate: usage?.errorRate ?? 0,
      perInvocation: usage?.perInvocation,
      correctionsPerSession: sessions.length ? NumberUtil.round(corrections / sessions.length) : 0,
      recoveryMinutesPerInvocation: invocations ? NumberUtil.round(TimeUtil.msToMinutes(attributed.recoveryMs) / invocations) : void 0
    };
  }
  attributedToPiece(sessions, piece) {
    const usagePiece = this.usagePieceOf(piece);
    const isGlobalPiece = usagePiece === AttributionService.MAIN_PIECE && piece !== AttributionService.MAIN_PIECE;
    const attribution = new AttributionService(/* @__PURE__ */ new Set([piece]));
    const chains = new FailureChainService(this.idleMs);
    const isPieceAmong = (pieces) => isGlobalPiece || (pieces ?? [AttributionService.MAIN_PIECE]).some((candidate) => AttributionService.isSamePiece(candidate, usagePiece));
    let corrections = 0;
    let recoveryMs = 0;
    for (const session of sessions) {
      const index = attribution.buildSessionIndex(session);
      corrections += session.prompts.filter((prompt) => prompt.isCorrection || prompt.isInterruption).filter((prompt) => isPieceAmong(index.promptToPreviousTurnPieces.get(prompt))).length;
      recoveryMs += chains.chainsOf(session, index).filter((chain) => isPieceAmong(index.toolCallIdToPieces.get(chain.failures[0]?.id ?? ""))).reduce((total, chain) => total + chain.cost.activeMs, 0);
    }
    return {
      corrections,
      recoveryMs
    };
  }
  relativeChange(before, after) {
    return before && after !== void 0 ? (after - before) / before : 0;
  }
  difference(before, after) {
    return before === void 0 || after === void 0 ? null : NumberUtil.round(after - before, DELTA_DIGITS);
  }
};

// src/Shared/Services/InventoryService.ts
var InventoryService = class _InventoryService {
  static compactPiece(piece) {
    return {
      id: piece.id,
      scope: piece.scope,
      path: piece.path,
      approxTokens: piece.approxTokens || void 0,
      modifiedAt: piece.modifiedAt,
      isEditable: piece.isEditable,
      model: piece.model,
      description: piece.description?.slice(0, _InventoryService.MAX_COMPACT_DESCRIPTION_CHARS),
      files: piece.files,
      preloadedSkills: piece.preloadedSkills
    };
  }
  static MAX_COMPACT_DESCRIPTION_CHARS = 120;
  static diff(previous, current) {
    if (!previous) {
      return [];
    }
    const previousIdToHash = new Map(previous.pieces.map((piece) => [piece.id, piece.hash]));
    const currentIdToHash = new Map(current.pieces.map((piece) => [piece.id, piece.hash]));
    const changes = [];
    for (const [id, hash] of currentIdToHash) {
      const previousHash = previousIdToHash.get(id);
      if (previousHash !== hash) {
        changes.push({
          id,
          change: previousHash === void 0 ? "added" : "modified"
        });
      }
    }
    for (const id of previousIdToHash.keys()) {
      if (!currentIdToHash.has(id)) {
        changes.push({
          id,
          change: "removed"
        });
      }
    }
    return changes;
  }
};

// src/Shared/Services/MentionService.ts
import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

// src/Shared/Utils/PathUtil.ts
import { homedir as homedir2 } from "node:os";
var PathUtil = class {
  static tildify(path) {
    const home = homedir2();
    return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
  }
  static untildify(path) {
    return path.startsWith("~") ? `${homedir2()}${path.slice(1)}` : path;
  }
};

// src/Shared/Services/MentionService.ts
var DEFAULT_MAX_MENTIONS = 8;
var MIN_TERM_CHARS = 3;
var MAX_MENTION_CHARS = 160;
var TEXT_KINDS = /* @__PURE__ */ new Set(["instructions", "skill", "agent", "command"]);
var MentionService = class {
  constructor(inventory) {
    this.inventory = inventory;
  }
  async find(terms, maxMentions = DEFAULT_MAX_MENTIONS) {
    const searchTerms = [...new Set(terms.map((term) => term.trim()).filter((term) => term.length >= MIN_TERM_CHARS))];
    const mentions = [];
    for (const piece of this.inventory.pieces.filter((candidate) => TEXT_KINDS.has(candidate.kind))) {
      if (!searchTerms.length || mentions.length >= maxMentions) {
        break;
      }
      const lines = (await readFile(this.absolutePathOf(piece.path), "utf8").catch(() => "")).split(/\r?\n/);
      for (const term of searchTerms) {
        const termPattern = RegExpUtil.wholeTerm(term, "i");
        lines.forEach((line, lineIndex) => {
          if (mentions.length < maxMentions && termPattern.test(line)) {
            mentions.push({
              piece: piece.id,
              path: piece.path,
              line: lineIndex + 1,
              text: RedactUtil.excerpt(line, MAX_MENTION_CHARS),
              term
            });
          }
        });
      }
    }
    return mentions;
  }
  absolutePathOf(piecePath) {
    const expandedPath = PathUtil.untildify(piecePath);
    return isAbsolute(expandedPath) ? expandedPath : join(this.inventory.projectDir, piecePath);
  }
};

// src/Shared/Services/ProcessProfileService.ts
var MAX_STAGE_COMMANDS = 5;
var MAX_STAGE_PIECES = 5;
var STAGES_WITH_COMMANDS = /* @__PURE__ */ new Set(["setup", "validation", "delivery"]);
var ProcessProfileService = class _ProcessProfileService {
  static STAGES = ["setup", "planning", "exploration", "implementation", "validation", "delivery"];
  static CATEGORY_TO_STAGE = {
    plan: "planning",
    read: "exploration",
    search: "exploration",
    edit: "implementation"
  };
  profile(sessions, sessionIdToIndex) {
    const stageToTotals = /* @__PURE__ */ new Map();
    for (const session of sessions) {
      const index = sessionIdToIndex.get(session.sessionId);
      for (const call of session.tools) {
        const stage = this.stageOf(call);
        if (!stage) {
          continue;
        }
        const totals = stageToTotals.get(stage) ?? this.emptyTotals();
        this.addCall(totals, session.sessionId, call, stage, index);
        stageToTotals.set(stage, totals);
      }
    }
    return _ProcessProfileService.STAGES.flatMap((stage) => {
      const totals = stageToTotals.get(stage);
      return totals ? [this.toProfile(stage, totals)] : [];
    });
  }
  addCall(totals, sessionId, call, stage, index) {
    totals.sessionIds.add(sessionId);
    totals.steps++;
    totals.failures += call.result?.isError === true ? 1 : 0;
    totals.contextChars += call.result?.contentChars ?? 0;
    const pieces = (index?.toolCallIdToPieces.get(call.id) ?? []).filter((piece) => piece !== AttributionService.MAIN_PIECE);
    for (const piece of pieces) {
      totals.pieceToCount.set(piece, (totals.pieceToCount.get(piece) ?? 0) + 1);
    }
    if (SessionUtil.COMMAND_CATEGORIES.has(call.category) && STAGES_WITH_COMMANDS.has(stage)) {
      totals.commandToCount.set(call.key, (totals.commandToCount.get(call.key) ?? 0) + 1);
    }
  }
  stageOf(call) {
    if (call.category === "shell") {
      return NormalizeUtil.commandStage(call.key);
    }
    return _ProcessProfileService.CATEGORY_TO_STAGE[call.category];
  }
  emptyTotals() {
    return {
      sessionIds: /* @__PURE__ */ new Set(),
      steps: 0,
      failures: 0,
      contextChars: 0,
      pieceToCount: /* @__PURE__ */ new Map(),
      commandToCount: /* @__PURE__ */ new Map()
    };
  }
  toProfile(stage, totals) {
    return {
      stage,
      sessions: totals.sessionIds.size,
      steps: totals.steps,
      failures: totals.failures,
      contextTokens: NumberUtil.charsToTokens(totals.contextChars),
      pieces: this.mostFrequent(totals.pieceToCount, MAX_STAGE_PIECES),
      commands: this.mostFrequent(totals.commandToCount, MAX_STAGE_COMMANDS)
    };
  }
  mostFrequent(valueToCount, limit) {
    return CollectionUtil.unique(
      [...valueToCount.entries()].sort((left, right) => right[1] - left[1]).map(([value]) => value)
    ).slice(0, limit);
  }
};

// src/Shared/Services/CheckInventoryService.ts
import { readdir, readFile as readFile2 } from "node:fs/promises";
import { join as join2 } from "node:path";

// src/Shared/Utils/CheckCatalogUtil.ts
import { extname } from "node:path";
var JS_LANGUAGES = ["javascript", "typescript"];
var EXTENSION_TO_LANGUAGE = {
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
  ".sql": "sql"
};
var NOT_CODE_EXTENSIONS = /* @__PURE__ */ new Set([
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
  ".log"
]);
var LANGUAGES_WITH_CORE_CHECKS = /* @__PURE__ */ new Set(["javascript", "typescript", "python", "go"]);
var CHECK_LIKE_WORDS = [
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
  "style"
];
var CHECK_LIKE_NAME = new RegExp(CHECK_LIKE_WORDS.join("|"), "i");
var CheckCatalogUtil = class _CheckCatalogUtil {
  // Why: every language with edits should have these; a missing one is what the skill may suggest.
  static CORE_CATEGORIES = ["complexity", "deadCode", "duplication"];
  static TOOLS = [
    {
      name: "eslint",
      languages: JS_LANGUAGES,
      categories: ["lint"],
      packages: ["eslint"],
      commands: ["eslint"],
      configSource: "eslint config",
      configMarkers: [{ pattern: /["'](complexity|max-depth|max-nested-callbacks)["']/, categories: ["complexity"] }]
    },
    {
      name: "eslint-plugin-sonarjs",
      languages: JS_LANGUAGES,
      categories: ["complexity"],
      packages: ["eslint-plugin-sonarjs"]
    },
    {
      name: "@vitest/eslint-plugin",
      languages: JS_LANGUAGES,
      categories: ["testLint"],
      packages: ["@vitest/eslint-plugin", "eslint-plugin-vitest"]
    },
    {
      name: "eslint-plugin-jest",
      languages: JS_LANGUAGES,
      categories: ["testLint"],
      packages: ["eslint-plugin-jest"]
    },
    {
      name: "eslint-plugin-testing-library",
      languages: JS_LANGUAGES,
      categories: ["testLint"],
      packages: ["eslint-plugin-testing-library"]
    },
    {
      name: "eslint-plugin-playwright",
      languages: JS_LANGUAGES,
      categories: ["testLint"],
      packages: ["eslint-plugin-playwright"]
    },
    {
      name: "eslint-plugin-boundaries",
      languages: JS_LANGUAGES,
      categories: ["boundaries"],
      packages: ["eslint-plugin-boundaries"]
    },
    {
      name: "biome",
      languages: JS_LANGUAGES,
      categories: ["lint"],
      packages: ["@biomejs/biome"],
      commands: ["biome"]
    },
    {
      name: "oxlint",
      languages: JS_LANGUAGES,
      categories: ["lint"],
      packages: ["oxlint"],
      commands: ["oxlint"]
    },
    {
      name: "typescript",
      languages: ["typescript"],
      categories: ["types"],
      packages: ["typescript"],
      commands: ["tsc"]
    },
    {
      name: "knip",
      languages: JS_LANGUAGES,
      categories: ["deadCode"],
      packages: ["knip"],
      commands: ["knip"]
    },
    {
      name: "ts-prune",
      languages: ["typescript"],
      categories: ["deadCode"],
      packages: ["ts-prune"],
      commands: ["ts-prune"]
    },
    {
      name: "jscpd",
      languages: ["*"],
      categories: ["duplication"],
      packages: ["jscpd"],
      commands: ["jscpd"]
    },
    {
      name: "fallow",
      languages: JS_LANGUAGES,
      categories: ["deadCode", "duplication", "complexity", "cycles"],
      packages: ["fallow"],
      commands: ["fallow"]
    },
    {
      name: "dpdm",
      languages: JS_LANGUAGES,
      categories: ["cycles"],
      packages: ["dpdm"],
      commands: ["dpdm"]
    },
    {
      name: "madge",
      languages: JS_LANGUAGES,
      categories: ["cycles"],
      packages: ["madge"],
      commands: ["madge"]
    },
    {
      name: "dependency-cruiser",
      languages: JS_LANGUAGES,
      categories: ["cycles", "boundaries"],
      packages: ["dependency-cruiser"],
      commands: ["depcruise"]
    },
    {
      name: "vitest",
      languages: JS_LANGUAGES,
      categories: ["tests"],
      packages: ["vitest"],
      commands: ["vitest"]
    },
    {
      name: "jest",
      languages: JS_LANGUAGES,
      categories: ["tests"],
      packages: ["jest"],
      commands: ["jest"]
    },
    {
      name: "sherif",
      languages: JS_LANGUAGES,
      categories: ["monorepo"],
      packages: ["sherif"],
      commands: ["sherif"]
    },
    {
      name: "syncpack",
      languages: JS_LANGUAGES,
      categories: ["monorepo"],
      packages: ["syncpack"],
      commands: ["syncpack"]
    },
    {
      name: "publint",
      languages: JS_LANGUAGES,
      categories: ["package"],
      packages: ["publint"],
      commands: ["publint"]
    },
    {
      name: "arethetypeswrong",
      languages: ["typescript"],
      categories: ["package"],
      packages: ["@arethetypeswrong/cli"],
      commands: ["attw"]
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
        { pattern: /["']PT\d*["']|flake8-pytest-style/, categories: ["testLint"] }
      ]
    },
    {
      name: "flake8-pytest-style",
      languages: ["python"],
      categories: ["testLint"],
      packages: ["flake8-pytest-style"]
    },
    {
      name: "flake8",
      languages: ["python"],
      categories: ["lint"],
      packages: ["flake8"],
      commands: ["flake8"],
      configSource: "python config",
      configMarkers: [{ pattern: /max-complexity/, categories: ["complexity"] }]
    },
    {
      name: "pylint",
      languages: ["python"],
      categories: ["lint"],
      packages: ["pylint"],
      commands: ["pylint"]
    },
    {
      name: "mypy",
      languages: ["python"],
      categories: ["types"],
      packages: ["mypy"],
      commands: ["mypy"]
    },
    {
      name: "pyright",
      languages: ["python"],
      categories: ["types"],
      packages: ["pyright"],
      commands: ["pyright"]
    },
    {
      name: "radon",
      languages: ["python"],
      categories: ["complexity"],
      packages: ["radon"],
      commands: ["radon"]
    },
    {
      name: "xenon",
      languages: ["python"],
      categories: ["complexity"],
      packages: ["xenon"],
      commands: ["xenon"]
    },
    {
      name: "vulture",
      languages: ["python"],
      categories: ["deadCode"],
      packages: ["vulture"],
      commands: ["vulture"]
    },
    {
      name: "pytest",
      languages: ["python"],
      categories: ["tests"],
      packages: ["pytest"],
      commands: ["pytest"]
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
        { pattern: /\b(testifylint|thelper|tparallel|paralleltest)\b/, categories: ["testLint"] }
      ]
    },
    {
      name: "lizard",
      languages: ["*"],
      categories: ["complexity"],
      packages: ["lizard"],
      commands: ["lizard"]
    }
  ];
  static languageOf(filePath) {
    const extension = extname(filePath).toLowerCase();
    const language = EXTENSION_TO_LANGUAGE[extension];
    if (language !== void 0) {
      return {
        language,
        kind: "language"
      };
    }
    return NOT_CODE_EXTENSIONS.has(extension) ? { kind: "notCode" } : {
      extension,
      kind: "unmapped"
    };
  }
  static hasCoreChecks(language) {
    return LANGUAGES_WITH_CORE_CHECKS.has(language);
  }
  static isCheckLikeName(packageName) {
    return CHECK_LIKE_NAME.test(packageName);
  }
  static knownPackages() {
    return new Set(_CheckCatalogUtil.TOOLS.flatMap((tool) => [tool.name, ...tool.packages ?? []]));
  }
  static coversLanguage(tool, language) {
    return tool.languages.includes("*") || tool.languages.includes(language);
  }
};

// src/Shared/Utils/GuardUtil.ts
var GuardUtil = class _GuardUtil {
  static asRecord(value) {
    const isPlainObject = typeof value === "object" && value !== null && !Array.isArray(value);
    return isPlainObject ? value : void 0;
  }
  static asString(value) {
    return typeof value === "string" ? value : void 0;
  }
  static asNumber(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : void 0;
  }
  static asArray(value) {
    return Array.isArray(value) ? value : [];
  }
  static firstString(record, keys) {
    for (const key of keys) {
      const value = _GuardUtil.asString(record?.[key]);
      if (value !== void 0) {
        return value;
      }
    }
    return void 0;
  }
  static isKeyOf(record, value) {
    return value !== void 0 && Object.hasOwn(record, value);
  }
  static parseJson(text) {
    try {
      return JSON.parse(text);
    } catch {
      return void 0;
    }
  }
};

// src/Shared/Services/CheckInventoryService.ts
var ESLINT_CONFIG_FILES = [
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  "eslint.config.ts",
  ".eslintrc",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.json",
  ".eslintrc.yml",
  ".eslintrc.yaml"
];
var PYTHON_CONFIG_FILES = [
  "pyproject.toml",
  "setup.cfg",
  "ruff.toml",
  ".ruff.toml",
  ".flake8",
  "tox.ini",
  "requirements.txt",
  "requirements-dev.txt"
];
var GOLANGCI_CONFIG_FILES = [".golangci.yml", ".golangci.yaml", ".golangci.toml", ".golangci.json"];
var MONOREPO_FILES = ["pnpm-workspace.yaml", "lerna.json", "turbo.json", "nx.json"];
var MIN_LANGUAGE_EDITS = 5;
var PACKAGE_ENTRY_FIELDS = ["exports", "main", "module", "bin"];
var UNMAPPED_PREFIX = "unmapped:";
var DEDICATED_CONFIG_SOURCES = /* @__PURE__ */ new Set(["eslint config", "golangci config"]);
var MATCH_KIND_TO_EDIT_KEYS = {
  language: (match) => [match.language],
  notCode: () => [],
  unmapped: (match) => [`${UNMAPPED_PREFIX}${match.extension}`]
};
var CheckInventoryService = class _CheckInventoryService {
  constructor(projectDir) {
    this.projectDir = projectDir;
  }
  async inspect(sessions, inventory) {
    const files = await this.readProjectFiles();
    const languages = _CheckInventoryService.languagesOf(sessions);
    const tools = CheckCatalogUtil.TOOLS.map((definition) => this.detect(definition, files, sessions)).filter((tool) => tool !== void 0);
    const packageJson = files.packageJson;
    return {
      languages,
      tools,
      hooks: inventory.pieces.filter((piece) => piece.kind === "hook").map((piece) => RedactUtil.redact(`${piece.name}: ${piece.description ?? ""}`)),
      isMonorepo: files.hasMonorepoFile || packageJson?.workspaces !== void 0,
      isPublishedPackage: _CheckInventoryService.isPublished(packageJson),
      missing: _CheckInventoryService.missingChecks(languages, tools),
      ..._CheckInventoryService.unmappedPart(languages, _CheckInventoryService.unmappedToolsOf(files))
    };
  }
  static unmappedPart(languages, unmappedTools) {
    const unmappedExtensions = languages.map((entry) => entry.extension).filter((extension) => extension !== void 0);
    const partialReasons = [
      ...unmappedExtensions.length ? [`edits in files with no known language: ${unmappedExtensions.join(", ")}`] : [],
      ...unmappedTools.length ? [`dependencies that may be checks outside the catalog: ${unmappedTools.join(", ")}`] : []
    ];
    return {
      unmappedTools,
      partialReasons,
      isMissingPartial: partialReasons.length > 0
    };
  }
  static unmappedToolsOf(files) {
    const requirementNames = files.sourceToText["python config"].split("\n").map((line) => /^([A-Za-z0-9_.-]+)\s*(?:[=<>~!]|$)/.exec(line.trim())?.[1]).filter((name) => name !== void 0);
    const knownPackages = CheckCatalogUtil.knownPackages();
    const names = [..._CheckInventoryService.dependencyNames(files.packageJson), ...requirementNames];
    return CollectionUtil.unique(names).filter((name) => CheckCatalogUtil.isCheckLikeName(name) && !knownPackages.has(name)).map((name) => RedactUtil.redact(name)).sort(CollectionUtil.compareCodeUnits);
  }
  static languagesOf(sessions) {
    const matches = sessions.flatMap((session) => session.tools).filter((call) => call.category === "edit" && call.filePath !== void 0).map((call) => CheckCatalogUtil.languageOf(call.filePath ?? ""));
    const keys = matches.flatMap((match) => _CheckInventoryService.editKeysOf(match));
    return Object.entries(CollectionUtil.countBy(keys)).map(([key, edits]) => key.startsWith(UNMAPPED_PREFIX) ? {
      edits,
      language: "unmapped",
      extension: RedactUtil.redact(key.slice(UNMAPPED_PREFIX.length))
    } : {
      edits,
      language: key
    }).sort((left, right) => right.edits - left.edits);
  }
  static missingChecks(languages, tools) {
    const toolDefinitions = tools.map((tool) => ({
      tool,
      definition: CheckCatalogUtil.TOOLS.find((definition) => definition.name === tool.name)
    }));
    return languages.filter((entry) => entry.edits >= MIN_LANGUAGE_EDITS && CheckCatalogUtil.hasCoreChecks(entry.language)).flatMap(({ language }) => CheckCatalogUtil.CORE_CATEGORIES.filter((category) => !toolDefinitions.some(({ tool, definition }) => definition !== void 0 && CheckCatalogUtil.coversLanguage(definition, language) && tool.categories.includes(category))).map((category) => ({
      language,
      category
    })));
  }
  static isPublished(packageJson) {
    const hasEntry = PACKAGE_ENTRY_FIELDS.some((field) => packageJson?.[field] !== void 0);
    return packageJson !== void 0 && packageJson.private !== true && typeof packageJson.name === "string" && hasEntry;
  }
  detect(definition, files, sessions) {
    const configText = this.ownConfigText(definition, files);
    const scriptRuns = _CheckInventoryService.scriptRunsOf(definition, files);
    const runsTool = (text) => (definition.commands ?? []).some((command) => _CheckInventoryService.mentions(text, command)) || scriptRuns.some((scriptRun) => scriptRun.test(text));
    const foundIn = this.sourcesOf(definition, files, runsTool);
    const sessionCount = sessions.filter((session) => session.tools.some((call) => call.category === "shell" && runsTool(call.summary))).length;
    if (!foundIn.length && sessionCount === 0) {
      return void 0;
    }
    const markerCategories = (definition.configMarkers ?? []).filter((marker) => marker.pattern.test(configText)).flatMap((marker) => marker.categories);
    const places = [
      ...sessionCount > 0 ? ["sessions"] : [],
      ...foundIn.includes("ci") ? ["ci"] : []
    ];
    return {
      name: definition.name,
      categories: CollectionUtil.unique([...definition.categories, ...markerCategories]),
      foundIn: foundIn.filter((source) => source !== "ci"),
      runsIn: places,
      sessions: sessionCount
    };
  }
  ownConfigText(definition, files) {
    return definition.configSource ? files.sourceToText[definition.configSource] : "";
  }
  static editKeysOf(match) {
    const keysOf = MATCH_KIND_TO_EDIT_KEYS[match.kind];
    return keysOf(match);
  }
  sourcesOf(definition, files, runsTool) {
    const names = [definition.name, ...definition.packages ?? [], ...definition.commands ?? []];
    const dependencies = _CheckInventoryService.dependencyNames(files.packageJson);
    const scripts = Object.values(GuardUtil.asRecord(files.packageJson?.scripts) ?? {}).map(String).join("\n");
    const isInPackageJson = (definition.packages ?? []).some((name) => dependencies.has(name)) || (definition.commands ?? []).some((command) => _CheckInventoryService.mentions(scripts, command));
    const sources = isInPackageJson ? ["package.json"] : [];
    const ownConfig = definition.configSource;
    const ownConfigSources = ownConfig && DEDICATED_CONFIG_SOURCES.has(ownConfig) && files.sourceToText[ownConfig] !== "" ? [ownConfig] : [];
    const isPython = definition.languages.includes("python") && names.some((name) => _CheckInventoryService.mentions(files.sourceToText["python config"], name));
    const isInCi = runsTool(files.sourceToText.ci);
    return [
      ...sources,
      ...ownConfigSources,
      ...isPython ? ["python config"] : [],
      ...isInCi ? ["ci"] : []
    ];
  }
  static scriptRunsOf(definition, files) {
    const commands = definition.commands ?? [];
    const scripts = GuardUtil.asRecord(files.packageJson?.scripts) ?? {};
    return Object.entries(scripts).filter(([, scriptText]) => commands.some((command) => _CheckInventoryService.mentions(String(scriptText), command))).map(([name]) => new RegExp(`\\b(npm|pnpm|yarn|bun)( run)? ${RegExpUtil.escape(name)}(?![\\w-])`));
  }
  static mentions(text, word) {
    return RegExpUtil.wholeTerm(word).test(text);
  }
  static dependencyNames(packageJson) {
    const dependencyFields = ["dependencies", "devDependencies", "optionalDependencies"];
    return new Set(dependencyFields.flatMap((field) => Object.keys(GuardUtil.asRecord(packageJson?.[field]) ?? {})));
  }
  async readProjectFiles() {
    const packageText = await this.readText("package.json");
    const workflowDir = join2(this.projectDir, ".github", "workflows");
    const workflowFiles = await readdir(workflowDir).catch(() => []);
    const ciTexts = await Promise.all([
      ...workflowFiles.filter((file) => /\.ya?ml$/.test(file)).map((file) => {
        const workflowFile = join2(".github", "workflows", file);
        return this.readText(workflowFile);
      }),
      this.readText(".gitlab-ci.yml")
    ]);
    const monorepoTexts = await Promise.all(MONOREPO_FILES.map((file) => this.readText(file)));
    return {
      packageJson: GuardUtil.asRecord(GuardUtil.parseJson(packageText)),
      sourceToText: {
        "eslint config": await this.readAll(ESLINT_CONFIG_FILES),
        "python config": await this.readAll(PYTHON_CONFIG_FILES),
        "golangci config": await this.readAll(GOLANGCI_CONFIG_FILES),
        "ci": ciTexts.join("\n")
      },
      hasMonorepoFile: monorepoTexts.some((text) => text !== "")
    };
  }
  async readAll(relativePaths) {
    const texts = await Promise.all(relativePaths.map((relativePath) => this.readText(relativePath)));
    return texts.join("\n").trim();
  }
  async readText(relativePath) {
    return readFile2(join2(this.projectDir, relativePath), "utf8").catch(() => "");
  }
};

// src/Shared/Utils/IssueLinkUtil.ts
var REPOSITORY_URL = "https://github.com/guilhermebkel/improve-my-harness";
var FINGERPRINT_CHARS = 8;
var MAX_FIELD_CHARS = 1500;
var MAX_URL_CHARS = 6e3;
var TRUNCATED = "\n(cut to fit the link)";
var MAX_LISTED_VERSIONS = 3;
var IssueLinkUtil = class _IssueLinkUtil {
  static fingerprintOf(...parts) {
    return HashUtil.sha(parts.join("\0"), FINGERPRINT_CHARS);
  }
  static versionsText(versions) {
    const agentVersions = _IssueLinkUtil.versionRange(versions.agentVersions);
    const platforms = versions.platforms.length ? versions.platforms.join(", ") : "unknown";
    return `imh ${versions.imh} \xB7 ${versions.provider} ${agentVersions} \xB7 ${platforms}`;
  }
  static versionRange(sortedVersions) {
    const oldest = sortedVersions[0];
    const newest = sortedVersions.at(-1);
    if (oldest === void 0 || newest === void 0) {
      return "unknown";
    }
    return sortedVersions.length > MAX_LISTED_VERSIONS ? `${oldest} to ${newest} (${sortedVersions.length} versions)` : sortedVersions.join(", ");
  }
  static linkOf(request) {
    const title = RedactUtil.redact(`${request.title} \xB7 ${request.fingerprint}`);
    const params = new URLSearchParams({
      title,
      template: `${request.template}.yml`
    });
    for (const [field, value] of Object.entries(request.fieldIdToFieldValue)) {
      const redacted = RedactUtil.redact(value);
      params.set(field, _IssueLinkUtil.fit(redacted, MAX_FIELD_CHARS));
    }
    const search = new URLSearchParams({ q: `is:issue ${request.fingerprint}` });
    return {
      title,
      issueUrl: _IssueLinkUtil.withinLimit(params),
      searchUrl: `${REPOSITORY_URL}/issues?${search.toString()}`
    };
  }
  static fit(text, maxChars) {
    return text.length > maxChars ? `${text.slice(0, maxChars - TRUNCATED.length)}${TRUNCATED}` : text;
  }
  static withinLimit(params) {
    const base = `${REPOSITORY_URL}/issues/new?`;
    let url = `${base}${params.toString()}`;
    while (url.length > MAX_URL_CHARS) {
      const [longestField, longestValue] = [...params.entries()].reduce((longest, entry) => entry[1].length > longest[1].length ? entry : longest);
      if (longestValue.length <= TRUNCATED.length) {
        break;
      }
      const keptChars = Math.max(TRUNCATED.length, longestValue.length - (url.length - MAX_URL_CHARS));
      const shortened = _IssueLinkUtil.fit(longestValue, keptChars);
      params.set(longestField, shortened);
      url = `${base}${params.toString()}`;
    }
    return url;
  }
};

// src/Shared/Services/GapService.ts
var MAX_NAME_CHARS = 80;
var MAX_DETAIL_CHARS = 200;
var PRIVATE_SCOPE = "@<private>";
var GapService = class _GapService {
  constructor(versions) {
    this.versions = versions;
  }
  kindToDrafts = {
    unknown_line: (input) => _GapService.unknownLineDrafts(input.sessions),
    unmapped_extension: (input) => input.checks.languages.filter((language) => language.extension !== void 0).map((language) => ({
      key: language.extension ?? "",
      title: `file extension with no language "${language.extension ?? ""}"`,
      details: [`extension: ${language.extension ?? ""}`, `edits: ${language.edits}`]
    })),
    unmapped_check_tool: (input) => input.checks.unmappedTools.map((name) => {
      const shownName = _GapService.publicName(name);
      return {
        key: shownName,
        title: `check tool not in the catalog "${shownName}"`,
        details: [`package: ${shownName}`]
      };
    }),
    unpriced_model: (input) => input.unpricedModels.map((model) => ({
      key: model,
      title: `model with no price "${model}"`,
      details: [`model: ${model}`]
    })),
    unresolved_subagent: (input) => input.usage.filter((usage) => usage.piece === AttributionService.UNRESOLVED_SUBAGENT_PIECE).map((usage) => ({
      key: usage.piece,
      title: "subagent type not resolved",
      details: [`invocations: ${usage.invocations}`, `sessions: ${usage.sessions}`]
    }))
  };
  static publicName(packageName) {
    const shortName = RedactUtil.excerpt(packageName, MAX_NAME_CHARS);
    return shortName.startsWith("@") ? `${PRIVATE_SCOPE}/${shortName.split("/").slice(1).join("/")}` : shortName;
  }
  static versionsOf(sessions, imhVersion, provider) {
    const agentVersions = sessions.map((session) => session.agentVersion).filter((version) => version !== void 0);
    const platforms = sessions.map((session) => session.environment.platform).filter((platform) => platform !== void 0);
    return {
      provider,
      imh: imhVersion,
      agentVersions: CollectionUtil.unique(agentVersions).sort(_GapService.compareVersions),
      platforms: CollectionUtil.unique(platforms).sort(CollectionUtil.compareCodeUnits)
    };
  }
  static compareVersions = (left, right) => left.localeCompare(right, "en", { numeric: true });
  gapsOf(input) {
    return Object.keys(this.kindToDrafts).flatMap((kind) => this.kindToDrafts[kind](input).map((draft) => this.gapOf(kind, draft)));
  }
  gapOf(kind, draft) {
    const fingerprint = IssueLinkUtil.fingerprintOf(kind, draft.key);
    const details = draft.details.map((detail) => RedactUtil.excerpt(detail, MAX_DETAIL_CHARS));
    const link = IssueLinkUtil.linkOf({
      fingerprint,
      template: "mapping-gap",
      title: `[gap] ${draft.title}`,
      fieldIdToFieldValue: {
        kind,
        details: details.join("\n"),
        versions: IssueLinkUtil.versionsText(this.versions)
      }
    });
    return {
      kind,
      fingerprint,
      details,
      ...link
    };
  }
  static unknownLineDrafts(sessions) {
    const signatureToCount = /* @__PURE__ */ new Map();
    for (const session of sessions) {
      for (const shape of session.unknownLines ?? []) {
        const signature = `${shape.type}|${shape.keys.join(",")}`;
        const count = signatureToCount.get(signature) ?? {
          type: shape.type,
          keys: shape.keys,
          lines: 0,
          sessionIds: /* @__PURE__ */ new Set()
        };
        count.lines += shape.count;
        count.sessionIds.add(session.sessionId);
        signatureToCount.set(signature, count);
      }
    }
    return [...signatureToCount.values()].map((count) => ({
      key: `${count.type}|${count.keys.join(",")}`,
      title: `unknown transcript line "${count.type}"`,
      details: [
        `type: ${count.type}`,
        `keys: ${count.keys.join(", ")}`,
        `lines: ${count.lines} in ${count.sessionIds.size} sessions`
      ]
    }));
  }
};

// src/Shared/Services/AnalysisService.ts
var DEFAULT_MAX_SIGNALS = 25;
var MIN_COMMON_COMMAND_RUNS = 2;
var MAX_COMMON_COMMANDS = 15;
var EMPTY_COMMAND_KEY = "(empty)";
var DEFAULT_MAX_EVIDENCE = 5;
var SAVED_EVIDENCE_PER_SIGNAL = 50;
var MAX_USAGE_ENTRIES = 15;
var MAX_FAILED_COMMANDS_TO_SEARCH = 15;
var FAILED_COMMAND_PREFIX = "failed_command:";
var FAILURE_SIGNAL_TYPES = /* @__PURE__ */ new Set(["failed_command", "tool_error", "permission_denied", "hook_blocked", "api_error"]);
var REREAD_SIGNAL_TYPES = /* @__PURE__ */ new Set(["repeated_read", "subagent_reread", "context_compaction"]);
var CORRECTION_SIGNAL_TYPES = /* @__PURE__ */ new Set(["user_correction", "interruption"]);
var COST_METHOD = "Active time sums gaps between transcript events up to the idle threshold. Each signal's cost.method says what it counts and cost.bound whether it is a lower bound, an upper bound or an estimate (docs/cost-model.md). The totals don't overlap: failures exclude fix loops, and corrections exclude turns already counted as failures.";
var AnalysisService = class _AnalysisService {
  constructor(context) {
    this.context = context;
  }
  static FIX_LOOP_PART_TO_SUMMARY = {
    all: (cost, fixLoop) => _AnalysisService.offset(cost, fixLoop, 0),
    withoutFixLoops: (cost, fixLoop) => _AnalysisService.offset(cost, fixLoop, -1),
    onlyFixLoops: (_cost, fixLoop) => fixLoop
  };
  static LAST_ANALYSIS_FILE = "last-analysis.json";
  async analyze(options) {
    const { config, store, provider } = this.context;
    const periodStartAtMs = TimeUtil.parsePointInTime(options.since);
    const periodEndAtMs = TimeUtil.parsePointInTime(options.until);
    const inventory = await this.context.takeInventory();
    const { previous, hasChanged } = await store.saveInventory(inventory);
    const loaded = await this.context.loadSessions({
      periodStartAtMs,
      periodEndAtMs
    });
    const focusPieces = options.focusPieces?.filter(Boolean) ?? [];
    const isFocused = focusPieces.length > 0;
    const sessions = isFocused ? loaded.sessions.filter((session) => focusPieces.some((piece) => CompareService.usesPiece(session, piece))) : loaded.sessions;
    const allSignals = new SignalService({
      idleMs: this.context.idleMs,
      modelFamilyToPrice: config.modelFamilyToPrice,
      maxEvidence: SAVED_EVIDENCE_PER_SIGNAL,
      minSessionsForUnused: config.minSessionsForUnused,
      largePieceTokens: config.largePieceTokens,
      thresholds: config.signalThresholds
    }).extract(sessions, inventory);
    const signals = isFocused ? allSignals.filter((signal) => this.touchesAnyPiece(signal, focusPieces)) : allSignals;
    const suggestions = await store.loadSuggestions();
    this.markHandledSignals(signals, suggestions);
    await this.addInstructionMentions(signals, inventory);
    const pieceIds = new Set(inventory.pieces.map((piece) => piece.id));
    const totals = this.totalsOf(sessions, signals);
    const usage = new UsageService(config.modelFamilyToPrice, pieceIds).pieceUsage(sessions);
    const checks = await new CheckInventoryService(this.context.projectDir).inspect(sessions, inventory);
    const versions = GapService.versionsOf(sessions, VersionUtil.VERSION, inventory.provider);
    const gaps = new GapService(versions).gapsOf({
      sessions,
      checks,
      usage,
      unpricedModels: totals.unpricedModels
    });
    const analysis = {
      tool: {
        name: "improve-my-harness",
        version: VersionUtil.VERSION
      },
      generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      project: this.context.projectDir,
      provider: inventory.provider,
      period: {
        since: TimeUtil.toIso(periodStartAtMs) ?? loaded.available.oldestAt,
        until: TimeUtil.toIso(periodEndAtMs) ?? (/* @__PURE__ */ new Date()).toISOString(),
        focus: focusPieces
      },
      history: {
        transcriptsAvailable: loaded.available.count,
        oldestAt: loaded.available.oldestAt,
        newestAt: loaded.available.newestAt,
        retentionDays: inventory.retention.days,
        retentionSource: inventory.retention.source,
        note: provider.retentionNote(inventory.retention.days)
      },
      analyzed: {
        sessions: sessions.length,
        subagentRuns: sessions.flatMap((session) => session.threads).filter((thread) => !SessionUtil.isMainThread(thread.thread)).length,
        parsedNow: loaded.parsedCount,
        fromCache: loaded.cachedCount,
        unparsedLines: loaded.unparsedLines
      },
      inventory: {
        fingerprint: inventory.fingerprint,
        hasChangedSinceLastRun: hasChanged,
        changes: InventoryService.diff(previous, inventory),
        pieces: inventory.pieces.map((piece) => InventoryService.compactPiece(piece)),
        notes: inventory.notes
      },
      environment: {
        platforms: this.countedBySession(sessions, (session) => session.environment.platform),
        shells: this.countedBySession(sessions, (session) => session.environment.shell)
      },
      process: this.processProfile(sessions, pieceIds),
      commonCommands: this.commonCommands(sessions),
      suggestionStatusToCount: CollectionUtil.countBy(suggestions.map((suggestion) => suggestion.status)),
      dataDir: store.root,
      totals,
      usage,
      checks,
      gaps,
      versions,
      signals
    };
    await store.writeJson(_AnalysisService.LAST_ANALYSIS_FILE, analysis);
    return this.compact(analysis, options);
  }
  static signalById(analysis, signalId) {
    const signal = analysis.signals.find((candidate) => candidate.id === signalId) ?? analysis.signals.find((candidate) => candidate.id.startsWith(signalId));
    if (!signal) {
      throw new Error(`Signal not found: ${signalId}`);
    }
    return signal;
  }
  static async lastAnalysis(store) {
    const analysis = await store.readJson(_AnalysisService.LAST_ANALYSIS_FILE);
    if (!analysis) {
      throw new Error("No analysis yet. Run `imh analyze` first.");
    }
    return analysis;
  }
  compact(analysis, options) {
    const maxSignals = options.maxSignals ?? DEFAULT_MAX_SIGNALS;
    const maxEvidence = options.maxEvidence ?? DEFAULT_MAX_EVIDENCE;
    return {
      ...analysis,
      usage: analysis.usage.slice(0, MAX_USAGE_ENTRIES),
      signals: analysis.signals.slice(0, maxSignals).map((signal) => ({
        ...signal,
        evidence: signal.evidence.slice(0, maxEvidence)
      })),
      omittedSignals: Math.max(0, analysis.signals.length - maxSignals),
      hint: "Full result in .imh/last-analysis.json. Use `imh evidence <signal-id>` for all evidence of one signal."
    };
  }
  touchesAnyPiece(signal, pieces) {
    return signal.pieces.some(
      (signalPiece) => pieces.some((piece) => AttributionService.isSamePiece(signalPiece, piece))
    );
  }
  markHandledSignals(signals, suggestions) {
    const signalIdToSuggestion = /* @__PURE__ */ new Map();
    for (const suggestion of suggestions) {
      for (const signalId of suggestion.signals) {
        signalIdToSuggestion.set(signalId, suggestion);
      }
    }
    for (const signal of signals) {
      const suggestion = signalIdToSuggestion.get(signal.id);
      if (suggestion) {
        signal.handledBy = {
          suggestionId: suggestion.id,
          status: suggestion.status
        };
      }
    }
  }
  async addInstructionMentions(signals, inventory) {
    const mentionService = new MentionService(inventory);
    const failedCommandSignals = signals.filter((signal) => signal.type === "failed_command").slice(0, MAX_FAILED_COMMANDS_TO_SEARCH);
    for (const signal of failedCommandSignals) {
      const failedCommand = signal.id.slice(FAILED_COMMAND_PREFIX.length);
      const workingCommands = (signal.details.recoveredWith ?? []).map((recovery) => recovery.value);
      const mentions = await mentionService.find([failedCommand, ...workingCommands]);
      if (mentions.length) {
        signal.details.mentions = mentions;
      }
    }
  }
  totalsOf(sessions, signals) {
    return {
      ...this.sessionTotals(sessions),
      lostToFailures: this.sumSignalCosts(signals, FAILURE_SIGNAL_TYPES, "withoutFixLoops"),
      inFixLoops: this.sumSignalCosts(signals, FAILURE_SIGNAL_TYPES, "onlyFixLoops"),
      lostToRereads: this.sumSignalCosts(signals, REREAD_SIGNAL_TYPES),
      inCorrectedOrInterruptedTurns: this.sumSignalCosts(signals, CORRECTION_SIGNAL_TYPES),
      reportedByProvider: this.reportedTotals(sessions),
      isEstimated: true,
      unpricedModels: this.unpricedModels(sessions),
      method: COST_METHOD,
      idleMinutes: this.context.config.idleMinutes
    };
  }
  countedBySession(sessions, valueOf) {
    const values = sessions.map(valueOf).filter((value) => value !== void 0);
    return Object.entries(CollectionUtil.countBy(values)).map(([value, count]) => ({
      value: RedactUtil.redact(value),
      count
    })).sort((left, right) => right.count - left.count);
  }
  processProfile(sessions, pieceIds) {
    const attribution = new AttributionService(pieceIds);
    const sessionIdToIndex = new Map(
      sessions.map((session) => [session.sessionId, attribution.buildSessionIndex(session)])
    );
    return new ProcessProfileService().profile(sessions, sessionIdToIndex);
  }
  commonCommands(sessions) {
    const keyToCommand = /* @__PURE__ */ new Map();
    const workCalls = sessions.flatMap((session) => session.tools.map((call) => ({
      session,
      call
    }))).filter(({ call }) => call.category === "shell" && !NormalizeUtil.isExplorationCommand(call.key));
    for (const { session, call } of workCalls) {
      const command = keyToCommand.get(call.key) ?? {
        key: call.key,
        runs: 0,
        sessions: 0,
        failures: 0,
        sessionIds: /* @__PURE__ */ new Set()
      };
      command.runs++;
      command.sessionIds.add(session.sessionId);
      if (call.result?.isError) {
        command.failures++;
      } else {
        command.example = call.summary;
      }
      keyToCommand.set(call.key, command);
    }
    return [...keyToCommand.values()].filter((command) => command.runs >= MIN_COMMON_COMMAND_RUNS && command.key !== EMPTY_COMMAND_KEY).map(({ sessionIds, ...command }) => ({
      ...command,
      sessions: sessionIds.size
    })).sort((left, right) => right.sessions - left.sessions || right.runs - left.runs).slice(0, MAX_COMMON_COMMANDS);
  }
  reportedTotals(sessions) {
    const sessionsWithCost = sessions.filter((session) => session.reported.costUsd !== void 0);
    const turns = sessions.flatMap((session) => session.reported.turns);
    const turnMs = turns.reduce((total, turn) => total + turn.durationMs, 0);
    return {
      costUsd: sessionsWithCost.length ? NumberUtil.round(sessionsWithCost.reduce((total, session) => total + (session.reported.costUsd ?? 0), 0)) : void 0,
      sessionsWithCost: sessionsWithCost.length,
      isCostPartial: sessionsWithCost.some((session) => session.reported.isCostPartial),
      turnMinutes: turns.length ? TimeUtil.msToMinutes(turnMs) : void 0,
      turns: turns.length
    };
  }
  unpricedModels(sessions) {
    const costService = new CostService(this.context.config.modelFamilyToPrice);
    const models = sessions.flatMap((session) => session.messages.map((message) => message.model)).filter((model) => model !== void 0 && !costService.isPriced(model));
    return CollectionUtil.unique(models).map((model) => RedactUtil.redact(model)).sort(CollectionUtil.compareCodeUnits);
  }
  sessionTotals(sessions) {
    const costService = new CostService(this.context.config.modelFamilyToPrice);
    let usage = TokenUsageUtil.zero();
    let usd = 0;
    let mainActiveMs = 0;
    let subagentActiveMs = 0;
    for (const session of sessions) {
      mainActiveMs += session.activeMs;
      subagentActiveMs += session.threads.filter((thread) => !SessionUtil.isMainThread(thread.thread)).reduce((total, thread) => total + thread.activeMs, 0);
      for (const message of session.messages) {
        usage = TokenUsageUtil.add(usage, message.usage);
        usd += costService.costUsd(message.usage, message.model);
      }
    }
    return {
      activeMinutes: TimeUtil.msToMinutes(mainActiveMs),
      subagentActiveMinutes: TimeUtil.msToMinutes(subagentActiveMs),
      tokens: TokenUsageUtil.total(usage),
      inputTokens: TokenUsageUtil.inputWithCache(usage),
      outputTokens: usage.output,
      usd: NumberUtil.round(usd)
    };
  }
  sumSignalCosts(allSignals, types, fixLoops = "all") {
    const figures = allSignals.filter((signal) => types.has(signal.type)).map((signal) => _AnalysisService.partOf(signal.cost, fixLoops));
    const sumOf = (field) => figures.reduce((total, figure) => total + figure[field], 0);
    return {
      activeMinutes: NumberUtil.round(sumOf("activeMinutes"), 1),
      tokens: Math.round(sumOf("tokens")),
      inputTokens: Math.round(sumOf("inputTokens")),
      outputTokens: Math.round(sumOf("outputTokens")),
      usd: NumberUtil.round(sumOf("usd"))
    };
  }
  static partOf(cost, fixLoops) {
    const fixLoop = cost.fixLoop ?? {
      activeMinutes: 0,
      tokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      usd: 0
    };
    return _AnalysisService.FIX_LOOP_PART_TO_SUMMARY[fixLoops](cost, fixLoop);
  }
  static offset(cost, fixLoop, sign) {
    return {
      activeMinutes: cost.activeMinutes + sign * fixLoop.activeMinutes,
      tokens: cost.tokens + sign * fixLoop.tokens,
      inputTokens: cost.inputTokens + sign * fixLoop.inputTokens,
      outputTokens: cost.outputTokens + sign * fixLoop.outputTokens,
      usd: cost.usd + sign * fixLoop.usd
    };
  }
};

// src/Shared/Services/ContextService.ts
import { resolve } from "node:path";

// src/Shared/Adapters/BaseProviderAdapter.ts
var BaseProviderAdapter = class {
  retentionNote(retentionDays) {
    return `${this.displayName} deletes transcripts older than ${retentionDays} days. improve-my-harness never changes this setting.`;
  }
};

// src/Providers/ClaudeCode/Services/ClaudeCodeInventoryService.ts
import { readdir as readdir2, readFile as readFile4, stat as stat2 } from "node:fs/promises";
import { basename, join as join3, relative as relative2 } from "node:path";

// src/Shared/Utils/FrontmatterUtil.ts
var BLOCK_TEXT_MARKERS = /* @__PURE__ */ new Set(["|", ">", "|-", ">-"]);
var PARENTHESIS_TO_DEPTH_CHANGE = /* @__PURE__ */ new Map([["(", 1], [")", -1]]);
var FrontmatterUtil = class _FrontmatterUtil {
  static parse(text) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
    if (!match) {
      return {
        keyToValue: {},
        body: text
      };
    }
    const state = { keyToValue: {}, currentKey: void 0, blockMode: void 0 };
    for (const rawLine of (match[1] ?? "").split(/\r?\n/)) {
      _FrontmatterUtil.readLine(state, rawLine.trimEnd());
    }
    return {
      keyToValue: state.keyToValue,
      body: text.slice(match[0].length)
    };
  }
  static readLine(state, line) {
    const isBlankOrComment = !line.trim() || line.trim().startsWith("#");
    if (isBlankOrComment) {
      return;
    }
    const key = state.currentKey;
    const content = line.trimStart();
    const isIndented = content.length < line.length;
    const isListItem = isIndented && /^-\s/.test(content);
    const isInTextBlock = state.blockMode === "text";
    if (isListItem && key && !isInTextBlock) {
      const previous = state.keyToValue[key];
      const list = Array.isArray(previous) ? previous : [];
      const item = content.slice(1).trim();
      list.push(_FrontmatterUtil.unquote(item));
      state.keyToValue[key] = list;
      state.blockMode = "list";
      return;
    }
    if (isIndented && key && isInTextBlock) {
      state.keyToValue[key] = `${String(state.keyToValue[key] ?? "")} ${line.trim()}`.trim();
      return;
    }
    const keyValue = /^([\w-]+):(.*)$/.exec(line);
    if (!keyValue) {
      return;
    }
    const newKey = keyValue[1] ?? "";
    const value = (keyValue[2] ?? "").trim();
    state.currentKey = newKey;
    state.blockMode = BLOCK_TEXT_MARKERS.has(value) ? "text" : void 0;
    const isFlowList = value.startsWith("[") && value.endsWith("]");
    state.keyToValue[newKey] = isFlowList ? _FrontmatterUtil.parseFlowList(value) : _FrontmatterUtil.parseScalar(value);
  }
  static asList(value) {
    if (value === void 0 || value === "") {
      return void 0;
    }
    if (Array.isArray(value)) {
      return value;
    }
    const entries = value.includes(",") ? value.split(",") : _FrontmatterUtil.splitOutsideParentheses(value);
    return entries.map((entry) => entry.trim()).filter(Boolean);
  }
  static asText(value) {
    return typeof value === "string" && value !== "" ? value : void 0;
  }
  static parseScalar(value) {
    return BLOCK_TEXT_MARKERS.has(value) ? "" : _FrontmatterUtil.unquote(value);
  }
  static parseFlowList(value) {
    return value.slice(1, -1).split(",").map((entry) => _FrontmatterUtil.unquote(entry.trim())).filter(Boolean);
  }
  static splitOutsideParentheses(value) {
    const entries = [];
    let current = "";
    let depth = 0;
    for (const character of value) {
      depth += PARENTHESIS_TO_DEPTH_CHANGE.get(character) ?? 0;
      const isSeparator = depth <= 0 && /\s/.test(character);
      if (isSeparator) {
        entries.push(current);
        current = "";
      } else {
        current += character;
      }
    }
    entries.push(current);
    return entries;
  }
  static unquote(text) {
    return text.replace(/^["'](.*)["']$/, "$1");
  }
};

// src/Shared/Utils/GitUtil.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
var execFileAsync = promisify(execFile);
var GIT_TIMEOUT_MS = 15e3;
var BYTES_PER_KIBIBYTE = 1024;
var BYTES_PER_MEBIBYTE = BYTES_PER_KIBIBYTE * BYTES_PER_KIBIBYTE;
var GIT_MAX_OUTPUT_MEBIBYTES = 32;
var GIT_MAX_OUTPUT_BYTES = GIT_MAX_OUTPUT_MEBIBYTES * BYTES_PER_MEBIBYTE;
var COMMIT_MARKER = "__COMMIT__";
var PORCELAIN_PATH_OFFSET = 3;
var GitUtil = class {
  static async readChangeDates(repositoryDir, paths) {
    const changeDates = {
      pathToCommittedAt: /* @__PURE__ */ new Map(),
      dirtyPaths: /* @__PURE__ */ new Set()
    };
    try {
      const { stdout: statusOutput } = await execFileAsync(
        "git",
        ["status", "--porcelain", "--untracked-files=all", "--", ...paths],
        { cwd: repositoryDir, timeout: GIT_TIMEOUT_MS }
      );
      const statusLines = statusOutput.split("\n").filter((statusLine) => statusLine.length > PORCELAIN_PATH_OFFSET);
      for (const line of statusLines) {
        changeDates.dirtyPaths.add(line.slice(PORCELAIN_PATH_OFFSET).trim());
      }
      const { stdout: logOutput } = await execFileAsync(
        "git",
        ["log", `--format=${COMMIT_MARKER}%cI`, "--name-only", "--", ...paths],
        { cwd: repositoryDir, timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_MAX_OUTPUT_BYTES }
      );
      let currentCommittedAt;
      for (const line of logOutput.split("\n").map((logLine) => logLine.trim())) {
        if (line.startsWith(COMMIT_MARKER)) {
          currentCommittedAt = line.slice(COMMIT_MARKER.length);
          continue;
        }
        if (line && currentCommittedAt && !changeDates.pathToCommittedAt.has(line)) {
          changeDates.pathToCommittedAt.set(line, currentCommittedAt);
        }
      }
    } catch {
    }
    return changeDates;
  }
};

// src/Providers/ClaudeCode/Services/ClaudeCodePieceCollectorService.ts
import { readFile as readFile3, realpath, stat } from "node:fs/promises";
import { dirname, relative } from "node:path";
var PROJECT_SCOPES = /* @__PURE__ */ new Set(["project", "local"]);
var KINDS_WITH_SKILLS = /* @__PURE__ */ new Set(["agent"]);
var READ_ONLY_SCOPES = /* @__PURE__ */ new Set(["plugin", "managed"]);
var MAX_DESCRIPTION_CHARS = 300;
var MAX_HASHED_FILE_BYTES = 1e6;
var ClaudeCodePieceCollectorService = class {
  constructor(projectDir, gitChangeDates) {
    this.projectDir = projectDir;
    this.gitChangeDates = gitChangeDates;
  }
  static MAX_DESCRIPTION_CHARS = MAX_DESCRIPTION_CHARS;
  pieces = [];
  notes = [];
  seenRealPaths = /* @__PURE__ */ new Set();
  async markSeen(file) {
    const realPath = await realpath(file).catch(() => file);
    if (this.seenRealPaths.has(realPath)) {
      return false;
    }
    this.seenRealPaths.add(realPath);
    return true;
  }
  displayPath(file, scope) {
    const isProjectFile = PROJECT_SCOPES.has(scope);
    return isProjectFile ? relative(this.projectDir, file) : PathUtil.tildify(file);
  }
  async changeOf(file, scope) {
    const projectRelativePath = relative(this.projectDir, file);
    const isCommittedAsIs = scope === "project" && !this.gitChangeDates.dirtyPaths.has(projectRelativePath);
    const committedAt = isCommittedAsIs ? this.gitChangeDates.pathToCommittedAt.get(projectRelativePath) : void 0;
    if (committedAt) {
      return {
        modifiedAt: committedAt,
        modifiedSource: "git"
      };
    }
    const fileStat = await stat(file).catch(() => void 0);
    return fileStat ? {
      modifiedAt: new Date(fileStat.mtimeMs).toISOString(),
      modifiedSource: "mtime"
    } : {};
  }
  async fileHash(file) {
    const fileStat = await stat(file).catch(() => void 0);
    const isHashable = fileStat !== void 0 && fileStat.size <= MAX_HASHED_FILE_BYTES;
    const content = isHashable ? await readFile3(file).catch(() => Buffer.alloc(0)) : Buffer.from(`${fileStat?.size ?? 0}`);
    return HashUtil.sha(`${relative(this.projectDir, file)}
${content.toString("base64")}`);
  }
  uniqueId(kind, name, scope) {
    const baseId = `${kind}:${name}`;
    const isTaken = this.pieces.some((piece) => piece.id === baseId);
    return isTaken ? `${baseId}@${scope}` : baseId;
  }
  async addFile(filePiece) {
    const isNew = await this.markSeen(filePiece.file);
    const text = isNew ? await readFile3(filePiece.file, "utf8").catch(() => void 0) : void 0;
    if (text === void 0) {
      return;
    }
    const { keyToValue } = FrontmatterUtil.parse(text);
    const extraFiles = filePiece.extraFiles ?? [];
    const extraHashes = await Promise.all(extraFiles.map(async (extraFile) => this.fileHash(extraFile)));
    const changes = await Promise.all(
      [filePiece.file, ...extraFiles].map(async (pieceFile) => this.changeOf(pieceFile, filePiece.scope))
    );
    const latestChange = changes.filter((change) => change.modifiedAt !== void 0).sort((left, right) => (right.modifiedAt ?? "").localeCompare(left.modifiedAt ?? ""))[0];
    const pieceFolder = dirname(filePiece.file);
    this.pieces.push({
      id: this.uniqueId(filePiece.kind, filePiece.name, filePiece.scope),
      kind: filePiece.kind,
      name: filePiece.name,
      scope: filePiece.scope,
      path: this.displayPath(filePiece.file, filePiece.scope),
      hash: extraFiles.length ? HashUtil.sha([text, ...extraHashes].join("\n")) : HashUtil.sha(text),
      bytes: Buffer.byteLength(text),
      approxTokens: NumberUtil.approxTokens(text),
      description: FrontmatterUtil.asText(keyToValue.description)?.slice(0, MAX_DESCRIPTION_CHARS),
      model: FrontmatterUtil.asText(keyToValue.model),
      tools: FrontmatterUtil.asList(keyToValue.tools ?? keyToValue["allowed-tools"]),
      ...latestChange,
      files: extraFiles.length ? extraFiles.map((extraFile) => relative(pieceFolder, extraFile)) : void 0,
      preloadedSkills: KINDS_WITH_SKILLS.has(filePiece.kind) ? FrontmatterUtil.asList(keyToValue.skills) : void 0,
      isEditable: !READ_ONLY_SCOPES.has(filePiece.scope),
      plugin: filePiece.plugin
    });
  }
};

// src/Providers/ClaudeCode/Services/ClaudeCodeInventoryService.ts
var DEFAULT_RETENTION_DAYS = 30;
var { MAX_DESCRIPTION_CHARS: MAX_DESCRIPTION_CHARS2 } = ClaudeCodePieceCollectorService;
var MAX_COMPONENT_DEPTH = 4;
var HARNESS_PATHS = ["CLAUDE.md", "CLAUDE.local.md", ".claude", ".mcp.json"];
var MAX_SKILL_FILES = 50;
var MAX_SKILL_FOLDER_DEPTH = 3;
var SKIPPED_FOLDERS = /* @__PURE__ */ new Set(["node_modules", ".git", "__pycache__", ".venv"]);
var ClaudeCodeInventoryService = class {
  constructor(homeDir, claudeJsonPath) {
    this.homeDir = homeDir;
    this.claudeJsonPath = claudeJsonPath;
  }
  async takeInventory(options) {
    const projectDir = options.projectDir;
    const changeDates = await GitUtil.readChangeDates(projectDir, HARNESS_PATHS);
    const builder = new ClaudeCodePieceCollectorService(projectDir, changeDates);
    const shouldIncludeUser = !options.isProjectOnly;
    await this.addInstructionFiles(builder, shouldIncludeUser);
    await this.addComponents(builder, join3(projectDir, ".claude"), "project");
    if (shouldIncludeUser) {
      await this.addComponents(builder, this.homeDir, "user");
    }
    const settings = await this.addSettings(builder, shouldIncludeUser);
    await this.addMcpServers(builder, shouldIncludeUser);
    if (shouldIncludeUser) {
      await this.addPlugins(builder, settings.pluginIdToIsEnabled);
    }
    builder.pieces.sort((left, right) => left.id.localeCompare(right.id));
    const fingerprint = HashUtil.sha(builder.pieces.map((piece) => `${piece.id}=${piece.hash}`).join("\n"));
    return {
      projectDir,
      fingerprint,
      provider: "claude-code",
      takenAt: (/* @__PURE__ */ new Date()).toISOString(),
      pieces: builder.pieces,
      retention: settings.retention,
      notes: builder.notes
    };
  }
  async addInstructionFiles(builder, shouldIncludeUser) {
    const projectDir = builder.projectDir;
    const instructionFiles = [
      {
        file: join3(projectDir, "CLAUDE.md"),
        kind: "instructions",
        name: "project",
        scope: "project"
      },
      {
        file: join3(projectDir, ".claude", "CLAUDE.md"),
        kind: "instructions",
        name: "project-dotclaude",
        scope: "project"
      },
      {
        file: join3(projectDir, "CLAUDE.local.md"),
        kind: "instructions",
        name: "local",
        scope: "local"
      }
    ];
    if (shouldIncludeUser) {
      instructionFiles.push({
        file: join3(this.homeDir, "CLAUDE.md"),
        kind: "instructions",
        name: "user",
        scope: "user"
      });
    }
    for (const instructionFile of instructionFiles) {
      await builder.addFile(instructionFile);
    }
  }
  async addComponents(builder, baseDir, scope, componentOptions = {}) {
    const prefix = componentOptions.namePrefix ?? "";
    const plugin = componentOptions.plugin;
    for (const skillDir of await readdir2(join3(baseDir, "skills")).catch(() => [])) {
      const skillFolder = join3(baseDir, "skills", skillDir);
      const file = join3(skillFolder, "SKILL.md");
      const declaredName = await this.declaredNameOf(file);
      const extraFiles = await this.skillFolderFiles(skillFolder);
      await builder.addFile({
        file,
        scope,
        plugin,
        extraFiles,
        kind: "skill",
        name: `${prefix}${declaredName ?? skillDir}`
      });
    }
    const rootSkill = join3(baseDir, "SKILL.md");
    const rootSkillStat = componentOptions.canBeRootSkill ? await stat2(rootSkill).catch(() => void 0) : void 0;
    if (rootSkillStat !== void 0) {
      await builder.addFile({
        file: rootSkill,
        kind: "skill",
        name: `${prefix}${basename(baseDir)}`,
        scope,
        plugin
      });
    }
    const agentsDir = join3(baseDir, "agents");
    for (const file of await this.listMarkdownFiles(agentsDir)) {
      const declaredName = await this.declaredNameOf(file);
      await builder.addFile({
        file,
        scope,
        plugin,
        kind: "agent",
        name: `${prefix}${declaredName ?? this.nameFromPath(agentsDir, file)}`
      });
    }
    const commandsDir = join3(baseDir, "commands");
    for (const file of await this.listMarkdownFiles(commandsDir)) {
      await builder.addFile({
        file,
        scope,
        plugin,
        kind: "command",
        name: `${prefix}${this.nameFromPath(commandsDir, file)}`
      });
    }
  }
  async declaredNameOf(file) {
    const text = await readFile4(file, "utf8").catch(() => "");
    return FrontmatterUtil.asText(FrontmatterUtil.parse(text).keyToValue.name);
  }
  nameFromPath(baseDir, file) {
    return relative2(baseDir, file).replace(/\.md$/, "").replace(/[\\/]/g, ":");
  }
  async skillFolderFiles(dir, depth = 0) {
    if (depth > MAX_SKILL_FOLDER_DEPTH) {
      return [];
    }
    const entries = await readdir2(dir, { withFileTypes: true }).catch(() => []);
    const files = [];
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const entryPath = join3(dir, entry.name);
      const isHidden = entry.name.startsWith(".");
      if (entry.isDirectory() && !isHidden && !SKIPPED_FOLDERS.has(entry.name)) {
        files.push(...await this.skillFolderFiles(entryPath, depth + 1));
      }
      const isSkillEntryFile = depth === 0 && entry.name === "SKILL.md";
      if (entry.isFile() && !isHidden && !isSkillEntryFile) {
        files.push(entryPath);
      }
    }
    return files.slice(0, MAX_SKILL_FILES);
  }
  async listMarkdownFiles(dir, depth = 0) {
    if (depth > MAX_COMPONENT_DEPTH) {
      return [];
    }
    const entries = await readdir2(dir, { withFileTypes: true }).catch(() => []);
    const files = [];
    for (const entry of entries) {
      const entryPath = join3(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...await this.listMarkdownFiles(entryPath, depth + 1));
      }
      if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(entryPath);
      }
    }
    return files;
  }
  async addSettings(builder, shouldIncludeUser) {
    const projectDir = builder.projectDir;
    const settingsFiles = [];
    if (shouldIncludeUser) {
      settingsFiles.push({
        file: join3(this.homeDir, "settings.json"),
        scope: "user"
      });
    }
    settingsFiles.push(
      {
        file: join3(projectDir, ".claude", "settings.json"),
        scope: "project"
      },
      {
        file: join3(projectDir, ".claude", "settings.local.json"),
        scope: "local"
      }
    );
    const summary = {
      pluginIdToIsEnabled: /* @__PURE__ */ new Map(),
      retention: {
        days: DEFAULT_RETENTION_DAYS,
        source: "default"
      }
    };
    for (const { file, scope } of settingsFiles) {
      const isNew = await builder.markSeen(file);
      const settings = isNew ? await this.readJsonFile(file) : void 0;
      if (!settings) {
        continue;
      }
      const change = await builder.changeOf(file, scope);
      const path = builder.displayPath(file, scope);
      const hooks = GuardUtil.asRecord(settings.hooks);
      const hookPieces = this.hookPieces(hooks, path, scope, change);
      builder.pieces.push(...hookPieces);
      const permissions = GuardUtil.asRecord(settings.permissions);
      if (permissions) {
        const permissionsPiece = this.permissionsPiece(permissions, path, scope, change);
        builder.pieces.push(permissionsPiece);
      }
      for (const [pluginId, isEnabled] of Object.entries(GuardUtil.asRecord(settings.enabledPlugins) ?? {})) {
        summary.pluginIdToIsEnabled.set(pluginId, isEnabled === true);
      }
      const retentionDays = GuardUtil.asNumber(settings.cleanupPeriodDays);
      if (retentionDays !== void 0) {
        summary.retention = {
          days: retentionDays,
          source: path
        };
      }
    }
    return summary;
  }
  permissionsPiece(permissions, path, scope, change) {
    const allowCount = GuardUtil.asArray(permissions.allow).length;
    const denyCount = GuardUtil.asArray(permissions.deny).length;
    const serialized = JSON.stringify(permissions);
    return {
      id: `settings:permissions-${scope}`,
      kind: "settings",
      name: `permissions (${scope})`,
      scope,
      path,
      hash: HashUtil.sha(serialized),
      bytes: serialized.length,
      approxTokens: 0,
      description: `${allowCount} allow rules, ${denyCount} deny rules`,
      ...change,
      isEditable: true
    };
  }
  hookPieces(hooks, path, scope, change) {
    const pieces = [];
    for (const [event, groups] of Object.entries(hooks ?? {})) {
      GuardUtil.asArray(groups).forEach((group, groupIndex) => {
        const groupRecord = GuardUtil.asRecord(group);
        const declaredMatcher = GuardUtil.asString(groupRecord?.matcher);
        const matcher = declaredMatcher === void 0 || declaredMatcher === "" ? "*" : declaredMatcher;
        const handlerShapes = GuardUtil.asArray(groupRecord?.hooks).map((handler) => {
          const handlerRecord = GuardUtil.asRecord(handler);
          const program = GuardUtil.asString(handlerRecord?.command)?.split(/\s+/)[0] ?? "";
          return `${GuardUtil.asString(handlerRecord?.type) ?? "?"}:${basename(program)}`;
        });
        const serialized = JSON.stringify(group);
        pieces.push({
          id: `hook:${scope}:${event}:${matcher}#${groupIndex}`,
          kind: "hook",
          name: `${event} ${matcher}`,
          scope,
          path,
          hash: HashUtil.sha(serialized),
          bytes: serialized.length,
          approxTokens: 0,
          description: handlerShapes.join(", "),
          ...change,
          isEditable: true
        });
      });
    }
    return pieces;
  }
  async addMcpServers(builder, shouldIncludeUser) {
    const projectMcpFile = join3(builder.projectDir, ".mcp.json");
    const projectMcp = await this.readJsonFile(projectMcpFile);
    const projectServers = GuardUtil.asRecord(projectMcp?.mcpServers);
    const projectChange = await builder.changeOf(projectMcpFile, "project");
    const projectPieces = this.mcpPieces(projectServers, ".mcp.json", "project", projectChange);
    builder.pieces.push(...projectPieces);
    if (!shouldIncludeUser) {
      return;
    }
    const userConfig = await this.readJsonFile(this.claudeJsonPath);
    if (!userConfig) {
      return;
    }
    const displayPath = PathUtil.tildify(this.claudeJsonPath);
    const projectEntry = GuardUtil.asRecord(GuardUtil.asRecord(userConfig.projects)?.[builder.projectDir]);
    const userServers = GuardUtil.asRecord(userConfig.mcpServers);
    const localServers = GuardUtil.asRecord(projectEntry?.mcpServers);
    const userPieces = this.mcpPieces(userServers, displayPath, "user", {});
    const localPieces = this.mcpPieces(localServers, displayPath, "local", {});
    builder.pieces.push(...userPieces, ...localPieces);
  }
  mcpPieces(servers, path, scope, change) {
    return Object.entries(servers ?? {}).map(([name, config]) => {
      const configRecord = GuardUtil.asRecord(config);
      const transport = GuardUtil.asString(configRecord?.type) ?? (configRecord?.url === void 0 ? "stdio" : "http");
      const command = GuardUtil.asString(configRecord?.command);
      const serialized = JSON.stringify(config ?? {});
      return {
        id: `mcp:${name}`,
        kind: "mcp",
        name,
        scope,
        path,
        hash: HashUtil.sha(serialized),
        bytes: serialized.length,
        approxTokens: 0,
        description: command === void 0 ? transport : `${transport} (${basename(command)})`,
        ...change,
        isEditable: true
      };
    });
  }
  async addPlugins(builder, pluginIdToIsEnabled) {
    for (const [pluginId, installPath] of await this.readInstalledPlugins()) {
      if (pluginIdToIsEnabled.get(pluginId) === false) {
        continue;
      }
      if (!pluginIdToIsEnabled.has(pluginId)) {
        builder.notes.push(`Plugin ${pluginId} is installed but not listed in enabledPlugins; assumed enabled.`);
      }
      const manifestFile = join3(installPath, ".claude-plugin", "plugin.json");
      const manifest = await this.readJsonFile(manifestFile);
      const serialized = JSON.stringify(manifest ?? {});
      builder.pieces.push({
        id: `plugin:${pluginId}`,
        kind: "plugin",
        name: pluginId,
        scope: "plugin",
        path: PathUtil.tildify(installPath),
        hash: HashUtil.sha(serialized),
        bytes: serialized.length,
        approxTokens: 0,
        description: GuardUtil.asString(manifest?.description)?.slice(0, MAX_DESCRIPTION_CHARS2),
        isEditable: false,
        plugin: pluginId
      });
      const pluginName = pluginId.split("@")[0] ?? pluginId;
      await this.addComponents(builder, installPath, "plugin", {
        namePrefix: `${pluginName}:`,
        plugin: pluginId,
        canBeRootSkill: true
      });
    }
  }
  async readInstalledPlugins() {
    const pluginIdToInstallPath = /* @__PURE__ */ new Map();
    const installedFile = join3(this.homeDir, "plugins", "installed_plugins.json");
    const installed = await this.readJsonFile(installedFile);
    const plugins = GuardUtil.asRecord(installed?.plugins) ?? installed ?? {};
    for (const [pluginId, value] of Object.entries(plugins)) {
      const installs = Array.isArray(value) ? value : [value];
      const installPath = GuardUtil.asString(GuardUtil.asRecord(installs.at(-1))?.installPath);
      if (installPath) {
        pluginIdToInstallPath.set(pluginId, installPath);
      }
    }
    return pluginIdToInstallPath;
  }
  async readJsonFile(file) {
    const text = await readFile4(file, "utf8").catch(() => void 0);
    return text === void 0 ? void 0 : GuardUtil.asRecord(GuardUtil.parseJson(text));
  }
};

// src/Providers/ClaudeCode/Services/ClaudeCodeSessionService.ts
import { readdir as readdir3, readFile as readFile5, stat as stat3 } from "node:fs/promises";
import { basename as basename2, isAbsolute as isAbsolute2, join as join5, relative as relative3 } from "node:path";

// src/Shared/Utils/JsonlUtil.ts
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
var JsonlUtil = class _JsonlUtil {
  static async read(file, handlers) {
    const lines = createInterface({
      input: createReadStream(file, { encoding: "utf8" }),
      crlfDelay: Infinity
    });
    let lineNumber = 0;
    for await (const line of lines) {
      lineNumber++;
      if (line.trim()) {
        _JsonlUtil.handleLine(line, lineNumber, handlers);
      }
    }
  }
  static handleLine(line, lineNumber, handlers) {
    const record = GuardUtil.parseJson(line);
    if (record === void 0) {
      handlers.onBadLine();
      return;
    }
    try {
      handlers.onRecord(record, lineNumber);
    } catch {
      handlers.onBadLine();
    }
  }
};

// src/Providers/ClaudeCode/Utils/ClaudeCodePathUtil.ts
import { homedir as homedir3 } from "node:os";
import { join as join4 } from "node:path";

// src/Shared/Utils/EnvUtil.ts
var EnvUtil = class {
  static read(name) {
    const value = process.env[name];
    return value === "" ? void 0 : value;
  }
};

// src/Providers/ClaudeCode/Utils/ClaudeCodePathUtil.ts
var ClaudeCodePathUtil = class {
  static homeDir() {
    return EnvUtil.read("IMH_CLAUDE_HOME") ?? EnvUtil.read("CLAUDE_CONFIG_DIR") ?? join4(homedir3(), ".claude");
  }
  static claudeJsonPath() {
    const configDir = EnvUtil.read("CLAUDE_CONFIG_DIR");
    const defaultPath = configDir ? join4(configDir, ".claude.json") : join4(homedir3(), ".claude.json");
    return EnvUtil.read("IMH_CLAUDE_JSON") ?? defaultPath;
  }
  static encodeProjectDir(projectDir) {
    return projectDir.replace(/[^a-zA-Z0-9]/g, "-");
  }
};

// src/Providers/ClaudeCode/Utils/ClaudeCodeTranscriptUtil.ts
var HARNESS_INJECTED_BLOCKS = /<(system-reminder|command-message|command-args|local-command-stdout|local-command-stderr|local-command-caveat|bash-input|bash-stdout|bash-stderr|user-prompt-submit-hook|task-notification)>[\s\S]*?<\/\1>/g;
var INTERRUPTION_PREFIX = "[Request interrupted by user";
var PERMISSION_DENIED = /(permission to use .+ (?:has been|was) denied|permission for this action was denied|denied by (?:the )?(?:claude code )?(?:permission|auto[- ]mode)|requires approval|not allowed by your permission settings)/i;
var USER_REJECTED = /(doesn'?t want to proceed with this tool use|tool use was rejected|denied by (?:the )?user)/i;
var REJECTION_FEEDBACK_MARKER = /the user said:/i;
var DENIAL_KIND_TO_RESULT_KIND = {
  "user-rejected": "user_rejected",
  "automode-blocked": "permission_denied",
  "automode-unavailable": "permission_denied"
};
var HOOK_BLOCKED = /(hook (?:error|blocked|denied)|blocked by (?:a |the )?(?:\w+ )?hook|PreToolUse:\w+ hook)/i;
var COMPACTION_CAVEAT = /^Caveat: The messages below were generated/i;
var RESULT_HEAD_CHARS = 600;
var ClaudeCodeTranscriptUtil = class _ClaudeCodeTranscriptUtil {
  static cleanPrompt(rawText) {
    const commandName = /<command-name>\s*\/?([^<\s]+)\s*<\/command-name>/.exec(rawText)?.[1];
    const commandArguments = /<command-args>([\s\S]*?)<\/command-args>/.exec(rawText)?.[1];
    const withoutInjectedBlocks = rawText.replace(HARNESS_INJECTED_BLOCKS, " ").replace(/<command-name>[\s\S]*?<\/command-name>/g, " ");
    const withArguments = commandName && commandArguments ? `${withoutInjectedBlocks} ${commandArguments}` : withoutInjectedBlocks;
    return {
      text: withArguments.replace(/\s+/g, " ").trim(),
      command: commandName
    };
  }
  static isInterruption(text) {
    return text.trim().startsWith(INTERRUPTION_PREFIX);
  }
  static isCompactionCaveat(text) {
    return COMPACTION_CAVEAT.test(text);
  }
  static classifyResult(text, signals) {
    const { isMarkedError, wasInterrupted, denialKind } = signals;
    const head = text.slice(0, RESULT_HEAD_CHARS);
    if (_ClaudeCodeTranscriptUtil.isInterruption(text)) {
      return "interrupted";
    }
    if (denialKind !== void 0) {
      return DENIAL_KIND_TO_RESULT_KIND[denialKind] ?? "permission_denied";
    }
    if (isMarkedError && USER_REJECTED.test(head)) {
      return "user_rejected";
    }
    if (isMarkedError && PERMISSION_DENIED.test(head)) {
      return "permission_denied";
    }
    if (isMarkedError && HOOK_BLOCKED.test(head)) {
      return "hook_blocked";
    }
    return isMarkedError || wasInterrupted ? "error" : "ok";
  }
  static rejectionFeedback(text) {
    const marker = REJECTION_FEEDBACK_MARKER.exec(text);
    if (!marker) {
      return void 0;
    }
    const feedback = text.slice(marker.index + marker[0].length).trim();
    return feedback === "" ? void 0 : feedback;
  }
  static errorText(text) {
    return text.replace(/<\/?tool_use_error>/g, "");
  }
};

// src/Providers/ClaudeCode/Services/ClaudeCodeSessionService.ts
var TRANSCRIPT_EXTENSION = ".jsonl";
var UNKNOWN_SUBAGENT_TYPE2 = "subagent";
var DEFAULT_SUBAGENT_TYPE = "general-purpose";
var MAX_PROMPT_CHARS = 2e3;
var MAX_SUMMARY_CHARS = 160;
var SUBAGENT_TYPE_KEYS = ["agentType", "agent_type", "subagentType", "subagent_type", "attributionAgent"];
var TIMED_LINE_TYPES = /* @__PURE__ */ new Set(["user", "assistant", "attachment", "system"]);
var READ_TOOLS = /* @__PURE__ */ new Set(["Read", "NotebookRead"]);
var EDIT_TOOLS = /* @__PURE__ */ new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
var SEARCH_TOOLS = /* @__PURE__ */ new Set(["Grep", "Glob", "WebSearch", "WebFetch", "ToolSearch"]);
var DELEGATION_TOOLS = /* @__PURE__ */ new Set(["Task", "Agent"]);
var PLAN_TOOLS = /* @__PURE__ */ new Set(["ExitPlanMode", "EnterPlanMode"]);
var HUMAN_ORIGIN = "human";
var SYNTHETIC_MODEL = "<synthetic>";
var MODEL_IN_ERROR = /\bmodel \(([^)\s]{1,80})\)/i;
var UNKNOWN_API_ERROR = "unknown";
var TOKENS_PER_THOUSAND2 = 1e3;
var VALID_TOOL_NAME = /^[\w.:-]{1,100}$/;
var MALFORMED_TOOL_NAME = "(malformed tool name)";
var REJECTED_WITHOUT_FEEDBACK = "rejected without feedback";
var MAX_UNKNOWN_TYPE_CHARS = 60;
var DETACHED_BRANCH_NAMES = /* @__PURE__ */ new Set(["HEAD"]);
var COMPACTION_TRIGGER_TO_IS_KNOWN = {
  auto: true,
  manual: true
};
var MAX_UNKNOWN_KEYS = 40;
var IGNORED_LINE_TYPES = /* @__PURE__ */ new Set([
  "summary",
  "last-prompt",
  "permission-mode",
  "mode",
  "ai-title",
  "custom-title",
  "queue-operation",
  "atis-latch",
  "agent-name",
  "pr-link",
  "frame-link",
  "file-history-snapshot",
  "file-history-delta",
  "artifact-autoreact-ledger",
  "artifact-comment-monitor",
  "progress"
]);
var describeShellCall = (input) => {
  const command = GuardUtil.asString(input.command);
  return command === void 0 ? void 0 : {
    key: NormalizeUtil.commandKey(command),
    category: "shell",
    summary: command
  };
};
var describeSkillCall = (input) => {
  const skill = (GuardUtil.firstString(input, ["skill", "command", "name"]) ?? "unknown").replace(/^\//, "");
  return {
    key: `Skill:${skill}`,
    category: "skill",
    summary: `skill ${skill}`,
    skill
  };
};
var TOOL_NAME_TO_DESCRIBER = /* @__PURE__ */ new Map([["Bash", describeShellCall], ["Skill", describeSkillCall]]);
var keepText = (text) => text;
var rejectionExcerpt = (text) => ClaudeCodeTranscriptUtil.rejectionFeedback(text) ?? REJECTED_WITHOUT_FEEDBACK;
var RESULT_KIND_TO_EXCERPT = {
  ok: () => void 0,
  user_rejected: rejectionExcerpt,
  error: keepText,
  permission_denied: keepText,
  interrupted: keepText,
  hook_blocked: keepText
};
var CONTENT_BLOCK_TYPE_TO_TEXT = {
  image: () => "[image]",
  text: (block) => GuardUtil.asString(block.text) ?? ""
};
var ClaudeCodeSessionService = class {
  constructor(homeDir) {
    this.homeDir = homeDir;
  }
  lineTypeToHandler = {
    "attachment": (context, line) => {
      this.handleAttachment(context, line);
    },
    "cost-state": (context, line) => {
      this.handleCostState(context, line);
    },
    "system": (context, line, isMainFile) => {
      this.handleSystemLine(context, line, isMainFile);
    },
    "assistant": (context, line) => {
      this.withMessage(line, (message) => {
        this.handleAssistantLine(context, line, message);
      });
    },
    "user": (context, line) => {
      this.withMessage(line, (message) => {
        this.handleUserLine(context, line, message);
      });
    }
  };
  attachmentTypeToHandler = {
    environment: (context, _line, attachment) => {
      this.readEnvironment(context, GuardUtil.asRecord(attachment.snapshot));
    },
    queued_command: (context, line, attachment) => {
      this.handleQueuedCommand(context, line, attachment);
    }
  };
  systemSubtypeToHandler = {
    compact_boundary: (context, line) => {
      this.handleCompaction(context, line);
    },
    turn_duration: (context, line, isMainFile) => {
      this.handleTurnDuration(context, line, isMainFile);
    }
  };
  async discoverTranscripts(options) {
    const projectsDir = join5(this.homeDir, "projects");
    const projectFolders = await readdir3(projectsDir).catch(() => []);
    const encodedProject = ClaudeCodePathUtil.encodeProjectDir(options.projectDir);
    const isCandidateFolder = (folder) => folder === encodedProject || folder.startsWith(`${encodedProject}-`);
    const selectedFolders = options.shouldReadAllProjects ? projectFolders : projectFolders.filter(isCandidateFolder);
    const transcripts = [];
    for (const folder of selectedFolders) {
      const folderPath = join5(projectsDir, folder);
      const entries = await readdir3(folderPath).catch(() => []);
      for (const entry of entries.filter((name) => name.endsWith(TRANSCRIPT_EXTENSION))) {
        const fileStat = await this.statFile(join5(folderPath, entry));
        if (!fileStat) {
          continue;
        }
        const sessionId = entry.slice(0, -TRANSCRIPT_EXTENSION.length);
        const subagentFolder = join5(folderPath, sessionId, "subagents");
        const subagentFiles = await this.listSubagentFiles(subagentFolder);
        transcripts.push({
          ...fileStat,
          sessionId,
          subagentFiles,
          isExactProject: folder === encodedProject
        });
      }
    }
    return transcripts.sort((left, right) => left.modifiedAtMs - right.modifiedAtMs);
  }
  async parseSession(transcript, options) {
    const facts = {
      provider: "claude-code",
      sessionId: transcript.sessionId,
      file: transcript.file,
      activeMs: 0,
      threads: [],
      prompts: [],
      tools: [],
      messages: [],
      apiErrors: [],
      compactions: [],
      environment: {},
      reported: {
        isCostPartial: false,
        turns: []
      },
      files: [transcript.file, ...transcript.subagentFiles.map((subagentFile) => subagentFile.file)],
      unparsedLines: 0
    };
    const context = {
      facts,
      currentFile: transcript.file,
      currentThread: SessionUtil.mainThread(),
      projectDir: options.projectDir,
      toolUseIdToPendingCall: /* @__PURE__ */ new Map(),
      threadIdToEventsAtMs: /* @__PURE__ */ new Map(),
      messageIdToMessage: /* @__PURE__ */ new Map(),
      delegationCallIdToAgentId: /* @__PURE__ */ new Map(),
      threadIdToFirstPromptHash: /* @__PURE__ */ new Map(),
      threadIdToDeclaredType: /* @__PURE__ */ new Map(),
      threadIdToLastModel: /* @__PURE__ */ new Map(),
      runStartToCostUsd: /* @__PURE__ */ new Map()
    };
    await this.readTranscript(context, transcript.file, true);
    for (const subagentFile of transcript.subagentFiles) {
      const agentId = basename2(subagentFile.file, TRANSCRIPT_EXTENSION).replace(/^agent-/, "");
      const metaType = await this.readSubagentMetaType(subagentFile.file);
      context.currentFile = subagentFile.file;
      context.currentThread = {
        id: agentId,
        agentType: metaType ?? UNKNOWN_SUBAGENT_TYPE2
      };
      await this.readTranscript(context, subagentFile.file, false);
      const resolvedType = metaType ?? context.threadIdToDeclaredType.get(agentId) ?? this.typeFromDelegation(context, agentId);
      if (resolvedType) {
        this.relabelThread(facts, agentId, resolvedType);
      }
    }
    for (const call of facts.tools) {
      const agentId = context.delegationCallIdToAgentId.get(call.id);
      if (agentId && call.subagentType) {
        this.relabelThread(facts, agentId, call.subagentType);
      }
    }
    facts.messages = [...context.messageIdToMessage.values()];
    facts.environment.platform ??= this.platformFromPath(facts.projectDir);
    this.summarizeThreads(context, options.idleMs);
    return facts;
  }
  async listSubagentFiles(subagentsDir) {
    const entries = await readdir3(subagentsDir).catch(() => []);
    const stats = await Promise.all(
      entries.filter((name) => name.endsWith(TRANSCRIPT_EXTENSION)).map(async (name) => this.statFile(join5(subagentsDir, name)))
    );
    return stats.filter((fileStat) => fileStat !== void 0);
  }
  async statFile(file) {
    const fileStat = await stat3(file).catch(() => void 0);
    if (!fileStat?.isFile()) {
      return void 0;
    }
    return {
      file,
      modifiedAtMs: fileStat.mtimeMs,
      bytes: fileStat.size
    };
  }
  async readTranscript(context, file, isMainFile) {
    await JsonlUtil.read(file, {
      onRecord: (record, lineNumber) => {
        this.handleRecord(context, record, lineNumber, isMainFile);
      },
      onBadLine: () => {
        context.facts.unparsedLines++;
      }
    });
  }
  typeFromDelegation(context, agentId) {
    const delegations = context.facts.tools.filter((call) => call.subagentType !== void 0);
    const firstPromptHash = context.threadIdToFirstPromptHash.get(agentId);
    const byResult = delegations.find((call) => context.delegationCallIdToAgentId.get(call.id) === agentId);
    const byPrompt = delegations.find(
      (call) => call.subagentPromptHash !== void 0 && call.subagentPromptHash === firstPromptHash
    );
    return byResult?.subagentType ?? byPrompt?.subagentType;
  }
  summarizeThreads(context, idleMs) {
    const facts = context.facts;
    for (const [threadId, eventsAtMs] of context.threadIdToEventsAtMs) {
      eventsAtMs.sort((left, right) => left - right);
      const isMain = threadId === SessionUtil.MAIN_THREAD_ID;
      const threadFacts = {
        thread: isMain ? SessionUtil.mainThread() : {
          id: threadId,
          agentType: this.knownTypeOfThread(facts, threadId)
        },
        activeMs: TimeUtil.activeTime(eventsAtMs, idleMs),
        firstEventAtMs: eventsAtMs[0],
        lastEventAtMs: eventsAtMs.at(-1),
        promptHash: context.threadIdToFirstPromptHash.get(threadId)
      };
      facts.threads.push(threadFacts);
      if (isMain) {
        facts.activeMs = threadFacts.activeMs;
        facts.startedAtMs = threadFacts.firstEventAtMs;
        facts.endedAtMs = threadFacts.lastEventAtMs;
      }
    }
    if (facts.startedAtMs === void 0) {
      const allEventsAtMs = [...context.threadIdToEventsAtMs.values()].flat().sort((left, right) => left - right);
      facts.startedAtMs = allEventsAtMs[0];
      facts.endedAtMs = allEventsAtMs.at(-1);
    }
  }
  knownTypeOfThread(facts, threadId) {
    return facts.tools.find((call) => call.thread.id === threadId)?.thread.agentType ?? facts.messages.find((message) => message.thread.id === threadId)?.thread.agentType ?? UNKNOWN_SUBAGENT_TYPE2;
  }
  relabelThread(facts, threadId, agentType) {
    for (const call of facts.tools.filter((toolCall) => toolCall.thread.id === threadId)) {
      call.thread.agentType = agentType;
      call.ref.thread = agentType;
      if (call.result) {
        call.result.ref.thread = agentType;
      }
    }
    for (const message of facts.messages.filter((assistantMessage) => assistantMessage.thread.id === threadId)) {
      message.thread.agentType = agentType;
    }
  }
  async readSubagentMetaType(subagentFile) {
    const metaFile = subagentFile.replace(/\.jsonl$/, ".meta.json");
    const metaText = await readFile5(metaFile, "utf8").catch(() => void 0);
    if (metaText === void 0) {
      return void 0;
    }
    const meta = GuardUtil.asRecord(GuardUtil.parseJson(metaText));
    return GuardUtil.firstString(meta, SUBAGENT_TYPE_KEYS);
  }
  handleRecord(context, value, lineNumber, isMainFile) {
    const record = GuardUtil.asRecord(value);
    if (!record) {
      return;
    }
    const facts = context.facts;
    if (isMainFile) {
      facts.projectDir ??= GuardUtil.asString(record.cwd);
      const gitBranch = GuardUtil.asString(record.gitBranch);
      if (!facts.gitBranch && gitBranch && !DETACHED_BRANCH_NAMES.has(gitBranch)) {
        facts.gitBranch = gitBranch;
      }
    }
    const occurredAt = GuardUtil.asString(record.timestamp);
    const parsedAtMs = occurredAt === void 0 ? Number.NaN : Date.parse(occurredAt);
    const line = {
      record,
      lineNumber,
      occurredAt,
      thread: this.threadOfLine(context, record, isMainFile),
      occurredAtMs: Number.isNaN(parsedAtMs) ? void 0 : parsedAtMs
    };
    const lineType = GuardUtil.asString(record.type);
    if (line.occurredAtMs !== void 0 && lineType !== void 0 && TIMED_LINE_TYPES.has(lineType)) {
      const eventsAtMs = context.threadIdToEventsAtMs.get(line.thread.id) ?? [];
      eventsAtMs.push(line.occurredAtMs);
      context.threadIdToEventsAtMs.set(line.thread.id, eventsAtMs);
    }
    facts.agentVersion = GuardUtil.asString(record.version) ?? facts.agentVersion;
    if (GuardUtil.isKeyOf(this.lineTypeToHandler, lineType)) {
      this.lineTypeToHandler[lineType](context, line, isMainFile);
      return;
    }
    if (!IGNORED_LINE_TYPES.has(lineType ?? "")) {
      this.recordUnknownLine(facts, record, lineType);
    }
  }
  recordUnknownLine(facts, record, lineType) {
    const type = RedactUtil.excerpt(lineType ?? "(no type)", MAX_UNKNOWN_TYPE_CHARS);
    const keys = Object.keys(record).sort(CollectionUtil.compareCodeUnits).slice(0, MAX_UNKNOWN_KEYS).map((key) => RedactUtil.excerpt(key, MAX_UNKNOWN_TYPE_CHARS));
    const shapes = facts.unknownLines ?? [];
    const signature = keys.join(",");
    const known = shapes.find((shape) => shape.type === type && shape.keys.join(",") === signature);
    if (known) {
      known.count++;
    } else {
      shapes.push({
        type,
        keys,
        count: 1
      });
    }
    facts.unknownLines = shapes;
  }
  withMessage(line, handle) {
    const message = GuardUtil.asRecord(line.record.message);
    if (message) {
      handle(message);
    }
  }
  threadOfLine(context, record, isMainFile) {
    let thread = context.currentThread;
    const isInlineSidechain = isMainFile && record.isSidechain === true;
    if (isInlineSidechain) {
      const sidechainId = GuardUtil.asString(record.agentId) ?? "sidechain";
      thread = {
        id: sidechainId,
        agentType: context.threadIdToDeclaredType.get(sidechainId) ?? UNKNOWN_SUBAGENT_TYPE2
      };
    }
    const declaredType = GuardUtil.firstString(record, SUBAGENT_TYPE_KEYS);
    if (declaredType && !SessionUtil.isMainThread(thread)) {
      context.threadIdToDeclaredType.set(thread.id, declaredType);
      thread.agentType = declaredType;
    }
    return thread;
  }
  evidenceFactory(context, line) {
    return (text) => ({
      sessionId: context.facts.sessionId,
      file: context.currentFile,
      line: line.lineNumber,
      occurredAt: line.occurredAt,
      thread: line.thread.agentType,
      excerpt: text ? RedactUtil.excerpt(text) : void 0
    });
  }
  handleAssistantLine(context, line, message) {
    const messageId = GuardUtil.asString(message.id) ?? `${context.currentFile}:${line.lineNumber}`;
    const usage = this.readUsage(GuardUtil.asRecord(message.usage));
    const toEvidence = this.evidenceFactory(context, line);
    const model = this.readModel(message);
    const skillInUse = GuardUtil.asString(line.record.attributionSkill);
    if (model) {
      context.threadIdToLastModel.set(line.thread.id, model);
    }
    if (line.record.isApiErrorMessage === true) {
      this.handleApiError(context, line, message);
    }
    const existing = context.messageIdToMessage.get(messageId);
    if (existing) {
      existing.usage = this.maxUsage(existing.usage, usage);
    } else {
      context.messageIdToMessage.set(messageId, {
        model,
        usage,
        skillInUse,
        id: messageId,
        thread: line.thread,
        sentAtMs: line.occurredAtMs,
        ref: toEvidence()
      });
    }
    for (const block of GuardUtil.asArray(message.content).map((item) => GuardUtil.asRecord(item))) {
      const toolUseId = GuardUtil.asString(block?.id);
      if (block?.type !== "tool_use" || !toolUseId) {
        continue;
      }
      const call = this.buildToolCall(block, toolUseId, {
        toEvidence,
        messageId,
        skillInUse,
        thread: line.thread,
        calledAtMs: line.occurredAtMs,
        projectDir: context.projectDir
      });
      context.toolUseIdToPendingCall.set(toolUseId, call);
      context.facts.tools.push(call);
    }
  }
  readUsage(usage) {
    return {
      input: GuardUtil.asNumber(usage?.input_tokens) ?? 0,
      output: GuardUtil.asNumber(usage?.output_tokens) ?? 0,
      cacheRead: GuardUtil.asNumber(usage?.cache_read_input_tokens) ?? 0,
      cacheWrite: GuardUtil.asNumber(usage?.cache_creation_input_tokens) ?? 0
    };
  }
  maxUsage(left, right) {
    return {
      input: Math.max(left.input, right.input),
      output: Math.max(left.output, right.output),
      cacheRead: Math.max(left.cacheRead, right.cacheRead),
      cacheWrite: Math.max(left.cacheWrite, right.cacheWrite)
    };
  }
  handleUserLine(context, line, message) {
    const content = message.content;
    if (typeof content === "string") {
      this.handlePrompt(context, line, content);
      return;
    }
    const textParts = [];
    const blockTypeToHandler = {
      tool_result: (block) => {
        this.handleToolResult(context, line, block);
      },
      text: (block) => {
        const text = GuardUtil.asString(block.text);
        if (text !== void 0) {
          textParts.push(text);
        }
      }
    };
    for (const block of GuardUtil.asArray(content).map((item) => GuardUtil.asRecord(item))) {
      const blockType = GuardUtil.asString(block?.type);
      if (block && GuardUtil.isKeyOf(blockTypeToHandler, blockType)) {
        blockTypeToHandler[blockType](block);
      }
    }
    if (textParts.length) {
      this.handlePrompt(context, line, textParts.join("\n"));
    }
  }
  handleApiError(context, line, message) {
    const status = GuardUtil.asNumber(line.record.apiErrorStatus);
    const recordedCode = GuardUtil.asString(line.record.error);
    const hasUsefulCode = recordedCode !== void 0 && recordedCode !== UNKNOWN_API_ERROR;
    const statusCode = status === void 0 ? UNKNOWN_API_ERROR : `http_${status}`;
    const text = this.messageText(message);
    context.facts.apiErrors.push({
      status,
      code: hasUsefulCode ? recordedCode : statusCode,
      model: MODEL_IN_ERROR.exec(text)?.[1] ?? context.threadIdToLastModel.get(line.thread.id),
      thread: line.thread,
      ref: this.evidenceFactory(context, line)(text),
      occurredAtMs: line.occurredAtMs
    });
  }
  platformFromPath(projectDir) {
    if (projectDir === void 0) {
      return void 0;
    }
    if (/^[A-Za-z]:[\\/]/.test(projectDir)) {
      return "win32";
    }
    if (projectDir.startsWith("/Users/")) {
      return "darwin";
    }
    return projectDir.startsWith("/home/") ? "linux" : void 0;
  }
  readEnvironment(context, snapshot) {
    const environment = context.facts.environment;
    environment.platform ??= GuardUtil.asString(snapshot?.platform);
    environment.shell ??= GuardUtil.asString(snapshot?.shell);
  }
  handleCostState(context, line) {
    const costUsd = GuardUtil.asNumber(line.record.totalCostUSD);
    if (costUsd === void 0) {
      return;
    }
    const runStart = String(GuardUtil.asNumber(line.record.startTime) ?? "");
    context.runStartToCostUsd.set(runStart, costUsd);
    const reported = context.facts.reported;
    reported.costUsd = [...context.runStartToCostUsd.values()].reduce((total, runCost) => total + runCost, 0);
    reported.isCostPartial ||= line.record.hasUnknownModelCost === true;
  }
  handleSystemLine(context, line, isMainFile) {
    const subtype = GuardUtil.asString(line.record.subtype);
    if (GuardUtil.isKeyOf(this.systemSubtypeToHandler, subtype)) {
      this.systemSubtypeToHandler[subtype](context, line, isMainFile);
    }
  }
  handleTurnDuration(context, line, isMainFile) {
    const durationMs = GuardUtil.asNumber(line.record.durationMs);
    const isMainTurn = isMainFile && line.record.isSidechain !== true;
    if (isMainTurn && durationMs !== void 0) {
      context.facts.reported.turns.push({
        durationMs,
        endedAtMs: line.occurredAtMs
      });
    }
  }
  handleCompaction(context, line) {
    const metadata = GuardUtil.asRecord(line.record.compactMetadata);
    const rawTrigger = GuardUtil.asString(metadata?.trigger);
    const trigger = GuardUtil.isKeyOf(COMPACTION_TRIGGER_TO_IS_KNOWN, rawTrigger) ? rawTrigger : "auto";
    const contextTokens = GuardUtil.asNumber(metadata?.preTokens);
    const tokensText = contextTokens === void 0 ? "" : ` at ~${Math.round(contextTokens / TOKENS_PER_THOUSAND2)}k tokens`;
    context.facts.compactions.push({
      trigger,
      contextTokens,
      thread: line.thread,
      ref: this.evidenceFactory(context, line)(`${trigger} compaction${tokensText}`),
      occurredAtMs: line.occurredAtMs
    });
  }
  messageText(message) {
    if (typeof message.content === "string") {
      return message.content;
    }
    return GuardUtil.asArray(message.content).map((item) => GuardUtil.asString(GuardUtil.asRecord(item)?.text) ?? "").join("\n");
  }
  handleAttachment(context, line) {
    const attachment = GuardUtil.asRecord(line.record.attachment);
    const attachmentType = GuardUtil.asString(attachment?.type);
    if (attachment && GuardUtil.isKeyOf(this.attachmentTypeToHandler, attachmentType)) {
      this.attachmentTypeToHandler[attachmentType](context, line, attachment);
    }
  }
  handleQueuedCommand(context, line, attachment) {
    const prompt = GuardUtil.asString(attachment.prompt);
    const originKind = GuardUtil.asString(GuardUtil.asRecord(attachment.origin)?.kind) ?? HUMAN_ORIGIN;
    const isHumanPrompt = attachment.commandMode === "prompt" && attachment.isMeta !== true && originKind === HUMAN_ORIGIN;
    if (isHumanPrompt && prompt !== void 0) {
      this.handlePrompt(context, line, prompt);
    }
  }
  isHarnessGenerated(line) {
    const record = line.record;
    const harnessFlags = [record.isMeta, record.isCompactSummary, record.isVisibleInTranscriptOnly];
    if (harnessFlags.some((flag) => flag === true)) {
      return true;
    }
    const originKind = GuardUtil.asString(GuardUtil.asRecord(record.origin)?.kind);
    return originKind !== void 0 && originKind !== HUMAN_ORIGIN;
  }
  handlePrompt(context, line, rawText) {
    const threadId = line.thread.id;
    if (!context.threadIdToFirstPromptHash.has(threadId)) {
      const promptHash = HashUtil.sha(rawText.trim());
      context.threadIdToFirstPromptHash.set(threadId, promptHash);
    }
    if (this.isHarnessGenerated(line) || !SessionUtil.isMainThread(line.thread)) {
      return;
    }
    const { text, command } = ClaudeCodeTranscriptUtil.cleanPrompt(rawText);
    const isEmpty = !text && !command;
    if (isEmpty || ClaudeCodeTranscriptUtil.isCompactionCaveat(text)) {
      return;
    }
    const isInterruption = ClaudeCodeTranscriptUtil.isInterruption(text);
    const hasEarlierPrompt = context.facts.prompts.length > 0;
    context.facts.prompts.push({
      command,
      isInterruption,
      text: RedactUtil.redact(text).slice(0, MAX_PROMPT_CHARS),
      ref: this.evidenceFactory(context, line)(text || `/${command ?? ""}`),
      sentAtMs: line.occurredAtMs,
      isCorrection: !isInterruption && hasEarlierPrompt && NormalizeUtil.isCorrection(text)
    });
  }
  handleToolResult(context, line, block) {
    const toolUseId = GuardUtil.asString(block.tool_use_id);
    const call = toolUseId === void 0 ? void 0 : context.toolUseIdToPendingCall.get(toolUseId);
    if (!call || toolUseId === void 0) {
      return;
    }
    context.toolUseIdToPendingCall.delete(toolUseId);
    const toolUseResult = GuardUtil.asRecord(line.record.toolUseResult);
    const reportedAgentId = GuardUtil.asString(toolUseResult?.agentId);
    if (reportedAgentId) {
      context.delegationCallIdToAgentId.set(call.id, reportedAgentId);
    }
    const text = this.resultText(block.content);
    const wasInterrupted = toolUseResult?.interrupted === true;
    const kind = ClaudeCodeTranscriptUtil.classifyResult(text, {
      wasInterrupted,
      isMarkedError: block.is_error === true,
      denialKind: GuardUtil.asString(line.record.toolDenialKind)
    });
    const isError = kind !== "ok";
    const toEvidence = this.evidenceFactory(context, line);
    call.result = {
      isError,
      kind,
      errorHead: isError ? NormalizeUtil.errorKey(ClaudeCodeTranscriptUtil.errorText(text)) : void 0,
      contentChars: text.length,
      ref: {
        ...toEvidence(this.resultExcerptText(text, kind)),
        thread: call.thread.agentType
      },
      returnedAtMs: line.occurredAtMs
    };
  }
  resultExcerptText(text, kind) {
    return RESULT_KIND_TO_EXCERPT[kind](text);
  }
  readModel(message) {
    const model = GuardUtil.asString(message.model);
    return model === SYNTHETIC_MODEL ? void 0 : model;
  }
  resultText(content) {
    if (typeof content === "string") {
      return content;
    }
    return GuardUtil.asArray(content).map((item) => GuardUtil.asRecord(item)).map((block) => {
      const blockType = GuardUtil.asString(block?.type);
      return block && GuardUtil.isKeyOf(CONTENT_BLOCK_TYPE_TO_TEXT, blockType) ? CONTENT_BLOCK_TYPE_TO_TEXT[blockType](block) : "";
    }).join("\n");
  }
  buildToolCall(block, toolUseId, callContext) {
    const rawName = GuardUtil.asString(block.name) ?? "unknown";
    const name = VALID_TOOL_NAME.test(rawName) ? rawName : MALFORMED_TOOL_NAME;
    const input = GuardUtil.asRecord(block.input) ?? {};
    const description = this.describeToolCall(name, input, callContext.projectDir);
    return {
      ...description,
      id: toolUseId,
      name,
      summary: RedactUtil.excerpt(description.summary, MAX_SUMMARY_CHARS),
      thread: callContext.thread,
      ref: callContext.toEvidence(description.summary),
      calledAtMs: callContext.calledAtMs,
      messageId: callContext.messageId,
      skillInUse: callContext.skillInUse
    };
  }
  describeToolCall(name, input, projectDir) {
    const byName = TOOL_NAME_TO_DESCRIBER.get(name)?.(input);
    return byName ?? this.describeByKind(name, input, projectDir);
  }
  describeByKind(name, input, projectDir) {
    const filePath = GuardUtil.firstString(input, ["file_path", "notebook_path", "path"]);
    const isReadTool = READ_TOOLS.has(name);
    if ((isReadTool || EDIT_TOOLS.has(name)) && filePath !== void 0) {
      const projectRelativePath = this.toProjectRelative(filePath, projectDir);
      return {
        key: name,
        category: isReadTool ? "read" : "edit",
        summary: `${name} ${projectRelativePath}`,
        filePath: projectRelativePath
      };
    }
    const delegatedType = GuardUtil.asString(input.subagent_type);
    const delegatedPrompt = GuardUtil.asString(input.prompt);
    const isDelegation = DELEGATION_TOOLS.has(name) && (delegatedType !== void 0 || delegatedPrompt !== void 0);
    if (isDelegation) {
      const subagentType = delegatedType ?? DEFAULT_SUBAGENT_TYPE;
      return {
        subagentType,
        key: `${name}:${subagentType}`,
        category: "delegation",
        summary: `${subagentType}: ${GuardUtil.asString(input.description) ?? ""}`,
        subagentPromptHash: delegatedPrompt === void 0 ? void 0 : HashUtil.sha(delegatedPrompt.trim())
      };
    }
    if (name.startsWith("mcp__")) {
      const [, server = "unknown", tool = ""] = name.split("__");
      return {
        key: `mcp:${server}`,
        category: "mcp",
        summary: `${server} ${tool}`
      };
    }
    const detail = GuardUtil.firstString(input, ["pattern", "url", "query"]);
    return {
      key: name,
      category: this.categoryOf(name),
      summary: detail === void 0 ? name : `${name} ${detail}`
    };
  }
  categoryOf(name) {
    if (SEARCH_TOOLS.has(name)) {
      return "search";
    }
    return PLAN_TOOLS.has(name) ? "plan" : "other";
  }
  toProjectRelative(filePath, projectDir) {
    const isInsideProject = projectDir !== void 0 && isAbsolute2(filePath) && (filePath === projectDir || filePath.startsWith(`${projectDir}/`));
    return isInsideProject ? relative3(projectDir, filePath) || "." : PathUtil.tildify(filePath);
  }
};

// src/Providers/ClaudeCode/Adapters/ClaudeCodeProviderAdapter.ts
var ClaudeCodeProviderAdapter = class extends BaseProviderAdapter {
  type = "claude-code";
  displayName = "Claude Code";
  paths() {
    return { homeDir: ClaudeCodePathUtil.homeDir() };
  }
  async discoverTranscripts(options) {
    return this.sessionService().discoverTranscripts(options);
  }
  async parseSession(transcript, options) {
    return this.sessionService().parseSession(transcript, options);
  }
  async takeInventory(options) {
    const inventoryService = new ClaudeCodeInventoryService(this.paths().homeDir, ClaudeCodePathUtil.claudeJsonPath());
    return inventoryService.takeInventory(options);
  }
  retentionNote(retentionDays) {
    return `Claude Code deletes transcripts older than ${retentionDays} days at startup. improve-my-harness never changes this setting.`;
  }
  sessionService() {
    return new ClaudeCodeSessionService(this.paths().homeDir);
  }
};

// src/Shared/Modules/ProviderModule.ts
var ProviderModule = class _ProviderModule {
  static DEFAULT_PROVIDER = "claude-code";
  static TYPE_TO_FACTORY = {
    "claude-code": () => new ClaudeCodeProviderAdapter()
  };
  static create(type = _ProviderModule.DEFAULT_PROVIDER) {
    return _ProviderModule.TYPE_TO_FACTORY[type]();
  }
  static isProviderType(value) {
    return Object.hasOwn(_ProviderModule.TYPE_TO_FACTORY, value);
  }
  static types() {
    return Object.keys(_ProviderModule.TYPE_TO_FACTORY);
  }
};

// src/Shared/Services/ConfigService.ts
var CONFIG_FILE = "config.json";
var NUMERIC_CONFIG_KEYS = [
  "idleMinutes",
  "minSessionsCompare",
  "minRelativeChange",
  "minSessionsForUnused",
  "largePieceTokens"
];
var ConfigService = class _ConfigService {
  constructor(store) {
    this.store = store;
  }
  static DEFAULT_CONFIG = {
    idleMinutes: 5,
    modelFamilyToPrice: CostService.DEFAULT_MODEL_FAMILY_TO_PRICE,
    minSessionsCompare: 5,
    minRelativeChange: 0.2,
    minSessionsForUnused: 10,
    largePieceTokens: 2500,
    signalThresholds: {
      minFailures: 3,
      minFailureSessions: 2,
      minRepeatedEvents: 2,
      minReadsPerFile: 3,
      minExtraReads: 2,
      minSubagentRereads: 3,
      minRepeatedRequestSessions: 3,
      minWorkflowSessions: 4,
      minWorkflowRuns: 6,
      minHeavySourceTokens: 5e4,
      minHeavySourceLoads: 3,
      minHugeResultTokens: 2e4,
      minWorkflowSteps: 3,
      repeatedRequestSimilarity: 0.5
    }
  };
  async load() {
    const userConfig = GuardUtil.asRecord(await this.store.readJson(CONFIG_FILE)) ?? {};
    const defaults = _ConfigService.DEFAULT_CONFIG;
    const config = {
      ...defaults,
      modelFamilyToPrice: {
        ...CostService.DEFAULT_MODEL_FAMILY_TO_PRICE,
        ...this.readModelFamilyToPrice(GuardUtil.asRecord(userConfig.modelFamilyToPrice))
      },
      signalThresholds: this.readThresholds(GuardUtil.asRecord(userConfig.signalThresholds))
    };
    for (const key of NUMERIC_CONFIG_KEYS) {
      config[key] = this.readNonNegative(userConfig[key]) ?? defaults[key];
    }
    return config;
  }
  readThresholds(userThresholds) {
    const thresholds = { ..._ConfigService.DEFAULT_CONFIG.signalThresholds };
    for (const key of Object.keys(thresholds)) {
      thresholds[key] = this.readNonNegative(userThresholds?.[key]) ?? thresholds[key];
    }
    return thresholds;
  }
  readModelFamilyToPrice(userPrices) {
    const modelFamilyToPrice = {};
    for (const [family, value] of Object.entries(userPrices ?? {})) {
      const price = GuardUtil.asRecord(value);
      const input = this.readNonNegative(price?.inputUsdPerMillionTokens);
      const output = this.readNonNegative(price?.outputUsdPerMillionTokens);
      if (input === void 0 || output === void 0) {
        continue;
      }
      const modelPrice = {
        inputUsdPerMillionTokens: input,
        outputUsdPerMillionTokens: output,
        cacheReadUsdPerMillionTokens: this.readNonNegative(price?.cacheReadUsdPerMillionTokens),
        cacheWriteUsdPerMillionTokens: this.readNonNegative(price?.cacheWriteUsdPerMillionTokens)
      };
      modelFamilyToPrice[family] = modelPrice;
    }
    return modelFamilyToPrice;
  }
  readNonNegative(value) {
    const number = GuardUtil.asNumber(value);
    return number !== void 0 && number >= 0 ? number : void 0;
  }
};

// src/Shared/Services/SessionLoaderService.ts
import { cpus } from "node:os";

// src/Shared/Services/StoreService.ts
import { mkdir, readFile as readFile6, rename, writeFile } from "node:fs/promises";
import { dirname as dirname2, join as join6 } from "node:path";
var DATA_DIR_NAME = ".imh";
var JSON_INDENT = 2;
var FACTS_CACHE_FILE = "cache/facts.json";
var LATEST_INVENTORY_FILE = "inventory/latest.json";
var SUGGESTIONS_FILE = "suggestions.json";
var StoreService = class _StoreService {
  constructor(root) {
    this.root = root;
  }
  // Why: bump when the parser's output shape changes, so cached facts are re-parsed.
  static FACTS_VERSION = 5;
  static forProject(projectDir, dataDir) {
    return new _StoreService(dataDir ?? join6(projectDir, DATA_DIR_NAME));
  }
  async readJson(relativePath) {
    const text = await readFile6(join6(this.root, relativePath), "utf8").catch(() => void 0);
    return text === void 0 ? void 0 : GuardUtil.parseJson(text);
  }
  async writeJson(relativePath, value, shouldIndent = true) {
    const file = join6(this.root, relativePath);
    await mkdir(dirname2(file), { recursive: true });
    const temporaryFile = `${file}.${process.pid}.tmp`;
    const serialized = JSON.stringify(value, null, shouldIndent ? JSON_INDENT : 0);
    await writeFile(temporaryFile, serialized);
    await rename(temporaryFile, file);
  }
  async loadFactsCache() {
    const cache = await this.readJson(FACTS_CACHE_FILE);
    const isCurrent = cache?.version === _StoreService.FACTS_VERSION;
    return isCurrent ? cache : _StoreService.emptyFactsCache();
  }
  static emptyFactsCache() {
    return {
      version: _StoreService.FACTS_VERSION,
      fileToEntry: {}
    };
  }
  async saveFactsCache(cache) {
    await this.writeJson(FACTS_CACHE_FILE, cache, false);
  }
  async saveInventory(inventory) {
    const previous = await this.readJson(LATEST_INVENTORY_FILE);
    const hasChanged = previous?.fingerprint !== inventory.fingerprint;
    if (hasChanged) {
      const fileSafeTakenAt = inventory.takenAt.replace(/[:.]/g, "-");
      await this.writeJson(`inventory/${fileSafeTakenAt}.json`, inventory);
    }
    await this.writeJson(LATEST_INVENTORY_FILE, inventory);
    return {
      previous,
      hasChanged
    };
  }
  async loadSuggestions() {
    return await this.readJson(SUGGESTIONS_FILE) ?? [];
  }
  async saveSuggestions(suggestions) {
    await this.writeJson(SUGGESTIONS_FILE, suggestions);
  }
};

// src/Shared/Services/SessionLoaderService.ts
var MIN_PARSE_CONCURRENCY = 2;
var MAX_PARSE_CONCURRENCY = 8;
var SessionLoaderService = class {
  constructor(provider, store) {
    this.provider = provider;
    this.store = store;
  }
  async load(options) {
    const transcripts = await this.provider.discoverTranscripts({
      projectDir: options.projectDir,
      shouldReadAllProjects: options.shouldReadAllProjects
    });
    const cache = options.shouldSkipCache ? StoreService.emptyFactsCache() : await this.store.loadFactsCache();
    let parsedCount = 0;
    let cachedCount = 0;
    const concurrency = Math.max(MIN_PARSE_CONCURRENCY, Math.min(MAX_PARSE_CONCURRENCY, cpus().length));
    const allFacts = await CollectionUtil.mapWithConcurrency(transcripts, concurrency, async (transcript) => {
      const signature = this.cacheSignature(transcript, options.idleMs);
      const cached = cache.fileToEntry[transcript.file];
      if (cached?.signature === signature) {
        cachedCount++;
        return cached.facts;
      }
      const facts = await this.provider.parseSession(transcript, {
        idleMs: options.idleMs,
        projectDir: options.projectDir
      });
      parsedCount++;
      cache.fileToEntry[transcript.file] = {
        signature,
        facts
      };
      return facts;
    });
    const liveFiles = new Set(transcripts.map((transcript) => transcript.file));
    for (const file of Object.keys(cache.fileToEntry)) {
      if (!liveFiles.has(file)) {
        cache.fileToEntry[file] = void 0;
      }
    }
    if (!options.shouldSkipCache && parsedCount > 0) {
      await this.store.saveFactsCache(cache);
    }
    const excludedSessionIds = new Set(options.excludedSessionIds ?? []);
    const projectSessions = allFacts.filter((facts, index) => {
      const isExcluded = excludedSessionIds.has(facts.sessionId);
      return !isExcluded && this.belongsToProject(facts, transcripts[index], options);
    });
    const startsAtMs = projectSessions.map((facts) => facts.startedAtMs).filter((startedAtMs) => startedAtMs !== void 0).sort((left, right) => left - right);
    const sessions = projectSessions.filter((facts) => this.isInPeriod(facts, options) && this.hasActivity(facts));
    return {
      sessions,
      parsedCount,
      cachedCount,
      available: {
        count: projectSessions.length,
        oldestAt: TimeUtil.toIso(startsAtMs[0]),
        newestAt: TimeUtil.toIso(startsAtMs.at(-1))
      },
      unparsedLines: sessions.reduce((total, facts) => total + facts.unparsedLines, 0)
    };
  }
  cacheSignature(transcript, idleMs) {
    const subagentSignature = transcript.subagentFiles.map((subagentFile) => `${subagentFile.file}:${subagentFile.modifiedAtMs}:${subagentFile.bytes}`).join("|");
    return `${this.provider.type}:${transcript.modifiedAtMs}:${transcript.bytes}:${idleMs}:${subagentSignature}`;
  }
  belongsToProject(facts, transcript, options) {
    if (options.shouldReadAllProjects || transcript?.isExactProject) {
      return true;
    }
    const sessionDir = facts.projectDir;
    const isInsideProject = sessionDir === options.projectDir || sessionDir?.startsWith(`${options.projectDir}/`) === true;
    return sessionDir !== void 0 && isInsideProject;
  }
  isInPeriod(facts, options) {
    const startedAtMs = facts.startedAtMs ?? 0;
    const endedAtMs = facts.endedAtMs ?? startedAtMs;
    const isBeforePeriod = options.periodStartAtMs !== void 0 && endedAtMs < options.periodStartAtMs;
    const isAfterPeriod = options.periodEndAtMs !== void 0 && startedAtMs > options.periodEndAtMs;
    return !isBeforePeriod && !isAfterPeriod;
  }
  hasActivity(facts) {
    return facts.tools.length > 0 || facts.prompts.length > 0;
  }
};

// src/Shared/Services/ContextService.ts
var ContextService = class _ContextService {
  constructor(projectDir, store, config, provider, options) {
    this.projectDir = projectDir;
    this.store = store;
    this.config = config;
    this.provider = provider;
    this.options = options;
  }
  static async create(options) {
    const projectDir = resolve(options.projectDir ?? process.cwd());
    const store = StoreService.forProject(projectDir, options.dataDir);
    const config = await new ConfigService(store).load();
    return new _ContextService(projectDir, store, config, ProviderModule.create(options.provider), options);
  }
  get idleMs() {
    return this.config.idleMinutes * TimeUtil.MS_PER_MINUTE;
  }
  async takeInventory() {
    return this.provider.takeInventory({
      projectDir: this.projectDir,
      isProjectOnly: this.options.isProjectOnly
    });
  }
  async loadSessions(period = {}) {
    return new SessionLoaderService(this.provider, this.store).load({
      projectDir: this.projectDir,
      shouldReadAllProjects: this.options.shouldReadAllProjects,
      ...period,
      idleMs: this.idleMs,
      shouldSkipCache: this.options.shouldSkipCache,
      excludedSessionIds: this.options.excludedSessionIds
    });
  }
};

// src/Shared/Commands/AnalyzeCommand.ts
var AnalyzeCommand = class {
  async run(options) {
    const context = await ContextService.create(options);
    return new AnalysisService(context).analyze(options);
  }
};

// src/Shared/Commands/CompareCommand.ts
var CompareCommand = class {
  async run(options) {
    const context = await ContextService.create(options);
    const changePoint = await this.findChangePoint(context, options);
    if (!changePoint) {
      throw new Error(`Don't know when ${options.piece} changed. Pass --at <date>.`);
    }
    const loaded = await context.loadSessions({ periodStartAtMs: TimeUtil.parsePointInTime(options.since) });
    return new CompareService(context.config, context.idleMs).compare(
      loaded.sessions,
      options.piece,
      changePoint.changedAtMs,
      changePoint.source
    );
  }
  async findChangePoint(context, options) {
    const explicitAtMs = TimeUtil.parsePointInTime(options.changedAt);
    if (explicitAtMs !== void 0) {
      return {
        changedAtMs: explicitAtMs,
        source: "--at"
      };
    }
    const lastApplied = (await context.store.loadSuggestions()).filter((suggestion) => suggestion.piece === options.piece && suggestion.appliedAt !== void 0).sort((left, right) => (right.appliedAt ?? "").localeCompare(left.appliedAt ?? ""))[0];
    if (lastApplied?.appliedAt) {
      return {
        changedAtMs: Date.parse(lastApplied.appliedAt),
        source: `suggestion ${lastApplied.id} applied`
      };
    }
    const inventory = await context.takeInventory();
    const piece = inventory.pieces.find((candidate) => candidate.id === options.piece);
    if (!piece?.modifiedAt) {
      return void 0;
    }
    return {
      changedAtMs: Date.parse(piece.modifiedAt),
      source: `${piece.path} last changed (${piece.modifiedSource ?? "unknown"})`
    };
  }
};

// src/Shared/Commands/EvidenceCommand.ts
var DEFAULT_MAX_EVIDENCE2 = 50;
var EvidenceCommand = class {
  async run(options) {
    const context = await ContextService.create(options);
    const analysis = await AnalysisService.lastAnalysis(context.store);
    const signal = AnalysisService.signalById(analysis, options.signalId);
    return {
      generatedAt: analysis.generatedAt,
      ...signal,
      evidence: signal.evidence.slice(0, options.maxEvidence ?? DEFAULT_MAX_EVIDENCE2)
    };
  }
};

// src/Shared/Commands/InventoryCommand.ts
var InventoryCommand = class {
  async run(options) {
    const context = await ContextService.create(options);
    const inventory = await context.takeInventory();
    const { previous, hasChanged } = await context.store.saveInventory(inventory);
    return {
      project: context.projectDir,
      fingerprint: inventory.fingerprint,
      hasChangedSinceLastSnapshot: hasChanged,
      changes: InventoryService.diff(previous, inventory),
      retention: inventory.retention,
      pieces: inventory.pieces.map((piece) => InventoryService.compactPiece(piece)),
      notes: inventory.notes
    };
  }
};

// src/Shared/Commands/IssueCommand.ts
var MAX_SIGNAL_ID_CHARS = 120;
var IssueCommand = class {
  async run(options) {
    const context = await ContextService.create(options);
    const analysis = await AnalysisService.lastAnalysis(context.store);
    const signal = AnalysisService.signalById(analysis, options.signalId);
    return IssueLinkUtil.linkOf({
      template: "rule-question",
      title: `[rule] ${signal.type}`,
      fingerprint: IssueLinkUtil.fingerprintOf("rule_question", signal.type),
      // Why: only the signal, its rule and the person's own words go in; never an excerpt from a session (ADR 0010).
      fieldIdToFieldValue: {
        signal: `${signal.type}: ${RedactUtil.excerpt(signal.id, MAX_SIGNAL_ID_CHARS)}`,
        rule: `${signal.cost.method} (${signal.cost.bound})`,
        explanation: options.note,
        versions: IssueLinkUtil.versionsText(analysis.versions)
      }
    });
  }
};

// src/Shared/Commands/StatusCommand.ts
var StatusCommand = class {
  async run(options) {
    const context = await ContextService.create(options);
    const inventory = await context.takeInventory();
    const loaded = await context.loadSessions();
    const suggestions = await context.store.loadSuggestions();
    return {
      version: VersionUtil.VERSION,
      project: context.projectDir,
      provider: context.provider.type,
      node: process.version,
      transcripts: loaded.available,
      retention: inventory.retention,
      pieceKindToCount: CollectionUtil.countBy(inventory.pieces.map((piece) => piece.kind)),
      suggestionStatusToCount: CollectionUtil.countBy(suggestions.map((suggestion) => suggestion.status)),
      dataDir: context.store.root,
      config: context.config
    };
  }
};

// src/Shared/Services/SuggestionCostService.ts
var MAX_ID_CHARS = 120;
var ZERO_COST = {
  activeMs: 0,
  tokens: 0,
  inputTokens: 0,
  outputTokens: 0,
  usd: 0
};
var SuggestionCostService = class _SuggestionCostService {
  idToSignal;
  constructor(signals) {
    this.idToSignal = new Map(signals.map((signal) => [signal.id, signal]));
  }
  static keyOf(occurrence) {
    return `${occurrence.sessionId}:${occurrence.line}`;
  }
  static keysOf(occurrences) {
    return new Set(occurrences.map((occurrence) => _SuggestionCostService.keyOf(occurrence)));
  }
  static figuresOf(cost) {
    return {
      activeMinutes: TimeUtil.msToMinutes(cost.activeMs),
      tokens: cost.tokens,
      inputTokens: cost.inputTokens,
      outputTokens: cost.outputTokens,
      usd: NumberUtil.round(cost.usd)
    };
  }
  static sum(costs) {
    return costs.reduce((total, cost) => ({
      activeMs: total.activeMs + cost.activeMs,
      tokens: total.tokens + cost.tokens,
      inputTokens: total.inputTokens + cost.inputTokens,
      outputTokens: total.outputTokens + cost.outputTokens,
      usd: total.usd + cost.usd
    }), ZERO_COST);
  }
  static coveredBy(costs) {
    const covered = costs.reduce((total, cost) => ({
      activeMinutes: total.activeMinutes + cost.activeMinutes,
      tokens: total.tokens + cost.tokens,
      inputTokens: total.inputTokens + cost.inputTokens,
      outputTokens: total.outputTokens + cost.outputTokens,
      usd: total.usd + cost.usd
    }), _SuggestionCostService.figuresOf(ZERO_COST));
    return {
      ...covered,
      activeMinutes: NumberUtil.round(covered.activeMinutes, 1),
      usd: NumberUtil.round(covered.usd)
    };
  }
  costsOf(suggestions) {
    const occurrenceKeyToPosition = this.claimedOccurrences(suggestions);
    this.checkWholeSignals(suggestions);
    return suggestions.map((suggestion) => this.costOf(suggestion, new Set(occurrenceKeyToPosition.keys())));
  }
  claimedOccurrences(suggestions) {
    const occurrenceKeyToPosition = /* @__PURE__ */ new Map();
    suggestions.forEach((suggestion, suggestionIndex) => {
      const position = suggestionIndex + 1;
      const evidenceKeys = _SuggestionCostService.keysOf(this.evidenceOf(suggestion.signals));
      for (const occurrence of suggestion.occurrences ?? []) {
        const key = _SuggestionCostService.keyOf(occurrence);
        if (!evidenceKeys.has(key)) {
          throw new Error(
            `Suggestion ${position} lists session ${occurrence.sessionId} line ${occurrence.line}, which isn't in the evidence of its signals. Run \`imh evidence <signal-id>\` to see their occurrences.`
          );
        }
        const otherPosition = occurrenceKeyToPosition.get(key);
        if (otherPosition !== void 0 && otherPosition !== position) {
          throw new Error(
            `Session ${occurrence.sessionId} line ${occurrence.line} is in suggestions ${otherPosition} and ${position}. Each occurrence belongs to the one suggestion that would prevent it.`
          );
        }
        occurrenceKeyToPosition.set(key, position);
      }
    });
    return occurrenceKeyToPosition;
  }
  checkWholeSignals(suggestions) {
    const signalIdToPosition = /* @__PURE__ */ new Map();
    suggestions.forEach((suggestion, suggestionIndex) => {
      const position = suggestionIndex + 1;
      for (const signalId of this.wholeSignalsOf(suggestion)) {
        const otherPosition = signalIdToPosition.get(signalId);
        if (otherPosition !== void 0) {
          const shownId = RedactUtil.excerpt(signalId, MAX_ID_CHARS);
          throw new Error(
            `Suggestions ${otherPosition} and ${position} both take all of ${shownId}. List the occurrences each one covers ("occurrences": [{"sessionId", "line"}], from \`imh evidence ${shownId}\`).`
          );
        }
        signalIdToPosition.set(signalId, position);
      }
    });
  }
  wholeSignalsOf(suggestion) {
    const listedKeys = _SuggestionCostService.keysOf(suggestion.occurrences ?? []);
    return suggestion.signals.filter((signalId) => {
      const evidence = this.idToSignal.get(signalId)?.evidence ?? [];
      return !evidence.some((item) => listedKeys.has(_SuggestionCostService.keyOf(item)));
    });
  }
  costOf(suggestion, claimedKeys) {
    const listedKeys = _SuggestionCostService.keysOf(suggestion.occurrences ?? []);
    const parts = [];
    const partialReasons = [];
    for (const signalId of suggestion.signals) {
      const signal = this.idToSignal.get(signalId);
      if (!signal) {
        partialReasons.push(`signal not in the last analysis: ${RedactUtil.excerpt(signalId, MAX_ID_CHARS)}`);
        continue;
      }
      const listed = signal.evidence.filter((item) => listedKeys.has(_SuggestionCostService.keyOf(item)));
      parts.push(listed.length ? _SuggestionCostService.listedPart(signal, listed) : this.remainderPart(signal, claimedKeys));
    }
    const bounds = CollectionUtil.unique(parts.map((part) => part.bound));
    const total = _SuggestionCostService.sum(parts.map((part) => part.cost));
    return {
      ..._SuggestionCostService.figuresOf(total),
      partialReasons,
      bound: bounds.length === 1 ? bounds[0] ?? "estimate" : "estimate",
      occurrences: parts.reduce((count, part) => count + part.occurrences, 0),
      isPartial: partialReasons.length > 0
    };
  }
  static listedPart(signal, listed) {
    return {
      cost: _SuggestionCostService.sum(listed.map((item) => item.cost)),
      occurrences: listed.length,
      bound: signal.cost.bound
    };
  }
  remainderPart(signal, claimedKeys) {
    const claimed = signal.evidence.filter((item) => claimedKeys.has(_SuggestionCostService.keyOf(item)));
    const claimedCost = _SuggestionCostService.sum(claimed.map((item) => item.cost));
    const signalCost = {
      activeMs: signal.cost.activeMinutes * TimeUtil.MS_PER_MINUTE,
      tokens: signal.cost.tokens,
      inputTokens: signal.cost.inputTokens,
      outputTokens: signal.cost.outputTokens,
      usd: signal.cost.usd
    };
    return {
      cost: {
        activeMs: Math.max(0, signalCost.activeMs - claimedCost.activeMs),
        tokens: Math.max(0, signalCost.tokens - claimedCost.tokens),
        inputTokens: Math.max(0, signalCost.inputTokens - claimedCost.inputTokens),
        outputTokens: Math.max(0, signalCost.outputTokens - claimedCost.outputTokens),
        usd: Math.max(0, signalCost.usd - claimedCost.usd)
      },
      occurrences: signal.occurrences - claimed.length,
      bound: signal.cost.bound
    };
  }
  evidenceOf(signalIds) {
    return signalIds.flatMap((signalId) => this.idToSignal.get(signalId)?.evidence ?? []);
  }
};

// src/Shared/Services/SuggestionService.ts
var SUGGESTION_ID_HASH_CHARS = 8;
var MAX_TITLE_CHARS = 200;
var MAX_CHANGE_CHARS = 2e3;
var MAX_NOTE_CHARS = 500;
var SuggestionService = class _SuggestionService {
  constructor(store) {
    this.store = store;
  }
  static FINDING_CLASSES = [
    "rule_ignored",
    "partial_instruction",
    "missing_instruction",
    "structure_change",
    "out_of_scope",
    "already_handled"
  ];
  static STATUSES = ["pending", "accepted", "rejected", "applied"];
  static STATUS_TO_RECORD = {
    applied: (suggestion, appliedFingerprint) => {
      suggestion.appliedAt = suggestion.updatedAt;
      suggestion.appliedFingerprint = appliedFingerprint;
    },
    pending: () => void 0,
    accepted: () => void 0,
    rejected: () => void 0
  };
  static idOf(suggestion) {
    const sortedSignals = suggestion.signals.toSorted(CollectionUtil.compareCodeUnits).join("|");
    const occurrenceKeys = (suggestion.occurrences ?? []).map((occurrence) => `${occurrence.sessionId}:${occurrence.line}`);
    const sortedOccurrences = occurrenceKeys.toSorted(CollectionUtil.compareCodeUnits).join("|");
    const occurrencePart = sortedOccurrences ? `#${sortedOccurrences}` : "";
    const identity = `${sortedSignals}@${suggestion.piece ?? ""}${occurrencePart}`;
    return `sug-${HashUtil.sha(identity, SUGGESTION_ID_HASH_CHARS)}`;
  }
  static isStatus(value) {
    return _SuggestionService.STATUSES.includes(value);
  }
  static isFindingClass(value) {
    return _SuggestionService.FINDING_CLASSES.includes(value);
  }
  static parse(value) {
    const items = Array.isArray(value) ? value : [value];
    return items.map((item, itemIndex) => {
      const record = GuardUtil.asRecord(item);
      const title = GuardUtil.asString(record?.title);
      const findingClass = GuardUtil.asString(record?.class);
      const signals = GuardUtil.asArray(record?.signals).map((signalId) => GuardUtil.asString(signalId)).filter((signalId) => signalId !== void 0);
      const status = GuardUtil.asString(record?.status);
      const position = itemIndex + 1;
      if (!title || !signals.length || findingClass === void 0 || !_SuggestionService.isFindingClass(findingClass)) {
        throw new Error(
          `Suggestion ${position} needs a title, at least one signal id, and a class (${_SuggestionService.FINDING_CLASSES.join(", ")}).`
        );
      }
      if (status !== void 0 && !_SuggestionService.isStatus(status)) {
        const validStatuses = _SuggestionService.STATUSES.join(", ");
        throw new Error(`Suggestion ${position} has an invalid status. Use one of: ${validStatuses}.`);
      }
      return {
        title,
        signals,
        status,
        occurrences: _SuggestionService.parseOccurrences(record?.occurrences, position),
        class: findingClass,
        piece: GuardUtil.asString(record?.piece),
        change: GuardUtil.asString(record?.change),
        note: GuardUtil.asString(record?.note)
      };
    });
  }
  static parseOccurrences(value, position) {
    if (value === void 0) {
      return void 0;
    }
    return GuardUtil.asArray(value).map((item) => {
      const record = GuardUtil.asRecord(item);
      const sessionId = GuardUtil.asString(record?.sessionId);
      const line = GuardUtil.asNumber(record?.line);
      if (sessionId === void 0 || line === void 0) {
        throw new Error(`Suggestion ${position} has an occurrence without a "sessionId" and a "line".`);
      }
      return {
        sessionId,
        line
      };
    });
  }
  async list(status) {
    const suggestions = await this.store.loadSuggestions();
    return status ? suggestions.filter((suggestion) => suggestion.status === status) : suggestions;
  }
  async add(newSuggestions, costs = []) {
    const suggestions = await this.store.loadSuggestions();
    const createdAt = (/* @__PURE__ */ new Date()).toISOString();
    const result = {
      added: [],
      existing: [],
      total: 0,
      suggestionIdToSuggestionCost: {}
    };
    for (const [itemIndex, newSuggestion] of newSuggestions.entries()) {
      const id = _SuggestionService.idOf(newSuggestion);
      const cost = costs[itemIndex];
      if (cost) {
        result.suggestionIdToSuggestionCost[id] = cost;
      }
      const existing = suggestions.find((suggestion) => suggestion.id === id);
      if (existing) {
        result.existing.push({
          id,
          status: existing.status
        });
        continue;
      }
      suggestions.push({
        id,
        createdAt,
        cost,
        title: newSuggestion.title.slice(0, MAX_TITLE_CHARS),
        class: newSuggestion.class,
        piece: newSuggestion.piece,
        signals: newSuggestion.signals,
        occurrences: newSuggestion.occurrences,
        status: newSuggestion.status ?? "pending",
        updatedAt: createdAt,
        change: newSuggestion.change?.slice(0, MAX_CHANGE_CHARS),
        note: newSuggestion.note?.slice(0, MAX_NOTE_CHARS)
      });
      result.added.push(id);
    }
    await this.store.saveSuggestions(suggestions);
    result.total = suggestions.length;
    return result;
  }
  async setStatus(id, status, note, appliedFingerprint) {
    const suggestions = await this.store.loadSuggestions();
    const suggestion = suggestions.find((candidate) => candidate.id === id);
    if (!suggestion) {
      throw new Error(`Suggestion not found: ${id}`);
    }
    suggestion.status = status;
    suggestion.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    if (note) {
      suggestion.note = note.slice(0, MAX_NOTE_CHARS);
    }
    _SuggestionService.STATUS_TO_RECORD[status](suggestion, appliedFingerprint);
    await this.store.saveSuggestions(suggestions);
    return suggestion;
  }
};

// src/Shared/Commands/SuggestionsCommand.ts
var noFingerprint = () => Promise.resolve(void 0);
var STATUS_TO_FINGERPRINT = {
  applied: async (context) => {
    const inventory = await context.takeInventory();
    await context.store.saveInventory(inventory);
    return inventory.fingerprint;
  },
  pending: noFingerprint,
  accepted: noFingerprint,
  rejected: noFingerprint
};
var SuggestionsCommand = class {
  async list(options) {
    const context = await ContextService.create(options);
    return new SuggestionService(context.store).list(options.status);
  }
  async add(options) {
    const newSuggestions = SuggestionService.parse(options.items);
    const context = await ContextService.create(options);
    const analysis = await context.store.readJson(AnalysisService.LAST_ANALYSIS_FILE);
    const costs = analysis ? new SuggestionCostService(analysis.signals).costsOf(newSuggestions) : [];
    const result = await new SuggestionService(context.store).add(newSuggestions, costs);
    return costs.length ? {
      ...result,
      covered: SuggestionCostService.coveredBy(costs)
    } : result;
  }
  async setStatus(options) {
    const context = await ContextService.create(options);
    const appliedFingerprint = await STATUS_TO_FINGERPRINT[options.status](context);
    return new SuggestionService(context.store).setStatus(options.id, options.status, options.note, appliedFingerprint);
  }
};

// src/Shared/Modules/CLIModule.ts
var MIN_NODE_MAJOR = 20;
var JSON_INDENT2 = 2;
var ARGUMENT_SPEC = {
  "project": { type: "string" },
  "provider": { type: "string" },
  "since": { type: "string" },
  "until": { type: "string" },
  "piece": { type: "string", multiple: true },
  "at": { type: "string" },
  "status": { type: "string" },
  "note": { type: "string" },
  "file": { type: "string" },
  "max": { type: "string" },
  "max-signals": { type: "string" },
  "max-evidence": { type: "string" },
  "data-dir": { type: "string" },
  "project-only": { type: "boolean" },
  "all-projects": { type: "boolean" },
  "no-cache": { type: "boolean" },
  "exclude-session": { type: "string", multiple: true },
  "pretty": { type: "boolean" },
  "help": { type: "boolean", short: "h" },
  "version": { type: "boolean", short: "v" }
};
var CLIModule = class _CLIModule {
  suggestionsSubcommandToHandler = {
    list: async (invocation) => this.listSuggestions(invocation),
    add: async (invocation) => this.addSuggestions(invocation),
    set: async (invocation) => this.setSuggestionStatus(invocation)
  };
  commandNameToHandler = {
    analyze: async ({ values, common }) => new AnalyzeCommand().run({
      ...common,
      since: values.since,
      until: values.until,
      focusPieces: values.piece,
      maxSignals: this.readCount(values["max-signals"], "--max-signals"),
      maxEvidence: this.readCount(values["max-evidence"], "--max-evidence")
    }),
    inventory: async ({ common }) => new InventoryCommand().run(common),
    evidence: async ({ values, rest, common }) => {
      const [signalId] = rest;
      if (!signalId) {
        throw new Error("Usage: imh evidence <signal-id>");
      }
      return new EvidenceCommand().run({
        ...common,
        signalId,
        maxEvidence: this.readCount(values.max, "--max")
      });
    },
    compare: async ({ values, common }) => {
      const piece = values.piece?.[0];
      if (!piece) {
        throw new Error("Usage: imh compare --piece <id> [--at <date>]");
      }
      return new CompareCommand().run({
        ...common,
        piece,
        changedAt: values.at,
        since: values.since
      });
    },
    status: async ({ common }) => new StatusCommand().run(common),
    suggestions: async (invocation) => this.runSuggestions(invocation),
    issue: async ({ values, rest, common }) => {
      const [signalId] = rest;
      if (!signalId || !values.note) {
        throw new Error('Usage: imh issue <signal-id> --note "why the rule looks wrong"');
      }
      return new IssueCommand().run({
        ...common,
        signalId,
        note: values.note
      });
    }
  };
  static parseArguments(argv) {
    return parseArgs({
      args: argv,
      allowPositionals: true,
      options: ARGUMENT_SPEC
    });
  }
  run(argv) {
    this.main(argv).then(
      () => {
        process.exitCode = 0;
      },
      (error) => {
        process.stderr.write(`imh: ${error instanceof Error ? error.message : String(error)}
`);
        process.exitCode = 1;
      }
    );
  }
  help() {
    return `imh ${VersionUtil.VERSION} \u2014 improve-my-harness analysis script

Usage: imh <command> [options]

Commands
  analyze                 Map the harness, read session transcripts and extract signals
  inventory               Snapshot the active harness (saved to .imh/inventory/ when it changes)
  evidence <signal-id>    All evidence for one signal from the last analysis
  compare --piece <id>    Before/after metrics for one piece (e.g. agent:code-reviewer)
  suggestions list        List suggestions [--status pending|accepted|rejected|applied]
  suggestions add         Add suggestions from --file <json> or stdin (array of objects)
  suggestions set <id> <status> [--note text]
  status                  Transcripts available, retention, pieces and config
  issue <signal-id> --note <text>
                          A prefilled GitHub issue questioning the rule behind a signal (nothing is sent)

Options
  --project <dir>         Project directory (default: current directory)
  --provider <type>       Agentic tool whose sessions to read: ${ProviderModule.types().join(", ")} (default: ${ProviderModule.DEFAULT_PROVIDER})
  --since <period|date>   e.g. 14d, 2w, 2026-09-01
  --until <period|date>
  --piece <id>            Focus on a piece (repeatable)
  --at <date>             compare: when the piece changed (default: applied suggestion or last change)
  --project-only          Ignore user-level and plugin pieces
  --all-projects          Read transcripts from every project
  --max-signals <n>       analyze: signals in stdout (default 25)
  --max-evidence <n>      analyze: evidence per signal in stdout (default 5)
  --max <n>               evidence: evidence items (default 50)
  --data-dir <dir>        Where state lives (default: <project>/.imh)
  --exclude-session <id>  Leave a session out, e.g. the one running the analysis (repeatable)
  --no-cache              Re-parse every transcript
  --pretty                Indented JSON

Output is JSON on stdout. Nothing leaves your machine.`;
  }
  async main(argv) {
    const { values, positionals } = _CLIModule.parseArguments(argv);
    if (values.version) {
      process.stdout.write(`${VersionUtil.VERSION}
`);
      return;
    }
    const [commandName, ...rest] = positionals;
    if (values.help || !commandName || commandName === "help") {
      process.stdout.write(`${this.help()}
`);
      return;
    }
    const nodeMajor = Number(process.versions.node.split(".")[0]);
    if (nodeMajor < MIN_NODE_MAJOR) {
      throw new Error(`Node.js ${MIN_NODE_MAJOR}+ is required (found ${process.version}).`);
    }
    if (!GuardUtil.isKeyOf(this.commandNameToHandler, commandName)) {
      throw new Error(`Unknown command: ${commandName}. Run \`imh --help\`.`);
    }
    const result = await this.commandNameToHandler[commandName]({
      values,
      rest,
      common: {
        projectDir: values.project,
        dataDir: values["data-dir"],
        provider: this.readProvider(values.provider),
        isProjectOnly: values["project-only"],
        shouldReadAllProjects: values["all-projects"],
        shouldSkipCache: values["no-cache"],
        excludedSessionIds: values["exclude-session"]
      }
    });
    process.stdout.write(`${JSON.stringify(result, null, values.pretty ? JSON_INDENT2 : 0)}
`);
  }
  async runSuggestions(invocation) {
    const [subcommand = "list"] = invocation.rest;
    if (!GuardUtil.isKeyOf(this.suggestionsSubcommandToHandler, subcommand)) {
      throw new Error(`Unknown suggestions command: ${subcommand}`);
    }
    return this.suggestionsSubcommandToHandler[subcommand](invocation);
  }
  async listSuggestions({ values, common }) {
    const statusFilter = values.status;
    if (statusFilter !== void 0 && !SuggestionService.isStatus(statusFilter)) {
      throw new Error(`Unknown status: ${statusFilter}`);
    }
    return new SuggestionsCommand().list({
      ...common,
      status: statusFilter
    });
  }
  async addSuggestions({ values, common }) {
    const rawJson = values.file ? await readFile7(values.file, "utf8") : await this.readStdin();
    const items = GuardUtil.parseJson(rawJson);
    if (items === void 0) {
      throw new Error("Suggestions must be valid JSON.");
    }
    return new SuggestionsCommand().add({
      ...common,
      items
    });
  }
  async setSuggestionStatus({ values, rest, common }) {
    const [, id, status] = rest;
    if (!id || !status || !SuggestionService.isStatus(status)) {
      throw new Error("Usage: imh suggestions set <id> <pending|accepted|rejected|applied> [--note text]");
    }
    return new SuggestionsCommand().setStatus({
      ...common,
      id,
      status,
      note: values.note
    });
  }
  readProvider(value) {
    if (value === void 0) {
      return void 0;
    }
    if (!ProviderModule.isProviderType(value)) {
      throw new Error(`Unknown provider: ${value}. Use one of: ${ProviderModule.types().join(", ")}.`);
    }
    return value;
  }
  readCount(value, flag) {
    if (value === void 0) {
      return void 0;
    }
    const count = Number(value);
    if (!Number.isInteger(count) || count < 0) {
      throw new Error(`${flag} must be a non-negative integer.`);
    }
    return count;
  }
  async readStdin() {
    if (process.stdin.isTTY) {
      throw new Error("Pass --file <json> or pipe JSON on stdin.");
    }
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString("utf8");
  }
};

// src/index.ts
var FIRST_ARGUMENT_INDEX = 2;
new CLIModule().run(process.argv.slice(FIRST_ARGUMENT_INDEX));
