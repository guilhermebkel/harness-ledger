# Gaps leave the machine only as links the person reads and sends

People will run the skill on setups we never saw: a new transcript line, a language, a check tool, a model, a rule that is wrong for their flow. Without a way back, those cases stay invisible. The analysis therefore lists what it couldn't map as gaps, and the report turns each one, and any rule the person questions, into a link that opens a prefilled GitHub issue.

This is the first output meant to leave the machine, so ADR 0007 still holds: the script makes no network call and sends nothing. It only builds a URL; the person opens it, reads the whole text in GitHub's form, edits it and decides whether to submit.

What a link may hold:

- **Shapes, names and counts only.** Line types and their top-level keys, extensions, package and model names, counts, versions. Never values from a line, prompts, excerpts, paths or commands. A rule question adds the signal's id, the rule's method and the person's own words.
- **Never a company name.** A package scope (`@acme/…`) is replaced with `@<private>`; everything passes through `RedactUtil`. When the skill isn't sure a name is public, it asks before offering the link.
- **A fingerprint in the title**, stable across runs and versions, so the same gap from many people lands on one issue, and a search link to find it first.

## Considered Options

- Sending gaps automatically (telemetry): rejected. It breaks ADR 0007 and the trust the tool depends on.
- Asking the person to describe the problem from scratch: rejected. Few would, and the details that make a gap fixable (the line's keys, the version) are exactly what they wouldn't know to include.
- One issue form for everything: rejected. A mapping gap is usually one line in a catalog; a rule question needs a discussion. Separate forms and labels (`mapping-gap`, `rule-question`) keep triage simple.
