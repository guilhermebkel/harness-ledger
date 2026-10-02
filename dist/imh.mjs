#!/usr/bin/env node
// improve-my-harness — generated file, edit src/ and run `npm run build`.

// src/cli.ts
import { readFile as readFile5 } from "node:fs/promises";
import { parseArgs } from "node:util";

// src/commands.ts
import { resolve } from "node:path";

// src/core/util.ts
import { createHash } from "node:crypto";
import { homedir } from "node:os";
function sha(text, length = 12) {
  return createHash("sha256").update(text).digest("hex").slice(0, length);
}
function approxTokens(text) {
  return Math.ceil(text.length / 4);
}
function tildify(path) {
  const home = homedir();
  return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}
function parseSince(value, now = Date.now()) {
  if (!value) return void 0;
  const m = /^(\d+)\s*([hdwm])$/i.exec(value.trim());
  if (m) {
    const n = Number(m[1]);
    const unit = m[2].toLowerCase();
    const day = 24 * 3600 * 1e3;
    const ms = unit === "h" ? n * 3600 * 1e3 : unit === "d" ? n * day : unit === "w" ? n * 7 * day : n * 30 * day;
    return now - ms;
  }
  const t = Date.parse(value);
  if (Number.isNaN(t)) throw new Error(`Invalid date or period: "${value}". Use e.g. 14d, 2w, 6h or 2026-09-01.`);
  return t;
}
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
function round(n, digits = 2) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
function minutes(ms) {
  return round(ms / 6e4, 1);
}
function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { data: {}, body: text };
  const data = {};
  let currentKey;
  let blockMode;
  for (const raw of m[1].split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && currentKey && blockMode !== "text") {
      const prev = data[currentKey];
      const list = Array.isArray(prev) ? prev : [];
      list.push(unquote(item[1]));
      data[currentKey] = list;
      blockMode = "list";
      continue;
    }
    if (/^\s+/.test(line) && currentKey && blockMode === "text") {
      data[currentKey] = `${String(data[currentKey] ?? "")} ${line.trim()}`.trim();
      continue;
    }
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (kv) {
      currentKey = kv[1];
      const value = kv[2].trim();
      if (value === "") {
        data[currentKey] = "";
        blockMode = void 0;
      } else if (value === "|" || value === ">" || value === "|-" || value === ">-") {
        data[currentKey] = "";
        blockMode = "text";
      } else if (value.startsWith("[") && value.endsWith("]")) {
        data[currentKey] = value.slice(1, -1).split(",").map((s) => unquote(s.trim())).filter(Boolean);
        blockMode = void 0;
      } else {
        data[currentKey] = unquote(value);
        blockMode = void 0;
      }
    }
  }
  return { data, body: text.slice(m[0].length) };
}
function unquote(s) {
  return s.replace(/^["'](.*)["']$/, "$1");
}
function asList(value) {
  if (value === void 0 || value === "") return void 0;
  if (Array.isArray(value)) return value;
  return value.split(value.includes(",") ? "," : /\s+(?![^(]*\))/).map((s) => s.trim()).filter(Boolean);
}

// src/adapters/claude-code/inventory.ts
import { execFile } from "node:child_process";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { basename, join as join2, relative } from "node:path";
import { promisify } from "node:util";

// src/adapters/claude-code/paths.ts
import { homedir as homedir2 } from "node:os";
import { join } from "node:path";
function claudeHome() {
  return process.env.IMH_CLAUDE_HOME || process.env.CLAUDE_CONFIG_DIR || join(homedir2(), ".claude");
}
function claudeJsonPath() {
  if (process.env.IMH_CLAUDE_JSON) return process.env.IMH_CLAUDE_JSON;
  if (process.env.CLAUDE_CONFIG_DIR) return join(process.env.CLAUDE_CONFIG_DIR, ".claude.json");
  return join(homedir2(), ".claude.json");
}
function encodeProjectDir(dir) {
  return dir.replace(/[^a-zA-Z0-9]/g, "-");
}

// src/adapters/claude-code/inventory.ts
var exec = promisify(execFile);
async function takeInventory(opts) {
  const home = opts.home ?? claudeHome();
  const project = opts.projectDir;
  const pieces = [];
  const notes = [];
  const git = await gitDates(project);
  const seenFiles = /* @__PURE__ */ new Set();
  const add = async (file, kind, name, scope, extra = {}) => {
    const real = await realpath(file).catch(() => file);
    if (seenFiles.has(real)) return;
    seenFiles.add(real);
    const text = await readFile(file, "utf8").catch(() => void 0);
    if (text === void 0) return;
    const st = await stat(file).catch(() => void 0);
    const rel = scope === "project" || scope === "local" ? relative(project, file) : tildify(file);
    const { data } = parseFrontmatter(text);
    const relFile = relative(project, file);
    const gitDate = scope === "project" && !git.dirty.has(relFile) ? git.get(relFile) : void 0;
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
      description: typeof data.description === "string" ? data.description.slice(0, 300) : void 0,
      model: typeof data.model === "string" ? data.model : void 0,
      tools: asList(data.tools ?? data["allowed-tools"]),
      modifiedAt: gitDate ?? (st ? new Date(st.mtimeMs).toISOString() : void 0),
      modifiedSource: gitDate ? "git" : "mtime",
      editable: scope !== "plugin" && scope !== "managed",
      ...extra
    });
  };
  await add(join2(project, "CLAUDE.md"), "instructions", "project", "project");
  await add(join2(project, ".claude", "CLAUDE.md"), "instructions", "project-dotclaude", "project");
  await add(join2(project, "CLAUDE.local.md"), "instructions", "local", "local");
  if (!opts.projectOnly) await add(join2(home, "CLAUDE.md"), "instructions", "user", "user");
  await scanComponents(join2(project, ".claude"), "project", add);
  if (!opts.projectOnly) await scanComponents(home, "user", add);
  const settingsFiles = [];
  if (!opts.projectOnly) settingsFiles.push([join2(home, "settings.json"), "user"]);
  settingsFiles.push([join2(project, ".claude", "settings.json"), "project"], [join2(project, ".claude", "settings.local.json"), "local"]);
  const seenSettings = /* @__PURE__ */ new Set();
  const enabledPlugins = /* @__PURE__ */ new Map();
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
        modifiedSource: git.has(relative(project, file)) ? "git" : void 0,
        editable: true
      });
    }
    if (json.enabledPlugins && typeof json.enabledPlugins === "object") {
      for (const [id, on] of Object.entries(json.enabledPlugins)) enabledPlugins.set(id, on === true);
    }
    if (typeof json.cleanupPeriodDays === "number") retention = { days: json.cleanupPeriodDays, source: scope === "user" ? tildify(file) : relative(project, file) };
  }
  const mcp = await readJson(join2(project, ".mcp.json"));
  pieces.push(...mcpPieces(mcp?.mcpServers, ".mcp.json", "project", git.get(".mcp.json")));
  if (!opts.projectOnly) {
    const cj = await readJson(claudeJsonPath());
    if (cj) {
      pieces.push(...mcpPieces(cj.mcpServers, tildify(claudeJsonPath()), "user"));
      const proj = cj.projects?.[project];
      pieces.push(...mcpPieces(proj?.mcpServers, tildify(claudeJsonPath()), "local"));
    }
  }
  if (!opts.projectOnly) {
    const installed = await installedPlugins(home);
    for (const [id, installPath] of installed) {
      if (enabledPlugins.get(id) === false) continue;
      if (!enabledPlugins.has(id)) notes.push(`Plugin ${id} is installed but not listed in enabledPlugins; assumed enabled.`);
      const manifest = await readJson(join2(installPath, ".claude-plugin", "plugin.json"));
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
        description: typeof manifest?.description === "string" ? manifest.description.slice(0, 300) : void 0,
        editable: false,
        plugin: id
      });
      const pluginName = id.split("@")[0];
      await scanComponents(
        installPath,
        "plugin",
        (file, kind, name, scope, extra) => add(file, kind, `${pluginName}:${name}`, scope, { ...extra, plugin: id }),
        true
      );
    }
  }
  pieces.sort((a, b) => a.id.localeCompare(b.id));
  const fingerprint = sha(pieces.map((p) => `${p.id}=${p.hash}`).join("\n"));
  return {
    agent: "claude-code",
    projectDir: project,
    takenAt: (/* @__PURE__ */ new Date()).toISOString(),
    fingerprint,
    pieces,
    retention,
    notes
  };
}
async function scanComponents(base, scope, add, isPluginRoot = false) {
  for (const dir of await readdir(join2(base, "skills")).catch(() => [])) {
    const file = join2(base, "skills", dir, "SKILL.md");
    const text = await readFile(file, "utf8").catch(() => void 0);
    if (text === void 0) continue;
    const name = parseFrontmatter(text).data.name;
    await add(file, "skill", typeof name === "string" && name ? name : dir, scope);
  }
  if (isPluginRoot) {
    const rootSkill = join2(base, "SKILL.md");
    if (await stat(rootSkill).catch(() => void 0)) await add(rootSkill, "skill", basename(base), scope);
  }
  for (const file of await walkMd(join2(base, "agents"))) {
    const text = await readFile(file, "utf8").catch(() => "");
    const fmName = parseFrontmatter(text).data.name;
    const name = typeof fmName === "string" && fmName ? fmName : relative(join2(base, "agents"), file).replace(/\.md$/, "").replace(/[\\/]/g, ":");
    await add(file, "agent", name, scope);
  }
  for (const file of await walkMd(join2(base, "commands"))) {
    const name = relative(join2(base, "commands"), file).replace(/\.md$/, "").replace(/[\\/]/g, ":");
    await add(file, "command", name, scope);
  }
}
async function walkMd(dir, depth = 0) {
  if (depth > 4) return [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const out = [];
  for (const e of entries) {
    const p = join2(dir, e.name);
    if (e.isDirectory()) out.push(...await walkMd(p, depth + 1));
    else if (e.isFile() && e.name.endsWith(".md")) out.push(p);
  }
  return out;
}
function hookPieces(hooks, file, scope, project, git) {
  if (!hooks || typeof hooks !== "object") return [];
  const out = [];
  const rel = scope === "user" ? tildify(file) : relative(project, file);
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) continue;
    groups.forEach((group, i) => {
      const matcher = typeof group?.matcher === "string" && group.matcher ? group.matcher : "*";
      const handlers = Array.isArray(group?.hooks) ? group.hooks : [];
      const shape = handlers.map((h) => `${h?.type ?? "?"}:${typeof h?.command === "string" ? basename(h.command.split(/\s+/)[0] ?? "") : ""}`);
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
        modifiedSource: git.has(relative(project, file)) ? "git" : void 0,
        editable: true
      });
    });
  }
  return out;
}
function mcpPieces(servers, path, scope, modifiedAt) {
  if (!servers || typeof servers !== "object") return [];
  return Object.entries(servers).map(([name, cfg]) => {
    const transport = cfg?.type ?? (cfg?.url ? "http" : "stdio");
    const program = typeof cfg?.command === "string" ? basename(cfg.command) : void 0;
    const body = JSON.stringify(cfg ?? {});
    return {
      id: `mcp:${name}`,
      kind: "mcp",
      name,
      scope,
      path,
      hash: sha(body),
      bytes: body.length,
      approxTokens: 0,
      description: program ? `${transport} (${program})` : String(transport),
      modifiedAt,
      modifiedSource: modifiedAt ? "git" : void 0,
      editable: true
    };
  });
}
async function installedPlugins(home) {
  const out = /* @__PURE__ */ new Map();
  const json = await readJson(join2(home, "plugins", "installed_plugins.json"));
  const plugins = json?.plugins ?? json;
  if (plugins && typeof plugins === "object") {
    for (const [id, value] of Object.entries(plugins)) {
      const entries = Array.isArray(value) ? value : [value];
      const last = entries[entries.length - 1];
      if (last && typeof last.installPath === "string") out.set(id, last.installPath);
    }
  }
  return out;
}
async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return void 0;
  }
}
async function gitDates(project) {
  const out = Object.assign(/* @__PURE__ */ new Map(), { dirty: /* @__PURE__ */ new Set() });
  const paths = ["CLAUDE.md", "CLAUDE.local.md", ".claude", ".mcp.json"];
  try {
    const { stdout: status } = await exec("git", ["status", "--porcelain", "--untracked-files=all", "--", ...paths], { cwd: project, timeout: 15e3 });
    for (const line of status.split("\n")) if (line.length > 3) out.dirty.add(line.slice(3).trim());
  } catch {
    return out;
  }
  try {
    const { stdout } = await exec(
      "git",
      ["log", "--format=__C__%cI", "--name-only", "--", ...paths],
      { cwd: project, maxBuffer: 32 * 1024 * 1024, timeout: 15e3 }
    );
    let current;
    for (const line of stdout.split("\n")) {
      if (line.startsWith("__C__")) current = line.slice(5).trim();
      else if (line.trim() && current && !out.has(line.trim())) out.set(line.trim(), current);
    }
  } catch {
  }
  return out;
}

