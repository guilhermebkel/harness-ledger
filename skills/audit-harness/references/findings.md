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
| `failed_command` with `details.chains.fixLoops`, on a check command (lint, types, tests, build) | The agent reruns the check until it passes after fixing the code: a deterministic check in a `PostToolUse` hook on the edited file catches it earlier. Time and tokens until it worked are in `cost.fixLoop`. See `references/deterministic-checks.md` |
| `checks.missing` | Not a finding alone. With corrections about code quality or fix loops as evidence, a deterministic check: read `references/deterministic-checks.md`. With `checks.isMissingPartial`, resolve the unmapped languages and tools first (same reference) |
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
2. **Partial evidence is marked.** If the signal has `isPartial: true`, say why (from `partialReasons`) and don't claim the cause is certain. A single session is never enough for a structure change (adding, removing or splitting a piece). It can still support a fix to an instruction, and a one-session signal of 5 minutes or more is listed under "Seen once" with its time, so it isn't lost.
3. **No repeats.** Already-handled signals don't become new suggestions, and neither do signals whose piece changed after the evidence in a way that touches their cause. A change elsewhere in the piece doesn't excuse a signal.
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
3. **Deterministic first.** Split each stage into what always runs the same way and what needs judgment. The fixed part becomes a script or a hook (validation after edits is a `PostToolUse` hook, a branch setup or a PR is a script); only the judgment part becomes a skill or subagent (planning, review). Rule 7 applies. For the validation stage, `checks` says which linters and scans exist; `references/deterministic-checks.md` says what to add.
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

Costs are the script's numbers for the whole analyzed period, adding up every occurrence; never per session and never your own estimate. A suggestion's time, tokens and money are its `suggestionIdToSuggestionCost[id]` from `suggestions add`: every row has its own number, and the rows never share one, so never write "included in another suggestion" or leave a row without a cost. When two suggestions came from the same signal, each counts the occurrences it covers. Write tokens as `1.2M` / `340k`; input tokens include cache reads and writes.

```markdown
# Harness report — <YYYY-MM-DD>

Analyzed <N> sessions (<period>) · <K> new suggestions · <P> pending from earlier runs
Spent in the period: ~<usd> · ~<activeMinutes, in hours> (the agent reports <reportedByProvider.costUsd>; models without a price count as $0: <unpricedModels>)
Estimated cost of the problems found, for the whole period (min · input tokens · output tokens · $; the four don't overlap):
- Failures ~<lostToFailures>: from each first error until a call doing the same job worked, reasoning and retries included.
- Fix loops ~<inFixLoops>: rerunning a check after fixing the code until it passed; work, but the share a check after each edit would shorten.
- Re-reads ~<lostToRereads>: files read again with nothing changed, or after a compaction dropped them.
- Corrected or interrupted turns, at most ~<inCorrectedOrInterruptedTurns>: the whole turn before you corrected or stopped the agent; some of it may have been useful.
History: <transcriptsAvailable> transcripts since <oldestAt>; retention <retentionDays> days.

## Suggestions

| # | What to do | Where to change | Problem | Sessions | Time | Input tokens | Output tokens | Cost | Id |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Enforce a rule that already exists | test-runner agent (`.claude/agents/test-runner.md`) | Runs `npm test` (fails), then `pnpm test` | 3 of 20 | ≥ 38 min | ≥ 1.2M | ≥ 40k | ≥ $2.10 | sug-1a2b3c4d |

_Time, tokens and cost add up the whole period (<N> sessions), not one session: what these problems already cost, not a promised saving. ≥ means at least, ≤ at most, ~ about. They come from transcript timestamps and token usage, with idle time left out. Together the suggestions cover <covered>; no cost is counted in two rows._

### 1. <title>
**What to do:** … · **Where:** `<path>` · **Evidence:** session 3f2a91bc · line 14 · test-runner; … +4 more
**What happens:** one or two sentences, with the numbers from the script and how often it happened ("6 times in 4 of 41 sessions"), time first when it is the bigger cost.
**How we measured:** one plain sentence, from the signal's `cost.method` and `cost.bound`, saying what the numbers count, which occurrences they cover when the suggestion covers part of a signal (`suggestionIdToSuggestionCost[id].occurrences`: "the 5 corrections about the workspace's rules"), and how sure they are ("from the first error until the command that worked, reasoning included; an estimate").
**Why:** one sentence on why this is the right kind of fix (e.g. "CLAUDE.md line 3 already says to use pnpm, so more text won't help").
**Change:** the exact text, diff, hook or file to add.
**After the change:** how they'll know it worked ("run a comparison on the test-runner agent after a few sessions").
(**Partial:** reason — only when partial.)

## Examined, not suggested
- <problem> — <time> · <sessions> — <reason, citing what the evidence showed>

## Seen once
- <problem> — <time> in session <first 8 chars>; one session isn't enough for a structure change.

Not examined: <N> smaller signals (under 5 min, fewer than 3 sessions, below the top 15).

## Already handled
- <title> — <status> (<id>)

## Changed since this evidence
- <file> changed on <date>; <problem> may already be fixed. Run a comparison after a few sessions.

## Before/after
- <file>: <verdict> — <moves, e.g. "same cost, 40% faster">, only for files with an applied suggestion.

## What the tool couldn't handle
- <what it met, in plain words> · [open an issue](<issueUrl>) · [already reported?](<searchUrl>)
```

