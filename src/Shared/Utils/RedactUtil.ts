// Masks secret-looking values before anything leaves the parser (ADR 0007).
// Reports, cached facts and stdout only ever see redacted text.

import { homedir } from "node:os";

const MASK = "[REDACTED]";
const DEFAULT_EXCERPT_CHARS = 200;

const SECRET_PATTERNS: [RegExp, string][] = [
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
  [/([a-z][a-z0-9+.-]*:\/\/)[^\s:/@]+:[^\s@/]+@/gi, `$1${MASK}@`],
];

/** `key=value`, `key: value` or `"key": "value"` where the key looks sensitive. */
const SENSITIVE_ASSIGNMENT
  = /((?:["']?)[A-Za-z0-9_.-]*(?:pass(?:word|wd)?|secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|credential|auth)[A-Za-z0-9_.-]*["']?\s*[:=]\s*)(["']?)([^\s"',;&]{4,})\2/gi;

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

  /** The home folder carries the user's name; reports show it as `~`. */
  private static withoutHomeFolder(text: string): string {
    const home = homedir();
    const isUsableHome = home.length > 1 && home !== "/";
    if (!isUsableHome) {
      return text;
    }
    // A longer folder that starts with the same name (/home/ana2 for /home/ana) is someone else's.
    const escapedHome = home.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return text.replace(new RegExp(`${escapedHome}(?![\\w.-])`, "g"), "~");
  }

  /** Redacts and collapses to a single line of at most `maxChars`. */
  static excerpt(text: string, maxChars = DEFAULT_EXCERPT_CHARS): string {
    const oneLine = RedactUtil.redact(text).replace(/\s+/g, " ").trim();
    return oneLine.length > maxChars ? `${oneLine.slice(0, maxChars - 1)}…` : oneLine;
  }
}
