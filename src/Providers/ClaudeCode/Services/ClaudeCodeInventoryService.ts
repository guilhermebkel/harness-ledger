// Why: MCP and hook entries keep names and shapes only (ADR 0007); env values, headers and arguments are hashed to detect changes, never stored.

import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import type { HarnessPiece, Inventory, PieceScope } from "@/Shared/Protocols/HarnessProtocol.ts";
import type { InventoryOptions } from "@/Shared/Protocols/ProviderProtocol.ts";
import type { UnknownRecord } from "@/Shared/Protocols/UtilProtocol.ts";
import { FrontmatterUtil } from "@/Shared/Utils/FrontmatterUtil.ts";
import { GitUtil } from "@/Shared/Utils/GitUtil.ts";
import { GuardUtil } from "@/Shared/Utils/GuardUtil.ts";
import { HashUtil } from "@/Shared/Utils/HashUtil.ts";
import { PathUtil } from "@/Shared/Utils/PathUtil.ts";
import { ClaudeCodePieceCollectorService } from "@/Providers/ClaudeCode/Services/ClaudeCodePieceCollectorService.ts";
import type {
  ComponentOptions,
  FileChange,
  FilePiece,
  SettingsFile,
  SettingsSummary,
} from "@/Providers/ClaudeCode/Protocols/ClaudeCodeProtocol.ts";

const DEFAULT_RETENTION_DAYS = 30;
const { MAX_DESCRIPTION_CHARS } = ClaudeCodePieceCollectorService;
const MAX_COMPONENT_DEPTH = 4;
const HARNESS_PATHS = ["CLAUDE.md", "CLAUDE.local.md", ".claude", ".mcp.json"];
const MAX_SKILL_FILES = 50;
const MAX_SKILL_FOLDER_DEPTH = 3;
const SKIPPED_FOLDERS = new Set(["node_modules", ".git", "__pycache__", ".venv"]);

export class ClaudeCodeInventoryService {
  constructor(
    private readonly homeDir: string,
    private readonly claudeJsonPath: string,
  ) {}

  async takeInventory(options: InventoryOptions): Promise<Inventory> {
    const projectDir = options.projectDir;
    const changeDates = await GitUtil.readChangeDates(projectDir, HARNESS_PATHS);
    const builder = new ClaudeCodePieceCollectorService(projectDir, changeDates);
    const shouldIncludeUser = !options.isProjectOnly;

    await this.addInstructionFiles(builder, shouldIncludeUser);
    await this.addComponents(builder, join(projectDir, ".claude"), "project");
    if (shouldIncludeUser) {
      await this.addComponents(builder, this.homeDir, "user");
    }
    const settings = await this.addSettings(builder, shouldIncludeUser);
    await this.addMcpServers(builder, shouldIncludeUser);
    if (shouldIncludeUser) {
      await this.addPlugins(builder, settings.pluginIdToIsEnabled);
    }

    builder.pieces.sort((left, right) => left.id.localeCompare(right.id));
    const fingerprint = HashUtil.sha(builder.pieces.map((piece) => `${piece.id}=${piece.hash}`).join("\n"));
    return {
      projectDir,
      fingerprint,
      provider: "claude-code",
      takenAt: new Date().toISOString(),
      pieces: builder.pieces,
      retention: settings.retention,
      notes: builder.notes,
    };
  }

  private async addInstructionFiles(
    builder: ClaudeCodePieceCollectorService,
    shouldIncludeUser: boolean,
  ): Promise<void> {
    const projectDir = builder.projectDir;
    const instructionFiles: FilePiece[] = [
      {
        file: join(projectDir, "CLAUDE.md"),
        kind: "instructions",
        name: "project",
        scope: "project",
      },
      {
        file: join(projectDir, ".claude", "CLAUDE.md"),
        kind: "instructions",
        name: "project-dotclaude",
        scope: "project",
      },
      {
        file: join(projectDir, "CLAUDE.local.md"),
        kind: "instructions",
        name: "local",
        scope: "local",
      },
    ];
    if (shouldIncludeUser) {
      instructionFiles.push({
        file: join(this.homeDir, "CLAUDE.md"),
        kind: "instructions",
        name: "user",
        scope: "user",
      });
    }
    for (const instructionFile of instructionFiles) {
      await builder.addFile(instructionFile);
    }
  }

