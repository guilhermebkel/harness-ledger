import { RedactUtil } from "./RedactUtil.js";

/** Commands that look around rather than do the work; a workflow is made of the others. */
const EXPLORATION_PROGRAMS = new Set([
  "ls", "cat", "find", "grep", "rg", "sed", "head", "tail", "wc", "echo", "pwd", "tree", "which", "sort", "awk",
  "cut", "jq", "file", "stat", "du", "diff", "true", "sleep", "less", "printf", "date", "env", "type",
]);
/** Commands that check the work: tests, linters, type checks, builds. */
const VALIDATION_COMMAND = /\b(test|tests|jest|vitest|mocha|pytest|rspec|phpunit|lint|eslint|prettier|ruff|flake8|mypy|tsc|typecheck|check|build|clippy|vet)\b/;
/** Commands that hand the work over: commits, pushes, pull or merge requests, deploys. */
const DELIVERY_COMMAND = /^(git (commit|push|tag)|gh pr|gh release|glab mr|vercel|netlify|fly deploy|kubectl apply)\b/;
/** Commands that get the workspace ready: branches, worktrees, pulls, installs. */
const SETUP_COMMAND = /^(git (checkout|switch|pull|fetch|worktree|branch|clone|stash|rebase)|npm (install|ci)|pnpm install|yarn install|pip install|uv sync|bundle install|docker compose up)\b/;
/** Words that run the next word as the command, including shell keywords (`do pnpm test`, `then make`). */
const COMMAND_WRAPPERS = new Set(["sudo", "time", "nohup", "env", "command", "exec", "timeout", "do", "then", "else"]);
/** Segments that set up the shell rather than do the work: navigation, variables and loop or condition headers. */
const NAVIGATION_COMMAND = /^(cd|pushd|popd|export|source|\.|set|for|while|until|if|elif|done|fi|esac|nvm use|conda activate|pyenv shell)\b/;
const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
/** What a wrapper takes before the command: flags and durations (`timeout -k 5 300s cmd`). */
const WRAPPER_ARGUMENT = /^(-\S*|\d+(\.\d+)?[smhd]?)$/;
/** Programs whose subcommand is part of what the command means (`git push`, `npm test`). */
const PROGRAMS_WITH_SUBCOMMAND = new Set([
  "npm", "pnpm", "yarn", "bun", "npx", "bunx", "git", "gh", "docker", "kubectl", "helm", "cargo", "go",
  "make", "pip", "pip3", "uv", "poetry", "dotnet", "mvn", "gradle", "./gradlew", "terraform", "aws",
  "gcloud", "az", "brew", "apt", "apt-get", "composer", "bundle", "rails", "mix", "deno", "turbo", "nx",
]);
/** Subcommands that take the real target as the next word (`npm run test`, `python -m pytest`). */
const RUNNER_SUBCOMMANDS = new Set(["run", "exec", "x", "dlx", "-m"]);
const MAX_SUBCOMMAND_CHARS = 30;
/** Options that come before the subcommand (`git -C repo status`); the ones in the map take a value. */
const PROGRAM_TO_GLOBAL_OPTIONS: Record<string, {
  withValue: Set<string>; prefixes: string[];
}> = {
  git: {
    withValue: new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace"]),
    prefixes: ["--no-", "--git-dir=", "--work-tree=", "--namespace=", "--exec-path", "--bare", "--paginate"],
  },
};

