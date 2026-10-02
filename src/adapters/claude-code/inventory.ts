// Claude Code harness mapper: what is active for a project right now.
// MCP and hook entries are reduced to names and shapes (ADR 0007): env values,
// headers and arguments are hashed to detect changes but never stored.

import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { asList, asText, parseFrontmatter } from "../../core/frontmatter.js";
import { readGitChangeDates, type GitChangeDates } from "../../core/git.js";
import { asArray, asNumber, asRecord, asString, parseJson, type UnknownRecord } from "../../core/guards.js";
import type {
  HarnessPiece,
  Inventory,
  ModifiedSource,
  PieceKind,
  PieceScope,
  Retention,
} from "../../core/types.js";
import { approxTokens, sha, tildify } from "../../core/util.js";
import { claudeHome, claudeJsonPath } from "./paths.js";

const DEFAULT_RETENTION_DAYS = 30;
const MAX_DESCRIPTION_CHARS = 300;
const MAX_COMPONENT_DEPTH = 4;
const HARNESS_PATHS = ["CLAUDE.md", "CLAUDE.local.md", ".claude", ".mcp.json"];

export interface InventoryOptions {
  projectDir: string;
  claudeHomeDir?: string;
  /** Only what's in the project: no user-level or plugin pieces. */
  isProjectOnly?: boolean;
}

interface FileChange {
  modifiedAt?: string;
  modifiedSource?: ModifiedSource;
}

/** A file-backed piece before it gets its content-derived fields. */
interface FilePiece {
  file: string;
  kind: PieceKind;
  name: string;
  scope: PieceScope;
  plugin?: string;
}

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
    return isProjectFile ? relative(this.projectDir, file) : tildify(file);
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
    const { data } = parseFrontmatter(text);
    this.pieces.push({
      id: this.uniqueId(filePiece.kind, filePiece.name, filePiece.scope),
      kind: filePiece.kind,
      name: filePiece.name,
      scope: filePiece.scope,
      path: this.displayPath(filePiece.file, filePiece.scope),
      hash: sha(text),
      bytes: Buffer.byteLength(text),
      approxTokens: approxTokens(text),
      description: asText(data.description)?.slice(0, MAX_DESCRIPTION_CHARS),
      model: asText(data.model),
      tools: asList(data.tools ?? data["allowed-tools"]),
      ...(await this.changeOf(filePiece.file, filePiece.scope)),
      isEditable: isEditableScope(filePiece.scope),
      plugin: filePiece.plugin,
    });
  }
}

function isEditableScope(scope: PieceScope): boolean {
  return scope !== "plugin" && scope !== "managed";
}

export async function takeInventory(options: InventoryOptions): Promise<Inventory> {
  const homeDir = options.claudeHomeDir ?? claudeHome();
  const projectDir = options.projectDir;
  const builder = new InventoryBuilder(projectDir, await readGitChangeDates(projectDir, HARNESS_PATHS));
  const shouldIncludeUser = !options.isProjectOnly;

  await addInstructionFiles(builder, homeDir, shouldIncludeUser);
  await addComponents(builder, join(projectDir, ".claude"), "project");
  if (shouldIncludeUser) {
    await addComponents(builder, homeDir, "user");
  }
  const settings = await addSettings(builder, homeDir, shouldIncludeUser);
  await addMcpServers(builder, shouldIncludeUser);
  if (shouldIncludeUser) {
    await addPlugins(builder, homeDir, settings.pluginIdToIsEnabled);
  }

  builder.pieces.sort((left, right) => left.id.localeCompare(right.id));
  const fingerprint = sha(builder.pieces.map((piece) => `${piece.id}=${piece.hash}`).join("\n"));
  return {
    agent: "claude-code",
    projectDir,
    takenAt: new Date().toISOString(),
    fingerprint,
    pieces: builder.pieces,
    retention: settings.retention,
    notes: builder.notes,
  };
}

async function addInstructionFiles(
  builder: InventoryBuilder,
  homeDir: string,
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
      file: join(homeDir, "CLAUDE.md"),
      kind: "instructions",
      name: "user",
      scope: "user",
    });
  }
  for (const instructionFile of instructionFiles) {
    await builder.addFile(instructionFile);
  }
}

interface ComponentOptions {
  /** Prefix for names of plugin components, which Claude Code namespaces as `plugin:name`. */
  namePrefix?: string;
  plugin?: string;
  /** A plugin may be a single skill with SKILL.md at its root. */
  canBeRootSkill?: boolean;
}

