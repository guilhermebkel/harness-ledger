import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { HarnessPiece, Inventory, PieceKind, PieceScope } from "@/Shared/Protocols/HarnessProtocol.ts";
import type { InventoryOptions } from "@/Shared/Protocols/ProviderProtocol.ts";
import { GuardUtil } from "@/Shared/Utils/GuardUtil.ts";
import { PieceFileUtil } from "@/Shared/Utils/PieceFileUtil.ts";

const RULE_EXTENSIONS = [".mdc", ".md"];

export class CursorInventoryService {
  constructor(private readonly homeDir: string) {}

  async takeInventory(options: InventoryOptions): Promise<Inventory> {
    const { projectDir } = options;
    const agentsMd = PieceFileUtil.fromFile({
      file: join(projectDir, "AGENTS.md"),
      kind: "instructions",
      name: "AGENTS.md",
      scope: "project",
      projectDir,
    });
    const pieces: HarnessPiece[] = await PieceFileUtil.settled([agentsMd]);
    const scopeToFolder: Record<"project" | "user", string> = {
      project: join(projectDir, ".cursor"),
      user: this.homeDir,
    };
    const scopes: ("project" | "user")[] = options.isProjectOnly ? ["project"] : ["project", "user"];
    for (const scope of scopes) {
      const folder = scopeToFolder[scope];
      pieces.push(
        ...await this.folderPieces(join(folder, "rules"), "instructions", scope, projectDir, RULE_EXTENSIONS),
        ...await this.folderPieces(join(folder, "commands"), "command", scope, projectDir, [".md"]),
        ...await this.folderPieces(join(folder, "agents"), "agent", scope, projectDir, [".md"]),
        ...await this.skillPieces(join(folder, "skills"), scope, projectDir),
        ...await this.mcpPieces(join(folder, "mcp.json"), scope, projectDir),
      );
    }
    const uniquePieces = PieceFileUtil.withUniqueIds(pieces);
    return {
      projectDir,
      fingerprint: PieceFileUtil.fingerprint(uniquePieces),
      provider: "cursor",
      takenAt: new Date().toISOString(),
      pieces: uniquePieces,
      retention: { days: 0, source: "Cursor keeps transcripts until they are deleted" },
      notes: [],
    };
  }

  private async folderPieces(
    folder: string,
    kind: PieceKind,
    scope: PieceScope,
    projectDir: string,
    extensions: string[],
  ): Promise<HarnessPiece[]> {
    const allNames = await readdir(folder).catch(() => [] as string[]);
    const names = allNames.filter((name) => extensions.some((extension) => name.endsWith(extension)));
    return PieceFileUtil.settled(names.map(async (fileName) => {
      const name = basename(fileName).replace(/\.[^.]+$/, "");
      return PieceFileUtil.fromFile({ file: join(folder, fileName), kind, name, scope, projectDir });
    }));
  }

  private async skillPieces(skillsDir: string, scope: PieceScope, projectDir: string): Promise<HarnessPiece[]> {
    const folders = await readdir(skillsDir).catch(() => [] as string[]);
    return PieceFileUtil.settled(folders.map(async (name) =>
      PieceFileUtil.fromFile({ file: join(skillsDir, name, "SKILL.md"), kind: "skill", name, scope, projectDir })));
  }

  private async mcpPieces(file: string, scope: PieceScope, projectDir: string): Promise<HarnessPiece[]> {
    const text = await readFile(file, "utf8").catch(() => undefined);
    const config = GuardUtil.asRecord(text === undefined ? undefined : GuardUtil.parseJson(text));
    const servers = GuardUtil.asRecord(config?.mcpServers) ?? {};
    return Object.keys(servers).map((name) => PieceFileUtil.mcpPiece({ name, file, scope, projectDir }));
  }
}
