import { readFile, stat } from "node:fs/promises";
import { relative } from "node:path";
import type { HarnessPiece, PieceKind, PieceScope } from "@/Shared/Protocols/HarnessProtocol.ts";
import { FrontmatterUtil } from "@/Shared/Utils/FrontmatterUtil.ts";
import { HashUtil } from "@/Shared/Utils/HashUtil.ts";
import { NumberUtil } from "@/Shared/Utils/NumberUtil.ts";
import { PathUtil } from "@/Shared/Utils/PathUtil.ts";

const MAX_DESCRIPTION_CHARS = 300;
const PROJECT_SCOPES = new Set<PieceScope>(["project", "local"]);

export interface PieceFileOptions {
  file: string;
  kind: PieceKind;
  name: string;
  scope: PieceScope;
  projectDir: string;
  description?: string;
  model?: string;
}

export interface McpPieceOptions {
  name: string;
  file: string;
  scope: PieceScope;
  projectDir: string;
}

export class PieceFileUtil {
  static async fromFile(options: PieceFileOptions): Promise<HarnessPiece | undefined> {
    const text = await readFile(options.file, "utf8").catch(() => undefined);
    if (text === undefined) {
      return undefined;
    }
    const { keyToValue } = FrontmatterUtil.parse(text);
    const fileStat = await stat(options.file).catch(() => undefined);
    const description = options.description ?? FrontmatterUtil.asText(keyToValue.description);
    return {
      id: `${options.kind}:${options.name}`,
      kind: options.kind,
      name: options.name,
      scope: options.scope,
      path: PieceFileUtil.displayPath(options.file, options.scope, options.projectDir),
      hash: HashUtil.sha(text),
      bytes: Buffer.byteLength(text),
      approxTokens: NumberUtil.approxTokens(text),
      description: description?.slice(0, MAX_DESCRIPTION_CHARS),
      model: options.model ?? FrontmatterUtil.asText(keyToValue.model),
      modifiedAt: fileStat ? new Date(fileStat.mtimeMs).toISOString() : undefined,
      modifiedSource: fileStat ? "mtime" : undefined,
      isEditable: true,
    };
  }

  static displayPath(file: string, scope: PieceScope, projectDir: string): string {
    const isProjectFile = PROJECT_SCOPES.has(scope);
    return isProjectFile ? relative(projectDir, file) : PathUtil.tildify(file);
  }

  static mcpPiece(options: McpPieceOptions): HarnessPiece {
    return {
      id: `mcp:${options.name}`,
      kind: "mcp",
      name: options.name,
      scope: options.scope,
      path: PieceFileUtil.displayPath(options.file, options.scope, options.projectDir),
      hash: HashUtil.sha(options.name),
      bytes: 0,
      approxTokens: 0,
      isEditable: true,
    };
  }

  static async settled(pending: Promise<HarnessPiece | undefined>[]): Promise<HarnessPiece[]> {
    const pieces = await Promise.all(pending);
    return pieces.filter((piece): piece is HarnessPiece => piece !== undefined);
  }

  static fingerprint(pieces: HarnessPiece[]): string {
    return HashUtil.sha(pieces.map((piece) => `${piece.id}=${piece.hash}`).join("\n"));
  }

  static withUniqueIds(pieces: HarnessPiece[]): HarnessPiece[] {
    const idToCount = new Map<string, number>();
    const unique = pieces.map((piece) => {
      const count = idToCount.get(piece.id) ?? 0;
      idToCount.set(piece.id, count + 1);
      return count === 0 ? piece : { ...piece, id: `${piece.id}@${piece.scope}` };
    });
    return unique.sort((left, right) => left.id.localeCompare(right.id));
  }
}
