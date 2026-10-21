import { readdir, stat } from "node:fs/promises";
import { basename, dirname, join, sep } from "node:path";
import type { DiscoverOptions, TranscriptFile, TranscriptFileStat } from "@/Shared/Protocols/ProviderProtocol.ts";
import type { AssistantMessage, SessionFacts, ThreadRef, ToolCall } from "@/Shared/Protocols/SessionProtocol.ts";
import type { UnknownRecord } from "@/Shared/Protocols/UtilProtocol.ts";
import { GuardUtil } from "@/Shared/Utils/GuardUtil.ts";
import { HashUtil } from "@/Shared/Utils/HashUtil.ts";
import { JsonlUtil } from "@/Shared/Utils/JsonlUtil.ts";
import { NormalizeUtil } from "@/Shared/Utils/NormalizeUtil.ts";
import { RedactUtil } from "@/Shared/Utils/RedactUtil.ts";
import { SessionUtil } from "@/Shared/Utils/SessionUtil.ts";
import { UnknownLineUtil } from "@/Shared/Utils/UnknownLineUtil.ts";
import type {
  CursorParseContext,
  CursorToolDescription,
  CursorToolSource,
  CursorTranscriptEntry,
} from "@/Providers/Cursor/Protocols/CursorProtocol.ts";
import { CursorPathUtil } from "@/Providers/Cursor/Utils/CursorPathUtil.ts";

const TRANSCRIPTS_FOLDER = "agent-transcripts";
const SUBAGENTS_FOLDER = "subagents";
const TRANSCRIPT_EXTENSION = ".jsonl";
const MAX_PROMPT_CHARS = 2000;
const UNKNOWN_SUBAGENT_TYPE = "subagent";
const USER_QUERY_PATTERN = /<user_query>([\s\S]*?)<\/user_query>/;
const PATCH_FILE_PATTERN = /^\*\*\* (?:Update|Add|Delete) File: (.+)$/m;
const MAX_NAME_CHARS = 60;
// Why: Cursor marks the end of a turn and a failed turn with rows that carry no prompt, tool or message.
const TURN_ROW_TYPES = new Set(["turn_ended"]);

type RoleHandler = (context: CursorParseContext, message: UnknownRecord, lineNumber: number) => void;
type ToolDescriber = (input: UnknownRecord, rawInput: unknown) => CursorToolDescription;

const pathOf = (input: UnknownRecord): string | undefined => GuardUtil.firstString(input, ["path", "target_notebook", "file_path"]);
const describeRead: ToolDescriber = (input) => ({ key: "Read", category: "read", summary: pathOf(input) ?? "Read", filePath: pathOf(input) });
const describeEdit: ToolDescriber = (input) => ({ key: "Edit", category: "edit", summary: pathOf(input) ?? "Edit", filePath: pathOf(input) });
const describePatch: ToolDescriber = (_input, rawInput) => ({
  key: "Edit",
  category: "edit",
  summary: "ApplyPatch",
  filePath: PATCH_FILE_PATTERN.exec(GuardUtil.asString(rawInput) ?? "")?.[1],
});
const describeSearch: ToolDescriber = (input) => ({
  key: "Search",
  category: "search",
  summary: GuardUtil.firstString(input, ["pattern", "glob_pattern", "query", "search_term", "url"]) ?? "Search",
});
const describeShell: ToolDescriber = (input) => {
  const command = GuardUtil.asString(input.command) ?? "";
  return { key: NormalizeUtil.commandKey(command), category: "shell", summary: command };
};
const describePlan: ToolDescriber = () => ({ key: "Plan", category: "plan", summary: "Plan" });
const describeSubagent: ToolDescriber = (input) => {
  const subagentType = GuardUtil.asString(input.subagent_type) ?? "generalPurpose";
  const prompt = GuardUtil.asString(input.prompt);
  return {
    key: `Subagent:${subagentType}`,
    category: "delegation",
    summary: GuardUtil.asString(input.description) ?? subagentType,
    subagentPromptHash: prompt === undefined ? undefined : HashUtil.sha(prompt),
    subagentType,
  };
};
const describeMcp: ToolDescriber = (input) => {
  const server = GuardUtil.asString(input.server) ?? "unknown";
  return { key: server, category: "mcp", summary: `${server}:${GuardUtil.asString(input.toolName) ?? ""}` };
};
const TOOL_NAME_TO_DESCRIBER = new Map<string, ToolDescriber>([
  ["Read", describeRead],
  ["ReadFile", describeRead],
  ["StrReplace", describeEdit],
  ["Write", describeEdit],
  ["EditNotebook", describeEdit],
  ["ApplyPatch", describePatch],
  ["Grep", describeSearch],
  ["rg", describeSearch],
  ["Glob", describeSearch],
  ["SemanticSearch", describeSearch],
  ["WebSearch", describeSearch],
  ["WebFetch", describeSearch],
  ["Shell", describeShell],
  ["TodoWrite", describePlan],
  ["CreatePlan", describePlan],
  ["SwitchMode", describePlan],
  ["Task", describeSubagent],
  ["Subagent", describeSubagent],
  ["CallMcpTool", describeMcp],
]);

