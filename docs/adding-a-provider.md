# Adding a provider

How to add support for another agentic coding tool (a provider, see `GLOSSARY.md`) such as Codex or Cursor. The layout and its rules are in ADR 0008; open specs are in GitHub issues (#3 Codex, #4 Cursor). Follow the steps in order: each one gives the next one its input.

## 1. Find where the provider keeps its sessions

Start from the provider's documentation. When it doesn't say, find out on your own machine: mark the time, run one short session, and see which files changed.

```bash
touch /tmp/imh-marker
# ...run one short session in the provider, in any project...
find ~ -newer /tmp/imh-marker -type f 2>/dev/null \
  | grep -vE '/(\.cache|node_modules|\.git|Library/Caches)/' | head -50
```

Note for the provider:

- The folder of session files and how it's organized (per project, per date, one file per session).
- The format: JSONL (one event per line, like Claude Code and Codex) or something else. Treat an editor database (SQLite) as a last resort: read it only from a copy, never the original, which the editor keeps open (issue #4).
- How a session says which project it belongs to (a folder name, or a working directory recorded inside it).
- Where subagent runs are stored, if the provider has subagents.
- The environment variable that relocates the provider's home, if any. The adapter honors it, and also gets an `IMH_<PROVIDER>_HOME` override for tests (see `ClaudeCodePathUtil`).
- The harness: instruction files, skills, agents or modes, commands, hooks, MCP servers, plugins, settings and retention.

## 2. Export a sample of real sessions

Take the last 7 days of one project you work on. That's enough variety (subagents, failures, corrections) without being huge.

```bash
DIR=<the provider's session folder for one project>
find "$DIR" -name '*.jsonl' -mtime -7 -print0 \
  | tar czf ~/Desktop/<provider>-sessions-7d.tgz --null -T -
```

Session files contain everything the agent read and ran, including code and sometimes credentials. Extract the sample outside this repository, never commit it, and only commit fixtures you write by hand with synthetic content.

## 3. Learn the format

```bash
node scripts/survey-transcripts.mjs <extracted folder>
```

It prints line types, keys, content blocks, tool names and tool-result keys with counts, never values. Run it again on a later export to see what a new version of the provider added:

```bash
node scripts/survey-transcripts.mjs <older export> <newer export>
```

Then open a few lines of each type yourself to see what they mean.

## 4. Map the format to the shared model

The adapter returns `SessionFacts` (`src/Shared/Protocols/SessionProtocol.ts`). For each field, find where the provider keeps it. When it doesn't, leave the field empty and say so in the adapter; never invent a value.

| Shared field | Look for |
| --- | --- |
| `sessionId`, `startedAtMs`, `endedAtMs`, `projectDir` | Session id, event timestamps, the working directory |
| `threads` | The main conversation and each subagent run, with the subagent's type |
| `prompts` | What the person typed. Leave out text the tool injects (reminders, command wrappers, notifications, compaction summaries) and set `isCorrection` / `isInterruption` |
| `tools` | Each tool call with a `category` (`shell`, `read`, `edit`, `search`, `plan`, `delegation`, `skill`, `mcp`), so shared code never sees the provider's tool names |
| `tools[].result` | Error flag and `kind`: `permission_denied`, `user_rejected` and `hook_blocked` come from the provider's own markers when it has them, before any text matching |
| `messages` | Model and token usage per assistant message. Count each message once: some providers repeat its usage on several lines |
| `apiErrors`, `compactions` | Failed model requests and context compactions, if recorded |
| `environment` | Platform and shell, if recorded; otherwise inferred from the path's shape |
| `reported` | The provider's own cost and turn durations, if recorded |
| `unparsedLines` | Every line that couldn't be read. Never throw on a bad line |

The inventory (`HarnessProtocol.ts`) maps the provider's harness to pieces with ids like `instructions:project`, `skill:<name>`, `agent:<name>`. Keep piece ids generic; the skill phrases suggestions in the provider's vocabulary.

## 5. Write the provider

```
src/Providers/<Provider>/
├── Adapters/<Provider>ProviderAdapter.ts      extends BaseProviderAdapter
├── Adapters/<Provider>ProviderAdapter.test.ts
├── Services/                                  sessions, inventory
├── Protocols/                                 the provider's own line shapes
└── Utils/<Provider>FixtureUtil.ts             writes sessions in the provider's real format, synthetic content
```

- Add the type to `ProviderType` and one entry to `ProviderModule`. Nothing in `src/Shared/` should need the provider's names; if it does, extend the shared model instead (ADR 0008, enforced by lint).
- Reproduce every format case you found in step 3 in the fixture, with made-up content, and test it next to the adapter.
- Add `.github/workflows/<provider>.yml`, triggered by changes to the provider's folder and its plugin manifest, like `claude-code.yml`.
- Add the provider's plugin manifest beside the others, pointing at the same `skills/` folder (issues #3 and #4 have the details per provider).

## 6. Check it on the real sample

Point the script at the extracted sample and compare with what you know about those sessions:

```bash
IMH_<PROVIDER>_HOME=<sample home> node dist/imh.mjs analyze --provider <type> --project <project dir> --no-cache --pretty
```

- `analyzed.unparsedLines` is 0, or every unparsed line is understood.
- The number of sessions, subagent runs, tool calls and failures match what you see in the files.
- If the provider reports its own cost, `totals.reportedByProvider` is close to the estimate, or the difference is explained.
- The signals make sense: open a few `evidence` lines and check them against the transcript.

Every surprise is a fixture case and a test before it's a fix.
