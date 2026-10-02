# improve-my-harness

Analyzes the setup around a coding agent, using the sessions the agent already saved, and suggests changes backed by evidence. v1 reads history; v2 tests a change before it is adopted.

## Language

### The harness

**Provider**:
The agentic coding tool whose sessions and harness are read, such as Claude Code (later Codex or Cursor). Each provider has its own adapter in `src/Providers/`.
_Avoid_: agent (the model doing the work), IDE, client

**Harness**:
Everything around the coding agent that shapes how it works in a project: instructions, skills, subagents, commands, hooks, MCP servers, plugins and settings.
_Avoid_: setup, config, scaffold, agent config

**Piece**:
One identifiable part of the harness, addressed by a piece id such as `agent:code-reviewer`, `skill:changelog` or `instructions:project`.
_Avoid_: component, item, artifact

**Scope**:
Where a piece is defined: project, local, user, plugin or managed. Plugin and managed pieces are not editable by the user.
_Avoid_: level, layer

**Inventory**:
The list of pieces active for a project at a point in time, with a hash per piece and a fingerprint for the whole set.
_Avoid_: map, manifest (manifest is a v2 run record)

**Snapshot**:
An inventory saved because its fingerprint changed since the last one. Snapshots tell when the harness changed.
_Avoid_: version, backup

### Sessions

**Session**:
One conversation with the agent, read from the transcript the agent saved. It has a main thread and zero or more subagent runs.
_Avoid_: run (a run is a v2 bench execution), conversation, chat

**Transcript**:
The file the agent wrote for a session or a subagent run. Read in place, never copied.
_Avoid_: log

**Thread**:
The main thread of a session or one subagent run inside it. Steps are attributed to the thread they ran in.
_Avoid_: sidechain, branch

**Active time**:
Time between consecutive transcript events, skipping gaps longer than the idle threshold. Always an estimate.
_Avoid_: duration, wall time

### Analysis

**Signal**:
A pattern extracted deterministically from sessions, such as a failing command or a file read several times, with counts, cost and evidence. Signals are facts, not judgments.
_Avoid_: issue, problem, insight

**Evidence**:
A pointer to the exact place a signal came from: session, transcript line and thread, with a redacted excerpt.
_Avoid_: proof, example, sample

**Finding**:
One or more signals with the same cause, classified and explained. Produced by the agent from signals, never from nothing.
_Avoid_: insight, issue, recommendation

**Class**:
The kind of a finding, which decides the kind of fix: rule exists but is ignored, partial instruction, missing instruction, structure change, out of scope, already handled.
_Avoid_: category, type, severity

**Enforcement gap**:
A finding where the harness already says the right thing and the agent does not follow it. Fixed with a hook, script or check, not more text.
_Avoid_: ignored rule, violation

**Partial evidence**:
Evidence that cannot fully support its finding: a single session, an unresolved subagent type, or a piece that changed after the evidence.
_Avoid_: weak signal, low confidence

**Suggestion**:
A proposed change to one piece, derived from a finding, with a stable id and a status: pending, accepted, rejected or applied.
_Avoid_: recommendation, fix, proposal

**Before/after**:
An observational comparison of sessions that used a piece before and after it changed. Needs a minimum number of sessions on each side.
_Avoid_: A/B test, experiment (an experiment is a v2 bench run)

### v2 (planned)

**Bench**:
Running the same task in several variants, in isolation, to compare results and cost before adopting a change.
_Avoid_: benchmark suite, eval

**Task**:
A reproducible unit of work for the bench: a starting commit, a prompt and checks that must pass.
_Avoid_: test case, scenario

**Variant**:
One configuration a task runs with: model, effort, topology, and the harness or a single piece changed.
_Avoid_: arm, candidate (a candidate is a distinct diff produced by one or more variants)

**Duel**:
Running a real, in-progress change in two to four variants at once and letting the user pick one blind.
_Avoid_: A/B, race
