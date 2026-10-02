import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SessionFacts, ToolCall } from "@/Shared/Protocols/SessionProtocol.js";
import { ClaudeCodeFixtureUtil, type Fixture } from "@/Providers/ClaudeCode/Utils/ClaudeCodeFixtureUtil.js";
import { ClaudeCodeProviderAdapter } from "./ClaudeCodeProviderAdapter.js";

const { FAKE_SECRETS } = ClaudeCodeFixtureUtil;

let fixture: Fixture;
let restoreEnv: () => void;
const adapter = new ClaudeCodeProviderAdapter();
const sessionIdToFacts = new Map<string, SessionFacts>();

beforeAll(async () => {
  fixture = ClaudeCodeFixtureUtil.makeFixture();
  ClaudeCodeFixtureUtil.writeHarness(fixture);
  ClaudeCodeFixtureUtil.writeHistory(fixture);
  restoreEnv = ClaudeCodeFixtureUtil.useFixtureEnv(fixture);
  for (const transcript of await adapter.discoverTranscripts({ projectDir: fixture.projectDir })) {
    const facts = await adapter.parseSession(transcript, { idleMs: 5 * 60_000, projectDir: fixture.projectDir });
    sessionIdToFacts.set(transcript.sessionId, facts);
  }
});

afterAll(() => {
  restoreEnv();
  rmSync(fixture.root, { recursive: true, force: true });
});

function factsOf(sessionId: string): SessionFacts {
  const facts = sessionIdToFacts.get(sessionId);
  if (!facts) {
    throw new Error(`Missing session ${sessionId}`);
  }
  return facts;
}

function toolByKey(sessionId: string, key: string): ToolCall {
  const call = factsOf(sessionId).tools.find((candidate) => candidate.key === key);
  if (!call) {
    throw new Error(`Missing tool call ${key} in ${sessionId}`);
  }
  return call;
}

describe("discoverTranscripts", () => {
  it("finds only this project's sessions, with their subagent files", async () => {
    expect([...sessionIdToFacts.keys()].sort()).toEqual(["s1", "s2", "s3", "s4", "s5", "s6"]);
    const allTranscripts = await adapter.discoverTranscripts({
      projectDir: fixture.projectDir,
      shouldReadAllProjects: true,
    });
    expect(allTranscripts.map((transcript) => transcript.sessionId)).toContain("other");
    const projectTranscripts = await adapter.discoverTranscripts({ projectDir: fixture.projectDir });
    const s2Transcript = projectTranscripts.find((transcript) => transcript.sessionId === "s2");
    expect(s2Transcript?.subagentFiles).toHaveLength(2);
    expect(s2Transcript?.isExactProject).toBe(true);
  });
});

describe("parseSession", () => {
  it("resolves subagent types from the meta file, the delegation result and the delegation prompt", () => {
    for (const sessionId of ["s1", "s2", "s3"]) {
      const npmTest = toolByKey(sessionId, "npm test");
      expect(npmTest.thread.agentType, sessionId).toBe("test-runner");
      expect(npmTest.ref.thread).toBe("test-runner");
    }
    const reviewerCalls = factsOf("s2").tools.filter((call) => call.thread.agentType === "code-reviewer");
    expect(reviewerCalls).toHaveLength(4);
  });

  it("classifies tool results", () => {
    expect(toolByKey("s1", "npm test").result).toMatchObject({
      isError: true,
      kind: "error",
      errorHead: "npm ERR! Missing script: '…'",
    });
    expect(toolByKey("s1", "pnpm test").result?.isError).toBe(false);
    const deniedCalls = factsOf("s4").tools.filter((call) => call.result?.kind === "permission_denied");
    expect(deniedCalls).toHaveLength(2);
  });

  it("maps Claude Code tools to shared categories", () => {
    expect(toolByKey("s1", "npm test").category).toBe("shell");
    expect(factsOf("s1").tools.find((call) => call.name === "Task")?.category).toBe("delegation");
    expect(factsOf("s1").tools.find((call) => call.name === "Skill")?.category).toBe("skill");
    expect(factsOf("s2").tools.find((call) => call.name === "Read")?.category).toBe("read");
  });

  it("counts usage once per message even when it is repeated on several lines", () => {
    const toolMessage = factsOf("s5").messages.find((message) => message.id === "msg_g_s5");
    expect(toolMessage?.usage).toEqual({ input: 100, output: 50, cacheRead: 1000, cacheWrite: 0 });
  });

  it("cleans prompts and flags corrections and interruptions", () => {
    const [slashCommand, correction, interruption] = factsOf("s4").prompts;
    expect(slashCommand).toMatchObject({ command: "changelog", text: "for v2" });
    expect(correction?.isCorrection).toBe(true);
    expect(interruption?.isInterruption).toBe(true);
    // A delegation prompt is not something the person typed.
    expect(factsOf("s1").prompts.map((prompt) => prompt.text)).not.toContain("Run the test suite for s1");
  });

  it("redacts secrets in commands", () => {
    expect(JSON.stringify(factsOf("s4"))).not.toContain(FAKE_SECRETS.bearerToken);
  });

  it("excludes idle gaps from the session's active time", () => {
    expect(factsOf("s4").activeMs).toBeLessThan(5 * 60_000);
  });

  it("points evidence at the exact transcript line", () => {
    const npmTest = toolByKey("s1", "npm test");
    expect(npmTest.ref.file).toMatch(/subagents\/agent-as1\.jsonl$/);
    expect(npmTest.ref.line).toBe(3);
  });
});

describe("takeInventory", () => {
  it("maps project and user pieces without storing secret values", async () => {
    const inventory = await adapter.takeInventory({ projectDir: fixture.projectDir });
    expect(inventory.provider).toBe("claude-code");
    expect(inventory.pieces.map((piece) => piece.id)).toEqual(
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
    expect(inventory.pieces.find((piece) => piece.id === "agent:test-runner")).toMatchObject({
      model: "haiku",
      tools: ["Bash", "Read"],
      scope: "project",
      isEditable: true,
    });
    expect(inventory.retention).toEqual({ days: 60, source: ".claude/settings.json" });
    const serialized = JSON.stringify(inventory);
    expect(serialized).not.toContain(FAKE_SECRETS.githubToken);
    expect(serialized).not.toContain(FAKE_SECRETS.anthropicKey);
  });

  it("can leave out user-level pieces", async () => {
    const inventory = await adapter.takeInventory({ projectDir: fixture.projectDir, isProjectOnly: true });
    expect(inventory.pieces.some((piece) => piece.scope === "user")).toBe(false);
  });
});
