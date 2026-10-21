const TABLE_HEADER = /^\[mcp_servers\.("?)([^\]"]+)\1\]/;
const STRING_ASSIGNMENT = /^([A-Za-z_][\w-]*)\s*=\s*"((?:[^"\\]|\\.)*)"\s*(?:#.*)?$/;

export class CodexTomlUtil {
  static mcpServerNames(toml: string): string[] {
    const names: string[] = [];
    for (const line of toml.split(/\r?\n/)) {
      const name = TABLE_HEADER.exec(line.trim())?.[2];
      if (name !== undefined && !name.includes(".") && !names.includes(name)) {
        names.push(name);
      }
    }
    return names;
  }

  static topLevelStrings(toml: string, keys: string[]): Record<string, string> {
    const keyToValue: Record<string, string> = {};
    for (const line of toml.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.startsWith("[")) {
        break;
      }
      const match = STRING_ASSIGNMENT.exec(trimmed);
      const key = match?.[1];
      if (key !== undefined && keys.includes(key) && match?.[2] !== undefined) {
        keyToValue[key] = match[2];
      }
    }
    return keyToValue;
  }
}
