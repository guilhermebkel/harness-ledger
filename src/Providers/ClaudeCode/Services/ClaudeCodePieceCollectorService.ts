import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, relative } from "node:path";
import type { HarnessPiece, PieceKind, PieceScope } from "@/Shared/Protocols/HarnessProtocol.ts";
import type { GitChangeDates } from "@/Shared/Protocols/UtilProtocol.ts";
import { FrontmatterUtil } from "@/Shared/Utils/FrontmatterUtil.ts";
import { HashUtil } from "@/Shared/Utils/HashUtil.ts";
import { NumberUtil } from "@/Shared/Utils/NumberUtil.ts";
import { PathUtil } from "@/Shared/Utils/PathUtil.ts";
import type { FileChange, FilePiece } from "@/Providers/ClaudeCode/Protocols/ClaudeCodeProtocol.ts";

const PROJECT_SCOPES = new Set<PieceScope>(["project", "local"]);
// Why: only an agent's frontmatter `skills:` preloads skills; elsewhere the key means something else or nothing.
const KINDS_WITH_SKILLS = new Set<PieceKind>(["agent"]);
const READ_ONLY_SCOPES = new Set<PieceScope>(["plugin", "managed"]);
const MAX_DESCRIPTION_CHARS = 300;
const MAX_HASHED_FILE_BYTES = 1_000_000;

export class ClaudeCodePieceCollectorService {
  static readonly MAX_DESCRIPTION_CHARS = MAX_DESCRIPTION_CHARS;

  readonly pieces: HarnessPiece[] = [];
  readonly notes: string[] = [];
  private readonly seenRealPaths = new Set<string>();

  constructor(
    readonly projectDir: string,
    private readonly gitChangeDates: GitChangeDates,
  ) {}

  async markSeen(file: string): Promise<boolean> {
    const realPath = await realpath(file).catch(() => file);
    // Why: the project can be the home directory, so the same file can come up twice.
    if (this.seenRealPaths.has(realPath)) {
      return false;
    }
    this.seenRealPaths.add(realPath);
    return true;
  }

  displayPath(file: string, scope: PieceScope): string {
    const isProjectFile = PROJECT_SCOPES.has(scope);
    return isProjectFile ? relative(this.projectDir, file) : PathUtil.tildify(file);
  }

  async changeOf(file: string, scope: PieceScope): Promise<FileChange> {
    const projectRelativePath = relative(this.projectDir, file);
    const isCommittedAsIs = scope === "project" && !this.gitChangeDates.dirtyPaths.has(projectRelativePath);
    const committedAt = isCommittedAsIs ? this.gitChangeDates.pathToCommittedAt.get(projectRelativePath) : undefined;
    if (committedAt) {
      return {
        modifiedAt: committedAt,
        modifiedSource: "git",
      };
    }
    const fileStat = await stat(file).catch(() => undefined);
    return fileStat
      ? {
          modifiedAt: new Date(fileStat.mtimeMs).toISOString(),
          modifiedSource: "mtime",
        }
      : {};
  }

  private async fileHash(file: string): Promise<string> {
    const fileStat = await stat(file).catch(() => undefined);
    const isHashable = fileStat !== undefined && fileStat.size <= MAX_HASHED_FILE_BYTES;
    const content = isHashable ? await readFile(file).catch(() => Buffer.alloc(0)) : Buffer.from(`${fileStat?.size ?? 0}`);
    // Why: the path goes in with the content, so renaming a reference changes the skill's hash.
    return HashUtil.sha(`${relative(this.projectDir, file)}\n${content.toString("base64")}`);
  }

  uniqueId(kind: PieceKind, name: string, scope: PieceScope): string {
    const baseId = `${kind}:${name}`;
    const isTaken = this.pieces.some((piece) => piece.id === baseId);
    return isTaken ? `${baseId}@${scope}` : baseId;
  }

  async addFile(filePiece: FilePiece): Promise<void> {
    const isNew = await this.markSeen(filePiece.file);
    const text = isNew ? await readFile(filePiece.file, "utf8").catch(() => undefined) : undefined;
    if (text === undefined) {
      return;
    }
    const { keyToValue } = FrontmatterUtil.parse(text);
    const extraFiles = filePiece.extraFiles ?? [];
    const extraHashes = await Promise.all(extraFiles.map(async (extraFile) => this.fileHash(extraFile)));
    const changes = await Promise.all(
      [filePiece.file, ...extraFiles].map(async (pieceFile) => this.changeOf(pieceFile, filePiece.scope)),
    );
    const latestChange = changes
      .filter((change) => change.modifiedAt !== undefined)
      .sort((left, right) => (right.modifiedAt ?? "").localeCompare(left.modifiedAt ?? ""))[0];
    const pieceFolder = dirname(filePiece.file);
    this.pieces.push({
      id: this.uniqueId(filePiece.kind, filePiece.name, filePiece.scope),
      kind: filePiece.kind,
      name: filePiece.name,
      scope: filePiece.scope,
      path: this.displayPath(filePiece.file, filePiece.scope),
      hash: extraFiles.length ? HashUtil.sha([text, ...extraHashes].join("\n")) : HashUtil.sha(text),
      bytes: Buffer.byteLength(text),
      approxTokens: NumberUtil.approxTokens(text),
      description: FrontmatterUtil.asText(keyToValue.description)?.slice(0, MAX_DESCRIPTION_CHARS),
      model: FrontmatterUtil.asText(keyToValue.model),
      tools: FrontmatterUtil.asList(keyToValue.tools ?? keyToValue["allowed-tools"]),
      ...latestChange,
      files: extraFiles.length ? extraFiles.map((extraFile) => relative(pieceFolder, extraFile)) : undefined,
      preloadedSkills: KINDS_WITH_SKILLS.has(filePiece.kind) ? FrontmatterUtil.asList(keyToValue.skills) : undefined,
      isEditable: !READ_ONLY_SCOPES.has(filePiece.scope),
      plugin: filePiece.plugin,
    });
  }
}
