#!/usr/bin/env node
// improve-my-harness — generated file, edit src/ and run `npm run build`.

// src/cli.ts
import { readFile as readFile5 } from "node:fs/promises";
import { parseArgs } from "node:util";

// src/adapters/claude-code/inventory.ts
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { basename, join as join2, relative } from "node:path";

// src/core/frontmatter.ts
var BLOCK_TEXT_MARKERS = /* @__PURE__ */ new Set(["|", ">", "|-", ">-"]);
function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) {
    return {
      data: {},
      body: text
    };
  }
  const data = {};
  let currentKey;
  let blockMode;
  for (const rawLine of (match[1] ?? "").split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, "");
    const isBlankOrComment = !line.trim() || line.trim().startsWith("#");
    if (isBlankOrComment) {
      continue;
    }
    const listItem = /^\s+-\s+(.*)$/.exec(line);
    if (listItem && currentKey && blockMode !== "text") {
      const previous = data[currentKey];
      const list = Array.isArray(previous) ? previous : [];
      list.push(unquote(listItem[1] ?? ""));
      data[currentKey] = list;
      blockMode = "list";
      continue;
    }
    const isTextContinuation = /^\s+/.test(line) && currentKey !== void 0 && blockMode === "text";
    if (isTextContinuation && currentKey) {
      data[currentKey] = `${String(data[currentKey] ?? "")} ${line.trim()}`.trim();
      continue;
    }
    const keyValue = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!keyValue) {
      continue;
    }
    currentKey = keyValue[1] ?? "";
    const value = (keyValue[2] ?? "").trim();
    blockMode = BLOCK_TEXT_MARKERS.has(value) ? "text" : void 0;
    data[currentKey] = parseScalarOrFlowList(value);
  }
  return {
    data,
    body: text.slice(match[0].length)
  };
}
function asList(value) {
  if (value === void 0 || value === "") {
    return void 0;
  }
  if (Array.isArray(value)) {
    return value;
  }
  const separator = value.includes(",") ? "," : /\s+(?![^(]*\))/;
  return value.split(separator).map((entry) => entry.trim()).filter(Boolean);
}
function asText(value) {
  return typeof value === "string" && value !== "" ? value : void 0;
}
function parseScalarOrFlowList(value) {
  if (BLOCK_TEXT_MARKERS.has(value)) {
    return "";
  }
  const isFlowList = value.startsWith("[") && value.endsWith("]");
  if (isFlowList) {
    return value.slice(1, -1).split(",").map((entry) => unquote(entry.trim())).filter(Boolean);
  }
  return unquote(value);
}
function unquote(text) {
  return text.replace(/^["'](.*)["']$/, "$1");
}

// src/core/git.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
var execFileAsync = promisify(execFile);
var GIT_TIMEOUT_MS = 15e3;
var BYTES_PER_KIBIBYTE = 1024;
var BYTES_PER_MEBIBYTE = BYTES_PER_KIBIBYTE * BYTES_PER_KIBIBYTE;
var GIT_MAX_OUTPUT_MEBIBYTES = 32;
var GIT_MAX_OUTPUT_BYTES = GIT_MAX_OUTPUT_MEBIBYTES * BYTES_PER_MEBIBYTE;
var COMMIT_MARKER = "__COMMIT__";
var PORCELAIN_PATH_OFFSET = 3;
async function readGitChangeDates(repositoryDir, paths) {
  const changeDates = {
    pathToCommittedAt: /* @__PURE__ */ new Map(),
    dirtyPaths: /* @__PURE__ */ new Set()
  };
  try {
    const { stdout: statusOutput } = await execFileAsync(
      "git",
      ["status", "--porcelain", "--untracked-files=all", "--", ...paths],
      { cwd: repositoryDir, timeout: GIT_TIMEOUT_MS }
    );
    for (const line of statusOutput.split("\n").filter((statusLine) => statusLine.length > PORCELAIN_PATH_OFFSET)) {
      changeDates.dirtyPaths.add(line.slice(PORCELAIN_PATH_OFFSET).trim());
    }
    const { stdout: logOutput } = await execFileAsync(
      "git",
      ["log", `--format=${COMMIT_MARKER}%cI`, "--name-only", "--", ...paths],
      { cwd: repositoryDir, timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_MAX_OUTPUT_BYTES }
    );
    let currentCommittedAt;
    for (const line of logOutput.split("\n").map((logLine) => logLine.trim())) {
      if (line.startsWith(COMMIT_MARKER)) {
        currentCommittedAt = line.slice(COMMIT_MARKER.length);
        continue;
      }
      if (line && currentCommittedAt && !changeDates.pathToCommittedAt.has(line)) {
        changeDates.pathToCommittedAt.set(line, currentCommittedAt);
      }
    }
  } catch {
  }
  return changeDates;
}

// src/core/guards.ts
function asRecord(value) {
  const isPlainObject = typeof value === "object" && value !== null && !Array.isArray(value);
  return isPlainObject ? value : void 0;
}
function asString(value) {
  return typeof value === "string" ? value : void 0;
}
function asNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function asArray(value) {
  return Array.isArray(value) ? value : [];
}
function firstString(record, keys) {
  for (const key of keys) {
    const value = asString(record?.[key]);
    if (value !== void 0) {
      return value;
    }
  }
  return void 0;
}
function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return void 0;
  }
}

// src/core/util.ts
import { createHash } from "node:crypto";
import { homedir } from "node:os";
var DEFAULT_HASH_CHARS = 12;
var CHARS_PER_TOKEN = 4;
var DECIMAL_BASE = 10;
function sha(text, length = DEFAULT_HASH_CHARS) {
  return createHash("sha256").update(text).digest("hex").slice(0, length);
}
function approxTokens(text) {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}
function tildify(path) {
  const home = homedir();
  return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}
function untildify(path) {
  return path.startsWith("~") ? `${homedir()}${path.slice(1)}` : path;
}
function round(value, digits = 2) {
  const factor = DECIMAL_BASE ** digits;
  return Math.round(value * factor) / factor;
}
function unique(values) {
  return [...new Set(values)];
}
function countBy(values) {
  const valueToCount = {};
  for (const value of values) {
    valueToCount[value] = (valueToCount[value] ?? 0) + 1;
  }
  return valueToCount;
}
async function mapWithConcurrency(items, concurrency, work) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  const runWorker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex++;
      results[index] = await work(items[index]);
    }
  };
  await Promise.all(Array.from({ length: workerCount }, runWorker));
  return results;
}

// src/adapters/claude-code/paths.ts
import { homedir as homedir2 } from "node:os";
import { join } from "node:path";

// src/core/env.ts
function readEnv(name) {
  const value = process.env[name];
  return value === "" ? void 0 : value;
}

// src/adapters/claude-code/paths.ts
function claudeHome() {
  return readEnv("IMH_CLAUDE_HOME") ?? readEnv("CLAUDE_CONFIG_DIR") ?? join(homedir2(), ".claude");
}
function claudeJsonPath() {
  const configDir = readEnv("CLAUDE_CONFIG_DIR");
  const defaultPath = configDir ? join(configDir, ".claude.json") : join(homedir2(), ".claude.json");
  return readEnv("IMH_CLAUDE_JSON") ?? defaultPath;
}
function encodeProjectDir(projectDir) {
  return projectDir.replace(/[^a-zA-Z0-9]/g, "-");
}

