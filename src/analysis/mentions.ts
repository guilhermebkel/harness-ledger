// Finds where the harness already talks about something. A failure the harness
// already has an instruction for is an enforcement gap, not a missing instruction.

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import type { Inventory } from "../core/types.js";
import { excerpt } from "../core/redact.js";

export interface Mention {
  piece: string;
  path: string;
  line: number;
  text: string;
  term: string;
}

const TEXT_KINDS = new Set(["instructions", "skill", "agent", "command"]);

export async function findMentions(inventory: Inventory, terms: string[], limit = 8): Promise<Mention[]> {
  const wanted = [...new Set(terms.map((t) => t.trim()).filter((t) => t.length >= 3))];
  if (!wanted.length) return [];
  const out: Mention[] = [];
  for (const p of inventory.pieces) {
    if (!TEXT_KINDS.has(p.kind)) continue;
    const abs = p.path.startsWith("~") ? join(homedir(), p.path.slice(1)) : isAbsolute(p.path) ? p.path : join(inventory.projectDir, p.path);
    const text = await readFile(abs, "utf8").catch(() => undefined);
    if (!text) continue;
    const lines = text.split(/\r?\n/);
    for (const term of wanted) {
      const needle = term.toLowerCase();
      lines.forEach((l, i) => {
        if (out.length < limit && l.toLowerCase().includes(needle)) {
          out.push({ piece: p.id, path: p.path, line: i + 1, text: excerpt(l, 160), term });
        }
      });
    }
    if (out.length >= limit) break;
  }
  return out;
}
