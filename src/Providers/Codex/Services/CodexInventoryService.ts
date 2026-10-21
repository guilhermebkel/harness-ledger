import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import type { HarnessPiece, Inventory, PieceScope } from "@/Shared/Protocols/HarnessProtocol.ts";
import type { InventoryOptions } from "@/Shared/Protocols/ProviderProtocol.ts";
import { PieceFileUtil } from "@/Shared/Utils/PieceFileUtil.ts";
import { CodexTomlUtil } from "@/Providers/Codex/Utils/CodexTomlUtil.ts";

const INSTRUCTION_FILES = ["AGENTS.override.md", "AGENTS.md"];
const AGENT_KEYS = ["name", "description", "model"];

export class CodexInventoryService {
  constructor(
    private readonly homeDir: string,
    private readonly userSkillsDir: string,
  ) {}

  async takeInventory(options: InventoryOptions): Promise<Inventory> {
    const { projectDir } = options;
    const pieces: HarnessPiece[] = [];
    const places: {
      scope: PieceScope; root: string; skillsDir: string;
    }[] = [
      { scope: "project", root: projectDir, skillsDir: join(projectDir, ".agents", "skills") },
    ];
    if (!options.isProjectOnly) {
      places.push({ scope: "user", root: this.homeDir, skillsDir: this.userSkillsDir });
    }
    for (const place of places) {
      const isProject = place.scope === "project";
      const configFolder = isProject ? join(place.root, ".codex") : place.root;
      pieces.push(
        ...await this.instructionPieces(place.root, place.scope, projectDir),
        ...await this.skillPieces(place.skillsDir, place.scope, projectDir),
        ...await this.agentPieces(join(configFolder, "agents"), place.scope, projectDir),
        ...await this.mcpPieces(join(configFolder, "config.toml"), place.scope, projectDir),
      );
    }
    const uniquePieces = PieceFileUtil.withUniqueIds(pieces);
    return {
      projectDir,
      fingerprint: PieceFileUtil.fingerprint(uniquePieces),
      provider: "codex",
      takenAt: new Date().toISOString(),
      pieces: uniquePieces,
      retention: { days: 0, source: "Codex keeps transcripts until they are deleted" },
      notes: [],
    };
  }

  private async instructionPieces(root: string, scope: PieceScope, projectDir: string): Promise<HarnessPiece[]> {
    return PieceFileUtil.settled(INSTRUCTION_FILES.map(async (name) =>
      PieceFileUtil.fromFile({ file: join(root, name), kind: "instructions", name, scope, projectDir })));
  }

  private async skillPieces(skillsDir: string, scope: PieceScope, projectDir: string): Promise<HarnessPiece[]> {
    const folders = await readdir(skillsDir).catch(() => [] as string[]);
    return PieceFileUtil.settled(folders.map(async (folder) => {
      const piece = await PieceFileUtil.fromFile({ file: join(skillsDir, folder, "SKILL.md"), kind: "skill", name: folder, scope, projectDir });
      return piece && { ...piece, files: await this.extraFiles(join(skillsDir, folder)) };
    }));
  }

  private async extraFiles(skillFolder: string): Promise<string[] | undefined> {
    const names = await readdir(skillFolder, { recursive: true }).catch(() => [] as string[]);
    const files: string[] = [];
    for (const name of names.filter((entry) => basename(entry) !== "SKILL.md")) {
      const fileStat = await stat(join(skillFolder, name)).catch(() => undefined);
      if (fileStat?.isFile()) {
        files.push(name);
      }
    }
    return files.length ? files.sort((left, right) => left.localeCompare(right)) : undefined;
  }

  private async agentPieces(agentsDir: string, scope: PieceScope, projectDir: string): Promise<HarnessPiece[]> {
    const allNames = await readdir(agentsDir).catch(() => [] as string[]);
    const names = allNames.filter((name) => name.endsWith(".toml"));
    return PieceFileUtil.settled(names.map(async (fileName) => {
      const file = join(agentsDir, fileName);
      const text = await readFile(file, "utf8").catch(() => "");
      const { name, description, model } = CodexTomlUtil.topLevelStrings(text, AGENT_KEYS);
      const agentName = name ?? basename(fileName, ".toml");
      return PieceFileUtil.fromFile({ kind: "agent", name: agentName, file, scope, projectDir, description, model });
    }));
  }

  private async mcpPieces(file: string, scope: PieceScope, projectDir: string): Promise<HarnessPiece[]> {
    const text = await readFile(file, "utf8").catch(() => "");
    return CodexTomlUtil.mcpServerNames(text).map((name) => PieceFileUtil.mcpPiece({ name, file, scope, projectDir }));
  }
}