// src/analysis/load.ts
import { cpus } from "node:os";

// src/adapters/claude-code/sessions.ts
import { createReadStream } from "node:fs";
import { readdir as readdir2, readFile as readFile2, stat as stat2 } from "node:fs/promises";
import { basename as basename2, join as join3, relative as relative2, isAbsolute } from "node:path";
import { createInterface } from "node:readline";

// src/core/redact.ts
var MASK = "[REDACTED]";
var PATTERNS = [
  // Private key blocks
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, MASK],
  // Provider-style tokens
  [/\bsk-(?:ant-|proj-|live-|test-)?[A-Za-z0-9_-]{16,}/g, MASK],
  [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g, MASK],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, MASK],
  [/\bglpat-[A-Za-z0-9_-]{16,}/g, MASK],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/g, MASK],
  [/\bAKIA[0-9A-Z]{16}\b/g, MASK],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, MASK],
  [/\b(?:rk|pk|sk)_(?:live|test)_[A-Za-z0-9]{16,}/g, MASK],
  [/\bnpm_[A-Za-z0-9]{30,}/g, MASK],
  // JWTs
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, MASK],
  // Authorization headers
  [/\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{12,}/gi, `$1 ${MASK}`],
  // Credentials in URLs
  [/([a-z][a-z0-9+.-]*:\/\/)[^\s:/@]+:[^\s@/]+@/gi, `$1${MASK}@`]
];
var SENSITIVE_KEY = /((?:["']?)[A-Za-z0-9_.-]*(?:pass(?:word|wd)?|secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|credential|auth)[A-Za-z0-9_.-]*["']?\s*[:=]\s*)(["']?)([^\s"',;&]{4,})\2/gi;
function redact(text) {
  if (!text) return text;
  let out = text;
  for (const [re, rep] of PATTERNS) out = out.replace(re, rep);
  out = out.replace(SENSITIVE_KEY, (_m, prefix, quote) => `${prefix}${quote}${MASK}${quote}`);
  return out;
}
function excerpt(text, max = 200) {
  const oneLine = redact(text).replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}\u2026` : oneLine;
}

// src/core/normalize.ts
var WRAPPERS = /* @__PURE__ */ new Set(["sudo", "time", "nohup", "env", "command", "exec", "timeout"]);
var MULTI_WORD = /* @__PURE__ */ new Set([
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
var RUNNERS = /* @__PURE__ */ new Set(["run", "exec", "x", "dlx", "-m"]);
function commandKey(command) {
  const segments = command.split(/&&|\|\||;|\n/).map((s) => s.trim()).filter(Boolean);
  const main2 = segments.find((s) => !/^(cd|pushd|popd|export|source|\.|set)\b/.test(s)) ?? segments[0] ?? command;
  const first = main2.split(/\s\|\s?/)[0] ?? main2;
  const tokens = first.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  let i = 0;
  while (i < tokens.length && (/^[A-Z_][A-Z0-9_]*=/.test(tokens[i]) || WRAPPERS.has(tokens[i]))) i++;
  const prog = tokens[i];
  if (!prog) return "(empty)";
  const program = prog.includes("/") && !prog.startsWith("./gradlew") ? prog.split("/").pop() : prog;
  const out = [program];
  const isWord = (t) => !!t && /^[a-z][\w:.@-]*$/i.test(t) && t.length <= 30 && !t.includes("/");
  if (MULTI_WORD.has(program) || program.startsWith("python")) {
    const sub = tokens[i + 1];
    if (sub && (isWord(sub) || sub === "-m")) {
      out.push(sub);
      if (RUNNERS.has(sub) && isWord(tokens[i + 2])) out.push(tokens[i + 2]);
    }
  }
  return redact(out.join(" "));
}
function errorKey(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^exit code \d+$/i.test(l) && !/^<\/?[\w-]+\s*\/?>$/.test(l));
  const errorish = lines.slice(0, 8).find((l) => /error|fail|denied|not found|no such|invalid|cannot|can't|unable|exception|refused|timed? ?out|"reason"/i.test(l));
  const head = (errorish ?? lines[0] ?? text.trim()).replace(/<\/?tool_use_error>/g, "");
  const reason = /"reason"\s*:\s*"([^"]{1,60})"/.exec(head)?.[1];
  return redact(reason ? `reason: ${reason}` : head).replace(/(["'`]).{1,200}?\1/g, "'\u2026'").replace(/(?:[A-Za-z]:)?[~.]?\/[\w@.+-]+(?:\/[\w@.+-]+)*/g, "<path>").replace(/\b\d+(\.\d+)*\b/g, "N").replace(/\s+/g, " ").slice(0, 160).trim();
}
var SYSTEM_TAGS = /<(system-reminder|command-message|command-args|local-command-stdout|local-command-stderr|local-command-caveat|bash-input|bash-stdout|bash-stderr|user-prompt-submit-hook)>[\s\S]*?<\/\1>/g;
function cleanPrompt(text) {
  const cmd = /<command-name>\s*\/?([^<\s]+)\s*<\/command-name>/.exec(text);
  const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(text);
  let clean = text.replace(SYSTEM_TAGS, " ").replace(/<command-name>[\s\S]*?<\/command-name>/g, " ");
  if (cmd && args?.[1]) clean = `${clean} ${args[1]}`;
  clean = clean.replace(/\s+/g, " ").trim();
  return { text: clean, command: cmd?.[1] };
}
var CORRECTION = /^(no|nope|não|nao|wrong|errado|actually|na verdade|instead|ao invés|em vez|stop|pare|para de|don'?t|do not|não faça|nao faca|that'?s not|isso não|isso nao|you should|you shouldn'?t|você deveria|voce deveria|why did you|por que você|por que voce|undo|revert|desfaz|desfaça|again|de novo|still (?:not|wrong|failing)|ainda (?:não|nao|está|esta))\b/i;
function isCorrection(text) {
  return CORRECTION.test(text.trim().slice(0, 80));
}
var INTERRUPTED = /^\[Request interrupted by user/;
var PERMISSION_DENIED = /(permission (?:to use .+ )?(?:has been |was )?denied|doesn'?t want to proceed with this tool use|tool use was rejected|denied by (?:the )?(?:user|permission|auto[- ]mode)|requires approval|not allowed by your permission settings)/i;
var HOOK_BLOCKED = /(hook (?:error|blocked|denied)|blocked by (?:a |the )?(?:\w+ )?hook|PreToolUse:\w+ hook)/i;
function shingles(text) {
  const words = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/https?:\/\/\S+/g, " ").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 2 && !STOPWORDS.has(w));
  return new Set(words);
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}
var STOPWORDS = new Set(
  "the and for with that this from you your are was were can could would should please into have has had not but all any some what when where which who how why its it's our out then than them they there here tamb\xE9m para com que uma umas uns dos das por pelo pela isso isto esse essa este esta voc\xEA voce seu sua nos nas n\xE3o nao mais muito pode poderia favor ser ter tem foi vai fazer faz como quando onde qual quais".split(" ")
);

// src/adapters/claude-code/sessions.ts
async function discoverTranscripts(opts) {
  const root = join3(opts.home ?? claudeHome(), "projects");
  let dirs;
  try {
    dirs = await readdir2(root);
  } catch {
    return [];
  }
  const encoded = encodeProjectDir(opts.projectDir);
  const selected = opts.allProjects ? dirs : dirs.filter((d) => d === encoded || d.startsWith(`${encoded}-`));
  const out = [];
  for (const d of selected) {
    const dir = join3(root, d);
    let entries;
    try {
      entries = await readdir2(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith(".jsonl")) continue;
      const file = join3(dir, name);
      const st = await stat2(file).catch(() => void 0);
      if (!st?.isFile()) continue;
      const sessionId = name.slice(0, -".jsonl".length);
      const subDir = join3(dir, sessionId, "subagents");
      const subagentFiles = [];
      for (const sub of await readdir2(subDir).catch(() => [])) {
        if (!sub.endsWith(".jsonl")) continue;
        const sf = join3(subDir, sub);
        const sst = await stat2(sf).catch(() => void 0);
        if (sst?.isFile()) subagentFiles.push({ file: sf, mtimeMs: sst.mtimeMs, size: sst.size });
      }
      out.push({ sessionId, file, mtimeMs: st.mtimeMs, size: st.size, subagentFiles, exactProject: d === encoded });
    }
  }
  return out.sort((a, b) => a.mtimeMs - b.mtimeMs);
}
var MAIN = { id: "main", agentType: "main" };
async function parseSession(t, opts) {
  const facts = {
    agent: "claude-code",
    sessionId: t.sessionId,
    file: t.file,
    activeMs: 0,
    threads: [],
    prompts: [],
    tools: [],
    messages: [],
    files: [t.file, ...t.subagentFiles.map((s) => s.file)],
    unparsedLines: 0
  };
  const ctx = {
    facts,
    file: t.file,
    thread: MAIN,
    pending: /* @__PURE__ */ new Map(),
    timestamps: /* @__PURE__ */ new Map(),
    messages: /* @__PURE__ */ new Map(),
    agentIdByTask: /* @__PURE__ */ new Map(),
    firstPromptHash: /* @__PURE__ */ new Map(),
    threadTypes: /* @__PURE__ */ new Map(),
    projectDir: opts.projectDir
  };
  await readLines(t.file, (obj, line) => handleLine(ctx, obj, line, true), () => facts.unparsedLines++);
  const taskCalls = facts.tools.filter((c) => c.subagentType);
  for (const sub of t.subagentFiles) {
    const agentId = basename2(sub.file, ".jsonl").replace(/^agent-/, "");
    const metaType = await readMetaType(sub.file);
    ctx.file = sub.file;
    ctx.thread = { id: agentId, agentType: metaType ?? "subagent" };
    await readLines(sub.file, (obj, line) => handleLine(ctx, obj, line, false), () => facts.unparsedLines++);
    let type = metaType ?? ctx.threadTypes.get(agentId);
    if (!type) {
      const byResult = taskCalls.find((c) => ctx.agentIdByTask.get(c.id) === agentId);
      const byPrompt = taskCalls.find((c) => c.subagentPromptHash && c.subagentPromptHash === ctx.firstPromptHash.get(agentId));
      type = byResult?.subagentType ?? byPrompt?.subagentType;
    }
    if (type) relabelThread(facts, agentId, type);
  }
  for (const call of taskCalls) {
    const agentId = ctx.agentIdByTask.get(call.id);
    if (agentId && call.subagentType) relabelThread(facts, agentId, call.subagentType);
  }
  facts.messages = [...ctx.messages.values()];
  for (const [threadId, stamps] of ctx.timestamps) {
    stamps.sort((a, b) => a - b);
    const tf = {
      thread: threadId === "main" ? MAIN : { id: threadId, agentType: threadTypeOf(facts, threadId) },
      activeMs: activeTime(stamps, opts.idleMs),
      firstMs: stamps[0],
      lastMs: stamps[stamps.length - 1],
      promptHash: ctx.firstPromptHash.get(threadId)
    };
    facts.threads.push(tf);
    if (threadId === "main") {
      facts.activeMs = tf.activeMs;
      facts.startMs = tf.firstMs;
      facts.endMs = tf.lastMs;
    }
  }
  if (facts.startMs === void 0) {
    const all = [...ctx.timestamps.values()].flat().sort((a, b) => a - b);
    facts.startMs = all[0];
    facts.endMs = all[all.length - 1];
  }
  return facts;
}
function activeTime(sortedStamps, idleMs) {
  let total = 0;
  for (let i = 1; i < sortedStamps.length; i++) {
    const gap = sortedStamps[i] - sortedStamps[i - 1];
    if (gap > 0 && gap <= idleMs) total += gap;
  }
  return total;
}
function threadTypeOf(facts, threadId) {
  return facts.tools.find((c) => c.thread.id === threadId)?.thread.agentType ?? facts.messages.find((m) => m.thread.id === threadId)?.thread.agentType ?? "subagent";
}
function relabelThread(facts, threadId, agentType) {
  const relabel = (t) => {
    if (t.id === threadId) t.agentType = agentType;
  };
  for (const c of facts.tools) {
    relabel(c.thread);
    if (c.thread.id === threadId) {
      c.ref.thread = agentType;
      if (c.result) c.result.ref.thread = agentType;
    }
  }
  for (const m of facts.messages) if (m.thread.id === threadId) relabel(m.thread);
  for (const p of facts.prompts) if (p.ref.thread === threadId) p.ref.thread = agentType;
}
async function readMetaType(subFile) {
  try {
    const meta = JSON.parse(await readFile2(subFile.replace(/\.jsonl$/, ".meta.json"), "utf8"));
    const v = meta?.agentType ?? meta?.agent_type ?? meta?.subagent_type ?? meta?.subagentType;
    return typeof v === "string" ? v : void 0;
  } catch {
    return void 0;
  }
}
async function readLines(file, onObj, onBad) {
  const rl = createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
  let n = 0;
  for await (const raw of rl) {
    n++;
    if (!raw.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(raw);
    } catch {
      onBad();
      continue;
    }
    try {
      onObj(obj, n);
    } catch {
      onBad();
    }
  }
}
function handleLine(ctx, obj, line, isMainFile) {
  if (!obj || typeof obj !== "object") return;
  const facts = ctx.facts;
  if (isMainFile && !facts.projectDir && typeof obj.cwd === "string") facts.projectDir = obj.cwd;
  if (isMainFile && !facts.gitBranch && typeof obj.gitBranch === "string" && obj.gitBranch !== "HEAD") facts.gitBranch = obj.gitBranch;
  let thread = ctx.thread;
  if (isMainFile && obj.isSidechain === true) {
    const id = typeof obj.agentId === "string" ? obj.agentId : "sidechain";
    thread = { id, agentType: ctx.threadTypes.get(id) ?? "subagent" };
  }
  const declaredType = obj.agentType ?? obj.agent_type ?? obj.subagentType;
  if (typeof declaredType === "string" && thread.id !== "main") {
    ctx.threadTypes.set(thread.id, declaredType);
    thread = { ...thread, agentType: declaredType };
  }
  const ts = typeof obj.timestamp === "string" ? Date.parse(obj.timestamp) : NaN;
  const tsMs = Number.isNaN(ts) ? void 0 : ts;
  const type = obj.type;
  if (tsMs !== void 0 && (type === "user" || type === "assistant" || type === "attachment" || type === "system")) {
    const arr = ctx.timestamps.get(thread.id) ?? [];
    arr.push(tsMs);
    ctx.timestamps.set(thread.id, arr);
  }
  const ref = (text) => ({
    sessionId: facts.sessionId,
    file: ctx.file,
    line,
    timestamp: typeof obj.timestamp === "string" ? obj.timestamp : void 0,
    thread: thread.agentType,
    excerpt: text ? excerpt(text) : void 0
  });
  const msg = obj.message;
  if (type === "assistant" && msg && typeof msg === "object") {
    const id = typeof msg.id === "string" ? msg.id : `${ctx.file}:${line}`;
    const usage = msg.usage ?? {};
    const prev = ctx.messages.get(id);
    const u = {
      input: num(usage.input_tokens),
      output: num(usage.output_tokens),
      cacheRead: num(usage.cache_read_input_tokens),
      cacheWrite: num(usage.cache_creation_input_tokens)
    };
    if (prev) {
      prev.usage.input = Math.max(prev.usage.input, u.input);
      prev.usage.output = Math.max(prev.usage.output, u.output);
      prev.usage.cacheRead = Math.max(prev.usage.cacheRead, u.cacheRead);
      prev.usage.cacheWrite = Math.max(prev.usage.cacheWrite, u.cacheWrite);
    } else {
      ctx.messages.set(id, { id, model: typeof msg.model === "string" ? msg.model : void 0, usage: u, thread, timestampMs: tsMs, ref: ref() });
    }
    const content = Array.isArray(msg.content) ? msg.content : [];
    for (const block of content) {
      if (block?.type === "tool_use" && typeof block.id === "string") {
        const call = toolCall(block, thread, ref, tsMs, id, ctx.projectDir);
        ctx.pending.set(block.id, call);
        facts.tools.push(call);
      }
    }
    return;
  }
  if (type === "user" && msg && typeof msg === "object") {
    const content = msg.content;
    if (Array.isArray(content)) {
      let textParts = [];
      for (const block of content) {
        if (block?.type === "tool_result") {
          handleToolResult(ctx, block, obj, ref, tsMs);
        } else if (block?.type === "text" && typeof block.text === "string") {
          textParts.push(block.text);
        }
      }
      if (textParts.length) handlePrompt(ctx, obj, textParts.join("\n"), thread, ref, tsMs);
    } else if (typeof content === "string") {
      handlePrompt(ctx, obj, content, thread, ref, tsMs);
    }
  }
}
function handlePrompt(ctx, obj, raw, thread, ref, tsMs) {
  if (!ctx.firstPromptHash.has(thread.id)) ctx.firstPromptHash.set(thread.id, sha(raw.trim()));
  if (obj.isMeta || obj.isCompactSummary || obj.isVisibleInTranscriptOnly) return;
  if (thread.id !== "main") return;
  const { text, command } = cleanPrompt(raw);
  if (!text && !command) return;
  if (/^Caveat: The messages below were generated/i.test(text)) return;
  const interruption = INTERRUPTED.test(text);
  const prompt = {
    text: redact(text).slice(0, 2e3),
    ref: ref(text || `/${command}`),
    timestampMs: tsMs,
    command,
    isInterruption: interruption,
    isCorrection: !interruption && ctx.facts.prompts.length > 0 && isCorrection(text)
  };
  ctx.facts.prompts.push(prompt);
}
function handleToolResult(ctx, block, obj, ref, tsMs) {
  const call = ctx.pending.get(block.tool_use_id);
  const text = resultText(block.content);
  const tur = obj.toolUseResult;
  if (call && tur && typeof tur === "object" && typeof tur.agentId === "string") ctx.agentIdByTask.set(call.id, tur.agentId);
  if (!call) return;
  ctx.pending.delete(block.tool_use_id);
  let kind = "ok";
  const head = text.slice(0, 600);
  if (INTERRUPTED.test(text.trim())) kind = "interrupted";
  else if (PERMISSION_DENIED.test(head)) kind = "permission_denied";
  else if (HOOK_BLOCKED.test(head) && block.is_error) kind = "hook_blocked";
  else if (block.is_error === true || tur && typeof tur === "object" && tur.interrupted === true) kind = "error";
  const isError = kind !== "ok";
  call.result = {
    isError,
    kind,
    errorHead: isError ? errorKey(text) : void 0,
    contentChars: text.length,
    ref: { ...ref(isError ? text : void 0), thread: call.thread.agentType },
    timestampMs: tsMs
  };
}
function resultText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((c) => c?.type === "text" && typeof c.text === "string" ? c.text : c?.type === "image" ? "[image]" : "").join("\n");
  }
  return "";
}
function toolCall(block, thread, ref, tsMs, messageId, projectDir) {
  const name = typeof block.name === "string" ? block.name : "unknown";
  const input = block.input && typeof block.input === "object" ? block.input : {};
  let key = name;
  let summary = name;
  let filePath;
  let subagentType;
  let subagentPromptHash;
  let skill;
  const fp = input.file_path ?? input.notebook_path ?? input.path;
  if (name === "Bash" && typeof input.command === "string") {
    key = commandKey(input.command);
    summary = input.command;
  } else if (["Read", "Edit", "Write", "MultiEdit", "NotebookEdit", "NotebookRead"].includes(name) && typeof fp === "string") {
    filePath = projectDir && isAbsolute(fp) && fp.startsWith(projectDir) ? relative2(projectDir, fp) || "." : fp;
    summary = `${name} ${filePath}`;
  } else if ((name === "Task" || name === "Agent") && (input.subagent_type || input.prompt)) {
    subagentType = typeof input.subagent_type === "string" ? input.subagent_type : "general-purpose";
    subagentPromptHash = typeof input.prompt === "string" ? sha(input.prompt.trim()) : void 0;
    key = `${name}:${subagentType}`;
    summary = `${subagentType}: ${typeof input.description === "string" ? input.description : ""}`;
  } else if (name === "Skill") {
    skill = String(input.skill ?? input.command ?? input.name ?? "unknown").replace(/^\//, "");
    key = `Skill:${skill}`;
    summary = `skill ${skill}`;
  } else if (name.startsWith("mcp__")) {
    const [, server, tool] = name.split("__");
    key = `mcp:${server}`;
    summary = `${server} ${tool ?? ""}`;
  } else if (typeof input.pattern === "string") {
    summary = `${name} ${input.pattern}`;
  } else if (typeof input.url === "string") {
    summary = `${name} ${input.url}`;
  } else if (typeof input.query === "string") {
    summary = `${name} ${input.query}`;
  }
  return {
    id: block.id,
    name,
    key,
    summary: excerpt(summary, 160),
    filePath,
    thread,
    ref: ref(summary),
    timestampMs: tsMs,
    messageId,
    subagentType,
    subagentPromptHash,
    skill
  };
}
function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

// src/analysis/load.ts
function signature(t, idleMs) {
  const subs = t.subagentFiles.map((s) => `${s.file}:${s.mtimeMs}:${s.size}`).join("|");
  return `${t.mtimeMs}:${t.size}:${idleMs}:${subs}`;
}
async function loadSessions(opts) {
  const transcripts = await discoverTranscripts({ projectDir: opts.projectDir, allProjects: opts.allProjects });
  const cache = opts.noCache ? { version: 0, entries: {} } : await opts.store.loadFactsCache();
  let parsed = 0;
  let fromCache = 0;
  const all = await mapLimit(transcripts, Math.max(2, Math.min(8, cpus().length)), async (t) => {
    const sig = signature(t, opts.idleMs);
    const hit = cache.entries[t.file];
    if (hit && hit.signature === sig) {
      fromCache++;
      return hit.facts;
    }
    const facts = await parseSession(t, { idleMs: opts.idleMs, projectDir: opts.projectDir });
    parsed++;
    cache.entries[t.file] = { signature: sig, facts };
    return facts;
  });
  const live = new Set(transcripts.map((t) => t.file));
  for (const k of Object.keys(cache.entries)) if (!live.has(k)) delete cache.entries[k];
  if (!opts.noCache && parsed > 0) await opts.store.saveFactsCache(cache);
  const excluded = new Set(opts.excludeSessions ?? []);
  const inProject = all.filter(
    (s, i) => !excluded.has(s.sessionId) && (opts.allProjects || transcripts[i].exactProject || !!s.projectDir && (s.projectDir === opts.projectDir || s.projectDir.startsWith(`${opts.projectDir}/`)))
  );
  const starts = inProject.map((s) => s.startMs).filter((v) => v !== void 0).sort((a, b) => a - b);
  const sessions = inProject.filter((s) => {
    const t = s.startMs ?? 0;
    if (opts.sinceMs !== void 0 && (s.endMs ?? t) < opts.sinceMs) return false;
    if (opts.untilMs !== void 0 && t > opts.untilMs) return false;
    return s.tools.length > 0 || s.prompts.length > 0;
  });
  return {
    sessions,
    available: {
      count: inProject.length,
      oldest: starts.length ? new Date(starts[0]).toISOString() : void 0,
      newest: starts.length ? new Date(starts[starts.length - 1]).toISOString() : void 0
    },
    parsed,
    fromCache,
    unparsedLines: sessions.reduce((n, s) => n + s.unparsedLines, 0)
  };
}

// src/analysis/cost.ts
var DEFAULT_PRICES = {
  opus: { input: 5, output: 25 },
  sonnet: { input: 3, output: 15 },
  haiku: { input: 1, output: 5 },
  default: { input: 3, output: 15 }
};
function family(model, prices) {
  if (!model) return "default";
  const m = model.toLowerCase();
  for (const key of Object.keys(prices)) if (key !== "default" && m.includes(key)) return key;
  return "default";
}
function usd(usage, model, prices) {
  const p = prices[family(model, prices)] ?? prices.default ?? DEFAULT_PRICES.default;
  const cacheRead = p.cacheRead ?? p.input * 0.1;
  const cacheWrite = p.cacheWrite ?? p.input * 1.25;
  return (usage.input * p.input + usage.output * p.output + usage.cacheRead * cacheRead + usage.cacheWrite * cacheWrite) / 1e6;
}
function totalTokens(u) {
  return u.input + u.output + u.cacheRead + u.cacheWrite;
}
function addUsage(a, b) {
  return { input: a.input + b.input, output: a.output + b.output, cacheRead: a.cacheRead + b.cacheRead, cacheWrite: a.cacheWrite + b.cacheWrite };
}
var ZERO = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

// src/analysis/signals.ts
function extractSignals(sessions, inventory, opts) {
  const pieceIds = new Set(inventory?.pieces.map((p) => p.id) ?? []);
  const indexes = /* @__PURE__ */ new Map();
  for (const s of sessions) indexes.set(s, indexSession(s, pieceIds));
  const groups = /* @__PURE__ */ new Map();
  const push = (id, type, title, occ, details) => {
    let g = groups.get(id);
    if (!g) groups.set(id, g = { type, title, occ: [], details: {} });
    g.occ.push(occ);
    details?.(g.details);
  };
  for (const s of sessions) {
    const idx = indexes.get(s);
    const toolCost = (c) => reactionCost(c, idx, opts);
    const bashByThread = /* @__PURE__ */ new Map();
    for (const c of s.tools) {
      if (c.name === "Bash") {
        const arr = bashByThread.get(c.thread.id) ?? [];
        arr.push(c);
        bashByThread.set(c.thread.id, arr);
      }
    }
    for (const c of s.tools) {
      const r = c.result;
      if (!r || !r.isError) continue;
      const pieces = idx.attribution.get(c.id) ?? ["main"];
      const cost = toolCost(c);
      const occ = { session: s, ref: { ...c.ref, excerpt: `${c.summary} \u2192 ${r.ref.excerpt ?? ""}`.slice(0, 240) }, pieces, ...cost };
      if (r.kind === "permission_denied") {
        push(`permission_denied:${c.key}`, "permission_denied", `Permission denied for ${c.key}`, occ);
      } else if (r.kind === "hook_blocked") {
        push(`hook_blocked:${c.key}`, "hook_blocked", `Hook blocked ${c.key}`, occ);
      } else if (r.kind === "interrupted") {
        continue;
      } else if (c.name === "Bash") {
        const recovered = recoveryOf(c, bashByThread.get(c.thread.id) ?? []);
        push(`failed_command:${c.key}`, "failed_command", `Command fails: ${c.key}`, occ, (d) => {
          countInto(d, "errors", r.errorHead ?? "error");
          if (recovered) countInto(d, "recoveredWith", recovered);
        });
      } else {
        push(`tool_error:${c.key}:${sha(r.errorHead ?? "", 6)}`, "tool_error", `${c.key} error: ${r.errorHead ?? "error"}`, occ, (d) => {
          d.tool = c.key;
          d.error = r.errorHead;
        });
      }
    }
    const readsByThread = /* @__PURE__ */ new Map();
    for (const c of s.tools) {
      if (c.name !== "Read" || !c.filePath || c.result?.isError) continue;
      const key = `${c.thread.id}\0${c.filePath}`;
      const arr = readsByThread.get(key) ?? [];
      arr.push(c);
      readsByThread.set(key, arr);
    }
    for (const reads of readsByThread.values()) {
      if (reads.length < 3) continue;
      const extra = reads.slice(1).filter((r) => !editedBetween(s, reads[0], r));
      if (extra.length < 2) continue;
      const first = reads[0];
      for (const r of extra) {
        push(`repeated_read:${first.thread.agentType}:${first.filePath}`, "repeated_read", `Re-reads ${first.filePath} (${first.thread.agentType})`, {
          session: s,
          ref: r.ref,
          pieces: idx.attribution.get(r.id) ?? ["main"],
          activeMs: Math.min(opts.idleMs, Math.max(0, (r.result?.timestampMs ?? 0) - (r.timestampMs ?? 0))),
          usage: { ...ZERO, input: Math.round((r.result?.contentChars ?? 0) / 4) },
          model: idx.byThread.get(r.thread.id)?.[0]?.model
        });
      }
    }
    const mainReads = s.tools.filter((c) => c.thread.id === "main" && c.name === "Read" && c.filePath && !c.result?.isError);
    for (const c of s.tools) {
      if (c.thread.id === "main" || c.name !== "Read" || !c.filePath || c.result?.isError) continue;
      const before = mainReads.find((m) => m.filePath === c.filePath && (m.timestampMs ?? 0) <= (c.timestampMs ?? 0));
      if (!before) continue;
      push(`subagent_reread:${c.thread.agentType}`, "subagent_reread", `Subagent ${c.thread.agentType} re-reads files the main thread already read`, {
        session: s,
        ref: c.ref,
        pieces: [pieceFor("agent", c.thread.agentType, pieceIds)],
        activeMs: Math.min(opts.idleMs, Math.max(0, (c.result?.timestampMs ?? 0) - (c.timestampMs ?? 0))),
        usage: { ...ZERO, input: Math.round((c.result?.contentChars ?? 0) / 4) },
        model: idx.byThread.get(c.thread.id)?.[0]?.model
      }, (d) => countInto(d, "files", c.filePath));
    }
    s.prompts.forEach((p, i) => {
      if (!p.isCorrection && !p.isInterruption) return;
      const prev = s.prompts[i - 1];
      const cost = turnCost(s, idx, prev?.timestampMs, p.timestampMs, opts);
      const pieces = idx.promptPieces.get(p) ?? ["main"];
      const type = p.isInterruption ? "interruption" : "user_correction";
      const attributed = pieces.join(",");
      push(`${type}:${attributed}`, type, p.isInterruption ? `User interrupted the agent (${attributed})` : `User corrected the agent (${attributed})`, {
        session: s,
        ref: { ...p.ref, excerpt: prev ? `asked: "${excerpt(prev.text, 90)}" \u2192 then: "${excerpt(p.text, 110)}"` : p.ref.excerpt },
        pieces,
        ...cost
      });
    });
  }
  for (const cluster of clusterPrompts(sessions)) {
    const id = `repeated_request:${sha(cluster.label, 8)}`;
    for (const { s, p } of cluster.items) {
      push(id, "repeated_request", `Similar request in ${cluster.sessions} sessions: "${excerpt(cluster.label, 80)}"`, {
        session: s,
        ref: p.ref,
        pieces: ["main"],
        activeMs: 0,
        usage: ZERO
      }, (d) => {
        d.example = excerpt(cluster.label, 200);
        d.commands = cluster.commands;
      });
    }
  }
  const signals = [];
  for (const [id, g] of groups) {
    const sessionsSet = new Set(g.occ.map((o) => o.session.sessionId));
    const n = g.occ.length;
    if (!passesThreshold(g.type, n, sessionsSet.size)) continue;
    const usage = g.occ.reduce((u, o) => addUsage(u, o.usage), ZERO);
    const dollars = g.occ.reduce((sum, o) => sum + usd(o.usage, o.model, opts.prices), 0);
    const activeMs = g.occ.reduce((sum, o) => sum + o.activeMs, 0);
    const pieces = uniq(g.occ.flatMap((o) => o.pieces));
    const sorted = [...g.occ].sort((a, b) => (a.ref.timestamp ?? "").localeCompare(b.ref.timestamp ?? ""));
    const partialReasons = [];
    if (pieces.some((p) => p === "agent:subagent")) partialReasons.push("subagent type could not be resolved for some steps");
    if (sessionsSet.size < 2 && g.type !== "repeated_read") partialReasons.push("seen in a single session");
    const details = finalizeDetails(g.details);
    signals.push({
      id,
      type: g.type,
      title: g.title,
      pieces,
      occurrences: n,
      sessions: sessionsSet.size,
      partial: partialReasons.length > 0,
      partialReasons,
      cost: { activeMinutes: minutes(activeMs), tokens: totalTokens(usage), usd: round(dollars, 2), estimated: true },
      details,
      evidence: spreadEvidence(sorted, opts.maxEvidence),
      evidenceTotal: n,
      firstSeen: sorted[0]?.ref.timestamp,
      lastSeen: sorted[sorted.length - 1]?.ref.timestamp,
      score: 0
    });
  }
  if (inventory) {
    signals.push(...unusedPieces(sessions, inventory, opts));
    signals.push(...largePieces(inventory, opts));
    markChangedAfter(signals, inventory);
  }
  for (const s of signals) {
    s.score = round(s.cost.activeMinutes + s.cost.usd * 2 + s.sessions * 2 + Math.min(s.occurrences, 30) * 0.3 - (s.partial ? 2 : 0), 2);
  }
  return signals.sort((a, b) => b.score - a.score);
}
function indexSession(s, pieceIds) {
  const byThread = /* @__PURE__ */ new Map();
  for (const m of s.messages) {
    const arr = byThread.get(m.thread.id) ?? [];
    arr.push(m);
    byThread.set(m.thread.id, arr);
  }
  for (const arr of byThread.values()) arr.sort((a, b) => (a.timestampMs ?? 0) - (b.timestampMs ?? 0));
  const attribution = /* @__PURE__ */ new Map();
  const promptPieces = /* @__PURE__ */ new Map();
  const mainEvents = [];
  for (const p of s.prompts) if (p.ref.file === s.file) mainEvents.push({ line: p.ref.line, prompt: p });
  for (const c of s.tools) {
    if (c.thread.id !== "main") {
      attribution.set(c.id, [pieceFor("agent", c.thread.agentType, pieceIds)]);
    } else if (c.ref.file === s.file) {
      mainEvents.push({ line: c.ref.line, call: c });
    }
  }
  mainEvents.sort((a, b) => a.line - b.line);
  let active = [];
  let lastActive = [];
  for (const e of mainEvents) {
    if (e.prompt) {
      promptPieces.set(e.prompt, lastActive.length ? lastActive : ["main"]);
      active = e.prompt.command ? [commandPiece(e.prompt.command, pieceIds)] : [];
      lastActive = active;
      continue;
    }
    const c = e.call;
    if (c.skill) {
      active = uniq([...active, pieceFor("skill", c.skill, pieceIds)]);
      lastActive = active;
    }
    if (c.subagentType) lastActive = uniq([...active, pieceFor("agent", c.subagentType, pieceIds)]);
    attribution.set(c.id, active.length ? active : ["main"]);
  }
  return { byThread, attribution, promptPieces };
}
function pieceFor(kind, name, pieceIds) {
  const id = `${kind}:${name}`;
  if (pieceIds.has(id) || pieceIds.size === 0) return id;
  return kind === "agent" && name !== "subagent" ? `agent:${name} (built-in)` : id;
}
function commandPiece(name, pieceIds) {
  if (pieceIds.has(`skill:${name}`)) return `skill:${name}`;
  if (pieceIds.has(`command:${name}`)) return `command:${name}`;
  return `command:${name}`;
}
function reactionCost(c, idx, opts) {
  const msgs = idx.byThread.get(c.thread.id) ?? [];
  const after = c.result?.timestampMs ?? c.timestampMs ?? 0;
  const reaction = msgs.find((m) => (m.timestampMs ?? 0) >= after && m.id !== c.messageId);
  const end = reaction?.timestampMs ?? after;
  const activeMs = c.timestampMs ? Math.min(opts.idleMs, Math.max(0, end - c.timestampMs)) : 0;
  return { activeMs, usage: reaction?.usage ?? ZERO, model: reaction?.model };
}
function turnCost(s, idx, fromMs, toMs, opts) {
  if (fromMs === void 0 || toMs === void 0) return { activeMs: 0, usage: ZERO };
  const msgs = (idx.byThread.get("main") ?? []).filter((m) => (m.timestampMs ?? 0) > fromMs && (m.timestampMs ?? 0) <= toMs);
  const stamps = [fromMs, ...msgs.map((m) => m.timestampMs ?? fromMs)].sort((a, b) => a - b);
  let activeMs = 0;
  for (let i = 1; i < stamps.length; i++) {
    const gap = stamps[i] - stamps[i - 1];
    if (gap <= opts.idleMs) activeMs += gap;
  }
  const usage = msgs.reduce((u, m) => addUsage(u, m.usage), ZERO);
  return { activeMs, usage, model: msgs[0]?.model };
}
function recoveryOf(failed, threadBash) {
  const i = threadBash.indexOf(failed);
  for (const next of threadBash.slice(i + 1, i + 4)) {
    if (next.result && !next.result.isError) return next.key !== failed.key ? next.key : void 0;
  }
  return void 0;
}
function editedBetween(s, a, b) {
  return s.tools.some(
    (c) => c.thread.id === a.thread.id && ["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(c.name) && c.filePath === a.filePath && (c.timestampMs ?? 0) >= (a.timestampMs ?? 0) && (c.timestampMs ?? 0) <= (b.timestampMs ?? 0)
  ) || s.tools.some((c) => c.thread.id === a.thread.id && c.name === "Bash" && (c.timestampMs ?? 0) > (a.timestampMs ?? 0) && (c.timestampMs ?? 0) < (b.timestampMs ?? 0) && /\b(git (checkout|pull|merge|rebase|stash)|sed -i|prettier|eslint --fix|npm run format)/.test(c.summary));
}
function passesThreshold(type, n, sessions) {
  switch (type) {
    case "failed_command":
    case "tool_error":
      return n >= 3 || sessions >= 2;
    case "permission_denied":
    case "hook_blocked":
    case "user_correction":
    case "interruption":
      return n >= 2;
    case "repeated_read":
      return n >= 2;
    case "subagent_reread":
      return n >= 3;
    case "repeated_request":
      return sessions >= 3;
    default:
      return true;
  }
}
function clusterPrompts(sessions) {
  const items = [];
  for (const s of sessions) {
    for (const p of s.prompts) {
      if (p.isInterruption || p.isCorrection) continue;
      const sh = shingles(p.text);
      if (sh.size < 3 || p.text.length > 600) continue;
      items.push({ s, p, sh });
    }
  }
  const clusters = [];
  for (const it of items) {
    const c = clusters.find((cl) => jaccard(cl.seed.sh, it.sh) >= 0.5);
    if (c) c.members.push(it);
    else clusters.push({ seed: it, members: [it] });
  }
  const out = [];
  for (const c of clusters) {
    const sessionsSet = new Set(c.members.map((m) => m.s.sessionId));
    if (sessionsSet.size < 3) continue;
    const seen = /* @__PURE__ */ new Set();
    const perSession = c.members.filter((m) => seen.has(m.s.sessionId) ? false : (seen.add(m.s.sessionId), true));
    out.push({
      label: c.seed.p.text,
      sessions: sessionsSet.size,
      items: perSession.map(({ s, p }) => ({ s, p })),
      commands: uniq(c.members.map((m) => m.p.command).filter((x) => !!x))
    });
  }
  return out;
}
function unusedPieces(sessions, inventory, opts) {
  if (sessions.length < opts.minSessionsForUnused) return [];
  const used = /* @__PURE__ */ new Set();
  for (const s of sessions) {
    for (const c of s.tools) {
      if (c.subagentType) used.add(`agent:${c.subagentType}`);
      if (c.skill) used.add(`skill:${c.skill}`);
      if (c.key.startsWith("mcp:")) used.add(`mcp:${c.key.slice(4)}`);
    }
    for (const t of s.threads) if (t.thread.id !== "main") used.add(`agent:${t.thread.agentType}`);
    for (const p of s.prompts) if (p.command) {
      used.add(`skill:${p.command}`);
      used.add(`command:${p.command}`);
    }
  }
  const windowStart = Math.min(...sessions.map((s) => s.startMs ?? Date.now()));
  const out = [];
  for (const p of inventory.pieces) {
    if (!["skill", "agent", "command", "mcp"].includes(p.kind) || used.has(p.id)) continue;
    if (p.kind === "skill" && /(^|:)improve-my-harness$/.test(p.name)) continue;
    const newer = p.modifiedAt ? Date.parse(p.modifiedAt) > windowStart : false;
    out.push({
      id: `unused_piece:${p.id}`,
      type: "unused_piece",
      title: `Not used in ${sessions.length} sessions: ${p.id}`,
      pieces: [p.id],
      occurrences: 0,
      sessions: sessions.length,
      partial: newer || !p.editable,
      partialReasons: [
        ...newer ? ["piece was added or changed during the analyzed period"] : [],
        ...!p.editable ? ["piece comes from a plugin"] : []
      ],
      cost: { activeMinutes: 0, tokens: 0, usd: 0, estimated: true },
      details: { scope: p.scope, path: p.path, approxTokens: p.approxTokens, description: p.description },
      evidence: [],
      evidenceTotal: 0,
      score: 0
    });
  }
  return out;
}
function largePieces(inventory, opts) {
  return inventory.pieces.filter((p) => p.editable && (p.kind === "instructions" || p.kind === "skill" || p.kind === "agent") && p.approxTokens >= opts.largePieceTokens).map((p) => ({
    id: `large_piece:${p.id}`,
    type: "large_piece",
    title: `${p.id} is large (~${p.approxTokens} tokens)`,
    pieces: [p.id],
    occurrences: 0,
    sessions: 0,
    partial: false,
    partialReasons: [],
    cost: { activeMinutes: 0, tokens: 0, usd: 0, estimated: true },
    details: {
      path: p.path,
      approxTokens: p.approxTokens,
      loadedEveryTurn: p.kind === "instructions"
    },
    evidence: [],
    evidenceTotal: 0,
    score: 0
  }));
}
function markChangedAfter(signals, inventory) {
  const byId = new Map(inventory.pieces.map((p) => [p.id, p]));
  for (const s of signals) {
    if (!s.lastSeen) continue;
    const changed = s.pieces.map((id) => byId.get(id)).filter((p) => !!p && !!p.modifiedAt && Date.parse(p.modifiedAt) > Date.parse(s.lastSeen)).map((p) => ({ piece: p.id, modifiedAt: p.modifiedAt }));
    if (changed.length) {
      s.changedAfterEvidence = changed;
      s.partial = true;
      s.partialReasons.push("piece changed after this evidence");
    }
  }
}
function spreadEvidence(sorted, max) {
  const bySession = /* @__PURE__ */ new Map();
  for (const o of sorted) {
    const arr = bySession.get(o.session.sessionId) ?? [];
    arr.push(o);
    bySession.set(o.session.sessionId, arr);
  }
  const out = [];
  let round2 = 0;
  while (out.length < max) {
    let added = false;
    for (const arr of bySession.values()) {
      const o = arr[round2];
      if (o && out.length < max) {
        out.push(o.ref);
        added = true;
      }
    }
    if (!added) break;
    round2++;
  }
  return out;
}
function countInto(d, field, key) {
  const m = d[field] ?? {};
  m[key] = (m[key] ?? 0) + 1;
  d[field] = m;
}
function finalizeDetails(d) {
  const out = {};
  for (const [k, v] of Object.entries(d)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = Object.entries(v).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([value, count]) => ({ value, count }));
    } else out[k] = v;
  }
  return out;
}
function uniq(xs) {
  return [...new Set(xs)];
}

