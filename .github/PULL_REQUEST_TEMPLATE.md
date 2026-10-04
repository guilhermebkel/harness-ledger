## What and why

<!-- One or two sentences on what this changes and why. -->

## Linked issue

<!-- Closes #123, or leave empty. -->

## How I tested it

<!-- "pnpm check" is the minimum. Better: what you ran on a real project and what changed in the analysis. Describe it by numbers and shapes, never session content. -->

- [ ] `pnpm check` passes
- [ ] New behavior has a test next to the file it tests (and a fixture case for any new transcript format)
- [ ] New output paths are redacted and tested with a fake secret

## Checklist

- [ ] No real transcripts, excerpts, paths from sessions, secrets or company names anywhere in the diff
- [ ] `dist/`, `version` and the marketplace `ref` are untouched (releases change them)
- [ ] Cost changes are reflected in `docs/cost-model.md`
- [ ] Docs, `GLOSSARY.md` or an ADR updated if behavior or vocabulary changed
