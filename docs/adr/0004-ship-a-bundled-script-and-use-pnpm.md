# Ship a bundled script in dist/, with pnpm as the package manager

The plugin runs `dist/imh.mjs`, a single file built by esbuild from `src/` with no runtime dependencies, and it is committed, so the plugin works right after `/plugin install` with nothing to install.

Claude Code runs `npm ci` for plugins that ship `package-lock.json`, which would install our dev dependencies on every user's machine and can time out. It skips the install for plugins that ship a pnpm lockfile. We use pnpm and commit `pnpm-lock.yaml`: contributors get reproducible installs, users get no install step.

## Consequences

- The marketplace entry serves the plugin from a tag (`"ref": "vX.Y.Z"` in `.claude-plugin/marketplace.json`), not from `master`. A fresh install and an update both get a released commit, where `skills/` and `dist/` come from the same source.
- Contributors never commit `dist/`, `version` or the marketplace `ref`. Pull requests carry only source, and `pnpm check` builds to a scratch file to prove the bundle builds. Between releases, `dist/` on `master` lags behind `src/`; nobody installs from there.
- Runtime code may only use Node built-ins. Dev dependencies (TypeScript, esbuild, ESLint, Vitest) are fine.
- Never commit `package-lock.json` (it is gitignored): it would make Claude Code run `npm ci` on install.
- `pnpm-lock.yaml` only changes together with `package.json`.
- `version` in `.claude-plugin/plugin.json` decides when installed copies update: with the string unchanged, they stay cached. The `Release` workflow (`release.yml`, run by hand) bumps it with `package.json`, points the marketplace `ref` at the new tag and rebuilds `dist/` in one commit, then tags it `vX.Y.Z` and publishes a GitHub Release. A merge reaches no one until then.

## Status

Revised 2026-10-02: originally "no lockfile" with npm; switched to pnpm with a committed lockfile.

Revised 2026-10-03: `dist/` was rebuilt and committed by hand with every change to `src/`, and `pnpm check` failed when it was stale. That put a generated diff in every pull request and conflicts in every rebase, so only the `Release` workflow builds and commits it now, in the same commit as the new `version`, and the marketplace serves that tag instead of `master`.