const ERROR_LINES_TO_SCAN = 8;
/** Warnings printed before the real error (`FutureWarning:`, `warning:`, `npm WARN`). */
const WARNING_LINE = /^(warning\b|npm warn\b)|\b\w*Warning:|^\s*warnings\.warn\(/i;
const PYTHON_TRACEBACK = "Traceback (most recent call last):";
/** An option and its value, e.g. `-C repo`. */
const OPTION_WITH_VALUE_TOKENS = 2;
const PYTHON_EXCEPTION_LINE = /^[\w.]+(Error|Exception|Exit|Interrupt)\b/;
/** Terminal color codes, which tools like dbt print even when piped. */
// eslint-disable-next-line no-control-regex -- matching the escape character is the point
const ANSI_ESCAPE = /\u001b\[[0-9;]*[A-Za-z]/g;
/** A line that only announces errors follow, ending in a colon. */
const ERROR_HEADER_LINE = /^[^:]{0,60}\berrors?\b[^:]{0,30}:$/i;
/** A clock time some tools put before every line ("14:44:07  Completed with 1 error"). */
const LEADING_CLOCK_TIME = /^\d{1,2}:\d{2}:\d{2}(\.\d+)?\s+/;
const MAX_ERROR_KEY_CHARS = 160;
const ERROR_LOOKING_LINE
  = /error|fail|denied|not found|no such|invalid|cannot|can't|unable|exception|refused|timed? ?out|"reason"/i;

const CORRECTION_PREFIX_CHARS = 80;
/** "no" counts only as "no," / "no." / "no!": in Portuguese, "no" opens ordinary sentences ("no backend ..."). */
const CORRECTION_START
  = /^(no(?=[,.!]|\s*$)|nope|não|nao|wrong|errado|actually|na verdade|instead|ao invés|em vez|stop|pare|para de|don'?t|do not|não faça|nao faca|that'?s not|isso não|isso nao|you should|you shouldn'?t|você deveria|voce deveria|why did you|por que você|por que voce|undo|revert|desfaz|desfaça|again|de novo|still (?:not|wrong|failing)|ainda (?:não|nao|está|esta))\b/i;

const MIN_WORD_CHARS = 3;
const STOPWORDS = new Set(
  (
    "the and for with that this from you your are was were can could would should please into have has had "
    + "not but all any some what when where which who how why its it's our out then than them they there here "
    + "também para com que uma umas uns dos das por pelo pela isso isto esse essa este esta você voce seu sua "
    + "nos nas não nao mais muito pode poderia favor ser ter tem foi vai fazer faz como quando onde qual quais"
  ).split(" "),
);

/** Turns free text from sessions into stable keys for grouping, in any provider. */
export class NormalizeUtil {
  /**
   * A short grouping key for a shell command, e.g.
   * `cd app && CI=1 npm run test -- --watch=false` → `npm run test`.
   */
  static commandKey(command: string): string {
    const segments = command
      .split(/&&|\|\||;|\n/)
      .map((segment) => segment.trim())
      .filter(Boolean);
    // The first segment that runs a program: setup lines, loop keywords and bare assignments are skipped.
    let tokens: string[] = [];
    let programIndex = -1;
    for (const segment of segments.filter((candidate) => !NAVIGATION_COMMAND.test(candidate))) {
      const firstPipelineStage = segment.split(/\s\|\s?/)[0] ?? segment;
      tokens = firstPipelineStage.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
      programIndex = NormalizeUtil.programIndexOf(tokens);
      if (programIndex !== -1) {
        break;
      }
    }
    const programToken = programIndex === -1 ? undefined : tokens[programIndex];
    if (!programToken) {
      return "(empty)";
    }
    const isPathToProgram = programToken.includes("/") && !programToken.startsWith("./gradlew");
    const program = isPathToProgram ? (programToken.split("/").pop() ?? programToken) : programToken;
    const keyParts = [program];
    const hasSubcommand = PROGRAMS_WITH_SUBCOMMAND.has(program) || program.startsWith("python");
    if (hasSubcommand) {
      const [subcommand, target] = NormalizeUtil.withoutGlobalOptions(program, tokens.slice(programIndex + 1));
      if (subcommand && (NormalizeUtil.isPlainWord(subcommand) || subcommand === "-m")) {
        keyParts.push(subcommand);
        if (RUNNER_SUBCOMMANDS.has(subcommand) && target && NormalizeUtil.isPlainWord(target)) {
          keyParts.push(target);
        }
      }
    }
    return RedactUtil.redact(keyParts.join(" "));
  }

  /** The stage of work a shell command belongs to, from its grouping key; undefined when it says nothing. */
  static commandStage(commandKey: string): "setup" | "exploration" | "validation" | "delivery" | undefined {
    if (NormalizeUtil.isExplorationCommand(commandKey)) {
      return "exploration";
    }
    if (DELIVERY_COMMAND.test(commandKey)) {
      return "delivery";
    }
    if (SETUP_COMMAND.test(commandKey)) {
      return "setup";
    }
    return VALIDATION_COMMAND.test(commandKey) ? "validation" : undefined;
  }

  /** True for a command key whose program only reads or prints (`ls`, `cat`, `grep`). */
  static isExplorationCommand(commandKey: string): boolean {
    return EXPLORATION_PROGRAMS.has(commandKey.split(" ")[0] ?? "");
  }

  /** The first meaningful line of an error, normalized so the same error groups across sessions. */
  static errorKey(text: string): string {
    const lines = text
      .replace(ANSI_ESCAPE, "")
      .split(/\r?\n/)
      .map((line) => line.replace(LEADING_CLOCK_TIME, "").trim())
      .filter((line) => line && !/^exit code \d+$/i.test(line) && !/^<\/?[\w-]+\s*\/?>$/.test(line))
      .filter((line) => /[A-Za-z]/.test(line));
    // Tools prepend banners, notices and warnings to errors; the line that reads like an error is the useful one.
    const nonWarningLines = lines.filter((line) => !WARNING_LINE.test(line));
    const errorIndex = nonWarningLines.slice(0, ERROR_LINES_TO_SCAN).findIndex((line) => ERROR_LOOKING_LINE.test(line));
    // "Encountered an error:" only announces the error; the next line is the error.
    const isHeaderOnly = errorIndex !== -1 && ERROR_HEADER_LINE.test(nonWarningLines[errorIndex] ?? "");
    const errorLine = NormalizeUtil.pythonException(lines)
      ?? (isHeaderOnly ? nonWarningLines[errorIndex + 1] : undefined)
      ?? (errorIndex === -1 ? undefined : nonWarningLines[errorIndex]);
    const head = errorLine ?? nonWarningLines[0] ?? lines[0] ?? text.trim();
    const structuredReason = /"reason"\s*:\s*"([^"]{1,60})"/.exec(head)?.[1];
    const errorText = structuredReason ? `reason: ${structuredReason}` : head;
    return RedactUtil.redact(errorText)
      .replace(/(["'`]).{1,200}?\1/g, "'…'")
      .replace(/(?:[A-Za-z]:)?[~.]?\/[\w@.+-]+(?:\/[\w@.+-]+)*/g, "<path>")
      .replace(/\b\d+(\.\d+)*\b/g, "N")
      .replace(/\s+/g, " ")
      .slice(0, MAX_ERROR_KEY_CHARS)
      .trim();
  }

  /** Heuristic (English and Portuguese): the message opens by pushing back on what the agent did. */
  static isCorrection(text: string): boolean {
    return CORRECTION_START.test(text.trim().slice(0, CORRECTION_PREFIX_CHARS));
  }

  /** The set of meaningful words in a prompt, used to cluster repeated requests. */
  static wordSet(text: string): Set<string> {
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

  static jaccard(left: Set<string>, right: Set<string>): number {
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

  /** Skips variable assignments and wrappers (`sudo`, `timeout 300`), with the wrappers' flags and durations. */
  private static programIndexOf(tokens: string[]): number {
    let isAfterWrapper = false;
    for (const [index, token] of tokens.entries()) {
      const isWrapperArgument = isAfterWrapper && WRAPPER_ARGUMENT.test(token);
      if (ENV_ASSIGNMENT.test(token) || isWrapperArgument) {
        continue;
      }
      if (COMMAND_WRAPPERS.has(token)) {
        isAfterWrapper = true;
        continue;
      }
      return index;
    }
    return -1;
  }

  /** A Python traceback ends with the exception that was raised; everything above it is the stack. */
  private static pythonException(lines: string[]): string | undefined {
    const tracebackIndex = lines.findIndex((line) => line.startsWith(PYTHON_TRACEBACK));
    if (tracebackIndex === -1) {
      return undefined;
    }
    // When the output was cut before the exception, the last line is still closer to the cause than "Traceback".
    const afterTraceback = lines.slice(tracebackIndex + 1);
    return afterTraceback.reverse().find((line) => PYTHON_EXCEPTION_LINE.test(line)) ?? afterTraceback[0];
  }

  private static withoutGlobalOptions(program: string, argumentTokens: string[]): string[] {
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

  private static isPlainWord(token: string): boolean {
    return /^[a-z][\w:.@-]*$/i.test(token) && token.length <= MAX_SUBCOMMAND_CHARS && !token.includes("/");
  }
}
