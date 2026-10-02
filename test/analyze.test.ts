import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { takeInventory } from "../src/adapters/claude-code/inventory.js";
import { cmdAnalyze, cmdCompare, cmdSuggestionsAdd, cmdSuggestionsList, cmdSuggestionsSet, suggestionId } from "../src/commands.js";
import { makeFixture, sessionPath, Transcript, useFixtureEnv, writeHarness, writeHistory, type Fixture } from "./helpers/fixture.js";

let f: Fixture;
let restore: () => void;

beforeAll(() => {
  f = makeFixture();
  writeHarness(f);
  writeHistory(f);
  restore = useFixtureEnv(f);
});
afterAll(() => {
  restore();
  rmSync(f.root, { recursive: true, force: true });
});

const common = () => ({ project: f.project, dataDir: f.dataDir });

describe("inventory", () => {
  it("maps project and user pieces without storing secret values", async () => {
    const inv = await takeInventory({ projectDir: f.project, home: f.home });
    const ids = inv.pieces.map((p) => p.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "instructions:project",
        "agent:test-runner",
        "agent:code-reviewer",
        "skill:changelog",
        "mcp:github",
        "hook:project:PreToolUse:Bash#0",
        "settings:permissions-project",
      ]),
    );
    expect(inv.pieces.find((p) => p.id === "agent:test-runner")).toMatchObject({ model: "haiku", tools: ["Bash", "Read"], scope: "project", editable: true });
    expect(inv.retention).toEqual({ days: 60, source: ".claude/settings.json" });
    const json = JSON.stringify(inv);
    expect(json).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz123456");
    expect(json).not.toContain("sk-ant-secretsecretsecret123");
  });

  it("can ignore user-level pieces", async () => {
    const inv = await takeInventory({ projectDir: f.project, home: f.home, projectOnly: true });
    expect(inv.pieces.some((p) => p.scope === "user")).toBe(false);
  });
});

describe("analyze", () => {
  it("finds the enforcement gap with recovery and the instruction that already covers it", async () => {
    const r = await cmdAnalyze(common());
    const npm = r.signals.find((s) => s.id === "failed_command:npm test")!;
    expect(npm).toBeDefined();
    expect(npm.occurrences).toBe(3);
    expect(npm.sessions).toBe(3);
    expect(npm.pieces).toEqual(["agent:test-runner"]);
    expect(npm.details.recoveredWith).toEqual([{ value: "pnpm test", count: 3 }]);
    expect(npm.details.mentions).toEqual(expect.arrayContaining([expect.objectContaining({ piece: "instructions:project", line: 3, term: "pnpm test" })]));
    expect(npm.cost.activeMinutes).toBeGreaterThan(0);
    expect(npm.cost.tokens).toBeGreaterThan(0);
    expect(npm.evidence[0]).toMatchObject({ line: 3, thread: "test-runner" });
    expect(npm.evidence[0]!.excerpt).toContain("npm ERR!");
  });

  it("finds subagent re-reads, repeated reads, permission denials and repeated requests", async () => {
    const r = await cmdAnalyze(common());
    const ids = r.signals.map((s) => s.id);
    expect(ids).toContain("subagent_reread:code-reviewer");
    expect(ids).toContain("repeated_read:code-reviewer:src/auth.ts");
    expect(ids).toContain("permission_denied:rm");
    const repeated = r.signals.find((s) => s.type === "repeated_request")!;
    expect(repeated.sessions).toBe(3);
    expect(r.signals.find((s) => s.id === "permission_denied:rm")!.pieces).toEqual(["skill:changelog"]);
  });

  it("reports history, totals and per-piece usage", async () => {
    const r = await cmdAnalyze(common());
    expect(r.analyzed.sessions).toBe(6);
    expect(r.history).toMatchObject({ transcriptsAvailable: 6, retentionDays: 60 });
    expect(r.totals.tokens).toBeGreaterThan(0);
    expect(r.totals.lostToFailures.activeMinutes).toBeGreaterThan(0);
    const runner = r.usage.find((u) => u.piece === "agent:test-runner")!;
    expect(runner).toMatchObject({ invocations: 3, sessions: 3, toolErrors: 3 });
    expect(runner.models).toContain("claude-haiku-4-5");
  });

  it("never prints secret values", async () => {
    const r = await cmdAnalyze(common());
    const json = JSON.stringify(r);
    for (const secret of ["abcdefghijklmnop1234567", "ghp_abcdefghijklmnopqrstuvwxyz123456", "sk-ant-secretsecretsecret123"]) {
      expect(json).not.toContain(secret);
    }
  });

  it("uses the cache on the next run and focuses on one piece", async () => {
    await cmdAnalyze(common());
    const again = await cmdAnalyze(common());
    expect(again.analyzed).toMatchObject({ parsedNow: 0, fromCache: 6 });
    const focused = await cmdAnalyze({ ...common(), pieces: ["agent:code-reviewer"] });
    expect(focused.analyzed.sessions).toBe(1);
    expect(focused.signals.every((s) => s.pieces.includes("agent:code-reviewer"))).toBe(true);
  });

  it("leaves out excluded sessions", async () => {
    const r = await cmdAnalyze({ ...common(), excludeSessions: ["s5"] });
    expect(r.analyzed.sessions).toBe(5);
  });

  it("filters by period", async () => {
    const r = await cmdAnalyze({ ...common(), since: "2026-09-13" });
    expect(r.analyzed.sessions).toBe(3);
  });
});

