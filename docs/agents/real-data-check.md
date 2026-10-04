# Checking a change on real sessions

Optional. The tests cover refactors and known cases; this shows what a change does to real numbers, which synthetic fixtures can't. Use it when you change a signal or cost rule, or add a provider (`docs/adding-a-provider.md`, step 6), and you want to see the effect on sessions you know.

- Every difference should have a cause you can name ("failures +24%: the cost now runs until the command that worked"); write the main ones in the commit message.
- A difference you can't explain is a fixture case and a test before it's accepted.

## Where the sessions come from

Use a copy of real transcripts, kept outside this repository:

- On your own machine, the provider's session folder for one project (for Claude Code, `~/.claude/projects/<encoded project dir>/`).
- In a cloud session, an export the person attaches (`docs/adding-a-provider.md`, step 2, shows how to make one).

Session files hold everything the agent read and ran, sometimes credentials. Never commit them, never quote them in commits, PRs or issues, and keep the outputs below in a scratch folder.

## The comparison

```bash
SCRATCH=<a folder outside the repo>
SESSIONS_HOME=<a folder whose projects/ holds the copy>
PROJECT=<the project dir those sessions belong to, as recorded in them>

node scripts/build.mjs --outfile "$SCRATCH/harness-ledger-after.mjs"
git stash && node scripts/build.mjs --outfile "$SCRATCH/harness-ledger-before.mjs"; git stash pop

for version in before after; do
  HARNESS_LEDGER_CLAUDE_HOME="$SESSIONS_HOME" node "$SCRATCH/harness-ledger-$version.mjs" analyze \
    --project "$PROJECT" --since 2020-01-01 --no-cache \
    --max-signals 1000 --max-evidence 1000 \
    --data-dir "$SCRATCH/data-$version" > "$SCRATCH/analysis-$version.json"
done

node scripts/compare-analyses.mjs "$SCRATCH/analysis-before.json" "$SCRATCH/analysis-after.json"
```

`--no-cache` makes both versions parse every transcript, and separate `--data-dir`s keep their caches apart. `compare-analyses.mjs` ignores the fields that change on every run (`generatedAt`, `period.until`, `dataDir`), prints each difference by path and exits 1 when there is any.

For another provider, use its home variable (`HARNESS_LEDGER_<PROVIDER>_HOME`) and `--provider`.

## When something differs

- In a refactor, any difference is a bug: find it before committing.
- In a rule change, open a few `evidence` lines for the signals that moved and check them against the transcript. A number that moved for a reason you can't name is a fixture case and a test before it's accepted.
