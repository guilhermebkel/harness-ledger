# Cost model

How the script turns transcripts into time, tokens and money for each signal and for the totals. The reasons behind these choices are in ADR 0009; the terms are in `GLOSSARY.md`. When a cost changes in code, this file changes in the same commit.

Every signal carries `cost.method` (one sentence from this table) and `cost.bound`: `lower` means the real cost is at least this, `upper` at most this, `estimate` about this. The skill writes "at least", "at most" or "about" from it.

## Common rules

- **Active time.** Time between consecutive events (messages, calls, results), skipping gaps longer than `idleMinutes` (default 5): the person was away. Events from every thread in the window count, so a subagent working while the main thread waits is time spent.
- **Tokens.** Each assistant message's usage, counted once even when the provider repeats it on several lines. Input tokens include cache reads and writes.
- **Money.** Tokens times the price table (`CostService.DEFAULT_PRICES`, overridable in `.imh/config.json`). Cache reads and writes use their own prices. Models outside the table are unpriced: their tokens count and their cost is 0 (`totals.unpricedModels`).
- **Nothing twice.** Failure chains run first; a corrected turn leaves out the messages a chain or a rejected plan already counted.

## Per signal

| Signal | Time | Tokens | Bound |
| --- | --- | --- | --- |
| `failed_command`, `tool_error`, `permission_denied`, `hook_blocked` | Failure chain: from the first failed call until the call that worked was issued (its own run is not waste); unrecovered chains end at the reaction to the last failure | Every message in that window except the one that issued the first failure | estimate |
| `api_error` | From the failed request until the thread got a real answer | None (failed requests aren't billed) | estimate |
| `repeated_read`, `subagent_reread` | The re-read's own duration | The re-read content, as input, once | lower: the content also stays in context afterwards |
| `context_compaction` | Duration of the re-reads after it | Re-reads, after it, of files the thread had read before it | lower: the summary itself isn't counted |
| `repeated_workflow` | Each run's window, from the first step to the last result, minus the steps' own runs | Every message in the window except the one that issued the first step (a script still takes one call) | estimate |
| `context_heavy` | None | Each load, plus its carry: the load's tokens as cached input on every later message of the thread until a compaction | estimate |
| `large_piece` | None | The piece's size as cached input times the messages that carried it: every message for instructions, the agent's messages for an agent, messages after its first use in a thread for a skill | estimate |
| `user_correction`, `interruption` | The turn before the correction or interruption, all threads | Every message of every thread in that turn, minus messages already counted | upper: the turn may have done useful work too |
| `user_correction` from a rejected plan | From the turn's prompt (or the previous rejection) until the rejection | Every message in that window | upper |
| `repeated_request`, `unused_piece` | None | None | no clear counterfactual to price |

### Failure chains

A chain starts at a failed call (not an interruption or a rejection) and follows the same thread:

- A later call does **the same job** when it is the same tool on the same file, or, for shell commands, the same command, or another one in the same stage (`npm test` → `pnpm test`), or the same program when the stage is unknown. Looking around (`ls`, `cat`) is skipped.
- A failure doing the same job joins the chain; a success doing it ends the chain as recovered.
- The chain closes unrecovered when the agent moves on (other work of the same kind, such as another command), after 10 attempts, or when the next attempt is more than 10 calls or `idleMinutes` away.
- Kinds: `wrong_command` (another command worked), `fix_loop` (the identical command passed after changes), `retry` (a non-shell tool worked on the same target), `unrecovered`.
- The chain's cost is shared equally by its failures, which may belong to different signals. The first failure's signal gets `details.chains` (`chains`, `recovered`, `attempts`, `fixLoops`); `recoveredWith` lists the commands that worked in `wrong_command` chains.
- `cost.fixLoop` is the part of a signal's cost from fix loops.

## Totals

`totals` in the analysis; the categories don't overlap.

| Total | Signals |
| --- | --- |
| `lostToFailures` | Failure chains and API errors, without fix loops |
| `inFixLoops` | The fix-loop part of failure chains: rerunning a check after fixing the code. Work, not waste, but the share a deterministic check in a hook could shorten |
| `lostToRereads` | `repeated_read`, `subagent_reread`, `context_compaction` |
| `inCorrectedOrInterruptedTurns` | `user_correction`, `interruption` (upper bound) |

`context_heavy`, `large_piece` and `repeated_workflow` stay out of the totals: they price what a structure change would save, not something lost.

## Before and after

`compare` reports per piece: error rate, corrections per session, active minutes, input and output tokens, money per invocation, and `recoveryMinutesPerInvocation` (time in failure chains). Corrections and chains count only when the piece was running (its turn, or the failing call); global pieces (instructions, hooks, settings) answer for all of them. Token and recovery moves are reported but don't vote in the verdict: tokens are already in money, recovery time is already in active time.
