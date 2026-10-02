// Bundles the CLI into a single file with no runtime dependencies.
// dist/ is committed so the plugin works right after install, without npm install.
import { build } from "esbuild";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

await build({
  entryPoints: ["src/cli.ts"],
  outfile: "dist/imh.mjs",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  banner: { js: "#!/usr/bin/env node\n// improve-my-harness — generated file, edit src/ and run `npm run build`." },
  define: { __IMH_VERSION__: JSON.stringify(pkg.version) },
  legalComments: "none",
  logLevel: "info",
});