// src/analysis/usage.ts
function pieceUsage(sessions, inventory, prices) {
  const pieceIds = new Set(inventory?.pieces.map((p) => p.id) ?? []);
  const acc = /* @__PURE__ */ new Map();
  const get = (id) => {
    let a = acc.get(id);
    if (!a) acc.set(id, a = { invocations: 0, sessions: /* @__PURE__ */ new Set(), toolCalls: 0, toolErrors: 0, activeMs: 0, usage: ZERO, dollars: 0, models: /* @__PURE__ */ new Set() });
    return a;
  };
  for (const s of sessions) {
    const idx = indexSession(s, pieceIds);
    const main2 = get("main");
    main2.invocations++;
    main2.sessions.add(s.sessionId);
    main2.activeMs += s.activeMs;
    for (const t of s.threads) {
      if (t.thread.id === "main") continue;
      const a = get(`agent:${t.thread.agentType}`);
      a.invocations++;
      a.sessions.add(s.sessionId);
      a.activeMs += t.activeMs;
    }
    for (const m of s.messages) {
      const a = get(m.thread.id === "main" ? "main" : `agent:${m.thread.agentType}`);
      a.usage = addUsage(a.usage, m.usage);
      a.dollars += usd(m.usage, m.model, prices);
      if (m.model) a.models.add(m.model);
    }
    for (const c of s.tools) {
      const pieces = idx.attribution.get(c.id) ?? ["main"];
      for (const p of pieces) {
        const a = get(p.replace(/ \(built-in\)$/, ""));
        a.toolCalls++;
        if (c.result?.isError) a.toolErrors++;
        a.sessions.add(s.sessionId);
      }
      if (c.skill) get(`skill:${c.skill}`).invocations++;
      if (c.key.startsWith("mcp:")) {
        const a = get(`mcp:${c.key.slice(4)}`);
        a.invocations++;
        a.toolCalls++;
        if (c.result?.isError) a.toolErrors++;
        a.sessions.add(s.sessionId);
      }
    }
    for (const p of s.prompts) {
      if (!p.command) continue;
      const id = pieceIds.has(`skill:${p.command}`) ? `skill:${p.command}` : `command:${p.command}`;
      const a = get(id);
      a.invocations++;
      a.sessions.add(s.sessionId);
    }
  }
  return [...acc.entries()].map(([piece, a]) => {
    const tokens = totalTokens(a.usage);
    const u = {
      piece,
      invocations: a.invocations,
      sessions: a.sessions.size,
      toolCalls: a.toolCalls,
      toolErrors: a.toolErrors,
      errorRate: a.toolCalls ? round(a.toolErrors / a.toolCalls, 3) : 0,
      activeMinutes: minutes(a.activeMs),
      tokens,
      usd: round(a.dollars, 2),
      models: [...a.models]
    };
    if (a.invocations > 0) {
      u.perInvocation = {
        activeMinutes: minutes(a.activeMs / a.invocations),
        tokens: Math.round(tokens / a.invocations),
        usd: round(a.dollars / a.invocations, 3),
        toolCalls: round(a.toolCalls / a.invocations, 1)
      };
    }
    return u;
  }).sort((a, b) => b.usd - a.usd || b.toolCalls - a.toolCalls);
}

