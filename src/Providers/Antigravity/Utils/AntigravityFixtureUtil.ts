import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AntigravityFixture } from "@/Providers/Antigravity/Protocols/AntigravityFixtureProtocol.ts";
import { AntigravityTranscriptBuilder } from "@/Providers/Antigravity/Utils/AntigravityTranscriptBuilder.ts";

const FAKE_SECRETS = {
  bearerToken: "ghp_abcdefghijklmnopqrstuvwxyz123456",
};

const AGENTS_MD_CONTENT = "# Project Rules\n\nRun tests with pnpm test.\n";
const SKILL_MD_CONTENT = "---\nname: code-review\ndescription: Reviews code changes\n---\nReview guidelines.\n";
const BOUNDARY_REPEAT_COUNT = 995;

export class AntigravityFixtureUtil {
  static readonly FAKE_SECRETS = FAKE_SECRETS;

  static makeFixture(): AntigravityFixture {
    const tempDir = tmpdir();
    const tempRoot = mkdtempSync(join(tempDir, "harness-ledger-antigravity-"));
    const root = realpathSync(tempRoot);
    const projectDir = join(root, "work", "my-app");
    const antigravityHome = join(root, "antigravity-cli");
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(join(antigravityHome, "brain"), { recursive: true });
    mkdirSync(join(antigravityHome, "cache"), { recursive: true });
    return {
      root,
      projectDir,
      antigravityHome,
      dataDir: join(root, "harness-ledger-data"),
    };
  }

  static writeHarness(fixture: AntigravityFixture): void {
    const agentsFile = join(fixture.projectDir, "AGENTS.md");
    writeFileSync(agentsFile, AGENTS_MD_CONTENT);
    const skillDir = join(fixture.antigravityHome, "builtin", "skills", "code-review");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), SKILL_MD_CONTENT);
  }

  static useFixtureEnv(fixture: AntigravityFixture): () => void {
    const original = process.env.HARNESS_LEDGER_ANTIGRAVITY_HOME;
    process.env.HARNESS_LEDGER_ANTIGRAVITY_HOME = fixture.antigravityHome;
    return () => {
      if (original === undefined) {
        delete process.env.HARNESS_LEDGER_ANTIGRAVITY_HOME;
      } else {
        process.env.HARNESS_LEDGER_ANTIGRAVITY_HOME = original;
      }
    };
  }

  static writeSessions(fixture: AntigravityFixture): void {
    const otherDir = join(fixture.root, "work", "other-app");
    const secretPrompt = `Check repo with token ${FAKE_SECRETS.bearerToken}`;
    const boundarySecretPrompt = "a ".repeat(BOUNDARY_REPEAT_COUNT) + FAKE_SECRETS.bearerToken;
    const lastConversations = {
      [fixture.projectDir]: "s1",
      [otherDir]: "s_other",
    };
    const cacheFile = join(fixture.antigravityHome, "cache", "last_conversations.json");
    const serializedCache = JSON.stringify(lastConversations);
    writeFileSync(cacheFile, serializedCache);
    const historyLines = [
      JSON.stringify({ conversationId: "s1", workspace: fixture.projectDir, timestamp: 1793587786400 }),
      JSON.stringify({ conversationId: "s2", workspace: fixture.projectDir, timestamp: 1793587786500 }),
      JSON.stringify({ conversationId: "s_other", workspace: otherDir, timestamp: 1793587786600 }),
      JSON.stringify({ conversationId: "s_unassociated", timestamp: 1793587786700 }),
    ];
    const historyFile = join(fixture.antigravityHome, "history.jsonl");
    writeFileSync(historyFile, `${historyLines.join("\n")}\n`);
    const secretToolCommand = `curl -H "Authorization: Bearer ${FAKE_SECRETS.bearerToken}" https://example.com`;
    const indexPath = join(fixture.projectDir, "src", "index.ts");
    const utilsPath = join(fixture.projectDir, "src", "utils.ts");
    new AntigravityTranscriptBuilder()
      .userInput("Fix the login bug", { createdAt: "2026-11-05T10:00:00.000Z" })
      .plannerResponse({
        inputTokens: 500,
        outputTokens: 100,
        cacheReadTokens: 0,
        createdAt: "2026-11-05T10:00:05.000Z",
        toolCalls: [
          { name: "read_file", args: { Path: indexPath } },
          { name: "run_command", args: { CommandLine: "pnpm test" } },
        ],
      })
      .userInput("No, keep the tests untouched", { createdAt: "2026-11-05T10:01:00.000Z" })
      .plannerResponse({
        inputTokens: 400,
        outputTokens: 80,
        cacheReadTokens: 500,
        createdAt: "2026-11-05T10:01:05.000Z",
        toolCalls: [
          { name: "edit_file", args: { Path: indexPath } },
          { name: "write_file", args: { Path: utilsPath } },
          { name: "manage_task", args: { Action: "list" } },
          { name: "search_web", args: { query: "pnpm documentation" } },
          { name: "invoke_subagent", args: { TypeName: "reviewer", Prompt: "review code" } },
          { name: "unknown_custom_tool", args: { custom: "payload" } },
          { name: "run_command", args: { CommandLine: secretToolCommand } },
        ],
      })
      .userInput(secretPrompt, { createdAt: "2026-11-05T10:02:00.000Z" })
      .plannerResponse({
        inputTokens: 300,
        outputTokens: 60,
        cacheReadTokens: 700,
        createdAt: "2026-11-05T10:02:05.000Z",
      })
      .userInput(boundarySecretPrompt, { createdAt: "2026-11-05T10:02:10.000Z" })
      .plannerResponse({
        inputTokens: 200,
        outputTokens: 40,
        cacheReadTokens: 800,
        createdAt: "2026-11-05T10:02:15.000Z",
      })
      .generic("syncing context", { createdAt: "2026-11-05T10:02:16.000Z" })
      .checkpoint("checkpoint-1", { createdAt: "2026-11-05T10:02:17.000Z" })
      .systemMessage("System notice", { createdAt: "2026-11-05T10:02:18.000Z" })
      .errorMessage("API error rate limited", { createdAt: "2026-11-05T10:02:19.000Z" })
      .unknownLine("brand_new_event", { detail: "extra" })
      .badLine("MALFORMED_JSON_LINE{{{")
      .writeTo(fixture, "s1");
    new AntigravityTranscriptBuilder()
      .userInput("List files in s2", { createdAt: "2026-11-05T11:00:00.000Z" })
      .plannerResponse({ inputTokens: 200, outputTokens: 50, cacheReadTokens: 0 })
      .writeTo(fixture, "s2");
    new AntigravityTranscriptBuilder()
      .userInput("Other project task", { createdAt: "2026-11-05T12:00:00.000Z" })
      .plannerResponse({ inputTokens: 200, outputTokens: 50, cacheReadTokens: 0 })
      .writeTo(fixture, "s_other");
    new AntigravityTranscriptBuilder()
      .userInput("Unassociated task", { createdAt: "2026-11-05T13:00:00.000Z" })
      .plannerResponse({ inputTokens: 200, outputTokens: 50, cacheReadTokens: 0 })
      .writeTo(fixture, "s_unassociated");
  }
}