  private async addComponents(
    builder: ClaudeCodePieceCollectorService,
    baseDir: string,
    scope: PieceScope,
    componentOptions: ComponentOptions = {},
  ): Promise<void> {
    const prefix = componentOptions.namePrefix ?? "";
    const plugin = componentOptions.plugin;
    for (const skillDir of await readdir(join(baseDir, "skills")).catch(() => [] as string[])) {
      const skillFolder = join(baseDir, "skills", skillDir);
      const file = join(skillFolder, "SKILL.md");
      const declaredName = await this.declaredNameOf(file);
      const extraFiles = await this.skillFolderFiles(skillFolder);
      await builder.addFile({
        file,
        scope,
        plugin,
        extraFiles,
        kind: "skill",
        name: `${prefix}${declaredName ?? skillDir}`,
      });
    }
    const rootSkill = join(baseDir, "SKILL.md");
    const rootSkillStat = componentOptions.canBeRootSkill ? await stat(rootSkill).catch(() => undefined) : undefined;
    if (rootSkillStat !== undefined) {
      await builder.addFile({
        file: rootSkill,
        kind: "skill",
        name: `${prefix}${basename(baseDir)}`,
        scope,
        plugin,
      });
    }
    const agentsDir = join(baseDir, "agents");
    for (const file of await this.listMarkdownFiles(agentsDir)) {
      const declaredName = await this.declaredNameOf(file);
      await builder.addFile({
        file,
        scope,
        plugin,
        kind: "agent",
        name: `${prefix}${declaredName ?? this.nameFromPath(agentsDir, file)}`,
      });
    }
    const commandsDir = join(baseDir, "commands");
    for (const file of await this.listMarkdownFiles(commandsDir)) {
      await builder.addFile({
        file,
        scope,
        plugin,
        kind: "command",
        name: `${prefix}${this.nameFromPath(commandsDir, file)}`,
      });
    }
  }

  private async declaredNameOf(file: string): Promise<string | undefined> {
    const text = await readFile(file, "utf8").catch(() => "");
    return FrontmatterUtil.asText(FrontmatterUtil.parse(text).data.name);
  }

  // Why: Claude Code names nested components with `:` (`agents/review/security.md` → `review:security`).
  private nameFromPath(baseDir: string, file: string): string {
    return relative(baseDir, file).replace(/\.md$/, "").replace(/[\\/]/g, ":");
  }

