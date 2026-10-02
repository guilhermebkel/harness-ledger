# Ship a bundled script in dist/, with pnpm as the package manager

The plugin runs `dist/imh.mjs`, a single file built by esbuild from `src/` with no runtime dependencies, and it is committed, so the plugin works right after `/plugin install` with nothing to install.

Claude Code runs `npm ci` for plugins that ship `package-lock.json`, which would install our dev dependencies on every user's machine and can time out. It skips the install for plugins that ship a pnpm lockfile. We use pnpm and commit `pnpm-lock.yaml`: contributors get reproducible installs, users get no install step.

## Consequences

- `dist/` must be rebuilt in the same commit as any change to `src/`. `pnpm check` (and CI) fails when it is stale.
- Runtime code may only use Node built-ins. Dev dependencies (TypeScript, esbuild, ESLint, Vitest) are fine.
- Never commit `package-lock.json` (it is gitignored): it would make Claude Code run `npm ci` on install.
- `pnpm-lock.yaml` only changes together with `package.json`.
- `version` in `.claude-plugin/plugin.json` pins what users get; bump it together with `package.json` on release.

## Status

Revised 2026-10-02: originally "no lockfile" with npm; switched to pnpm with a committed lockfile.
