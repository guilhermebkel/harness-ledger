import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Why: same alias as `paths` in tsconfig.json; esbuild reads that one when bundling.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("src", import.meta.url)) },
  },
});