// src/adapters/claude-code/inventory.ts
var DEFAULT_RETENTION_DAYS = 30;
var MAX_DESCRIPTION_CHARS = 300;
var MAX_COMPONENT_DEPTH = 4;
var HARNESS_PATHS = ["CLAUDE.md", "CLAUDE.local.md", ".claude", ".mcp.json"];
var InventoryBuilder = class {
  constructor(projectDir, gitChangeDates) {
    this.projectDir = projectDir;
    this.gitChangeDates = gitChangeDates;
  }
  pieces = [];
  notes = [];
  seenRealPaths = /* @__PURE__ */ new Set();
  async markSeen(file) {
    const realPath = await realpath(file).catch(() => file);
    if (this.seenRealPaths.has(realPath)) {
      return false;
    }
    this.seenRealPaths.add(realPath);
    return true;
  }
  displayPath(file, scope) {
    const isProjectFile = scope === "project" || scope === "local";
    return isProjectFile ? relative(this.projectDir, file) : tildify(file);
  }
  async changeOf(file, scope) {
    const projectRelativePath = relative(this.projectDir, file);
    const isCommittedAsIs = scope === "project" && !this.gitChangeDates.dirtyPaths.has(projectRelativePath);
    const committedAt = isCommittedAsIs ? this.gitChangeDates.pathToCommittedAt.get(projectRelativePath) : void 0;
    if (committedAt) {
      return {
        modifiedAt: committedAt,
        modifiedSource: "git"
      };
    }
    const fileStat = await stat(file).catch(() => void 0);
    return fileStat ? {
      modifiedAt: new Date(fileStat.mtimeMs).toISOString(),
      modifiedSource: "mtime"
    } : {};
  }
  /** Same name in two scopes (a user and a project skill, say): keep both and disambiguate the id. */
  uniqueId(kind, name, scope) {
    const baseId = `${kind}:${name}`;
    const isTaken = this.pieces.some((piece) => piece.id === baseId);
    return isTaken ? `${baseId}@${scope}` : baseId;
  }
  async addFile(filePiece) {
    const isNew = await this.markSeen(filePiece.file);
    const text = isNew ? await readFile(filePiece.file, "utf8").catch(() => void 0) : void 0;
    if (text === void 0) {
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
      ...await this.changeOf(filePiece.file, filePiece.scope),
      isEditable: isEditableScope(filePiece.scope),
      plugin: filePiece.plugin
    });
  }
};
function isEditableScope(scope) {
  return scope !== "plugin" && scope !== "managed";
}
async function takeInventory(options) {
  const homeDir = options.claudeHomeDir ?? claudeHome();
  const projectDir = options.projectDir;
  const builder = new InventoryBuilder(projectDir, await readGitChangeDates(projectDir, HARNESS_PATHS));
  const shouldIncludeUser = !options.isProjectOnly;
  await addInstructionFiles(builder, homeDir, shouldIncludeUser);
  await addComponents(builder, join2(projectDir, ".claude"), "project");
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
    takenAt: (/* @__PURE__ */ new Date()).toISOString(),
    fingerprint,
    pieces: builder.pieces,
    retention: settings.retention,
    notes: builder.notes
  };
}
async function addInstructionFiles(builder, homeDir, shouldIncludeUser) {
  const projectDir = builder.projectDir;
  const instructionFiles = [
    {
      file: join2(projectDir, "CLAUDE.md"),
      kind: "instructions",
      name: "project",
      scope: "project"
    },
    {
      file: join2(projectDir, ".claude", "CLAUDE.md"),
      kind: "instructions",
      name: "project-dotclaude",
      scope: "project"
    },
    {
      file: join2(projectDir, "CLAUDE.local.md"),
      kind: "instructions",
      name: "local",
      scope: "local"
    }
  ];
  if (shouldIncludeUser) {
    instructionFiles.push({
      file: join2(homeDir, "CLAUDE.md"),
      kind: "instructions",
      name: "user",
      scope: "user"
    });
  }
  for (const instructionFile of instructionFiles) {
    await builder.addFile(instructionFile);
  }
}
async function addComponents(builder, baseDir, scope, componentOptions = {}) {
  const prefix = componentOptions.namePrefix ?? "";
  const plugin = componentOptions.plugin;
  for (const skillDir of await readdir(join2(baseDir, "skills")).catch(() => [])) {
    const file = join2(baseDir, "skills", skillDir, "SKILL.md");
    const declaredName = await declaredNameOf(file);
    await builder.addFile({
      file,
      kind: "skill",
      name: `${prefix}${declaredName ?? skillDir}`,
      scope,
      plugin
    });
  }
  const rootSkill = join2(baseDir, "SKILL.md");
  const rootSkillStat = componentOptions.canBeRootSkill ? await stat(rootSkill).catch(() => void 0) : void 0;
  const hasRootSkill = rootSkillStat !== void 0;
  if (hasRootSkill) {
    await builder.addFile({
      file: rootSkill,
      kind: "skill",
      name: `${prefix}${basename(baseDir)}`,
      scope,
      plugin
    });
  }
  const agentsDir = join2(baseDir, "agents");
  for (const file of await listMarkdownFiles(agentsDir)) {
    const declaredName = await declaredNameOf(file);
    await builder.addFile({
      file,
      kind: "agent",
      name: `${prefix}${declaredName ?? nameFromPath(agentsDir, file)}`,
      scope,
      plugin
    });
  }
  const commandsDir = join2(baseDir, "commands");
  for (const file of await listMarkdownFiles(commandsDir)) {
    await builder.addFile({
      file,
      kind: "command",
      name: `${prefix}${nameFromPath(commandsDir, file)}`,
      scope,
      plugin
    });
  }
}
async function declaredNameOf(file) {
  const text = await readFile(file, "utf8").catch(() => "");
  return asText(parseFrontmatter(text).data.name);
}
function nameFromPath(baseDir, file) {
  return relative(baseDir, file).replace(/\.md$/, "").replace(/[\\/]/g, ":");
}
async function listMarkdownFiles(dir, depth = 0) {
  if (depth > MAX_COMPONENT_DEPTH) {
    return [];
  }
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const entryPath = join2(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listMarkdownFiles(entryPath, depth + 1));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(entryPath);
    }
  }
  return files;
}
async function addSettings(builder, homeDir, shouldIncludeUser) {
  const projectDir = builder.projectDir;
  const settingsFiles = [];
  if (shouldIncludeUser) {
    settingsFiles.push({
      file: join2(homeDir, "settings.json"),
      scope: "user"
    });
  }
  settingsFiles.push(
    {
      file: join2(projectDir, ".claude", "settings.json"),
      scope: "project"
    },
    {
      file: join2(projectDir, ".claude", "settings.local.json"),
      scope: "local"
    }
  );
  const summary = {
    pluginIdToIsEnabled: /* @__PURE__ */ new Map(),
    retention: {
      days: DEFAULT_RETENTION_DAYS,
      source: "default"
    }
  };
  for (const { file, scope } of settingsFiles) {
    const isNew = await builder.markSeen(file);
    const settings = isNew ? await readJsonFile(file) : void 0;
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
    if (retentionDays !== void 0) {
      summary.retention = {
        days: retentionDays,
        source: path
      };
    }
  }
  return summary;
}
function permissionsPiece(permissions, path, scope, change) {
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
    isEditable: true
  };
}
function hookPieces(hooks, path, scope, change) {
  const pieces = [];
  for (const [event, groups] of Object.entries(hooks ?? {})) {
    asArray(groups).forEach((group, groupIndex) => {
      const groupRecord = asRecord(group);
      const declaredMatcher = asString(groupRecord?.matcher);
      const matcher = declaredMatcher === void 0 || declaredMatcher === "" ? "*" : declaredMatcher;
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
        isEditable: true
      });
    });
  }
  return pieces;
}
async function addMcpServers(builder, shouldIncludeUser) {
  const projectMcpFile = join2(builder.projectDir, ".mcp.json");
  const projectMcp = await readJsonFile(projectMcpFile);
  builder.pieces.push(
    ...mcpPieces(
      asRecord(projectMcp?.mcpServers),
      ".mcp.json",
      "project",
      await builder.changeOf(projectMcpFile, "project")
    )
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
    ...mcpPieces(asRecord(projectEntry?.mcpServers), displayPath, "local", {})
  );
}
function mcpPieces(servers, path, scope, change) {
  return Object.entries(servers ?? {}).map(([name, config]) => {
    const configRecord = asRecord(config);
    const transport = asString(configRecord?.type) ?? (configRecord?.url === void 0 ? "stdio" : "http");
    const command = asString(configRecord?.command);
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
      description: command === void 0 ? transport : `${transport} (${basename(command)})`,
      ...change,
      isEditable: true
    };
  });
}
async function addPlugins(builder, homeDir, pluginIdToIsEnabled) {
  for (const [pluginId, installPath] of await readInstalledPlugins(homeDir)) {
    if (pluginIdToIsEnabled.get(pluginId) === false) {
      continue;
    }
    if (!pluginIdToIsEnabled.has(pluginId)) {
      builder.notes.push(`Plugin ${pluginId} is installed but not listed in enabledPlugins; assumed enabled.`);
    }
    const manifest = await readJsonFile(join2(installPath, ".claude-plugin", "plugin.json"));
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
      plugin: pluginId
    });
    const pluginName = pluginId.split("@")[0] ?? pluginId;
    await addComponents(builder, installPath, "plugin", {
      namePrefix: `${pluginName}:`,
      plugin: pluginId,
      canBeRootSkill: true
    });
  }
}
async function readInstalledPlugins(homeDir) {
  const pluginIdToInstallPath = /* @__PURE__ */ new Map();
  const installed = await readJsonFile(join2(homeDir, "plugins", "installed_plugins.json"));
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
async function readJsonFile(file) {
  const text = await readFile(file, "utf8").catch(() => void 0);
  return text === void 0 ? void 0 : asRecord(parseJson(text));
}

// src/core/time.ts
var SECONDS_PER_MINUTE = 60;
var MINUTES_PER_HOUR = 60;
var HOURS_PER_DAY = 24;
var MS_PER_SECOND = 1e3;
var MS_PER_MINUTE = SECONDS_PER_MINUTE * MS_PER_SECOND;
var MS_PER_HOUR = MINUTES_PER_HOUR * MS_PER_MINUTE;
var MS_PER_DAY = HOURS_PER_DAY * MS_PER_HOUR;
var DAYS_PER_WEEK = 7;
var DAYS_PER_MONTH = 30;
var PERIOD_UNIT_TO_MS = {
  h: MS_PER_HOUR,
  d: MS_PER_DAY,
  w: DAYS_PER_WEEK * MS_PER_DAY,
  m: DAYS_PER_MONTH * MS_PER_DAY
};
function parsePointInTime(value, nowAtMs = Date.now()) {
  if (!value) {
    return void 0;
  }
  const relative3 = /^(\d+)\s*([hdwm])$/i.exec(value.trim());
  if (relative3) {
    const amount = Number(relative3[1]);
    const unit = (relative3[2] ?? "d").toLowerCase();
    return nowAtMs - amount * PERIOD_UNIT_TO_MS[unit];
  }
  const absoluteAtMs = Date.parse(value);
  if (Number.isNaN(absoluteAtMs)) {
    throw new Error(`Invalid date or period: "${value}". Use e.g. 14d, 2w, 6h or 2026-09-01.`);
  }
  return absoluteAtMs;
}
function msToMinutes(durationMs) {
  return round(durationMs / MS_PER_MINUTE, 1);
}
function toIso(atMs) {
  return atMs === void 0 ? void 0 : new Date(atMs).toISOString();
}
function activeTime(sortedEventsAtMs, idleMs) {
  let activeMs = 0;
  for (let index = 1; index < sortedEventsAtMs.length; index++) {
    const gapMs = (sortedEventsAtMs[index] ?? 0) - (sortedEventsAtMs[index - 1] ?? 0);
    const isWithinActivity = gapMs > 0 && gapMs <= idleMs;
    if (isWithinActivity) {
      activeMs += gapMs;
    }
  }
  return activeMs;
}

// src/core/types.ts
var MAIN_THREAD_ID = "main";

// src/analysis/attribution.ts
var MAIN_PIECE = "main";
var BUILT_IN_SUFFIX = " (built-in)";
var UNKNOWN_SUBAGENT_TYPE = "subagent";
function buildSessionIndex(session, pieceIds) {
  const index = {
    threadIdToMessages: groupMessagesByThread(session.messages),
    toolCallIdToPieces: /* @__PURE__ */ new Map(),
    promptToPreviousTurnPieces: /* @__PURE__ */ new Map()
  };
  const mainEvents = session.prompts.filter((prompt) => prompt.ref.file === session.file).map((prompt) => ({
    line: prompt.ref.line,
    prompt
  }));
  for (const call of session.tools) {
    if (call.thread.id !== MAIN_THREAD_ID) {
      index.toolCallIdToPieces.set(call.id, [pieceIdFor("agent", call.thread.agentType, pieceIds)]);
    } else if (call.ref.file === session.file) {
      mainEvents.push({
        line: call.ref.line,
        call
      });
    }
  }
  mainEvents.sort((left, right) => left.line - right.line);
  let currentTurnPieces = [];
  let lastTurnPieces = [];
  for (const event of mainEvents) {
    if (event.prompt) {
      index.promptToPreviousTurnPieces.set(event.prompt, lastTurnPieces.length ? lastTurnPieces : [MAIN_PIECE]);
      currentTurnPieces = event.prompt.command ? [commandPieceId(event.prompt.command, pieceIds)] : [];
      lastTurnPieces = currentTurnPieces;
      continue;
    }
    const call = event.call;
    if (!call) {
      continue;
    }
    if (call.skill) {
      currentTurnPieces = unique([...currentTurnPieces, pieceIdFor("skill", call.skill, pieceIds)]);
      lastTurnPieces = currentTurnPieces;
    }
    if (call.subagentType) {
      lastTurnPieces = unique([...currentTurnPieces, pieceIdFor("agent", call.subagentType, pieceIds)]);
    }
    index.toolCallIdToPieces.set(call.id, currentTurnPieces.length ? currentTurnPieces : [MAIN_PIECE]);
  }
  return index;
}
function groupMessagesByThread(messages) {
  const threadIdToMessages = /* @__PURE__ */ new Map();
  for (const message of messages) {
    const threadMessages = threadIdToMessages.get(message.thread.id) ?? [];
    threadMessages.push(message);
    threadIdToMessages.set(message.thread.id, threadMessages);
  }
  for (const threadMessages of threadIdToMessages.values()) {
    threadMessages.sort((left, right) => (left.sentAtMs ?? 0) - (right.sentAtMs ?? 0));
  }
  return threadIdToMessages;
}
function pieceIdFor(kind, name, pieceIds) {
  const pieceId = `${kind}:${name}`;
  const isKnown = pieceIds.has(pieceId) || pieceIds.size === 0;
  const isBuiltInAgent = !isKnown && kind === "agent" && name !== UNKNOWN_SUBAGENT_TYPE;
  return isBuiltInAgent ? `${pieceId}${BUILT_IN_SUFFIX}` : pieceId;
}
function commandPieceId(name, pieceIds) {
  return pieceIds.has(`skill:${name}`) ? `skill:${name}` : `command:${name}`;
}
function withoutBuiltInSuffix(pieceId) {
  return pieceId.endsWith(BUILT_IN_SUFFIX) ? pieceId.slice(0, -BUILT_IN_SUFFIX.length) : pieceId;
}
var UNRESOLVED_SUBAGENT_PIECE = `agent:${UNKNOWN_SUBAGENT_TYPE}`;

// src/analysis/cost.ts
var DEFAULT_FAMILY = "default";
var TOKENS_PER_MILLION = 1e6;
var CACHE_READ_INPUT_RATIO = 0.1;
var CACHE_WRITE_INPUT_RATIO = 1.25;
var DEFAULT_PRICES = {
  opus: {
    input: 5,
    output: 25
  },
  sonnet: {
    input: 3,
    output: 15
  },
  haiku: {
    input: 1,
    output: 5
  },
  [DEFAULT_FAMILY]: {
    input: 3,
    output: 15
  }
};
var ZERO_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0
};
function modelFamily(model, prices) {
  const normalizedModel = model?.toLowerCase();
  if (!normalizedModel) {
    return DEFAULT_FAMILY;
  }
  const family = Object.keys(prices).find((key) => key !== DEFAULT_FAMILY && normalizedModel.includes(key));
  return family ?? DEFAULT_FAMILY;
}
function usageCostUsd(usage, model, prices) {
  const price = prices[modelFamily(model, prices)] ?? prices[DEFAULT_FAMILY] ?? DEFAULT_PRICES[DEFAULT_FAMILY];
  if (!price) {
    return 0;
  }
  const cacheReadPrice = price.cacheRead ?? price.input * CACHE_READ_INPUT_RATIO;
  const cacheWritePrice = price.cacheWrite ?? price.input * CACHE_WRITE_INPUT_RATIO;
  const weightedTokens = usage.input * price.input + usage.output * price.output + usage.cacheRead * cacheReadPrice + usage.cacheWrite * cacheWritePrice;
  return weightedTokens / TOKENS_PER_MILLION;
}
function totalTokens(usage) {
  return usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
}
function addUsage(left, right) {
  return {
    input: left.input + right.input,
    output: left.output + right.output,
    cacheRead: left.cacheRead + right.cacheRead,
    cacheWrite: left.cacheWrite + right.cacheWrite
  };
}

