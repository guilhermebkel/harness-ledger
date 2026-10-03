// Why: the only place that reads environment variables (lint enforces it).
export class EnvUtil {
  // Why: an empty string counts as unset.
  static read(name: string): string | undefined {
    const value = process.env[name];
    return value === "" ? undefined : value;
  }
}
