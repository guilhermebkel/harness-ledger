// Masks secret-looking values before anything leaves the parser.
// Reports, cached facts and stdout only ever see redacted text.

const MASK = "[REDACTED]";

const PATTERNS: Array<[RegExp, string]> = [
  // Private key blocks
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, MASK],
  // Provider-style tokens
  [/\bsk-(?:ant-|proj-|live-|test-)?[A-Za-z0-9_-]{16,}/g, MASK],
  [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g, MASK],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, MASK],
  [/\bglpat-[A-Za-z0-9_-]{16,}/g, MASK],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/g, MASK],
  [/\bAKIA[0-9A-Z]{16}\b/g, MASK],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, MASK],
  [/\b(?:rk|pk|sk)_(?:live|test)_[A-Za-z0-9]{16,}/g, MASK],
  [/\bnpm_[A-Za-z0-9]{30,}/g, MASK],
  // JWTs
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, MASK],
  // Authorization headers
  [/\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{12,}/gi, `$1 ${MASK}`],
  // Credentials in URLs
  [/([a-z][a-z0-9+.-]*:\/\/)[^\s:/@]+:[^\s@/]+@/gi, `$1${MASK}@`],
];

// key=value / key: value / "key": "value" where the key looks sensitive.
const SENSITIVE_KEY =
  /((?:["']?)[A-Za-z0-9_.-]*(?:pass(?:word|wd)?|secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|credential|auth)[A-Za-z0-9_.-]*["']?\s*[:=]\s*)(["']?)([^\s"',;&]{4,})\2/gi;

export function redact(text: string): string {
  if (!text) return text;
  let out = text;
  for (const [re, rep] of PATTERNS) out = out.replace(re, rep);
  out = out.replace(SENSITIVE_KEY, (_m, prefix: string, quote: string) => `${prefix}${quote}${MASK}${quote}`);
  return out;
}

/** Redacts and shortens to a single-line excerpt. */
export function excerpt(text: string, max = 200): string {
  const oneLine = redact(text).replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}
