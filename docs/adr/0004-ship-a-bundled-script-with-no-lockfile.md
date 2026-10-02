# Ship a bundled script in dist/ and no lockfile

The plugin runs `dist/imh.mjs`, a single file built by esbuild from `src/` with no runtime dependencies, and it is committed. Claude Code runs `npm ci` for plugins that ship a lockfile, which would install dev dependencies on every user's machine and can time out; with no lockfile and nothing to install, the plugin works right after `/plugin install`.

## Consequences

- `dist/` must be rebuilt in the same commit as any change to `src/`. `npm run check` (and CI) fails when it is stale.
- Runtime code may only use Node built-ins. Dev dependencies (TypeScript, esbuild, Vitest) are fine.
- `package-lock.json` is gitignored on purpose.
- `version` in `.claude-plugin/plugin.json` pins what users get; bump it together with `package.json` on release.
