# Community skills and plugins to adopt or learn from

Read this when a suggestion would create a new skill, subagent or command, or when a signal points to a problem a plugin already solves. Point the person to an existing skill or plugin when one fits, so they don't build it from scratch, or use it as a model for what you draft.

Checked in October 2026. Collections change: before recommending one, open its repository and confirm the skill still exists and does what's described here.

## How to recommend one

- Recommend a skill or plugin only for a stage the analysis shows (`process`) and a problem the evidence shows, with the numbers that show it. Never install anything: say what it is, where it lives and why it fits, and let the person decide.
- Check that it runs on the person's platform (`environment.platforms`) and what it needs (a runtime, an API key, a local index) before recommending it.
- Skills and plugins run with the agent's permissions, and some ship scripts. Tell the person to read a skill before installing it, and prefer collections from known authors.
- Adapting is often better than installing: copy the one idea that fits (a checklist, a script, a step order) into their own skill, written in their project's terms.
- If nothing here fits, draft the skill yourself; don't stretch a match.

## Collections

| Collection | What it covers | Install (Claude Code) |
| --- | --- | --- |
| [anthropics/skills](https://github.com/anthropics/skills) | Anthropic's examples: `skill-creator` (write and test skills), `mcp-builder`, `webapp-testing`, `frontend-design`, and document skills (pdf, docx, pptx, xlsx). Apache 2.0, except the document skills, which are source-available. | `/plugin marketplace add anthropics/skills`, then install `example-skills` or `document-skills` |
| [obra/superpowers](https://github.com/obra/superpowers) | A full development process: `brainstorming` → `using-git-worktrees` → `writing-plans` → `subagent-driven-development` or `executing-plans` → `requesting-code-review` → `finishing-a-development-branch`, plus `test-driven-development`, `systematic-debugging` and `verification-before-completion`. MIT. | `/plugin install superpowers@claude-plugins-official` |
| [mattpocock/skills](https://github.com/mattpocock/skills) | Engineering workflow around alignment and feedback loops: `grill-me` / `grill-with-docs` (interview until the design is settled), `to-spec`, `to-tickets`, `implement`, `tdd`, `diagnosing-bugs`, `code-review`, `domain-modeling`, `handoff`. MIT. | `claude plugins install mattpocock-skills`, then `/setup-matt-pocock-skills` in the repo |

To find more, search the curated lists [hesreallyhim/awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code) and [travisvn/awesome-claude-skills](https://github.com/travisvn/awesome-claude-skills). Apply the same checks before recommending anything from them.

## Plugins

A plugin fits when the cost comes from how the agent works rather than from a missing instruction: the same expensive step in every session, which a tool does better.

| Plugin | What it does | Suggest it when | Install (Claude Code) |
| --- | --- | --- | --- |
| [kingbootoshi/cartographer](https://github.com/kingbootoshi/cartographer) | Maps a codebase with parallel subagents into `docs/CODEBASE_MAP.md` (architecture, file purposes, dependencies); its CLI also builds a local graph index (`.cartographer/`) to answer "where is X" without reading files one by one. MIT. Needs Bun for the CLI and `tiktoken` (Python). | Exploration dominates (`process` exploration has most of the steps and `contextTokens`), and there are `context_heavy`, `repeated_read`, `subagent_reread` or `tool_error` "file does not exist" signals from agents guessing paths. In a project with no harness, the generated map can seed the first instructions. | `/plugin marketplace add kingbootoshi/cartographer`, then `/plugin install cartographer` |

The skills collections above install as plugins too (superpowers is in the official marketplace, `claude-plugins-official`).

## By stage

What to look at first for each stage of `process`. The deterministic part of a stage (commands that always run the same way) goes in a script or hook in the person's own repo, not in a skill from elsewhere.

| Stage | Signs in the analysis | Look at |
| --- | --- | --- |
| Planning | Many plans, many rejected (`process` planning `failures`, `user_correction` excerpts starting with `rejected ExitPlanMode`) | superpowers `brainstorming` and `writing-plans`; mattpocock `grill-me` and `to-spec` |
| Exploration | Exploration steps and `contextTokens` far above the other stages; subagents re-reading files; reads of paths that don't exist | A project map in the instructions; the cartographer plugin for large codebases; superpowers `dispatching-parallel-agents` for broad searches |
| Implementation | Corrections about code conventions; edits redone | The conventions in instructions or a skill of their own; superpowers `subagent-driven-development`; mattpocock `implement` |
| Validation | Test, lint or build commands run by hand after edits; failures fixed in loops | A `PostToolUse` hook or a script (deterministic); superpowers `test-driven-development` and `verification-before-completion`; mattpocock `tdd` |
| Debugging | The same failure retried; long fix loops | superpowers `systematic-debugging`; mattpocock `diagnosing-bugs` |
| Delivery | The same commit / push / PR sequence by hand | A script for the fixed steps; superpowers `finishing-a-development-branch` and `requesting-code-review`; mattpocock `code-review` |
| Long sessions | `context_compaction` | superpowers `subagent-driven-development`; mattpocock `handoff` |
| Writing skills | Any suggestion that creates a skill | anthropics `skill-creator`; superpowers `writing-skills` |
