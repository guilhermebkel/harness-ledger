// Maps the Claude Code harness active for a project: instructions, skills, subagents, commands,
// hooks, permissions, MCP servers and plugins. MCP and hook entries are reduced to names and
// shapes (ADR 0007): env values, headers and arguments are hashed to detect changes but never stored.

import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import type { HarnessPiece, Inventory, PieceKind, PieceScope } from "@/Shared/Protocols/HarnessProtocol.js";
import type { InventoryOptions } from "@/Shared/Protocols/ProviderProtocol.js";
import type { GitChangeDates, UnknownRecord } from "@/Shared/Protocols/UtilProtocol.js";
import { FrontmatterUtil } from "@/Shared/Utils/FrontmatterUtil.js";
import { GitUtil } from "@/Shared/Utils/GitUtil.js";
import { GuardUtil } from "@/Shared/Utils/GuardUtil.js";
import { HashUtil } from "@/Shared/Utils/HashUtil.js";
import { NumberUtil } from "@/Shared/Utils/NumberUtil.js";
import { PathUtil } from "@/Shared/Utils/PathUtil.js";
import type {
  ComponentOptions,
  FileChange,
  FilePiece,
  SettingsFile,
  SettingsSummary,
} from "@/Providers/ClaudeCode/Protocols/ClaudeCodeProtocol.js";

const DEFAULT_RETENTION_DAYS = 30;
const MAX_DESCRIPTION_CHARS = 300;
const MAX_COMPONENT_DEPTH = 4;
const HARNESS_PATHS = ["CLAUDE.md", "CLAUDE.local.md", ".claude", ".mcp.json"];
const MAX_SKILL_FILES = 50;
const MAX_SKILL_FOLDER_DEPTH = 3;
/** Larger files are listed but not hashed, to keep the inventory fast. */
const MAX_HASHED_FILE_BYTES = 1_000_000;
const SKIPPED_FOLDERS = new Set(["node_modules", ".git", "__pycache__", ".venv"]);

/** Collects pieces for one inventory, skipping files already seen (e.g. when the project is the home directory). */
class InventoryBuilder {
  readonly pieces: HarnessPiece[] = [];
  readonly notes: string[] = [];
  private readonly seenRealPaths = new Set<string>();

  constructor(
    readonly projectDir: string,
    private readonly gitChangeDates: GitChangeDates,
  ) {}

  async markSeen(file: string): Promise<boolean> {
    const realPath = await realpath(file).catch(() => file);
    if (this.seenRealPaths.has(realPath)) {
      return false;
    }
    this.seenRealPaths.add(realPath);
    return true;
  }

  displayPath(file: string, scope: PieceScope): string {
    const isProjectFile = scope === "project" || scope === "local";
    return isProjectFile ? relative(this.projectDir, file) : PathUtil.tildify(file);
  }

  async changeOf(file: string, scope: PieceScope): Promise<FileChange> {
    const projectRelativePath = relative(this.projectDir, file);
    const isCommittedAsIs = scope === "project" && !this.gitChangeDates.dirtyPaths.has(projectRelativePath);
    const committedAt = isCommittedAsIs ? this.gitChangeDates.pathToCommittedAt.get(projectRelativePath) : undefined;
    if (committedAt) {
      return {
        modifiedAt: committedAt,
        modifiedSource: "git",
      };
    }
    const fileStat = await stat(file).catch(() => undefined);
    return fileStat
      ? {
          modifiedAt: new Date(fileStat.mtimeMs).toISOString(),
          modifiedSource: "mtime",
        }
      : {};
  }

  /** A file's path and content, so renaming or editing a reference changes the skill's hash. */
  private async fileHash(file: string): Promise<string> {
    const fileStat = await stat(file).catch(() => undefined);
    const isHashable = fileStat !== undefined && fileStat.size <= MAX_HASHED_FILE_BYTES;
    const content = isHashable ? await readFile(file).catch(() => Buffer.alloc(0)) : Buffer.from(`${fileStat?.size ?? 0}`);
    return HashUtil.sha(`${relative(this.projectDir, file)}\n${content.toString("base64")}`);
  }

  /** Same name in two scopes (a user and a project skill, say): keep both and disambiguate the id. */
  uniqueId(kind: PieceKind, name: string, scope: PieceScope): string {
    const baseId = `${kind}:${name}`;
    const isTaken = this.pieces.some((piece) => piece.id === baseId);
    return isTaken ? `${baseId}@${scope}` : baseId;
  }

