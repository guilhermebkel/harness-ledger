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
| `failed_command` with `details.chains.fixLoops` | The agent reruns a check (lint, types, tests, build) until it passes after fixing the code: a deterministic check in a `PostToolUse` hook on the edited file catches it earlier. Time and tokens until it worked are in `cost.fixLoop` |
| `failed_command` / `tool_error` without recovery | Partial instruction, or out of scope if it's a tool/plugin problem |
| `permission_denied` | Missing instruction (the agent keeps trying something not allowed) or a permission rule the user may want; ask, never widen permissions on your own. `errors` holds the reason, e.g. the auto-mode classifier's category |
| `api_error` | Structure change: a model name that doesn't exist, expired credentials or a proxy failing. `details.models` names the model; check the `model:` of the attributed agent or the settings |
| `hook_blocked` | Rule exists, but is ignored — the hook works; the instruction or subagent should stop trying |
| `repeated_read` | Missing instruction in that subagent/skill, or a structure change (pass the content, or a script that extracts what's needed). One signal per agent; `details.files` lists the files it re-read |
| `subagent_reread` | Structure change: pass what the main thread already knows when delegating |
| `user_correction`, `interruption` | Read the excerpt: the class depends on what was corrected; attributed pieces are where the turn ran. Excerpts starting with `rejected` are calls the user turned down (often a plan), with their feedback |
| `repeated_request` | Structure change: a skill or command (draft it) |
| `repeated_workflow` | Structure change: the agent rebuilds the same procedure (`details.steps`) by hand. With no skill in `pieces`, draft a script that runs the steps plus a skill or command that calls it. With a skill in `pieces`, that skill leaves the steps to the agent: add the script to the skill's folder. If an existing skill already covers it but isn't in `pieces`, its description isn't triggering: fix the description |
| `context_heavy` | Structure change: a piece loads the same material again and again, or huge outputs (`details.sources`: "source (×loads)" with approximate tokens). By source: a doc read by every run → pass the part it needs when delegating, split the doc, or preload it once (`skills:` on the agent); a doc also read by the main thread → see `subagent_reread`; a command printing everything (`git diff`, logs, test output) → a narrower command in the piece (`git diff --stat` first, `| tail -50`, a filter); an MCP tool returning large pages → narrower queries; agents searching a large codebase file by file → a map in the instructions or the cartographer plugin. The token cost includes the carry: the material, as cached input, on every later message until a compaction |
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
9. **Fit the person's machine.** Scripts, hooks and commands you propose must run on `environment.platforms` with `environment.shells`. On macOS, assume BSD tools and bash 3.2: no `timeout` (use `gtimeout` or a Node script), `sed -i ''`, no `mapfile`. On Windows, check `environment.shells`: commands may run in PowerShell or Git Bash, so prefer a Node script (`node .claude/scripts/x.mjs`), which runs on every platform. When sessions come from more than one platform (a team), write the script in Node. A command that fails with "command not found" or "illegal option" on one platform only is a missing or partial instruction about that platform, not a broken command.

## Starting a harness

When the project has no instruction file, the person has been repeating context by hand in every session. Propose the harness in the order of their work, using `process` (stages in order, with sessions, steps, failures and commands):

1. **A first `CLAUDE.md`** (class Missing instruction, piece `instructions:project`), drafted only from evidence:
   - **Commands** from `commonCommands`: the ones run in several sessions, written as in `example`, including the setup they needed (a version manager, an env var, a timeout). A command that keeps failing is not one to recommend.
   - **Corrections** the person made more than once, as rules (the excerpts of `user_correction` and rejected plans hold their words).
   - **Conventions** they stated while correcting ("follow the repo's pattern for X").
   - Keep it under 30 lines and cite the evidence for each line. Don't describe the architecture or invent conventions the sessions don't show.
2. **One piece per stage that needs it**, in stage order (setup, planning, exploration, implementation, validation, delivery), at most one per stage and only where the evidence points to a problem: many steps, failures or rejections, a `repeated_workflow`, `context_compaction`, or repeated corrections about that stage. Skip stages that go smoothly.
3. **Deterministic first.** Split each stage into what always runs the same way and what needs judgment. The fixed part becomes a script or a hook (validation after edits is a `PostToolUse` hook, a branch setup or a PR is a script); only the judgment part becomes a skill or subagent (planning, review). Rule 7 applies.
4. **Reuse before writing.** For each piece, check `references/community-extensions.md` for a skill or plugin to adopt or learn from, and say which. Never install one yourself.

Draft new pieces in full, keep the list short (the 7-suggestion limit applies), and order it by stage, then by estimated cost.

In a project that already has a harness, a stage with many failures or rejections and no pieces in `process[].pieces` is also worth one suggestion, built the same way.

## Report format

Write the report in the language the person uses with you. Translate the labels below; keep ids, paths, commands and code as they are. The report is for the person, not for this skill: never show internal terms such as "class", "piece" or piece ids (`agent:x`) as column names or values.

| Class | "What to do" label |
| --- | --- |
| Rule exists, but is ignored | Enforce a rule that already exists |
| Partial or outdated instruction | Fix an instruction |
| Missing instruction | Add an instruction |
| Structure change | Change the structure (script, skill, agent, hook) |
| Out of scope | Outside your harness |

"Where to change" is the file the suggestion edits or creates, with a readable name: `test-runner agent (.claude/agents/test-runner.md)`, `new script (.claude/scripts/check.sh)`.

Costs are the script's numbers for the whole analyzed period, adding up every occurrence; never per session and never your own estimate. Write tokens as `1.2M` / `340k`; input tokens include cache reads and writes.

```markdown
# Harness report — <YYYY-MM-DD>

Analyzed <N> sessions (<period>) · <K> suggestions
Estimated cost of the problems found, for the whole period: failures ~<lostToFailures> · fix loops ~<inFixLoops> · re-reads ~<lostToRereads> · corrected or interrupted turns, at most ~<inCorrectedOrInterruptedTurns> (each as min · input tokens · output tokens · $)
History: <transcriptsAvailable> transcripts since <oldestAt>; retention <retentionDays> days.

## Suggestions

| # | What to do | Where to change | Problem | Sessions | Time | Input tokens | Output tokens | Cost | Id |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Enforce a rule that already exists | test-runner agent (`.claude/agents/test-runner.md`) | Runs `npm test` (fails), then `pnpm test` | 3 of 20 | ~38 min | 1.2M | 40k | ~$2.10 | sug-1a2b3c4d |

_Time, tokens and cost add up the whole period (<N> sessions), not one session; they are estimates from transcript timestamps and token usage, with idle time left out._

### 1. <title>
**What to do:** … · **Where:** `<path>` · **Evidence:** session 3f2a91bc · line 14 · test-runner; … +4 more
**What happens:** one or two sentences, with the numbers from the script, time first when it is the bigger cost.
**Why:** one sentence on why this is the right kind of fix (e.g. "CLAUDE.md line 3 already says to use pnpm, so more text won't help").
**Change:** the exact text, diff, hook or file to add.
(**Partial:** reason — only when partial.)

## Already handled
- <title> — <status> (<id>)

## Changed since this evidence
- <file> changed on <date>; <problem> may already be fixed. Run a comparison after a few sessions.

## Before/after
- <file>: <verdict> — <moves, e.g. "same cost, 40% faster">, only for files with an applied suggestion.
```

When `totals.reportedByProvider.costUsd` exists, show it next to the estimate as the agent's own figure ("the agent reports $X"); never add the two. The totals don't overlap, so they can be listed side by side. A signal's `cost.bound` decides the wording: `lower` → "at least", `upper` → "at most", `estimate` → "about"; `cost.method` says what was counted when the person asks. Failure costs run until the call that worked (`details.chains`: chains, how many recovered, attempts), so "3 attempts, ~4 min until it worked" is the way to put them. Skill rows in `usage` overlap the main and agent rows.

Leave out empty sections.
