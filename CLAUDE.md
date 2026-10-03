# improve-my-harness

A Claude Code plugin that reads the session transcripts the agent already saves, maps the project's harness, and suggests evidence-based changes. Vocabulary is in `GLOSSARY.md`; decisions are in `docs/adr/`; planned work (v2 Bench, Codex, Cursor) is in GitHub issues.

## Layout

ADR 0008 has the reasons; `docs/code-standards.md` ("Architecture") has the rules.

- `skills/improve-my-harness/`: what the agent reads at runtime. `SKILL.md` has the four flows; `references/findings.md` has the classes, rules and report format.
- `src/index.ts`: entry point of the `imh` script.
- `src/Shared/`: code that knows no provider.
  - `Adapters/BaseProviderAdapter.ts`: the contract every provider extends (paths, transcripts, sessions, inventory).
  - `Modules/`: `CLIModule` (arguments, JSON output) and `ProviderModule` (creates a provider by type; the only Shared file that imports a provider).
  - `Commands/`: one class per CLI command.
  - `Services/`: business rules (signals, attribution, usage, before/after, mentions, store, config, suggestions).
  - `Protocols/`: types only. `Utils/`: static helper classes (guards, env, time, redaction, JSONL, git).
- `src/Providers/<Provider>/`: one agentic coding tool (Claude Code today), with the same folders as Shared. `Adapters/<Provider>ProviderAdapter.ts` extends `BaseProviderAdapter`; `Utils/<Provider>FixtureUtil.ts` builds a fake home and project in the tool's real format, for tests.
- Tests sit next to the file they test (`*.test.ts`). There is no `test/` folder.
- `dist/imh.mjs`: the bundled script the skill runs. Generated, committed (ADR 0004).
- `.github/workflows/`: `ci.yml` (shared checks) and one workflow per provider (`claude-code.yml` validates the plugin and skill).
- `scripts/`: `build.mjs` (bundle) and `survey-transcripts.mjs` (the shape of a folder of transcripts, without their content).
- Adding a provider (Codex, Cursor, ...): follow `docs/adding-a-provider.md`. It covers finding the sessions, exporting a sample of the last 7 days, learning the format, mapping it to the shared model and checking it on real sessions.

## Commands

```bash
pnpm install
pnpm test           # vitest
pnpm typecheck
pnpm lint           # pnpm lint:fix for autofixable rules; includes complexity limits (sonarjs)
pnpm quality        # knip (dead code, unused exports and deps), dpdm (import cycles) and jscpd (duplicated code)
pnpm build          # src/ -> dist/imh.mjs
pnpm check          # all of the above, and fails if dist/ is stale (CI runs this)
node dist/imh.mjs --help
claude plugin validate .claude-plugin/plugin.json && claude plugin validate skills
```

## Rules

- **Commit once per task, not per file.** Make all the edits a task needs, then verify once and commit everything together.
- **Before every commit, run `pnpm lint`, `pnpm typecheck` (tsc), `pnpm quality` and `pnpm test`, and fix everything they report.** Then `pnpm build` and stage `dist/`. `pnpm check` runs all of this in one go and also fails on a stale `dist/`; CI runs the same. Never commit with lint errors, type errors, quality findings or failing tests; fix the code instead of raising a limit or adding an ignore.
- While iterating, run only what you need (`pnpm exec vitest run <file>`, `pnpm exec eslint <file>`); keep the full run for the end.
- Provider-specific code (paths, transcript and settings formats, tool names, prompt tags, env variables) lives only in `src/Providers/<Provider>/`. `src/Shared/` never imports a provider except through `ProviderModule`, and providers never import each other (ADR 0008, enforced by lint). If shared code needs provider knowledge, extend the shared model or `BaseProviderAdapter` instead.
- Write classes: static-only Utils, Services with constructor-injected dependencies, Commands with `run`. Protocols hold only types.
- Layers import only the ones below them: Protocols < Utils < Services/Adapters < Commands < Modules (enforced by lint; `docs/code-standards.md`).
- Put each test next to the file it tests, named `<File>.test.ts`, and follow `docs/test-standards.md`: expected values written by hand, exact assertions, no logic in tests, doubles only at the process's edges (lint enforces part of it).
- Import across folders with the `@/` alias (`@/Shared/Utils/TimeUtil.js`), never `../`; same-folder imports use `./` (enforced by lint). The alias is defined in `tsconfig.json` (`paths`) and mirrored in `vitest.config.mjs`.
- Rebuild and commit `dist/` in the same commit as any change to `src/`.
- Use pnpm, never npm: commit `pnpm-lock.yaml`, never `package-lock.json` (ADR 0004).
- Runtime code uses only Node built-ins (Node 20+). No runtime dependencies (ADR 0004).
- No comments by default. Write one only for a hidden rule someone could break by changing the code, starting with `Why:` (enforced by lint).
- Follow `docs/code-standards.md`. `pnpm lint` enforces most of it; review checks the rest.
- Cost rules live in `docs/cost-model.md` (ADR 0009): change a cost in code and that file in the same commit, and keep `cost.method` and `cost.bound` in `SignalService` in sync with it.
- Numbers come only from the script; the skill never estimates them (ADR 0002). New signals must carry evidence (session, line, thread) and an `isPartial` flag with reasons when the evidence is incomplete.
- Every string that can reach output passes through `RedactUtil.redact()` / `RedactUtil.excerpt()`. Hook and MCP entries keep names and shapes only (ADR 0007). Add a test with a fake secret for any new output path.
- Transcript formats are internal: parse defensively, count unknown lines, never throw on a bad line. Add new format cases to the provider's fixture (`ClaudeCodeFixtureUtil`).
- `skills/improve-my-harness/SKILL.md` description is loaded in every user session: keep it short.
- Bump `version` in `.claude-plugin/plugin.json` and `package.json` together on release, and run `pnpm release:check` (adds publint: `package.json` matches what gets packed).

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues for `guilhermebkel/improve-my-harness`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
