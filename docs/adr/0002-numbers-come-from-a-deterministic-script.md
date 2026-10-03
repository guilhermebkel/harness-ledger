# Numbers come from a deterministic script; the agent only classifies and writes

Analysis is split in two: a local script extracts signals, counts, time and cost from transcripts and prints compact JSON; the agent (through the skill) groups signals into findings, classifies them and writes the change. The model never produces a number, a session id or a transcript line, so reports can be traced and re-checked, and the analysis spends little context.

## Considered Options

- Let the agent read transcripts directly: rejected. Transcripts are large (megabytes per session), the model would estimate counts, and evidence would not be reproducible.
- Script-only report with templated suggestions: rejected. Classifying a failure (ignored rule vs. missing instruction) needs to read the piece and judge it.
