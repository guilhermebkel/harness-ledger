# Code standards

How code in this repository is written. `pnpm lint` enforces the rules marked **(lint)**; the rest are checked in review. When a rule and readability disagree, raise it in the PR instead of working around the rule.

## Architecture

The layout and its reasons are in ADR 0008.

- **Providers and Shared (lint).** Code that knows a provider (its paths, file formats, tool names, prompt tags, env variables) lives in `src/Providers/<Provider>/`. Everything else lives in `src/Shared/` and knows no provider. `src/Shared/` never imports from `src/Providers/`; the one exception is `Shared/Modules/ProviderModule.ts`, which creates a provider by type. A provider never imports another provider. When shared code needs something only a provider knows, add it to the shared model and let the adapter fill it in (as with a tool call's `category`), or add a method to `BaseProviderAdapter`.
- **Layers (lint).** Inside `src/Shared/` and each provider, folders form layers and a layer imports only the ones below it: `Protocols` (types) < `Utils` < `Services` and `Adapters` < `Commands` < `Modules`. The one exception is `Shared/Services/ContextService.ts`, which reaches `ProviderModule` to create the provider (ADR 0008). Tests may import any layer: nothing imports them. Import cycles fail `pnpm quality` (dpdm, `import type` ignored).
- **Imports use `@/` (lint).** `@/` points to `src/` (tsconfig `paths`, read by tsc, esbuild and Vitest). Import across folders as `@/Shared/Utils/TimeUtil.js`, never with `../`. Files in the same folder use `./`. Keep the `.js` extension.
- **Same folders on both sides.** `Adapters/` (provider contract and implementations), `Commands/` (one class per CLI command, Shared only), `Modules/` (CLI and provider factory, Shared only), `Services/` (business rules), `Protocols/` (types only), `Utils/` (helpers). A provider repeats the folders it needs.
- **Names say the folder.** Files are `PascalCase` and end in their role: `ClaudeCodeProviderAdapter`, `SignalService`, `AnalyzeCommand`, `SessionProtocol`, `TimeUtil`. Provider files start with the provider's name.
- **Classes, not loose functions.** Utils are classes with static methods only. Services are classes whose dependencies come in through the constructor. Commands are classes with a `run` method (or one method per subcommand). Runtime constants belong to the class that owns them as `static readonly` members (`SessionUtil.MAIN_THREAD_ID`); module-private constants can stay at module level.
- **Protocols hold only types.** No values, no functions. A type used by one file stays in that file.

## Naming

- **Casing (lint).** Variables, functions and parameters are `camelCase`. Types, interfaces and classes are `PascalCase`. Module-level constants and `static readonly` class constants are `UPPER_CASE` (`MAX_EXCERPT_CHARS`, `CostService.DEFAULT_PRICES`). Constants inside a function are `camelCase`.
- **Descriptive names (lint).** No single-letter identifiers, including loop indexes and callback parameters: `(session) => …`, not `(s) => …`; `index`, not `i`. A name says what the value is in this domain: `transcript`, `signal`, `piece`, never `data`, `item`, `value` or `obj` when something more specific exists.
- **Booleans (lint).** Variables, parameters and properties of type `boolean` start with `is`, `has`, `should`, `can`, `must`, `was` or `did`: `isPartial`, `hasChanged`, `shouldSkipCache`. Names are affirmative: `isFilled`, never `isNotEmpty`; negate at the call site.
- **Maps and records.** Name lookups as `keyToValue`: `threadIdToMessages`, `signalIdToSuggestion`, `toolCallIdToPieces`.
- **Units.** A number with a unit carries it in the name: `idleMs`, `contentChars`, `approxTokens`, `maxBytes`, `activeMinutes`, `usd`.
- **Points in time.** ISO strings end in `At` (`createdAt`, `firstSeenAt`). Epoch milliseconds end in `AtMs` (`startedAtMs`). A bare `Ms` suffix is always a duration (`activeMs`), never a timestamp.
- **Plurals.** Use correct English plurals (`indices`, `entries`, `summaries`).
- **English everywhere.** Identifiers, comments, docs and error messages are in English.

## TypeScript

- **No `any` (lint).** Data from outside the program (transcripts, settings files, stdin, git output) is `unknown` and is narrowed with `GuardUtil` (`asRecord`, `asString`, `asNumber`, `asArray`) before use.
- **No vague types for known shapes.** Don't type a field as `object`, `Record<string, unknown>` or `string` when its shape or its set of values is known. Declare the shape, or a union of string literals.
- **Exhaustive unions (lint).** A `switch` over a union handles every member; add `default: return assertNever(value)` when the switch must stay exhaustive as the union grows. Prefer a `Record<Union, …>` map, which the compiler checks for completeness.
- **Reuse types.** Before declaring a type, look for an existing one with the same or a larger shape and derive from it (`Pick`, `Omit`, `Partial`, `&`, `Extract`). Two types with copied fields are a bug waiting to happen.
- **One member per line (lint, partly).** Type literals and interfaces with more than one member are written one member per line. Lint forces the braces onto their own lines; review checks the rest.
- **Types next to the code that owns them.** The shared model lives in `src/Shared/Protocols/`; a provider's own types live in its `Protocols/` folder; types used by a single file stay in that file.

## Logic

- **Braces always (lint).** `if`, `else`, `for` and `while` always have a block, even for a single `return` or `continue`.
- **No magic numbers (lint).** Every number other than `0`, `1` and `-1` is a named constant with its unit: `const MAX_EXCERPT_CHARS = 200`. Thresholds that a user could reasonably want to tune belong in `.imh/config.json` (`ConfigService`), not in code. Tests are exempt.
- **Maps over branching on a type.** When logic branches on a kind, type or slug, use a `Record<Kind, Handler>` instead of an `if`/`else` chain, so a new kind is a compile error until it's handled.
- **Small functions (lint).** A function's cognitive complexity stays at 15 or below (`sonarjs/cognitive-complexity`, SonarSource's default), blocks nest at most 3 deep (`max-depth`) and a function takes at most 5 parameters (`max-params`; group the rest in an options object). When a function grows past that, extract the body of a loop or a branch into a named private method rather than raising the limit. Lint also rejects identical functions, duplicated branches, collapsible `if`s, expressions with more than three `&&`, `||` or ternary operators, template literals inside template literals, functions nested more than four deep, a `switch` inside a `switch`, and assignments or `++`/`--` inside expressions.
- **Name a call before passing it on (lint).** A call passed as an argument to another call, directly or with `...`, stays simple: if it takes three or more arguments or receives another call, store its result in a named variable first. `set.add(keyOf(call))` is fine; `push(this.piece(permissions, path, scope))` and `first(asRecord(parseJson(text)))` are not.
- **Safe regular expressions (lint).** A regex must not backtrack super-linearly (`sonarjs/super-linear-regex`): bound repetitions that sit next to each other (`[\w.-]{0,40}`) or replace the regex with string methods (`trimEnd()`, `indexOf`). Keep each one simple (`regex-complexity` ≤ 20, no duplicated characters in a class, `\w` over `[A-Za-z0-9_]`); a long list of alternatives is a named array joined into a `RegExp`.
- **Explicit order and branches (lint).** `sort()` takes a comparator; for strings in code-unit order use `CollectionUtil.compareCodeUnits`, which keeps ids and hashes stable. `reverse()` works on a copy. Every `else if` chain ends in `else`, or the branches become independent `if`s. A loop has at most one `break` or `continue`; more means a helper method. A function returns one type.
- **Names and literals (lint).** Functions and object methods are `camelCase` (snake_case ids stay as data, not as function names). A string literal repeated three times becomes a constant. Shorthand properties are grouped at the start or the end of an object.
- **Tests follow the same rules (lint).** Tests and fixtures get no exemption from complexity, nesting, parameters, nested calls or duplication. The only exemptions are for format: magic numbers, the key spelling of external formats and `!` (non-null).
- **No nested ternaries (lint).** A ternary holds one simple condition. Anything more becomes a named variable or an `if` block.
- **Name intermediate steps.** Complex conditions go into a named boolean (`const isAfterChange = …`). Long chains are broken into named steps that say what each result is.
- **One responsibility per function, and the name says it.** A function named `readX` doesn't write; a function named `findX` doesn't create. No hidden side effects.
- **No mutable default parameters.** A default that is an array, object or `Map` is never mutated inside the function.
- **No duplicated logic.** Search before adding a helper; reuse or extract to a Util in `src/Shared/Utils/` (or the provider's `Utils/`) instead of reimplementing. Only flag duplication you can point to.
- **Unmapped values stay visible.** When a mapping has no entry for a value (a file extension with no language, a model with no price, a dependency outside the check catalog, an unresolved subagent type), the script never drops the value and never guesses: it returns the raw value, redacted, marked as unmapped (`unpricedModels`, `agent:unknown`), and marks the result built on that mapping as partial, with the reason, the way signals use `isPartial`. A conclusion like "no complexity check" is only stated when nothing unmapped could contradict it. The skill may interpret an unmapped value's meaning (that `.ex` is Elixir, that a package is a linter), searching the web if needed, but never turns it into a number: a missing figure such as a price becomes a proposed entry in `.imh/config.json` with its source, the person confirms it, and the script recomputes (ADR 0002).
- **No `console` (lint).** Output goes through the CLI's single writer (`process.stdout` / `process.stderr` in `CLIModule`).
- **Floating promises (lint).** Every promise is awaited or explicitly returned.

## Boundaries and security

- **Environment variables (lint).** `process.env` is read only in `EnvUtil` (`src/Shared/Utils/EnvUtil.ts`). Which variables a provider reads is that provider's business (`ClaudeCodePathUtil`).
- **Validate at the edge.** Input is checked where it enters: CLI arguments in `CLIModule`, JSON from stdin or files in the service that parses it (`SuggestionService.parse`), transcript lines in the provider adapter. Code past the edge trusts its types.
- **Redact on the way out.** Every string that can reach output passes through `redact()` or `excerpt()`, which mask secrets and show the home folder (and the user name in it) as `~`. Hook commands and MCP configs keep names and shapes only, never env values, headers or arguments (ADR 0007). Any new output path gets a test with a fake secret.
- **Parse defensively.** Transcript formats are internal and change between agent versions. A bad or unknown line is counted, never thrown; a missing field degrades the result and marks it partial, never crashes the run.
- **Never write outside `.imh/`.** The script only writes to the data directory. Applying changes to the harness is the skill's job, after confirmation.

## Before committing

Commit once per task, not per file: make all the edits, then verify once. Before the commit, `pnpm lint`, `pnpm typecheck` (tsc), `pnpm quality` and `pnpm test` must pass, and `dist/` must be rebuilt with `pnpm build`. `pnpm check` runs all of this and fails on a stale `dist/`; CI runs the same. `pnpm quality` runs knip (unused files, exports and dependencies; `knip.json`), dpdm (import cycles) and jscpd (code duplicated across files in `src/` and `scripts/`, tests and fixtures included; `.jscpd.json`). A finding there means delete the dead code or extract the shared part, not add an ignore. While iterating, run only the relevant test or file (`pnpm exec vitest run <file>`).

## Dependencies

- **pnpm only (ADR 0004).** Commit `pnpm-lock.yaml`; never commit `package-lock.json`.
- **The lockfile changes only with `package.json`.** A diff that touches `pnpm-lock.yaml` without `package.json` is accidental. Check with:

  ```bash
  git diff --name-only "$(git merge-base HEAD origin/master)" | grep -E "package\.json|pnpm-lock\.yaml"
  ```

- **No runtime dependencies.** Runtime code uses Node built-ins only. Dev dependencies are fine.
- **Rebuild `dist/` in the same commit** as any change to `src/` (`pnpm check` fails otherwise).

## Tests

- **Next to the code (ADR 0008).** A test lives beside the file it tests and shares its name: `ClaudeCodeProviderAdapter.ts` → `ClaudeCodeProviderAdapter.test.ts`. There is no `test/` folder.
- Test behavior through the highest seam: the command classes in `src/Shared/Commands/` end to end, and each provider's adapter. Test a lower module directly only for logic with many cases (normalization, redaction, time).
- A provider's fixture builds its real on-disk format and lives in that provider's `Utils/` (`ClaudeCodeFixtureUtil`). Command tests use it, which is why test files may import a provider.
- Each new signal, format case or output path gets a fixture and a test, including a fake secret where output is involved.
- Tests and fixtures may use literal numbers and non-null assertions, and may read `process.env`. Fixtures write external formats (settings files, env blocks), so their object keys keep those formats' spelling.

## Formatting and comments

- **Formatting (lint).** ESLint Stylistic formats the code: 2-space indent, double quotes, semicolons, trailing commas in multi-line literals, lines up to 120 characters. `pnpm lint:fix` applies it.
- **No alignment (lint).** Never add spaces to align values into columns: it makes every future change a noisy diff.
- **No comments by default (lint).** Code carries no comments. A comment stays only when the code guards a rule it doesn't show and someone could change it without knowing, breaking something later: a quirk of a provider's transcript format, a security rule (ADR 0007), a limit calibrated on real sessions, an order that matters. Such a comment starts with `Why:` and names the rule (`// Why: Claude Code repeats the message's usage on every content-block line.`). Lint rejects any other comment except tool directives (`eslint-disable`, `@ts-expect-error`); consecutive `//` lines count as one comment. Descriptions of what a function or field does, section labels and usage notes don't stay: the names and the docs carry them.
