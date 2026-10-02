// Claude Code harness mapper: what is active for a project right now.
// Reads instruction files, skills, subagents, commands, hooks, MCP servers and
// enabled plugins. MCP and hook entries are reduced to names and shapes:
// env values, headers and arguments are never stored.

import { execFile } from "node:child_process";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { promisify } from "node:util";
import type { HarnessPiece, Inventory, PieceKind, PieceScope } from "../../core/types.js";
import { approxTokens, asList, parseFrontmatter, sha, tildify } from "../../core/util.js";
import { claudeHome, claudeJsonPath } from "./paths.js";

const exec = promisify(execFile);

export interface InventoryOptions {
  projectDir: string;
  home?: string;
  /** Skip user-level and plugin pieces (only what's committed to the project). */
  projectOnly?: boolean;
}

export async function takeInventory(opts: InventoryOptions): Promise<Inventory> {
  const home = opts.home ?? claudeHome();
  const project = opts.projectDir;
  const pieces: HarnessPiece[] = [];
  const notes: string[] = [];
  const git = await gitDates(project);

  const seenFiles = new Set<string>();
  const add = async (file: string, kind: PieceKind, name: string, scope: PieceScope, extra: Partial<HarnessPiece> = {}) => {
    const real = await realpath(file).catch(() => file);
    if (seenFiles.has(real)) return; // e.g. the project is the home directory
    seenFiles.add(real);
    const text = await readFile(file, "utf8").catch(() => undefined);
    if (text === undefined) return;
    const st = await stat(file).catch(() => undefined);
    const rel = scope === "project" || scope === "local" ? relative(project, file) : tildify(file);
    const { data } = parseFrontmatter(text);
    const relFile = relative(project, file);
    const gitDate = scope === "project" && !git.dirty.has(relFile) ? git.get(relFile) : undefined;
    // Same name in two scopes (e.g. a user and a project skill): keep both, disambiguate the id.
    const baseId = `${kind}:${name}`;
    const id = pieces.some((p) => p.id === baseId) ? `${baseId}@${scope}` : baseId;
    pieces.push({
      id,
      kind,
      name,
      scope,
      path: rel,
      hash: sha(text),
      bytes: Buffer.byteLength(text),
      approxTokens: approxTokens(text),
      description: typeof data.description === "string" ? data.description.slice(0, 300) : undefined,
      model: typeof data.model === "string" ? data.model : undefined,
      tools: asList(data.tools ?? data["allowed-tools"]),
      modifiedAt: gitDate ?? (st ? new Date(st.mtimeMs).toISOString() : undefined),
      modifiedSource: gitDate ? "git" : "mtime",
      editable: scope !== "plugin" && scope !== "managed",
      ...extra,
    });
  };

  // Instruction files
  await add(join(project, "CLAUDE.md"), "instructions", "project", "project");
  await add(join(project, ".claude", "CLAUDE.md"), "instructions", "project-dotclaude", "project");
  await add(join(project, "CLAUDE.local.md"), "instructions", "local", "local");
  if (!opts.projectOnly) await add(join(home, "CLAUDE.md"), "instructions", "user", "user");

  // Skills, agents, commands
  await scanComponents(join(project, ".claude"), "project", add);
  if (!opts.projectOnly) await scanComponents(home, "user", add);

  // Settings: hooks + permissions + enabled plugins
  // Lowest precedence first, so later files win for enabledPlugins and cleanupPeriodDays.
  const settingsFiles: Array<[string, PieceScope]> = [];
  if (!opts.projectOnly) settingsFiles.push([join(home, "settings.json"), "user"]);
  settingsFiles.push([join(project, ".claude", "settings.json"), "project"], [join(project, ".claude", "settings.local.json"), "local"]);
  const seenSettings = new Set<string>();
  const enabledPlugins = new Map<string, boolean>();
  let retention = { days: 30, source: "default" };
  for (const [file, scope] of settingsFiles) {
    const real = await realpath(file).catch(() => file);
    if (seenSettings.has(real)) continue;
    seenSettings.add(real);
    const json = await readJson(file);
    if (!json) continue;
    pieces.push(...hookPieces(json.hooks, file, scope, project, git));
    if (json.permissions && typeof json.permissions === "object") {
      const allow = Array.isArray(json.permissions.allow) ? json.permissions.allow.length : 0;
      const deny = Array.isArray(json.permissions.deny) ? json.permissions.deny.length : 0;
      const body = JSON.stringify(json.permissions);
      pieces.push({
        id: `settings:permissions-${scope}`,
        kind: "settings",
        name: `permissions (${scope})`,
        scope,
        path: scope === "user" ? tildify(file) : relative(project, file),
        hash: sha(body),
        bytes: body.length,
        approxTokens: 0,
        description: `${allow} allow rules, ${deny} deny rules`,
        modifiedAt: git.get(relative(project, file)),
        modifiedSource: git.has(relative(project, file)) ? "git" : undefined,
        editable: true,
      });
    }
    if (json.enabledPlugins && typeof json.enabledPlugins === "object") {
      for (const [id, on] of Object.entries(json.enabledPlugins)) enabledPlugins.set(id, on === true);
    }
    if (typeof json.cleanupPeriodDays === "number") retention = { days: json.cleanupPeriodDays, source: scope === "user" ? tildify(file) : relative(project, file) };
  }

  // MCP servers: project .mcp.json, and user/local entries in ~/.claude.json
  const mcp = await readJson(join(project, ".mcp.json"));
  pieces.push(...mcpPieces(mcp?.mcpServers, ".mcp.json", "project", git.get(".mcp.json")));
  if (!opts.projectOnly) {
    const cj = await readJson(claudeJsonPath());
    if (cj) {
      pieces.push(...mcpPieces(cj.mcpServers, tildify(claudeJsonPath()), "user"));
      const proj = cj.projects?.[project];
      pieces.push(...mcpPieces(proj?.mcpServers, tildify(claudeJsonPath()), "local"));
    }
  }

  // Plugins (read-only for the user: suggestions about them are recommendations only)
  if (!opts.projectOnly) {
    const installed = await installedPlugins(home);
    for (const [id, installPath] of installed) {
      if (enabledPlugins.get(id) === false) continue;
      if (!enabledPlugins.has(id)) notes.push(`Plugin ${id} is installed but not listed in enabledPlugins; assumed enabled.`);
      const manifest = await readJson(join(installPath, ".claude-plugin", "plugin.json"));
      const body = JSON.stringify(manifest ?? {});
      pieces.push({
        id: `plugin:${id}`,
        kind: "plugin",
        name: id,
        scope: "plugin",
        path: tildify(installPath),
        hash: sha(body),
        bytes: body.length,
        approxTokens: 0,
        description: typeof manifest?.description === "string" ? manifest.description.slice(0, 300) : undefined,
        editable: false,
        plugin: id,
      });
      const pluginName = id.split("@")[0]!;
      await scanComponents(installPath, "plugin", (file, kind, name, scope, extra) =>
        add(file, kind, `${pluginName}:${name}`, scope, { ...extra, plugin: id }),
        true,
      );
    }
  }

  pieces.sort((a, b) => a.id.localeCompare(b.id));
  const fingerprint = sha(pieces.map((p) => `${p.id}=${p.hash}`).join("\n"));
  return {
    agent: "claude-code",
    projectDir: project,
    takenAt: new Date().toISOString(),
    fingerprint,
    pieces,
    retention,
    notes,
  };
}