export class CursorSessionService {
  private readonly roleToHandler: Record<"user" | "assistant", RoleHandler> = {
    user: (context, message, lineNumber) => {
      this.handleUser(context, message, lineNumber);
    },
    assistant: (context, message, lineNumber) => {
      this.handleAssistant(context, message, lineNumber);
    },
  };

  constructor(private readonly homeDir: string) {}

  async discoverTranscripts(options: DiscoverOptions): Promise<TranscriptFile[]> {
    const projectsDir = CursorPathUtil.projectsDir(this.homeDir);
    const folders = await readdir(projectsDir).catch(() => [] as string[]);
    const encodedProject = CursorPathUtil.encodeProjectDir(options.projectDir);
    const isCandidate = (folder: string): boolean => folder === encodedProject || folder.startsWith(`${encodedProject}-`);
    const entries: CursorTranscriptEntry[] = [];
    for (const folder of options.shouldReadAllProjects ? folders : folders.filter(isCandidate)) {
      entries.push(...await this.listTranscripts(projectsDir, folder));
    }
    const subagentsOf = (id: string): CursorTranscriptEntry[] =>
      entries.filter((entry) => entry.isSubagent && entry.parentId === id);
    const statOf = (entry: CursorTranscriptEntry): TranscriptFileStat => ({
      file: entry.file,
      modifiedAtMs: entry.modifiedAtMs,
      bytes: entry.bytes,
    });
    return entries
      .filter((entry) => !entry.isSubagent)
      .map((entry) => ({
        file: entry.file,
        modifiedAtMs: entry.modifiedAtMs,
        bytes: entry.bytes,
        sessionId: entry.sessionId,
        subagentFiles: subagentsOf(entry.sessionId).map((subagent) => statOf(subagent)),
        isExactProject: entry.projectFolder === encodedProject,
      }))
      .sort((left, right) => left.modifiedAtMs - right.modifiedAtMs);
  }

  async parseSession(transcript: TranscriptFile): Promise<SessionFacts> {
    const facts: SessionFacts = {
      provider: "cursor",
      sessionId: transcript.sessionId,
      file: transcript.file,
      // Why: Cursor transcripts record no time, so the file's last write stands in for when the session happened.
      startedAtMs: transcript.modifiedAtMs,
      endedAtMs: transcript.modifiedAtMs,
      activeMs: 0,
      threads: [{ thread: SessionUtil.mainThread(), activeMs: 0 }],
      prompts: [],
      tools: [],
      messages: [],
      apiErrors: [],
      compactions: [],
      environment: {},
      reported: { isCostPartial: true, turns: [] },
      files: [transcript.file, ...transcript.subagentFiles.map((subagentFile) => subagentFile.file)],
      unparsedLines: 0,
    };
    const context: CursorParseContext = {
      facts,
      currentFile: transcript.file,
      currentThread: SessionUtil.mainThread(),
    };
    await this.readTranscript(context);
    for (const subagentFile of transcript.subagentFiles) {
      context.currentFile = subagentFile.file;
      context.currentThread = {
        id: basename(subagentFile.file, TRANSCRIPT_EXTENSION),
        agentType: UNKNOWN_SUBAGENT_TYPE,
      };
      await this.readTranscript(context);
    }
    return facts;
  }

  private async listTranscripts(projectsDir: string, folder: string): Promise<CursorTranscriptEntry[]> {
    const root = join(projectsDir, folder, TRANSCRIPTS_FOLDER);
    const names = await readdir(root, { recursive: true }).catch(() => [] as string[]);
    const entries: CursorTranscriptEntry[] = [];
    for (const name of names.filter((candidate) => candidate.endsWith(TRANSCRIPT_EXTENSION))) {
      const transcriptFile = join(root, name);
      const fileStat = await stat(transcriptFile).catch(() => undefined);
      if (!fileStat?.isFile()) {
        continue;
      }
      const parts = name.split(sep);
      const isSubagent = parts.includes(SUBAGENTS_FOLDER);
      const parentFolder = dirname(dirname(name));
      entries.push({
        file: transcriptFile,
        modifiedAtMs: fileStat.mtimeMs,
        bytes: fileStat.size,
        sessionId: basename(name, TRANSCRIPT_EXTENSION),
        projectFolder: folder,
        parentId: isSubagent ? basename(parentFolder) : "",
        isSubagent,
      });
    }
    return entries;
  }

