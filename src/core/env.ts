// The only module that reads environment variables (docs/code-standards.md).

export type EnvName
  = | "IMH_CLAUDE_HOME"
    | "IMH_CLAUDE_JSON"
    | "CLAUDE_CONFIG_DIR";

/** Returns the variable's value, treating an empty string as unset. */
export function readEnv(name: EnvName): string | undefined {
  const value = process.env[name];
  return value === "" ? undefined : value;
}