describe("suggestions", () => {
  it("gives stable ids, never duplicates, and marks signals as handled", async () => {
    const item = { title: "Enforce pnpm in test-runner", class: "rule_ignored", piece: "agent:test-runner", signals: ["failed_command:npm test"] };
    const first = await cmdSuggestionsAdd({ ...common(), items: [item] });
    const second = await cmdSuggestionsAdd({ ...common(), items: [item] });
    expect(first.added).toEqual([suggestionId(item)]);
    expect(second.added).toEqual([]);
    expect(second.existing[0]!.status).toBe("pending");

    await cmdSuggestionsSet({ ...common(), id: suggestionId(item), status: "rejected", note: "we keep npm in CI" });
    const r = await cmdAnalyze(common());
    expect(r.signals.find((s) => s.id === "failed_command:npm test")!.handled).toEqual({ suggestionId: suggestionId(item), status: "rejected" });
    expect(await cmdSuggestionsList({ ...common(), status: "rejected" })).toHaveLength(1);
  });

  it("rejects incomplete suggestions", async () => {
    await expect(cmdSuggestionsAdd({ ...common(), items: [{ title: "x", class: "y", signals: [] }] })).rejects.toThrow();
  });
});

describe("compare", () => {
  it("refuses to call a winner with too few sessions", async () => {
    const r = await cmdCompare({ ...common(), piece: "agent:test-runner", at: "2026-09-12" });
    expect(r.verdict).toBe("insufficient_data");
    expect(r.before.sessions).toBe(2);
    expect(r.after.sessions).toBe(1);
  });

  it("shows improvement when failures stop after the change", async () => {
    // Five more sessions after the change, where test-runner runs pnpm directly.
    for (let i = 0; i < 5; i++) {
      const sid = `n${i}`;
      const t = new Transcript(sid, f.project, `2026-09-2${i}T10:00:00.000Z`)
        .user("run the tests")
        .tool(`task_${sid}`, "Task", { subagent_type: "test-runner", prompt: `go ${sid}` });
      const sub = new Transcript(sid, f.project, `2026-09-2${i}T10:00:00.000Z`, { sidechain: true, agentId: `x${sid}` })
        .user(`go ${sid}`)
        .tool(`b_${sid}`, "Bash", { command: "pnpm test" })
        .result(`b_${sid}`, "ok");
      sub.write(join(f.home, "projects", sessionPath(f, sid).split("/projects/")[1]!.replace(".jsonl", ""), "subagents", `agent-x${sid}.jsonl`));
      t.result(`task_${sid}`, "ok", false, 30, { agentId: `x${sid}` }).write(sessionPath(f, sid));
    }
    // And two more failing sessions before the change.
    for (const sid of ["o1", "o2"]) {
      const t = new Transcript(sid, f.project, `2026-09-0${sid === "o1" ? 5 : 6}T10:00:00.000Z`)
        .user("run the tests")
        .tool(`task_${sid}`, "Task", { subagent_type: "test-runner", prompt: `old ${sid}` });
      new Transcript(sid, f.project, `2026-09-05T10:00:00.000Z`, { sidechain: true, agentId: `y${sid}` })
        .user(`old ${sid}`)
        .tool(`b_${sid}`, "Bash", { command: "npm test" })
        .result(`b_${sid}`, "Exit code 1\nnpm ERR! Missing script", true)
        .tool(`c_${sid}`, "Bash", { command: "pnpm test" })
        .result(`c_${sid}`, "ok")
        .write(join(f.home, "projects", sessionPath(f, sid).split("/projects/")[1]!.replace(".jsonl", ""), "subagents", `agent-y${sid}.jsonl`));
      t.result(`task_${sid}`, "ok", false, 30, { agentId: `y${sid}` }).write(sessionPath(f, sid));
    }
    const r = await cmdCompare({ ...common(), piece: "agent:test-runner", at: "2026-09-15" });
    expect(r.before.sessions).toBe(5);
    expect(r.after.sessions).toBe(5);
    expect(r.before.errorRate).toBeGreaterThan(0);
    expect(r.after.errorRate).toBe(0);
    expect(r.verdict).toBe("improved");
  });
});
