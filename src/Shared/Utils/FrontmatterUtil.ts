import type { Frontmatter, FrontmatterValue } from "@/Shared/Protocols/UtilProtocol.ts";

type BlockMode = "list" | "text" | undefined;

interface ParseState {
  keyToValue: Record<string, FrontmatterValue>;
  currentKey: string | undefined;
  blockMode: BlockMode;
}

const BLOCK_TEXT_MARKERS = new Set(["|", ">", "|-", ">-"]);

const PARENTHESIS_TO_DEPTH_CHANGE = new Map([["(", 1], [")", -1]]);

export class FrontmatterUtil {
  static parse(text: string): Frontmatter {
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
    if (!match) {
      return {
        keyToValue: {},
        body: text,
      };
    }
    const state: ParseState = { keyToValue: {}, currentKey: undefined, blockMode: undefined };
    for (const rawLine of (match[1] ?? "").split(/\r?\n/)) {
      FrontmatterUtil.readLine(state, rawLine.trimEnd());
    }
    return {
      keyToValue: state.keyToValue,
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
    const isInTextBlock = state.blockMode === "text";
    if (isListItem && key && !isInTextBlock) {
      const previous = state.keyToValue[key];
      const list = Array.isArray(previous) ? previous : [];
      const item = content.slice(1).trim();
      list.push(FrontmatterUtil.unquote(item));
      state.keyToValue[key] = list;
      state.blockMode = "list";
      return;
    }
    if (isIndented && key && isInTextBlock) {
      state.keyToValue[key] = `${String(state.keyToValue[key] ?? "")} ${line.trim()}`.trim();
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
    state.keyToValue[newKey] = isFlowList ? FrontmatterUtil.parseFlowList(value) : FrontmatterUtil.parseScalar(value);
  }

  static asList(value: FrontmatterValue | undefined): string[] | undefined {
    if (value === undefined || value === "") {
      return undefined;
    }
    if (Array.isArray(value)) {
      return value;
    }
    // Why: tools come as a YAML list, a flow list or a comma- or space-separated string (`tools: Read, Bash`).
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

  private static splitOutsideParentheses(value: string): string[] {
    const entries: string[] = [];
    let current = "";
    let depth = 0;
    for (const character of value) {
      depth += PARENTHESIS_TO_DEPTH_CHANGE.get(character) ?? 0;
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
