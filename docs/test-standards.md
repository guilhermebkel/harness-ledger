# Test standards

How tests in this repository are written. `pnpm lint` enforces the rules marked **(lint)**, through `@vitest/eslint-plugin` and the rules in `docs/code-standards.md`, which apply to tests too; the rest are checked in review. A test exists to catch a specific break, so every rule here serves one of two questions: would this test fail if the code broke, and is it testing the real code?

Some ideas are adapted from `writing-good-tests` in [obra/superpowers](https://github.com/obra/superpowers) and `tdd` in [mattpocock/skills](https://github.com/mattpocock/skills) (both MIT).

## Where tests live

- **Next to the code (ADR 0008).** A test lives beside the file it tests and shares its name: `ClaudeCodeProviderAdapter.ts` → `ClaudeCodeProviderAdapter.test.ts`. There is no `test/` folder.
- **Through the highest seam.** Test behavior through the command classes in `src/Shared/Commands/`, end to end, and through each provider's adapter. Test a lower module directly only for logic with many cases (normalization, redaction, time, failure chains, costs).
- **Fixtures in the real format.** A provider's fixture builds its real on-disk format and lives in that provider's `Utils/` (`ClaudeCodeFixtureUtil`); command tests use it, which is why test files may import a provider. Shared services that need no files use `SessionFactsBuilder` (`src/Shared/Utils/SessionFactsBuilder.ts`).
- **Every new behavior brings its test.** Each new signal, format case or output path gets a fixture case and a test, including a fake secret where output is involved (`ClaudeCodeFixtureUtil.FAKE_SECRETS`).

## What a test checks

- **Name the break.** Before writing the body, name the change to the code that should make the test fail. If you can't name one, the test checks nothing. If only an intentional decision would fail it (a constant's value, the exact wording of a message), it is a change detector: test the behavior that depends on the decision instead. Not `expect(MAX_CHAIN_ATTEMPTS).toBe(10)`, but "an eleventh attempt starts a new chain".
- **Expected values come from outside the code.** Write them as literals worked out by hand from the fixture, never computed with the code under test, its helpers or its constants: those pass whatever the code does. Arithmetic that shows the derivation is fine: `toBe(3 * 1100)` is three messages of 1,100 tokens from the builder.
- **Exact assertions (lint).** Compare with `toStrictEqual` (it also catches extra `undefined` fields), not `toEqual`. No `toBeDefined`, `toBeTruthy` or `toBeFalsy`: assert the value itself. `toThrow` names the message (`toThrow("Invalid date or period")`) and calls are checked with their arguments (`toHaveBeenCalledWith`).
- **No vacuous passes.** An assertion that something never appears, or that every item has a property, passes on empty output too. First assert that there was something to check. The secret test checks that `[REDACTED]` is in the output before checking that no secret is.
- **One behavior per test, named by the behavior.** The name says what the code does for the person, in the domain's words (`GLOSSARY.md`): "leaves out excluded sessions", "counts a fix loop without calling the same command a recovery". It doesn't name the method or describe the implementation.

## Test code stays simple

Tests have no tests of their own, so a bug in test logic goes unnoticed.

- **No logic in the test body (lint).** No `if` or `try` deciding which assertion runs, no `expect` inside a condition. Cases that differ only in data are rows of `it.each`. A loop that builds input is fine, and so is a lookup helper outside the test that throws when what it looks for is missing (`signalById`).
- **Same rules as the code (lint).** Complexity, nesting, parameters, nested calls and duplication apply to tests and fixtures (`docs/code-standards.md`). The only exemptions are for format: magic numbers, the key spelling of external formats, `!` (non-null) and reading `process.env`.
- **Builders, with what matters spelled out.** Build input with the builders (`ClaudeCodeTranscriptBuilder`, `SessionFactsBuilder`), not with hand-written objects. Set every value the assertion depends on in the test itself, even when the builder has a default: if the cost depends on time passing, the test says `.wait(5)`.
- **Clean structure (lint).** No skipped or focused tests, no commented-out tests, no duplicated titles. Hooks sit at the top of their block, in order, and appear once.

## Real code, doubles only at the edges

- **Run the real thing.** Tests use real files in a temporary folder, the real parsers and the real services. Don't mock this repository's own modules (`vi.mock`): if a test needs that, the seam is wrong.
- **Doubles only where the process meets the outside.** `process.exit`, `process.stdout` and similar are replaced with `vi.spyOn` and restored in `afterEach` (`CLIModule.test.ts`). Assert what the code did with them, not that the double exists.
- **Fixtures mirror the real format completely.** A fixture line has every field a real transcript line has, not just the ones the code reads today. A partial fake passes while the real format breaks the parser. When a new format case shows up in real sessions, add it to the provider's fixture.
- **Time is an input.** Pass timestamps in (`nowAtMs`, the builder's `startedAt` and `wait`). Tests never depend on the clock or on `setTimeout`.
- **Production code has no test-only methods.** Setup and cleanup that only tests need live in the fixture utilities (`useHistoryFixture`, `useFixtureEnv`), not in the classes under test.

## Before finishing: the mutation check

Go through the code you changed and imagine the realistic mistakes:
- a wrong threshold or constant;
- the wrong branch;
- a missing `redact()`;
- an empty or default result;
- an off-by-one in a time window;
- something counted twice.

Some test should fail for each. When none would, the behavior is unprotected, or a test is tautological. Add or fix the test before committing.