  private async skillFolderFiles(dir: string, depth = 0): Promise<string[]> {
    if (depth > MAX_SKILL_FOLDER_DEPTH) {
      return [];
    }
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    const files: string[] = [];
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const entryPath = join(dir, entry.name);
      const isHidden = entry.name.startsWith(".");
      if (entry.isDirectory() && !isHidden && !SKIPPED_FOLDERS.has(entry.name)) {
        files.push(...(await this.skillFolderFiles(entryPath, depth + 1)));
      }
      const isSkillEntryFile = depth === 0 && entry.name === "SKILL.md";
      if (entry.isFile() && !isHidden && !isSkillEntryFile) {
        files.push(entryPath);
      }
    }
    return files.slice(0, MAX_SKILL_FILES);
  }

  private async listMarkdownFiles(dir: string, depth = 0): Promise<string[]> {
    if (depth > MAX_COMPONENT_DEPTH) {
      return [];
    }
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    const files: string[] = [];
    for (const entry of entries) {
      const entryPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await this.listMarkdownFiles(entryPath, depth + 1)));
      }
      if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(entryPath);
      }
    }
    return files;
  }

  // Why: settings are read from lowest to highest precedence, so later files win.
  private async addSettings(
    builder: ClaudeCodePieceCollectorService,
    shouldIncludeUser: boolean,
  ): Promise<SettingsSummary> {
    const projectDir = builder.projectDir;
    const settingsFiles: SettingsFile[] = [];
    if (shouldIncludeUser) {
      settingsFiles.push({
        file: join(this.homeDir, "settings.json"),
        scope: "user",
      });
    }
    settingsFiles.push(
      {
        file: join(projectDir, ".claude", "settings.json"),
        scope: "project",
      },
      {
        file: join(projectDir, ".claude", "settings.local.json"),
        scope: "local",
      },
    );
    const summary: SettingsSummary = {
      pluginIdToIsEnabled: new Map(),
      retention: {
        days: DEFAULT_RETENTION_DAYS,
        source: "default",
      },
    };
    for (const { file, scope } of settingsFiles) {
      const isNew = await builder.markSeen(file);
      const settings = isNew ? await this.readJsonFile(file) : undefined;
      if (!settings) {
        continue;
      }
      const change = await builder.changeOf(file, scope);
      const path = builder.displayPath(file, scope);
      const hooks = GuardUtil.asRecord(settings.hooks);
      const hookPieces = this.hookPieces(hooks, path, scope, change);
      builder.pieces.push(...hookPieces);
      const permissions = GuardUtil.asRecord(settings.permissions);
      if (permissions) {
        const permissionsPiece = this.permissionsPiece(permissions, path, scope, change);
        builder.pieces.push(permissionsPiece);
      }
      for (const [pluginId, isEnabled] of Object.entries(GuardUtil.asRecord(settings.enabledPlugins) ?? {})) {
        summary.pluginIdToIsEnabled.set(pluginId, isEnabled === true);
      }
      const retentionDays = GuardUtil.asNumber(settings.cleanupPeriodDays);
      if (retentionDays !== undefined) {
        summary.retention = {
          days: retentionDays,
          source: path,
        };
      }
    }
    return summary;
  }

  private permissionsPiece(
    permissions: UnknownRecord,
    path: string,
    scope: PieceScope,
    change: FileChange,
  ): HarnessPiece {
    const allowCount = GuardUtil.asArray(permissions.allow).length;
    const denyCount = GuardUtil.asArray(permissions.deny).length;
    const serialized = JSON.stringify(permissions);
    return {
      id: `settings:permissions-${scope}`,
      kind: "settings",
      name: `permissions (${scope})`,
      scope,
      path,
      hash: HashUtil.sha(serialized),
      bytes: serialized.length,
      approxTokens: 0,
      description: `${allowCount} allow rules, ${denyCount} deny rules`,
      ...change,
      isEditable: true,
    };
  }

  private hookPieces(
    hooks: UnknownRecord | undefined,
    path: string,
    scope: PieceScope,
    change: FileChange,
  ): HarnessPiece[] {
    const pieces: HarnessPiece[] = [];
    for (const [event, groups] of Object.entries(hooks ?? {})) {
      GuardUtil.asArray(groups).forEach((group, groupIndex) => {
        const groupRecord = GuardUtil.asRecord(group);
        const declaredMatcher = GuardUtil.asString(groupRecord?.matcher);
        const matcher = declaredMatcher === undefined || declaredMatcher === "" ? "*" : declaredMatcher;
        // Why: only the shape is kept (handler type and program name), never the command line or its arguments (ADR 0007).
        const handlerShapes = GuardUtil.asArray(groupRecord?.hooks).map((handler) => {
          const handlerRecord = GuardUtil.asRecord(handler);
          const program = GuardUtil.asString(handlerRecord?.command)?.split(/\s+/)[0] ?? "";
          return `${GuardUtil.asString(handlerRecord?.type) ?? "?"}:${basename(program)}`;
        });
        const serialized = JSON.stringify(group);
        pieces.push({
          id: `hook:${scope}:${event}:${matcher}#${groupIndex}`,
          kind: "hook",
          name: `${event} ${matcher}`,
          scope,
          path,
          hash: HashUtil.sha(serialized),
          bytes: serialized.length,
          approxTokens: 0,
          description: handlerShapes.join(", "),
          ...change,
          isEditable: true,
        });
      });
    }
    return pieces;
  }

  private async addMcpServers(builder: ClaudeCodePieceCollectorService, shouldIncludeUser: boolean): Promise<void> {
    const projectMcpFile = join(builder.projectDir, ".mcp.json");
    const projectMcp = await this.readJsonFile(projectMcpFile);
    const projectServers = GuardUtil.asRecord(projectMcp?.mcpServers);
    const projectChange = await builder.changeOf(projectMcpFile, "project");
    const projectPieces = this.mcpPieces(projectServers, ".mcp.json", "project", projectChange);
    builder.pieces.push(...projectPieces);
    if (!shouldIncludeUser) {
      return;
    }
    const userConfig = await this.readJsonFile(this.claudeJsonPath);
    if (!userConfig) {
      return;
    }
    const displayPath = PathUtil.tildify(this.claudeJsonPath);
    const projectEntry = GuardUtil.asRecord(GuardUtil.asRecord(userConfig.projects)?.[builder.projectDir]);
    const userServers = GuardUtil.asRecord(userConfig.mcpServers);
    const localServers = GuardUtil.asRecord(projectEntry?.mcpServers);
    const userPieces = this.mcpPieces(userServers, displayPath, "user", {});
    const localPieces = this.mcpPieces(localServers, displayPath, "local", {});
    builder.pieces.push(...userPieces, ...localPieces);
  }

  private mcpPieces(
    servers: UnknownRecord | undefined,
    path: string,
    scope: PieceScope,
    change: FileChange,
  ): HarnessPiece[] {
    return Object.entries(servers ?? {}).map(([name, config]) => {
      const configRecord = GuardUtil.asRecord(config);
      const transport = GuardUtil.asString(configRecord?.type) ?? (configRecord?.url === undefined ? "stdio" : "http");
      const command = GuardUtil.asString(configRecord?.command);
      // Why: the full config is hashed to detect changes, but none of it is stored (ADR 0007).
      const serialized = JSON.stringify(config ?? {});
      return {
        id: `mcp:${name}`,
        kind: "mcp",
        name,
        scope,
        path,
        hash: HashUtil.sha(serialized),
        bytes: serialized.length,
        approxTokens: 0,
        description: command === undefined ? transport : `${transport} (${basename(command)})`,
        ...change,
        isEditable: true,
      };
    });
  }

  // Why: plugins are read-only for the user, so findings about them become recommendations, never edits.
  private async addPlugins(
    builder: ClaudeCodePieceCollectorService,
    pluginIdToIsEnabled: Map<string,
      boolean>,
  ): Promise<void> {
    for (const [pluginId, installPath] of await this.readInstalledPlugins()) {
      if (pluginIdToIsEnabled.get(pluginId) === false) {
        continue;
      }
      if (!pluginIdToIsEnabled.has(pluginId)) {
        builder.notes.push(`Plugin ${pluginId} is installed but not listed in enabledPlugins; assumed enabled.`);
      }
      const manifestFile = join(installPath, ".claude-plugin", "plugin.json");
      const manifest = await this.readJsonFile(manifestFile);
      const serialized = JSON.stringify(manifest ?? {});
      builder.pieces.push({
        id: `plugin:${pluginId}`,
        kind: "plugin",
        name: pluginId,
        scope: "plugin",
        path: PathUtil.tildify(installPath),
        hash: HashUtil.sha(serialized),
        bytes: serialized.length,
        approxTokens: 0,
        description: GuardUtil.asString(manifest?.description)?.slice(0, MAX_DESCRIPTION_CHARS),
        isEditable: false,
        plugin: pluginId,
      });
      const pluginName = pluginId.split("@")[0] ?? pluginId;
      await this.addComponents(builder, installPath, "plugin", {
        namePrefix: `${pluginName}:`,
        plugin: pluginId,
        canBeRootSkill: true,
      });
    }
  }

  // Why: `installed_plugins.json` has an older and a versioned shape; both are accepted.
  private async readInstalledPlugins(): Promise<Map<string, string>> {
    const pluginIdToInstallPath = new Map<string, string>();
    const installedFile = join(this.homeDir, "plugins", "installed_plugins.json");
    const installed = await this.readJsonFile(installedFile);
    const plugins = GuardUtil.asRecord(installed?.plugins) ?? installed ?? {};
    for (const [pluginId, value] of Object.entries(plugins)) {
      const installs = Array.isArray(value) ? value : [value];
      const installPath = GuardUtil.asString(GuardUtil.asRecord(installs.at(-1))?.installPath);
      if (installPath) {
        pluginIdToInstallPath.set(pluginId, installPath);
      }
    }
    return pluginIdToInstallPath;
  }

  private async readJsonFile(file: string): Promise<UnknownRecord | undefined> {
    const text = await readFile(file, "utf8").catch(() => undefined);
    return text === undefined ? undefined : GuardUtil.asRecord(GuardUtil.parseJson(text));
  }
}
