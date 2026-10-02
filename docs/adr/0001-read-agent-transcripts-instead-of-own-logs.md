# Read the agent's own transcripts instead of recording our own logs

Coding agents already save every session locally (Claude Code writes JSONL per session and per subagent under `~/.claude/projects/`). We read those files in place and record nothing of our own, so the tool works on history the user already has from the first run, adds no overhead during work, and never duplicates code or secrets on disk.

## Consequences

- Transcript formats are internal and change between agent versions. Parsers are defensive (unknown lines are counted, never fatal) and tested against samples in the agent's format.
- History is limited by the agent's retention (Claude Code deletes transcripts older than `cleanupPeriodDays`, 30 by default). We report how much history exists and never change that setting, because short retention is a security choice.
- Git checkpoints are not in transcripts. Anything that needs them (v2 bench from the current session) requires a hook, which is why hooks only arrive in v2.