type AddFn = (file: string, kind: PieceKind, name: string, scope: PieceScope, extra?: Partial<HarnessPiece>) => Promise<void>;

/** Scans <base>/skills/*\/SKILL.md, <base>/agents/**\/*.md and <base>/commands/**\/*.md. */
async function scanComponents(base: string, scope: PieceScope, add: AddFn, isPluginRoot = false): Promise<void> {
  for (const dir of await readdir(join(base, "skills")).catch(() => [] as string[])) {
    const file = join(base, "skills", dir, "SKILL.md");
    const text = await readFile(file, "utf8").catch(() => undefined);
    if (text === undefined) continue;
    const name = parseFrontmatter(text).data.name;
    await add(file, "skill", typeof name === "string" && name ? name : dir, scope);
  }
  if (isPluginRoot) {
    const rootSkill = join(base, "SKILL.md");
    if (await stat(rootSkill).catch(() => undefined)) await add(rootSkill, "skill", basename(base), scope);
  }
  for (const file of await walkMd(join(base, "agents"))) {
    const text = await readFile(file, "utf8").catch(() => "");
    const fmName = parseFrontmatter(text).data.name;
    const name = typeof fmName === "string" && fmName ? fmName : relative(join(base, "agents"), file).replace(/\.md$/, "").replace(/[\\/]/g, ":");
    await add(file, "agent", name, scope);
  }
  for (const file of await walkMd(join(base, "commands"))) {
    const name = relative(join(base, "commands"), file).replace(/\.md$/, "").replace(/[\\/]/g, ":");
    await add(file, "command", name, scope);
  }
}

