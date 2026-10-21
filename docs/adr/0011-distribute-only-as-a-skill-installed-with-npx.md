# Distribute only as a skill, installed with `npx skills add`

harness-ledger first shipped as a Claude Code plugin (a marketplace entry that served a tagged release), with a second path for other agents. Keeping both meant two manifests, a version in three files and a second command to document for every agent we add.

Now there is one path for every provider: `npx skills add guilhermebkel/harness-ledger -g`. The `skills` CLI asks which agents to install for and copies `skills/audit-harness/` into each one's folder. There is no `.claude-plugin/` folder, no marketplace entry and no plugin validation.

## Consequences

- The skill carries its own script (`skills/audit-harness/scripts/harness-ledger.mjs`), because the CLI copies only that folder. `SKILL.md` runs the script from there with `--provider <type>`.
- The CLI installs from the default branch, not from a tag. A merge that changes `skills/` or `site/` reaches users at once; the bundled script changes only in a release, so a `SKILL.md` that needs new script behavior waits for the release or the script lags behind it. Keep the script's flags backward compatible for one release.
- `version` lives only in `package.json`. The `Release` workflow bumps it, rebuilds `dist/` and the skill's script, tags the commit and publishes the GitHub Release.
- Updates are `npx skills update`. People who installed the old plugin remove it with `/plugin uninstall` and install the skill; the README says so.
- The `skill-install` job in `ci.yml` installs the skill into a temporary folder and runs the installed script. There is no per-provider workflow.
- Adding a provider adds no manifest: it needs its skill folder in the `skills` CLI's agent list, and the checklist in `docs/adding-a-provider.md`.