// src/analysis/mentions.ts
import { readFile as readFile3 } from "node:fs/promises";
import { homedir as homedir3 } from "node:os";
import { isAbsolute as isAbsolute2, join as join4 } from "node:path";
var TEXT_KINDS = /* @__PURE__ */ new Set(["instructions", "skill", "agent", "command"]);
async function findMentions(inventory, terms, limit = 8) {
  const wanted = [...new Set(terms.map((t) => t.trim()).filter((t) => t.length >= 3))];
  if (!wanted.length) return [];
  const out = [];
  for (const p of inventory.pieces) {
    if (!TEXT_KINDS.has(p.kind)) continue;
    const abs = p.path.startsWith("~") ? join4(homedir3(), p.path.slice(1)) : isAbsolute2(p.path) ? p.path : join4(inventory.projectDir, p.path);
    const text = await readFile3(abs, "utf8").catch(() => void 0);
    if (!text) continue;
    const lines = text.split(/\r?\n/);
    for (const term of wanted) {
      const needle = term.toLowerCase();
      lines.forEach((l, i) => {
        if (out.length < limit && l.toLowerCase().includes(needle)) {
          out.push({ piece: p.id, path: p.path, line: i + 1, text: excerpt(l, 160), term });
        }
      });
    }
    if (out.length >= limit) break;
  }
  return out;
}

