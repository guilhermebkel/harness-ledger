/** The only place that reads environment variables (docs/code-standards.md). */
export class EnvUtil {
  /** Returns the variable's value, treating an empty string as unset. */
  static read(name: string): string | undefined {
    const value = process.env[name];
    return value === "" ? undefined : value;
  }
}
