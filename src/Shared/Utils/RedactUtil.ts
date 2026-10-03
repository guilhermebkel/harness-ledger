// Why: everything leaves the parser redacted (ADR 0007): reports, cached facts and stdout.

import { homedir } from "node:os";
import { RegExpUtil } from "@/Shared/Utils/RegExpUtil.ts";

const MASK = "[REDACTED]";
const DEFAULT_EXCERPT_CHARS = 200;

const SECRET_PATTERNS: [RegExp, string][] = [
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
  [/([a-z][a-z0-9+.-]{0,30}:\/\/)[^\s:/@]{1,256}:[^\s@/]{1,256}@/gi, `$1${MASK}@`],
];

const SENSITIVE_KEY_WORDS = ["pass", "secret", "token", "api[_-]?key", "access[_-]?key", "private[_-]?key", "credential", "auth"];
const MAX_KEY_AFFIX_CHARS = 40;
const KEY_AFFIX = `[\\w.-]{0,${MAX_KEY_AFFIX_CHARS}}`;
const SENSITIVE_ASSIGNMENT = new RegExp(
  `(["']?${KEY_AFFIX}(?:${SENSITIVE_KEY_WORDS.join("|")})${KEY_AFFIX}["']?\\s{0,4}[:=]\\s{0,4})(["']?)([^\\s"',;&]{4,})\\2`,
  "gi",
);

export class RedactUtil {
  static redact(text: string): string {
    if (!text) {
      return text;
    }
    let redacted = text;
    for (const [pattern, replacement] of SECRET_PATTERNS) {
      redacted = redacted.replace(pattern, replacement);
    }
    const withoutSecrets = redacted.replace(
      SENSITIVE_ASSIGNMENT,
      (_match, keyPart: string, quote: string) => `${keyPart}${quote}${MASK}${quote}`,
    );
    return RedactUtil.withoutHomeFolder(withoutSecrets);
  }

  private static withoutHomeFolder(text: string): string {
    const home = homedir();
    const isUsableHome = home.length > 1 && home !== "/";
    if (!isUsableHome) {
      return text;
    }
    // Why: a longer folder that starts with the same name (/home/ana2 for /home/ana) is someone else's.
    const escapedHome = RegExpUtil.escape(home);
    return text.replace(new RegExp(`${escapedHome}(?![\\w.-])`, "g"), "~");
  }

  static excerpt(text: string, maxChars = DEFAULT_EXCERPT_CHARS): string {
    const oneLine = RedactUtil.redact(text).replace(/\s+/g, " ").trim();
    return oneLine.length > maxChars ? `${oneLine.slice(0, maxChars - 1)}…` : oneLine;
  }
}