// src/analysis/compare.ts
function comparePiece(sessions, piece, changedAtMs, changedAtSource, opts) {
  const uses = (s) => usesPiece(s, piece);
  const before = sessions.filter((s) => (s.startMs ?? 0) < changedAtMs && uses(s));
  const after = sessions.filter((s) => (s.startMs ?? 0) >= changedAtMs && uses(s));
  const b = side(before, piece, opts);
  const a = side(after, piece, opts);
  const caveats = [
    "Observational comparison: sessions before and after differ in tasks, not only in the harness.",
    "Time and cost are estimates; idle gaps are excluded."
  ];
  const deltas = {
    errorRate: diff(b.errorRate, a.errorRate),
    correctionsPerSession: diff(b.correctionsPerSession, a.correctionsPerSession),
    activeMinutesPerInvocation: diff(b.perInvocation?.activeMinutes, a.perInvocation?.activeMinutes),
    tokensPerInvocation: diff(b.perInvocation?.tokens, a.perInvocation?.tokens),
    usdPerInvocation: diff(b.perInvocation?.usd, a.perInvocation?.usd)
  };
  let verdict = "no_clear_change";
  if (b.sessions < opts.minSessions || a.sessions < opts.minSessions) {
    verdict = "insufficient_data";
    caveats.push(`Need at least ${opts.minSessions} sessions using ${piece} on each side (before: ${b.sessions}, after: ${a.sessions}).`);
  } else {
    const rel = (x, y) => x && y !== void 0 ? (y - x) / x : 0;
    const moves = [
      rel(b.errorRate, a.errorRate),
      rel(b.correctionsPerSession, a.correctionsPerSession),
      rel(b.perInvocation?.usd, a.perInvocation?.usd)
    ].filter((m) => Math.abs(m) >= 0.2);
    if (moves.length && moves.every((m) => m < 0)) verdict = "improved";
    else if (moves.length && moves.every((m) => m > 0)) verdict = "worse";
  }
  return { piece, changedAt: new Date(changedAtMs).toISOString(), changedAtSource, minSessions: opts.minSessions, before: b, after: a, verdict, deltas, caveats };
}
function usesPiece(s, piece) {
  const [kind, ...rest] = piece.split(":");
  const name = rest.join(":");
  switch (kind) {
    case "agent":
      return s.threads.some((t) => t.thread.agentType === name) || s.tools.some((c) => c.subagentType === name);
    case "skill":
      return s.tools.some((c) => c.skill === name) || s.prompts.some((p) => p.command === name);
    case "command":
      return s.prompts.some((p) => p.command === name);
    case "mcp":
      return s.tools.some((c) => c.key === `mcp:${name}`);
    default:
      return true;
  }
}
function side(sessions, piece, opts) {
  const inv = { pieces: [{ id: piece }] };
  const usage = pieceUsage(sessions, inv, opts.prices).find((u) => u.piece === normalizePiece(piece));
  const corrections = sessions.reduce((n, s) => n + s.prompts.filter((p) => p.isCorrection || p.isInterruption).length, 0);
  const signals = extractSignals(sessions, void 0, {
    idleMs: opts.idleMs,
    prices: opts.prices,
    maxEvidence: 0,
    minSessionsForUnused: Infinity,
    largePieceTokens: Infinity
  }).filter((s) => s.pieces.some((p) => p === piece || p.startsWith(`${piece} `))).slice(0, 10).map((s) => ({ id: s.id, occurrences: s.occurrences }));
  return {
    sessions: sessions.length,
    invocations: usage?.invocations ?? 0,
    toolCalls: usage?.toolCalls ?? 0,
    errorRate: usage?.errorRate ?? 0,
    perInvocation: usage?.perInvocation,
    corrections,
    correctionsPerSession: sessions.length ? round(corrections / sessions.length, 2) : 0,
    signals
  };
}
function normalizePiece(piece) {
  return piece.startsWith("instructions:") || piece.startsWith("hook:") || piece.startsWith("settings:") ? "main" : piece;
}
function diff(before, after) {
  return before === void 0 || after === void 0 ? null : round(after - before, 3);
}

