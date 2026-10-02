# Findings: classes, rules and report format

## Classes

Every finding gets exactly one class. The class decides the kind of fix.

| Class (id) | When | Fix |
| --- | --- | --- |
| **Rule exists, but is ignored** (`rule_ignored`) | The harness already has the instruction (see `details.mentions`, or you found it reading the piece), and the agent still does the wrong thing. | Enforce it deterministically: a `PreToolUse` hook that blocks or rewrites the command, a script the agent calls, a permission rule, or a check. Don't add more text to the same instruction. |
| **Partial or outdated instruction** (`partial_instruction`) | The instruction exists but is incomplete, ambiguous, or contradicts the repo as it is now. | Fix the text in the piece where it lives. Quote the current line and the proposed line. |
| **Missing instruction** (`missing_instruction`) | Nothing in the harness covers it. | Add it to the piece where it belongs: the subagent or skill that does the work, not the global instructions, unless it applies to every session. |
| **Structure change** (`structure_change`) | A pattern across sessions: the same request repeated (→ a skill or command), a fixed sequence of steps the agent rediscovers (→ a script, often inside a skill), work that outgrows the context window (→ subagents or a skill per stage), a subagent that needs context it never gets (→ change what's passed when delegating), a piece unused for the whole period (→ remove), or a large piece loaded every turn (→ move detail into a skill). | Describe the new piece or the removal; draft the new file when it's a skill, subagent or command. |
| **Out of scope** (`out_of_scope`) | The cause is in a piece the user doesn't control (a plugin, a built-in agent, managed settings) or outside the harness. | Recommendation only. Never edit it. |
| **Already handled** (`already_handled`) | The signal has a suggestion (`handledBy` is set, any status), or an open branch/PR already changes that piece for that reason. | List it with its status. Never suggest it again. |

### Typical mapping from signals

These are starting points, not rules; read the piece and what it loads (skill files, preloaded skills, instruction files for `main`) before deciding.

| Signal type | Usually |
| --- | --- |
| `failed_command` with `recoveredWith` and `mentions` | Rule exists, but is ignored |
| `failed_command` with `recoveredWith`, no mentions | Missing instruction, or a script/hook if it repeats a lot |
| `failed_command` / `tool_error` without recovery | Partial instruction, or out of scope if it's a tool/plugin problem |
| `permission_denied` | Missing instruction (the agent keeps trying something not allowed) or a permission rule the user may want; ask, never widen permissions on your own. `errors` holds the reason, e.g. the auto-mode classifier's category |
| `api_error` | Structure change: a model name that doesn't exist, expired credentials or a proxy failing. `details.models` names the model; check the `model:` of the attributed agent or the settings |
| `hook_blocked` | Rule exists, but is ignored — the hook works; the instruction or subagent should stop trying |
| `repeated_read` | Missing instruction in that subagent/skill, or a structure change (pass the content, or a script that extracts what's needed). One signal per agent; `details.files` lists the files it re-read |
| `subagent_reread` | Structure change: pass what the main thread already knows when delegating |
| `user_correction`, `interruption` | Read the excerpt: the class depends on what was corrected; attributed pieces are where the turn ran. Excerpts starting with `rejected` are calls the user turned down (often a plan), with their feedback |
| `repeated_request` | Structure change: a skill or command (draft it) |
| `repeated_workflow` | Structure change: the agent rebuilds the same procedure (`details.steps`) by hand. With no skill in `pieces`, draft a script that runs the steps plus a skill or command that calls it. With a skill in `pieces`, that skill leaves the steps to the agent: add the script to the skill's folder. If an existing skill already covers it but isn't in `pieces`, its description isn't triggering: fix the description |
| `context_compaction` | Structure change: the work doesn't fit one conversation (`details.maxContextTokens`, excerpts give the turns). Delegate self-contained stages to a subagent that returns a short summary, move a multi-step procedure into a skill, or suggest one session per task. Check `large_piece` signals too: always-loaded instructions fill the context faster. `manual` means the person compacted by hand |
| `unused_piece` | Structure change: remove, or improve its description if it should have triggered. Partial when it was added during the period |
| `large_piece` | Structure change when `isLoadedEveryTurn` is true and the content is only needed sometimes |

## Rules

1. **Traceable.** Each finding cites its evidence as `session <first 8 chars of id> · line <n> · <thread>`. Show up to 3 and "+N more".
2. **Partial evidence is marked.** If the signal has `isPartial: true`, say why (from `partialReasons`) and don't claim the cause is certain. A single session is never enough for a structure change.
3. **No repeats.** Already-handled signals, and signals whose piece changed after the evidence, don't become new suggestions.
4. **Mandate only.** Only report what the evidence supports and what concerns the harness. Never include secret values, even partially.
5. **Self-contained text.** Text proposed for a subagent or skill describes the condition and the action in that piece's own terms. It never refers to who calls it, to another file's step numbers, or to this report.
6. **Coupling is a finding.** If a piece only works because another piece says something specific (a subagent that relies on the main instructions mentioning a path), report the coupling as a structure change.
7. **Cheapest adequate fix.** Prefer deleting or tightening over adding. Prefer a hook or script over a longer prompt. Prefer moving rarely-needed detail out of always-loaded instructions.
8. **Conflicts are a finding.** When two pieces give different instructions for the same thing (CLAUDE.md says one command, a skill or a preloaded skill says another), class it as Partial or outdated instruction. The fix keeps the instruction in the piece that does the work and removes or aligns the other; quote both lines.

## Starting a harness

When the project has no instruction file, the person has been repeating context by hand in every session. Besides the findings above, propose one suggestion: a first `CLAUDE.md` (class Missing instruction, piece `instructions:project`), drafted only from evidence:

- **Commands** from `commonCommands`: the ones run in several sessions, written as in `example`, including the setup they needed (a version manager, an env var, a timeout). A command that keeps failing is not one to recommend.
- **Corrections** the person made more than once, as rules (the excerpts of `user_correction` and rejected plans hold their words).
- **Conventions** they stated while correcting ("follow the repo's pattern for X").

Keep it short (under 30 lines) and cite the evidence for each line in the report. Don't describe the architecture or invent conventions the sessions don't show. Repeated workflows and long sessions still become skills, commands, scripts or subagents as usual; with no harness, draft them in full.

## Report format

```markdown
# Harness report — <YYYY-MM-DD>

Analyzed <N> sessions (<period>) · <K> suggestions · ~<active minutes> and ~$<usd> estimated lost to failures
History: <transcriptsAvailable> transcripts since <oldestAt>; retention <retentionDays> days.

## Suggestions

| # | Class | Piece | Problem | Estimated cost | Id |
| --- | --- | --- | --- | --- | --- |
| 1 | Rule exists, but is ignored | agent:test-runner | Runs `npm test` (fails), then `pnpm test` | ~38 min, ~$2.10 | sug-1a2b3c4d |

### 1. <title>
**Class:** … · **Piece:** `…` (`path`) · **Evidence:** session 3f2a91bc · line 14 · test-runner; … +4 more
**What happens:** one or two sentences, with the numbers from the script, time first when it is the bigger cost.
**Why this class:** one sentence (e.g. "CLAUDE.md line 3 already says to use pnpm").
**Change:** the exact text, diff, hook or file to add.
(**Partial:** reason — only when partial.)

## Already handled
- <title> — <status> (<id>)

## Changed since this evidence
- <piece> changed on <date>; <signal> may already be fixed. Run a comparison after a few sessions.

## Before/after
- <piece>: <verdict> — <moves, e.g. "same cost, 40% faster">, only for pieces with an applied suggestion.

_Time and cost are estimates from transcript timestamps and token usage; idle time is excluded._

When `totals.reportedByProvider.costUsd` exists, show it next to the estimate as the agent's own figure ("the agent reports $X"); never add the two. Skill rows in `usage` overlap the main and agent rows.
```

Leave out empty sections.
