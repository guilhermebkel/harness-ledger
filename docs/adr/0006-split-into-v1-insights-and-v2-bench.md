# Split into v1 Insights (read-only) and v2 Bench (runs variants)

v1 only reads history and suggests changes; v2 adds hooks, git checkpoints, isolated runs of variants, an LLM judge and blind human review to prove a change before adopting it. v1 is small, useful on its own and has no cost beyond the session; v2 spends model tokens and needs much more machinery. Splitting keeps the project from stalling and lets v1 feedback shape v2.

## Consequences

- v1 has no hooks and never runs the agent. Its before/after is observational and labeled as weaker than the bench.
- The inventory module is shared: v2 reuses it as the harness manifest of each bench run.
- If v2 runs late, the Codex run adapter and duel mode are the first cuts.
