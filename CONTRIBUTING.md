# Contributing to harness-ledger

Thanks for helping. This project gets better mostly from people running it on their own sessions and telling us where it went wrong, so small reports matter as much as code.

## Ways to contribute

- **Send a mapping gap.** When a report lists something the script couldn't map (a new transcript line, an unknown model, a check tool it doesn't know), it gives you a prefilled issue link with only names and counts. Read it, then send it. That's how new agent versions get supported.
- **Question a rule.** A finding that's wrong for your project ("that command is supposed to fail here") is a rule question. Ask the skill for one, or open the [rule question form](https://github.com/guilhermebkel/harness-ledger/issues/new?template=rule-question.yml).
- **Report a bug or ask for a feature** with the [issue forms](https://github.com/guilhermebkel/harness-ledger/issues/new/choose).
- **Add a provider** (Codex, Cursor, ...). [`docs/adding-a-provider.md`](docs/adding-a-provider.md) walks through it, from finding the sessions to checking the result.
- **Improve a signal, the cost model or the docs.**

For anything large, open an issue first so we can agree on the approach.

## Never share session data

Transcripts hold everything the agent saw: code, command output, sometimes secrets. Never paste a real transcript, an excerpt, a file path from a session, or company names into an issue, a PR, a commit or a test. Tests use synthetic fixtures built in the real format (`ClaudeCodeFixtureUtil`, `ClaudeCodeTranscriptBuilder`); when you find a new case in a real session, rebuild it there with made-up content.

Security issues go through [SECURITY.md](SECURITY.md), not public issues.

## Setup

You need Node.js 20+ and pnpm (never npm: the committed `pnpm-lock.yaml` is what keeps users from installing dev dependencies; ADR 0004). `.nvmrc` pins the version we develop on, the oldest one users may run: `nvm use` (or fnm, mise) picks it up, and the Release workflow reads it too. The Claude Code workflow stays on Node 22, which its CLI needs.

```bash
git clone https://github.com/guilhermebkel/harness-ledger.git
cd harness-ledger
nvm use
pnpm install
pnpm check
```

To try your changes on a real project, build and run the script against it:

```bash
pnpm build
node dist/harness-ledger.mjs analyze --project /path/to/your/project --since 14d --pretty
git checkout dist/   # dist/ is committed only by releases
```

## Workflow

1. Branch from `master`.
2. Make the change, with its test next to the file it tests.
3. Run `pnpm check`. It runs typecheck, lint, dead code and duplication checks, tests and a build, the same as CI. Fix what it reports; don't raise a limit or add an ignore.
4. Commit once per task, with a message that says what changed and why.
5. Open a pull request and fill in the template.

While iterating, run only what you touch: `pnpm exec vitest run <file>`, `pnpm exec eslint <file>`.

## How the code is organized

- `src/Providers/<Provider>/` reads one agent's transcripts and settings into the shared model. Nothing outside that folder knows the agent's formats (ADR 0008).
- `src/Shared/` (commands, services, protocols, utils) extracts signals, usage, costs and before/after without knowing which agent produced them.
- `skills/audit-harness/` is what the agent reads at runtime: the flows, the finding classes and the report format.
- `dist/harness-ledger.mjs` is the bundled script the skill runs. Don't commit it; the Release workflow does.

The rules are in [`docs/code-standards.md`](docs/code-standards.md) and [`docs/test-standards.md`](docs/test-standards.md), and `pnpm lint` enforces most of them. The ones people trip on first:

- **Numbers come only from the script.** The skill never estimates a time, a token count or a cost (ADR 0002). A new signal carries its evidence (session, line, thread) and says when it's partial.
- **Everything that can reach output is redacted** with `RedactUtil`, and comes with a test that uses a fake secret.
- **A cost change updates [`docs/cost-model.md`](docs/cost-model.md)** in the same commit.
- **Comments are rare.** Only for a hidden rule, starting with `Why:`, right above the line where the rule happens.
- **Tests** sit under `describe("ClassName.method()")`, with expected values written by hand.

Vocabulary is in [GLOSSARY.md](GLOSSARY.md); decisions and their reasons are in [`docs/adr/`](docs/adr/).

## Pull requests

A good pull request:

- does one thing, and says why in the description;
- passes `pnpm check`;
- adds or updates tests, including a fixture case for any new transcript format;
- leaves `dist/`, `version` and the marketplace `ref` alone (releases change those);
- has no session data, real paths or company names anywhere.

Reviews look at behavior first, then at the rules lint can't check: whether a comment says something the code doesn't, whether a name says what a map holds, whether a test would fail if the code broke.

## Releases

Maintainers cut releases with the `Release` workflow (Actions → Release → patch, minor or major). It bumps the version, rebuilds `dist/`, tags `vX.Y.Z` and publishes notes from the merged pull requests. A merge reaches users only through a release.

## Code of conduct

Be kind and assume good faith. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