  private async readTranscript(context: CursorParseContext): Promise<void> {
    await JsonlUtil.read(context.currentFile, {
      onRecord: (record, lineNumber) => {
        this.handleRecord(context, record, lineNumber);
      },
      onBadLine: () => {
        context.facts.unparsedLines++;
      },
    });
  }

  private handleRecord(context: CursorParseContext, value: unknown, lineNumber: number): void {
    const record = GuardUtil.asRecord(value);
    if (!record) {
      return;
    }
    const role = GuardUtil.asString(record.role);
    const message = GuardUtil.asRecord(record.message);
    if (GuardUtil.isKeyOf(this.roleToHandler, role) && message) {
      this.roleToHandler[role](context, message, lineNumber);
      return;
    }
    if (typeof record.error === "string") {
      this.handleError(context, record, lineNumber);
      return;
    }
    if (!TURN_ROW_TYPES.has(GuardUtil.asString(record.type) ?? "")) {
      UnknownLineUtil.record(context.facts, record, GuardUtil.asString(record.type));
    }
  }

  private evidence(context: CursorParseContext, lineNumber: number, text?: string): SessionFacts["prompts"][number]["ref"] {
    return {
      sessionId: context.facts.sessionId,
      file: context.currentFile,
      line: lineNumber,
      thread: context.currentThread.agentType,
      excerpt: text ? RedactUtil.excerpt(text) : undefined,
    };
  }

  private blocksOf(message: UnknownRecord): UnknownRecord[] {
    const content = message.content;
    const blocks = typeof content === "string" ? [{ type: "text", text: content }] : GuardUtil.asArray(content);
    const records = blocks.map((block) => GuardUtil.asRecord(block));
    return records.filter((block): block is UnknownRecord => block !== undefined);
  }

  private handleUser(context: CursorParseContext, message: UnknownRecord, lineNumber: number): void {
    const text = this.blocksOf(message).map((block) => GuardUtil.asString(block.text) ?? "").join("\n");
    const query = USER_QUERY_PATTERN.exec(text)?.[1]?.trim();
    if (!query || !SessionUtil.isMainThread(context.currentThread)) {
      return;
    }
    context.facts.prompts.push({
      text: RedactUtil.redact(query.slice(0, MAX_PROMPT_CHARS)),
      ref: this.evidence(context, lineNumber, query),
      isCorrection: NormalizeUtil.isCorrection(query),
      isInterruption: false,
    });
  }

  private handleAssistant(context: CursorParseContext, content: UnknownRecord, lineNumber: number): void {
    const thread: ThreadRef = context.currentThread;
    const message: AssistantMessage = {
      id: `${thread.id}:${lineNumber}`,
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      ref: this.evidence(context, lineNumber),
      thread,
    };
    context.facts.messages.push(message);
    const toolBlocks = this.blocksOf(content).filter((block) => this.isToolUse(block));
    for (const [index, block] of toolBlocks.entries()) {
      const name = GuardUtil.asString(block.name) ?? "unknown";
      const id = `${lineNumber}:${index}`;
      const call = this.toolCall(context, { id, message, name, block, lineNumber });
      context.facts.tools.push(call);
    }
  }

  private isToolUse(block: UnknownRecord): boolean {
    return block.type === "tool_use" && typeof block.name === "string";
  }

  private toolCall(context: CursorParseContext, source: CursorToolSource): ToolCall {
    const { message, name, block, id, lineNumber } = source;
    const input = GuardUtil.asRecord(block.input) ?? {};
    const describer = TOOL_NAME_TO_DESCRIBER.get(name);
    const description = describer?.(input, block.input) ?? { key: name, category: "other" as const, summary: name };
    const summary = RedactUtil.excerpt(description.summary);
    return {
      ...description,
      id,
      name: RedactUtil.excerpt(name, MAX_NAME_CHARS),
      key: RedactUtil.redact(description.key),
      summary,
      thread: context.currentThread,
      ref: this.evidence(context, lineNumber, description.summary),
      messageId: message.id,
    };
  }

  private handleError(context: CursorParseContext, record: UnknownRecord, lineNumber: number): void {
    context.facts.apiErrors.push({
      code: RedactUtil.excerpt(GuardUtil.asString(record.error) ?? "unknown", MAX_NAME_CHARS),
      thread: context.currentThread,
      ref: this.evidence(context, lineNumber, GuardUtil.asString(record.status)),
    });
  }
}
