// Why: a failure the harness already has an instruction for is an enforcement gap, not a missing instruction.

import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { Inventory, PieceKind } from "@/Shared/Protocols/HarnessProtocol.js";
import type { Mention } from "@/Shared/Protocols/SignalProtocol.js";
import { PathUtil } from "@/Shared/Utils/PathUtil.js";
import { RedactUtil } from "@/Shared/Utils/RedactUtil.js";
import { RegExpUtil } from "@/Shared/Utils/RegExpUtil.js";

const DEFAULT_MAX_MENTIONS = 8;
const MIN_TERM_CHARS = 3;
const MAX_MENTION_CHARS = 160;
const TEXT_KINDS = new Set<PieceKind>(["instructions", "skill", "agent", "command"]);

export class MentionService {
  constructor(private readonly inventory: Inventory) {}

  async find(terms: string[], maxMentions = DEFAULT_MAX_MENTIONS): Promise<Mention[]> {
    const searchTerms = [...new Set(terms.map((term) => term.trim()).filter((term) => term.length >= MIN_TERM_CHARS))];
    const mentions: Mention[] = [];
    for (const piece of this.inventory.pieces.filter((candidate) => TEXT_KINDS.has(candidate.kind))) {
      if (!searchTerms.length || mentions.length >= maxMentions) {
        break;
      }
      const lines = (await readFile(this.absolutePathOf(piece.path), "utf8").catch(() => "")).split(/\r?\n/);
      for (const term of searchTerms) {
        // Why: whole terms only: "cat" must not match "category".
        const termPattern = RegExpUtil.wholeTerm(term, "i");
        lines.forEach((line, lineIndex) => {
          if (mentions.length < maxMentions && termPattern.test(line)) {
            mentions.push({
              piece: piece.id,
              path: piece.path,
              line: lineIndex + 1,
              text: RedactUtil.excerpt(line, MAX_MENTION_CHARS),
              term,
            });
          }
        });
      }
    }
    return mentions;
  }

  private absolutePathOf(piecePath: string): string {
    const expandedPath = PathUtil.untildify(piecePath);
    return isAbsolute(expandedPath) ? expandedPath : join(this.inventory.projectDir, piecePath);
  }
}
