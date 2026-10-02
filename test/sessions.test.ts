import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { discoverTranscripts, parseSession } from "../src/adapters/claude-code/sessions.js";
import type { SessionFacts, ToolCall } from "../src/core/types.js";
import { FAKE_SECRETS, makeFixture, useFixtureEnv, writeHarness, writeHistory, type Fixture } from "./helpers/fixture.js";

let fixture: Fixture;
let restoreEnv: () => void;
const sessionIdToFacts = new Map<string, SessionFacts>();

beforeAll(async () => {
  fixture = makeFixture();
  writeHarness(fixture);
  writeHistory(fixture);
  restoreEnv = useFixtureEnv(fixture);
  for (const transcript of await discoverTranscripts({ projectDir: fixture.projectDir })) {
    const facts = await parseSession(transcript, { idleMs: 5 * 60_000, projectDir: fixture.projectDir });
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
    const allTranscripts = await discoverTranscripts({ projectDir: fixture.projectDir, shouldReadAllProjects: true });
    expect(allTranscripts.map((transcript) => transcript.sessionId)).toContain("other");
    const projectTranscripts = await discoverTranscripts({ projectDir: fixture.projectDir });
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
