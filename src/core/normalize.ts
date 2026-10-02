import { redact } from "./redact.js";

const COMMAND_WRAPPERS = new Set(["sudo", "time", "nohup", "env", "command", "exec", "timeout"]);
const NAVIGATION_COMMAND = /^(cd|pushd|popd|export|source|\.|set)\b/;
const ENV_ASSIGNMENT = /^[A-Z_][A-Z0-9_]*=/;
/** Programs whose subcommand is part of what the command means (`git push`, `npm test`). */
const PROGRAMS_WITH_SUBCOMMAND = new Set([
  "npm", "pnpm", "yarn", "bun", "npx", "bunx", "git", "gh", "docker", "kubectl", "helm", "cargo", "go",
  "make", "pip", "pip3", "uv", "poetry", "dotnet", "mvn", "gradle", "./gradlew", "terraform", "aws",
  "gcloud", "az", "brew", "apt", "apt-get", "composer", "bundle", "rails", "mix", "deno", "turbo", "nx",
]);
/** Subcommands that take the real target as the next word (`npm run test`, `python -m pytest`). */
const RUNNER_SUBCOMMANDS = new Set(["run", "exec", "x", "dlx", "-m"]);
const MAX_SUBCOMMAND_CHARS = 30;

/**
 * Turns a shell command into a short grouping key, e.g.
 * `cd app && CI=1 npm run test -- --watch=false` → `npm run test`.
 */
export function commandKey(command: string): string {
  const segments = command
    .split(/&&|\|\||;|\n/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const mainSegment = segments.find((segment) => !NAVIGATION_COMMAND.test(segment)) ?? segments[0] ?? command;
  const firstPipelineStage = mainSegment.split(/\s\|\s?/)[0] ?? mainSegment;
  const tokens = firstPipelineStage.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  const programIndex = tokens.findIndex((token) => !ENV_ASSIGNMENT.test(token) && !COMMAND_WRAPPERS.has(token));
  const programToken = programIndex === -1 ? undefined : tokens[programIndex];
  if (!programToken) {
    return "(empty)";
  }
  const isPathToProgram = programToken.includes("/") && !programToken.startsWith("./gradlew");
  const program = isPathToProgram ? (programToken.split("/").pop() ?? programToken) : programToken;
  const keyParts = [program];
  const hasSubcommand = PROGRAMS_WITH_SUBCOMMAND.has(program) || program.startsWith("python");
  if (hasSubcommand) {
    const [subcommand, target] = tokens.slice(programIndex + 1);
    if (subcommand && (isPlainWord(subcommand) || subcommand === "-m")) {
      keyParts.push(subcommand);
      if (RUNNER_SUBCOMMANDS.has(subcommand) && target && isPlainWord(target)) {
        keyParts.push(target);
      }
    }
  }
  return redact(keyParts.join(" "));
}

function isPlainWord(token: string): boolean {
  return /^[a-z][\w:.@-]*$/i.test(token) && token.length <= MAX_SUBCOMMAND_CHARS && !token.includes("/");
}

const ERROR_LINES_TO_SCAN = 8;
const MAX_ERROR_KEY_CHARS = 160;
const ERROR_LOOKING_LINE
  = /error|fail|denied|not found|no such|invalid|cannot|can't|unable|exception|refused|timed? ?out|"reason"/i;

/** Normalizes the first meaningful line of an error, so the same error groups across sessions. */
export function errorKey(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^exit code \d+$/i.test(line) && !/^<\/?[\w-]+\s*\/?>$/.test(line));
  // Agents prepend banners and notices to tool errors; the line that reads like an error is the useful one.
  const errorLine = lines.slice(0, ERROR_LINES_TO_SCAN).find((line) => ERROR_LOOKING_LINE.test(line));
  const head = (errorLine ?? lines[0] ?? text.trim()).replace(/<\/?tool_use_error>/g, "");
  const structuredReason = /"reason"\s*:\s*"([^"]{1,60})"/.exec(head)?.[1];
  const errorText = structuredReason ? `reason: ${structuredReason}` : head;
  return redact(errorText)
    .replace(/(["'`]).{1,200}?\1/g, "'…'")
    .replace(/(?:[A-Za-z]:)?[~.]?\/[\w@.+-]+(?:\/[\w@.+-]+)*/g, "<path>")
    .replace(/\b\d+(\.\d+)*\b/g, "N")
    .replace(/\s+/g, " ")
    .slice(0, MAX_ERROR_KEY_CHARS)
    .trim();
}

const HARNESS_INJECTED_BLOCKS
  = /<(system-reminder|command-message|command-args|local-command-stdout|local-command-stderr|local-command-caveat|bash-input|bash-stdout|bash-stderr|user-prompt-submit-hook)>[\s\S]*?<\/\1>/g;

export interface CleanPrompt {
  text: string;
  command?: string;
}

/** Strips harness-injected blocks from a user message, leaving what the person typed. */
export function cleanPrompt(rawText: string): CleanPrompt {
  const commandName = /<command-name>\s*\/?([^<\s]+)\s*<\/command-name>/.exec(rawText)?.[1];
  const commandArguments = /<command-args>([\s\S]*?)<\/command-args>/.exec(rawText)?.[1];
  const withoutInjectedBlocks = rawText
    .replace(HARNESS_INJECTED_BLOCKS, " ")
    .replace(/<command-name>[\s\S]*?<\/command-name>/g, " ");
  const withArguments = commandName && commandArguments
    ? `${withoutInjectedBlocks} ${commandArguments}`
    : withoutInjectedBlocks;
  return {
    text: withArguments.replace(/\s+/g, " ").trim(),
    command: commandName,
  };
}

const CORRECTION_PREFIX_CHARS = 80;
const CORRECTION_START
  = /^(no|nope|não|nao|wrong|errado|actually|na verdade|instead|ao invés|em vez|stop|pare|para de|don'?t|do not|não faça|nao faca|that'?s not|isso não|isso nao|you should|you shouldn'?t|você deveria|voce deveria|why did you|por que você|por que voce|undo|revert|desfaz|desfaça|again|de novo|still (?:not|wrong|failing)|ainda (?:não|nao|está|esta))\b/i;

/** Heuristic (English and Portuguese): the message opens by pushing back on what the agent did. */
export function isCorrection(text: string): boolean {
  return CORRECTION_START.test(text.trim().slice(0, CORRECTION_PREFIX_CHARS));
}

export const INTERRUPTED = /^\[Request interrupted by user/;
export const PERMISSION_DENIED
  = /(permission (?:to use .+ )?(?:has been |was )?denied|doesn'?t want to proceed with this tool use|tool use was rejected|denied by (?:the )?(?:user|permission|auto[- ]mode)|requires approval|not allowed by your permission settings)/i;
export const HOOK_BLOCKED = /(hook (?:error|blocked|denied)|blocked by (?:a |the )?(?:\w+ )?hook|PreToolUse:\w+ hook)/i;

const MIN_WORD_CHARS = 3;

/** The set of meaningful words in a prompt, used to cluster repeated requests. */
export function wordSet(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length >= MIN_WORD_CHARS && !STOPWORDS.has(word));
  return new Set(words);
}

export function jaccard(left: Set<string>, right: Set<string>): number {
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

const STOPWORDS = new Set(
  (
    "the and for with that this from you your are was were can could would should please into have has had "
    + "not but all any some what when where which who how why its it's our out then than them they there here "
    + "também para com que uma umas uns dos das por pelo pela isso isto esse essa este esta você voce seu sua "
    + "nos nas não nao mais muito pode poderia favor ser ter tem foi vai fazer faz como quando onde qual quais"
  ).split(" "),
);
