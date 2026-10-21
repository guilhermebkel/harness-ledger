import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PieceFileUtil } from "@/Shared/Utils/PieceFileUtil.ts";

let root: string;

beforeAll(() => {
  const tempDir = tmpdir();
  const tempRoot = mkdtempSync(join(tempDir, "harness-ledger-piece-"));
  root = realpathSync(tempRoot);
  const rulesDir = join(root, "rules");
  mkdirSync(rulesDir, { recursive: true });
  writeFileSync(join(rulesDir, "a.md"), "---\ndescription: Keep it short\nmodel: fast\n---\nBody\n");
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("PieceFileUtil.fromFile()", () => {
  it("reads description and model from frontmatter and the path relative to the project", async () => {
    const file = join(root, "rules", "a.md");
    const piece = await PieceFileUtil.fromFile({ file, kind: "instructions", name: "a", scope: "project", projectDir: root });
    expect(piece).toMatchObject({
      id: "instructions:a",
      path: "rules/a.md",
      description: "Keep it short",
      model: "fast",
      bytes: 52,
      isEditable: true,
    });
  });

  it("returns nothing for a file that does not exist", async () => {
    const file = join(root, "missing.md");
    const piece = await PieceFileUtil.fromFile({ file, kind: "instructions", name: "x", scope: "project", projectDir: root });
    expect(piece).toBeUndefined();
  });
});

describe("PieceFileUtil.withUniqueIds()", () => {
  it("suffixes a repeated id with its scope and sorts by id", () => {
    const project = { id: "skill:b", kind: "skill", name: "b", scope: "project", path: "p", hash: "h", bytes: 1, approxTokens: 1, isEditable: true } as const;
    const user = { ...project, scope: "user" } as const;
    const other = { ...project, id: "skill:a", name: "a" } as const;
    expect(PieceFileUtil.withUniqueIds([project, user, other]).map((piece) => piece.id)).toStrictEqual([
      "skill:a",
      "skill:b",
      "skill:b@user",
    ]);
  });
});

describe("PieceFileUtil.mcpPiece()", () => {
  it("keeps a server's name and where it is declared, nothing else", () => {
    const file = join(root, "mcp.json");
    const piece = PieceFileUtil.mcpPiece({ name: "github", scope: "project", projectDir: root, file });
    expect(piece).toMatchObject({ id: "mcp:github", kind: "mcp", bytes: 0, path: "mcp.json" });
  });
});