// src/state/store.ts
import { mkdir, readdir as readdir3, readFile as readFile4, rename, writeFile } from "node:fs/promises";
import { dirname, join as join5 } from "node:path";
var FACTS_VERSION = 1;
var Store = class _Store {
  constructor(root) {
    this.root = root;
  }
  static forProject(projectDir, dataDir) {
    return new _Store(dataDir ?? join5(projectDir, ".imh"));
  }
  path(...parts) {
    return join5(this.root, ...parts);
  }
  async readJson(rel) {
    try {
      return JSON.parse(await readFile4(this.path(rel), "utf8"));
    } catch {
      return void 0;
    }
  }
  async writeJson(rel, value, pretty = true) {
    const file = this.path(rel);
    await mkdir(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(value, null, pretty ? 2 : 0));
    await rename(tmp, file);
  }
  // ---- facts cache -------------------------------------------------------
  async loadFactsCache() {
    const c = await this.readJson("cache/facts.json");
    return c && c.version === FACTS_VERSION ? c : { version: FACTS_VERSION, entries: {} };
  }
  async saveFactsCache(cache) {
    await this.writeJson("cache/facts.json", cache, false);
  }
  // ---- inventory snapshots ----------------------------------------------
  async latestInventory() {
    return this.readJson("inventory/latest.json");
  }
  /** Saves a snapshot when the harness changed. Returns the previous snapshot, if any. */
  async saveInventory(inv) {
    const previous = await this.latestInventory();
    const changed = !previous || previous.fingerprint !== inv.fingerprint;
    if (changed) {
      const stamp = inv.takenAt.replace(/[:.]/g, "-");
      await this.writeJson(`inventory/${stamp}.json`, inv);
    }
    await this.writeJson("inventory/latest.json", inv);
    return { previous, changed };
  }
  async inventoryHistory() {
    const files = (await readdir3(this.path("inventory")).catch(() => [])).filter((f) => f.endsWith(".json") && f !== "latest.json").sort();
    const out = [];
    for (const f of files) {
      const inv = await this.readJson(`inventory/${f}`);
      if (inv) out.push(inv);
    }
    return out;
  }
  // ---- suggestions -------------------------------------------------------
  async suggestions() {
    return await this.readJson("suggestions.json") ?? [];
  }
  async saveSuggestions(list) {
    await this.writeJson("suggestions.json", list);
  }
};