/** Skills in `<base>/skills/<name>/SKILL.md`, agents in `<base>/agents/**.md`, commands in `<base>/commands/**.md`. */
async function addComponents(
  builder: InventoryBuilder,
  baseDir: string,
  scope: PieceScope,
  componentOptions: ComponentOptions = {},
): Promise<void> {
  const prefix = componentOptions.namePrefix ?? "";
  const plugin = componentOptions.plugin;
  for (const skillDir of await readdir(join(baseDir, "skills")).catch(() => [] as string[])) {
    const file = join(baseDir, "skills", skillDir, "SKILL.md");
    const declaredName = await declaredNameOf(file);
    await builder.addFile({
      file,
      kind: "skill",
      name: `${prefix}${declaredName ?? skillDir}`,
      scope,
      plugin,
    });
  }
  const rootSkill = join(baseDir, "SKILL.md");
  const rootSkillStat = componentOptions.canBeRootSkill ? await stat(rootSkill).catch(() => undefined) : undefined;
  const hasRootSkill = rootSkillStat !== undefined;
  if (hasRootSkill) {
    await builder.addFile({
      file: rootSkill,
      kind: "skill",
      name: `${prefix}${basename(baseDir)}`,
      scope,
      plugin,
    });
  }
  const agentsDir = join(baseDir, "agents");
  for (const file of await listMarkdownFiles(agentsDir)) {
    const declaredName = await declaredNameOf(file);
    await builder.addFile({
      file,
      kind: "agent",
      name: `${prefix}${declaredName ?? nameFromPath(agentsDir, file)}`,
      scope,
      plugin,
    });
  }
  const commandsDir = join(baseDir, "commands");
  for (const file of await listMarkdownFiles(commandsDir)) {
    await builder.addFile({
      file,
      kind: "command",
      name: `${prefix}${nameFromPath(commandsDir, file)}`,
      scope,
      plugin,
    });
  }
}

async function declaredNameOf(file: string): Promise<string | undefined> {
  const text = await readFile(file, "utf8").catch(() => "");
  return asText(parseFrontmatter(text).data.name);
}

/** `agents/review/security.md` → `review:security`, the way Claude Code names nested components. */
function nameFromPath(baseDir: string, file: string): string {
  return relative(baseDir, file).replace(/\.md$/, "").replace(/[\\/]/g, ":");
}

async function listMarkdownFiles(dir: string, depth = 0): Promise<string[]> {
  if (depth > MAX_COMPONENT_DEPTH) {
    return [];
  }
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listMarkdownFiles(entryPath, depth + 1)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(entryPath);
    }
  }
  return files;
}

interface SettingsSummary {
  pluginIdToIsEnabled: Map<string, boolean>;
  retention: Retention;
}

