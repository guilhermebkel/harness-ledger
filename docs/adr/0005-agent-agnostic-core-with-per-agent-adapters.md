# Agent-agnostic core with one session reader and one harness mapper per agent

Claude Code ships first, but Codex and Cursor are planned. Everything after parsing works on a shared model (sessions, threads, tool calls, prompts, usage; pieces and inventory) and does not know which agent produced it. Each agent adds two adapters: a session reader and a harness mapper. The skill follows the open `SKILL.md` standard, so one skill can be shared by one manifest per agent.

## Consequences

- Signal rules, usage, before/after and suggestions are written once.
- Piece ids and suggestion wording must stay generic in the core; agent-specific vocabulary ("CLAUDE.md", "Cursor rule") belongs in adapters and in the skill's output.
