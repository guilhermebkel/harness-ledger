# Everything stays local, and only redacted, derived data is stored

The tool has no server and no telemetry. Transcripts are read in place and never copied; `.harness-ledger/` in the project holds only derived data (signals with evidence pointers, inventory snapshots, suggestion status, cache). Secret-looking values are masked before anything leaves the parser, and hook commands and MCP server configs are reduced to names and shapes (env, headers and arguments are never stored).

## Consequences

- Reports, suggestions and commits must never contain secret values, even partially. A secret noticed in a transcript is mentioned to the user privately, not turned into a suggestion.
- `.harness-ledger/` should be gitignored in user projects; the skill asks before adding it.
- Applying a suggestion only touches harness files, never plugin files, application code or retention settings, and always after explicit confirmation.
