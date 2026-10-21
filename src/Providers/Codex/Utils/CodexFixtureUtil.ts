import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodexFixture } from "@/Providers/Codex/Protocols/CodexFixtureProtocol.ts";
import { CodexRolloutBuilder } from "@/Providers/Codex/Utils/CodexRolloutBuilder.ts";

const FAKE_SECRETS = {
  bearerToken: "abcdefghijklmnop1234567",
  githubToken: "ghp_abcdefghijklmnopqrstuvwxyz123456",
};
const STARTED_AT = "2026-09-01T10:00:00.000Z";
const FAILING_OUTPUT = "Chunk ID: a1\nWall time: 1.2 seconds\nProcess exited with code 1\n"
  + "Original token count: 9\nOutput:\nnpm ERR! Missing script: test";
const PASSING_OUTPUT = "Chunk ID: a2\nWall time: 3.0 seconds\nProcess exited with code 0\n"
  + "Original token count: 4\nOutput:\nTests: 42 passed";
const PATCH = "*** Begin Patch\n*** Update File: src/fetcher.ts\n@@\n-old\n+new\n*** End Patch";
const AGENT_TOML = "name = \"code-reviewer\"\ndescription = \"Reviews diffs\"\nmodel = \"gpt-5.4\"\n"
  + "developer_instructions = \"\"\"\nReview the change.\n\"\"\"\n";
const SKILL_MD = "---\nname: changelog\ndescription: Generates changelog entries\n---\nSteps...\n";
const USER_SKILL_MD = "---\nname: release-notes\ndescription: Writes release notes\n---\nWrite them.\n";

export class CodexFixtureUtil {
  static readonly FAKE_SECRETS = FAKE_SECRETS;

  static makeFixture(): CodexFixture {
    const tempDir = tmpdir();
    const tempRoot = mkdtempSync(join(tempDir, "harness-ledger-codex-"));
    const root = realpathSync(tempRoot);
    const projectDir = join(root, "work", "my-app");
    const skillDir = join(projectDir, ".agents", "skills", "changelog");
    const agentsDir = join(projectDir, ".codex", "agents");
    const userSkillDir = join(root, "agents-home", "skills", "release-notes");
    mkdirSync(skillDir, { recursive: true });
    mkdirSync(agentsDir, { recursive: true });
    mkdirSync(join(root, "codex-home"), { recursive: true });
    mkdirSync(userSkillDir, { recursive: true });
    return {
      root,
      projectDir,
      codexHome: join(root, "codex-home"),
      agentsHome: join(root, "agents-home"),
      dataDir: join(root, "harness-ledger-data"),
    };
  }

  static writeHarness(fixture: CodexFixture): void {
    const { projectDir, codexHome, agentsHome } = fixture;
    const skillDir = join(projectDir, ".agents", "skills", "changelog");
    const mcpToml = "[mcp_servers.github]\ncommand = \"gh-mcp\"\n\n[mcp_servers.github.env]\n"
      + `GITHUB_TOKEN = "${FAKE_SECRETS.githubToken}"\n`;
    writeFileSync(join(projectDir, "AGENTS.md"), "# My app\n\n- Run tests with `pnpm test`, never npm.\n");
    writeFileSync(join(skillDir, "SKILL.md"), SKILL_MD);
    writeFileSync(join(skillDir, "format.md"), "# Entry format\n");
    const agentFile = join(projectDir, ".codex", "agents", "reviewer.toml");
    const configFile = join(projectDir, ".codex", "config.toml");
    const userSkillFile = join(agentsHome, "skills", "release-notes", "SKILL.md");
    writeFileSync(agentFile, AGENT_TOML);
    writeFileSync(configFile, mcpToml);
    writeFileSync(join(codexHome, "AGENTS.md"), "# Personal rules\n");
    writeFileSync(userSkillFile, USER_SKILL_MD);
  }

