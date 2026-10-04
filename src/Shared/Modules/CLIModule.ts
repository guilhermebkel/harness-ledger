import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { AnalyzeCommand } from "@/Shared/Commands/AnalyzeCommand.ts";
import { CompareCommand } from "@/Shared/Commands/CompareCommand.ts";
import { EvidenceCommand } from "@/Shared/Commands/EvidenceCommand.ts";
import { InventoryCommand } from "@/Shared/Commands/InventoryCommand.ts";
import { IssueCommand } from "@/Shared/Commands/IssueCommand.ts";
import { StatusCommand } from "@/Shared/Commands/StatusCommand.ts";
import { SuggestionsCommand } from "@/Shared/Commands/SuggestionsCommand.ts";
import type { CommonOptions } from "@/Shared/Protocols/CommandProtocol.ts";
import type { ProviderType } from "@/Shared/Protocols/ProviderProtocol.ts";
import { SuggestionService } from "@/Shared/Services/SuggestionService.ts";
import { GuardUtil } from "@/Shared/Utils/GuardUtil.ts";
import { VersionUtil } from "@/Shared/Utils/VersionUtil.ts";
import { ProviderModule } from "@/Shared/Modules/ProviderModule.ts";

const MIN_NODE_MAJOR = 20;
const JSON_INDENT = 2;

const ARGUMENT_SPEC = {
  "project": { type: "string" },
  "provider": { type: "string" },
  "since": { type: "string" },
  "until": { type: "string" },
  "piece": { type: "string", multiple: true },
  "at": { type: "string" },
  "status": { type: "string" },
  "note": { type: "string" },
  "file": { type: "string" },
  "max": { type: "string" },
  "max-signals": { type: "string" },
  "max-evidence": { type: "string" },
  "data-dir": { type: "string" },
  "project-only": { type: "boolean" },
  "all-projects": { type: "boolean" },
  "no-cache": { type: "boolean" },
  "exclude-session": { type: "string", multiple: true },
  "pretty": { type: "boolean" },
  "help": { type: "boolean", short: "h" },
  "version": { type: "boolean", short: "v" },
} as const;

type ParsedValues = ReturnType<typeof CLIModule.parseArguments>["values"];

interface Invocation {
  values: ParsedValues;
  rest: string[];
  common: CommonOptions;
}

type CommandName = "analyze" | "inventory" | "evidence" | "compare" | "status" | "suggestions" | "issue";
type SuggestionsSubcommand = "list" | "add" | "set";
type CommandHandler = (invocation: Invocation) => Promise<unknown>;

export class CLIModule {
  private readonly suggestionsSubcommandToHandler: Record<SuggestionsSubcommand, CommandHandler> = {
    list: async (invocation) => this.listSuggestions(invocation),
    add: async (invocation) => this.addSuggestions(invocation),
    set: async (invocation) => this.setSuggestionStatus(invocation),
  };

  private readonly commandNameToHandler: Record<CommandName, CommandHandler> = {
    analyze: async ({ values, common }) =>
      new AnalyzeCommand().run({
        ...common,
        since: values.since,
        until: values.until,
        focusPieces: values.piece,
        maxSignals: this.readCount(values["max-signals"], "--max-signals"),
        maxEvidence: this.readCount(values["max-evidence"], "--max-evidence"),
      }),
    inventory: async ({ common }) => new InventoryCommand().run(common),
    evidence: async ({ values, rest, common }) => {
      const [signalId] = rest;
      if (!signalId) {
        throw new Error("Usage: harness-ledger evidence <signal-id>");
      }
      return new EvidenceCommand().run({
        ...common,
        signalId,
        maxEvidence: this.readCount(values.max, "--max"),
      });
    },
    compare: async ({ values, common }) => {
      const piece = values.piece?.[0];
      if (!piece) {
        throw new Error("Usage: harness-ledger compare --piece <id> [--at <date>]");
      }
      return new CompareCommand().run({
        ...common,
        piece,
        changedAt: values.at,
        since: values.since,
      });
    },
    status: async ({ common }) => new StatusCommand().run(common),
    suggestions: async (invocation) => this.runSuggestions(invocation),
    issue: async ({ values, rest, common }) => {
      const [signalId] = rest;
      if (!signalId || !values.note) {
        throw new Error("Usage: harness-ledger issue <signal-id> --note \"why the rule looks wrong\"");
      }
      return new IssueCommand().run({
        ...common,
        signalId,
        note: values.note,
      });
    },
  };

  static parseArguments(argv: string[]) {
    return parseArgs({
      args: argv,
      allowPositionals: true,
      options: ARGUMENT_SPEC,
    });
  }

