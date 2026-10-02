// Where the harness already talks about something. A failure the harness already has an
// instruction for is an enforcement gap, not a missing instruction.

import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { excerpt } from "../core/redact.js";
import type { Inventory, PieceKind } from "../core/types.js";
import { untildify } from "../core/util.js";

const DEFAULT_MAX_MENTIONS = 8;
const MIN_TERM_CHARS = 3;
const MAX_MENTION_CHARS = 160;
const TEXT_KINDS = new Set<PieceKind>(["instructions", "skill", "agent", "command"]);

export interface Mention {
  piece: string;
  path: string;
  line: number;
  text: string;
  term: string;
}

export async function findMentions(
  inventory: Inventory,
  terms: string[],
  maxMentions = DEFAULT_MAX_MENTIONS,
): Promise<Mention[]> {
  const searchTerms = [...new Set(terms.map((term) => term.trim()).filter((term) => term.length >= MIN_TERM_CHARS))];
  const mentions: Mention[] = [];
  for (const piece of inventory.pieces.filter((candidate) => TEXT_KINDS.has(candidate.kind))) {
    if (!searchTerms.length || mentions.length >= maxMentions) {
      break;
    }
    const expandedPath = untildify(piece.path);
    const absolutePath = isAbsolute(expandedPath) ? expandedPath : join(inventory.projectDir, piece.path);
    const lines = (await readFile(absolutePath, "utf8").catch(() => "")).split(/\r?\n/);
    for (const term of searchTerms) {
      const lowerTerm = term.toLowerCase();
      lines.forEach((line, lineIndex) => {
        if (mentions.length < maxMentions && line.toLowerCase().includes(lowerTerm)) {
          mentions.push({
            piece: piece.id,
            path: piece.path,
            line: lineIndex + 1,
            text: excerpt(line, MAX_MENTION_CHARS),
            term,
          });
        }
      });
    }
  }
  return mentions;
}