  static writeSessions(fixture: CodexFixture): void {
    const { projectDir } = fixture;
    const nestedDir = join(projectDir, "packages", "api");
    const otherDir = join(fixture.root, "work", "other-app");
    CodexFixtureUtil.mainSession(fixture, "s1").writeTo(fixture);
    new CodexRolloutBuilder("child1", projectDir, STARTED_AT, { parentId: "s1", role: "explorer" })
      .turn("gpt-5.4-mini")
      .user("Find where retries are configured")
      .call("c1", "exec_command", { cmd: "rg retry src", workdir: projectDir })
      .output("c1", PASSING_OUTPUT)
      .tokens({ total: 500, input: 400, cached: 100, output: 100 })
      .writeTo(fixture);
    new CodexRolloutBuilder("nested", nestedDir, STARTED_AT)
      .turn("gpt-5.4")
      .user("Rename the endpoint")
      .call("n1", "exec_command", { cmd: "ls", workdir: projectDir })
      .output("n1", PASSING_OUTPUT)
      .writeTo(fixture);
    new CodexRolloutBuilder("other", otherDir, STARTED_AT)
      .turn("gpt-5.4")
      .user("Unrelated task")
      .writeTo(fixture);
  }

  static useFixtureEnv(fixture: CodexFixture): () => void {
    const previousHome = process.env.HARNESS_LEDGER_CODEX_HOME;
    const previousAgents = process.env.HARNESS_LEDGER_CODEX_AGENTS_HOME;
    process.env.HARNESS_LEDGER_CODEX_HOME = fixture.codexHome;
    process.env.HARNESS_LEDGER_CODEX_AGENTS_HOME = fixture.agentsHome;
    return () => {
      process.env.HARNESS_LEDGER_CODEX_HOME = previousHome ?? "";
      process.env.HARNESS_LEDGER_CODEX_AGENTS_HOME = previousAgents ?? "";
    };
  }

  private static mainSession(fixture: CodexFixture, sessionId: string): CodexRolloutBuilder {
    const { projectDir } = fixture;
    const secretCommand = `curl -H "Authorization: Bearer ${FAKE_SECRETS.bearerToken}" https://example.com/health`;
    const injected = "# AGENTS.md instructions for /work/my-app\n\n<INSTRUCTIONS>\nRun tests.\n</INSTRUCTIONS>";
    return new CodexRolloutBuilder(sessionId, projectDir, STARTED_AT)
      .turn("gpt-5.4")
      .injectedContext(injected)
      .user("Add a retry to the fetcher")
      .call("a1", "exec_command", { cmd: "npm test", workdir: projectDir })
      .output("a1", FAILING_OUTPUT)
      .tokens({ total: 1000, input: 900, cached: 400, output: 100 })
      .call("a2", "exec_command", { cmd: "pnpm test", workdir: projectDir })
      .output("a2", PASSING_OUTPUT)
      .tokens({ total: 1000, input: 900, cached: 400, output: 100 })
      .tokens({ total: 2500, input: 1300, cached: 800, output: 200 })
      .customCall("a3", "apply_patch", PATCH)
      .output("a3", "Exit code: 0\nWall time: 0.1 seconds\nOutput:\nSuccess.")
      .call("a4", "shell_command", { command: "git status", workdir: projectDir })
      .output("a4", "Exit code: 0\nWall time: 0.1 seconds\nOutput:\nclean")
      .call("a5", "mcp__github__create_issue", { title: "Retry" })
      .output("a5", "ok")
      .call("a6", "update_plan", { plan: [{ step: "retry", status: "in_progress" }] })
      .call("a7", "spawn_agent", { agent_type: "explorer", message: "Find where retries are configured" })
      .call("a8", "exec_command", { cmd: secretCommand, workdir: projectDir })
      .output("a8", "Process exited with code 7\nOutput:\ncurl: (7) Failed to connect")
      .call("a9", "exec_command", { cmd: "rm -rf dist", workdir: projectDir })
      .declined("a9")
      .webSearch("node fetch retry")
      .say("Done.")
      .tokens({ total: 3000, input: 400, cached: 0, output: 100 })
      .compacted()
      .aborted()
      .user("No, use exponential backoff instead")
      .complete(90_000)
      .raw("brand_new_line", { value: 1 })
      .raw("event_msg", { type: "brand_new_event", value: 1 })
      .rawLine("{not json");
  }
}
