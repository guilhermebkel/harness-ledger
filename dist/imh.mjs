#!/usr/bin/env node
// improve-my-harness — generated file, edit src/ and run `pnpm build`.

// src/Shared/Modules/CLIModule.ts
import { readFile as readFile5 } from "node:fs/promises";
import { parseArgs } from "node:util";

// src/Shared/Utils/CollectionUtil.ts
var CollectionUtil = class {
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
  /** Appends to the list under `key`, creating it on first use. */
  static pushTo(keyToItems, key, item) {
    const items = keyToItems.get(key) ?? [];
    items.push(item);
    keyToItems.set(key, items);
  }
  /** Runs async work over items with a concurrency limit, keeping the input order in the results. */
  static async mapWithConcurrency(items, concurrency, work) {
    const results = new Array(items.length);
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

// src/Shared/Utils/NumberUtil.ts
var DECIMAL_BASE = 10;
var CHARS_PER_TOKEN = 4;
var NumberUtil = class {
  static round(value, digits = 2) {
    const factor = DECIMAL_BASE ** digits;
    return Math.round(value * factor) / factor;
  }
  /** A rough token estimate from text length, good enough to compare sizes. */
  static approxTokens(text) {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }
  static charsToTokens(chars) {
    return Math.round(chars / CHARS_PER_TOKEN);
  }
};

// src/Shared/Utils/RedactUtil.ts
var MASK = "[REDACTED]";
var DEFAULT_EXCERPT_CHARS = 200;
var SECRET_PATTERNS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, MASK],
  [/\bsk-(?:ant-|proj-|live-|test-)?[A-Za-z0-9_-]{16,}/g, MASK],
  [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g, MASK],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, MASK],
  [/\bglpat-[A-Za-z0-9_-]{16,}/g, MASK],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/g, MASK],
  [/\bAKIA[0-9A-Z]{16}\b/g, MASK],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, MASK],
  [/\b(?:rk|pk|sk)_(?:live|test)_[A-Za-z0-9]{16,}/g, MASK],
  [/\bnpm_[A-Za-z0-9]{30,}/g, MASK],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, MASK],
  [/\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{12,}/gi, `$1 ${MASK}`],
  [/([a-z][a-z0-9+.-]*:\/\/)[^\s:/@]+:[^\s@/]+@/gi, `$1${MASK}@`]
];
var SENSITIVE_ASSIGNMENT = /((?:["']?)[A-Za-z0-9_.-]*(?:pass(?:word|wd)?|secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|credential|auth)[A-Za-z0-9_.-]*["']?\s*[:=]\s*)(["']?)([^\s"',;&]{4,})\2/gi;
var RedactUtil = class _RedactUtil {
  static redact(text) {
    if (!text) {
      return text;
    }
    let redacted = text;
    for (const [pattern, replacement] of SECRET_PATTERNS) {
      redacted = redacted.replace(pattern, replacement);
    }
    return redacted.replace(
      SENSITIVE_ASSIGNMENT,
      (_match, keyPart, quote) => `${keyPart}${quote}${MASK}${quote}`
    );
  }
  /** Redacts and collapses to a single line of at most `maxChars`. */
  static excerpt(text, maxChars = DEFAULT_EXCERPT_CHARS) {
    const oneLine = _RedactUtil.redact(text).replace(/\s+/g, " ").trim();
    return oneLine.length > maxChars ? `${oneLine.slice(0, maxChars - 1)}\u2026` : oneLine;
  }
};

// src/Shared/Utils/SessionUtil.ts
var SessionUtil = class _SessionUtil {
  /** Thread id (and agent type) of a session's main thread. */
  static MAIN_THREAD_ID = "main";
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
    m: DAYS_PER_MONTH * _TimeUtil.MS_PER_DAY
  };
  /**
   * Turns "14d", "2w", "6h", "3m" (months) or an ISO date into an epoch-ms point in time.
   * A relative period is counted back from `nowAtMs`.
   */
  static parsePointInTime(value, nowAtMs = Date.now()) {
    if (!value) {
      return void 0;
    }
    const relative3 = /^(\d+)\s*([hdwm])$/i.exec(value.trim());
    if (relative3) {
      const amount = Number(relative3[1]);
      const unit = (relative3[2] ?? "d").toLowerCase();
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
  /** Sum of the gaps between consecutive events, skipping gaps longer than `idleMs` (the person was away). */
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
var TokenUsageUtil = class {
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
  static total(usage) {
    return usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
  }
};

// src/Shared/Utils/VersionUtil.ts
var VersionUtil = class {
  /** Replaced by the package version at build time; "dev" when running from source. */
  static VERSION = true ? "0.1.0" : "dev";
};

// src/Shared/Services/AttributionService.ts
var UNKNOWN_SUBAGENT_TYPE = "subagent";
var AttributionService = class _AttributionService {
  /** `pieceIds` are the inventory ids; with none, every name is taken as is. */
  constructor(pieceIds) {
    this.pieceIds = pieceIds;
  }
  /** Attribution for steps no skill, command or subagent was driving. */
  static MAIN_PIECE = "main";
  /** Marks agents that aren't in the inventory (built-in ones like general-purpose or Explore). */
  static BUILT_IN_SUFFIX = " (built-in)";
  static UNRESOLVED_SUBAGENT_PIECE = `agent:${UNKNOWN_SUBAGENT_TYPE}`;
  static withoutBuiltInSuffix(pieceId) {
    const suffix = _AttributionService.BUILT_IN_SUFFIX;
    return pieceId.endsWith(suffix) ? pieceId.slice(0, -suffix.length) : pieceId;
  }
  /** Signals may mark a piece as built-in ("agent:Explore (built-in)"); it's still the same piece. */
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
      if (!SessionUtil.isMainThread(call.thread)) {
        index.toolCallIdToPieces.set(call.id, [this.pieceIdFor("agent", call.thread.agentType)]);
      } else if (call.ref.file === session.file) {
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
  /** The inventory id for a piece seen in a transcript; agents missing from the inventory are marked built-in. */
  pieceIdFor(kind, name) {
    const pieceId = `${kind}:${name}`;
    const isKnown = this.pieceIds.has(pieceId) || this.pieceIds.size === 0;
    const isBuiltInAgent = !isKnown && kind === "agent" && name !== UNKNOWN_SUBAGENT_TYPE;
    return isBuiltInAgent ? `${pieceId}${_AttributionService.BUILT_IN_SUFFIX}` : pieceId;
  }
  /** A slash command runs either a skill or a command file; prefer the skill when both exist. */
  commandPieceId(name) {
    return this.pieceIds.has(`skill:${name}`) ? `skill:${name}` : `command:${name}`;
  }
  attributeMainThread(mainEvents, index) {
    let currentTurnPieces = [];
    let lastTurnPieces = [];
    for (const event of mainEvents) {
      if (event.prompt) {
        const previousPieces = lastTurnPieces.length ? lastTurnPieces : [_AttributionService.MAIN_PIECE];
        index.promptToPreviousTurnPieces.set(event.prompt, previousPieces);
        currentTurnPieces = event.prompt.command ? [this.commandPieceId(event.prompt.command)] : [];
        lastTurnPieces = currentTurnPieces;
        continue;
      }
      const call = event.call;
      if (!call) {
        continue;
      }
      if (call.skill) {
        currentTurnPieces = CollectionUtil.unique([...currentTurnPieces, this.pieceIdFor("skill", call.skill)]);
        lastTurnPieces = currentTurnPieces;
      }
      if (call.subagentType) {
        lastTurnPieces = CollectionUtil.unique([...currentTurnPieces, this.pieceIdFor("agent", call.subagentType)]);
      }
      const callPieces = currentTurnPieces.length ? currentTurnPieces : [_AttributionService.MAIN_PIECE];
      index.toolCallIdToPieces.set(call.id, callPieces);
    }
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
  constructor(prices) {
    this.prices = prices;
  }
  /** List prices that may be outdated; override them in .imh/config.json. */
  static DEFAULT_PRICES = {
    opus: {
      input: 5,
      output: 25
    },
    sonnet: {
      input: 3,
      output: 15
    },
    haiku: {
      input: 1,
      output: 5
    },
    [DEFAULT_FAMILY]: {
      input: 3,
      output: 15
    }
  };
  /**
   * The price-table key for a model: a listed family it contains, "default" for an unnamed model or an
   * unlisted Claude model, and undefined for anything else, which is left unpriced rather than guessed.
   * Add a key to `prices` in .imh/config.json (e.g. "glm") to price other models.
   */
  modelFamily(model) {
    const normalizedModel = model?.toLowerCase();
    if (!normalizedModel) {
      return DEFAULT_FAMILY;
    }
    const family = Object.keys(this.prices).find((key) => key !== DEFAULT_FAMILY && normalizedModel.includes(key));
    if (family) {
      return family;
    }
    return normalizedModel.includes(DEFAULT_PRICED_VENDOR) ? DEFAULT_FAMILY : void 0;
  }
  isPriced(model) {
    return this.modelFamily(model) !== void 0;
  }
  /** 0 for an unpriced model; callers report those models so the gap is visible. */
  costUsd(usage, model) {
    const family = this.modelFamily(model);
    if (family === void 0) {
      return 0;
    }
    const price = this.prices[family] ?? this.prices[DEFAULT_FAMILY] ?? _CostService.DEFAULT_PRICES[DEFAULT_FAMILY];
    if (!price) {
      return 0;
    }
    const cacheReadPrice = price.cacheRead ?? price.input * CACHE_READ_INPUT_RATIO;
    const cacheWritePrice = price.cacheWrite ?? price.input * CACHE_WRITE_INPUT_RATIO;
    const weightedTokens = usage.input * price.input + usage.output * price.output + usage.cacheRead * cacheReadPrice + usage.cacheWrite * cacheWritePrice;
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
      counters: {},
      details: {}
    };
    group.occurrences.push(occurrence);
    this.idToGroup.set(id, group);
    return group;
  }
  /** Counts a value (an error, a recovery command, a file) seen with an occurrence of the group. */
  count(group, detail, value) {
    const valueToCount = group.counters[detail] ?? /* @__PURE__ */ new Map();
    valueToCount.set(value, (valueToCount.get(value) ?? 0) + 1);
    group.counters[detail] = valueToCount;
  }
  groups() {
    return [...this.idToGroup.values()];
  }
};

// src/Shared/Utils/HashUtil.ts
import { createHash } from "node:crypto";
var DEFAULT_HASH_CHARS = 12;
var HashUtil = class {
  /** A short sha256, enough to detect changes and build stable ids. */
  static sha(text, length = DEFAULT_HASH_CHARS) {
    return createHash("sha256").update(text).digest("hex").slice(0, length);
  }
};

// src/Shared/Utils/NormalizeUtil.ts
var COMMAND_WRAPPERS = /* @__PURE__ */ new Set(["sudo", "time", "nohup", "env", "command", "exec", "timeout"]);
var NAVIGATION_COMMAND = /^(cd|pushd|popd|export|source|\.|set)\b/;
var ENV_ASSIGNMENT = /^[A-Z_][A-Z0-9_]*=/;
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
var MAX_ERROR_KEY_CHARS = 160;
var ERROR_LOOKING_LINE = /error|fail|denied|not found|no such|invalid|cannot|can't|unable|exception|refused|timed? ?out|"reason"/i;
var CORRECTION_PREFIX_CHARS = 80;
var CORRECTION_START = /^(no|nope|não|nao|wrong|errado|actually|na verdade|instead|ao invés|em vez|stop|pare|para de|don'?t|do not|não faça|nao faca|that'?s not|isso não|isso nao|you should|you shouldn'?t|você deveria|voce deveria|why did you|por que você|por que voce|undo|revert|desfaz|desfaça|again|de novo|still (?:not|wrong|failing)|ainda (?:não|nao|está|esta))\b/i;
var MIN_WORD_CHARS = 3;
var STOPWORDS = new Set(
  "the and for with that this from you your are was were can could would should please into have has had not but all any some what when where which who how why its it's our out then than them they there here tamb\xE9m para com que uma umas uns dos das por pelo pela isso isto esse essa este esta voc\xEA voce seu sua nos nas n\xE3o nao mais muito pode poderia favor ser ter tem foi vai fazer faz como quando onde qual quais".split(" ")
);
var NormalizeUtil = class _NormalizeUtil {
  /**
   * A short grouping key for a shell command, e.g.
   * `cd app && CI=1 npm run test -- --watch=false` → `npm run test`.
   */
  static commandKey(command) {
    const segments = command.split(/&&|\|\||;|\n/).map((segment) => segment.trim()).filter(Boolean);
    const mainSegment = segments.find((segment) => !NAVIGATION_COMMAND.test(segment)) ?? segments[0] ?? command;
    const firstPipelineStage = mainSegment.split(/\s\|\s?/)[0] ?? mainSegment;
    const tokens = firstPipelineStage.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
    const programIndex = tokens.findIndex((token) => !ENV_ASSIGNMENT.test(token) && !COMMAND_WRAPPERS.has(token));
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
      if (subcommand && (_NormalizeUtil.isPlainWord(subcommand) || subcommand === "-m")) {
        keyParts.push(subcommand);
        if (RUNNER_SUBCOMMANDS.has(subcommand) && target && _NormalizeUtil.isPlainWord(target)) {
          keyParts.push(target);
        }
      }
    }
    return RedactUtil.redact(keyParts.join(" "));
  }
  /** The first meaningful line of an error, normalized so the same error groups across sessions. */
  static errorKey(text) {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !/^exit code \d+$/i.test(line) && !/^<\/?[\w-]+\s*\/?>$/.test(line));
    const nonWarningLines = lines.filter((line) => !WARNING_LINE.test(line));
    const errorLine = _NormalizeUtil.pythonException(lines) ?? nonWarningLines.slice(0, ERROR_LINES_TO_SCAN).find((line) => ERROR_LOOKING_LINE.test(line));
    const head = errorLine ?? nonWarningLines[0] ?? lines[0] ?? text.trim();
    const structuredReason = /"reason"\s*:\s*"([^"]{1,60})"/.exec(head)?.[1];
    const errorText = structuredReason ? `reason: ${structuredReason}` : head;
    return RedactUtil.redact(errorText).replace(/(["'`]).{1,200}?\1/g, "'\u2026'").replace(/(?:[A-Za-z]:)?[~.]?\/[\w@.+-]+(?:\/[\w@.+-]+)*/g, "<path>").replace(/\b\d+(\.\d+)*\b/g, "N").replace(/\s+/g, " ").slice(0, MAX_ERROR_KEY_CHARS).trim();
  }
  /** Heuristic (English and Portuguese): the message opens by pushing back on what the agent did. */
  static isCorrection(text) {
    return CORRECTION_START.test(text.trim().slice(0, CORRECTION_PREFIX_CHARS));
  }
  /** The set of meaningful words in a prompt, used to cluster repeated requests. */
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
  /** A Python traceback ends with the exception that was raised; everything above it is the stack. */
  static pythonException(lines) {
    const tracebackIndex = lines.findIndex((line) => line.startsWith(PYTHON_TRACEBACK));
    if (tracebackIndex === -1) {
      return void 0;
    }
    return lines.slice(tracebackIndex + 1).reverse().find((line) => PYTHON_EXCEPTION_LINE.test(line));
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

// src/Shared/Services/SignalDetectorService.ts
var ERROR_HASH_CHARS = 6;
var REQUEST_HASH_CHARS = 8;
var MAX_FAILURE_EXCERPT_CHARS = 240;
var ASKED_EXCERPT_CHARS = 90;
var REPLY_EXCERPT_CHARS = 110;
var TITLE_EXCERPT_CHARS = 80;
var EXAMPLE_EXCERPT_CHARS = 200;
var RECOVERY_WINDOW_CALLS = 3;
var MIN_REQUEST_WORDS = 3;
var MAX_REQUEST_CHARS = 600;
var FILE_CHANGING_COMMAND = /\b(git (checkout|pull|merge|rebase|stash)|sed -i|prettier|eslint --fix|npm run format)/;
var SignalDetectorService = class {
  constructor(options, attribution, collector) {
    this.options = options;
    this.attribution = attribution;
    this.collector = collector;
  }
  /** Runs every per-session detector. */
  detectInSession(session, index) {
    this.detectToolFailures(session, index);
    this.detectRepeatedReads(session, index);
    this.detectSubagentRereads(session, index);
    this.detectCorrectionsAndInterruptions(session, index);
  }
  /** Greedy clustering of prompts by word-set similarity; a cluster seen in enough sessions is a repeated request. */
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
    const threadIdToCommands = /* @__PURE__ */ new Map();
    for (const call of session.tools.filter((toolCall) => toolCall.category === "shell")) {
      CollectionUtil.pushTo(threadIdToCommands, call.thread.id, call);
    }
    for (const call of session.tools) {
      const result = call.result;
      if (!result?.isError || result.kind === "interrupted") {
        continue;
      }
      const occurrence = {
        session,
        ref: {
          ...call.ref,
          excerpt: `${call.summary} \u2192 ${result.ref.excerpt ?? ""}`.slice(0, MAX_FAILURE_EXCERPT_CHARS)
        },
        pieces: index.toolCallIdToPieces.get(call.id) ?? [AttributionService.MAIN_PIECE],
        ...this.reactionCost(call, index)
      };
      const errorHead = result.errorHead ?? "error";
      if (result.kind === "user_rejected") {
        const attributedTo = occurrence.pieces.join(",");
        const title = `User corrected the agent (${attributedTo})`;
        this.collector.add(`user_correction:${attributedTo}`, "user_correction", title, {
          ...occurrence,
          ref: {
            ...occurrence.ref,
            excerpt: `rejected ${call.summary} \u2192 ${result.ref.excerpt ?? ""}`.slice(0, MAX_FAILURE_EXCERPT_CHARS)
          }
        });
      } else if (result.kind === "permission_denied") {
        const title = `Permission denied for ${call.key}`;
        const group = this.collector.add(`permission_denied:${call.key}`, "permission_denied", title, occurrence);
        this.collector.count(group, "errors", errorHead);
      } else if (result.kind === "hook_blocked") {
        this.collector.add(`hook_blocked:${call.key}`, "hook_blocked", `Hook blocked ${call.key}`, occurrence);
      } else if (call.category === "shell") {
        const title = `Command fails: ${call.key}`;
        const group = this.collector.add(`failed_command:${call.key}`, "failed_command", title, occurrence);
        this.collector.count(group, "errors", errorHead);
        const recoveredWith = this.recoveryOf(call, threadIdToCommands.get(call.thread.id) ?? []);
        if (recoveredWith) {
          this.collector.count(group, "recoveredWith", recoveredWith);
        }
      } else {
        const signalId = `tool_error:${call.key}:${HashUtil.sha(errorHead, ERROR_HASH_CHARS)}`;
        const group = this.collector.add(signalId, "tool_error", `${call.key} error: ${errorHead}`, occurrence);
        group.details.tool = call.key;
        group.details.error = errorHead;
      }
    }
  }
  detectRepeatedReads(session, index) {
    const thresholds = this.options.thresholds;
    const threadFileToReads = /* @__PURE__ */ new Map();
    for (const call of session.tools.filter((toolCall) => this.isSuccessfulRead(toolCall))) {
      CollectionUtil.pushTo(threadFileToReads, `${call.thread.id}\0${call.filePath ?? ""}`, call);
    }
    for (const reads of threadFileToReads.values()) {
      const [firstRead] = reads;
      if (!firstRead || reads.length < thresholds.minReadsPerFile) {
        continue;
      }
      const extraReads = reads.slice(1).filter((read) => !this.wasChangedBetween(session, firstRead, read));
      if (extraReads.length < thresholds.minExtraReads) {
        continue;
      }
      const agentType = firstRead.thread.agentType;
      const filePath = firstRead.filePath ?? "";
      for (const read of extraReads) {
        const title = `Re-reads ${filePath} (${agentType})`;
        this.collector.add(`repeated_read:${agentType}:${filePath}`, "repeated_read", title, {
          session,
          ref: read.ref,
          pieces: index.toolCallIdToPieces.get(read.id) ?? [AttributionService.MAIN_PIECE],
          ...this.readCost(read, index)
        });
      }
    }
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
        ...this.correctedTurnCost(index, previousPrompt?.sentAtMs, prompt.sentAtMs)
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
  /** Cost of a failed step: time until the agent reacted, and the tokens of the turn spent reacting. */
  reactionCost(call, index) {
    const threadMessages = index.threadIdToMessages.get(call.thread.id) ?? [];
    const resultAtMs = call.result?.returnedAtMs ?? call.calledAtMs ?? 0;
    const reaction = threadMessages.find(
      (message) => (message.sentAtMs ?? 0) >= resultAtMs && message.id !== call.messageId
    );
    const reactedAtMs = reaction?.sentAtMs ?? resultAtMs;
    const elapsedMs = call.calledAtMs === void 0 ? 0 : Math.max(0, reactedAtMs - call.calledAtMs);
    return {
      activeMs: Math.min(this.options.idleMs, elapsedMs),
      usage: reaction?.usage ?? TokenUsageUtil.zero(),
      model: reaction?.model
    };
  }
  /** Cost of an unnecessary read: its duration and the tokens it added to the context. */
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
  /** Cost of a turn the user corrected or interrupted (an upper bound): main-thread time and tokens in it. */
  correctedTurnCost(index, turnStartAtMs, turnEndAtMs) {
    if (turnStartAtMs === void 0 || turnEndAtMs === void 0) {
      return {
        activeMs: 0,
        usage: TokenUsageUtil.zero()
      };
    }
    const mainMessages = index.threadIdToMessages.get(SessionUtil.MAIN_THREAD_ID) ?? [];
    const turnMessages = mainMessages.filter((message) => {
      const sentAtMs = message.sentAtMs ?? 0;
      return sentAtMs > turnStartAtMs && sentAtMs <= turnEndAtMs;
    });
    const eventsAtMs = [turnStartAtMs, ...turnMessages.map((message) => message.sentAtMs ?? turnStartAtMs)].sort((left, right) => left - right);
    return {
      activeMs: TimeUtil.activeTime(eventsAtMs, this.options.idleMs),
      usage: turnMessages.reduce((total, message) => TokenUsageUtil.add(total, message.usage), TokenUsageUtil.zero()),
      model: turnMessages[0]?.model
    };
  }
  /** The command that worked after a failure: the next successful command in the thread, if it is a different one. */
  recoveryOf(failedCall, threadCommands) {
    const failedIndex = threadCommands.indexOf(failedCall);
    const nextCommands = threadCommands.slice(failedIndex + 1, failedIndex + 1 + RECOVERY_WINDOW_CALLS);
    const firstSuccess = nextCommands.find((call) => call.result !== void 0 && !call.result.isError);
    return firstSuccess && firstSuccess.key !== failedCall.key ? firstSuccess.key : void 0;
  }
  /** Reading a file again is legitimate after it was edited or changed by a command in between. */
  wasChangedBetween(session, firstRead, laterRead) {
    const fromAtMs = firstRead.calledAtMs ?? 0;
    const toAtMs = laterRead.calledAtMs ?? 0;
    return session.tools.some((call) => {
      const calledAtMs = call.calledAtMs ?? 0;
      const isSameThread = call.thread.id === firstRead.thread.id;
      const isEditOfFile = call.category === "edit" && call.filePath === firstRead.filePath;
      const isFileChangingCommand = call.category === "shell" && FILE_CHANGING_COMMAND.test(call.summary);
      const isBetween = calledAtMs >= fromAtMs && calledAtMs <= toAtMs;
      return isSameThread && isBetween && (isEditOfFile || isFileChangingCommand);
    });
  }
};

// src/Shared/Services/SignalService.ts
var MAX_COUNTED_VALUES = 5;
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
var SignalService = class _SignalService {
  constructor(options) {
    this.options = options;
    this.costService = new CostService(options.prices);
  }
  /** When a group of occurrences is strong enough to report. Piece signals (unused, large) are built separately. */
  static SIGNAL_TYPE_TO_THRESHOLD = {
    failed_command: (occurrences, sessions, options) => occurrences >= options.thresholds.minFailures || sessions >= options.thresholds.minFailureSessions,
    tool_error: (occurrences, sessions, options) => occurrences >= options.thresholds.minFailures || sessions >= options.thresholds.minFailureSessions,
    permission_denied: (occurrences, _sessions, options) => occurrences >= options.thresholds.minRepeatedEvents,
    hook_blocked: (occurrences, _sessions, options) => occurrences >= options.thresholds.minRepeatedEvents,
    user_correction: (occurrences, _sessions, options) => occurrences >= options.thresholds.minRepeatedEvents,
    interruption: (occurrences, _sessions, options) => occurrences >= options.thresholds.minRepeatedEvents,
    repeated_read: (occurrences, _sessions, options) => occurrences >= options.thresholds.minExtraReads,
    subagent_reread: (occurrences, _sessions, options) => occurrences >= options.thresholds.minSubagentRereads,
    repeated_request: (_occurrences, sessions, options) => sessions >= options.thresholds.minRepeatedRequestSessions,
    unused_piece: () => true,
    large_piece: () => true
  };
  costService;
  extract(sessions, inventory) {
    const pieceIds = new Set(inventory?.pieces.map((piece) => piece.id) ?? []);
    const attribution = new AttributionService(pieceIds);
    const collector = new OccurrenceCollectorService();
    const detector = new SignalDetectorService(this.options, attribution, collector);
    for (const session of sessions) {
      detector.detectInSession(session, attribution.buildSessionIndex(session));
    }
    detector.detectRepeatedRequests(sessions);
    const signals = collector.groups().filter((group) => this.isStrongEnough(group)).map((group) => this.buildSignal(group));
    if (inventory) {
      signals.push(...this.unusedPieceSignals(sessions, inventory), ...this.largePieceSignals(inventory));
      this.markPiecesChangedAfterEvidence(signals, inventory);
    }
    for (const signal of signals) {
      signal.score = this.scoreOf(signal);
    }
    return signals.sort((left, right) => right.score - left.score);
  }
  isStrongEnough(group) {
    const sessionCount = new Set(group.occurrences.map((occurrence) => occurrence.session.sessionId)).size;
    return _SignalService.SIGNAL_TYPE_TO_THRESHOLD[group.type](group.occurrences.length, sessionCount, this.options);
  }
  buildSignal(group) {
    const occurrences = [...group.occurrences].sort(
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
      id: group.id,
      type: group.type,
      title: group.title,
      pieces,
      occurrences: occurrences.length,
      sessions: sessionCount,
      isPartial: partialReasons.length > 0,
      partialReasons,
      cost: this.costOf(occurrences),
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
  costOf(occurrences) {
    const usage = occurrences.reduce(
      (total, occurrence) => TokenUsageUtil.add(total, occurrence.usage),
      TokenUsageUtil.zero()
    );
    const usd = occurrences.reduce(
      (total, occurrence) => total + this.costService.costUsd(occurrence.usage, occurrence.model),
      0
    );
    const activeMs = occurrences.reduce((total, occurrence) => total + occurrence.activeMs, 0);
    return {
      activeMinutes: TimeUtil.msToMinutes(activeMs),
      tokens: TokenUsageUtil.total(usage),
      usd: NumberUtil.round(usd),
      isEstimated: true
    };
  }
  topCountedValues(group) {
    const countedDetails = {};
    for (const [detail, valueToCount] of Object.entries(group.counters)) {
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
  /** Pieces nobody used during the period. Needs enough sessions for absence to mean something. */
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
        type: "unused_piece",
        title: `Not used in ${sessions.length} sessions: ${piece.id}`,
        sessions: sessions.length,
        partialReasons,
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
      for (const call of session.tools) {
        if (call.subagentType) {
          usedPieceIds.add(`agent:${call.subagentType}`);
        }
        if (call.skill) {
          usedPieceIds.add(`skill:${call.skill}`);
        }
        if (call.category === "mcp") {
          usedPieceIds.add(call.key);
        }
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
  /** Editable pieces large enough to be worth trimming; instructions are loaded on every turn. */
  largePieceSignals(inventory) {
    return inventory.pieces.filter((piece) => piece.isEditable && SIZE_KINDS.has(piece.kind)).filter((piece) => piece.approxTokens >= this.options.largePieceTokens).map(
      (piece) => this.pieceSignal(piece, {
        type: "large_piece",
        title: `${piece.id} is large (~${piece.approxTokens} tokens)`,
        sessions: 0,
        partialReasons: [],
        details: {
          path: piece.path,
          approxTokens: piece.approxTokens,
          isLoadedEveryTurn: piece.kind === "instructions"
        }
      })
    );
  }
  pieceSignal(piece, fields) {
    return {
      ...fields,
      id: `${fields.type}:${piece.id}`,
      pieces: [piece.id],
      occurrences: 0,
      isPartial: fields.partialReasons.length > 0,
      cost: {
        activeMinutes: 0,
        tokens: 0,
        usd: 0,
        isEstimated: true
      },
      evidence: [],
      evidenceTotal: 0,
      score: 0
    };
  }
  /** A piece changed after the newest evidence may already be fixed: mark the signal partial. */
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
  /** Evidence picked round-robin across sessions, so it shows the spread instead of the first N. */
  spreadEvidence(sortedOccurrences) {
    const maxEvidence = this.options.maxEvidence;
    const sessionIdToOccurrences = /* @__PURE__ */ new Map();
    for (const occurrence of sortedOccurrences) {
      CollectionUtil.pushTo(sessionIdToOccurrences, occurrence.session.sessionId, occurrence);
    }
    const evidence = [];
    for (let roundIndex = 0; evidence.length < maxEvidence; roundIndex++) {
      const roundEvidence = [...sessionIdToOccurrences.values()].map((sessionOccurrences) => sessionOccurrences[roundIndex]?.ref).filter((ref) => ref !== void 0);
      if (!roundEvidence.length) {
        break;
      }
      evidence.push(...roundEvidence.slice(0, maxEvidence - evidence.length));
    }
    return evidence;
  }
};

// src/Shared/Services/UsageService.ts
var RATE_DIGITS = 3;
var PER_INVOCATION_USD_DIGITS = 3;
var UsageService = class {
  costService;
  attribution;
  constructor(prices, pieceIds) {
    this.costService = new CostService(prices);
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
    for (const message of session.messages) {
      const piece = SessionUtil.isMainThread(message.thread) ? AttributionService.MAIN_PIECE : `agent:${message.thread.agentType}`;
      const totals = this.totalsOf(pieceToTotals, piece);
      totals.usage = TokenUsageUtil.add(totals.usage, message.usage);
      totals.usd += this.costService.costUsd(message.usage, message.model);
      if (message.model) {
        totals.models.add(message.model);
      }
    }
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
      if (call.category === "mcp") {
        const serverTotals = this.totalsOf(pieceToTotals, call.key);
        serverTotals.invocations++;
        serverTotals.toolCalls++;
        serverTotals.toolErrors += errorCount;
        serverTotals.sessionIds.add(session.sessionId);
      }
    }
    for (const command of session.prompts.map((prompt) => prompt.command).filter((name) => name !== void 0)) {
      const commandTotals = this.totalsOf(pieceToTotals, this.attribution.commandPieceId(command));
      commandTotals.invocations++;
      commandTotals.sessionIds.add(session.sessionId);
    }
  }
  toPieceUsage(piece, totals) {
    const tokens = TokenUsageUtil.total(totals.usage);
    const pieceUsage = {
      piece,
      invocations: totals.invocations,
      sessions: totals.sessionIds.size,
      toolCalls: totals.toolCalls,
      toolErrors: totals.toolErrors,
      errorRate: totals.toolCalls ? NumberUtil.round(totals.toolErrors / totals.toolCalls, RATE_DIGITS) : 0,
      activeMinutes: TimeUtil.msToMinutes(totals.activeMs),
      tokens,
      usd: NumberUtil.round(totals.usd),
      models: [...totals.models]
    };
    if (totals.invocations > 0) {
      pieceUsage.perInvocation = {
        activeMinutes: TimeUtil.msToMinutes(totals.activeMs / totals.invocations),
        tokens: Math.round(tokens / totals.invocations),
        usd: NumberUtil.round(totals.usd / totals.invocations, PER_INVOCATION_USD_DIGITS),
        toolCalls: NumberUtil.round(totals.toolCalls / totals.invocations, 1)
      };
    }
    return pieceUsage;
  }
};

// src/Shared/Services/CompareService.ts
var MAX_SIDE_SIGNALS = 10;
var DELTA_DIGITS = 3;
var GLOBAL_PIECE_PREFIXES = ["instructions:", "hook:", "settings:"];
var CompareService = class _CompareService {
  constructor(config, idleMs) {
    this.config = config;
    this.idleMs = idleMs;
  }
  /** Instructions, hooks and settings apply to every session, so every session "uses" them. */
  static PIECE_KIND_TO_USAGE_CHECK = {
    agent: (session, name) => session.threads.some((thread) => thread.thread.agentType === name) || session.tools.some((call) => call.subagentType === name),
    skill: (session, name) => session.tools.some((call) => call.skill === name) || session.prompts.some((prompt) => prompt.command === name),
    command: (session, name) => session.prompts.some((prompt) => prompt.command === name),
    mcp: (session, name) => session.tools.some((call) => call.category === "mcp" && call.key === `mcp:${name}`)
  };
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
    if (!hasEnoughData) {
      caveats.push(
        `Need at least ${minSessions} sessions using ${piece} on each side (before: ${before.sessions}, after: ${after.sessions}).`
      );
    }
    return {
      piece,
      changedAt: TimeUtil.toIso(changedAtMs),
      changedAtSource,
      minSessions,
      before,
      after,
      verdict: hasEnoughData ? this.verdictOf(before, after) : "insufficient_data",
      deltas: {
        errorRate: this.difference(before.errorRate, after.errorRate),
        correctionsPerSession: this.difference(before.correctionsPerSession, after.correctionsPerSession),
        activeMinutesPerInvocation: this.difference(
          before.perInvocation?.activeMinutes,
          after.perInvocation?.activeMinutes
        ),
        tokensPerInvocation: this.difference(before.perInvocation?.tokens, after.perInvocation?.tokens),
        usdPerInvocation: this.difference(before.perInvocation?.usd, after.perInvocation?.usd)
      },
      caveats
    };
  }
  /** Lower is better for every tracked metric; a verdict needs all significant moves in one direction. */
  verdictOf(before, after) {
    const significantMoves = [
      this.relativeChange(before.errorRate, after.errorRate),
      this.relativeChange(before.correctionsPerSession, after.correctionsPerSession),
      this.relativeChange(before.perInvocation?.usd, after.perInvocation?.usd)
    ].filter((change) => Math.abs(change) >= this.config.minRelativeChange);
    if (!significantMoves.length) {
      return "no_clear_change";
    }
    if (significantMoves.every((change) => change < 0)) {
      return "improved";
    }
    return significantMoves.every((change) => change > 0) ? "worse" : "no_clear_change";
  }
  /** Usage of a global piece is the usage of the main thread. */
  usagePieceOf(piece) {
    const isGlobalPiece = GLOBAL_PIECE_PREFIXES.some((prefix) => piece.startsWith(prefix));
    return isGlobalPiece ? AttributionService.MAIN_PIECE : piece;
  }
  sideMetrics(sessions, piece) {
    const usage = new UsageService(this.config.prices, /* @__PURE__ */ new Set([piece])).pieceUsage(sessions).find((entry) => entry.piece === this.usagePieceOf(piece));
    const corrections = sessions.flatMap((session) => session.prompts).filter((prompt) => prompt.isCorrection || prompt.isInterruption).length;
    const signalService = new SignalService({
      idleMs: this.idleMs,
      prices: this.config.prices,
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
      sessions: sessions.length,
      invocations: usage?.invocations ?? 0,
      toolCalls: usage?.toolCalls ?? 0,
      errorRate: usage?.errorRate ?? 0,
      perInvocation: usage?.perInvocation,
      corrections,
      correctionsPerSession: sessions.length ? NumberUtil.round(corrections / sessions.length) : 0,
      signals
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
  /** Enough to identify and locate a piece, without hashes and sizes. */
  static compactPiece(piece) {
    return {
      id: piece.id,
      scope: piece.scope,
      path: piece.path,
      approxTokens: piece.approxTokens || void 0,
      modifiedAt: piece.modifiedAt,
      isEditable: piece.isEditable,
      model: piece.model,
      description: piece.description?.slice(0, _InventoryService.MAX_COMPACT_DESCRIPTION_CHARS)
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
      if (previousHash === void 0) {
        changes.push({
          id,
          change: "added"
        });
      } else if (previousHash !== hash) {
        changes.push({
          id,
          change: "modified"
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
import { homedir } from "node:os";
var PathUtil = class {
  /** Replaces the home directory prefix with `~`, so outputs don't leak usernames. */
  static tildify(path) {
    const home = homedir();
    return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
  }
  static untildify(path) {
    return path.startsWith("~") ? `${homedir()}${path.slice(1)}` : path;
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
        const lowerTerm = term.toLowerCase();
        lines.forEach((line, lineIndex) => {
          if (mentions.length < maxMentions && line.toLowerCase().includes(lowerTerm)) {
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

// src/Shared/Services/AnalysisService.ts
var DEFAULT_MAX_SIGNALS = 25;
var DEFAULT_MAX_EVIDENCE = 5;
var SAVED_EVIDENCE_PER_SIGNAL = 50;
var MAX_USAGE_ENTRIES = 15;
var MAX_FAILED_COMMANDS_TO_SEARCH = 15;
var FAILED_COMMAND_PREFIX = "failed_command:";
var WASTE_SIGNAL_TYPES = /* @__PURE__ */ new Set([
  "failed_command",
  "tool_error",
  "permission_denied",
  "hook_blocked",
  "repeated_read",
  "subagent_reread"
]);
var CORRECTION_SIGNAL_TYPES = /* @__PURE__ */ new Set(["user_correction", "interruption"]);
var COST_METHOD = "Active time sums gaps between transcript events up to the idle threshold; subagent time is reported per agent and not added to session time. Failure cost = time until the agent reacted + tokens of the reaction turn. Correction cost = the corrected turn (upper bound). Categories can overlap.";
var AnalysisService = class _AnalysisService {
  constructor(context) {
    this.context = context;
  }
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
      prices: config.prices,
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
      totals: this.totalsOf(sessions, signals),
      inventory: {
        fingerprint: inventory.fingerprint,
        hasChangedSinceLastRun: hasChanged,
        changes: InventoryService.diff(previous, inventory),
        pieces: inventory.pieces.map((piece) => InventoryService.compactPiece(piece)),
        notes: inventory.notes
      },
      usage: new UsageService(config.prices, pieceIds).pieceUsage(sessions),
      signals,
      suggestions: CollectionUtil.countBy(suggestions.map((suggestion) => suggestion.status)),
      dataDir: store.root
    };
    await store.writeJson(_AnalysisService.LAST_ANALYSIS_FILE, analysis);
    return this.compact(analysis, options);
  }
  /** Fewer signals and less evidence, to keep the agent's context small. */
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
  /** A signal with a suggestion (in any status) is never suggested again. */
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
  /** Where the harness already mentions a failing command or the one that worked instead. */
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
      lostToFailures: this.sumSignalCosts(signals, WASTE_SIGNAL_TYPES),
      inCorrectedOrInterruptedTurns: this.sumSignalCosts(signals, CORRECTION_SIGNAL_TYPES),
      isEstimated: true,
      unpricedModels: this.unpricedModels(sessions),
      method: COST_METHOD,
      idleMinutes: this.context.config.idleMinutes
    };
  }
  unpricedModels(sessions) {
    const costService = new CostService(this.context.config.prices);
    const models = sessions.flatMap((session) => session.messages.map((message) => message.model)).filter((model) => model !== void 0 && !costService.isPriced(model));
    return CollectionUtil.unique(models).map((model) => RedactUtil.redact(model)).sort();
  }
  sessionTotals(sessions) {
    const costService = new CostService(this.context.config.prices);
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
      usd: NumberUtil.round(usd)
    };
  }
  sumSignalCosts(allSignals, types) {
    const signals = allSignals.filter((signal) => types.has(signal.type));
    return {
      activeMinutes: NumberUtil.round(signals.reduce((total, signal) => total + signal.cost.activeMinutes, 0), 1),
      tokens: signals.reduce((total, signal) => total + signal.cost.tokens, 0),
      usd: NumberUtil.round(signals.reduce((total, signal) => total + signal.cost.usd, 0))
    };
  }
};

// src/Shared/Services/ContextService.ts
import { resolve } from "node:path";

// src/Shared/Adapters/BaseProviderAdapter.ts
var BaseProviderAdapter = class {
  /** A sentence about the provider's own transcript retention, for reports. */
  retentionNote(retentionDays) {
    return `${this.displayName} deletes transcripts older than ${retentionDays} days. improve-my-harness never changes this setting.`;
  }
};

// src/Providers/ClaudeCode/Services/ClaudeCodeInventoryService.ts
import { readdir, readFile as readFile2, realpath, stat } from "node:fs/promises";
import { basename, join as join2, relative } from "node:path";

// src/Shared/Utils/FrontmatterUtil.ts
var BLOCK_TEXT_MARKERS = /* @__PURE__ */ new Set(["|", ">", "|-", ">-"]);
var FrontmatterUtil = class _FrontmatterUtil {
  static parse(text) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
    if (!match) {
      return {
        data: {},
        body: text
      };
    }
    const data = {};
    let currentKey;
    let blockMode;
    for (const rawLine of (match[1] ?? "").split(/\r?\n/)) {
      const line = rawLine.replace(/\s+$/, "");
      const isBlankOrComment = !line.trim() || line.trim().startsWith("#");
      if (isBlankOrComment) {
        continue;
      }
      const listItem = /^\s+-\s+(.*)$/.exec(line);
      if (listItem && currentKey && blockMode !== "text") {
        const previous = data[currentKey];
        const list = Array.isArray(previous) ? previous : [];
        list.push(_FrontmatterUtil.unquote(listItem[1] ?? ""));
        data[currentKey] = list;
        blockMode = "list";
        continue;
      }
      const isTextContinuation = /^\s+/.test(line) && currentKey !== void 0 && blockMode === "text";
      if (isTextContinuation && currentKey) {
        data[currentKey] = `${String(data[currentKey] ?? "")} ${line.trim()}`.trim();
        continue;
      }
      const keyValue = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
      if (!keyValue) {
        continue;
      }
      currentKey = keyValue[1] ?? "";
      const value = (keyValue[2] ?? "").trim();
      blockMode = BLOCK_TEXT_MARKERS.has(value) ? "text" : void 0;
      data[currentKey] = _FrontmatterUtil.parseScalarOrFlowList(value);
    }
    return {
      data,
      body: text.slice(match[0].length)
    };
  }
  /** A list field written as a YAML list, a flow list or a comma/space separated string (`tools: Read, Bash`). */
  static asList(value) {
    if (value === void 0 || value === "") {
      return void 0;
    }
    if (Array.isArray(value)) {
      return value;
    }
    const separator = value.includes(",") ? "," : /\s+(?![^(]*\))/;
    return value.split(separator).map((entry) => entry.trim()).filter(Boolean);
  }
  static asText(value) {
    return typeof value === "string" && value !== "" ? value : void 0;
  }
  static parseScalarOrFlowList(value) {
    if (BLOCK_TEXT_MARKERS.has(value)) {
      return "";
    }
    const isFlowList = value.startsWith("[") && value.endsWith("]");
    if (isFlowList) {
      return value.slice(1, -1).split(",").map((entry) => _FrontmatterUtil.unquote(entry.trim())).filter(Boolean);
    }
    return _FrontmatterUtil.unquote(value);
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
  /** Last commit date of each file under `paths`, in one `git log` call. Empty outside a git repository. */
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
  /** The first of several possible keys that holds a string. Agents rename fields between versions. */
  static firstString(record, keys) {
    for (const key of keys) {
      const value = _GuardUtil.asString(record?.[key]);
      if (value !== void 0) {
        return value;
      }
    }
    return void 0;
  }
  static parseJson(text) {
    try {
      return JSON.parse(text);
    } catch {
      return void 0;
    }
  }
};

// src/Providers/ClaudeCode/Services/ClaudeCodeInventoryService.ts
var DEFAULT_RETENTION_DAYS = 30;
var MAX_DESCRIPTION_CHARS = 300;
var MAX_COMPONENT_DEPTH = 4;
var HARNESS_PATHS = ["CLAUDE.md", "CLAUDE.local.md", ".claude", ".mcp.json"];
var InventoryBuilder = class {
  constructor(projectDir, gitChangeDates) {
    this.projectDir = projectDir;
    this.gitChangeDates = gitChangeDates;
  }
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
    const isProjectFile = scope === "project" || scope === "local";
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
  /** Same name in two scopes (a user and a project skill, say): keep both and disambiguate the id. */
  uniqueId(kind, name, scope) {
    const baseId = `${kind}:${name}`;
    const isTaken = this.pieces.some((piece) => piece.id === baseId);
    return isTaken ? `${baseId}@${scope}` : baseId;
  }
  async addFile(filePiece) {
    const isNew = await this.markSeen(filePiece.file);
    const text = isNew ? await readFile2(filePiece.file, "utf8").catch(() => void 0) : void 0;
    if (text === void 0) {
      return;
    }
    const { data } = FrontmatterUtil.parse(text);
    this.pieces.push({
      id: this.uniqueId(filePiece.kind, filePiece.name, filePiece.scope),
      kind: filePiece.kind,
      name: filePiece.name,
      scope: filePiece.scope,
      path: this.displayPath(filePiece.file, filePiece.scope),
      hash: HashUtil.sha(text),
      bytes: Buffer.byteLength(text),
      approxTokens: NumberUtil.approxTokens(text),
      description: FrontmatterUtil.asText(data.description)?.slice(0, MAX_DESCRIPTION_CHARS),
      model: FrontmatterUtil.asText(data.model),
      tools: FrontmatterUtil.asList(data.tools ?? data["allowed-tools"]),
      ...await this.changeOf(filePiece.file, filePiece.scope),
      isEditable: filePiece.scope !== "plugin" && filePiece.scope !== "managed",
      plugin: filePiece.plugin
    });
  }
};
var ClaudeCodeInventoryService = class {
  constructor(homeDir, claudeJsonPath) {
    this.homeDir = homeDir;
    this.claudeJsonPath = claudeJsonPath;
  }
  async takeInventory(options) {
    const projectDir = options.projectDir;
    const builder = new InventoryBuilder(projectDir, await GitUtil.readChangeDates(projectDir, HARNESS_PATHS));
    const shouldIncludeUser = !options.isProjectOnly;
    await this.addInstructionFiles(builder, shouldIncludeUser);
    await this.addComponents(builder, join2(projectDir, ".claude"), "project");
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
      provider: "claude-code",
      projectDir,
      takenAt: (/* @__PURE__ */ new Date()).toISOString(),
      fingerprint,
      pieces: builder.pieces,
      retention: settings.retention,
      notes: builder.notes
    };
  }
  async addInstructionFiles(builder, shouldIncludeUser) {
    const projectDir = builder.projectDir;
    const instructionFiles = [
      {
        file: join2(projectDir, "CLAUDE.md"),
        kind: "instructions",
        name: "project",
        scope: "project"
      },
      {
        file: join2(projectDir, ".claude", "CLAUDE.md"),
        kind: "instructions",
        name: "project-dotclaude",
        scope: "project"
      },
      {
        file: join2(projectDir, "CLAUDE.local.md"),
        kind: "instructions",
        name: "local",
        scope: "local"
      }
    ];
    if (shouldIncludeUser) {
      instructionFiles.push({
        file: join2(this.homeDir, "CLAUDE.md"),
        kind: "instructions",
        name: "user",
        scope: "user"
      });
    }
    for (const instructionFile of instructionFiles) {
      await builder.addFile(instructionFile);
    }
  }
  /** Skills in `<base>/skills/<name>/SKILL.md`, agents in `<base>/agents/**.md`, commands in `<base>/commands/**.md`. */
  async addComponents(builder, baseDir, scope, componentOptions = {}) {
    const prefix = componentOptions.namePrefix ?? "";
    const plugin = componentOptions.plugin;
    for (const skillDir of await readdir(join2(baseDir, "skills")).catch(() => [])) {
      const file = join2(baseDir, "skills", skillDir, "SKILL.md");
      const declaredName = await this.declaredNameOf(file);
      await builder.addFile({
        file,
        kind: "skill",
        name: `${prefix}${declaredName ?? skillDir}`,
        scope,
        plugin
      });
    }
    const rootSkill = join2(baseDir, "SKILL.md");
    const rootSkillStat = componentOptions.canBeRootSkill ? await stat(rootSkill).catch(() => void 0) : void 0;
    if (rootSkillStat !== void 0) {
      await builder.addFile({
        file: rootSkill,
        kind: "skill",
        name: `${prefix}${basename(baseDir)}`,
        scope,
        plugin
      });
    }
    const agentsDir = join2(baseDir, "agents");
    for (const file of await this.listMarkdownFiles(agentsDir)) {
      const declaredName = await this.declaredNameOf(file);
      await builder.addFile({
        file,
        kind: "agent",
        name: `${prefix}${declaredName ?? this.nameFromPath(agentsDir, file)}`,
        scope,
        plugin
      });
    }
    const commandsDir = join2(baseDir, "commands");
    for (const file of await this.listMarkdownFiles(commandsDir)) {
      await builder.addFile({
        file,
        kind: "command",
        name: `${prefix}${this.nameFromPath(commandsDir, file)}`,
        scope,
        plugin
      });
    }
  }
  async declaredNameOf(file) {
    const text = await readFile2(file, "utf8").catch(() => "");
    return FrontmatterUtil.asText(FrontmatterUtil.parse(text).data.name);
  }
  /** `agents/review/security.md` → `review:security`, the way Claude Code names nested components. */
  nameFromPath(baseDir, file) {
    return relative(baseDir, file).replace(/\.md$/, "").replace(/[\\/]/g, ":");
  }
  async listMarkdownFiles(dir, depth = 0) {
    if (depth > MAX_COMPONENT_DEPTH) {
      return [];
    }
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    const files = [];
    for (const entry of entries) {
      const entryPath = join2(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...await this.listMarkdownFiles(entryPath, depth + 1));
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(entryPath);
      }
    }
    return files;
  }
  /** Hooks, permissions, enabled plugins and retention, read from lowest to highest precedence so later files win. */
  async addSettings(builder, shouldIncludeUser) {
    const projectDir = builder.projectDir;
    const settingsFiles = [];
    if (shouldIncludeUser) {
      settingsFiles.push({
        file: join2(this.homeDir, "settings.json"),
        scope: "user"
      });
    }
    settingsFiles.push(
      {
        file: join2(projectDir, ".claude", "settings.json"),
        scope: "project"
      },
      {
        file: join2(projectDir, ".claude", "settings.local.json"),
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
      builder.pieces.push(...this.hookPieces(GuardUtil.asRecord(settings.hooks), path, scope, change));
      const permissions = GuardUtil.asRecord(settings.permissions);
      if (permissions) {
        builder.pieces.push(this.permissionsPiece(permissions, path, scope, change));
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
  /** Project servers from `.mcp.json`; user and local servers from the user-level `.claude.json`. */
  async addMcpServers(builder, shouldIncludeUser) {
    const projectMcpFile = join2(builder.projectDir, ".mcp.json");
    const projectMcp = await this.readJsonFile(projectMcpFile);
    builder.pieces.push(
      ...this.mcpPieces(
        GuardUtil.asRecord(projectMcp?.mcpServers),
        ".mcp.json",
        "project",
        await builder.changeOf(projectMcpFile, "project")
      )
    );
    if (!shouldIncludeUser) {
      return;
    }
    const userConfig = await this.readJsonFile(this.claudeJsonPath);
    if (!userConfig) {
      return;
    }
    const displayPath = PathUtil.tildify(this.claudeJsonPath);
    const projectEntry = GuardUtil.asRecord(GuardUtil.asRecord(userConfig.projects)?.[builder.projectDir]);
    builder.pieces.push(
      ...this.mcpPieces(GuardUtil.asRecord(userConfig.mcpServers), displayPath, "user", {}),
      ...this.mcpPieces(GuardUtil.asRecord(projectEntry?.mcpServers), displayPath, "local", {})
    );
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
  /** Plugins are read-only for the user: findings about them become recommendations, never edits. */
  async addPlugins(builder, pluginIdToIsEnabled) {
    for (const [pluginId, installPath] of await this.readInstalledPlugins()) {
      if (pluginIdToIsEnabled.get(pluginId) === false) {
        continue;
      }
      if (!pluginIdToIsEnabled.has(pluginId)) {
        builder.notes.push(`Plugin ${pluginId} is installed but not listed in enabledPlugins; assumed enabled.`);
      }
      const manifest = await this.readJsonFile(join2(installPath, ".claude-plugin", "plugin.json"));
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
        description: GuardUtil.asString(manifest?.description)?.slice(0, MAX_DESCRIPTION_CHARS),
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
  /** Plugin id → install path, from `installed_plugins.json` (accepts both the older and the versioned shape). */
  async readInstalledPlugins() {
    const pluginIdToInstallPath = /* @__PURE__ */ new Map();
    const installed = await this.readJsonFile(join2(this.homeDir, "plugins", "installed_plugins.json"));
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
    const text = await readFile2(file, "utf8").catch(() => void 0);
    return text === void 0 ? void 0 : GuardUtil.asRecord(GuardUtil.parseJson(text));
  }
};

// src/Providers/ClaudeCode/Services/ClaudeCodeSessionService.ts
import { readdir as readdir2, readFile as readFile3, stat as stat2 } from "node:fs/promises";
import { basename as basename2, isAbsolute as isAbsolute2, join as join4, relative as relative2 } from "node:path";

// src/Shared/Utils/JsonlUtil.ts
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
var JsonlUtil = class {
  /** Streams a JSONL file line by line, so transcripts of any size are read with bounded memory. */
  static async read(file, handlers) {
    const lines = createInterface({
      input: createReadStream(file, { encoding: "utf8" }),
      crlfDelay: Infinity
    });
    let lineNumber = 0;
    for await (const line of lines) {
      lineNumber++;
      if (!line.trim()) {
        continue;
      }
      const record = GuardUtil.parseJson(line);
      if (record === void 0) {
        handlers.onBadLine();
        continue;
      }
      try {
        handlers.onRecord(record, lineNumber);
      } catch {
        handlers.onBadLine();
      }
    }
  }
};

// src/Providers/ClaudeCode/Utils/ClaudeCodePathUtil.ts
import { homedir as homedir2 } from "node:os";
import { join as join3 } from "node:path";

// src/Shared/Utils/EnvUtil.ts
var EnvUtil = class {
  /** Returns the variable's value, treating an empty string as unset. */
  static read(name) {
    const value = process.env[name];
    return value === "" ? void 0 : value;
  }
};

// src/Providers/ClaudeCode/Utils/ClaudeCodePathUtil.ts
var ClaudeCodePathUtil = class {
  /** Claude Code's config directory. `IMH_CLAUDE_HOME` exists for tests. */
  static homeDir() {
    return EnvUtil.read("IMH_CLAUDE_HOME") ?? EnvUtil.read("CLAUDE_CONFIG_DIR") ?? join3(homedir2(), ".claude");
  }
  /** The user-level `.claude.json`, which holds user and per-project MCP servers. */
  static claudeJsonPath() {
    const configDir = EnvUtil.read("CLAUDE_CONFIG_DIR");
    const defaultPath = configDir ? join3(configDir, ".claude.json") : join3(homedir2(), ".claude.json");
    return EnvUtil.read("IMH_CLAUDE_JSON") ?? defaultPath;
  }
  /** Claude Code keeps a project's transcripts in `projects/<cwd with every non-alphanumeric replaced by "-">`. */
  static encodeProjectDir(projectDir) {
    return projectDir.replace(/[^a-zA-Z0-9]/g, "-");
  }
};

// src/Providers/ClaudeCode/Utils/ClaudeCodeTranscriptUtil.ts
var HARNESS_INJECTED_BLOCKS = /<(system-reminder|command-message|command-args|local-command-stdout|local-command-stderr|local-command-caveat|bash-input|bash-stdout|bash-stderr|user-prompt-submit-hook)>[\s\S]*?<\/\1>/g;
var INTERRUPTION_PREFIX = "[Request interrupted by user";
var PERMISSION_DENIED = /(permission to use .+ (?:has been|was) denied|permission for this action was denied|denied by (?:the )?(?:claude code )?(?:permission|auto[- ]mode)|requires approval|not allowed by your permission settings)/i;
var USER_REJECTED = /(doesn'?t want to proceed with this tool use|tool use was rejected|denied by (?:the )?user)/i;
var DENIAL_KIND_TO_RESULT_KIND = {
  "user-rejected": "user_rejected",
  "automode-blocked": "permission_denied",
  "automode-unavailable": "permission_denied"
};
var HOOK_BLOCKED = /(hook (?:error|blocked|denied)|blocked by (?:a |the )?(?:\w+ )?hook|PreToolUse:\w+ hook)/i;
var COMPACTION_CAVEAT = /^Caveat: The messages below were generated/i;
var RESULT_HEAD_CHARS = 600;
var ClaudeCodeTranscriptUtil = class _ClaudeCodeTranscriptUtil {
  /** Strips harness-injected blocks from a user message, leaving what the person typed. */
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
  /** Claude Code writes this notice when it compacts a conversation; it isn't something the person typed. */
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
  /** Error text without Claude Code's wrapper tags, ready for `NormalizeUtil.errorKey`. */
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
var SUBAGENT_TYPE_KEYS = ["agentType", "agent_type", "subagentType", "subagent_type"];
var TIMED_LINE_TYPES = /* @__PURE__ */ new Set(["user", "assistant", "attachment", "system"]);
var READ_TOOLS = /* @__PURE__ */ new Set(["Read", "NotebookRead"]);
var EDIT_TOOLS = /* @__PURE__ */ new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
var SEARCH_TOOLS = /* @__PURE__ */ new Set(["Grep", "Glob", "WebSearch", "WebFetch", "ToolSearch"]);
var DELEGATION_TOOLS = /* @__PURE__ */ new Set(["Task", "Agent"]);
var HUMAN_ORIGIN = "human";
var SYNTHETIC_MODEL = "<synthetic>";
var ClaudeCodeSessionService = class {
  constructor(homeDir) {
    this.homeDir = homeDir;
  }
  async discoverTranscripts(options) {
    const projectsDir = join4(this.homeDir, "projects");
    const projectFolders = await readdir2(projectsDir).catch(() => []);
    const encodedProject = ClaudeCodePathUtil.encodeProjectDir(options.projectDir);
    const isCandidateFolder = (folder) => folder === encodedProject || folder.startsWith(`${encodedProject}-`);
    const selectedFolders = options.shouldReadAllProjects ? projectFolders : projectFolders.filter(isCandidateFolder);
    const transcripts = [];
    for (const folder of selectedFolders) {
      const folderPath = join4(projectsDir, folder);
      const entries = await readdir2(folderPath).catch(() => []);
      for (const entry of entries.filter((name) => name.endsWith(TRANSCRIPT_EXTENSION))) {
        const fileStat = await this.statFile(join4(folderPath, entry));
        if (!fileStat) {
          continue;
        }
        const sessionId = entry.slice(0, -TRANSCRIPT_EXTENSION.length);
        transcripts.push({
          ...fileStat,
          sessionId,
          subagentFiles: await this.listSubagentFiles(join4(folderPath, sessionId, "subagents")),
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
      threadIdToDeclaredType: /* @__PURE__ */ new Map()
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
    this.summarizeThreads(context, options.idleMs);
    return facts;
  }
  async listSubagentFiles(subagentsDir) {
    const entries = await readdir2(subagentsDir).catch(() => []);
    const stats = await Promise.all(
      entries.filter((name) => name.endsWith(TRANSCRIPT_EXTENSION)).map(async (name) => this.statFile(join4(subagentsDir, name)))
    );
    return stats.filter((fileStat) => fileStat !== void 0);
  }
  async statFile(file) {
    const fileStat = await stat2(file).catch(() => void 0);
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
  /** A subagent's type, found through the delegation whose result named it or whose prompt it received. */
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
    const metaText = await readFile3(metaFile, "utf8").catch(() => void 0);
    return metaText === void 0 ? void 0 : GuardUtil.firstString(GuardUtil.asRecord(GuardUtil.parseJson(metaText)), SUBAGENT_TYPE_KEYS);
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
      if (!facts.gitBranch && gitBranch && gitBranch !== "HEAD") {
        facts.gitBranch = gitBranch;
      }
    }
    const occurredAt = GuardUtil.asString(record.timestamp);
    const parsedAtMs = occurredAt === void 0 ? Number.NaN : Date.parse(occurredAt);
    const line = {
      record,
      lineNumber,
      thread: this.threadOfLine(context, record, isMainFile),
      occurredAt,
      occurredAtMs: Number.isNaN(parsedAtMs) ? void 0 : parsedAtMs
    };
    const lineType = GuardUtil.asString(record.type);
    if (line.occurredAtMs !== void 0 && lineType !== void 0 && TIMED_LINE_TYPES.has(lineType)) {
      const eventsAtMs = context.threadIdToEventsAtMs.get(line.thread.id) ?? [];
      eventsAtMs.push(line.occurredAtMs);
      context.threadIdToEventsAtMs.set(line.thread.id, eventsAtMs);
    }
    if (lineType === "attachment") {
      this.handleAttachment(context, line);
      return;
    }
    const message = GuardUtil.asRecord(record.message);
    if (!message) {
      return;
    }
    if (lineType === "assistant") {
      this.handleAssistantLine(context, line, message);
    } else if (lineType === "user") {
      this.handleUserLine(context, line, message);
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
    const existing = context.messageIdToMessage.get(messageId);
    if (existing) {
      existing.usage = this.maxUsage(existing.usage, usage);
    } else {
      context.messageIdToMessage.set(messageId, {
        id: messageId,
        model: this.readModel(message),
        usage,
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
        thread: line.thread,
        toEvidence,
        calledAtMs: line.occurredAtMs,
        messageId,
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
    for (const block of GuardUtil.asArray(content).map((item) => GuardUtil.asRecord(item))) {
      if (block?.type === "tool_result") {
        this.handleToolResult(context, line, block);
        continue;
      }
      const text = GuardUtil.asString(block?.text);
      if (block?.type === "text" && text !== void 0) {
        textParts.push(text);
      }
    }
    if (textParts.length) {
      this.handlePrompt(context, line, textParts.join("\n"));
    }
  }
  /**
   * A prompt the person typed while the agent was busy is written as a `queued_command` attachment,
   * never as a user line. Other queued commands (finished background tasks, messages from other
   * sessions) are not the person's words.
   */
  handleAttachment(context, line) {
    const attachment = GuardUtil.asRecord(line.record.attachment);
    const prompt = GuardUtil.asString(attachment?.prompt);
    const originKind = GuardUtil.asString(GuardUtil.asRecord(attachment?.origin)?.kind) ?? HUMAN_ORIGIN;
    const isQueuedHumanPrompt = attachment?.type === "queued_command" && attachment.commandMode === "prompt" && attachment.isMeta !== true && originKind === HUMAN_ORIGIN;
    if (isQueuedHumanPrompt && prompt !== void 0) {
      this.handlePrompt(context, line, prompt);
    }
  }
  handlePrompt(context, line, rawText) {
    const threadId = line.thread.id;
    if (!context.threadIdToFirstPromptHash.has(threadId)) {
      context.threadIdToFirstPromptHash.set(threadId, HashUtil.sha(rawText.trim()));
    }
    const isHarnessGenerated = line.record.isMeta === true || line.record.isCompactSummary === true || line.record.isVisibleInTranscriptOnly === true;
    if (isHarnessGenerated || !SessionUtil.isMainThread(line.thread)) {
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
      text: RedactUtil.redact(text).slice(0, MAX_PROMPT_CHARS),
      ref: this.evidenceFactory(context, line)(text || `/${command ?? ""}`),
      sentAtMs: line.occurredAtMs,
      command,
      isInterruption,
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
      isMarkedError: block.is_error === true,
      wasInterrupted,
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
        ...toEvidence(isError ? text : void 0),
        thread: call.thread.agentType
      },
      returnedAtMs: line.occurredAtMs
    };
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
      if (block?.type === "image") {
        return "[image]";
      }
      return block?.type === "text" ? GuardUtil.asString(block.text) ?? "" : "";
    }).join("\n");
  }
  buildToolCall(block, toolUseId, callContext) {
    const name = GuardUtil.asString(block.name) ?? "unknown";
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
      messageId: callContext.messageId
    };
  }
  describeToolCall(name, input, projectDir) {
    const command = GuardUtil.asString(input.command);
    if (name === "Bash" && command !== void 0) {
      return {
        key: NormalizeUtil.commandKey(command),
        category: "shell",
        summary: command
      };
    }
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
        key: `${name}:${subagentType}`,
        category: "delegation",
        summary: `${subagentType}: ${GuardUtil.asString(input.description) ?? ""}`,
        subagentType,
        subagentPromptHash: delegatedPrompt === void 0 ? void 0 : HashUtil.sha(delegatedPrompt.trim())
      };
    }
    if (name === "Skill") {
      const skill = (GuardUtil.firstString(input, ["skill", "command", "name"]) ?? "unknown").replace(/^\//, "");
      return {
        key: `Skill:${skill}`,
        category: "skill",
        summary: `skill ${skill}`,
        skill
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
      category: SEARCH_TOOLS.has(name) ? "search" : "other",
      summary: detail === void 0 ? name : `${name} ${detail}`
    };
  }
  toProjectRelative(filePath, projectDir) {
    const isInsideProject = projectDir !== void 0 && isAbsolute2(filePath) && filePath.startsWith(projectDir);
    return isInsideProject ? relative2(projectDir, filePath) || "." : filePath;
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
  /** Paths are resolved on every call, so an environment change (as in tests) is picked up. */
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
    prices: CostService.DEFAULT_PRICES,
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
      repeatedRequestSimilarity: 0.5
    }
  };
  async load() {
    const userConfig = GuardUtil.asRecord(await this.store.readJson(CONFIG_FILE)) ?? {};
    const defaults = _ConfigService.DEFAULT_CONFIG;
    const config = {
      ...defaults,
      prices: {
        ...CostService.DEFAULT_PRICES,
        ...this.readPrices(GuardUtil.asRecord(userConfig.prices))
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
  readPrices(userPrices) {
    const prices = {};
    for (const [family, value] of Object.entries(userPrices ?? {})) {
      const price = GuardUtil.asRecord(value);
      const input = this.readNonNegative(price?.input);
      const output = this.readNonNegative(price?.output);
      if (input === void 0 || output === void 0) {
        continue;
      }
      const modelPrice = {
        input,
        output,
        cacheRead: this.readNonNegative(price?.cacheRead),
        cacheWrite: this.readNonNegative(price?.cacheWrite)
      };
      prices[family] = modelPrice;
    }
    return prices;
  }
  readNonNegative(value) {
    const number = GuardUtil.asNumber(value);
    return number !== void 0 && number >= 0 ? number : void 0;
  }
};

// src/Shared/Services/SessionLoaderService.ts
import { cpus } from "node:os";

// src/Shared/Services/StoreService.ts
import { mkdir, readFile as readFile4, rename, writeFile } from "node:fs/promises";
import { dirname, join as join5 } from "node:path";
var DATA_DIR_NAME = ".imh";
var JSON_INDENT = 2;
var FACTS_CACHE_FILE = "cache/facts.json";
var LATEST_INVENTORY_FILE = "inventory/latest.json";
var SUGGESTIONS_FILE = "suggestions.json";
var StoreService = class _StoreService {
  constructor(root) {
    this.root = root;
  }
  /** Bump when the parser's output shape changes, so cached facts are re-parsed. */
  static FACTS_VERSION = 3;
  static forProject(projectDir, dataDir) {
    return new _StoreService(dataDir ?? join5(projectDir, DATA_DIR_NAME));
  }
  /**
   * Reads a file this tool wrote. Its shape is trusted because only this tool writes it;
   * files people may edit by hand (config.json) are validated by their reader.
   */
  async readJson(relativePath) {
    const text = await readFile4(join5(this.root, relativePath), "utf8").catch(() => void 0);
    return text === void 0 ? void 0 : GuardUtil.parseJson(text);
  }
  /** Writes atomically (temp file + rename), so a crash never leaves a half-written file. */
  async writeJson(relativePath, value, shouldIndent = true) {
    const file = join5(this.root, relativePath);
    await mkdir(dirname(file), { recursive: true });
    const temporaryFile = `${file}.${process.pid}.tmp`;
    await writeFile(temporaryFile, JSON.stringify(value, null, shouldIndent ? JSON_INDENT : 0));
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
  /** Always updates the latest inventory; keeps a dated snapshot only when the harness changed. */
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
      available: {
        count: projectSessions.length,
        oldestAt: TimeUtil.toIso(startsAtMs[0]),
        newestAt: TimeUtil.toIso(startsAtMs.at(-1))
      },
      parsedCount,
      cachedCount,
      unparsedLines: sessions.reduce((total, facts) => total + facts.unparsedLines, 0)
    };
  }
  /** Changes when the transcript or any of its subagent transcripts changes, or when the idle threshold changes. */
  cacheSignature(transcript, idleMs) {
    const subagentSignature = transcript.subagentFiles.map((subagentFile) => `${subagentFile.file}:${subagentFile.modifiedAtMs}:${subagentFile.bytes}`).join("|");
    return `${this.provider.type}:${transcript.modifiedAtMs}:${transcript.bytes}:${idleMs}:${subagentSignature}`;
  }
  /**
   * A transcript in the project's own folder always belongs to it, even if the project moved since.
   * One in a prefix-matched folder (`my-app-2`, a subfolder) belongs only when its cwd is inside the project.
   */
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
  /** `--at` first, then the last applied suggestion for the piece, then the piece's last change. */
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
    const analysis = await context.store.readJson(AnalysisService.LAST_ANALYSIS_FILE);
    if (!analysis) {
      throw new Error("No analysis yet. Run `imh analyze` first.");
    }
    const signal = analysis.signals.find(
      (candidate) => candidate.id === options.signalId || candidate.id.startsWith(options.signalId)
    );
    if (!signal) {
      throw new Error(`Signal not found: ${options.signalId}`);
    }
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
      pieces: CollectionUtil.countBy(inventory.pieces.map((piece) => piece.kind)),
      suggestions: CollectionUtil.countBy(suggestions.map((suggestion) => suggestion.status)),
      dataDir: context.store.root,
      config: context.config
    };
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
  static idOf(suggestion) {
    const sortedSignals = [...suggestion.signals].sort().join("|");
    return `sug-${HashUtil.sha(`${sortedSignals}@${suggestion.piece ?? ""}`, SUGGESTION_ID_HASH_CHARS)}`;
  }
  static isStatus(value) {
    return _SuggestionService.STATUSES.includes(value);
  }
  static isFindingClass(value) {
    return _SuggestionService.FINDING_CLASSES.includes(value);
  }
  /** Validates suggestions written by the agent (from a file or stdin) before they are stored. */
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
        class: findingClass,
        piece: GuardUtil.asString(record?.piece),
        signals,
        change: GuardUtil.asString(record?.change),
        status,
        note: GuardUtil.asString(record?.note)
      };
    });
  }
  async list(status) {
    const suggestions = await this.store.loadSuggestions();
    return status ? suggestions.filter((suggestion) => suggestion.status === status) : suggestions;
  }
  /** Stores new suggestions; one whose id already exists is reported with its status and left as is. */
  async add(newSuggestions) {
    const suggestions = await this.store.loadSuggestions();
    const createdAt = (/* @__PURE__ */ new Date()).toISOString();
    const result = {
      added: [],
      existing: [],
      total: 0
    };
    for (const newSuggestion of newSuggestions) {
      const id = _SuggestionService.idOf(newSuggestion);
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
        title: newSuggestion.title.slice(0, MAX_TITLE_CHARS),
        class: newSuggestion.class,
        piece: newSuggestion.piece,
        signals: newSuggestion.signals,
        status: newSuggestion.status ?? "pending",
        createdAt,
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
  /** `appliedFingerprint` is the harness fingerprint right after the change, recorded for before/after. */
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
    if (status === "applied") {
      suggestion.appliedAt = suggestion.updatedAt;
      suggestion.appliedFingerprint = appliedFingerprint;
    }
    await this.store.saveSuggestions(suggestions);
    return suggestion;
  }
};

// src/Shared/Commands/SuggestionsCommand.ts
var SuggestionsCommand = class {
  async list(options) {
    const context = await ContextService.create(options);
    return new SuggestionService(context.store).list(options.status);
  }
  async add(options) {
    const newSuggestions = SuggestionService.parse(options.items);
    const context = await ContextService.create(options);
    return new SuggestionService(context.store).add(newSuggestions);
  }
  /** Applied suggestions also record the harness fingerprint after the change, for before/after. */
  async setStatus(options) {
    const context = await ContextService.create(options);
    let appliedFingerprint;
    if (options.status === "applied") {
      const inventory = await context.takeInventory();
      await context.store.saveInventory(inventory);
      appliedFingerprint = inventory.fingerprint;
    }
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
    suggestions: async (invocation) => this.runSuggestions(invocation)
  };
  static parseArguments(argv) {
    return parseArgs({
      args: argv,
      allowPositionals: true,
      options: ARGUMENT_SPEC
    });
  }
  /** Runs the CLI and exits the process with 0 on success, 1 on error. */
  run(argv) {
    this.main(argv).then(
      () => process.exit(0),
      (error) => {
        process.stderr.write(`imh: ${error instanceof Error ? error.message : String(error)}
`);
        process.exit(1);
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
    if (!this.isCommandName(commandName)) {
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
  isCommandName(value) {
    return Object.hasOwn(this.commandNameToHandler, value);
  }
  async runSuggestions({ values, rest, common }) {
    const [subcommand = "list", id, status] = rest;
    const command = new SuggestionsCommand();
    if (subcommand === "list") {
      const statusFilter = values.status;
      if (statusFilter !== void 0 && !SuggestionService.isStatus(statusFilter)) {
        throw new Error(`Unknown status: ${statusFilter}`);
      }
      return command.list({
        ...common,
        status: statusFilter
      });
    }
    if (subcommand === "add") {
      const rawJson = values.file ? await readFile5(values.file, "utf8") : await this.readStdin();
      const items = GuardUtil.parseJson(rawJson);
      if (items === void 0) {
        throw new Error("Suggestions must be valid JSON.");
      }
      return command.add({
        ...common,
        items
      });
    }
    if (subcommand === "set") {
      if (!id || !status || !SuggestionService.isStatus(status)) {
        throw new Error("Usage: imh suggestions set <id> <pending|accepted|rejected|applied> [--note text]");
      }
      return command.setStatus({
        ...common,
        id,
        status,
        note: values.note
      });
    }
    throw new Error(`Unknown suggestions command: ${subcommand}`);
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