  async addFile(filePiece: FilePiece): Promise<void> {
    const isNew = await this.markSeen(filePiece.file);
    const text = isNew ? await readFile(filePiece.file, "utf8").catch(() => undefined) : undefined;
    if (text === undefined) {
      return;
    }
    const { data } = FrontmatterUtil.parse(text);
    const extraFiles = filePiece.extraFiles ?? [];
    const extraHashes = await Promise.all(extraFiles.map(async (extraFile) => this.fileHash(extraFile)));
    const changes = await Promise.all(
      [filePiece.file, ...extraFiles].map(async (pieceFile) => this.changeOf(pieceFile, filePiece.scope)),
    );
    const latestChange = changes
      .filter((change) => change.modifiedAt !== undefined)
      .sort((left, right) => (right.modifiedAt ?? "").localeCompare(left.modifiedAt ?? ""))[0];
    const pieceFolder = dirname(filePiece.file);
    this.pieces.push({
      id: this.uniqueId(filePiece.kind, filePiece.name, filePiece.scope),
      kind: filePiece.kind,
      name: filePiece.name,
      scope: filePiece.scope,
      path: this.displayPath(filePiece.file, filePiece.scope),
      hash: extraFiles.length ? HashUtil.sha([text, ...extraHashes].join("\n")) : HashUtil.sha(text),
      bytes: Buffer.byteLength(text),
      approxTokens: NumberUtil.approxTokens(text),
      description: FrontmatterUtil.asText(data.description)?.slice(0, MAX_DESCRIPTION_CHARS),
      model: FrontmatterUtil.asText(data.model),
      tools: FrontmatterUtil.asList(data.tools ?? data["allowed-tools"]),
      ...latestChange,
      files: extraFiles.length ? extraFiles.map((extraFile) => relative(pieceFolder, extraFile)) : undefined,
      preloadedSkills: filePiece.kind === "agent" ? FrontmatterUtil.asList(data.skills) : undefined,
      isEditable: filePiece.scope !== "plugin" && filePiece.scope !== "managed",
      plugin: filePiece.plugin,
    });
  }
}

export class ClaudeCodeInventoryService {
  constructor(
    private readonly homeDir: string,
    private readonly claudeJsonPath: string,
  ) {}

  async takeInventory(options: InventoryOptions): Promise<Inventory> {
    const projectDir = options.projectDir;
    const builder = new InventoryBuilder(projectDir, await GitUtil.readChangeDates(projectDir, HARNESS_PATHS));
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
      provider: "claude-code",
      projectDir,
      takenAt: new Date().toISOString(),
      fingerprint,
      pieces: builder.pieces,
      retention: settings.retention,
      notes: builder.notes,
    };
  }

  private async addInstructionFiles(builder: InventoryBuilder, shouldIncludeUser: boolean): Promise<void> {
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

  /** Skills in `<base>/skills/<name>/SKILL.md`, agents in `<base>/agents/**.md`, commands in `<base>/commands/**.md`. */
  private async addComponents(
    builder: InventoryBuilder,
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
        kind: "skill",
        name: `${prefix}${declaredName ?? skillDir}`,
        scope,
        plugin,
        extraFiles,
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
        kind: "agent",
        name: `${prefix}${declaredName ?? this.nameFromPath(agentsDir, file)}`,
        scope,
        plugin,
      });
    }
    const commandsDir = join(baseDir, "commands");
    for (const file of await this.listMarkdownFiles(commandsDir)) {
      await builder.addFile({
        file,
        kind: "command",
        name: `${prefix}${this.nameFromPath(commandsDir, file)}`,
        scope,
        plugin,
      });
    }
  }

  private async declaredNameOf(file: string): Promise<string | undefined> {
    const text = await readFile(file, "utf8").catch(() => "");
    return FrontmatterUtil.asText(FrontmatterUtil.parse(text).data.name);
  }

  /** `agents/review/security.md` → `review:security`, the way Claude Code names nested components. */
  private nameFromPath(baseDir: string, file: string): string {
    return relative(baseDir, file).replace(/\.md$/, "").replace(/[\\/]/g, ":");
  }

  /** Everything in a skill's folder besides SKILL.md, sorted, so the agent knows what to read. */
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
      } else if (entry.isFile() && !isHidden && !(depth === 0 && entry.name === "SKILL.md")) {
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
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(entryPath);
      }
    }
    return files;
  }

  /** Hooks, permissions, enabled plugins and retention, read from lowest to highest precedence so later files win. */
  private async addSettings(builder: InventoryBuilder, shouldIncludeUser: boolean): Promise<SettingsSummary> {
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
        // Only the shape is kept: handler type and program name, never the command line or its arguments.
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

  /** Project servers from `.mcp.json`; user and local servers from the user-level `.claude.json`. */
  private async addMcpServers(builder: InventoryBuilder, shouldIncludeUser: boolean): Promise<void> {
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
      // The full config is hashed so changes are detected, but none of it is stored.
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

  /** Plugins are read-only for the user: findings about them become recommendations, never edits. */
  private async addPlugins(builder: InventoryBuilder, pluginIdToIsEnabled: Map<string, boolean>): Promise<void> {
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

  /** Plugin id → install path, from `installed_plugins.json` (accepts both the older and the versioned shape). */
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
