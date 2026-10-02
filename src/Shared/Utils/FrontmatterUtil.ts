// A minimal YAML frontmatter reader for skill, agent and rule files: top-level `key: value` pairs,
// block and flow lists, and folded or literal text. Enough to read names and descriptions without
// a YAML dependency (ADR 0004).

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
      FrontmatterUtil.readLine(state, rawLine.replace(/\s+$/, ""));
    }
    const data = state.data;
    return {
      data,
      body: text.slice(match[0].length),
    };
  }

  /** Applies one frontmatter line: a list item, a continuation of block text, or a new `key: value`. */
  private static readLine(state: ParseState, line: string): void {
    const isBlankOrComment = !line.trim() || line.trim().startsWith("#");
    if (isBlankOrComment) {
      return;
    }
    const key = state.currentKey;
    const listItem = /^\s+-\s+(.*)$/.exec(line);
    if (listItem && key && state.blockMode !== "text") {
      const previous = state.data[key];
      const list = Array.isArray(previous) ? previous : [];
      list.push(FrontmatterUtil.unquote(listItem[1] ?? ""));
      state.data[key] = list;
      state.blockMode = "list";
      return;
    }
    if (/^\s+/.test(line) && key && state.blockMode === "text") {
      state.data[key] = `${String(state.data[key] ?? "")} ${line.trim()}`.trim();
      return;
    }
    const keyValue = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!keyValue) {
      return;
    }
    const newKey = keyValue[1] ?? "";
    const value = (keyValue[2] ?? "").trim();
    state.currentKey = newKey;
    state.blockMode = BLOCK_TEXT_MARKERS.has(value) ? "text" : undefined;
    state.data[newKey] = FrontmatterUtil.parseScalarOrFlowList(value);
  }

  /** A list field written as a YAML list, a flow list or a comma/space separated string (`tools: Read, Bash`). */
  static asList(value: FrontmatterValue | undefined): string[] | undefined {
    if (value === undefined || value === "") {
      return undefined;
    }
    if (Array.isArray(value)) {
      return value;
    }
    const separator = value.includes(",") ? "," : /\s+(?![^(]*\))/;
    return value
      .split(separator)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  static asText(value: FrontmatterValue | undefined): string | undefined {
    return typeof value === "string" && value !== "" ? value : undefined;
  }

  private static parseScalarOrFlowList(value: string): FrontmatterValue {
    if (BLOCK_TEXT_MARKERS.has(value)) {
      return "";
    }
    const isFlowList = value.startsWith("[") && value.endsWith("]");
    if (isFlowList) {
      return value
        .slice(1, -1)
        .split(",")
        .map((entry) => FrontmatterUtil.unquote(entry.trim()))
        .filter(Boolean);
    }
    return FrontmatterUtil.unquote(value);
  }

  private static unquote(text: string): string {
    return text.replace(/^["'](.*)["']$/, "$1");
  }
}
