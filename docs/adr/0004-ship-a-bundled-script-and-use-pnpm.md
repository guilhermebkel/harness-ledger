# Ship a bundled script in dist/, with pnpm as the package manager

The plugin runs `dist/imh.mjs`, a single file built by esbuild from `src/` with no runtime dependencies, and it is committed, so the plugin works right after `/plugin install` with nothing to install.

Claude Code runs `npm ci` for plugins that ship `package-lock.json`, which would install our dev dependencies on every user's machine and can time out. It skips the install for plugins that ship a pnpm lockfile. We use pnpm and commit `pnpm-lock.yaml`: contributors get reproducible installs, users get no install step.

## Consequences

- Contributors never commit `dist/`. After each push to `master`, once the checks pass, the `publish-dist` job in `ci.yml` rebuilds it and commits it as `github-actions[bot]` with `[skip ci]`. Pull requests carry only source, and `pnpm check` builds to a scratch file to prove the bundle builds.
- Between a merge and that job finishing (a few minutes), `master` holds new `src/` with the previous `dist/`. Installs in that window get the previous script, which still works on its own.
- Runtime code may only use Node built-ins. Dev dependencies (TypeScript, esbuild, ESLint, Vitest) are fine.
- Never commit `package-lock.json` (it is gitignored): it would make Claude Code run `npm ci` on install.
- `pnpm-lock.yaml` only changes together with `package.json`.
- `version` in `.claude-plugin/plugin.json` pins what users get: with the string unchanged, installed copies stay cached whatever lands on `master`. Pull requests never change it. The `Release` workflow (`release.yml`, run by hand) bumps it together with `package.json` and rebuilds `dist/` in the same commit, so no one can install a new version with an old bundle, then tags `vX.Y.Z` and publishes a GitHub Release.

## Status

Revised 2026-10-02: originally "no lockfile" with npm; switched to pnpm with a committed lockfile.

Revised 2026-10-03: `dist/` was rebuilt and committed by hand with every change to `src/`, and `pnpm check` failed when it was stale. That put a generated diff in every pull request and conflicts in every rebase, so CI now builds and commits it on `master` only. Versions are cut by the `Release` workflow, which puts the new `version` and its `dist/` in one commit.