// src/state/config.ts
var DEFAULT_CONFIG = {
  idleMinutes: 5,
  prices: DEFAULT_PRICES,
  minSessionsCompare: 5,
  minSessionsForUnused: 10,
  largePieceTokens: 2500
};
async function loadConfig(store) {
  const user = await store.readJson("config.json") ?? {};
  return {
    ...DEFAULT_CONFIG,
    ...user,
    prices: { ...DEFAULT_PRICES, ...user.prices ?? {} }
  };
}

// src/commands.ts
var VERSION = true ? "0.1.0" : "dev";
function setup(o) {
  const projectDir = resolve(o.project ?? process.cwd());
  const store = Store.forProject(projectDir, o.dataDir);
  return { projectDir, store };
}
async function cmdInventory(o) {
  const { projectDir, store } = setup(o);
  const inv = await takeInventory({ projectDir, projectOnly: o.projectOnly });
  const { previous, changed } = await store.saveInventory(inv);
  return {
    project: projectDir,
    fingerprint: inv.fingerprint,
    changedSinceLastSnapshot: changed,
    changes: diffInventory(previous, inv),
    retention: inv.retention,
    pieces: inv.pieces.map(compactPiece),
    notes: inv.notes
  };
}
async function cmdAnalyze(o) {
  const { projectDir, store } = setup(o);
  const config = await loadConfig(store);
  const idleMs = config.idleMinutes * 6e4;
  const sinceMs = parseSince(o.since);
  const untilMs = parseSince(o.until);
  const inv = await takeInventory({ projectDir, projectOnly: o.projectOnly });
  const { previous, changed } = await store.saveInventory(inv);
  const loaded = await loadSessions({ projectDir, allProjects: o.allProjects, sinceMs, untilMs, idleMs, store, noCache: o.noCache, excludeSessions: o.excludeSessions });
  let sessions = loaded.sessions;
  const focus = o.pieces?.filter(Boolean) ?? [];
  if (focus.length) sessions = sessions.filter((s) => focus.some((p) => usesPiece(s, p)));
  const maxEvidence = o.maxEvidence ?? 5;
  let signals = extractSignals(sessions, inv, {
    idleMs,
    prices: config.prices,
    maxEvidence: Math.max(maxEvidence, 50),
    minSessionsForUnused: config.minSessionsForUnused,
    largePieceTokens: config.largePieceTokens
  });
  if (focus.length) signals = signals.filter((s) => s.pieces.some((p) => focus.some((f) => p === f || p.startsWith(`${f} `))));
  const suggestions = await store.suggestions();
  const bySignal = /* @__PURE__ */ new Map();
  for (const sug of suggestions) for (const sid of sug.signals) bySignal.set(sid, sug);
  for (const s of signals) {
    const sug = bySignal.get(s.id);
    if (sug) s.handled = { suggestionId: sug.id, status: sug.status };
  }
  for (const s of signals.filter((x) => x.type === "failed_command").slice(0, 15)) {
    const recovered = (s.details.recoveredWith ?? []).map((r) => r.value);
    const failed = s.id.slice("failed_command:".length);
    const mentions = await findMentions(inv, [failed, ...recovered]);
    if (mentions.length) s.details.mentions = mentions;
  }
  const usage = pieceUsage(sessions, inv, config.prices);
  const totals = sessionTotals(sessions, config.prices);
  const lostTypes = /* @__PURE__ */ new Set(["failed_command", "tool_error", "permission_denied", "hook_blocked", "repeated_read", "subagent_reread"]);
  const lost = signals.filter((s) => lostTypes.has(s.type));
  const corrected = signals.filter((s) => s.type === "user_correction" || s.type === "interruption");
  const full = {
    tool: { name: "improve-my-harness", version: VERSION },
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    project: projectDir,
    agent: "claude-code",
    period: {
      since: sinceMs ? new Date(sinceMs).toISOString() : loaded.available.oldest,
      until: untilMs ? new Date(untilMs).toISOString() : (/* @__PURE__ */ new Date()).toISOString(),
      focus
    },
    history: {
      transcriptsAvailable: loaded.available.count,
      oldest: loaded.available.oldest,
      newest: loaded.available.newest,
      retentionDays: inv.retention.days,
      retentionSource: inv.retention.source,
      note: `Claude Code deletes transcripts older than ${inv.retention.days} days at startup. improve-my-harness never changes this setting.`
    },
    analyzed: {
      sessions: sessions.length,
      subagentRuns: sessions.reduce((n, s) => n + s.threads.filter((t) => t.thread.id !== "main").length, 0),
      parsedNow: loaded.parsed,
      fromCache: loaded.fromCache,
      unparsedLines: loaded.unparsedLines
    },
    totals: {
      ...totals,
      lostToFailures: sumCost(lost),
      inCorrectedOrInterruptedTurns: sumCost(corrected),
      estimated: true,
      method: "Active time sums gaps between transcript events up to the idle threshold; subagent time is reported per agent and not added to session time. Failure cost = time until the agent reacted + tokens of the reaction turn. Correction cost = the corrected turn (upper bound). Categories can overlap.",
      idleMinutes: config.idleMinutes
    },
    inventory: {
      fingerprint: inv.fingerprint,
      changedSinceLastRun: changed,
      changes: diffInventory(previous, inv),
      pieces: inv.pieces.map(compactPiece),
      notes: inv.notes
    },
    usage,
    signals,
    suggestions: countBy(suggestions.map((s) => s.status)),
    dataDir: store.root
  };
  await store.writeJson("last-analysis.json", full);
  return {
    ...full,
    usage: usage.slice(0, 15),
    signals: signals.slice(0, o.maxSignals ?? 25).map((s) => ({ ...s, evidence: s.evidence.slice(0, maxEvidence) })),
    omittedSignals: Math.max(0, signals.length - (o.maxSignals ?? 25)),
    hint: "Full result in .imh/last-analysis.json. Use `imh evidence <signal-id>` for all evidence of one signal."
  };
}
async function cmdEvidence(o) {
  const { store } = setup(o);
  const last = await store.readJson("last-analysis.json");
  if (!last) throw new Error("No analysis yet. Run `imh analyze` first.");
  const s = last.signals.find((x) => x.id === o.signal || x.id.startsWith(o.signal));
  if (!s) throw new Error(`Signal not found: ${o.signal}`);
  return { generatedAt: last.generatedAt, ...s, evidence: s.evidence.slice(0, o.max ?? 50) };
}
async function cmdCompare(o) {
  const { projectDir, store } = setup(o);
  const config = await loadConfig(store);
  const idleMs = config.idleMinutes * 6e4;
  let changedAtMs;
  let source = "";
  if (o.at) {
    changedAtMs = parseSince(o.at);
    source = "--at";
  } else {
    const applied = (await store.suggestions()).filter((s) => s.piece === o.piece && s.appliedAt).sort((a, b) => (b.appliedAt ?? "").localeCompare(a.appliedAt ?? ""))[0];
    if (applied?.appliedAt) {
      changedAtMs = Date.parse(applied.appliedAt);
      source = `suggestion ${applied.id} applied`;
    } else {
      const inv = await takeInventory({ projectDir, projectOnly: o.projectOnly });
      const p = inv.pieces.find((x) => x.id === o.piece);
      if (p?.modifiedAt) {
        changedAtMs = Date.parse(p.modifiedAt);
        source = `${p.path} last changed (${p.modifiedSource})`;
      }
    }
  }
  if (changedAtMs === void 0) throw new Error(`Don't know when ${o.piece} changed. Pass --at <date>.`);
  const loaded = await loadSessions({ projectDir, allProjects: o.allProjects, sinceMs: parseSince(o.since), idleMs, store, noCache: o.noCache, excludeSessions: o.excludeSessions });
  return comparePiece(loaded.sessions, o.piece, changedAtMs, source, { minSessions: config.minSessionsCompare, prices: config.prices, idleMs });
}
async function cmdStatus(o) {
  const { projectDir, store } = setup(o);
  const config = await loadConfig(store);
  const inv = await takeInventory({ projectDir, projectOnly: o.projectOnly });
  const loaded = await loadSessions({ projectDir, allProjects: o.allProjects, idleMs: config.idleMinutes * 6e4, store, noCache: o.noCache, excludeSessions: o.excludeSessions });
  const suggestions = await store.suggestions();
  return {
    version: VERSION,
    project: projectDir,
    node: process.version,
    transcripts: loaded.available,
    retention: inv.retention,
    pieces: countBy(inv.pieces.map((p) => p.kind)),
    suggestions: countBy(suggestions.map((s) => s.status)),
    dataDir: store.root,
    config
  };
}
function suggestionId(s) {
  return `sug-${sha(`${[...s.signals].sort().join("|")}@${s.piece ?? ""}`, 8)}`;
}
async function cmdSuggestionsList(o) {
  const { store } = setup(o);
  const list = await store.suggestions();
  return o.status ? list.filter((s) => s.status === o.status) : list;
}
async function cmdSuggestionsAdd(o) {
  const { store } = setup(o);
  const list = await store.suggestions();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const added = [];
  const existing = [];
  for (const item of o.items) {
    if (!item.title || !item.class || !Array.isArray(item.signals) || !item.signals.length) {
      throw new Error("Each suggestion needs title, class and at least one signal id.");
    }
    const id = suggestionId(item);
    const found = list.find((s) => s.id === id);
    if (found) {
      existing.push({ id, status: found.status });
      continue;
    }
    list.push({
      id,
      title: item.title.slice(0, 200),
      class: item.class,
      piece: item.piece,
      signals: item.signals,
      status: item.status ?? "pending",
      createdAt: now,
      updatedAt: now,
      change: item.change?.slice(0, 2e3),
      note: item.note?.slice(0, 500)
    });
    added.push(id);
  }
  await store.saveSuggestions(list);
  return { added, existing, total: list.length };
}
async function cmdSuggestionsSet(o) {
  const { projectDir, store } = setup(o);
  const valid = ["pending", "accepted", "rejected", "applied"];
  if (!valid.includes(o.status)) throw new Error(`Status must be one of: ${valid.join(", ")}`);
  const list = await store.suggestions();
  const s = list.find((x) => x.id === o.id);
  if (!s) throw new Error(`Suggestion not found: ${o.id}`);
  s.status = o.status;
  s.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  if (o.note) s.note = o.note.slice(0, 500);
  if (o.status === "applied") {
    s.appliedAt = s.updatedAt;
    const inv = await takeInventory({ projectDir, projectOnly: o.projectOnly });
    await store.saveInventory(inv);
    s.appliedFingerprint = inv.fingerprint;
  }
  await store.saveSuggestions(list);
  return s;
}
function compactPiece(p) {
  return {
    id: p.id,
    scope: p.scope,
    path: p.path,
    approxTokens: p.approxTokens || void 0,
    modifiedAt: p.modifiedAt,
    editable: p.editable,
    model: p.model,
    description: p.description?.slice(0, 120)
  };
}
function diffInventory(prev, cur) {
  if (!prev) return [];
  const before = new Map(prev.pieces.map((p) => [p.id, p.hash]));
  const after = new Map(cur.pieces.map((p) => [p.id, p.hash]));
  const out = [];
  for (const [id, h] of after) {
    if (!before.has(id)) out.push({ id, change: "added" });
    else if (before.get(id) !== h) out.push({ id, change: "modified" });
  }
  for (const id of before.keys()) if (!after.has(id)) out.push({ id, change: "removed" });
  return out;
}
function sessionTotals(sessions, prices) {
  let usage = ZERO;
  let dollars = 0;
  let mainMs = 0;
  let subMs = 0;
  for (const s of sessions) {
    mainMs += s.activeMs;
    subMs += s.threads.filter((t) => t.thread.id !== "main").reduce((n, t) => n + t.activeMs, 0);
    for (const m of s.messages) {
      usage = addUsage(usage, m.usage);
      dollars += usd(m.usage, m.model, prices);
    }
  }
  return {
    activeMinutes: minutes(mainMs),
    subagentActiveMinutes: minutes(subMs),
    tokens: totalTokens(usage),
    usd: round(dollars, 2)
  };
}
function sumCost(signals) {
  return {
    activeMinutes: round(signals.reduce((n, s) => n + s.cost.activeMinutes, 0), 1),
    tokens: signals.reduce((n, s) => n + s.cost.tokens, 0),
    usd: round(signals.reduce((n, s) => n + s.cost.usd, 0), 2)
  };
}
function countBy(xs) {
  const out = {};
  for (const x of xs) out[x] = (out[x] ?? 0) + 1;
  return out;
}

