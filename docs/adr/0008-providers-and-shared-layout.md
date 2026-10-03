# Provider code in `src/Providers/<Provider>/`, everything else in `src/Shared/`, built from classes

ADR 0005 split the core from per-agent adapters, but the folders didn't make the split visible: shared detectors still matched Claude Code tool names, and Claude Code prompt tags lived in shared normalization. To keep that from creeping back as Codex and Cursor arrive, the code is laid out by who owns it, and the boundary is enforced by lint.

```
src/
├── index.ts                      entry point: new CLIModule().run(argv)
├── Shared/                       knows no provider
│   ├── Adapters/                 BaseProviderAdapter, the contract every provider extends
│   ├── Commands/                 one class per CLI command
│   ├── Modules/                  CLIModule (arguments, output) and ProviderModule (provider factory)
│   ├── Services/                 business rules: signals, usage, before/after, store, config
│   ├── Protocols/                types only
│   └── Utils/                    static helpers
└── Providers/
    └── ClaudeCode/               same folders as Shared, only for Claude Code
        ├── Adapters/ClaudeCodeProviderAdapter.ts
        ├── Services/ Protocols/ Utils/
```

- A **provider** is the agentic coding tool whose sessions and harness are read (Claude Code today). Each provider extends `BaseProviderAdapter` and returns the shared model.
- `src/Shared/` never imports from `src/Providers/`. The one exception is `Shared/Modules/ProviderModule.ts`, the composition root that creates a provider by type. A provider never imports another provider. Both rules are `no-restricted-imports` in `eslint.config.mjs`.
- Provider vocabulary is translated at the boundary. For example, the adapter sets each tool call's `category` (`shell`, `read`, `edit`, …), so shared detectors never see a tool name such as `Bash`.
- Code is written as classes: Utils are static-only classes, Services are instances with their dependencies passed to the constructor, Commands are classes with a `run` method. Runtime constants live as static members of the class that owns them; Protocols hold only types.
- Tests sit next to the file they test (`ClaudeCodeProviderAdapter.test.ts`). There is no `test/` folder.
- Each provider has its own CI workflow (`.github/workflows/claude-code.yml`), triggered by changes to that provider's files; `ci.yml` runs the shared checks on every change.

## Consequences

- Adding a provider means a new `src/Providers/<Provider>/` folder, one entry in `ProviderModule`, and one workflow. Nothing in `Shared/` changes unless the shared model needs a new field.
- Command tests in `Shared/Commands/` run end to end against the Claude Code fixture (`ClaudeCodeFixtureUtil`), because a real provider is the only way to exercise them. Test files are exempt from the import boundary for that reason. When a second provider exists, these tests can run once per provider.
- The analysis JSON says `provider` where it used to say `agent`.