  run(argv: string[]): void {
    // Why: set the exit code, never call `process.exit()`: it cuts stdout short when it is a pipe (how agents run the
    // script) and the JSON is larger than 64 KB.
    this.main(argv).then(
      () => {
        process.exitCode = 0;
      },
      (error: unknown) => {
        process.stderr.write(`harness-ledger: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
      },
    );
  }

  private help(): string {
    return `harness-ledger ${VersionUtil.VERSION} — analysis script

Usage: harness-ledger <command> [options]

Commands
  analyze                 Map the harness, read session transcripts and extract signals
  inventory               Snapshot the active harness (saved to .harness-ledger/inventory/ when it changes)
  evidence <signal-id>    All evidence for one signal from the last analysis
  compare --piece <id>    Before/after metrics for one piece (e.g. agent:code-reviewer)
  suggestions list        List suggestions [--status pending|accepted|rejected|applied]
  suggestions add         Add suggestions from --file <json> or stdin (array of objects)
  suggestions set <id> <status> [--note text]
  status                  Transcripts available, retention, pieces and config
  issue <signal-id> --note <text>
                          A prefilled GitHub issue questioning the rule behind a signal (nothing is sent)

Options
  --project <dir>         Project directory (default: current directory)
  --provider <type>       Agentic tool whose sessions to read: ${ProviderModule.types().join(", ")} `
  + `(default: ${ProviderModule.DEFAULT_PROVIDER})
  --since <period|date>   e.g. 14d, 2w, 2026-09-01
  --until <period|date>
  --piece <id>            Focus on a piece (repeatable)
  --at <date>             compare: when the piece changed (default: applied suggestion or last change)
  --project-only          Ignore user-level and plugin pieces
  --all-projects          Read transcripts from every project
  --max-signals <n>       analyze: signals in stdout (default 25)
  --max-evidence <n>      analyze: evidence per signal in stdout (default 5)
  --max <n>               evidence: evidence items (default 50)
  --data-dir <dir>        Where state lives (default: <project>/.harness-ledger)
  --exclude-session <id>  Leave a session out, e.g. the one running the analysis (repeatable)
  --no-cache              Re-parse every transcript
  --pretty                Indented JSON

Output is JSON on stdout. Nothing leaves your machine.`;
  }

  private async main(argv: string[]): Promise<void> {
    const { values, positionals } = CLIModule.parseArguments(argv);
    if (values.version) {
      process.stdout.write(`${VersionUtil.VERSION}\n`);
      return;
    }
    const [commandName, ...rest] = positionals;
    if (values.help || !commandName || commandName === "help") {
      process.stdout.write(`${this.help()}\n`);
      return;
    }
    const nodeMajor = Number(process.versions.node.split(".")[0]);
    if (nodeMajor < MIN_NODE_MAJOR) {
      throw new Error(`Node.js ${MIN_NODE_MAJOR}+ is required (found ${process.version}).`);
    }
    if (!GuardUtil.isKeyOf(this.commandNameToHandler, commandName)) {
      throw new Error(`Unknown command: ${commandName}. Run \`harness-ledger --help\`.`);
    }
    const result = await this.commandNameToHandler[commandName]({
      values,
      rest,
      common: {
        projectDir: values.project,
        dataDir: values["data-dir"],
        provider: this.readProvider(values.provider),
        isProjectOnly: values["project-only"],
        shouldReadAllProjects: values["all-projects"],
        shouldSkipCache: values["no-cache"],
        excludedSessionIds: values["exclude-session"],
      },
    });
    process.stdout.write(`${JSON.stringify(result, null, values.pretty ? JSON_INDENT : 0)}\n`);
  }

  private async runSuggestions(invocation: Invocation): Promise<unknown> {
    const [subcommand = "list"] = invocation.rest;
    if (!GuardUtil.isKeyOf(this.suggestionsSubcommandToHandler, subcommand)) {
      throw new Error(`Unknown suggestions command: ${subcommand}`);
    }
    return this.suggestionsSubcommandToHandler[subcommand](invocation);
  }

  private async listSuggestions({ values, common }: Invocation): Promise<unknown> {
    const statusFilter = values.status;
    if (statusFilter !== undefined && !SuggestionService.isStatus(statusFilter)) {
      throw new Error(`Unknown status: ${statusFilter}`);
    }
    return new SuggestionsCommand().list({
      ...common,
      status: statusFilter,
    });
  }

  private async addSuggestions({ values, common }: Invocation): Promise<unknown> {
    const rawJson = values.file ? await readFile(values.file, "utf8") : await this.readStdin();
    const items = GuardUtil.parseJson(rawJson);
    if (items === undefined) {
      throw new Error("Suggestions must be valid JSON.");
    }
    return new SuggestionsCommand().add({
      ...common,
      items,
    });
  }

  private async setSuggestionStatus({ values, rest, common }: Invocation): Promise<unknown> {
    const [, id, status] = rest;
    if (!id || !status || !SuggestionService.isStatus(status)) {
      throw new Error("Usage: harness-ledger suggestions set <id> <pending|accepted|rejected|applied> [--note text]");
    }
    return new SuggestionsCommand().setStatus({
      ...common,
      id,
      status,
      note: values.note,
    });
  }

  private readProvider(value: string | undefined): ProviderType | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (!ProviderModule.isProviderType(value)) {
      throw new Error(`Unknown provider: ${value}. Use one of: ${ProviderModule.types().join(", ")}.`);
    }
    return value;
  }

  private readCount(value: string | undefined, flag: string): number | undefined {
    if (value === undefined) {
      return undefined;
    }
    const count = Number(value);
    if (!Number.isInteger(count) || count < 0) {
      throw new Error(`${flag} must be a non-negative integer.`);
    }
    return count;
  }

  private async readStdin(): Promise<string> {
    if (process.stdin.isTTY) {
      throw new Error("Pass --file <json> or pipe JSON on stdin.");
    }
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.from(chunk as Uint8Array));
    }
    return Buffer.concat(chunks).toString("utf8");
  }
}
