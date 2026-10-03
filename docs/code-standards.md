# Code standards

How code in this repository is written. `pnpm lint` enforces the rules marked **(lint)**; the rest are checked in review. When a rule and readability disagree, raise it in the PR instead of working around the rule.

## Architecture

The layout and its reasons are in ADR 0008.

- **Providers and Shared (lint).** Code that knows a provider (its paths, file formats, tool names, prompt tags, env variables) lives in `src/Providers/<Provider>/`. Everything else lives in `src/Shared/` and knows no provider. `src/Shared/` never imports from `src/Providers/`; the one exception is `Shared/Modules/ProviderModule.ts`, which creates a provider by type. A provider never imports another provider. When shared code needs something only a provider knows, add it to the shared model and let the adapter fill it in (as with a tool call's `category`), or add a method to `BaseProviderAdapter`.
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
- **Small functions (lint).** A function's cognitive complexity stays at 15 or below (`sonarjs/cognitive-complexity`, SonarSource's default), blocks nest at most 3 deep (`max-depth`) and a function takes at most 5 parameters (`max-params`; group the rest in an options object). When a function grows past that, extract the body of a loop or a branch into a named private method rather than raising the limit. Lint also rejects identical functions, duplicated branches and collapsible `if`s.
- **Name a call before passing it on (lint).** A call passed as an argument to another call, directly or with `...`, stays simple: if it takes three or more arguments or receives another call, store its result in a named variable first. `set.add(keyOf(call))` is fine; `push(this.piece(permissions, path, scope))` and `first(asRecord(parseJson(text)))` are not.
- **Tests follow the same rules (lint).** Tests and fixtures get no exemption from complexity, nesting, parameters, nested calls or duplication. The only exemptions are for format: magic numbers, the key spelling of external formats and `!` (non-null).
- **No nested ternaries (lint).** A ternary holds one simple condition. Anything more becomes a named variable or an `if` block.
- **Name intermediate steps.** Complex conditions go into a named boolean (`const isAfterChange = …`). Long chains are broken into named steps that say what each result is.
- **One responsibility per function, and the name says it.** A function named `readX` doesn't write; a function named `findX` doesn't create. No hidden side effects.
- **No mutable default parameters.** A default that is an array, object or `Map` is never mutated inside the function.
- **No duplicated logic.** Search before adding a helper; reuse or extract to a Util in `src/Shared/Utils/` (or the provider's `Utils/`) instead of reimplementing. Only flag duplication you can point to.
- **No `console` (lint).** Output goes through the CLI's single writer (`process.stdout` / `process.stderr` in `CLIModule`).
- **Floating promises (lint).** Every promise is awaited or explicitly returned.

## Boundaries and security

- **Environment variables (lint).** `process.env` is read only in `EnvUtil` (`src/Shared/Utils/EnvUtil.ts`). Which variables a provider reads is that provider's business (`ClaudeCodePathUtil`).
- **Validate at the edge.** Input is checked where it enters: CLI arguments in `CLIModule`, JSON from stdin or files in the service that parses it (`SuggestionService.parse`), transcript lines in the provider adapter. Code past the edge trusts its types.
- **Redact on the way out.** Every string that can reach output passes through `redact()` or `excerpt()`, which mask secrets and show the home folder (and the user name in it) as `~`. Hook commands and MCP configs keep names and shapes only, never env values, headers or arguments (ADR 0007). Any new output path gets a test with a fake secret.
- **Parse defensively.** Transcript formats are internal and change between agent versions. A bad or unknown line is counted, never thrown; a missing field degrades the result and marks it partial, never crashes the run.
- **Never write outside `.imh/`.** The script only writes to the data directory. Applying changes to the harness is the skill's job, after confirmation.

## Before committing

Commit once per task, not per file: make all the edits, then verify once. Before the commit, `pnpm lint`, `pnpm typecheck` (tsc), `pnpm quality` and `pnpm test` must pass, and `dist/` must be rebuilt with `pnpm build`. `pnpm check` runs all of this and fails on a stale `dist/`; CI runs the same. `pnpm quality` runs knip (unused files, exports and dependencies; `knip.json`) and jscpd (code duplicated across files in `src/` and `scripts/`, tests and fixtures included; `.jscpd.json`). A finding there means delete the dead code or extract the shared part, not add an ignore. While iterating, run only the relevant test or file (`pnpm exec vitest run <file>`).

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
- **Comments explain why, never what.** A comment earns its place when the reason isn't visible in the code: a hidden constraint, a format quirk of an agent's transcript, a deliberate deviation. If removing it wouldn't confuse a reader, delete it.
