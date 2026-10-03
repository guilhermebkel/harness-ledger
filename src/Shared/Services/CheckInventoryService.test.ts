import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Inventory } from "@/Shared/Protocols/HarnessProtocol.ts";
import { SessionFactsBuilder } from "@/Shared/Utils/SessionFactsBuilder.ts";
import { CheckInventoryService } from "@/Shared/Services/CheckInventoryService.ts";

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

describe("CheckInventoryService.inspect()", () => {
  it("finds a JavaScript project's checks, where they run, and what's missing", async () => {
    const projectDir = projectWith({
      "package.json": JSON.stringify({
        private: true,
        scripts: {
          lint: "eslint .",
          typecheck: "tsc --noEmit",
        },
        devDependencies: {
          "eslint": "^9",
          "knip": "^6",
          "@vitest/eslint-plugin": "^1",
          "typescript": "^5",
        },
      }),
      "eslint.config.mjs": "export default [{ rules: { \"complexity\": [\"error\", 10] } }];",
      ".github/workflows/ci.yml": "steps:\n  - run: pnpm lint\n",
    });
    const session = sessionEditing(".ts", 6, ["pnpm lint", "npx tsc --noEmit"]);
    const checks = await new CheckInventoryService(projectDir).inspect([session], inventoryWith());
    expect(checks.languages).toStrictEqual([{ language: "typescript", edits: 6 }]);
    expect(checks.tools.find((tool) => tool.name === "eslint")).toStrictEqual({
      name: "eslint",
      categories: ["lint", "complexity"],
      foundIn: ["package.json", "eslint config"],
      runsIn: ["sessions", "ci"],
      sessions: 1,
    });
    expect(checks.tools.find((tool) => tool.name === "@vitest/eslint-plugin")?.categories).toStrictEqual(["testLint"]);
    expect(checks.unmappedTools).toStrictEqual([]);
    expect(checks.tools.find((tool) => tool.name === "typescript")?.runsIn).toStrictEqual(["sessions"]);
    expect(checks.missing).toStrictEqual([{ language: "typescript", category: "duplication" }]);
    expect(checks.isPublishedPackage).toBe(false);
    expect(checks.isMonorepo).toBe(false);
  });

  it("reads Python and Go configs, including the rules that turn on complexity and test linting", async () => {
    const projectDir = projectWith({
      "pyproject.toml": "[tool.ruff.lint]\nselect = [\"E\", \"C901\", \"PT\"]\n",
      "requirements-dev.txt": "vulture==2.11\n",
      ".golangci.yml": "linters:\n  enable:\n    - gocognit\n    - testifylint\n",
    });
    const sessions = [sessionEditing(".py", 5), sessionEditing(".go", 7)];
    const checks = await new CheckInventoryService(projectDir).inspect(sessions, inventoryWith());
    expect(checks.tools.find((tool) => tool.name === "ruff")?.categories).toStrictEqual(["lint", "complexity", "testLint"]);
    expect(checks.tools.find((tool) => tool.name === "golangci-lint")?.categories).toStrictEqual(["lint", "complexity", "testLint"]);
    expect(checks.missing).toStrictEqual([
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
    expect(checks.missing).toStrictEqual([]);
  });

  it("lists edits in unknown languages as unmapped instead of dropping them, and ignores files that aren't code", async () => {
    const projectDir = projectWith({});
    const sessions = [sessionEditing(".ex", 6), sessionEditing(".md", 9), sessionEditing(".ts", 5)];
    const checks = await new CheckInventoryService(projectDir).inspect(sessions, inventoryWith());
    expect(checks.languages).toStrictEqual([
      { language: "unmapped", extension: ".ex", edits: 6 },
      { language: "typescript", edits: 5 },
    ]);
    expect(checks.missing.map((entry) => entry.language)).not.toContain("unmapped");
    expect(checks.isMissingPartial).toBe(true);
    expect(checks.partialReasons).toStrictEqual(["edits in files with no known language: .ex"]);
  });

  it("lists dependencies that look like checks but aren't in the catalog, and calls the missing list partial", async () => {
    const projectDir = projectWith({
      "package.json": JSON.stringify({ devDependencies: { "eslint": "^9", "eslint-plugin-unicorn": "^56", "react": "^19" } }),
      "requirements-dev.txt": "pydocstyle==6.3\nrequests==2.32\n",
    });
    const checks = await new CheckInventoryService(projectDir).inspect([sessionEditing(".ts", 5)], inventoryWith());
    expect(checks.unmappedTools).toStrictEqual(["eslint-plugin-unicorn", "pydocstyle"]);
    expect(checks.isMissingPartial).toBe(true);
  });

  it("calls the missing list complete when everything is mapped", async () => {
    const projectDir = projectWith({ "package.json": JSON.stringify({ devDependencies: { eslint: "^9" } }) });
    const checks = await new CheckInventoryService(projectDir).inspect([sessionEditing(".ts", 5)], inventoryWith());
    expect(checks.isMissingPartial).toBe(false);
    expect(checks.partialReasons).toStrictEqual([]);
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
