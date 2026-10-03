# Deterministic checks to suggest

Read this when `checks.missing` is not empty and the evidence below shows the cost of not having the check, or when a suggestion is about the validation stage. A deterministic check (a linter rule, a dead-code or duplication scan) gives the same answer every time and fails loudly; an instruction in text is followed only sometimes.

Checked in October 2026. Before recommending a tool, confirm it still exists and supports the project's language version.

## Only with evidence

`checks` says what the project has and what's missing; it isn't a finding by itself. Suggest a check only when at least one of these holds, and cite it:

- **Corrections about code quality** in `user_correction` excerpts: "simplify", "it's duplicated", "this isn't used", "extract it into a function", "too complex" (in any language the person writes). The excerpt is the evidence; the cost is the signal's.
- **Fix loops**: a `failed_command` on a lint, type, test or build command with `details.chains.fixLoops`, or a `repeated_workflow` in the validation stage. `cost.fixLoop` is what the loop took. A script the agent reruns after fixing it (`python3 report.py`) is ordinary work, not evidence.
- **No checks at all** for a language with many edits (`checks.languages`) and every core category in `checks.missing` for it. Weakest evidence: suggest once, as part of the validation stage, not as its own top finding.

## What to suggest, by language

Prefer turning on a rule in a linter the project already has (`checks.tools`) over adding a tool.

| Language | Complexity | Dead code | Duplication |
| --- | --- | --- | --- |
| JavaScript / TypeScript | ESLint `complexity`, or `eslint-plugin-sonarjs` (`cognitive-complexity`, limit 15) | knip | jscpd |
| Python | ruff `C901` (`max-complexity`), or xenon over radon | vulture | jscpd |
| Go | golangci-lint `gocognit` or `cyclop` | golangci-lint `unused` | golangci-lint `dupl`, or jscpd |
| Other | lizard (many languages) | the language's own linter | jscpd |

Beyond the core categories, these fit only with specific evidence. Many have error messages the script already captures in `failed_command` and `tool_error`:

| Evidence in the sessions | Suggest | Runs |
| --- | --- | --- |
| `Cannot access 'X' before initialization`, an import that arrives `undefined`, a circular dependency warning from the bundler | dpdm (`-T` ignores `import type`); skott or rev-dep in very large codebases | before commit |
| Corrections about importing from the wrong layer, or a layer rule in the instructions the agent keeps breaking | `no-restricted-imports` when ESLint exists; eslint-plugin-boundaries or dependency-cruiser otherwise | hook on the edited file |
| `checks.isMonorepo` and version-mismatch errors (a duplicated React's `Invalid hook call`) | sherif; syncpack for rules per group | before commit |
| `checks.isPublishedPackage` and `ERR_PACKAGE_PATH_NOT_EXPORTED`, `Could not find a declaration file`, ESM/CJS errors | publint and @arethetypeswrong/cli | after the build, on release |
| No knip, jscpd or sonarjs and the person prefers one tool | fallow (dead code, duplication, complexity and cycles in one binary) | before commit |

Vulnerability scans (osv-scanner, audit-ci) rarely show up as friction in sessions: mention them only in "Starting a harness", as an option.

## How to set it up

1. **Start at today's worst case.** Run the check, set the limit at the current worst value, and lower it over time. A limit that fails on day one gets disabled.
2. **By latency.** The edited file in a hook that runs after each edit (a fraction of a second: one linter call on one file); the whole project (dead code, duplication, cycles) in the check the agent runs before committing; the package only on release.
3. **Tell the agent what to do on failure.** One line in the instructions: "When a check fails, fix the code; never raise a limit or add an ignore."
4. **Fit the machine** (rule 9): the hook command must run on `environment.platforms`.

## In the report

One suggestion, class "Change the structure", stage Validation, with the cost of the evidence it would have saved: the fix loops' `cost.fixLoop`, or the corrections' cost (an upper bound: say "at most"). Write the exact config change (the rule and its limit, the hook entry, the script line) in **Change**, and name what's already there from `checks.tools` so the person sees it's an addition, not a rewrite.
