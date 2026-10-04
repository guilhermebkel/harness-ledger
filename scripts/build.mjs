import { build } from "esbuild";
import { readFileSync } from "node:fs";

const DEFAULT_OUTFILE = "dist/harness-ledger.mjs";
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const outfileFlagIndex = process.argv.indexOf("--outfile");
const outfile = outfileFlagIndex === -1 ? DEFAULT_OUTFILE : process.argv[outfileFlagIndex + 1] ?? DEFAULT_OUTFILE;

await build({
  outfile,
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  banner: { js: "#!/usr/bin/env node\n// harness-ledger — generated file, edit src/ and run `pnpm build`." },
  define: { __HARNESS_LEDGER_VERSION__: JSON.stringify(pkg.version) },
  legalComments: "none",
  logLevel: "info",
});
