# Code standards

How code in this repository is written. `pnpm lint` enforces the rules marked **(lint)**; the rest are checked in review. When a rule and readability disagree, raise it in the PR instead of working around the rule.

## Naming

- **Casing (lint).** Variables, functions and parameters are `camelCase`. Types, interfaces and classes are `PascalCase`. Module-level constants are `UPPER_CASE` (`DEFAULT_PRICES`, `MAX_EXCERPT_CHARS`). Constants inside a function are `camelCase`.
- **Descriptive names (lint).** No single-letter identifiers, including loop indexes and callback parameters: `(session) => …`, not `(s) => …`; `index`, not `i`. A name says what the value is in this domain: `transcript`, `signal`, `piece`, never `data`, `item`, `value` or `obj` when something more specific exists.
- **Booleans (lint).** Variables, parameters and properties of type `boolean` start with `is`, `has`, `should`, `can`, `must`, `was` or `did`: `isPartial`, `hasChanged`, `shouldSkipCache`. Names are affirmative: `isFilled`, never `isNotEmpty`; negate at the call site.
- **Maps and records.** Name lookups as `keyToValue`: `threadIdToMessages`, `signalIdToSuggestion`, `toolCallIdToPieces`.
- **Units.** A number with a unit carries it in the name: `idleMs`, `contentChars`, `approxTokens`, `maxBytes`, `activeMinutes`, `usd`.
- **Points in time.** ISO strings end in `At` (`createdAt`, `firstSeenAt`). Epoch milliseconds end in `AtMs` (`startedAtMs`). A bare `Ms` suffix is always a duration (`activeMs`), never a timestamp.
- **Plurals.** Use correct English plurals (`indices`, `entries`, `summaries`).
- **English everywhere.** Identifiers, comments, docs and error messages are in English.

## TypeScript

- **No `any` (lint).** Data from outside the program (transcripts, settings files, stdin, git output) is `unknown` and is narrowed with the helpers in `src/core/guards.ts` (`asRecord`, `asString`, `asNumber`, `asArray`) before use.
- **No vague types for known shapes.** Don't type a field as `object`, `Record<string, unknown>` or `string` when its shape or its set of values is known. Declare the shape, or a union of string literals.
- **Exhaustive unions (lint).** A `switch` over a union handles every member; add `default: return assertNever(value)` when the switch must stay exhaustive as the union grows. Prefer a `Record<Union, …>` map, which the compiler checks for completeness.
- **Reuse types.** Before declaring a type, look for an existing one with the same or a larger shape and derive from it (`Pick`, `Omit`, `Partial`, `&`, `Extract`). Two types with copied fields are a bug waiting to happen.
- **One member per line (lint, partly).** Type literals and interfaces with more than one member are written one member per line. Lint forces the braces onto their own lines; review checks the rest.
- **Types next to the code that owns them.** The shared model lives in `src/core/types.ts`; types used by a single module stay in that module.

## Logic

- **Braces always (lint).** `if`, `else`, `for` and `while` always have a block, even for a single `return` or `continue`.
- **No magic numbers (lint).** Every number other than `0`, `1` and `-1` is a named constant with its unit: `const MAX_EXCERPT_CHARS = 200`. Thresholds that a user could reasonably want to tune belong in `.imh/config.json` (`src/state/config.ts`), not in code. Tests are exempt.
- **Maps over branching on a type.** When logic branches on a kind, type or slug, use a `Record<Kind, Handler>` instead of an `if`/`else` chain, so a new kind is a compile error until it's handled.
- **No nested ternaries (lint).** A ternary holds one simple condition. Anything more becomes a named variable or an `if` block.
- **Name intermediate steps.** Complex conditions go into a named boolean (`const isAfterChange = …`). Long chains are broken into named steps that say what each result is.
- **One responsibility per function, and the name says it.** A function named `readX` doesn't write; a function named `findX` doesn't create. No hidden side effects.
- **No mutable default parameters.** A default that is an array, object or `Map` is never mutated inside the function.
- **No duplicated logic.** Search before adding a helper; reuse or extract to `src/core/` instead of reimplementing. Only flag duplication you can point to.
- **No `console` (lint).** Output goes through the CLI's single writer (`process.stdout` / `process.stderr` in `src/cli.ts`).
- **Floating promises (lint).** Every promise is awaited or explicitly returned.

## Boundaries and security

- **Environment variables (lint).** `process.env` is read only in `src/core/env.ts`. Everything else asks that module.
- **Validate at the edge.** Input is checked where it enters: CLI arguments in `src/cli.ts`, JSON from stdin or files in the command that reads it, transcript lines in the adapter. Code past the edge trusts its types.
- **Redact on the way out.** Every string that can reach output passes through `redact()` or `excerpt()`. Hook commands and MCP configs keep names and shapes only, never env values, headers or arguments (ADR 0007). Any new output path gets a test with a fake secret.
- **Parse defensively.** Transcript formats are internal and change between agent versions. A bad or unknown line is counted, never thrown; a missing field degrades the result and marks it partial, never crashes the run.
- **Never write outside `.imh/`.** The script only writes to the data directory. Applying changes to the harness is the skill's job, after confirmation.

## Dependencies

- **pnpm only (ADR 0004).** Commit `pnpm-lock.yaml`; never commit `package-lock.json`.
- **The lockfile changes only with `package.json`.** A diff that touches `pnpm-lock.yaml` without `package.json` is accidental. Check with:

  ```bash
  git diff --name-only "$(git merge-base HEAD origin/master)" | grep -E "package\.json|pnpm-lock\.yaml"
  ```

- **No runtime dependencies.** Runtime code uses Node built-ins only. Dev dependencies are fine.
- **Rebuild `dist/` in the same commit** as any change to `src/` (`pnpm check` fails otherwise).

## Tests

- Test behavior through the highest seam: the command functions in `src/commands.ts`, on transcripts built by `test/helpers/fixture.ts` in the agent's real format. Test a lower module directly only for logic with many cases (normalization, redaction).
- Each new signal, format case or output path gets a fixture and a test, including a fake secret where output is involved.
- Tests may use literal numbers and may read `process.env`. Fixtures write external formats (settings files, env blocks), so their object keys keep those formats' spelling.

## Formatting and comments

- **Formatting (lint).** ESLint Stylistic formats the code: 2-space indent, double quotes, semicolons, trailing commas in multi-line literals, lines up to 120 characters. `pnpm lint:fix` applies it.
- **No alignment (lint).** Never add spaces to align values into columns: it makes every future change a noisy diff.
- **Comments explain why, never what.** A comment earns its place when the reason isn't visible in the code: a hidden constraint, a format quirk of an agent's transcript, a deliberate deviation. If removing it wouldn't confuse a reader, delete it.
