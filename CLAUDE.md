# improve-my-harness

A Claude Code plugin that reads the session transcripts the agent already saves, maps the project's harness, and suggests evidence-based changes. Vocabulary is in `GLOSSARY.md`; decisions are in `docs/adr/`; planned work (v2 Bench, Codex, Cursor) is in GitHub issues.

## Layout

- `skills/improve-my-harness/`: what the agent reads at runtime. `SKILL.md` has the four flows; `references/findings.md` has the classes, rules and report format.
- `src/`: the `imh` analysis script. `adapters/<agent>/` reads one agent's sessions and harness; `analysis/` (signals, usage, before/after, mentions) and `state/` work only on the shared model in `src/core/types.ts`.
- `dist/imh.mjs`: the bundled script the skill runs. Generated, committed (ADR 0004).
- `test/`: Vitest. `test/helpers/fixture.ts` builds a fake Claude Code home and project with transcripts in the agent's real format.

## Commands

```bash
npm install
npm test            # vitest
npm run typecheck
npm run build       # src/ -> dist/imh.mjs
npm run check       # all of the above, and fails if dist/ is stale (CI runs this)
node dist/imh.mjs --help
claude plugin validate .
```

## Rules

- Rebuild and commit `dist/` in the same commit as any change to `src/`.
- Runtime code uses only Node built-ins (Node 20+). No runtime dependencies, no lockfile (ADR 0004).
- Numbers come only from the script; the skill never estimates them (ADR 0002). New signals must carry evidence (session, line, thread) and a `partial` flag with reasons when the evidence is incomplete.
- Every string that can reach output passes through `redact()` / `excerpt()`. Hook and MCP entries keep names and shapes only (ADR 0007). Add a test with a fake secret for any new output path.
- Transcript formats are internal: parse defensively, count unknown lines, never throw on a bad line. Test new format cases in `test/helpers/fixture.ts`.
- Keep the core agent-agnostic (ADR 0005). Agent-specific paths and field names live in `src/adapters/<agent>/`.
- `skills/improve-my-harness/SKILL.md` description is loaded in every user session: keep it short.
- Bump `version` in `.claude-plugin/plugin.json` and `package.json` together on release.

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues for `guilhermebkel/improve-my-harness`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
