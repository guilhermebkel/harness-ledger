// Why: no YAML dependency (ADR 0004); this reads only what skill, agent and rule files need.

import type { Frontmatter, FrontmatterValue } from "@/Shared/Protocols/UtilProtocol.js";

type BlockMode = "list" | "text" | undefined;

interface ParseState {
  data: Record<string, FrontmatterValue>;
  currentKey: string | undefined;
  blockMode: BlockMode;
}

const BLOCK_TEXT_MARKERS = new Set(["|", ">", "|-", ">-"]);

export class FrontmatterUtil {
  static parse(text: string): Frontmatter {
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
    if (!match) {
      return {
        data: {},
        body: text,
      };
    }
    const state: ParseState = { data: {}, currentKey: undefined, blockMode: undefined };
    for (const rawLine of (match[1] ?? "").split(/\r?\n/)) {
      FrontmatterUtil.readLine(state, rawLine.trimEnd());
    }
    const data = state.data;
    return {
      data,
      body: text.slice(match[0].length),
    };
  }

  private static readLine(state: ParseState, line: string): void {
    const isBlankOrComment = !line.trim() || line.trim().startsWith("#");
    if (isBlankOrComment) {
      return;
    }
    const key = state.currentKey;
    const content = line.trimStart();
    const isIndented = content.length < line.length;
    const isListItem = isIndented && /^-\s/.test(content);
    if (isListItem && key && state.blockMode !== "text") {
      const previous = state.data[key];
      const list = Array.isArray(previous) ? previous : [];
      const item = content.slice(1).trim();
      list.push(FrontmatterUtil.unquote(item));
      state.data[key] = list;
      state.blockMode = "list";
      return;
    }
    if (isIndented && key && state.blockMode === "text") {
      state.data[key] = `${String(state.data[key] ?? "")} ${line.trim()}`.trim();
      return;
    }
    const keyValue = /^([\w-]+):(.*)$/.exec(line);
    if (!keyValue) {
      return;
    }
    const newKey = keyValue[1] ?? "";
    const value = (keyValue[2] ?? "").trim();
    state.currentKey = newKey;
    state.blockMode = BLOCK_TEXT_MARKERS.has(value) ? "text" : undefined;
    const isFlowList = value.startsWith("[") && value.endsWith("]");
    state.data[newKey] = isFlowList ? FrontmatterUtil.parseFlowList(value) : FrontmatterUtil.parseScalar(value);
  }

  // Why: a list can be a YAML list, a flow list or a comma- or space-separated string (`tools: Read, Bash`).
  static asList(value: FrontmatterValue | undefined): string[] | undefined {
    if (value === undefined || value === "") {
      return undefined;
    }
    if (Array.isArray(value)) {
      return value;
    }
    const entries = value.includes(",") ? value.split(",") : FrontmatterUtil.splitOutsideParentheses(value);
    return entries.map((entry) => entry.trim()).filter(Boolean);
  }

  static asText(value: FrontmatterValue | undefined): string | undefined {
    return typeof value === "string" && value !== "" ? value : undefined;
  }

  private static parseScalar(value: string): string {
    return BLOCK_TEXT_MARKERS.has(value) ? "" : FrontmatterUtil.unquote(value);
  }

  private static parseFlowList(value: string): string[] {
    return value
      .slice(1, -1)
      .split(",")
      .map((entry) => FrontmatterUtil.unquote(entry.trim()))
      .filter(Boolean);
  }

  // Why: `Bash(git log *)` must stay one entry.
  private static splitOutsideParentheses(value: string): string[] {
    const entries: string[] = [];
    let current = "";
    let depth = 0;
    for (const character of value) {
      depth += Number(character === "(") - Number(character === ")");
      const isSeparator = depth <= 0 && /\s/.test(character);
      if (isSeparator) {
        entries.push(current);
        current = "";
      } else {
        current += character;
      }
    }
    entries.push(current);
    return entries;
  }

  private static unquote(text: string): string {
    return text.replace(/^["'](.*)["']$/, "$1");
  }
}
