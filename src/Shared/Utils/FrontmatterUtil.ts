// A minimal YAML frontmatter reader for skill, agent and rule files: top-level `key: value` pairs,
// block and flow lists, and folded or literal text. Enough to read names and descriptions without
// a YAML dependency (ADR 0004).

import type { Frontmatter, FrontmatterValue } from "@/Shared/Protocols/UtilProtocol.js";

type BlockMode = "list" | "text" | undefined;

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
    const data: Record<string, FrontmatterValue> = {};
    let currentKey: string | undefined;
    let blockMode: BlockMode;
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
        list.push(FrontmatterUtil.unquote(listItem[1] ?? ""));
        data[currentKey] = list;
        blockMode = "list";
        continue;
      }
      const isTextContinuation = /^\s+/.test(line) && currentKey !== undefined && blockMode === "text";
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
      blockMode = BLOCK_TEXT_MARKERS.has(value) ? "text" : undefined;
      data[currentKey] = FrontmatterUtil.parseScalarOrFlowList(value);
    }
    return {
      data,
      body: text.slice(match[0].length),
    };
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
