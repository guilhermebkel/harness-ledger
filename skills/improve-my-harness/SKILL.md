---
name: improve-my-harness
description: Analyzes this project's coding-agent harness (CLAUDE.md, skills, subagents, commands, hooks, MCP servers, plugins) against the session transcripts already saved on this machine, and suggests evidence-based changes. Use when the user asks to improve, audit or clean up their harness, asks why the agent keeps making the same mistake, asks whether a skill, subagent or instruction is worth it, or asks whether a harness change helped.
argument-hint: "[what to analyze, e.g. 'only code-reviewer, last 2 weeks' or 'did my change help?']"
---

# improve-my-harness

You turn deterministic signals from the user's own sessions into a short list of classified, evidence-backed suggestions for their harness. The numbers come from a local script; your job is to judge, classify and write the change. Never invent a number, a session or a step.

The request: $ARGUMENTS

## The script

All data comes from the bundled script. Run it with Bash from the project root:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/imh.mjs" <command> [options]
```

It needs Node.js 20+. If `node` is missing or older, tell the user and stop. It reads transcripts in place, prints JSON, and writes only to `.imh/` in the project.

Always pass `--exclude-session ${CLAUDE_SESSION_ID}` to `analyze`, `compare` and `status`, so the session running this analysis isn't counted.

| Command | Use it for |
| --- | --- |
| `analyze [--since 14d] [--until DATE] [--piece ID]...` | Inventory + signals + per-piece usage. Prints a compact JSON; the full result goes to `.imh/last-analysis.json`. |
| `evidence <signal-id>` | All evidence (session, transcript line, thread, redacted excerpt) for one signal. |
| `inventory` | The active harness with piece ids (`agent:code-reviewer`, `skill:changelog`, `instructions:project`, `hook:...`, `mcp:...`). |
| `compare --piece ID [--at DATE]` | Before/after metrics for one piece. |
| `suggestions list [--status S]` · `suggestions add --file F` · `suggestions set ID STATUS [--note T]` | Suggestion state, so nothing is suggested twice. |
| `status` | Transcripts available, retention, config. |

Options shared by all commands: `--project-only` (ignore user-level and plugin pieces), `--all-projects`, `--no-cache`.

## Pick the flow

Read the request and pick one flow. If it's empty or vague, use flow 1.

1. **Analyze history** (default) — "improve my harness", "what's wrong with my setup".
2. **Focus on a piece or period** — names a subagent, skill, command, MCP server or instruction file, or a period ("last 2 weeks"). Same as flow 1 with `--piece` and/or `--since`. If the piece name is ambiguous, run `inventory` and match it to an id; ask only if two ids fit equally.
3. **Compare a change** — "did my change to X help?", "is it better since I edited CLAUDE.md?".
4. **Manage suggestions** — "show pending suggestions", "apply the second one", "reject X".

Before any flow, read `references/findings.md` in this skill's folder (`${CLAUDE_SKILL_DIR}/references/findings.md`). It has the classes, the rules and the report format. Follow it exactly.

## Flow 1 and 2: analyze

1. Run `analyze` with the options from the request. Read the JSON.
2. Tell the user in one line what was analyzed: sessions, period, and how much history exists (`history`). If `history.transcriptsAvailable` is small or `history.oldestAt` is close to `retentionDays` ago, say that older sessions were already deleted by the agent's retention setting. Never change that setting.
3. If `analyzed.sessions` is 0, say so, suggest a wider period or `--all-projects`, and stop.
   If `inventory.pieces` has no `instructions:*` piece, the project has no harness yet: follow "Starting a harness" in the reference as well. When a suggestion creates a skill, subagent or command, or a signal points to a problem a plugin solves (exploration taking most of the context, agents guessing paths), read `references/community-extensions.md` first. When `checks.missing` isn't empty and there are corrections about code quality or fix loops, read `references/deterministic-checks.md`.
4. Go through `signals` in order. For each one worth reporting:
   - Read what shapes that behavior today, not only the piece the signal names (paths are in `inventory.pieces`):
     - `main`: the instruction files (`instructions:*` pieces), since they guide the main thread.
     - A skill: its `SKILL.md` and, from its `files`, the references or scripts the failing step uses. The change often belongs there.
     - An agent: its file and the skills in its `preloadedSkills`.
     - A command: its file and the skill it runs, if any.
   - Before writing a change, look in what you read for other instructions about the same thing. If two pieces disagree, the conflict is the finding (see rule 8 in the reference).
   - Use `details.mentions` when present: a failure the harness already has an instruction for is **Rule exists, but is ignored**.
   - If you need more evidence, run `evidence <signal-id>`. Don't read whole transcripts; if you must check one step, read only the cited line (`sed -n '<line>p' <file> | cut -c1-2000`).
   - If `changedAfterEvidence` is set, the piece changed after the newest evidence: report it under "Changed since this evidence", not as a new suggestion.
   - If `handledBy` is set, it goes under **Already handled** with its status. Never suggest it again.
   - Also treat as already handled anything an open branch or PR already changes: check `git branch --list` and, if `gh` works, `gh pr list --state open --limit 20 --json title,headRefName,files`. Skip this silently when not a git repo or `gh` isn't available.
   - Classify it with exactly one class and write the change, following the rules in the reference.
5. Group signals that share a cause into one finding (for example, `failed_command:npm test` and a correction saying "use pnpm").
6. Write the report in the format from the reference, save it to `.imh/reports/<YYYY-MM-DD>.md`, and show it to the user. Keep it short: at most 7 suggestions, ordered by estimated cost (the script's `score`, which weighs time and money).
7. Register each suggestion with `suggestions add --file <tmp.json>` (an array of `{title, class, piece, signals, change}`; `signals` are the signal ids the finding came from). Use the returned ids in the report.
8. Ask which suggestions, if any, the user wants applied (see "Applying").

If `.imh/` is not in `.gitignore` and the project is a git repo, ask once whether to add it there (or to `.git/info/exclude`). Don't add it without asking.

## Flow 3: compare a change

1. Find the piece id (`inventory` if needed) and when it changed: an applied suggestion, the date the user gives (`--at`), or the piece's last change (git commit, else file mtime). The script picks this automatically; say which source it used.
2. Run `compare --piece <id>`.
3. Report before vs. after: sessions, error rate, corrections per session, time, time until failures recovered, input and output tokens, and cost per use, and the signals on each side. Use the script's `verdict`:
   - `insufficient_data`: say how many sessions each side has and that it needs `minSessions` per side. Don't conclude anything.
   - `improved` / `worse` / `mixed` / `no_clear_change`: say it, and always add that this is an observational comparison of different tasks, not a controlled test.
   - Describe the verdict with `moves`, the metrics that changed: time per use counts as much as cost, so "same cost, 40% faster" is an improvement. For `mixed`, name the trade-off ("40% faster, 30% more expensive") and let the user weigh it.
   - Moves with `isInVerdict: false` are input and output tokens per use and time until failures recovered. Report them ("30% fewer output tokens", "half the time stuck on failures"), but they don't decide the verdict: they are already in `usdPerInvocation` and in active time.

## Flow 4: manage suggestions

- List: `suggestions list` (optionally `--status pending`). Show id, title, class, piece, status.
- Accept or reject: `suggestions set <id> accepted|rejected --note "<reason>"`. A rejected suggestion is never suggested again; keep the user's reason in the note.
- Apply: see below.

## Applying a suggestion

Only when the user explicitly asks for a specific suggestion. Then:

1. Show the exact change (a diff or the new text) and the file it touches, and wait for a yes.
2. Only edit harness files: `CLAUDE.md`, `CLAUDE.local.md`, files under `.claude/` (agents, skills, commands, settings hooks and permissions), and `.mcp.json`. User-level files under `~/.claude/` only when the user names them. Never edit plugin files (they're overwritten on update; suggest the change to the plugin's author instead), application code, or retention settings.
3. Prefer the smallest change that fixes the cause. For "Rule exists, but is ignored", that is a hook, a script or a permission rule — not more text.
4. After editing, run `suggestions set <id> applied`. Tell the user that running the comparison after a few more sessions (at least the configured minimum per side) will show whether it helped.
5. If the project is a git repo, offer to commit the change on a branch; don't commit or push unless asked.

## Hard rules

- Every finding cites its evidence: session id (first 8 characters), transcript line and thread. No evidence, no finding.
- Numbers come only from the script. Time and cost are always labeled as estimates. If `totals.unpricedModels` is not empty, say that those models' cost is not included. `totals.reportedByProvider` holds the agent's own cost and turn time; show it beside the estimate, never summed with it. Each signal's `cost.bound` says whether to write "at least", "at most" or "about".
- Never show secret values. The script redacts excerpts; if you read a transcript line yourself, don't copy credentials, tokens, keys or personal data into the report, suggestions or commits. If you notice an exposed secret, tell the user privately in one line and don't turn it into a suggestion.
- Stay in scope: unrelated bugs or code issues you notice in transcripts are not harness findings. Mention them in one line at most, outside the suggestion list.
- Don't apply anything without explicit confirmation for that specific suggestion.
