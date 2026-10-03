declare const __IMH_VERSION__: string | undefined;

export class VersionUtil {
  // Why: esbuild replaces it at build time; "dev" when running from source.
  static readonly VERSION = typeof __IMH_VERSION__ === "string" ? __IMH_VERSION__ : "dev";
}
