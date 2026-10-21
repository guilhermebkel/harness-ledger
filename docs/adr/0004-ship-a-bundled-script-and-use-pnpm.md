# Ship a bundled script, with pnpm as the package manager

The skill runs `harness-ledger.mjs`, a single file built by esbuild from `src/` with no runtime dependencies. It is committed (in `dist/`, and copied into `skills/audit-harness/scripts/` because the `skills` CLI copies only the skill's folder), so the skill works right after `npx skills add` with nothing else to install (ADR 0011).

We use pnpm and commit `pnpm-lock.yaml`: contributors get reproducible installs, and users never install dependencies, since the script has none.

## Consequences

- Contributors never commit `dist/`, `skills/audit-harness/scripts/` or `version`. Pull requests carry only source, and `pnpm check` builds to a scratch file to prove the bundle builds. Between releases, both bundles on `master` lag behind `src/`.
- Runtime code may only use Node built-ins. Dev dependencies (TypeScript, esbuild, ESLint, Vitest) are fine.
- Never commit `package-lock.json` (it is gitignored).
- `pnpm-lock.yaml` only changes together with `package.json`.
- The `Release` workflow (`release.yml`, run by hand) bumps `version` in `package.json`, rebuilds `dist/` and the skill's script in one commit, then tags it `vX.Y.Z` and publishes a GitHub Release. The `skill-install` job in `ci.yml` installs the skill into a temporary folder and runs the installed script.
