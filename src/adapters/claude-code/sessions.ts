// Claude Code session reader.
// Transcripts are JSONL files at ~/.claude/projects/<project>/<session>.jsonl, with
// subagent transcripts at <session>/subagents/agent-<id>.jsonl. The format is internal
// and changes between versions, so every field access here is defensive: unknown lines
// are counted, never fatal.

import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join, relative, isAbsolute } from "node:path";
import { createInterface } from "node:readline";
import type {
  AssistantMessage,
  EvidenceRef,
  SessionFacts,
  ThreadFacts,
  ThreadRef,
  ToolCall,
  UserPrompt,
} from "../../core/types.js";
import { excerpt, redact } from "../../core/redact.js";
import {
  cleanPrompt,
  commandKey,
  errorKey,
  HOOK_BLOCKED,
  INTERRUPTED,
  isCorrection,
  PERMISSION_DENIED,
} from "../../core/normalize.js";
import { sha } from "../../core/util.js";
import { claudeHome, encodeProjectDir } from "./paths.js";

export interface TranscriptFile {
  sessionId: string;
  file: string;
  mtimeMs: number;
  size: number;
  subagentFiles: Array<{ file: string; mtimeMs: number; size: number }>;
  /** True when the transcript sits in this project's own folder (not a prefix match like my-app-2 or a subfolder). */
  exactProject: boolean;
}

export interface DiscoverOptions {
  projectDir: string;
  allProjects?: boolean;
  home?: string;
}

/** Lists transcript files for a project (or all projects). Cheap: stat only, no parsing. */
export async function discoverTranscripts(opts: DiscoverOptions): Promise<TranscriptFile[]> {
  const root = join(opts.home ?? claudeHome(), "projects");
  let dirs: string[];
  try {
    dirs = await readdir(root);
  } catch {
    return [];
  }
  const encoded = encodeProjectDir(opts.projectDir);
  const selected = opts.allProjects ? dirs : dirs.filter((d) => d === encoded || d.startsWith(`${encoded}-`));
  const out: TranscriptFile[] = [];
  for (const d of selected) {
    const dir = join(root, d);
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith(".jsonl")) continue;
      const file = join(dir, name);
      const st = await stat(file).catch(() => undefined);
      if (!st?.isFile()) continue;
      const sessionId = name.slice(0, -".jsonl".length);
      const subDir = join(dir, sessionId, "subagents");
      const subagentFiles: TranscriptFile["subagentFiles"] = [];
      for (const sub of await readdir(subDir).catch(() => [] as string[])) {
        if (!sub.endsWith(".jsonl")) continue;
        const sf = join(subDir, sub);
        const sst = await stat(sf).catch(() => undefined);
        if (sst?.isFile()) subagentFiles.push({ file: sf, mtimeMs: sst.mtimeMs, size: sst.size });
      }
      out.push({ sessionId, file, mtimeMs: st.mtimeMs, size: st.size, subagentFiles, exactProject: d === encoded });
    }
  }
  return out.sort((a, b) => a.mtimeMs - b.mtimeMs);
}

export interface ParseOptions {
  /** Gaps longer than this are idle time and are not counted. */
  idleMs: number;
  projectDir?: string;
}

interface Ctx {
  facts: SessionFacts;
  file: string;
  thread: ThreadRef;
  pending: Map<string, ToolCall>;
  timestamps: Map<string, number[]>; // thread id → timestamps
  messages: Map<string, AssistantMessage>;
  /** Task tool_use id → subagent agentId reported in its result. */
  agentIdByTask: Map<string, string>;
  firstPromptHash: Map<string, string>;
  /** Thread types learned from metadata lines. */
  threadTypes: Map<string, string>;
  projectDir?: string;
}

const MAIN: ThreadRef = { id: "main", agentType: "main" };

