# Findings: classes, rules and report format

## Classes

Every finding gets exactly one class. The class decides the kind of fix.

| Class (id) | When | Fix |
| --- | --- | --- |
| **Rule exists, but is ignored** (`rule_ignored`) | The harness already has the instruction (see `details.mentions`, or you found it reading the piece), and the agent still does the wrong thing. | Enforce it deterministically: a `PreToolUse` hook that blocks or rewrites the command, a script the agent calls, a permission rule, or a check. Don't add more text to the same instruction. |
| **Partial or outdated instruction** (`partial_instruction`) | The instruction exists but is incomplete, ambiguous, or contradicts the repo as it is now. | Fix the text in the piece where it lives. Quote the current line and the proposed line. |
| **Missing instruction** (`missing_instruction`) | Nothing in the harness covers it. | Add it to the piece where it belongs: the subagent or skill that does the work, not the global instructions, unless it applies to every session. |
| **Structure change** (`structure_change`) | A pattern across sessions: the same request repeated (→ a skill or command), a fixed sequence of steps the agent rediscovers (→ a script), a subagent that needs context it never gets (→ change what's passed when delegating), a piece unused for the whole period (→ remove), or a large piece loaded every turn (→ move detail into a skill). | Describe the new piece or the removal; draft the new file when it's a skill, subagent or command. |
| **Out of scope** (`out_of_scope`) | The cause is in a piece the user doesn't control (a plugin, a built-in agent, managed settings) or outside the harness. | Recommendation only. Never edit it. |
| **Already handled** (`already_handled`) | The signal has a suggestion (`handled` is set, any status), or an open branch/PR already changes that piece for that reason. | List it with its status. Never suggest it again. |

### Typical mapping from signals

These are starting points, not rules; read the piece before deciding.

| Signal type | Usually |
| --- | --- |
| `failed_command` with `recoveredWith` and `mentions` | Rule exists, but is ignored |
| `failed_command` with `recoveredWith`, no mentions | Missing instruction, or a script/hook if it repeats a lot |
| `failed_command` / `tool_error` without recovery | Partial instruction, or out of scope if it's a tool/plugin problem |
| `permission_denied` | Missing instruction (the agent keeps trying something not allowed) or a permission rule the user may want; ask, never widen permissions on your own |
| `hook_blocked` | Rule exists, but is ignored — the hook works; the instruction or subagent should stop trying |
| `repeated_read` | Missing instruction in that subagent/skill, or a structure change (pass the content, or a script that extracts what's needed) |
| `subagent_reread` | Structure change: pass what the main thread already knows when delegating |
| `user_correction`, `interruption` | Read the excerpt: the class depends on what was corrected; attributed pieces are where the turn ran |
| `repeated_request` | Structure change: a skill or command (draft it) |
| `unused_piece` | Structure change: remove, or improve its description if it should have triggered. Partial when it was added during the period |
| `large_piece` | Structure change when `loadedEveryTurn` is true and the content is only needed sometimes |

## Rules

1. **Traceable.** Each finding cites its evidence as `session <first 8 chars of id> · line <n> · <thread>`. Show up to 3 and "+N more".
2. **Partial evidence is marked.** If the signal has `partial: true`, say why (from `partialReasons`) and don't claim the cause is certain. A single session is never enough for a structure change.
3. **No repeats.** Already-handled signals, and signals whose piece changed after the evidence, don't become new suggestions.
4. **Mandate only.** Only report what the evidence supports and what concerns the harness. Never include secret values, even partially.
5. **Self-contained text.** Text proposed for a subagent or skill describes the condition and the action in that piece's own terms. It never refers to who calls it, to another file's step numbers, or to this report.
6. **Coupling is a finding.** If a piece only works because another piece says something specific (a subagent that relies on the main instructions mentioning a path), report the coupling as a structure change.
7. **Cheapest adequate fix.** Prefer deleting or tightening over adding. Prefer a hook or script over a longer prompt. Prefer moving rarely-needed detail out of always-loaded instructions.

## Report format

```markdown
# Harness report — <YYYY-MM-DD>

Analyzed <N> sessions (<period>) · <K> suggestions · ~<active minutes> and ~$<usd> estimated lost to failures
History: <transcriptsAvailable> transcripts since <oldest>; retention <retentionDays> days.

## Suggestions

| # | Class | Piece | Problem | Estimated cost | Id |
| --- | --- | --- | --- | --- | --- |
| 1 | Rule exists, but is ignored | agent:test-runner | Runs `npm test` (fails), then `pnpm test` | ~38 min, ~$2.10 | sug-1a2b3c4d |

### 1. <title>
**Class:** … · **Piece:** `…` (`path`) · **Evidence:** session 3f2a91bc · line 14 · test-runner; … +4 more
**What happens:** one or two sentences, with the numbers from the script.
**Why this class:** one sentence (e.g. "CLAUDE.md line 3 already says to use pnpm").
**Change:** the exact text, diff, hook or file to add.
(**Partial:** reason — only when partial.)

## Already handled
- <title> — <status> (<id>)

## Changed since this evidence
- <piece> changed on <date>; <signal> may already be fixed. Run a comparison after a few sessions.

## Before/after
- <piece>: <verdict and key deltas>, only for pieces with an applied suggestion.

_Time and cost are estimates from transcript timestamps and token usage; idle time is excluded._
```

Leave out empty sections.