/** Hooks, permissions, enabled plugins and retention, read from lowest to highest precedence so later files win. */
async function addSettings(
  builder: InventoryBuilder,
  homeDir: string,
  shouldIncludeUser: boolean,
): Promise<SettingsSummary> {
  const projectDir = builder.projectDir;
  const settingsFiles: {
    file: string; scope: PieceScope;
  }[] = [];
  if (shouldIncludeUser) {
    settingsFiles.push({
      file: join(homeDir, "settings.json"),
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
    const settings = isNew ? await readJsonFile(file) : undefined;
    if (!settings) {
      continue;
    }
    const change = await builder.changeOf(file, scope);
    const path = builder.displayPath(file, scope);
    builder.pieces.push(...hookPieces(asRecord(settings.hooks), path, scope, change));
    const permissions = asRecord(settings.permissions);
    if (permissions) {
      builder.pieces.push(permissionsPiece(permissions, path, scope, change));
    }
    for (const [pluginId, isEnabled] of Object.entries(asRecord(settings.enabledPlugins) ?? {})) {
      summary.pluginIdToIsEnabled.set(pluginId, isEnabled === true);
    }
    const retentionDays = asNumber(settings.cleanupPeriodDays);
    if (retentionDays !== undefined) {
      summary.retention = {
        days: retentionDays,
        source: path,
      };
    }
  }
  return summary;
}

function permissionsPiece(
  permissions: UnknownRecord,
  path: string,
  scope: PieceScope,
  change: FileChange,
): HarnessPiece {
  const allowCount = asArray(permissions.allow).length;
  const denyCount = asArray(permissions.deny).length;
  const serialized = JSON.stringify(permissions);
  return {
    id: `settings:permissions-${scope}`,
    kind: "settings",
    name: `permissions (${scope})`,
    scope,
    path,
    hash: sha(serialized),
    bytes: serialized.length,
    approxTokens: 0,
    description: `${allowCount} allow rules, ${denyCount} deny rules`,
    ...change,
    isEditable: true,
  };
}

function hookPieces(
  hooks: UnknownRecord | undefined,
  path: string,
  scope: PieceScope,
  change: FileChange,
): HarnessPiece[] {
  const pieces: HarnessPiece[] = [];
  for (const [event, groups] of Object.entries(hooks ?? {})) {
    asArray(groups).forEach((group, groupIndex) => {
      const groupRecord = asRecord(group);
      const declaredMatcher = asString(groupRecord?.matcher);
      const matcher = declaredMatcher === undefined || declaredMatcher === "" ? "*" : declaredMatcher;
      // Only the shape is kept: handler type and program name, never the command line or its arguments.
      const handlerShapes = asArray(groupRecord?.hooks).map((handler) => {
        const handlerRecord = asRecord(handler);
        const program = asString(handlerRecord?.command)?.split(/\s+/)[0] ?? "";
        return `${asString(handlerRecord?.type) ?? "?"}:${basename(program)}`;
      });
      const serialized = JSON.stringify(group);
      pieces.push({
        id: `hook:${scope}:${event}:${matcher}#${groupIndex}`,
        kind: "hook",
        name: `${event} ${matcher}`,
        scope,
        path,
        hash: sha(serialized),
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
async function addMcpServers(builder: InventoryBuilder, shouldIncludeUser: boolean): Promise<void> {
  const projectMcpFile = join(builder.projectDir, ".mcp.json");
  const projectMcp = await readJsonFile(projectMcpFile);
  builder.pieces.push(
    ...mcpPieces(
      asRecord(projectMcp?.mcpServers),
      ".mcp.json",
      "project",
      await builder.changeOf(projectMcpFile, "project"),
    ),
  );
  if (!shouldIncludeUser) {
    return;
  }
  const userConfigFile = claudeJsonPath();
  const userConfig = await readJsonFile(userConfigFile);
  if (!userConfig) {
    return;
  }
  const displayPath = tildify(userConfigFile);
  const projectEntry = asRecord(asRecord(userConfig.projects)?.[builder.projectDir]);
  builder.pieces.push(
    ...mcpPieces(asRecord(userConfig.mcpServers), displayPath, "user", {}),
    ...mcpPieces(asRecord(projectEntry?.mcpServers), displayPath, "local", {}),
  );
}

function mcpPieces(
  servers: UnknownRecord | undefined,
  path: string,
  scope: PieceScope,
  change: FileChange,
): HarnessPiece[] {
  return Object.entries(servers ?? {}).map(([name, config]) => {
    const configRecord = asRecord(config);
    const transport = asString(configRecord?.type) ?? (configRecord?.url === undefined ? "stdio" : "http");
    const command = asString(configRecord?.command);
    // The full config is hashed so changes are detected, but none of it is stored.
    const serialized = JSON.stringify(config ?? {});
    return {
      id: `mcp:${name}`,
      kind: "mcp",
      name,
      scope,
      path,
      hash: sha(serialized),
      bytes: serialized.length,
      approxTokens: 0,
      description: command === undefined ? transport : `${transport} (${basename(command)})`,
      ...change,
      isEditable: true,
    };
  });
}

/** Plugins are read-only for the user: findings about them become recommendations, never edits. */
async function addPlugins(
  builder: InventoryBuilder,
  homeDir: string,
  pluginIdToIsEnabled: Map<string, boolean>,
): Promise<void> {
  for (const [pluginId, installPath] of await readInstalledPlugins(homeDir)) {
    if (pluginIdToIsEnabled.get(pluginId) === false) {
      continue;
    }
    if (!pluginIdToIsEnabled.has(pluginId)) {
      builder.notes.push(`Plugin ${pluginId} is installed but not listed in enabledPlugins; assumed enabled.`);
    }
    const manifest = await readJsonFile(join(installPath, ".claude-plugin", "plugin.json"));
    const serialized = JSON.stringify(manifest ?? {});
    builder.pieces.push({
      id: `plugin:${pluginId}`,
      kind: "plugin",
      name: pluginId,
      scope: "plugin",
      path: tildify(installPath),
      hash: sha(serialized),
      bytes: serialized.length,
      approxTokens: 0,
      description: asString(manifest?.description)?.slice(0, MAX_DESCRIPTION_CHARS),
      isEditable: false,
      plugin: pluginId,
    });
    const pluginName = pluginId.split("@")[0] ?? pluginId;
    await addComponents(builder, installPath, "plugin", {
      namePrefix: `${pluginName}:`,
      plugin: pluginId,
      canBeRootSkill: true,
    });
  }
}

/** Plugin id → install path, from `installed_plugins.json` (accepts both the older and the versioned shape). */
async function readInstalledPlugins(homeDir: string): Promise<Map<string, string>> {
  const pluginIdToInstallPath = new Map<string, string>();
  const installed = await readJsonFile(join(homeDir, "plugins", "installed_plugins.json"));
  const plugins = asRecord(installed?.plugins) ?? installed ?? {};
  for (const [pluginId, value] of Object.entries(plugins)) {
    const installs = Array.isArray(value) ? value : [value];
    const installPath = asString(asRecord(installs.at(-1))?.installPath);
    if (installPath) {
      pluginIdToInstallPath.set(pluginId, installPath);
    }
  }
  return pluginIdToInstallPath;
}

async function readJsonFile(file: string): Promise<UnknownRecord | undefined> {
  const text = await readFile(file, "utf8").catch(() => undefined);
  return text === undefined ? undefined : asRecord(parseJson(text));
}