export async function parseSession(t: TranscriptFile, opts: ParseOptions): Promise<SessionFacts> {
  const facts: SessionFacts = {
    agent: "claude-code",
    sessionId: t.sessionId,
    file: t.file,
    activeMs: 0,
    threads: [],
    prompts: [],
    tools: [],
    messages: [],
    files: [t.file, ...t.subagentFiles.map((s) => s.file)],
    unparsedLines: 0,
  };
  const ctx: Ctx = {
    facts,
    file: t.file,
    thread: MAIN,
    pending: new Map(),
    timestamps: new Map(),
    messages: new Map(),
    agentIdByTask: new Map(),
    firstPromptHash: new Map(),
    threadTypes: new Map(),
    projectDir: opts.projectDir,
  };

  await readLines(t.file, (obj, line) => handleLine(ctx, obj, line, true), () => facts.unparsedLines++);

  // Subagent transcripts: resolve each one's type from metadata, the parent's Task result, or its prompt.
  const taskCalls = facts.tools.filter((c) => c.subagentType);
  for (const sub of t.subagentFiles) {
    const agentId = basename(sub.file, ".jsonl").replace(/^agent-/, "");
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

  // Inline sidechains (older format): label by agentId when the parent result names it.
  for (const call of taskCalls) {
    const agentId = ctx.agentIdByTask.get(call.id);
    if (agentId && call.subagentType) relabelThread(facts, agentId, call.subagentType);
  }

  facts.messages = [...ctx.messages.values()];
  for (const [threadId, stamps] of ctx.timestamps) {
    stamps.sort((a, b) => a - b);
    const tf: ThreadFacts = {
      thread: threadId === "main" ? MAIN : { id: threadId, agentType: threadTypeOf(facts, threadId) },
      activeMs: activeTime(stamps, opts.idleMs),
      firstMs: stamps[0],
      lastMs: stamps[stamps.length - 1],
      promptHash: ctx.firstPromptHash.get(threadId),
    };
    facts.threads.push(tf);
    if (threadId === "main") {
      facts.activeMs = tf.activeMs;
      facts.startMs = tf.firstMs;
      facts.endMs = tf.lastMs;
    }
  }
  if (facts.startMs === undefined) {
    const all = [...ctx.timestamps.values()].flat().sort((a, b) => a - b);
    facts.startMs = all[0];
    facts.endMs = all[all.length - 1];
  }
  return facts;
}

/** Sum of gaps between consecutive events, skipping gaps longer than idleMs. */
export function activeTime(sortedStamps: number[], idleMs: number): number {
  let total = 0;
  for (let i = 1; i < sortedStamps.length; i++) {
    const gap = sortedStamps[i]! - sortedStamps[i - 1]!;
    if (gap > 0 && gap <= idleMs) total += gap;
  }
  return total;
}

function threadTypeOf(facts: SessionFacts, threadId: string): string {
  return (
    facts.tools.find((c) => c.thread.id === threadId)?.thread.agentType ??
    facts.messages.find((m) => m.thread.id === threadId)?.thread.agentType ??
    "subagent"
  );
}

function relabelThread(facts: SessionFacts, threadId: string, agentType: string): void {
  const relabel = (t: ThreadRef) => {
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

async function readMetaType(subFile: string): Promise<string | undefined> {
  try {
    const meta = JSON.parse(await readFile(subFile.replace(/\.jsonl$/, ".meta.json"), "utf8"));
    const v = meta?.agentType ?? meta?.agent_type ?? meta?.subagent_type ?? meta?.subagentType;
    return typeof v === "string" ? v : undefined;
  } catch {
    return undefined;
  }
}

async function readLines(file: string, onObj: (obj: any, line: number) => void, onBad: () => void): Promise<void> {
  const rl = createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
  let n = 0;
  for await (const raw of rl) {
    n++;
    if (!raw.trim()) continue;
    let obj: any;
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

function handleLine(ctx: Ctx, obj: any, line: number, isMainFile: boolean): void {
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
  const tsMs = Number.isNaN(ts) ? undefined : ts;
  const type = obj.type;
  if (tsMs !== undefined && (type === "user" || type === "assistant" || type === "attachment" || type === "system")) {
    const arr = ctx.timestamps.get(thread.id) ?? [];
    arr.push(tsMs);
    ctx.timestamps.set(thread.id, arr);
  }
  const ref = (text?: string): EvidenceRef => ({
    sessionId: facts.sessionId,
    file: ctx.file,
    line,
    timestamp: typeof obj.timestamp === "string" ? obj.timestamp : undefined,
    thread: thread.agentType,
    excerpt: text ? excerpt(text) : undefined,
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
      cacheWrite: num(usage.cache_creation_input_tokens),
    };
    if (prev) {
      // Claude Code writes one line per content block, each repeating the usage; keep the max.
      prev.usage.input = Math.max(prev.usage.input, u.input);
      prev.usage.output = Math.max(prev.usage.output, u.output);
      prev.usage.cacheRead = Math.max(prev.usage.cacheRead, u.cacheRead);
      prev.usage.cacheWrite = Math.max(prev.usage.cacheWrite, u.cacheWrite);
    } else {
      ctx.messages.set(id, { id, model: typeof msg.model === "string" ? msg.model : undefined, usage: u, thread, timestampMs: tsMs, ref: ref() });
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
      let textParts: string[] = [];
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

function handlePrompt(ctx: Ctx, obj: any, raw: string, thread: ThreadRef, ref: (t?: string) => EvidenceRef, tsMs?: number): void {
  if (!ctx.firstPromptHash.has(thread.id)) ctx.firstPromptHash.set(thread.id, sha(raw.trim()));
  if (obj.isMeta || obj.isCompactSummary || obj.isVisibleInTranscriptOnly) return;
  if (thread.id !== "main") return; // a subagent's "user" turn is the delegation prompt, not the person
  const { text, command } = cleanPrompt(raw);
  if (!text && !command) return;
  if (/^Caveat: The messages below were generated/i.test(text)) return;
  const interruption = INTERRUPTED.test(text);
  const prompt: UserPrompt = {
    text: redact(text).slice(0, 2000),
    ref: ref(text || `/${command}`),
    timestampMs: tsMs,
    command,
    isInterruption: interruption,
    isCorrection: !interruption && ctx.facts.prompts.length > 0 && isCorrection(text),
  };
  ctx.facts.prompts.push(prompt);
}

function handleToolResult(ctx: Ctx, block: any, obj: any, ref: (t?: string) => EvidenceRef, tsMs?: number): void {
  const call = ctx.pending.get(block.tool_use_id);
  const text = resultText(block.content);
  const tur = obj.toolUseResult;
  if (call && tur && typeof tur === "object" && typeof tur.agentId === "string") ctx.agentIdByTask.set(call.id, tur.agentId);
  if (!call) return;
  ctx.pending.delete(block.tool_use_id);
  let kind: NonNullable<ToolCall["result"]>["kind"] = "ok";
  const head = text.slice(0, 600);
  if (INTERRUPTED.test(text.trim())) kind = "interrupted";
  else if (PERMISSION_DENIED.test(head)) kind = "permission_denied";
  else if (HOOK_BLOCKED.test(head) && block.is_error) kind = "hook_blocked";
  else if (block.is_error === true || (tur && typeof tur === "object" && tur.interrupted === true)) kind = "error";
  const isError = kind !== "ok";
  call.result = {
    isError,
    kind,
    errorHead: isError ? errorKey(text) : undefined,
    contentChars: text.length,
    ref: { ...ref(isError ? text : undefined), thread: call.thread.agentType },
    timestampMs: tsMs,
  };
}

function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c: any) => (c?.type === "text" && typeof c.text === "string" ? c.text : c?.type === "image" ? "[image]" : ""))
      .join("\n");
  }
  return "";
}

function toolCall(
  block: any,
  thread: ThreadRef,
  ref: (t?: string) => EvidenceRef,
  tsMs: number | undefined,
  messageId: string,
  projectDir?: string,
): ToolCall {
  const name: string = typeof block.name === "string" ? block.name : "unknown";
  const input = block.input && typeof block.input === "object" ? block.input : {};
  let key = name;
  let summary = name;
  let filePath: string | undefined;
  let subagentType: string | undefined;
  let subagentPromptHash: string | undefined;
  let skill: string | undefined;

  const fp = input.file_path ?? input.notebook_path ?? input.path;
  if (name === "Bash" && typeof input.command === "string") {
    key = commandKey(input.command);
    summary = input.command;
  } else if (["Read", "Edit", "Write", "MultiEdit", "NotebookEdit", "NotebookRead"].includes(name) && typeof fp === "string") {
    filePath = projectDir && isAbsolute(fp) && fp.startsWith(projectDir) ? relative(projectDir, fp) || "." : fp;
    summary = `${name} ${filePath}`;
  } else if ((name === "Task" || name === "Agent") && (input.subagent_type || input.prompt)) {
    subagentType = typeof input.subagent_type === "string" ? input.subagent_type : "general-purpose";
    subagentPromptHash = typeof input.prompt === "string" ? sha(input.prompt.trim()) : undefined;
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
    skill,
  };
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