// src/cli.ts
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
  --data-dir <dir>        Where state lives (default: <project>/.imh)
  --exclude-session <id>  Leave a session out, e.g. the one running the analysis (repeatable)
  --no-cache              Re-parse every transcript
  --pretty                Indented JSON

Output is JSON on stdout. Nothing leaves your machine.`;
async function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      project: { type: "string" },
      since: { type: "string" },
      until: { type: "string" },
      piece: { type: "string", multiple: true },
      at: { type: "string" },
      status: { type: "string" },
      note: { type: "string" },
      file: { type: "string" },
      max: { type: "string" },
      "max-signals": { type: "string" },
      "max-evidence": { type: "string" },
      "data-dir": { type: "string" },
      "project-only": { type: "boolean" },
      "all-projects": { type: "boolean" },
      "no-cache": { type: "boolean" },
      "exclude-session": { type: "string", multiple: true },
      pretty: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" }
    }
  });
  if (values.version) {
    process.stdout.write(`${VERSION}
`);
    return 0;
  }
  const [cmd, ...rest] = positionals;
  if (values.help || !cmd || cmd === "help") {
    process.stdout.write(`${HELP}
`);
    return 0;
  }
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 20) throw new Error(`Node.js 20+ is required (found ${process.version}).`);
  const common = {
    project: values.project,
    dataDir: values["data-dir"],
    projectOnly: values["project-only"],
    allProjects: values["all-projects"],
    noCache: values["no-cache"],
    excludeSessions: values["exclude-session"]
  };
  const int = (v) => v === void 0 ? void 0 : Number.parseInt(v, 10);
  let result;
  switch (cmd) {
    case "analyze":
      result = await cmdAnalyze({
        ...common,
        since: values.since,
        until: values.until,
        pieces: values.piece,
        maxSignals: int(values["max-signals"]),
        maxEvidence: int(values["max-evidence"])
      });
      break;
    case "inventory":
      result = await cmdInventory(common);
      break;
    case "evidence":
      if (!rest[0]) throw new Error("Usage: imh evidence <signal-id>");
      result = await cmdEvidence({ ...common, signal: rest[0], max: int(values.max) });
      break;
    case "compare": {
      const piece = values.piece?.[0];
      if (!piece) throw new Error("Usage: imh compare --piece <id> [--at <date>]");
      result = await cmdCompare({ ...common, piece, at: values.at, since: values.since });
      break;
    }
    case "status":
      result = await cmdStatus(common);
      break;
    case "suggestions": {
      const sub = rest[0] ?? "list";
      if (sub === "list") result = await cmdSuggestionsList({ ...common, status: values.status });
      else if (sub === "add") {
        const raw = values.file ? await readFile5(values.file, "utf8") : await readStdin();
        const parsed = JSON.parse(raw);
        result = await cmdSuggestionsAdd({ ...common, items: Array.isArray(parsed) ? parsed : [parsed] });
      } else if (sub === "set") {
        const [, id, status] = rest;
        if (!id || !status) throw new Error("Usage: imh suggestions set <id> <pending|accepted|rejected|applied> [--note text]");
        result = await cmdSuggestionsSet({ ...common, id, status, note: values.note });
      } else throw new Error(`Unknown suggestions command: ${sub}`);
      break;
    }
    default:
      throw new Error(`Unknown command: ${cmd}. Run \`imh --help\`.`);
  }
  process.stdout.write(`${JSON.stringify(result, null, values.pretty ? 2 : 0)}
`);
  return 0;
}
async function readStdin() {
  if (process.stdin.isTTY) throw new Error("Pass --file <json> or pipe JSON on stdin.");
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}
main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`imh: ${err instanceof Error ? err.message : String(err)}
`);
    process.exit(1);
  }
);
