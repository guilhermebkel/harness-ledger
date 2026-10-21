import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CursorFixture } from "@/Providers/Cursor/Protocols/CursorFixtureProtocol.ts";
import { CursorTranscriptBuilder } from "@/Providers/Cursor/Utils/CursorTranscriptBuilder.ts";

const FAKE_SECRETS = {
  bearerToken: "abcdefghijklmnop1234567",
  githubToken: "ghp_abcdefghijklmnopqrstuvwxyz123456",
};
const WORK_DIR = "/work/my-app";
const LOGIN_FILE = `${WORK_DIR}/src/login.ts`;
const PATCH = "*** Begin Patch\n*** Update File: /work/my-app/src/login.ts\n@@\n-old\n+new\n*** End Patch";
const RULE_MDC = "---\ndescription: Keep PRs small\nglobs: src/**/*.ts\nalwaysApply: false\n---\nKeep PRs small.\n";
const SKILL_MD = "---\nname: changelog\ndescription: Generates changelog entries\n---\nSteps...\n";

export class CursorFixtureUtil {
  static readonly FAKE_SECRETS = FAKE_SECRETS;

  static makeFixture(): CursorFixture {
    const tempDir = tmpdir();
    const tempRoot = mkdtempSync(join(tempDir, "harness-ledger-cursor-"));
    const root = realpathSync(tempRoot);
    const projectDir = join(root, "work", "my-app");
    const rulesDir = join(projectDir, ".cursor", "rules");
    const skillDir = join(projectDir, ".cursor", "skills", "changelog");
    mkdirSync(rulesDir, { recursive: true });
    mkdirSync(skillDir, { recursive: true });
    mkdirSync(join(root, "cursor-home"), { recursive: true });
    return {
      root,
      projectDir,
      cursorHome: join(root, "cursor-home"),
      dataDir: join(root, "harness-ledger-data"),
    };
  }

  static writeHarness(fixture: CursorFixture): void {
    const { projectDir, cursorHome } = fixture;
    const mcpJson = JSON.stringify({
      mcpServers: { github: { command: "gh-mcp", env: { GITHUB_TOKEN: FAKE_SECRETS.githubToken } } },
    });
    writeFileSync(join(projectDir, "AGENTS.md"), "# My app\n\n- Run tests with `pnpm test`.\n");
    const ruleFile = join(projectDir, ".cursor", "rules", "small-prs.mdc");
    const skillFile = join(projectDir, ".cursor", "skills", "changelog", "SKILL.md");
    const projectMcpFile = join(projectDir, ".cursor", "mcp.json");
    const userMcp = JSON.stringify({ mcpServers: { docs: { url: "https://example.com/mcp" } } });
    writeFileSync(ruleFile, RULE_MDC);
    writeFileSync(skillFile, SKILL_MD);
    writeFileSync(projectMcpFile, mcpJson);
    writeFileSync(join(cursorHome, "mcp.json"), userMcp);
  }

  static writeSessions(fixture: CursorFixture): void {
    const projectFolder = CursorTranscriptBuilder.folderOf(fixture.projectDir);
    const otherDir = join(fixture.root, "work", "other-app");
    const otherFolder = CursorTranscriptBuilder.folderOf(otherDir);
    const secretCommand = `curl -H "Authorization: Bearer ${FAKE_SECRETS.bearerToken}" https://example.com/health`;
    new CursorTranscriptBuilder()
      .attachment("src/login.ts")
      .user("Fix the login bug")
      .say("Let me look.")
      .tool("ReadFile", { path: LOGIN_FILE, offset: 1, limit: 50 })
      .tool("Grep", { pattern: "login", path: "/work/my-app/src", output_mode: "content" })
      .tool("Shell", { command: "npm test", working_directory: WORK_DIR, description: "Run tests" })
      .tool("StrReplace", { path: LOGIN_FILE, old_string: "old", new_string: "new" })
      .tool("ApplyPatch", PATCH)
      .tool("Subagent", { subagent_type: "explorer", prompt: "Find the session code", description: "Explore" })
      .tool("CallMcpTool", { server: "github", toolName: "create_issue", arguments: {} })
      .tool("Shell", { command: secretCommand, working_directory: WORK_DIR })
      .tool("Brand_New_Tool", { value: 1 })
      .turnEnded()
      .user("No, keep the tests untouched")
      .failedTurn("rate limited")
      .raw({ type: "brand_new_row", value: 1 })
      .rawLine("{not json")
      .writeTo(fixture, projectFolder, "c1.jsonl");
    new CursorTranscriptBuilder()
      .user("Explore the session code")
      .tool("Glob", { glob_pattern: "**/session*.ts", target_directory: WORK_DIR })
      .writeTo(fixture, projectFolder, "c1/subagents/sub1.jsonl");
    new CursorTranscriptBuilder()
      .user("Unrelated task")
      .writeTo(fixture, otherFolder, "o1/o1.jsonl");
  }

  static useFixtureEnv(fixture: CursorFixture): () => void {
    const previousHome = process.env.HARNESS_LEDGER_CURSOR_HOME;
    process.env.HARNESS_LEDGER_CURSOR_HOME = fixture.cursorHome;
    return () => {
      process.env.HARNESS_LEDGER_CURSOR_HOME = previousHome ?? "";
    };
  }
}
