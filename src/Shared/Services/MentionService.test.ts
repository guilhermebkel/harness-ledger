import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Inventory } from "@/Shared/Protocols/HarnessProtocol.js";
import { MentionService } from "./MentionService.js";

const tempDir = tmpdir();
const projectDir = mkdtempSync(join(tempDir, "imh-mentions-"));
const instructionsFile = join(projectDir, "CLAUDE.md");
writeFileSync(instructionsFile, "# App\n\n- Pick a category before you cat the logs.\n- Run `pnpm test`.\n");
const inventory: Inventory = {
  provider: "test",
  projectDir,
  takenAt: "2026-10-01T00:00:00.000Z",
  fingerprint: "x",
  pieces: [{
    id: "instructions:project",
    kind: "instructions",
    name: "project",
    scope: "project",
    path: "CLAUDE.md",
    hash: "x",
    bytes: 0,
    approxTokens: 0,
    isEditable: true,
  }],
  retention: { days: 30, source: "default" },
  notes: [],
};

afterAll(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

describe("MentionService", () => {
  it("matches whole terms only", async () => {
    const mentions = await new MentionService(inventory).find(["cat", "pnpm test", "test"]);
    expect(mentions.map((mention) => [mention.term, mention.line])).toEqual([["cat", 3], ["pnpm test", 4], ["test", 4]]);
  });
});
