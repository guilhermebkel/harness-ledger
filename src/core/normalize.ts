import { redact } from "./redact.js";

const WRAPPERS = new Set(["sudo", "time", "nohup", "env", "command", "exec", "timeout"]);
const MULTI_WORD = new Set([
  "npm", "pnpm", "yarn", "bun", "npx", "bunx", "git", "gh", "docker", "kubectl", "helm", "cargo", "go",
  "make", "pip", "pip3", "uv", "poetry", "dotnet", "mvn", "gradle", "./gradlew", "terraform", "aws",
  "gcloud", "az", "brew", "apt", "apt-get", "composer", "bundle", "rails", "mix", "deno", "turbo", "nx",
]);
const RUNNERS = new Set(["run", "exec", "x", "dlx", "-m"]);

/**
 * Turns a shell command into a short grouping key, e.g.
 * `cd app && CI=1 npm run test -- --watch=false` → `npm run test`.
 */
export function commandKey(command: string): string {
  const segments = command
    .split(/&&|\|\||;|\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const main = segments.find((s) => !/^(cd|pushd|popd|export|source|\.|set)\b/.test(s)) ?? segments[0] ?? command;
  const first = main.split(/\s\|\s?/)[0] ?? main;
  const tokens = first.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  let i = 0;
  while (i < tokens.length && (/^[A-Z_][A-Z0-9_]*=/.test(tokens[i]!) || WRAPPERS.has(tokens[i]!))) i++;
  const prog = tokens[i];
  if (!prog) return "(empty)";
  const program = prog.includes("/") && !prog.startsWith("./gradlew") ? prog.split("/").pop()! : prog;
  const out = [program];
  const isWord = (t: string | undefined) => !!t && /^[a-z][\w:.@-]*$/i.test(t) && t.length <= 30 && !t.includes("/");
  if (MULTI_WORD.has(program) || program.startsWith("python")) {
    const sub = tokens[i + 1];
    if (sub && (isWord(sub) || sub === "-m")) {
      out.push(sub);
      if (RUNNERS.has(sub) && isWord(tokens[i + 2])) out.push(tokens[i + 2]!);
    }
  }
  return redact(out.join(" "));
}

/** Normalizes an error line so the same error groups across sessions. */
export function errorKey(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^exit code \d+$/i.test(l) && !/^<\/?[\w-]+\s*\/?>$/.test(l));
  // Prefer the first line that reads like an error over banners and notices.
  const errorish = lines.slice(0, 8).find((l) => /error|fail|denied|not found|no such|invalid|cannot|can't|unable|exception|refused|timed? ?out|"reason"/i.test(l));
  const head = (errorish ?? lines[0] ?? text.trim()).replace(/<\/?tool_use_error>/g, "");
  const reason = /"reason"\s*:\s*"([^"]{1,60})"/.exec(head)?.[1];
  return redact(reason ? `reason: ${reason}` : head)
    .replace(/(["'`]).{1,200}?\1/g, "'…'")
    .replace(/(?:[A-Za-z]:)?[~.]?\/[\w@.+-]+(?:\/[\w@.+-]+)*/g, "<path>")
    .replace(/\b\d+(\.\d+)*\b/g, "N")
    .replace(/\s+/g, " ")
    .slice(0, 160)
    .trim();
}

const SYSTEM_TAGS =
  /<(system-reminder|command-message|command-args|local-command-stdout|local-command-stderr|local-command-caveat|bash-input|bash-stdout|bash-stderr|user-prompt-submit-hook)>[\s\S]*?<\/\1>/g;

/** Strips harness-injected blocks from a user message, leaving what the person typed. */
export function cleanPrompt(text: string): { text: string; command?: string } {
  const cmd = /<command-name>\s*\/?([^<\s]+)\s*<\/command-name>/.exec(text);
  const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(text);
  let clean = text.replace(SYSTEM_TAGS, " ").replace(/<command-name>[\s\S]*?<\/command-name>/g, " ");
  if (cmd && args?.[1]) clean = `${clean} ${args[1]}`;
  clean = clean.replace(/\s+/g, " ").trim();
  return { text: clean, command: cmd?.[1] };
}

const CORRECTION =
  /^(no|nope|não|nao|wrong|errado|actually|na verdade|instead|ao invés|em vez|stop|pare|para de|don'?t|do not|não faça|nao faca|that'?s not|isso não|isso nao|you should|you shouldn'?t|você deveria|voce deveria|why did you|por que você|por que voce|undo|revert|desfaz|desfaça|again|de novo|still (?:not|wrong|failing)|ainda (?:não|nao|está|esta))\b/i;

export function isCorrection(text: string): boolean {
  return CORRECTION.test(text.trim().slice(0, 80));
}

export const INTERRUPTED = /^\[Request interrupted by user/;
export const PERMISSION_DENIED =
  /(permission (?:to use .+ )?(?:has been |was )?denied|doesn'?t want to proceed with this tool use|tool use was rejected|denied by (?:the )?(?:user|permission|auto[- ]mode)|requires approval|not allowed by your permission settings)/i;
export const HOOK_BLOCKED = /(hook (?:error|blocked|denied)|blocked by (?:a |the )?(?:\w+ )?hook|PreToolUse:\w+ hook)/i;

/** Token-set similarity used to cluster repeated requests. */
export function shingles(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  return new Set(words);
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

const STOPWORDS = new Set(
  (
    "the and for with that this from you your are was were can could would should please into have has had " +
    "not but all any some what when where which who how why its it's our out then than them they there here " +
    "também para com que uma umas uns dos das por pelo pela isso isto esse essa este esta você voce seu sua " +
    "nos nas não nao mais muito pode poderia favor ser ter tem foi vai fazer faz como quando onde qual quais"
  ).split(" "),
);
