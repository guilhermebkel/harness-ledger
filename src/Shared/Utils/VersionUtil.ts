declare const __HARNESS_LEDGER_VERSION__: string | undefined;

export class VersionUtil {
  // Why: esbuild replaces it at build time; "dev" when running from source.
  static readonly VERSION = typeof __HARNESS_LEDGER_VERSION__ === "string" ? __HARNESS_LEDGER_VERSION__ : "dev";
}
