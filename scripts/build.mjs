// Why: dist/ is committed so the plugin works right after install, without npm install (ADR 0004). CI builds and
// commits it on master; locally, `pnpm check` builds to a scratch file (--outfile) so dist/ stays untouched.
import { build } from "esbuild";
import { readFileSync } from "node:fs";

const DEFAULT_OUTFILE = "dist/imh.mjs";
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
  banner: { js: "#!/usr/bin/env node\n// improve-my-harness — generated file, edit src/ and run `pnpm build`." },
  define: { __IMH_VERSION__: JSON.stringify(pkg.version) },
  legalComments: "none",
  logLevel: "info",
});
