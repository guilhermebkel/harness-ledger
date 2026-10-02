import { createHash } from "node:crypto";
import { homedir } from "node:os";

export function sha(text: string, length = 12): string {
  return createHash("sha256").update(text).digest("hex").slice(0, length);
}

export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Replaces the home directory prefix with ~ so outputs don't leak usernames. */
export function tildify(path: string): string {
  const home = homedir();
  return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

/** Parses "14d", "2w", "6h", "3m" (months) or an ISO date into epoch ms. */
export function parseSince(value: string | undefined, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const m = /^(\d+)\s*([hdwm])$/i.exec(value.trim());
  if (m) {
    const n = Number(m[1]);
    const unit = m[2]!.toLowerCase();
    const day = 24 * 3600 * 1000;
    const ms = unit === "h" ? n * 3600 * 1000 : unit === "d" ? n * day : unit === "w" ? n * 7 * day : n * 30 * day;
    return now - ms;
  }
  const t = Date.parse(value);
  if (Number.isNaN(t)) throw new Error(`Invalid date or period: "${value}". Use e.g. 14d, 2w, 6h or 2026-09-01.`);
  return t;
}

/** Runs async work over items with a concurrency limit, keeping order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}

export function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function minutes(ms: number): number {
  return round(ms / 60000, 1);
}

/** Minimal YAML frontmatter reader: top-level `key: value` pairs and simple lists. */
export function parseFrontmatter(text: string): { data: Record<string, string | string[]>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { data: {}, body: text };
  const data: Record<string, string | string[]> = {};
  let currentKey: string | undefined;
  let blockMode: "list" | "text" | undefined;
  for (const raw of m[1]!.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && currentKey && blockMode !== "text") {
      const prev = data[currentKey];
      const list = Array.isArray(prev) ? prev : [];
      list.push(unquote(item[1]!));
      data[currentKey] = list;
      blockMode = "list";
      continue;
    }
    if (/^\s+/.test(line) && currentKey && blockMode === "text") {
      data[currentKey] = `${String(data[currentKey] ?? "")} ${line.trim()}`.trim();
      continue;
    }
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (kv) {
      currentKey = kv[1]!;
      const value = kv[2]!.trim();
      if (value === "" ) {
        data[currentKey] = "";
        blockMode = undefined;
      } else if (value === "|" || value === ">" || value === "|-" || value === ">-") {
        data[currentKey] = "";
        blockMode = "text";
      } else if (value.startsWith("[") && value.endsWith("]")) {
        data[currentKey] = value
          .slice(1, -1)
          .split(",")
          .map((s) => unquote(s.trim()))
          .filter(Boolean);
        blockMode = undefined;
      } else {
        data[currentKey] = unquote(value);
        blockMode = undefined;
      }
    }
  }
  return { data, body: text.slice(m[0].length) };
}

function unquote(s: string): string {
  return s.replace(/^["'](.*)["']$/, "$1");
}

export function asList(value: string | string[] | undefined): string[] | undefined {
  if (value === undefined || value === "") return undefined;
  if (Array.isArray(value)) return value;
  return value
    .split(value.includes(",") ? "," : /\s+(?![^(]*\))/)
    .map((s) => s.trim())
    .filter(Boolean);
}
