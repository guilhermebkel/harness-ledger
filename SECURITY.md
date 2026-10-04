# Security policy

`improve-my-harness` reads coding-agent transcripts, and transcripts hold everything the agent saw and ran: file contents, command output, sometimes credentials. Keeping that data on your machine and out of every report is the core promise of this project, so a way around it is a security issue.

## Reporting a vulnerability

Report it privately through GitHub's [private vulnerability reporting](https://github.com/guilhermebkel/improve-my-harness/security/advisories/new). Only the maintainer sees the report.

Please don't open a public issue with the details. If private reporting doesn't work for you, open an issue titled `security: <one-line summary>` with no details, and you'll get a private channel.

Never paste a real transcript, a real secret or company data in a report. A synthetic line that reproduces the problem is enough, and better: it can become a test.

Helpful to include:

- What leaks or happens, and where (report, `.imh/` files, stdout, an issue link, a harness file).
- A minimal synthetic input that shows it: a transcript line, a settings file, a hook entry.
- The version (`node dist/imh.mjs --help` prints it) and your agent's version.
- Whether you'd like credit in the release notes.

## What to expect

- An acknowledgement within a few days.
- For a confirmed issue, a fix or a mitigation plan within about 30 days, released through the normal release process.
- Credit in the release notes once the fix ships, if you want it.

## Scope

The plugin runs locally. The analysis script reads transcripts in place, prints JSON and writes only to `.imh/` in the analyzed project. It makes no network calls; issue links are built for you to open and send yourself.

In scope:

- **A secret or session content reaching output**: a report, stdout, `.imh/` (cached facts, analyses, suggestions), or an issue link, despite redaction.
- **Issue links carrying more than shapes, names and counts** (ADR 0010): paths, commands, prompts or excerpts from a session.
- **Hook or MCP entries stored with their commands, arguments, headers or env values** instead of names and shapes (ADR 0007).
- **Code execution from analyzed data**: a crafted transcript, settings file or skill file that makes the script or the skill run a command, or write outside `.imh/`.
- **Harness edits outside what was confirmed**: the skill changing a file the person didn't approve, a file outside the harness, or a plugin's or managed piece.
- **Retention settings changed**: anything that alters `cleanupPeriodDays` or deletes transcripts.

Out of scope:

- Problems that need someone who can already write to your project or home folder (they could read the transcripts directly).
- The agent itself, its transcript format or its retention, which belong to the agent's vendor.
- Wrong or noisy findings with no data exposure. Those are bugs; open a regular issue or a rule question.

## Supported versions

Fixes go into the next release. Update with `/plugin` → Installed → Update, or `claude plugin update improve-my-harness@guilhermebkel`.
