import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { AntigravityPathUtil } from "@/Providers/Antigravity/Utils/AntigravityPathUtil.ts";
import type { HarnessPiece, Inventory } from "@/Shared/Protocols/HarnessProtocol.ts";
import type { InventoryOptions } from "@/Shared/Protocols/ProviderProtocol.ts";
import { PieceFileUtil } from "@/Shared/Utils/PieceFileUtil.ts";

const INSTRUCTION_FILES = ["AGENTS.override.md", "AGENTS.md"];
const SKILL_FILE_NAME = "SKILL.md";

export class AntigravityInventoryService {
  constructor(private readonly homeDir: string) {}

  async takeInventory(options: InventoryOptions): Promise<Inventory> {
    const { projectDir, isProjectOnly } = options;
    const pieces: HarnessPiece[] = [];
    const instructionPieces = await this.readInstructionPieces(projectDir);
    pieces.push(...instructionPieces);
    if (!isProjectOnly) {
      const managedSkills = await this.readBuiltinSkills(projectDir);
      pieces.push(...managedSkills);
    }
    const uniquePieces = PieceFileUtil.withUniqueIds(pieces);
    return {
      provider: "antigravity",
      projectDir: projectDir,
      takenAt: new Date().toISOString(),
      fingerprint: PieceFileUtil.fingerprint(uniquePieces),
      pieces: uniquePieces,
      retention: { days: 0, source: "Antigravity keeps transcripts until they are deleted" },
      notes: ["Settings inspection is omitted to prevent reading authentication tokens."],
    };
  }

  private async readInstructionPieces(projectDir: string): Promise<HarnessPiece[]> {
    const pieces: HarnessPiece[] = [];
    for (const fileName of INSTRUCTION_FILES) {
      const file = join(projectDir, fileName);
      const piece = await PieceFileUtil.fromFile({
        file: file,
        name: fileName,
        kind: "instructions",
        scope: "project",
        projectDir: projectDir,
      });
      if (piece) {
        pieces.push(piece);
      }
    }
    return pieces;
  }

  private async readBuiltinSkills(projectDir: string): Promise<HarnessPiece[]> {
    const skillsRoot = AntigravityPathUtil.builtinSkillsDir(this.homeDir);
    const subdirs = await readdir(skillsRoot).catch(() => [] as string[]);
    const pieces: HarnessPiece[] = [];
    for (const name of subdirs) {
      const skillFile = join(skillsRoot, name, SKILL_FILE_NAME);
      const piece = await PieceFileUtil.fromFile({
        file: skillFile,
        kind: "skill",
        name: name,
        scope: "managed",
        projectDir: projectDir,
      });
      if (piece) {
        pieces.push(piece);
      }
    }
    return pieces;
  }
}