// src/core/redact.ts
var MASK = "[REDACTED]";
var DEFAULT_EXCERPT_CHARS = 200;
var SECRET_PATTERNS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, MASK],
  [/\bsk-(?:ant-|proj-|live-|test-)?[A-Za-z0-9_-]{16,}/g, MASK],
  [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g, MASK],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, MASK],
  [/\bglpat-[A-Za-z0-9_-]{16,}/g, MASK],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/g, MASK],
  [/\bAKIA[0-9A-Z]{16}\b/g, MASK],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, MASK],
  [/\b(?:rk|pk|sk)_(?:live|test)_[A-Za-z0-9]{16,}/g, MASK],
  [/\bnpm_[A-Za-z0-9]{30,}/g, MASK],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, MASK],
  [/\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{12,}/gi, `$1 ${MASK}`],
  [/([a-z][a-z0-9+.-]*:\/\/)[^\s:/@]+:[^\s@/]+@/gi, `$1${MASK}@`]
];
var SENSITIVE_ASSIGNMENT = /((?:["']?)[A-Za-z0-9_.-]*(?:pass(?:word|wd)?|secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|credential|auth)[A-Za-z0-9_.-]*["']?\s*[:=]\s*)(["']?)([^\s"',;&]{4,})\2/gi;
function redact(text) {
  if (!text) {
    return text;
  }
  let redacted = text;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, replacement);
  }
  return redacted.replace(
    SENSITIVE_ASSIGNMENT,
    (_match, keyPart, quote) => `${keyPart}${quote}${MASK}${quote}`
  );
}
function excerpt(text, maxChars = DEFAULT_EXCERPT_CHARS) {
  const oneLine = redact(text).replace(/\s+/g, " ").trim();
  return oneLine.length > maxChars ? `${oneLine.slice(0, maxChars - 1)}\u2026` : oneLine;
}

// src/core/normalize.ts
var COMMAND_WRAPPERS = /* @__PURE__ */ new Set(["sudo", "time", "nohup", "env", "command", "exec", "timeout"]);
var NAVIGATION_COMMAND = /^(cd|pushd|popd|export|source|\.|set)\b/;
var ENV_ASSIGNMENT = /^[A-Z_][A-Z0-9_]*=/;
var PROGRAMS_WITH_SUBCOMMAND = /* @__PURE__ */ new Set([
  "npm",
  "pnpm",
  "yarn",
  "bun",
  "npx",
  "bunx",
  "git",
  "gh",
  "docker",
  "kubectl",
  "helm",
  "cargo",
  "go",
  "make",
  "pip",
  "pip3",
  "uv",
  "poetry",
  "dotnet",
  "mvn",
  "gradle",
  "./gradlew",
  "terraform",
  "aws",
  "gcloud",
  "az",
  "brew",
  "apt",
  "apt-get",
  "composer",
  "bundle",
  "rails",
  "mix",
  "deno",
  "turbo",
  "nx"
]);
var RUNNER_SUBCOMMANDS = /* @__PURE__ */ new Set(["run", "exec", "x", "dlx", "-m"]);
var MAX_SUBCOMMAND_CHARS = 30;
function commandKey(command) {
  const segments = command.split(/&&|\|\||;|\n/).map((segment) => segment.trim()).filter(Boolean);
  const mainSegment = segments.find((segment) => !NAVIGATION_COMMAND.test(segment)) ?? segments[0] ?? command;
  const firstPipelineStage = mainSegment.split(/\s\|\s?/)[0] ?? mainSegment;
  const tokens = firstPipelineStage.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  const programIndex = tokens.findIndex((token) => !ENV_ASSIGNMENT.test(token) && !COMMAND_WRAPPERS.has(token));
  const programToken = programIndex === -1 ? void 0 : tokens[programIndex];
  if (!programToken) {
    return "(empty)";
  }
  const isPathToProgram = programToken.includes("/") && !programToken.startsWith("./gradlew");
  const program = isPathToProgram ? programToken.split("/").pop() ?? programToken : programToken;
  const keyParts = [program];
  const hasSubcommand = PROGRAMS_WITH_SUBCOMMAND.has(program) || program.startsWith("python");
  if (hasSubcommand) {
    const [subcommand, target] = tokens.slice(programIndex + 1);
    if (subcommand && (isPlainWord(subcommand) || subcommand === "-m")) {
      keyParts.push(subcommand);
      if (RUNNER_SUBCOMMANDS.has(subcommand) && target && isPlainWord(target)) {
        keyParts.push(target);
      }
    }
  }
  return redact(keyParts.join(" "));
}
function isPlainWord(token) {
  return /^[a-z][\w:.@-]*$/i.test(token) && token.length <= MAX_SUBCOMMAND_CHARS && !token.includes("/");
}
var ERROR_LINES_TO_SCAN = 8;
var MAX_ERROR_KEY_CHARS = 160;
var ERROR_LOOKING_LINE = /error|fail|denied|not found|no such|invalid|cannot|can't|unable|exception|refused|timed? ?out|"reason"/i;
function errorKey(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !/^exit code \d+$/i.test(line) && !/^<\/?[\w-]+\s*\/?>$/.test(line));
  const errorLine = lines.slice(0, ERROR_LINES_TO_SCAN).find((line) => ERROR_LOOKING_LINE.test(line));
  const head = (errorLine ?? lines[0] ?? text.trim()).replace(/<\/?tool_use_error>/g, "");
  const structuredReason = /"reason"\s*:\s*"([^"]{1,60})"/.exec(head)?.[1];
  const errorText = structuredReason ? `reason: ${structuredReason}` : head;
  return redact(errorText).replace(/(["'`]).{1,200}?\1/g, "'\u2026'").replace(/(?:[A-Za-z]:)?[~.]?\/[\w@.+-]+(?:\/[\w@.+-]+)*/g, "<path>").replace(/\b\d+(\.\d+)*\b/g, "N").replace(/\s+/g, " ").slice(0, MAX_ERROR_KEY_CHARS).trim();
}
var HARNESS_INJECTED_BLOCKS = /<(system-reminder|command-message|command-args|local-command-stdout|local-command-stderr|local-command-caveat|bash-input|bash-stdout|bash-stderr|user-prompt-submit-hook)>[\s\S]*?<\/\1>/g;
function cleanPrompt(rawText) {
  const commandName = /<command-name>\s*\/?([^<\s]+)\s*<\/command-name>/.exec(rawText)?.[1];
  const commandArguments = /<command-args>([\s\S]*?)<\/command-args>/.exec(rawText)?.[1];
  const withoutInjectedBlocks = rawText.replace(HARNESS_INJECTED_BLOCKS, " ").replace(/<command-name>[\s\S]*?<\/command-name>/g, " ");
  const withArguments = commandName && commandArguments ? `${withoutInjectedBlocks} ${commandArguments}` : withoutInjectedBlocks;
  return {
    text: withArguments.replace(/\s+/g, " ").trim(),
    command: commandName
  };
}
var CORRECTION_PREFIX_CHARS = 80;
var CORRECTION_START = /^(no|nope|não|nao|wrong|errado|actually|na verdade|instead|ao invés|em vez|stop|pare|para de|don'?t|do not|não faça|nao faca|that'?s not|isso não|isso nao|you should|you shouldn'?t|você deveria|voce deveria|why did you|por que você|por que voce|undo|revert|desfaz|desfaça|again|de novo|still (?:not|wrong|failing)|ainda (?:não|nao|está|esta))\b/i;
function isCorrection(text) {
  return CORRECTION_START.test(text.trim().slice(0, CORRECTION_PREFIX_CHARS));
}
var INTERRUPTED = /^\[Request interrupted by user/;
var PERMISSION_DENIED = /(permission (?:to use .+ )?(?:has been |was )?denied|doesn'?t want to proceed with this tool use|tool use was rejected|denied by (?:the )?(?:user|permission|auto[- ]mode)|requires approval|not allowed by your permission settings)/i;
var HOOK_BLOCKED = /(hook (?:error|blocked|denied)|blocked by (?:a |the )?(?:\w+ )?hook|PreToolUse:\w+ hook)/i;
var MIN_WORD_CHARS = 3;
function wordSet(text) {
  const words = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/https?:\/\/\S+/g, " ").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((word) => word.length >= MIN_WORD_CHARS && !STOPWORDS.has(word));
  return new Set(words);
}
function jaccard(left, right) {
  if (!left.size || !right.size) {
    return 0;
  }
  let sharedCount = 0;
  for (const word of left) {
    if (right.has(word)) {
      sharedCount++;
    }
  }
  return sharedCount / (left.size + right.size - sharedCount);
}
var STOPWORDS = new Set(
  "the and for with that this from you your are was were can could would should please into have has had not but all any some what when where which who how why its it's our out then than them they there here tamb\xE9m para com que uma umas uns dos das por pelo pela isso isto esse essa este esta voc\xEA voce seu sua nos nas n\xE3o nao mais muito pode poderia favor ser ter tem foi vai fazer faz como quando onde qual quais".split(" ")
);

// src/analysis/signal-model.ts
var OccurrenceCollector = class {
  idToGroup = /* @__PURE__ */ new Map();
  add(id, type, title, occurrence) {
    const group = this.idToGroup.get(id) ?? {
      id,
      type,
      title,
      occurrences: [],
      counters: {},
      details: {}
    };
    group.occurrences.push(occurrence);
    this.idToGroup.set(id, group);
    return group;
  }
  groups() {
    return [...this.idToGroup.values()];
  }
};
function countDetail(group, detail, value) {
  const valueToCount = group.counters[detail] ?? /* @__PURE__ */ new Map();
  valueToCount.set(value, (valueToCount.get(value) ?? 0) + 1);
  group.counters[detail] = valueToCount;
}

// src/analysis/detectors.ts
var CHARS_PER_TOKEN2 = 4;
var ERROR_HASH_CHARS = 6;
var REQUEST_HASH_CHARS = 8;
var MAX_FAILURE_EXCERPT_CHARS = 240;
var ASKED_EXCERPT_CHARS = 90;
var REPLY_EXCERPT_CHARS = 110;
var TITLE_EXCERPT_CHARS = 80;
var EXAMPLE_EXCERPT_CHARS = 200;
var RECOVERY_WINDOW_CALLS = 3;
var MIN_REQUEST_WORDS = 3;
var MAX_REQUEST_CHARS = 600;
var EDIT_TOOLS = /* @__PURE__ */ new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
var FILE_CHANGING_COMMAND = /\b(git (checkout|pull|merge|rebase|stash)|sed -i|prettier|eslint --fix|npm run format)/;
function detectToolFailures(context) {
  const { session, index, collector } = context;
  const threadIdToCommands = /* @__PURE__ */ new Map();
  for (const call of session.tools.filter((toolCall) => toolCall.name === "Bash")) {
    const threadCommands = threadIdToCommands.get(call.thread.id) ?? [];
    threadCommands.push(call);
    threadIdToCommands.set(call.thread.id, threadCommands);
  }
  for (const call of session.tools) {
    const result = call.result;
    if (!result?.isError || result.kind === "interrupted") {
      continue;
    }
    const occurrence = {
      session,
      ref: {
        ...call.ref,
        excerpt: `${call.summary} \u2192 ${result.ref.excerpt ?? ""}`.slice(0, MAX_FAILURE_EXCERPT_CHARS)
      },
      pieces: index.toolCallIdToPieces.get(call.id) ?? [MAIN_PIECE],
      ...reactionCost(call, index, context.options.idleMs)
    };
    const errorHead = result.errorHead ?? "error";
    if (result.kind === "permission_denied") {
      const title = `Permission denied for ${call.key}`;
      collector.add(`permission_denied:${call.key}`, "permission_denied", title, occurrence);
    } else if (result.kind === "hook_blocked") {
      collector.add(`hook_blocked:${call.key}`, "hook_blocked", `Hook blocked ${call.key}`, occurrence);
    } else if (call.name === "Bash") {
      const title = `Command fails: ${call.key}`;
      const group = collector.add(`failed_command:${call.key}`, "failed_command", title, occurrence);
      countDetail(group, "errors", errorHead);
      const recoveredWith = recoveryOf(call, threadIdToCommands.get(call.thread.id) ?? []);
      if (recoveredWith) {
        countDetail(group, "recoveredWith", recoveredWith);
      }
    } else {
      const signalId = `tool_error:${call.key}:${sha(errorHead, ERROR_HASH_CHARS)}`;
      const group = collector.add(signalId, "tool_error", `${call.key} error: ${errorHead}`, occurrence);
      group.details.tool = call.key;
      group.details.error = errorHead;
    }
  }
}
function detectRepeatedReads(context) {
  const { session, index, options, collector } = context;
  const threadFileToReads = /* @__PURE__ */ new Map();
  for (const call of session.tools.filter(isSuccessfulRead)) {
    const threadFileKey = `${call.thread.id}\0${call.filePath ?? ""}`;
    const reads = threadFileToReads.get(threadFileKey) ?? [];
    reads.push(call);
    threadFileToReads.set(threadFileKey, reads);
  }
  for (const reads of threadFileToReads.values()) {
    const [firstRead] = reads;
    if (!firstRead || reads.length < options.thresholds.minReadsPerFile) {
      continue;
    }
    const extraReads = reads.slice(1).filter((read) => !wasChangedBetween(session, firstRead, read));
    if (extraReads.length < options.thresholds.minExtraReads) {
      continue;
    }
    const agentType = firstRead.thread.agentType;
    const filePath = firstRead.filePath ?? "";
    for (const read of extraReads) {
      collector.add(`repeated_read:${agentType}:${filePath}`, "repeated_read", `Re-reads ${filePath} (${agentType})`, {
        session,
        ref: read.ref,
        pieces: index.toolCallIdToPieces.get(read.id) ?? [MAIN_PIECE],
        ...readCost(read, index, options.idleMs)
      });
    }
  }
}
function detectSubagentRereads(context) {
  const { session, index, pieceIds, options, collector } = context;
  const mainThreadReads = session.tools.filter((call) => call.thread.id === MAIN_THREAD_ID && isSuccessfulRead(call));
  const subagentReads = session.tools.filter((call) => call.thread.id !== MAIN_THREAD_ID && isSuccessfulRead(call));
  for (const read of subagentReads) {
    const wasReadByMainBefore = mainThreadReads.some(
      (mainRead) => mainRead.filePath === read.filePath && (mainRead.calledAtMs ?? 0) <= (read.calledAtMs ?? 0)
    );
    if (!wasReadByMainBefore) {
      continue;
    }
    const agentType = read.thread.agentType;
    const title = `Subagent ${agentType} re-reads files the main thread already read`;
    const group = collector.add(`subagent_reread:${agentType}`, "subagent_reread", title, {
      session,
      ref: read.ref,
      pieces: [pieceIdFor("agent", agentType, pieceIds)],
      ...readCost(read, index, options.idleMs)
    });
    countDetail(group, "files", read.filePath ?? "");
  }
}
function detectCorrectionsAndInterruptions(context) {
  const { session, index, options, collector } = context;
  session.prompts.forEach((prompt, promptIndex) => {
    if (!prompt.isCorrection && !prompt.isInterruption) {
      return;
    }
    const previousPrompt = session.prompts[promptIndex - 1];
    const pieces = index.promptToPreviousTurnPieces.get(prompt) ?? [MAIN_PIECE];
    const attributedTo = pieces.join(",");
    const type = prompt.isInterruption ? "interruption" : "user_correction";
    const title = prompt.isInterruption ? `User interrupted the agent (${attributedTo})` : `User corrected the agent (${attributedTo})`;
    const askedExcerpt = previousPrompt ? excerpt(previousPrompt.text, ASKED_EXCERPT_CHARS) : void 0;
    const conversationExcerpt = askedExcerpt === void 0 ? prompt.ref.excerpt : `asked: "${askedExcerpt}" \u2192 then: "${excerpt(prompt.text, REPLY_EXCERPT_CHARS)}"`;
    collector.add(`${type}:${attributedTo}`, type, title, {
      session,
      ref: {
        ...prompt.ref,
        excerpt: conversationExcerpt
      },
      pieces,
      ...correctedTurnCost(index, previousPrompt?.sentAtMs, prompt.sentAtMs, options.idleMs)
    });
  });
}
function detectRepeatedRequests(sessions, options, collector) {
  const candidates = sessions.flatMap(
    (session) => session.prompts.filter((prompt) => !prompt.isInterruption && !prompt.isCorrection && prompt.text.length <= MAX_REQUEST_CHARS).map((prompt) => ({
      session,
      prompt,
      words: wordSet(prompt.text)
    })).filter((candidate) => candidate.words.size >= MIN_REQUEST_WORDS)
  );
  const clusters = [];
  for (const candidate of candidates) {
    const similarCluster = clusters.find((cluster) => {
      const seedWords = cluster[0]?.words;
      const similarity = seedWords === void 0 ? 0 : jaccard(seedWords, candidate.words);
      return similarity >= options.thresholds.repeatedRequestSimilarity;
    });
    if (similarCluster) {
      similarCluster.push(candidate);
    } else {
      clusters.push([candidate]);
    }
  }
  for (const cluster of clusters) {
    const seed = cluster[0];
    const sessionIds = new Set(cluster.map((candidate) => candidate.session.sessionId));
    if (!seed || sessionIds.size < options.thresholds.minRepeatedRequestSessions) {
      continue;
    }
    const label = seed.prompt.text;
    const signalId = `repeated_request:${sha(label, REQUEST_HASH_CHARS)}`;
    const title = `Similar request in ${sessionIds.size} sessions: "${excerpt(label, TITLE_EXCERPT_CHARS)}"`;
    const commands = unique(
      cluster.map((candidate) => candidate.prompt.command).filter((command) => command !== void 0)
    );
    for (const candidate of firstPerSession(cluster)) {
      const group = collector.add(signalId, "repeated_request", title, {
        session: candidate.session,
        ref: candidate.prompt.ref,
        pieces: [MAIN_PIECE],
        activeMs: 0,
        usage: ZERO_USAGE
      });
      group.details.example = excerpt(label, EXAMPLE_EXCERPT_CHARS);
      group.details.commands = commands;
    }
  }
}
function firstPerSession(cluster) {
  const seenSessionIds = /* @__PURE__ */ new Set();
  return cluster.filter((candidate) => {
    const isFirst = !seenSessionIds.has(candidate.session.sessionId);
    seenSessionIds.add(candidate.session.sessionId);
    return isFirst;
  });
}
function isSuccessfulRead(call) {
  return call.name === "Read" && call.filePath !== void 0 && call.result?.isError !== true;
}
function reactionCost(call, index, idleMs) {
  const threadMessages = index.threadIdToMessages.get(call.thread.id) ?? [];
  const resultAtMs = call.result?.returnedAtMs ?? call.calledAtMs ?? 0;
  const reaction = threadMessages.find(
    (message) => (message.sentAtMs ?? 0) >= resultAtMs && message.id !== call.messageId
  );
  const reactedAtMs = reaction?.sentAtMs ?? resultAtMs;
  const activeMs = call.calledAtMs === void 0 ? 0 : Math.min(idleMs, Math.max(0, reactedAtMs - call.calledAtMs));
  return {
    activeMs,
    usage: reaction?.usage ?? ZERO_USAGE,
    model: reaction?.model
  };
}
function readCost(read, index, idleMs) {
  const durationMs = (read.result?.returnedAtMs ?? 0) - (read.calledAtMs ?? 0);
  return {
    activeMs: Math.min(idleMs, Math.max(0, durationMs)),
    usage: {
      ...ZERO_USAGE,
      input: Math.round((read.result?.contentChars ?? 0) / CHARS_PER_TOKEN2)
    },
    model: index.threadIdToMessages.get(read.thread.id)?.[0]?.model
  };
}
function correctedTurnCost(index, turnStartAtMs, turnEndAtMs, idleMs) {
  if (turnStartAtMs === void 0 || turnEndAtMs === void 0) {
    return {
      activeMs: 0,
      usage: ZERO_USAGE
    };
  }
  const turnMessages = (index.threadIdToMessages.get(MAIN_THREAD_ID) ?? []).filter((message) => {
    const sentAtMs = message.sentAtMs ?? 0;
    return sentAtMs > turnStartAtMs && sentAtMs <= turnEndAtMs;
  });
  const eventsAtMs = [turnStartAtMs, ...turnMessages.map((message) => message.sentAtMs ?? turnStartAtMs)].sort(
    (left, right) => left - right
  );
  return {
    activeMs: activeTime(eventsAtMs, idleMs),
    usage: turnMessages.reduce((total, message) => addUsage(total, message.usage), ZERO_USAGE),
    model: turnMessages[0]?.model
  };
}
function recoveryOf(failedCall, threadCommands) {
  const failedIndex = threadCommands.indexOf(failedCall);
  const nextCommands = threadCommands.slice(failedIndex + 1, failedIndex + 1 + RECOVERY_WINDOW_CALLS);
  const firstSuccess = nextCommands.find((call) => call.result !== void 0 && !call.result.isError);
  return firstSuccess && firstSuccess.key !== failedCall.key ? firstSuccess.key : void 0;
}
function wasChangedBetween(session, firstRead, laterRead) {
  const fromAtMs = firstRead.calledAtMs ?? 0;
  const toAtMs = laterRead.calledAtMs ?? 0;
  return session.tools.some((call) => {
    const calledAtMs = call.calledAtMs ?? 0;
    const isSameThread = call.thread.id === firstRead.thread.id;
    const isEditOfFile = EDIT_TOOLS.has(call.name) && call.filePath === firstRead.filePath;
    const isFileChangingCommand = call.name === "Bash" && FILE_CHANGING_COMMAND.test(call.summary);
    const isBetween = calledAtMs >= fromAtMs && calledAtMs <= toAtMs;
    return isSameThread && isBetween && (isEditOfFile || isFileChangingCommand);
  });
}

// src/analysis/signals.ts
var MAX_COUNTED_VALUES = 5;
var MIN_SESSIONS_FOR_FULL_EVIDENCE = 2;
var SELF_SKILL_NAME = /(^|:)improve-my-harness$/;
var USAGE_KINDS = /* @__PURE__ */ new Set(["skill", "agent", "command", "mcp"]);
var SIZE_KINDS = /* @__PURE__ */ new Set(["instructions", "skill", "agent"]);
var SCORE_WEIGHTS = {
  perActiveMinute: 1,
  perUsd: 2,
  perSession: 2,
  perOccurrence: 0.3,
  maxCountedOccurrences: 30,
  partialPenalty: 2
};
var SIGNAL_TYPE_TO_THRESHOLD = {
  failed_command: (occurrences, sessions, options) => occurrences >= options.thresholds.minFailures || sessions >= options.thresholds.minFailureSessions,
  tool_error: (occurrences, sessions, options) => occurrences >= options.thresholds.minFailures || sessions >= options.thresholds.minFailureSessions,
  permission_denied: (occurrences, _sessions, options) => occurrences >= options.thresholds.minRepeatedEvents,
  hook_blocked: (occurrences, _sessions, options) => occurrences >= options.thresholds.minRepeatedEvents,
  user_correction: (occurrences, _sessions, options) => occurrences >= options.thresholds.minRepeatedEvents,
  interruption: (occurrences, _sessions, options) => occurrences >= options.thresholds.minRepeatedEvents,
  repeated_read: (occurrences, _sessions, options) => occurrences >= options.thresholds.minExtraReads,
  subagent_reread: (occurrences, _sessions, options) => occurrences >= options.thresholds.minSubagentRereads,
  repeated_request: (_occurrences, sessions, options) => sessions >= options.thresholds.minRepeatedRequestSessions,
  unused_piece: () => true,
  large_piece: () => true
};
function extractSignals(sessions, inventory, options) {
  const pieceIds = new Set(inventory?.pieces.map((piece) => piece.id) ?? []);
  const collector = new OccurrenceCollector();
  for (const session of sessions) {
    const context = {
      session,
      index: buildSessionIndex(session, pieceIds),
      pieceIds,
      options,
      collector
    };
    detectToolFailures(context);
    detectRepeatedReads(context);
    detectSubagentRereads(context);
    detectCorrectionsAndInterruptions(context);
  }
  detectRepeatedRequests(sessions, options, collector);
  const signals = collector.groups().filter((group) => {
    const sessionCount = new Set(group.occurrences.map((occurrence) => occurrence.session.sessionId)).size;
    return SIGNAL_TYPE_TO_THRESHOLD[group.type](group.occurrences.length, sessionCount, options);
  }).map((group) => buildSignal(group, options));
  if (inventory) {
    signals.push(...unusedPieceSignals(sessions, inventory, options), ...largePieceSignals(inventory, options));
    markPiecesChangedAfterEvidence(signals, inventory);
  }
  for (const signal of signals) {
    signal.score = scoreOf(signal);
  }
  return signals.sort((left, right) => right.score - left.score);
}
function buildSignal(group, options) {
  const occurrences = [...group.occurrences].sort(
    (left, right) => (left.ref.occurredAt ?? "").localeCompare(right.ref.occurredAt ?? "")
  );
  const sessionCount = new Set(occurrences.map((occurrence) => occurrence.session.sessionId)).size;
  const pieces = unique(occurrences.flatMap((occurrence) => occurrence.pieces));
  const partialReasons = [];
  if (pieces.includes(UNRESOLVED_SUBAGENT_PIECE)) {
    partialReasons.push("subagent type could not be resolved for some steps");
  }
  const isSingleSession = sessionCount < MIN_SESSIONS_FOR_FULL_EVIDENCE && group.type !== "repeated_read";
  if (isSingleSession) {
    partialReasons.push("seen in a single session");
  }
  return {
    id: group.id,
    type: group.type,
    title: group.title,
    pieces,
    occurrences: occurrences.length,
    sessions: sessionCount,
    isPartial: partialReasons.length > 0,
    partialReasons,
    cost: costOf(occurrences, options),
    details: {
      ...group.details,
      ...topCountedValues(group)
    },
    evidence: spreadEvidence(occurrences, options.maxEvidence),
    evidenceTotal: occurrences.length,
    firstSeenAt: occurrences[0]?.ref.occurredAt,
    lastSeenAt: occurrences.at(-1)?.ref.occurredAt,
    score: 0
  };
}
function costOf(occurrences, options) {
  const usage = occurrences.reduce((total, occurrence) => addUsage(total, occurrence.usage), ZERO_USAGE);
  const usd = occurrences.reduce(
    (total, occurrence) => total + usageCostUsd(occurrence.usage, occurrence.model, options.prices),
    0
  );
  const activeMs = occurrences.reduce((total, occurrence) => total + occurrence.activeMs, 0);
  return {
    activeMinutes: msToMinutes(activeMs),
    tokens: totalTokens(usage),
    usd: round(usd),
    isEstimated: true
  };
}
function topCountedValues(group) {
  const countedDetails = {};
  for (const [detail, valueToCount] of Object.entries(group.counters)) {
    const countedValues = [...valueToCount.entries()].sort((left, right) => right[1] - left[1]).slice(0, MAX_COUNTED_VALUES).map(([value, count]) => ({
      value,
      count
    }));
    countedDetails[detail] = countedValues;
  }
  return countedDetails;
}
function scoreOf(signal) {
  const countedOccurrences = Math.min(signal.occurrences, SCORE_WEIGHTS.maxCountedOccurrences);
  const score = signal.cost.activeMinutes * SCORE_WEIGHTS.perActiveMinute + signal.cost.usd * SCORE_WEIGHTS.perUsd + signal.sessions * SCORE_WEIGHTS.perSession + countedOccurrences * SCORE_WEIGHTS.perOccurrence - (signal.isPartial ? SCORE_WEIGHTS.partialPenalty : 0);
  return round(score);
}
function unusedPieceSignals(sessions, inventory, options) {
  if (sessions.length < options.minSessionsForUnused) {
    return [];
  }
  const usedPieceIds = usedPieceIdsIn(sessions);
  const periodStartAtMs = Math.min(...sessions.map((session) => session.startedAtMs ?? Date.now()));
  const unusedPieces = inventory.pieces.filter((piece) => {
    const isTrackedKind = USAGE_KINDS.has(piece.kind);
    const isThisTool = piece.kind === "skill" && SELF_SKILL_NAME.test(piece.name);
    return isTrackedKind && !isThisTool && !usedPieceIds.has(piece.id);
  });
  return unusedPieces.map((piece) => {
    const wasChangedDuringPeriod = piece.modifiedAt !== void 0 && Date.parse(piece.modifiedAt) > periodStartAtMs;
    const partialReasons = [
      ...wasChangedDuringPeriod ? ["piece was added or changed during the analyzed period"] : [],
      ...piece.isEditable ? [] : ["piece comes from a plugin"]
    ];
    return pieceSignal(piece, {
      type: "unused_piece",
      title: `Not used in ${sessions.length} sessions: ${piece.id}`,
      sessions: sessions.length,
      partialReasons,
      details: {
        scope: piece.scope,
        path: piece.path,
        approxTokens: piece.approxTokens,
        description: piece.description
      }
    });
  });
}
function usedPieceIdsIn(sessions) {
  const usedPieceIds = /* @__PURE__ */ new Set();
  for (const session of sessions) {
    for (const call of session.tools) {
      if (call.subagentType) {
        usedPieceIds.add(`agent:${call.subagentType}`);
      }
      if (call.skill) {
        usedPieceIds.add(`skill:${call.skill}`);
      }
      if (call.key.startsWith("mcp:")) {
        usedPieceIds.add(call.key);
      }
    }
    for (const threadFacts of session.threads.filter((thread) => thread.thread.id !== MAIN_THREAD_ID)) {
      usedPieceIds.add(`agent:${threadFacts.thread.agentType}`);
    }
    for (const command of session.prompts.map((prompt) => prompt.command).filter((name) => name !== void 0)) {
      usedPieceIds.add(`skill:${command}`);
      usedPieceIds.add(`command:${command}`);
    }
  }
  return usedPieceIds;
}
function largePieceSignals(inventory, options) {
  return inventory.pieces.filter((piece) => piece.isEditable && SIZE_KINDS.has(piece.kind) && piece.approxTokens >= options.largePieceTokens).map(
    (piece) => pieceSignal(piece, {
      type: "large_piece",
      title: `${piece.id} is large (~${piece.approxTokens} tokens)`,
      sessions: 0,
      partialReasons: [],
      details: {
        path: piece.path,
        approxTokens: piece.approxTokens,
        isLoadedEveryTurn: piece.kind === "instructions"
      }
    })
  );
}
function pieceSignal(piece, fields) {
  return {
    ...fields,
    id: `${fields.type}:${piece.id}`,
    pieces: [piece.id],
    occurrences: 0,
    isPartial: fields.partialReasons.length > 0,
    cost: {
      activeMinutes: 0,
      tokens: 0,
      usd: 0,
      isEstimated: true
    },
    evidence: [],
    evidenceTotal: 0,
    score: 0
  };
}
function markPiecesChangedAfterEvidence(signals, inventory) {
  const pieceIdToPiece = new Map(inventory.pieces.map((piece) => [piece.id, piece]));
  for (const signal of signals) {
    const lastSeenAtMs = signal.lastSeenAt === void 0 ? void 0 : Date.parse(signal.lastSeenAt);
    if (lastSeenAtMs === void 0) {
      continue;
    }
    const changedPieces = signal.pieces.flatMap((pieceId) => {
      const modifiedAt = pieceIdToPiece.get(pieceId)?.modifiedAt;
      const wasChangedAfter = modifiedAt !== void 0 && Date.parse(modifiedAt) > lastSeenAtMs;
      return wasChangedAfter ? [{
        piece: pieceId,
        modifiedAt
      }] : [];
    });
    if (changedPieces.length) {
      signal.changedAfterEvidence = changedPieces;
      signal.isPartial = true;
      signal.partialReasons.push("piece changed after this evidence");
    }
  }
}
function spreadEvidence(sortedOccurrences, maxEvidence) {
  const sessionIdToOccurrences = /* @__PURE__ */ new Map();
  for (const occurrence of sortedOccurrences) {
    const sessionOccurrences = sessionIdToOccurrences.get(occurrence.session.sessionId) ?? [];
    sessionOccurrences.push(occurrence);
    sessionIdToOccurrences.set(occurrence.session.sessionId, sessionOccurrences);
  }
  const evidence = [];
  for (let roundIndex = 0; evidence.length < maxEvidence; roundIndex++) {
    const roundEvidence = [...sessionIdToOccurrences.values()].map((sessionOccurrences) => sessionOccurrences[roundIndex]?.ref).filter((ref) => ref !== void 0);
    if (!roundEvidence.length) {
      break;
    }
    evidence.push(...roundEvidence.slice(0, maxEvidence - evidence.length));
  }
  return evidence;
}

// src/analysis/usage.ts
var RATE_DIGITS = 3;
var PER_INVOCATION_USD_DIGITS = 3;
var UsageAccumulator = class {
  pieceToTotals = /* @__PURE__ */ new Map();
  totalsOf(piece) {
    const totals = this.pieceToTotals.get(piece) ?? {
      invocations: 0,
      sessionIds: /* @__PURE__ */ new Set(),
      toolCalls: 0,
      toolErrors: 0,
      activeMs: 0,
      usage: ZERO_USAGE,
      usd: 0,
      models: /* @__PURE__ */ new Set()
    };
    this.pieceToTotals.set(piece, totals);
    return totals;
  }
  entries() {
    return [...this.pieceToTotals.entries()];
  }
};
function pieceUsage(sessions, pieceIds, prices) {
  const accumulator = new UsageAccumulator();
  for (const session of sessions) {
    accumulateSession(accumulator, session, pieceIds, prices);
  }
  return accumulator.entries().map(([piece, totals]) => toPieceUsage(piece, totals)).sort((left, right) => right.usd - left.usd || right.toolCalls - left.toolCalls);
}
function accumulateSession(accumulator, session, pieceIds, prices) {
  const index = buildSessionIndex(session, pieceIds);
  const mainTotals = accumulator.totalsOf(MAIN_PIECE);
  mainTotals.invocations++;
  mainTotals.sessionIds.add(session.sessionId);
  mainTotals.activeMs += session.activeMs;
  for (const threadFacts of session.threads.filter((thread) => thread.thread.id !== MAIN_THREAD_ID)) {
    const agentTotals = accumulator.totalsOf(`agent:${threadFacts.thread.agentType}`);
    agentTotals.invocations++;
    agentTotals.sessionIds.add(session.sessionId);
    agentTotals.activeMs += threadFacts.activeMs;
  }
  for (const message of session.messages) {
    const isMainThread = message.thread.id === MAIN_THREAD_ID;
    const totals = accumulator.totalsOf(isMainThread ? MAIN_PIECE : `agent:${message.thread.agentType}`);
    totals.usage = addUsage(totals.usage, message.usage);
    totals.usd += usageCostUsd(message.usage, message.model, prices);
    if (message.model) {
      totals.models.add(message.model);
    }
  }
  for (const call of session.tools) {
    const isError = call.result?.isError === true;
    for (const piece of index.toolCallIdToPieces.get(call.id) ?? [MAIN_PIECE]) {
      const totals = accumulator.totalsOf(withoutBuiltInSuffix(piece));
      totals.toolCalls++;
      totals.toolErrors += isError ? 1 : 0;
      totals.sessionIds.add(session.sessionId);
    }
    if (call.skill) {
      accumulator.totalsOf(`skill:${call.skill}`).invocations++;
    }
    if (call.key.startsWith("mcp:")) {
      const serverTotals = accumulator.totalsOf(call.key);
      serverTotals.invocations++;
      serverTotals.toolCalls++;
      serverTotals.toolErrors += isError ? 1 : 0;
      serverTotals.sessionIds.add(session.sessionId);
    }
  }
  for (const command of session.prompts.map((prompt) => prompt.command).filter((name) => name !== void 0)) {
    const commandTotals = accumulator.totalsOf(commandPieceId(command, pieceIds));
    commandTotals.invocations++;
    commandTotals.sessionIds.add(session.sessionId);
  }
}
function toPieceUsage(piece, totals) {
  const tokens = totalTokens(totals.usage);
  const pieceUsageResult = {
    piece,
    invocations: totals.invocations,
    sessions: totals.sessionIds.size,
    toolCalls: totals.toolCalls,
    toolErrors: totals.toolErrors,
    errorRate: totals.toolCalls ? round(totals.toolErrors / totals.toolCalls, RATE_DIGITS) : 0,
    activeMinutes: msToMinutes(totals.activeMs),
    tokens,
    usd: round(totals.usd),
    models: [...totals.models]
  };
  if (totals.invocations > 0) {
    pieceUsageResult.perInvocation = {
      activeMinutes: msToMinutes(totals.activeMs / totals.invocations),
      tokens: Math.round(tokens / totals.invocations),
      usd: round(totals.usd / totals.invocations, PER_INVOCATION_USD_DIGITS),
      toolCalls: round(totals.toolCalls / totals.invocations, 1)
    };
  }
  return pieceUsageResult;
}

// src/analysis/compare.ts
var MAX_SIDE_SIGNALS = 10;
var DELTA_DIGITS = 3;
function comparePiece(sessions, piece, changedAtMs, changedAtSource, options) {
  const sessionsUsingPiece = sessions.filter((session) => usesPiece(session, piece));
  const isBeforeChange = (session) => (session.startedAtMs ?? 0) < changedAtMs;
  const before = sideMetrics(sessionsUsingPiece.filter(isBeforeChange), piece, options);
  const after = sideMetrics(sessionsUsingPiece.filter((session) => !isBeforeChange(session)), piece, options);
  const caveats = [
    "Observational comparison: sessions before and after differ in tasks, not only in the harness.",
    "Time and cost are estimates; idle gaps are excluded."
  ];
  const hasEnoughData = before.sessions >= options.minSessions && after.sessions >= options.minSessions;
  if (!hasEnoughData) {
    caveats.push(
      `Need at least ${options.minSessions} sessions using ${piece} on each side (before: ${before.sessions}, after: ${after.sessions}).`
    );
  }
  return {
    piece,
    changedAt: toIso(changedAtMs),
    changedAtSource,
    minSessions: options.minSessions,
    before,
    after,
    verdict: hasEnoughData ? verdictOf(before, after, options.minRelativeChange) : "insufficient_data",
    deltas: {
      errorRate: difference(before.errorRate, after.errorRate),
      correctionsPerSession: difference(before.correctionsPerSession, after.correctionsPerSession),
      activeMinutesPerInvocation: difference(before.perInvocation?.activeMinutes, after.perInvocation?.activeMinutes),
      tokensPerInvocation: difference(before.perInvocation?.tokens, after.perInvocation?.tokens),
      usdPerInvocation: difference(before.perInvocation?.usd, after.perInvocation?.usd)
    },
    caveats
  };
}
function verdictOf(before, after, minRelativeChange) {
  const significantMoves = [
    relativeChange(before.errorRate, after.errorRate),
    relativeChange(before.correctionsPerSession, after.correctionsPerSession),
    relativeChange(before.perInvocation?.usd, after.perInvocation?.usd)
  ].filter((change) => Math.abs(change) >= minRelativeChange);
  if (!significantMoves.length) {
    return "no_clear_change";
  }
  if (significantMoves.every((change) => change < 0)) {
    return "improved";
  }
  return significantMoves.every((change) => change > 0) ? "worse" : "no_clear_change";
}
var PIECE_KIND_TO_USAGE_CHECK = {
  agent: (session, name) => session.threads.some((thread) => thread.thread.agentType === name) || session.tools.some((call) => call.subagentType === name),
  skill: (session, name) => session.tools.some((call) => call.skill === name) || session.prompts.some((prompt) => prompt.command === name),
  command: (session, name) => session.prompts.some((prompt) => prompt.command === name),
  mcp: (session, name) => session.tools.some((call) => call.key === `mcp:${name}`)
};
function usesPiece(session, piece) {
  const [kind = "", ...nameParts] = piece.split(":");
  const usageCheck = PIECE_KIND_TO_USAGE_CHECK[kind];
  return usageCheck ? usageCheck(session, nameParts.join(":")) : true;
}
var GLOBAL_PIECE_PREFIXES = ["instructions:", "hook:", "settings:"];
function usagePieceOf(piece) {
  const isGlobalPiece = GLOBAL_PIECE_PREFIXES.some((prefix) => piece.startsWith(prefix));
  return isGlobalPiece ? MAIN_PIECE : piece;
}
function sideMetrics(sessions, piece, options) {
  const usage = pieceUsage(sessions, /* @__PURE__ */ new Set([piece]), options.prices).find((entry) => entry.piece === usagePieceOf(piece));
  const corrections = sessions.flatMap((session) => session.prompts).filter((prompt) => prompt.isCorrection || prompt.isInterruption).length;
  const signals = extractSignals(sessions, void 0, {
    idleMs: options.idleMs,
    prices: options.prices,
    maxEvidence: 0,
    minSessionsForUnused: Infinity,
    largePieceTokens: Infinity,
    thresholds: options.thresholds
  }).filter((signal) => signal.pieces.some((signalPiece) => isSamePiece(signalPiece, piece))).slice(0, MAX_SIDE_SIGNALS).map((signal) => ({
    id: signal.id,
    occurrences: signal.occurrences
  }));
  return {
    sessions: sessions.length,
    invocations: usage?.invocations ?? 0,
    toolCalls: usage?.toolCalls ?? 0,
    errorRate: usage?.errorRate ?? 0,
    perInvocation: usage?.perInvocation,
    corrections,
    correctionsPerSession: sessions.length ? round(corrections / sessions.length) : 0,
    signals
  };
}
function isSamePiece(signalPiece, piece) {
  return signalPiece === piece || signalPiece.startsWith(`${piece} `);
}
function relativeChange(before, after) {
  return before && after !== void 0 ? (after - before) / before : 0;
}
function difference(before, after) {
  return before === void 0 || after === void 0 ? null : round(after - before, DELTA_DIGITS);
}

// src/analysis/mentions.ts
import { readFile as readFile2 } from "node:fs/promises";
import { isAbsolute, join as join3 } from "node:path";
var DEFAULT_MAX_MENTIONS = 8;
var MIN_TERM_CHARS = 3;
var MAX_MENTION_CHARS = 160;
var TEXT_KINDS = /* @__PURE__ */ new Set(["instructions", "skill", "agent", "command"]);
async function findMentions(inventory, terms, maxMentions = DEFAULT_MAX_MENTIONS) {
  const searchTerms = [...new Set(terms.map((term) => term.trim()).filter((term) => term.length >= MIN_TERM_CHARS))];
  const mentions = [];
  for (const piece of inventory.pieces.filter((candidate) => TEXT_KINDS.has(candidate.kind))) {
    if (!searchTerms.length || mentions.length >= maxMentions) {
      break;
    }
    const expandedPath = untildify(piece.path);
    const absolutePath = isAbsolute(expandedPath) ? expandedPath : join3(inventory.projectDir, piece.path);
    const lines = (await readFile2(absolutePath, "utf8").catch(() => "")).split(/\r?\n/);
    for (const term of searchTerms) {
      const lowerTerm = term.toLowerCase();
      lines.forEach((line, lineIndex) => {
        if (mentions.length < maxMentions && line.toLowerCase().includes(lowerTerm)) {
          mentions.push({
            piece: piece.id,
            path: piece.path,
            line: lineIndex + 1,
            text: excerpt(line, MAX_MENTION_CHARS),
            term
          });
        }
      });
    }
  }
  return mentions;
}

// src/commands/context.ts
import { resolve } from "node:path";

// src/analysis/load.ts
import { cpus } from "node:os";

// src/adapters/claude-code/sessions.ts
import { readdir as readdir2, readFile as readFile3, stat as stat2 } from "node:fs/promises";
import { basename as basename2, isAbsolute as isAbsolute2, join as join4, relative as relative2 } from "node:path";

// src/core/jsonl.ts
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
async function readJsonLines(file, handlers) {
  const lines = createInterface({
    input: createReadStream(file, { encoding: "utf8" }),
    crlfDelay: Infinity
  });
  let lineNumber = 0;
  for await (const line of lines) {
    lineNumber++;
    if (!line.trim()) {
      continue;
    }
    const record = parseJson(line);
    if (record === void 0) {
      handlers.onBadLine();
      continue;
    }
    try {
      handlers.onRecord(record, lineNumber);
    } catch {
      handlers.onBadLine();
    }
  }
}

// src/adapters/claude-code/sessions.ts
var TRANSCRIPT_EXTENSION = ".jsonl";
var UNKNOWN_SUBAGENT_TYPE2 = "subagent";
var DEFAULT_SUBAGENT_TYPE = "general-purpose";
var MAX_PROMPT_CHARS = 2e3;
var MAX_SUMMARY_CHARS = 160;
var RESULT_HEAD_CHARS = 600;
var SUBAGENT_TYPE_KEYS = ["agentType", "agent_type", "subagentType", "subagent_type"];
var TIMED_LINE_TYPES = /* @__PURE__ */ new Set(["user", "assistant", "attachment", "system"]);
var FILE_TOOLS = /* @__PURE__ */ new Set(["Read", "Edit", "Write", "MultiEdit", "NotebookEdit", "NotebookRead"]);
var DELEGATION_TOOLS = /* @__PURE__ */ new Set(["Task", "Agent"]);
async function discoverTranscripts(options) {
  const projectsDir = join4(options.claudeHomeDir ?? claudeHome(), "projects");
  const projectFolders = await readdir2(projectsDir).catch(() => []);
  const encodedProject = encodeProjectDir(options.projectDir);
  const isCandidateFolder = (folder) => folder === encodedProject || folder.startsWith(`${encodedProject}-`);
  const selectedFolders = options.shouldReadAllProjects ? projectFolders : projectFolders.filter(isCandidateFolder);
  const transcripts = [];
  for (const folder of selectedFolders) {
    const folderPath = join4(projectsDir, folder);
    const entries = await readdir2(folderPath).catch(() => []);
    for (const entry of entries.filter((name) => name.endsWith(TRANSCRIPT_EXTENSION))) {
      const fileStat = await statFile(join4(folderPath, entry));
      if (!fileStat) {
        continue;
      }
      const sessionId = entry.slice(0, -TRANSCRIPT_EXTENSION.length);
      const subagentFiles = await listSubagentFiles(join4(folderPath, sessionId, "subagents"));
      transcripts.push({
        ...fileStat,
        sessionId,
        subagentFiles,
        isExactProject: folder === encodedProject
      });
    }
  }
  return transcripts.sort((left, right) => left.modifiedAtMs - right.modifiedAtMs);
}
async function listSubagentFiles(subagentsDir) {
  const entries = await readdir2(subagentsDir).catch(() => []);
  const stats = await Promise.all(
    entries.filter((name) => name.endsWith(TRANSCRIPT_EXTENSION)).map((name) => statFile(join4(subagentsDir, name)))
  );
  return stats.filter((fileStat) => fileStat !== void 0);
}
async function statFile(file) {
  const fileStat = await stat2(file).catch(() => void 0);
  if (!fileStat?.isFile()) {
    return void 0;
  }
  return {
    file,
    modifiedAtMs: fileStat.mtimeMs,
    bytes: fileStat.size
  };
}
function mainThread() {
  return {
    id: MAIN_THREAD_ID,
    agentType: MAIN_THREAD_ID
  };
}
async function parseSession(transcript, options) {
  const facts = {
    agent: "claude-code",
    sessionId: transcript.sessionId,
    file: transcript.file,
    activeMs: 0,
    threads: [],
    prompts: [],
    tools: [],
    messages: [],
    files: [transcript.file, ...transcript.subagentFiles.map((subagentFile) => subagentFile.file)],
    unparsedLines: 0
  };
  const context = {
    facts,
    currentFile: transcript.file,
    currentThread: mainThread(),
    projectDir: options.projectDir,
    toolUseIdToPendingCall: /* @__PURE__ */ new Map(),
    threadIdToEventsAtMs: /* @__PURE__ */ new Map(),
    messageIdToMessage: /* @__PURE__ */ new Map(),
    delegationCallIdToAgentId: /* @__PURE__ */ new Map(),
    threadIdToFirstPromptHash: /* @__PURE__ */ new Map(),
    threadIdToDeclaredType: /* @__PURE__ */ new Map()
  };
  const countBadLine = () => {
    facts.unparsedLines++;
  };
  await readJsonLines(transcript.file, {
    onRecord: (record, lineNumber) => {
      handleRecord(context, record, lineNumber, true);
    },
    onBadLine: countBadLine
  });
  for (const subagentFile of transcript.subagentFiles) {
    const agentId = basename2(subagentFile.file, TRANSCRIPT_EXTENSION).replace(/^agent-/, "");
    const metaType = await readSubagentMetaType(subagentFile.file);
    context.currentFile = subagentFile.file;
    context.currentThread = {
      id: agentId,
      agentType: metaType ?? UNKNOWN_SUBAGENT_TYPE2
    };
    await readJsonLines(subagentFile.file, {
      onRecord: (record, lineNumber) => {
        handleRecord(context, record, lineNumber, false);
      },
      onBadLine: countBadLine
    });
    const resolvedType = metaType ?? context.threadIdToDeclaredType.get(agentId) ?? typeFromDelegation(context, agentId);
    if (resolvedType) {
      relabelThread(facts, agentId, resolvedType);
    }
  }
  for (const call of facts.tools) {
    const agentId = context.delegationCallIdToAgentId.get(call.id);
    if (agentId && call.subagentType) {
      relabelThread(facts, agentId, call.subagentType);
    }
  }
  facts.messages = [...context.messageIdToMessage.values()];
  summarizeThreads(context, options.idleMs);
  return facts;
}
function typeFromDelegation(context, agentId) {
  const delegations = context.facts.tools.filter((call) => call.subagentType !== void 0);
  const firstPromptHash = context.threadIdToFirstPromptHash.get(agentId);
  const byResult = delegations.find((call) => context.delegationCallIdToAgentId.get(call.id) === agentId);
  const byPrompt = delegations.find(
    (call) => call.subagentPromptHash !== void 0 && call.subagentPromptHash === firstPromptHash
  );
  return byResult?.subagentType ?? byPrompt?.subagentType;
}
function summarizeThreads(context, idleMs) {
  const facts = context.facts;
  for (const [threadId, eventsAtMs] of context.threadIdToEventsAtMs) {
    eventsAtMs.sort((left, right) => left - right);
    const isMain = threadId === MAIN_THREAD_ID;
    const threadFacts = {
      thread: isMain ? mainThread() : {
        id: threadId,
        agentType: knownTypeOfThread(facts, threadId)
      },
      activeMs: activeTime(eventsAtMs, idleMs),
      firstEventAtMs: eventsAtMs[0],
      lastEventAtMs: eventsAtMs.at(-1),
      promptHash: context.threadIdToFirstPromptHash.get(threadId)
    };
    facts.threads.push(threadFacts);
    if (isMain) {
      facts.activeMs = threadFacts.activeMs;
      facts.startedAtMs = threadFacts.firstEventAtMs;
      facts.endedAtMs = threadFacts.lastEventAtMs;
    }
  }
  if (facts.startedAtMs === void 0) {
    const allEventsAtMs = [...context.threadIdToEventsAtMs.values()].flat().sort((left, right) => left - right);
    facts.startedAtMs = allEventsAtMs[0];
    facts.endedAtMs = allEventsAtMs.at(-1);
  }
}
function knownTypeOfThread(facts, threadId) {
  return facts.tools.find((call) => call.thread.id === threadId)?.thread.agentType ?? facts.messages.find((message) => message.thread.id === threadId)?.thread.agentType ?? UNKNOWN_SUBAGENT_TYPE2;
}
function relabelThread(facts, threadId, agentType) {
  for (const call of facts.tools.filter((toolCall) => toolCall.thread.id === threadId)) {
    call.thread.agentType = agentType;
    call.ref.thread = agentType;
    if (call.result) {
      call.result.ref.thread = agentType;
    }
  }
  for (const message of facts.messages.filter((assistantMessage) => assistantMessage.thread.id === threadId)) {
    message.thread.agentType = agentType;
  }
}
async function readSubagentMetaType(subagentFile) {
  const metaFile = subagentFile.replace(/\.jsonl$/, ".meta.json");
  const metaText = await readFile3(metaFile, "utf8").catch(() => void 0);
  return metaText === void 0 ? void 0 : firstString(asRecord(parseJson(metaText)), SUBAGENT_TYPE_KEYS);
}
function handleRecord(context, value, lineNumber, isInMainFile) {
  const record = asRecord(value);
  if (!record) {
    return;
  }
  const facts = context.facts;
  if (isInMainFile) {
    facts.projectDir ??= asString(record.cwd);
    const gitBranch = asString(record.gitBranch);
    if (!facts.gitBranch && gitBranch && gitBranch !== "HEAD") {
      facts.gitBranch = gitBranch;
    }
  }
  const occurredAt = asString(record.timestamp);
  const parsedAtMs = occurredAt === void 0 ? Number.NaN : Date.parse(occurredAt);
  const line = {
    record,
    lineNumber,
    thread: threadOfLine(context, record, isInMainFile),
    occurredAt,
    occurredAtMs: Number.isNaN(parsedAtMs) ? void 0 : parsedAtMs,
    isInMainFile
  };
  const lineType = asString(record.type);
  if (line.occurredAtMs !== void 0 && lineType !== void 0 && TIMED_LINE_TYPES.has(lineType)) {
    const eventsAtMs = context.threadIdToEventsAtMs.get(line.thread.id) ?? [];
    eventsAtMs.push(line.occurredAtMs);
    context.threadIdToEventsAtMs.set(line.thread.id, eventsAtMs);
  }
  const message = asRecord(record.message);
  if (!message) {
    return;
  }
  if (lineType === "assistant") {
    handleAssistantLine(context, line, message);
  } else if (lineType === "user") {
    handleUserLine(context, line, message);
  }
}
function threadOfLine(context, record, isInMainFile) {
  let thread = context.currentThread;
  const isInlineSidechain = isInMainFile && record.isSidechain === true;
  if (isInlineSidechain) {
    const sidechainId = asString(record.agentId) ?? "sidechain";
    thread = {
      id: sidechainId,
      agentType: context.threadIdToDeclaredType.get(sidechainId) ?? UNKNOWN_SUBAGENT_TYPE2
    };
  }
  const declaredType = firstString(record, SUBAGENT_TYPE_KEYS);
  if (declaredType && thread.id !== MAIN_THREAD_ID) {
    context.threadIdToDeclaredType.set(thread.id, declaredType);
    thread.agentType = declaredType;
  }
  return thread;
}
function evidenceFactory(context, line) {
  return (text) => ({
    sessionId: context.facts.sessionId,
    file: context.currentFile,
    line: line.lineNumber,
    occurredAt: line.occurredAt,
    thread: line.thread.agentType,
    excerpt: text ? excerpt(text) : void 0
  });
}
function handleAssistantLine(context, line, message) {
  const messageId = asString(message.id) ?? `${context.currentFile}:${line.lineNumber}`;
  const usage = readUsage(asRecord(message.usage));
  const toEvidence = evidenceFactory(context, line);
  const existing = context.messageIdToMessage.get(messageId);
  if (existing) {
    existing.usage = maxUsage(existing.usage, usage);
  } else {
    context.messageIdToMessage.set(messageId, {
      id: messageId,
      model: asString(message.model),
      usage,
      thread: line.thread,
      sentAtMs: line.occurredAtMs,
      ref: toEvidence()
    });
  }
  for (const block of asArray(message.content).map(asRecord)) {
    const toolUseId = asString(block?.id);
    if (block?.type !== "tool_use" || !toolUseId) {
      continue;
    }
    const call = buildToolCall(block, toolUseId, {
      thread: line.thread,
      toEvidence,
      calledAtMs: line.occurredAtMs,
      messageId,
      projectDir: context.projectDir
    });
    context.toolUseIdToPendingCall.set(toolUseId, call);
    context.facts.tools.push(call);
  }
}
function readUsage(usage) {
  return {
    input: asNumber(usage?.input_tokens) ?? 0,
    output: asNumber(usage?.output_tokens) ?? 0,
    cacheRead: asNumber(usage?.cache_read_input_tokens) ?? 0,
    cacheWrite: asNumber(usage?.cache_creation_input_tokens) ?? 0
  };
}
function maxUsage(left, right) {
  return {
    input: Math.max(left.input, right.input),
    output: Math.max(left.output, right.output),
    cacheRead: Math.max(left.cacheRead, right.cacheRead),
    cacheWrite: Math.max(left.cacheWrite, right.cacheWrite)
  };
}
function handleUserLine(context, line, message) {
  const content = message.content;
  if (typeof content === "string") {
    handlePrompt(context, line, content);
    return;
  }
  const textParts = [];
  for (const block of asArray(content).map(asRecord)) {
    if (block?.type === "tool_result") {
      handleToolResult(context, line, block);
      continue;
    }
    const text = asString(block?.text);
    if (block?.type === "text" && text !== void 0) {
      textParts.push(text);
    }
  }
  if (textParts.length) {
    handlePrompt(context, line, textParts.join("\n"));
  }
}
function handlePrompt(context, line, rawText) {
  const threadId = line.thread.id;
  if (!context.threadIdToFirstPromptHash.has(threadId)) {
    context.threadIdToFirstPromptHash.set(threadId, sha(rawText.trim()));
  }
  const isHarnessGenerated = line.record.isMeta === true || line.record.isCompactSummary === true || line.record.isVisibleInTranscriptOnly === true;
  if (isHarnessGenerated || threadId !== MAIN_THREAD_ID) {
    return;
  }
  const { text, command } = cleanPrompt(rawText);
  const isEmpty = !text && !command;
  if (isEmpty || /^Caveat: The messages below were generated/i.test(text)) {
    return;
  }
  const isInterruption = INTERRUPTED.test(text);
  const hasEarlierPrompt = context.facts.prompts.length > 0;
  context.facts.prompts.push({
    text: redact(text).slice(0, MAX_PROMPT_CHARS),
    ref: evidenceFactory(context, line)(text || `/${command ?? ""}`),
    sentAtMs: line.occurredAtMs,
    command,
    isInterruption,
    isCorrection: !isInterruption && hasEarlierPrompt && isCorrection(text)
  });
}
function handleToolResult(context, line, block) {
  const toolUseId = asString(block.tool_use_id);
  const call = toolUseId === void 0 ? void 0 : context.toolUseIdToPendingCall.get(toolUseId);
  if (!call || toolUseId === void 0) {
    return;
  }
  context.toolUseIdToPendingCall.delete(toolUseId);
  const toolUseResult = asRecord(line.record.toolUseResult);
  const reportedAgentId = asString(toolUseResult?.agentId);
  if (reportedAgentId) {
    context.delegationCallIdToAgentId.set(call.id, reportedAgentId);
  }
  const text = resultText(block.content);
  const kind = classifyResult(text, block.is_error === true, toolUseResult?.interrupted === true);
  const isError = kind !== "ok";
  const toEvidence = evidenceFactory(context, line);
  call.result = {
    isError,
    kind,
    errorHead: isError ? errorKey(text) : void 0,
    contentChars: text.length,
    ref: {
      ...toEvidence(isError ? text : void 0),
      thread: call.thread.agentType
    },
    returnedAtMs: line.occurredAtMs
  };
}
function classifyResult(text, isMarkedError, wasInterrupted) {
  const head = text.slice(0, RESULT_HEAD_CHARS);
  if (INTERRUPTED.test(text.trim())) {
    return "interrupted";
  }
  if (PERMISSION_DENIED.test(head)) {
    return "permission_denied";
  }
  if (isMarkedError && HOOK_BLOCKED.test(head)) {
    return "hook_blocked";
  }
  return isMarkedError || wasInterrupted ? "error" : "ok";
}
function resultText(content) {
  if (typeof content === "string") {
    return content;
  }
  return asArray(content).map(asRecord).map((block) => {
    if (block?.type === "image") {
      return "[image]";
    }
    return block?.type === "text" ? asString(block.text) ?? "" : "";
  }).join("\n");
}
function buildToolCall(block, toolUseId, callContext) {
  const name = asString(block.name) ?? "unknown";
  const input = asRecord(block.input) ?? {};
  const description = describeToolCall(name, input, callContext.projectDir);
  return {
    ...description,
    id: toolUseId,
    name,
    summary: excerpt(description.summary, MAX_SUMMARY_CHARS),
    thread: callContext.thread,
    ref: callContext.toEvidence(description.summary),
    calledAtMs: callContext.calledAtMs,
    messageId: callContext.messageId
  };
}
function describeToolCall(name, input, projectDir) {
  const command = asString(input.command);
  if (name === "Bash" && command !== void 0) {
    return {
      key: commandKey(command),
      summary: command
    };
  }
  const filePath = firstString(input, ["file_path", "notebook_path", "path"]);
  if (FILE_TOOLS.has(name) && filePath !== void 0) {
    const projectRelativePath = toProjectRelative(filePath, projectDir);
    return {
      key: name,
      summary: `${name} ${projectRelativePath}`,
      filePath: projectRelativePath
    };
  }
  const delegatedType = asString(input.subagent_type);
  const delegatedPrompt = asString(input.prompt);
  const isDelegation = DELEGATION_TOOLS.has(name) && (delegatedType !== void 0 || delegatedPrompt !== void 0);
  if (isDelegation) {
    const subagentType = delegatedType ?? DEFAULT_SUBAGENT_TYPE;
    return {
      key: `${name}:${subagentType}`,
      summary: `${subagentType}: ${asString(input.description) ?? ""}`,
      subagentType,
      subagentPromptHash: delegatedPrompt === void 0 ? void 0 : sha(delegatedPrompt.trim())
    };
  }
  if (name === "Skill") {
    const skill = (firstString(input, ["skill", "command", "name"]) ?? "unknown").replace(/^\//, "");
    return {
      key: `Skill:${skill}`,
      summary: `skill ${skill}`,
      skill
    };
  }
  if (name.startsWith("mcp__")) {
    const [, server = "unknown", tool = ""] = name.split("__");
    return {
      key: `mcp:${server}`,
      summary: `${server} ${tool}`
    };
  }
  const detail = firstString(input, ["pattern", "url", "query"]);
  return {
    key: name,
    summary: detail === void 0 ? name : `${name} ${detail}`
  };
}
function toProjectRelative(filePath, projectDir) {
  const isInsideProject = projectDir !== void 0 && isAbsolute2(filePath) && filePath.startsWith(projectDir);
  return isInsideProject ? relative2(projectDir, filePath) || "." : filePath;
}

// src/state/store.ts
import { mkdir, readFile as readFile4, rename, writeFile } from "node:fs/promises";
import { dirname, join as join5 } from "node:path";
var FACTS_VERSION = 2;
var DATA_DIR_NAME = ".imh";
var JSON_INDENT = 2;
var FACTS_CACHE_FILE = "cache/facts.json";
var LATEST_INVENTORY_FILE = "inventory/latest.json";
var SUGGESTIONS_FILE = "suggestions.json";
var FINDING_CLASSES = [
  "rule_ignored",
  "partial_instruction",
  "missing_instruction",
  "structure_change",
  "out_of_scope",
  "already_handled"
];
var SUGGESTION_STATUSES = ["pending", "accepted", "rejected", "applied"];
var Store = class _Store {
  constructor(root) {
    this.root = root;
  }
  static forProject(projectDir, dataDir) {
    return new _Store(dataDir ?? join5(projectDir, DATA_DIR_NAME));
  }
  /**
   * Reads a file this tool wrote. Its shape is trusted because only this tool writes it;
   * files people may edit by hand (config.json) are validated by their reader.
   */
  async readJson(relativePath) {
    const text = await readFile4(join5(this.root, relativePath), "utf8").catch(() => void 0);
    return text === void 0 ? void 0 : parseJson(text);
  }
  /** Writes atomically (temp file + rename), so a crash never leaves a half-written file. */
  async writeJson(relativePath, value, shouldIndent = true) {
    const file = join5(this.root, relativePath);
    await mkdir(dirname(file), { recursive: true });
    const temporaryFile = `${file}.${process.pid}.tmp`;
    await writeFile(temporaryFile, JSON.stringify(value, null, shouldIndent ? JSON_INDENT : 0));
    await rename(temporaryFile, file);
  }
  async loadFactsCache() {
    const cache = await this.readJson(FACTS_CACHE_FILE);
    const isCurrent = cache?.version === FACTS_VERSION;
    return isCurrent ? cache : {
      version: FACTS_VERSION,
      fileToEntry: {}
    };
  }
  async saveFactsCache(cache) {
    await this.writeJson(FACTS_CACHE_FILE, cache, false);
  }
  /** Always updates the latest inventory; keeps a dated snapshot only when the harness changed. */
  async saveInventory(inventory) {
    const previous = await this.readJson(LATEST_INVENTORY_FILE);
    const hasChanged = previous?.fingerprint !== inventory.fingerprint;
    if (hasChanged) {
      const fileSafeTakenAt = inventory.takenAt.replace(/[:.]/g, "-");
      await this.writeJson(`inventory/${fileSafeTakenAt}.json`, inventory);
    }
    await this.writeJson(LATEST_INVENTORY_FILE, inventory);
    return {
      previous,
      hasChanged
    };
  }
  async loadSuggestions() {
    return await this.readJson(SUGGESTIONS_FILE) ?? [];
  }
  async saveSuggestions(suggestions) {
    await this.writeJson(SUGGESTIONS_FILE, suggestions);
  }
};

// src/analysis/load.ts
var MIN_PARSE_CONCURRENCY = 2;
var MAX_PARSE_CONCURRENCY = 8;
function cacheSignature(transcript, idleMs) {
  const subagentSignature = transcript.subagentFiles.map((subagentFile) => `${subagentFile.file}:${subagentFile.modifiedAtMs}:${subagentFile.bytes}`).join("|");
  return `${transcript.modifiedAtMs}:${transcript.bytes}:${idleMs}:${subagentSignature}`;
}
async function loadSessions(options) {
  const transcripts = await discoverTranscripts({
    projectDir: options.projectDir,
    shouldReadAllProjects: options.shouldReadAllProjects
  });
  const cache = options.shouldSkipCache ? {
    version: FACTS_VERSION,
    fileToEntry: {}
  } : await options.store.loadFactsCache();
  let parsedCount = 0;
  let cachedCount = 0;
  const concurrency = Math.max(MIN_PARSE_CONCURRENCY, Math.min(MAX_PARSE_CONCURRENCY, cpus().length));
  const allFacts = await mapWithConcurrency(transcripts, concurrency, async (transcript) => {
    const signature = cacheSignature(transcript, options.idleMs);
    const cached = cache.fileToEntry[transcript.file];
    if (cached?.signature === signature) {
      cachedCount++;
      return cached.facts;
    }
    const facts = await parseSession(transcript, {
      idleMs: options.idleMs,
      projectDir: options.projectDir
    });
    parsedCount++;
    cache.fileToEntry[transcript.file] = {
      signature,
      facts
    };
    return facts;
  });
  const liveFiles = new Set(transcripts.map((transcript) => transcript.file));
  for (const file of Object.keys(cache.fileToEntry)) {
    if (!liveFiles.has(file)) {
      cache.fileToEntry[file] = void 0;
    }
  }
  if (!options.shouldSkipCache && parsedCount > 0) {
    await options.store.saveFactsCache(cache);
  }
  const excludedSessionIds = new Set(options.excludedSessionIds ?? []);
  const projectSessions = allFacts.filter((facts, index) => {
    const isExcluded = excludedSessionIds.has(facts.sessionId);
    return !isExcluded && belongsToProject(facts, transcripts[index], options);
  });
  const startsAtMs = projectSessions.map((facts) => facts.startedAtMs).filter((startedAtMs) => startedAtMs !== void 0).sort((left, right) => left - right);
  const sessions = projectSessions.filter((facts) => isInPeriod(facts, options) && hasActivity(facts));
  return {
    sessions,
    available: {
      count: projectSessions.length,
      oldestAt: toIso(startsAtMs[0]),
      newestAt: toIso(startsAtMs.at(-1))
    },
    parsedCount,
    cachedCount,
    unparsedLines: sessions.reduce((total, facts) => total + facts.unparsedLines, 0)
  };
}
function belongsToProject(facts, transcript, options) {
  if (options.shouldReadAllProjects || transcript?.isExactProject) {
    return true;
  }
  const sessionDir = facts.projectDir;
  const isInsideProject = sessionDir === options.projectDir || sessionDir?.startsWith(`${options.projectDir}/`) === true;
  return sessionDir !== void 0 && isInsideProject;
}
function isInPeriod(facts, options) {
  const startedAtMs = facts.startedAtMs ?? 0;
  const endedAtMs = facts.endedAtMs ?? startedAtMs;
  const isBeforePeriod = options.periodStartAtMs !== void 0 && endedAtMs < options.periodStartAtMs;
  const isAfterPeriod = options.periodEndAtMs !== void 0 && startedAtMs > options.periodEndAtMs;
  return !isBeforePeriod && !isAfterPeriod;
}
function hasActivity(facts) {
  return facts.tools.length > 0 || facts.prompts.length > 0;
}

// src/state/config.ts
var CONFIG_FILE = "config.json";
var DEFAULT_CONFIG = {
  idleMinutes: 5,
  prices: DEFAULT_PRICES,
  minSessionsCompare: 5,
  minRelativeChange: 0.2,
  minSessionsForUnused: 10,
  largePieceTokens: 2500,
  signalThresholds: {
    minFailures: 3,
    minFailureSessions: 2,
    minRepeatedEvents: 2,
    minReadsPerFile: 3,
    minExtraReads: 2,
    minSubagentRereads: 3,
    minRepeatedRequestSessions: 3,
    repeatedRequestSimilarity: 0.5
  }
};
var NUMERIC_CONFIG_KEYS = [
  "idleMinutes",
  "minSessionsCompare",
  "minRelativeChange",
  "minSessionsForUnused",
  "largePieceTokens"
];
async function loadConfig(store) {
  const userConfig = asRecord(await store.readJson(CONFIG_FILE)) ?? {};
  const config = {
    ...DEFAULT_CONFIG,
    prices: {
      ...DEFAULT_PRICES,
      ...readPrices(asRecord(userConfig.prices))
    },
    signalThresholds: readThresholds(asRecord(userConfig.signalThresholds))
  };
  for (const key of NUMERIC_CONFIG_KEYS) {
    config[key] = readNonNegative(userConfig[key]) ?? DEFAULT_CONFIG[key];
  }
  return config;
}
function readThresholds(userThresholds) {
  const thresholds = { ...DEFAULT_CONFIG.signalThresholds };
  for (const key of Object.keys(thresholds)) {
    thresholds[key] = readNonNegative(userThresholds?.[key]) ?? thresholds[key];
  }
  return thresholds;
}
function readPrices(userPrices) {
  const prices = {};
  for (const [family, value] of Object.entries(userPrices ?? {})) {
    const price = asRecord(value);
    const input = readNonNegative(price?.input);
    const output = readNonNegative(price?.output);
    if (input === void 0 || output === void 0) {
      continue;
    }
    const modelPrice = {
      input,
      output,
      cacheRead: readNonNegative(price?.cacheRead),
      cacheWrite: readNonNegative(price?.cacheWrite)
    };
    prices[family] = modelPrice;
  }
  return prices;
}
function readNonNegative(value) {
  const number = asNumber(value);
  return number !== void 0 && number >= 0 ? number : void 0;
}

// src/commands/context.ts
var VERSION = true ? "0.1.0" : "dev";
var MAX_COMPACT_DESCRIPTION_CHARS = 120;
async function createContext(options) {
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const store = Store.forProject(projectDir, options.dataDir);
  const config = await loadConfig(store);
  return {
    projectDir,
    store,
    config,
    idleMs: config.idleMinutes * MS_PER_MINUTE
  };
}
async function loadProjectSessions(context, options, period = {}) {
  return loadSessions({
    projectDir: context.projectDir,
    shouldReadAllProjects: options.shouldReadAllProjects,
    ...period,
    idleMs: context.idleMs,
    store: context.store,
    shouldSkipCache: options.shouldSkipCache,
    excludedSessionIds: options.excludedSessionIds
  });
}
function compactPiece(piece) {
  return {
    id: piece.id,
    scope: piece.scope,
    path: piece.path,
    approxTokens: piece.approxTokens || void 0,
    modifiedAt: piece.modifiedAt,
    isEditable: piece.isEditable,
    model: piece.model,
    description: piece.description?.slice(0, MAX_COMPACT_DESCRIPTION_CHARS)
  };
}
function diffInventories(previous, current) {
  if (!previous) {
    return [];
  }
  const previousIdToHash = new Map(previous.pieces.map((piece) => [piece.id, piece.hash]));
  const currentIdToHash = new Map(current.pieces.map((piece) => [piece.id, piece.hash]));
  const changes = [];
  for (const [id, hash] of currentIdToHash) {
    const previousHash = previousIdToHash.get(id);
    if (previousHash === void 0) {
      changes.push({
        id,
        change: "added"
      });
    } else if (previousHash !== hash) {
      changes.push({
        id,
        change: "modified"
      });
    }
  }
  for (const id of previousIdToHash.keys()) {
    if (!currentIdToHash.has(id)) {
      changes.push({
        id,
        change: "removed"
      });
    }
  }
  return changes;
}

// src/commands/analyze.ts
var LAST_ANALYSIS_FILE = "last-analysis.json";
var DEFAULT_MAX_SIGNALS = 25;
var DEFAULT_MAX_EVIDENCE = 5;
var SAVED_EVIDENCE_PER_SIGNAL = 50;
var MAX_USAGE_ENTRIES = 15;
var MAX_FAILED_COMMANDS_TO_SEARCH = 15;
var WASTE_SIGNAL_TYPES = /* @__PURE__ */ new Set([
  "failed_command",
  "tool_error",
  "permission_denied",
  "hook_blocked",
  "repeated_read",
  "subagent_reread"
]);
var CORRECTION_SIGNAL_TYPES = /* @__PURE__ */ new Set(["user_correction", "interruption"]);
var COST_METHOD = "Active time sums gaps between transcript events up to the idle threshold; subagent time is reported per agent and not added to session time. Failure cost = time until the agent reacted + tokens of the reaction turn. Correction cost = the corrected turn (upper bound). Categories can overlap.";
async function runAnalyze(options) {
  const context = await createContext(options);
  const { config } = context;
  const periodStartAtMs = parsePointInTime(options.since);
  const periodEndAtMs = parsePointInTime(options.until);
  const inventory = await takeInventory({
    projectDir: context.projectDir,
    isProjectOnly: options.isProjectOnly
  });
  const { previous, hasChanged } = await context.store.saveInventory(inventory);
  const loaded = await loadProjectSessions(context, options, {
    periodStartAtMs,
    periodEndAtMs
  });
  const focusPieces = options.focusPieces?.filter(Boolean) ?? [];
  const isFocused = focusPieces.length > 0;
  const sessions = isFocused ? loaded.sessions.filter((session) => focusPieces.some((piece) => usesPiece(session, piece))) : loaded.sessions;
  const allSignals = extractSignals(sessions, inventory, {
    idleMs: context.idleMs,
    prices: config.prices,
    maxEvidence: SAVED_EVIDENCE_PER_SIGNAL,
    minSessionsForUnused: config.minSessionsForUnused,
    largePieceTokens: config.largePieceTokens,
    thresholds: config.signalThresholds
  });
  const signals = isFocused ? allSignals.filter((signal) => touchesAnyPiece(signal, focusPieces)) : allSignals;
  const suggestions = await context.store.loadSuggestions();
  markHandledSignals(signals, suggestions);
  await addInstructionMentions(signals, inventory);
  const pieceIds = new Set(inventory.pieces.map((piece) => piece.id));
  const usage = pieceUsage(sessions, pieceIds, config.prices);
  const analysis = {
    tool: {
      name: "improve-my-harness",
      version: VERSION
    },
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    project: context.projectDir,
    agent: inventory.agent,
    period: {
      since: toIso(periodStartAtMs) ?? loaded.available.oldestAt,
      until: toIso(periodEndAtMs) ?? (/* @__PURE__ */ new Date()).toISOString(),
      focus: focusPieces
    },
    history: {
      transcriptsAvailable: loaded.available.count,
      oldestAt: loaded.available.oldestAt,
      newestAt: loaded.available.newestAt,
      retentionDays: inventory.retention.days,
      retentionSource: inventory.retention.source,
      note: `Claude Code deletes transcripts older than ${inventory.retention.days} days at startup. improve-my-harness never changes this setting.`
    },
    analyzed: {
      sessions: sessions.length,
      subagentRuns: sessions.flatMap((session) => session.threads).filter((thread) => thread.thread.id !== MAIN_THREAD_ID).length,
      parsedNow: loaded.parsedCount,
      fromCache: loaded.cachedCount,
      unparsedLines: loaded.unparsedLines
    },
    totals: {
      ...sessionTotals(sessions, config.prices),
      lostToFailures: sumSignalCosts(signals, WASTE_SIGNAL_TYPES),
      inCorrectedOrInterruptedTurns: sumSignalCosts(signals, CORRECTION_SIGNAL_TYPES),
      isEstimated: true,
      method: COST_METHOD,
      idleMinutes: config.idleMinutes
    },
    inventory: {
      fingerprint: inventory.fingerprint,
      hasChangedSinceLastRun: hasChanged,
      changes: diffInventories(previous, inventory),
      pieces: inventory.pieces.map(compactPiece),
      notes: inventory.notes
    },
    usage,
    signals,
    suggestions: countBy(suggestions.map((suggestion) => suggestion.status)),
    dataDir: context.store.root
  };
  await context.store.writeJson(LAST_ANALYSIS_FILE, analysis);
  return compactAnalysis(analysis, options);
}
function compactAnalysis(analysis, options) {
  const maxSignals = options.maxSignals ?? DEFAULT_MAX_SIGNALS;
  const maxEvidence = options.maxEvidence ?? DEFAULT_MAX_EVIDENCE;
  return {
    ...analysis,
    usage: analysis.usage.slice(0, MAX_USAGE_ENTRIES),
    signals: analysis.signals.slice(0, maxSignals).map((signal) => ({
      ...signal,
      evidence: signal.evidence.slice(0, maxEvidence)
    })),
    omittedSignals: Math.max(0, analysis.signals.length - maxSignals),
    hint: "Full result in .imh/last-analysis.json. Use `imh evidence <signal-id>` for all evidence of one signal."
  };
}
function touchesAnyPiece(signal, pieces) {
  return signal.pieces.some(
    (signalPiece) => pieces.some((piece) => signalPiece === piece || signalPiece.startsWith(`${piece} `))
  );
}
function markHandledSignals(signals, suggestions) {
  const signalIdToSuggestion = /* @__PURE__ */ new Map();
  for (const suggestion of suggestions) {
    for (const signalId of suggestion.signals) {
      signalIdToSuggestion.set(signalId, suggestion);
    }
  }
  for (const signal of signals) {
    const suggestion = signalIdToSuggestion.get(signal.id);
    if (suggestion) {
      signal.handledBy = {
        suggestionId: suggestion.id,
        status: suggestion.status
      };
    }
  }
}
async function addInstructionMentions(signals, inventory) {
  const failedCommandSignals = signals.filter((signal) => signal.type === "failed_command").slice(0, MAX_FAILED_COMMANDS_TO_SEARCH);
  for (const signal of failedCommandSignals) {
    const failedCommand = signal.id.slice("failed_command:".length);
    const workingCommands = (signal.details.recoveredWith ?? []).map((recovery) => recovery.value);
    const mentions = await findMentions(inventory, [failedCommand, ...workingCommands]);
    if (mentions.length) {
      signal.details.mentions = mentions;
    }
  }
}
function sessionTotals(sessions, prices) {
  let usage = ZERO_USAGE;
  let usd = 0;
  let mainActiveMs = 0;
  let subagentActiveMs = 0;
  for (const session of sessions) {
    mainActiveMs += session.activeMs;
    subagentActiveMs += session.threads.filter((thread) => thread.thread.id !== MAIN_THREAD_ID).reduce((total, thread) => total + thread.activeMs, 0);
    for (const message of session.messages) {
      usage = addUsage(usage, message.usage);
      usd += usageCostUsd(message.usage, message.model, prices);
    }
  }
  return {
    activeMinutes: msToMinutes(mainActiveMs),
    subagentActiveMinutes: msToMinutes(subagentActiveMs),
    tokens: totalTokens(usage),
    usd: round(usd)
  };
}
function sumSignalCosts(allSignals, types) {
  const signals = allSignals.filter((signal) => types.has(signal.type));
  return {
    activeMinutes: round(signals.reduce((total, signal) => total + signal.cost.activeMinutes, 0), 1),
    tokens: signals.reduce((total, signal) => total + signal.cost.tokens, 0),
    usd: round(signals.reduce((total, signal) => total + signal.cost.usd, 0))
  };
}

// src/commands/compare.ts
async function runCompare(options) {
  const context = await createContext(options);
  const changePoint = await findChangePoint(context, options);
  if (!changePoint) {
    throw new Error(`Don't know when ${options.piece} changed. Pass --at <date>.`);
  }
  const loaded = await loadProjectSessions(context, options, { periodStartAtMs: parsePointInTime(options.since) });
  return comparePiece(loaded.sessions, options.piece, changePoint.changedAtMs, changePoint.source, {
    minSessions: context.config.minSessionsCompare,
    minRelativeChange: context.config.minRelativeChange,
    prices: context.config.prices,
    idleMs: context.idleMs,
    thresholds: context.config.signalThresholds
  });
}
async function findChangePoint(context, options) {
  const explicitAtMs = parsePointInTime(options.changedAt);
  if (explicitAtMs !== void 0) {
    return {
      changedAtMs: explicitAtMs,
      source: "--at"
    };
  }
  const lastApplied = (await context.store.loadSuggestions()).filter((suggestion) => suggestion.piece === options.piece && suggestion.appliedAt !== void 0).sort((left, right) => (right.appliedAt ?? "").localeCompare(left.appliedAt ?? ""))[0];
  if (lastApplied?.appliedAt) {
    return {
      changedAtMs: Date.parse(lastApplied.appliedAt),
      source: `suggestion ${lastApplied.id} applied`
    };
  }
  const inventory = await takeInventory({
    projectDir: context.projectDir,
    isProjectOnly: options.isProjectOnly
  });
  const piece = inventory.pieces.find((candidate) => candidate.id === options.piece);
  if (!piece?.modifiedAt) {
    return void 0;
  }
  return {
    changedAtMs: Date.parse(piece.modifiedAt),
    source: `${piece.path} last changed (${piece.modifiedSource ?? "unknown"})`
  };
}

// src/commands/evidence.ts
var DEFAULT_MAX_EVIDENCE2 = 50;
async function runEvidence(options) {
  const context = await createContext(options);
  const analysis = await context.store.readJson(LAST_ANALYSIS_FILE);
  if (!analysis) {
    throw new Error("No analysis yet. Run `imh analyze` first.");
  }
  const signal = analysis.signals.find(
    (candidate) => candidate.id === options.signalId || candidate.id.startsWith(options.signalId)
  );
  if (!signal) {
    throw new Error(`Signal not found: ${options.signalId}`);
  }
  return {
    generatedAt: analysis.generatedAt,
    ...signal,
    evidence: signal.evidence.slice(0, options.maxEvidence ?? DEFAULT_MAX_EVIDENCE2)
  };
}

// src/commands/inventory.ts
async function runInventory(options) {
  const context = await createContext(options);
  const inventory = await takeInventory({
    projectDir: context.projectDir,
    isProjectOnly: options.isProjectOnly
  });
  const { previous, hasChanged } = await context.store.saveInventory(inventory);
  return {
    project: context.projectDir,
    fingerprint: inventory.fingerprint,
    hasChangedSinceLastSnapshot: hasChanged,
    changes: diffInventories(previous, inventory),
    retention: inventory.retention,
    pieces: inventory.pieces.map(compactPiece),
    notes: inventory.notes
  };
}

// src/commands/status.ts
async function runStatus(options) {
  const context = await createContext(options);
  const inventory = await takeInventory({
    projectDir: context.projectDir,
    isProjectOnly: options.isProjectOnly
  });
  const loaded = await loadProjectSessions(context, options);
  const suggestions = await context.store.loadSuggestions();
  return {
    version: VERSION,
    project: context.projectDir,
    node: process.version,
    transcripts: loaded.available,
    retention: inventory.retention,
    pieces: countBy(inventory.pieces.map((piece) => piece.kind)),
    suggestions: countBy(suggestions.map((suggestion) => suggestion.status)),
    dataDir: context.store.root,
    config: context.config
  };
}

// src/commands/suggestions.ts
var SUGGESTION_ID_HASH_CHARS = 8;
var MAX_TITLE_CHARS = 200;
var MAX_CHANGE_CHARS = 2e3;
var MAX_NOTE_CHARS = 500;
function suggestionId(suggestion) {
  const sortedSignals = [...suggestion.signals].sort().join("|");
  return `sug-${sha(`${sortedSignals}@${suggestion.piece ?? ""}`, SUGGESTION_ID_HASH_CHARS)}`;
}
function isSuggestionStatus(value) {
  return SUGGESTION_STATUSES.includes(value);
}
function isFindingClass(value) {
  return FINDING_CLASSES.includes(value);
}
function parseNewSuggestions(value) {
  const items = Array.isArray(value) ? value : [value];
  return items.map((item, itemIndex) => {
    const record = asRecord(item);
    const title = asString(record?.title);
    const findingClass = asString(record?.class);
    const signals = asArray(record?.signals).map(asString).filter((signalId) => signalId !== void 0);
    const status = asString(record?.status);
    if (!title || !signals.length || findingClass === void 0 || !isFindingClass(findingClass)) {
      throw new Error(
        `Suggestion ${itemIndex + 1} needs a title, at least one signal id, and a class (${FINDING_CLASSES.join(", ")}).`
      );
    }
    if (status !== void 0 && !isSuggestionStatus(status)) {
      const validStatuses = SUGGESTION_STATUSES.join(", ");
      throw new Error(`Suggestion ${itemIndex + 1} has an invalid status. Use one of: ${validStatuses}.`);
    }
    return {
      title,
      class: findingClass,
      piece: asString(record?.piece),
      signals,
      change: asString(record?.change),
      status,
      note: asString(record?.note)
    };
  });
}
async function runListSuggestions(options) {
  const context = await createContext(options);
  const suggestions = await context.store.loadSuggestions();
  return options.status ? suggestions.filter((suggestion) => suggestion.status === options.status) : suggestions;
}
async function runAddSuggestions(options) {
  const newSuggestions = parseNewSuggestions(options.items);
  const context = await createContext(options);
  const suggestions = await context.store.loadSuggestions();
  const createdAt = (/* @__PURE__ */ new Date()).toISOString();
  const result = {
    added: [],
    existing: [],
    total: 0
  };
  for (const newSuggestion of newSuggestions) {
    const id = suggestionId(newSuggestion);
    const existing = suggestions.find((suggestion) => suggestion.id === id);
    if (existing) {
      result.existing.push({
        id,
        status: existing.status
      });
      continue;
    }
    suggestions.push({
      id,
      title: newSuggestion.title.slice(0, MAX_TITLE_CHARS),
      class: newSuggestion.class,
      piece: newSuggestion.piece,
      signals: newSuggestion.signals,
      status: newSuggestion.status ?? "pending",
      createdAt,
      updatedAt: createdAt,
      change: newSuggestion.change?.slice(0, MAX_CHANGE_CHARS),
      note: newSuggestion.note?.slice(0, MAX_NOTE_CHARS)
    });
    result.added.push(id);
  }
  await context.store.saveSuggestions(suggestions);
  result.total = suggestions.length;
  return result;
}
async function runSetSuggestionStatus(options) {
  const context = await createContext(options);
  const suggestions = await context.store.loadSuggestions();
  const suggestion = suggestions.find((candidate) => candidate.id === options.id);
  if (!suggestion) {
    throw new Error(`Suggestion not found: ${options.id}`);
  }
  suggestion.status = options.status;
  suggestion.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  if (options.note) {
    suggestion.note = options.note.slice(0, MAX_NOTE_CHARS);
  }
  if (options.status === "applied") {
    const inventory = await takeInventory({
      projectDir: context.projectDir,
      isProjectOnly: options.isProjectOnly
    });
    await context.store.saveInventory(inventory);
    suggestion.appliedAt = suggestion.updatedAt;
    suggestion.appliedFingerprint = inventory.fingerprint;
  }
  await context.store.saveSuggestions(suggestions);
  return suggestion;
}

// src/cli.ts
var MIN_NODE_MAJOR = 20;
var JSON_INDENT2 = 2;
var HELP = `imh ${VERSION} \u2014 improve-my-harness analysis script

Usage: imh <command> [options]

Commands
  analyze                 Map the harness, read session transcripts and extract signals
  inventory               Snapshot the active harness (saved to .imh/inventory/ when it changes)
  evidence <signal-id>    All evidence for one signal from the last analysis
  compare --piece <id>    Before/after metrics for one piece (e.g. agent:code-reviewer)
  suggestions list        List suggestions [--status pending|accepted|rejected|applied]
  suggestions add         Add suggestions from --file <json> or stdin (array of objects)
  suggestions set <id> <status> [--note text]
  status                  Transcripts available, retention, pieces and config

Options
  --project <dir>         Project directory (default: current directory)
  --since <period|date>   e.g. 14d, 2w, 2026-09-01
  --until <period|date>
  --piece <id>            Focus on a piece (repeatable)
  --at <date>             compare: when the piece changed (default: applied suggestion or last change)
  --project-only          Ignore user-level and plugin pieces
  --all-projects          Read transcripts from every project
  --max-signals <n>       analyze: signals in stdout (default 25)
  --max-evidence <n>      analyze: evidence per signal in stdout (default 5)
  --max <n>               evidence: evidence items (default 50)
  --data-dir <dir>        Where state lives (default: <project>/.imh)
  --exclude-session <id>  Leave a session out, e.g. the one running the analysis (repeatable)
  --no-cache              Re-parse every transcript
  --pretty                Indented JSON

Output is JSON on stdout. Nothing leaves your machine.`;
var ARGUMENT_SPEC = {
  "project": { type: "string" },
  "since": { type: "string" },
  "until": { type: "string" },
  "piece": { type: "string", multiple: true },
  "at": { type: "string" },
  "status": { type: "string" },
  "note": { type: "string" },
  "file": { type: "string" },
  "max": { type: "string" },
  "max-signals": { type: "string" },
  "max-evidence": { type: "string" },
  "data-dir": { type: "string" },
  "project-only": { type: "boolean" },
  "all-projects": { type: "boolean" },
  "no-cache": { type: "boolean" },
  "exclude-session": { type: "string", multiple: true },
  "pretty": { type: "boolean" },
  "help": { type: "boolean", short: "h" },
  "version": { type: "boolean", short: "v" }
};
var COMMAND_NAME_TO_HANDLER = {
  analyze: async ({ values, common }) => runAnalyze({
    ...common,
    since: values.since,
    until: values.until,
    focusPieces: values.piece,
    maxSignals: readCount(values["max-signals"], "--max-signals"),
    maxEvidence: readCount(values["max-evidence"], "--max-evidence")
  }),
  inventory: async ({ common }) => runInventory(common),
  evidence: async ({ values, rest, common }) => {
    const [signalId] = rest;
    if (!signalId) {
      throw new Error("Usage: imh evidence <signal-id>");
    }
    return runEvidence({
      ...common,
      signalId,
      maxEvidence: readCount(values.max, "--max")
    });
  },
  compare: async ({ values, common }) => {
    const piece = values.piece?.[0];
    if (!piece) {
      throw new Error("Usage: imh compare --piece <id> [--at <date>]");
    }
    return runCompare({
      ...common,
      piece,
      changedAt: values.at,
      since: values.since
    });
  },
  status: async ({ common }) => runStatus(common),
  suggestions: async (invocation) => runSuggestionsCommand(invocation)
};
function parseArguments(argv) {
  return parseArgs({
    args: argv,
    allowPositionals: true,
    options: ARGUMENT_SPEC
  });
}
function isCommandName(value) {
  return value in COMMAND_NAME_TO_HANDLER;
}
async function main(argv) {
  const { values, positionals } = parseArguments(argv);
  if (values.version) {
    process.stdout.write(`${VERSION}
`);
    return;
  }
  const [commandName, ...rest] = positionals;
  if (values.help || !commandName || commandName === "help") {
    process.stdout.write(`${HELP}
`);
    return;
  }
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (nodeMajor < MIN_NODE_MAJOR) {
    throw new Error(`Node.js ${MIN_NODE_MAJOR}+ is required (found ${process.version}).`);
  }
  if (!isCommandName(commandName)) {
    throw new Error(`Unknown command: ${commandName}. Run \`imh --help\`.`);
  }
  const result = await COMMAND_NAME_TO_HANDLER[commandName]({
    values,
    rest,
    common: {
      projectDir: values.project,
      dataDir: values["data-dir"],
      isProjectOnly: values["project-only"],
      shouldReadAllProjects: values["all-projects"],
      shouldSkipCache: values["no-cache"],
      excludedSessionIds: values["exclude-session"]
    }
  });
  process.stdout.write(`${JSON.stringify(result, null, values.pretty ? JSON_INDENT2 : 0)}
`);
}
async function runSuggestionsCommand({ values, rest, common }) {
  const [subcommand = "list", id, status] = rest;
  if (subcommand === "list") {
    const statusFilter = values.status;
    if (statusFilter !== void 0 && !isSuggestionStatus(statusFilter)) {
      throw new Error(`Unknown status: ${statusFilter}`);
    }
    return runListSuggestions({
      ...common,
      status: statusFilter
    });
  }
  if (subcommand === "add") {
    const rawJson = values.file ? await readFile5(values.file, "utf8") : await readStdin();
    const items = parseJson(rawJson);
    if (items === void 0) {
      throw new Error("Suggestions must be valid JSON.");
    }
    return runAddSuggestions({
      ...common,
      items
    });
  }
  if (subcommand === "set") {
    if (!id || !status || !isSuggestionStatus(status)) {
      throw new Error("Usage: imh suggestions set <id> <pending|accepted|rejected|applied> [--note text]");
    }
    return runSetSuggestionStatus({
      ...common,
      id,
      status,
      note: values.note
    });
  }
  throw new Error(`Unknown suggestions command: ${subcommand}`);
}
function readCount(value, flag) {
  if (value === void 0) {
    return void 0;
  }
  const count = Number(value);
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`${flag} must be a non-negative integer.`);
  }
  return count;
}
async function readStdin() {
  if (process.stdin.isTTY) {
    throw new Error("Pass --file <json> or pipe JSON on stdin.");
  }
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}
var FIRST_ARGUMENT_INDEX = 2;
main(process.argv.slice(FIRST_ARGUMENT_INDEX)).then(
  () => process.exit(0),
  (error) => {
    process.stderr.write(`imh: ${error instanceof Error ? error.message : String(error)}
`);
    process.exit(1);
  }
);