When `totals.reportedByProvider.costUsd` exists, show it next to the estimate as the agent's own figure ("the agent reports $X"); never add the two. The totals don't overlap, so they can be listed side by side. A signal's `cost.bound` decides the wording: `lower` → "at least", `upper` → "at most", `estimate` → "about". **How we measured** restates `cost.method` in the person's words and language, never in the script's terms (no field names); when a suggestion combines signals, say what each part counts. Failure costs run until the call that worked (`details.chains`: chains, how many recovered, attempts), so "3 attempts, ~4 min until it worked" is the way to put them. Skill rows in `usage` overlap the main and agent rows.

### Numbers, carefully

The numbers are the reason to trust the report and the easiest part to oversell. Every one of them follows these rules:

- **Say what kind of number it is.** Every figure carries its bound: in tables ≥ (`lower`), ≤ (`upper`) or ~ (`estimate`); in sentences "at least", "at most", "about". Never a bare number.
- **Say how often.** Next to every finding, the count and the sample: "6 times in 4 of 41 sessions". A big cost from one session is a different finding from a small cost in every session.
- **Spent, not saved.** The script measures what already happened. Write "this cost at least 38 min in the period", never "fixing this saves 38 min": a saving is a hypothesis until a before/after comparison shows it.
- **Never add numbers with different bounds.** An "at least" plus an "at most" is not a number. Totals stay split by kind, as in the header above.
- **The agent's own figure sits beside the estimate.** When `totals.reportedByProvider.costUsd` exists, show it next to the script's estimate for the same sessions; when they differ by more than half, say so in one line. Never add the two.
- **Round to what the method can tell.** Minutes as whole numbers, hours with one decimal (`~1.8 h`), money with cents below $10 and whole dollars above, tokens as `340k` / `1.2M`.
- **No size words.** Never call a figure small, big, low or high. Give its share instead: "16 min of the 4.6 h lost to failures", "$0.75 of the ~$14 the problems cost". When money is undercounted (unpriced models), say so next to it and lead with time.
- **Partial means the number may move.** When a signal is partial, say why in the person's words ("only 2 sessions so far"), and that the figure may change with more history.

**What the tool couldn't handle** lists `gaps`: up to three, one line each (an unknown transcript line, an extension with no language, a check tool or a model the script doesn't know, a subagent whose type it couldn't tell), then "and N more" with no links. Say in one sentence, once, that each link opens a prefilled GitHub issue they can read and edit before sending, that it holds only names and counts, and that nothing is sent unless they submit it. When you already resolved a gap yourself (you know `.ex` is Elixir, you found what a package checks), say so in the line; the link still helps the next person.

Leave out empty sections.
