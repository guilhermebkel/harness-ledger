# improve-my-harness

**Improve your coding-agent harness with evidence from your own sessions.**

Your harness — the instructions file, skills, subagents, commands, hooks and MCP servers around your coding agent — decides how well the agent works. But most changes to it are made by gut feeling: a skill gets added because it seemed useful, an agent gets a stronger model "just in case", an instruction grows every time something goes wrong.

`improve-my-harness` reads the sessions your coding agent already saves on your machine, maps your current harness, and tells you **which piece is causing which problem, how much time and tokens it cost you, and what to change** — with a link to the exact session and step behind every suggestion.

> Status: v1 in development. Supported agents and upcoming features are listed in the [Roadmap](#roadmap).

---

## How it works

1. **Maps your harness.** Every run takes a snapshot of what's active: project and user instructions, skills, subagents, commands, hooks, MCP servers and enabled plugins.
2. **Reads your history.** It parses the session transcripts your agent already writes locally, including subagent transcripts — so it works on the sessions you already have, from the first run. No extra logging.
3. **Finds patterns, deterministically.** A local script extracts failed commands, repeated file reads, permission denials, repeated requests, and tokens and time per agent and skill. Numbers never come from the model.
4. **Turns them into suggestions.** Your agent maps each pattern to the piece of the harness that should change, classifies it, and proposes the change.
5. **Checks if it helped.** When you accept a suggestion, the next runs compare before vs. after for that piece.

## Example

<sub>Illustrative output.</sub>

```text
Analyzed 41 sessions (last 30 days) · 9 findings · ~1h50 and ~$14 estimated lost

#1  Rule exists but is ignored (enforcement gap)          subagent: test-runner
    The agent ran `npm test` 11 times across 6 sessions; the repo uses `pnpm test`.
    The instruction is already in the project instructions.
    Evidence: session 3f2a… step 14, session 91bc… step 7, +4 more
    Cost: ~38 min, ~210k tokens (estimated)
    Suggestion: don't add more text — add a hook that rewrites
    `npm test` to `pnpm test` in this repo.

#2  Missing context in delegation                          subagent: code-reviewer
    Re-read on average 9 files the main session had just read.
    Suggestion: pass the changed-files summary when delegating. [proposed text]

#3  Structure change                                        pattern: repeated request
    "Generate the changelog entry from the last PRs" was asked in 7 sessions.
    Suggestion: turn it into a skill. [draft SKILL.md]
```

## Installation

### Claude Code

```text
/plugin marketplace add guilhermebkel/improve-my-harness
/plugin install improve-my-harness@improve-my-harness
```

Requires Node.js 20+ for the local analysis script.

Other agents: see the [Roadmap](#roadmap).

### Recommended model

Run the skill on the most capable reasoning model you have (in Claude Code, pick it with `/model` first). The local script does the reading and the counting, so the model only gets a compact summary; what it adds is judgment: grouping signals by cause, telling real friction from ordinary work, and choosing the fix. That's the part a smaller model gets wrong. It's a recommendation: the skill runs on any model and says so once when it isn't the strongest.

To see what a run cost you, check the skill's own row the next time you analyze: `node dist/imh.mjs analyze --piece skill:improve-my-harness` (the session running an analysis is left out, so earlier runs are what you see).

## Usage

Run `/improve-my-harness` and pick what you want, or just ask in plain text:

| Flow | Example |
| --- | --- |
| **Analyze history** (default) | `/improve-my-harness` |
| **Focus on a piece or period** | `/improve-my-harness only the code-reviewer subagent, last 2 weeks` |
| **Compare a change** | `/improve-my-harness did my change to code-reviewer help?` |
| **Manage suggestions** | `/improve-my-harness show pending suggestions` |

Suggestions are never applied on their own. Applying one is optional, always asks for confirmation, and only touches harness files.

## What it finds

Not every failure needs more instructions. Each finding falls into one class, and the class decides the fix:

| Class | When | Suggested fix |
| --- | --- | --- |
| **Rule exists, but is ignored** | The instruction is already there; the agent doesn't follow it | Enforce it deterministically: a script, hook or check |
| **Partial or outdated instruction** | It exists but is incomplete or contradicts the repo today | Fix the text in the right piece |
| **Missing instruction** | Nothing in the harness covers it | Add it, in the piece where it belongs |
| **Structure change** | A pattern repeats across sessions | Turn it into a skill, subagent or script — or remove an unused piece |
| **Out of scope** | The problem is in a piece you don't control | Recommendation only |
| **Already handled** | Already suggested, rejected, or changed in an open branch | Listed, never repeated |

## Principles

- **Evidence over opinion.** Every finding links to the session and step it came from. No evidence, no finding.
- **Enforcement over more text.** If a rule is written and ignored, a longer prompt is rarely the fix.
- **Honest numbers.** Time and cost are estimates, idle time is excluded, partial evidence is marked as partial, and before/after comparisons need a minimum sample.
- **Self-contained pieces.** Suggested text for a subagent or skill describes the condition itself — never who calls it or another file's step numbers.
- **Stay in scope.** Anything noticed outside the evidence (unrelated bugs, secrets) never becomes a suggestion, and sensitive values never appear in a report.

## Privacy

- Everything runs locally. Transcripts are read in place and never copied or sent anywhere; only findings (with references) are stored, in `.imh/`.
- No telemetry. When the analysis meets something it can't map (a new transcript format, a model with no price), the report offers a link to a prefilled GitHub issue holding only names and counts. You read it and decide whether to send it; nothing is sent on its own.
- Some agents delete old transcripts automatically (Claude Code keeps 30 days by default). `improve-my-harness` tells you how much history is available, but never changes your retention settings.

## How it compares

- **Session viewers and usage analyzers** show what happened. `improve-my-harness` maps what happened to *the piece of your harness that should change*.
- **Plugin and skill eval tools** test a piece in a clean, isolated workspace. `improve-my-harness` looks at your *real* harness, in your *real* sessions.
- **Setup recommenders** suggest skills and hooks from your project. `improve-my-harness` suggests changes from what actually went wrong — and checks whether they helped.

## Roadmap

### Supported agents

- [x] Claude Code
- [ ] Codex ([#3](https://github.com/guilhermebkel/improve-my-harness/issues/3))
- [ ] Cursor ([#4](https://github.com/guilhermebkel/improve-my-harness/issues/4))

### Features

- [ ] **v1 — Insights:** history analysis, harness inventory, classified findings, suggestions, before/after comparison.
- [ ] **v2 — Bench** ([#2](https://github.com/guilhermebkel/improve-my-harness/issues/2)): prove a suggestion before adopting it. Replay tasks from your sessions or past PRs with different models, reasoning effort, subagents or harness pieces; filter by tests; blind human review with a calibrated LLM judge; recommend the **cheapest configuration that still does the job**.
- [ ] **Cross-agent comparison:** when you use more than one agent on the same project, compare which harness fails less on similar tasks.
- [ ] **Team mode:** aggregate sessions across a team.
- [ ] **Scheduled runs:** periodic analysis that opens a PR with suggested changes for human review.

## Background

This project applies the ideas behind *Test-Driven Prompting* (CBSoft 2026): define what success looks like first, then choose the prompt, model and harness that meet it at the lowest cost.

## Contributing

Issues and PRs are welcome. For larger changes, please open an issue first to discuss the approach. Adding support for a new agentic tool (a provider) means a new `src/Providers/<Provider>/` folder whose adapter extends `BaseProviderAdapter`, one entry in `ProviderModule`, and one CI workflow; [`docs/adding-a-provider.md`](docs/adding-a-provider.md) walks through it.

### Development

```bash
pnpm install
pnpm test         # tests next to the code, end to end on synthetic transcripts
pnpm lint         # ESLint (typescript-eslint + stylistic); see docs/code-standards.md and docs/test-standards.md
pnpm build        # bundles src/ into dist/imh.mjs (committed by the Release workflow, so the plugin needs no install step)
pnpm check        # typecheck + lint + quality + tests + a build to a scratch file
```

The skill calls the bundled script; you can also run it directly:

```bash
node dist/imh.mjs analyze --project /path/to/repo --since 14d --pretty
node dist/imh.mjs --help
```

Vocabulary is in [`GLOSSARY.md`](GLOSSARY.md) and design decisions in [`docs/adr/`](docs/adr/).

Layout: `src/Providers/<Provider>/` reads one tool's sessions and harness into the shared model; `src/Shared/` (commands, services, protocols, utils) extracts signals, usage and before/after without knowing which tool produced them; `skills/improve-my-harness/` is what the agent reads. Before committing, run `pnpm check` (lint, typecheck, tests, build).

## License

MIT