async function walkMd(dir: string, depth = 0): Promise<string[]> {
  if (depth > 4) return [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const out: string[] = [];
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walkMd(p, depth + 1)));
    else if (e.isFile() && e.name.endsWith(".md")) out.push(p);
  }
  return out;
}

function hookPieces(hooks: any, file: string, scope: PieceScope, project: string, git: Map<string, string>): HarnessPiece[] {
  if (!hooks || typeof hooks !== "object") return [];
  const out: HarnessPiece[] = [];
  const rel = scope === "user" ? tildify(file) : relative(project, file);
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) continue;
    groups.forEach((group: any, i: number) => {
      const matcher = typeof group?.matcher === "string" && group.matcher ? group.matcher : "*";
      const handlers = Array.isArray(group?.hooks) ? group.hooks : [];
      // Keep only the shape: handler type and the program name, never full commands/args.
      const shape = handlers.map((h: any) => `${h?.type ?? "?"}:${typeof h?.command === "string" ? basename(h.command.split(/\s+/)[0] ?? "") : ""}`);
      const body = JSON.stringify(group);
      out.push({
        id: `hook:${scope}:${event}:${matcher}#${i}`,
        kind: "hook",
        name: `${event} ${matcher}`,
        scope,
        path: rel,
        hash: sha(body),
        bytes: body.length,
        approxTokens: 0,
        description: shape.join(", "),
        modifiedAt: git.get(relative(project, file)),
        modifiedSource: git.has(relative(project, file)) ? "git" : undefined,
        editable: true,
      });
    });
  }
  return out;
}

function mcpPieces(servers: any, path: string, scope: PieceScope, modifiedAt?: string): HarnessPiece[] {
  if (!servers || typeof servers !== "object") return [];
  return Object.entries(servers).map(([name, cfg]: [string, any]) => {
    const transport = cfg?.type ?? (cfg?.url ? "http" : "stdio");
    const program = typeof cfg?.command === "string" ? basename(cfg.command) : undefined;
    // Hash the full config so changes are detected, but store none of it.
    const body = JSON.stringify(cfg ?? {});
    return {
      id: `mcp:${name}`,
      kind: "mcp" as const,
      name,
      scope,
      path,
      hash: sha(body),
      bytes: body.length,
      approxTokens: 0,
      description: program ? `${transport} (${program})` : String(transport),
      modifiedAt,
      modifiedSource: modifiedAt ? ("git" as const) : undefined,
      editable: true,
    };
  });
}

/** Reads installed_plugins.json (v1 or v2 shape). Returns id → install path. */
async function installedPlugins(home: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const json = await readJson(join(home, "plugins", "installed_plugins.json"));
  const plugins = json?.plugins ?? json;
  if (plugins && typeof plugins === "object") {
    for (const [id, value] of Object.entries(plugins)) {
      const entries = Array.isArray(value) ? value : [value];
      const last: any = entries[entries.length - 1];
      if (last && typeof last.installPath === "string") out.set(id, last.installPath);
    }
  }
  return out;
}

async function readJson(file: string): Promise<any | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return undefined;
  }
}

/** Last commit date per file in the project (one git call). Empty when not a git repo. */
async function gitDates(project: string): Promise<Map<string, string> & { dirty: Set<string> }> {
  const out = Object.assign(new Map<string, string>(), { dirty: new Set<string>() });
  const paths = ["CLAUDE.md", "CLAUDE.local.md", ".claude", ".mcp.json"];
  try {
    // Files with uncommitted changes fall back to mtime.
    const { stdout: status } = await exec("git", ["status", "--porcelain", "--untracked-files=all", "--", ...paths], { cwd: project, timeout: 15000 });
    for (const line of status.split("\n")) if (line.length > 3) out.dirty.add(line.slice(3).trim());
  } catch {
    return out;
  }
  try {
    const { stdout } = await exec(
      "git",
      ["log", "--format=__C__%cI", "--name-only", "--", ...paths],
      { cwd: project, maxBuffer: 32 * 1024 * 1024, timeout: 15000 },
    );
    let current: string | undefined;
    for (const line of stdout.split("\n")) {
      if (line.startsWith("__C__")) current = line.slice(5).trim();
      else if (line.trim() && current && !out.has(line.trim())) out.set(line.trim(), current);
    }
  } catch {
    /* not a git repo or git missing */
  }
  return out;
}
