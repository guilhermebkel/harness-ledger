import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Inventory } from "@/Shared/Protocols/HarnessProtocol.js";
import { SessionFactsBuilder } from "@/Shared/Utils/SessionFactsFixtureUtil.js";
import { CheckInventoryService } from "./CheckInventoryService.js";

const FAKE_TOKEN = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";
const projectDirs: string[] = [];

function projectWith(files: Record<string, string>): string {
  const tempDir = tmpdir();
  const projectDir = mkdtempSync(join(tempDir, "imh-checks-"));
  projectDirs.push(projectDir);
  for (const [relativePath, content] of Object.entries(files)) {
    const file = join(projectDir, relativePath);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return projectDir;
}

function inventoryWith(hookDescriptions: string[] = []): Inventory {
  return {
    provider: "test",
    projectDir: "/work/app",
    takenAt: "2026-09-01T00:00:00.000Z",
    fingerprint: "x",
    pieces: hookDescriptions.map((description, hookIndex) => ({
      description,
      id: `hook:project:AfterEdit:*#${hookIndex}`,
      kind: "hook",
      name: "AfterEdit *",
      scope: "project",
      path: ".agent/settings.json",
      hash: "h",
      bytes: 10,
      approxTokens: 0,
      isEditable: true,
    })),
    retention: {
      days: 30,
      source: "default",
    },
    notes: [],
  };
}

function sessionEditing(extension: string, edits: number, commands: string[] = []) {
  const builder = new SessionFactsBuilder();
  for (let edit = 0; edit < edits; edit++) {
    builder.call("Edit", { category: "edit", filePath: `src/file${edit}${extension}` });
  }
  for (const command of commands) {
    builder.call(command);
  }
  return builder.build();
}

afterEach(() => {
  for (const projectDir of projectDirs.splice(0)) {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

describe("CheckInventoryService", () => {
  it("finds a JavaScript project's checks, where they run, and what's missing", async () => {
    const projectDir = projectWith({
      "package.json": JSON.stringify({
        private: true,
        scripts: {
          lint: "eslint .",
          typecheck: "tsc --noEmit",
        },
        devDependencies: {
          eslint: "^9",
          knip: "^6",
          typescript: "^5",
        },
      }),
      "eslint.config.mjs": "export default [{ rules: { \"complexity\": [\"error\", 10] } }];",
      ".github/workflows/ci.yml": "steps:\n  - run: pnpm lint\n",
    });
    const session = sessionEditing(".ts", 6, ["pnpm lint", "npx tsc --noEmit"]);
    const checks = await new CheckInventoryService(projectDir).inspect([session], inventoryWith());
    expect(checks.languages).toEqual([{ language: "typescript", edits: 6 }]);
    expect(checks.tools.find((tool) => tool.name === "eslint")).toEqual({
      name: "eslint",
      categories: ["lint", "complexity"],
      foundIn: ["package.json", "eslint config"],
      runsIn: ["sessions", "ci"],
      sessions: 1,
    });
    expect(checks.tools.find((tool) => tool.name === "typescript")?.runsIn).toEqual(["sessions"]);
    expect(checks.missing).toEqual([{ language: "typescript", category: "duplication" }]);
    expect(checks.isPublishedPackage).toBe(false);
    expect(checks.isMonorepo).toBe(false);
  });

  it("reads Python and Go configs, including the rules that turn on complexity", async () => {
    const projectDir = projectWith({
      "pyproject.toml": "[tool.ruff.lint]\nselect = [\"E\", \"C901\"]\n",
      "requirements-dev.txt": "vulture==2.11\n",
      ".golangci.yml": "linters:\n  enable:\n    - gocognit\n",
    });
    const sessions = [sessionEditing(".py", 5), sessionEditing(".go", 7)];
    const checks = await new CheckInventoryService(projectDir).inspect(sessions, inventoryWith());
    expect(checks.tools.find((tool) => tool.name === "ruff")?.categories).toEqual(["lint", "complexity"]);
    expect(checks.missing).toEqual([
      { language: "go", category: "deadCode" },
      { language: "go", category: "duplication" },
      { language: "python", category: "duplication" },
    ]);
  });

  it("tells a published package in a monorepo apart, and ignores languages with few edits", async () => {
    const projectDir = projectWith({
      "package.json": JSON.stringify({ name: "@acme/ui", exports: "./dist/index.js" }),
      "pnpm-workspace.yaml": "packages:\n  - packages/*\n",
    });
    const checks = await new CheckInventoryService(projectDir).inspect([sessionEditing(".ts", 2)], inventoryWith());
    expect(checks.isPublishedPackage).toBe(true);
    expect(checks.isMonorepo).toBe(true);
    expect(checks.missing).toEqual([]);
  });

  it("never outputs script text or secrets from hooks", async () => {
    const projectDir = projectWith({
      "package.json": JSON.stringify({ scripts: { lint: `eslint . --token ${FAKE_TOKEN}` } }),
    });
    const inventory = inventoryWith([`command:check.sh --token ${FAKE_TOKEN}`]);
    const checks = await new CheckInventoryService(projectDir).inspect([sessionEditing(".ts", 1, ["pnpm lint"])], inventory);
    expect(checks.hooks).toHaveLength(1);
    expect(JSON.stringify(checks)).not.toContain(FAKE_TOKEN);
  });
});
