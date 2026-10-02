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

describe("parseSession on cases seen in real sessions", () => {
  let realFacts: SessionFacts;

  beforeAll(async () => {
    ClaudeCodeFixtureUtil.writeRealCasesSession(fixture, "real1", "2026-09-20T10:00:00.000Z");
    const transcripts = await adapter.discoverTranscripts({ projectDir: fixture.projectDir });
    const transcript = transcripts.find((candidate) => candidate.sessionId === "real1");
    realFacts = await adapter.parseSession(transcript!, { idleMs: 5 * 60_000, projectDir: fixture.projectDir });
  });

  function realCall(name: string, key?: string): ToolCall {
    const call = realFacts.tools.find(
      (candidate) => candidate.name === name && (key === undefined || candidate.key === key),
    );
    if (!call) {
      throw new Error(`Missing ${name} ${key ?? ""}`);
    }
    return call;
  }

  it("tells a rejected plan apart from a permission denial", () => {
    expect(realCall("ExitPlanMode").result?.kind).toBe("user_rejected");
  });

  it("reads auto-mode classifier blocks as permission denials", () => {
    expect(realCall("Bash", "cat").result?.kind).toBe("permission_denied");
  });

  it("keys a Python failure by its exception, not the warning printed before it", () => {
    expect(realCall("Bash", "python3 report.py").result?.errorHead).toBe("ModuleNotFoundError: No module named '…'");
  });

  it("keys git by its subcommand even after -C and skips git warnings", () => {
    const gitCall = realCall("Bash", "git stash");
    expect(gitCall.result?.errorHead).toBe("error: '…' is not a stash reference");
  });

  it("reads prompts typed while the agent was busy, but not task notifications", () => {
    const promptTexts = realFacts.prompts.map((prompt) => prompt.text);
    expect(promptTexts).toContain("não, usa a fila que já existe");
    expect(promptTexts.some((text) => text.includes("Background task finished"))).toBe(false);
    expect(realFacts.prompts.find((prompt) => prompt.text.startsWith("não"))?.isCorrection).toBe(true);
  });

  it("never reads a background-task notification as something the person typed", () => {
    expect(realFacts.prompts.some((prompt) => prompt.text.includes("lint done"))).toBe(false);
  });

  it("keys a shell loop by the command inside it", () => {
    expect(realFacts.tools.some((call) => call.key === "python3 -m py_compile")).toBe(true);
  });

  it("writes paths outside the project from ~, without the user's home folder", () => {
    const homeRead = realFacts.tools.find((call) => call.filePath?.endsWith("review/SKILL.md"));
    expect(homeRead?.filePath).toBe("~/.claude/skills/review/SKILL.md");
  });

  it("keeps the model of every message except Claude Code's synthetic API-error messages", () => {
    const models = realFacts.messages.map((message) => message.model);
    expect(models).toContain("glm-5.2");
    expect(models).not.toContain("<synthetic>");
  });
});

describe("parseSession on data Claude Code computes itself", () => {
  let reportFacts: SessionFacts;

  beforeAll(async () => {
    ClaudeCodeFixtureUtil.writeProviderReportSession(fixture, "rep1", "2026-09-22T10:00:00.000Z");
    const transcripts = await adapter.discoverTranscripts({ projectDir: fixture.projectDir });
    const transcript = transcripts.find((candidate) => candidate.sessionId === "rep1");
    reportFacts = await adapter.parseSession(transcript!, { idleMs: 5 * 60_000, projectDir: fixture.projectDir });
  });

  it("reads API errors with their code, status, thread and model", () => {
    expect(reportFacts.apiErrors).toHaveLength(2);
    expect(reportFacts.apiErrors[0]).toMatchObject({
      status: 404,
      code: "model_not_found",
      model: "glm-5.3",
      thread: { agentType: "migrations-writer" },
    });
  });

  it("adds the last cost of each run of a resumed session and keeps the partial flag", () => {
    expect(reportFacts.reported.costUsd).toBe(2);
    expect(reportFacts.reported.isCostPartial).toBe(true);
  });

  it("reads the main thread's turn durations", () => {
    expect(reportFacts.reported.turns.map((turn) => turn.durationMs)).toEqual([90_000, 30_000]);
  });

  it("takes the subagent type from attributionAgent and the running skill from attributionSkill", () => {
    const write = reportFacts.tools.find((call) => call.name === "Write");
    expect(write?.thread.agentType).toBe("migrations-writer");
    expect(write?.skillInUse).toBe("db-migrations");
  });
});
