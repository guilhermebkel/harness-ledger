import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { activeTime, discoverTranscripts, parseSession } from "../src/adapters/claude-code/sessions.js";
import type { SessionFacts } from "../src/core/types.js";
import { makeFixture, useFixtureEnv, writeHarness, writeHistory, type Fixture } from "./helpers/fixture.js";

let f: Fixture;
let restore: () => void;
const facts = new Map<string, SessionFacts>();

beforeAll(async () => {
  f = makeFixture();
  writeHarness(f);
  writeHistory(f);
  restore = useFixtureEnv(f);
  for (const t of await discoverTranscripts({ projectDir: f.project })) {
    facts.set(t.sessionId, await parseSession(t, { idleMs: 5 * 60000, projectDir: f.project }));
  }
});
afterAll(() => {
  restore();
  rmSync(f.root, { recursive: true, force: true });
});

describe("discoverTranscripts", () => {
  it("finds only this project's sessions, with subagent files", async () => {
    expect([...facts.keys()].sort()).toEqual(["s1", "s2", "s3", "s4", "s5", "s6"]);
    const all = await discoverTranscripts({ projectDir: f.project, allProjects: true });
    expect(all.map((t) => t.sessionId)).toContain("other");
    const s2 = (await discoverTranscripts({ projectDir: f.project })).find((t) => t.sessionId === "s2")!;
    expect(s2.subagentFiles).toHaveLength(2);
  });
});

describe("parseSession", () => {
  it("resolves subagent types from meta file, Task result and prompt", () => {
    for (const sid of ["s1", "s2", "s3"]) {
      const s = facts.get(sid)!;
      const npm = s.tools.find((c) => c.key === "npm test")!;
      expect(npm.thread.agentType, sid).toBe("test-runner");
      expect(npm.ref.thread).toBe("test-runner");
    }
    const reviewer = facts.get("s2")!.tools.filter((c) => c.thread.agentType === "code-reviewer");
    expect(reviewer).toHaveLength(4);
  });

  it("classifies tool results", () => {
    const s1 = facts.get("s1")!;
    expect(s1.tools.find((c) => c.key === "npm test")!.result).toMatchObject({ isError: true, kind: "error", errorHead: "npm ERR! Missing script: '…'" });
    expect(s1.tools.find((c) => c.key === "pnpm test")!.result!.isError).toBe(false);
    const s4 = facts.get("s4")!;
    expect(s4.tools.filter((c) => c.result?.kind === "permission_denied")).toHaveLength(2);
  });

  it("counts usage once per message even when split across lines", () => {
    const s5 = facts.get("s5")!;
    const toolMsg = s5.messages.find((m) => m.id === "msg_g_s5")!;
    expect(toolMsg.usage).toEqual({ input: 100, output: 50, cacheRead: 1000, cacheWrite: 0 });
  });

  it("cleans prompts and flags corrections and interruptions", () => {
    const s4 = facts.get("s4")!;
    expect(s4.prompts[0]).toMatchObject({ command: "changelog", text: "for v2" });
    expect(s4.prompts[1]!.isCorrection).toBe(true);
    expect(s4.prompts[2]!.isInterruption).toBe(true);
    // Subagent delegation prompts are not the person's prompts.
    expect(facts.get("s1")!.prompts.map((p) => p.text)).not.toContain("Run the test suite for s1");
  });

  it("redacts secrets in commands", () => {
    const s4 = facts.get("s4")!;
    expect(JSON.stringify(s4)).not.toContain("abcdefghijklmnop1234567");
  });

  it("excludes idle gaps from active time", () => {
    const s4 = facts.get("s4")!;
    expect(s4.activeMs).toBeLessThan(5 * 60000);
    expect(activeTime([0, 1000, 2000, 2000 + 10 * 60000], 5 * 60000)).toBe(2000);
  });

  it("keeps evidence pointers to the exact line", () => {
    const npm = facts.get("s1")!.tools.find((c) => c.key === "npm test")!;
    expect(npm.ref.file).toMatch(/subagents\/agent-as1\.jsonl$/);
    expect(npm.ref.line).toBe(3);
  });
});
