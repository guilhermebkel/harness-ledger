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
- `dist/imh.mjs`: the bundled script the skill runs. Generated; only the `Release` workflow commits it (ADR 0004).
- `.github/workflows/`: `ci.yml` (shared checks), `release.yml` (cuts a version, by hand) and one workflow per provider (`claude-code.yml` validates the plugin and skill).
- `scripts/`: `build.mjs` (bundle), `survey-transcripts.mjs` (the shape of a folder of transcripts, without their content) and `eslint-local-rules.mjs` (this repo's own lint rules, tested next to it).
- `README.md` (for users), `CONTRIBUTING.md` (for contributors), `SECURITY.md` (what counts as a vulnerability: anything that leaks session data) and `CODE_OF_CONDUCT.md`. `.github/ISSUE_TEMPLATE/` has the bug, feature, mapping-gap and rule-question forms; `docs/assets/` holds the README banner.
- Adding a provider (Codex, Cursor, ...): follow `docs/adding-a-provider.md`. It covers finding the sessions, exporting a sample of the last 7 days, learning the format, mapping it to the shared model and checking it on real sessions.

## Commands

```bash
pnpm install
pnpm test           # vitest
pnpm typecheck
pnpm lint           # pnpm lint:fix for autofixable rules; includes complexity limits (sonarjs)
pnpm quality        # knip (dead code, unused exports and deps), dpdm (import cycles) and jscpd (duplicated code)
pnpm build          # src/ -> dist/imh.mjs
pnpm check          # all of the above, building to a scratch file so dist/ is untouched (CI runs this)
node dist/imh.mjs --help
claude plugin validate .claude-plugin/plugin.json && claude plugin validate skills
```

## Rules

- **Commit once per task, not per file.** Make all the edits a task needs, then verify once and commit everything together.
- **Before every commit, run `pnpm lint`, `pnpm typecheck` (tsc), `pnpm quality` and `pnpm test`, and fix everything they report.** `pnpm check` runs all of this in one go, plus a build to a scratch file; CI runs the same. Never commit with lint errors, type errors, quality findings or failing tests; fix the code instead of raising a limit or adding an ignore.
- Start new work on a branch from `master` and open a pull request; `.github/PULL_REQUEST_TEMPLATE.md` has the checklist.
- While iterating, run only what you need (`pnpm exec vitest run <file>`, `pnpm exec eslint <file>`); keep the full run for the end.
- Provider-specific code (paths, transcript and settings formats, tool names, prompt tags, env variables) lives only in `src/Providers/<Provider>/`. `src/Shared/` never imports a provider except through `ProviderModule`, and providers never import each other (ADR 0008, enforced by lint). If shared code needs provider knowledge, extend the shared model or `BaseProviderAdapter` instead.
- Write classes: static-only Utils, Services with constructor-injected dependencies, Commands with `run`. Protocols hold only types. One class per file, and the file is named after it (enforced by lint).
- Never pick which code runs by comparing with a fixed string (an `if` that does work, a ternary, a second comparison of the same value): dispatch through a `Record<Key, Handler>` (or a `Set` for shared answers) so TypeScript ties the rule to the union. Guards that leave early and comparisons that only become a value are fine (enforced by lint, `local/literal-dispatch`; details in `docs/code-standards.md`).
- Layers import only the ones below them: Protocols < Utils < Services/Adapters < Commands < Modules (enforced by lint; `docs/code-standards.md`).
- Put each test next to the file it tests, named `<File>.test.ts`, with every test under a top-level `describe("ClassName.method()")` naming the public method it goes through (enforced by lint, `local/describe-target`), and follow `docs/test-standards.md`: expected values written by hand, exact assertions, no logic in tests, doubles only at the process's edges (lint enforces part of it).
- Import with the `@/` alias and the `.ts` file name (`@/Shared/Utils/TimeUtil.ts`), in the same folder too; never `../`, `./` or `.js` (enforced by lint). The alias is defined in `tsconfig.json` (`paths`) and mirrored in `vitest.config.mjs`.
- Don't commit `dist/`, and don't change `version` or the marketplace `ref` (ADR 0004): users install from the tag in `.claude-plugin/marketplace.json`, not from `master`, so these change only in a release commit. If a local `pnpm build` changed `dist/`, discard that (`git checkout dist/`).
- Use pnpm, never npm: commit `pnpm-lock.yaml`, never `package-lock.json` (ADR 0004).
- Runtime code uses only Node built-ins (Node 20+). No runtime dependencies (ADR 0004).
- No comments by default. Write one only for a hidden rule someone could break by changing the code, starting with `Why:`, right above the line where the rule happens: never as a file header, above a whole function, class or type, or in `Protocols/` (enforced by lint, `local/comment-placement`). Delete a comment the code already says. Name maps and records `keyToValue` (`local/map-name`) and put units in names, not comments.
- Follow `docs/code-standards.md`. `pnpm lint` enforces most of it; review checks the rest.
- Cost rules live in `docs/cost-model.md` (ADR 0009): change a cost in code and that file in the same commit, and keep `cost.method` and `cost.bound` in `SignalService` in sync with it.
- Numbers come only from the script; the skill never estimates them (ADR 0002). New signals must carry evidence (session, line, thread) and an `isPartial` flag with reasons when the evidence is incomplete.
- Links that leave the machine (issue links for gaps and rule questions, ADR 0010) carry shapes, names and counts only, never session content; the script builds them and never sends anything.
- Every string that can reach output passes through `RedactUtil.redact()` / `RedactUtil.excerpt()`. Hook and MCP entries keep names and shapes only (ADR 0007). Add a test with a fake secret for any new output path.
- Transcript formats are internal: parse defensively, count unknown lines, never throw on a bad line. Add new format cases to the provider's fixture (`ClaudeCodeFixtureUtil`).
- `skills/improve-my-harness/SKILL.md` description is loaded in every user session: keep it short.
- A merge reaches no one until a release. Cut one with the `Release` workflow (`.github/workflows/release.yml`, run by hand from the Actions tab on `master`, choosing patch, minor or major): in one commit it bumps `version` in `plugin.json` and `package.json`, points the marketplace `ref` at `vX.Y.Z`, runs `pnpm release:check` (adds publint) and rebuilds `dist/`; then it tags `vX.Y.Z` and publishes a GitHub Release with generated notes.

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues for `guilhermebkel/improve-my-harness`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
