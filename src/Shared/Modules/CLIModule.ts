// The `imh` command line. Validates arguments at the edge, runs one command and prints its
// result as JSON. This is the only module that writes to stdout and stderr.

import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { AnalyzeCommand } from "@/Shared/Commands/AnalyzeCommand.js";
import { CompareCommand } from "@/Shared/Commands/CompareCommand.js";
import { EvidenceCommand } from "@/Shared/Commands/EvidenceCommand.js";
import { InventoryCommand } from "@/Shared/Commands/InventoryCommand.js";
import { StatusCommand } from "@/Shared/Commands/StatusCommand.js";
import { SuggestionsCommand } from "@/Shared/Commands/SuggestionsCommand.js";
import type { CommonOptions } from "@/Shared/Protocols/CommandProtocol.js";
import type { ProviderType } from "@/Shared/Protocols/ProviderProtocol.js";
import { SuggestionService } from "@/Shared/Services/SuggestionService.js";
import { GuardUtil } from "@/Shared/Utils/GuardUtil.js";
import { VersionUtil } from "@/Shared/Utils/VersionUtil.js";
import { ProviderModule } from "./ProviderModule.js";

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
  /** Positional arguments after the command name. */
  rest: string[];
  common: CommonOptions;
}

type CommandName = "analyze" | "inventory" | "evidence" | "compare" | "status" | "suggestions";
type CommandHandler = (invocation: Invocation) => Promise<unknown>;

export class CLIModule {
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
        throw new Error("Usage: imh evidence <signal-id>");
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
        throw new Error("Usage: imh compare --piece <id> [--at <date>]");
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
  };

  static parseArguments(argv: string[]) {
    return parseArgs({
      args: argv,
      allowPositionals: true,
      options: ARGUMENT_SPEC,
    });
  }

  /**
   * Runs the CLI and sets the exit code: 0 on success, 1 on error. It never calls `process.exit()`, which
   * would cut stdout short when it's a pipe (how agents run the script) and the JSON is larger than 64 KB.
   */
  run(argv: string[]): void {
    this.main(argv).then(
      () => {
        process.exitCode = 0;
      },
      (error: unknown) => {
        process.stderr.write(`imh: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
      },
    );
  }

  private help(): string {
    return `imh ${VersionUtil.VERSION} — improve-my-harness analysis script

Usage: imh <command> [options]

Commands
  analyze                 Map the harness, read session transcripts and extract signals
  inventory               Snapshot the active harness (saved to .imh/inventory/ when it changes)
  evidence <signal-id>    All evidence for one signal from the last analysis
  compare --piece <id>    Before/after metrics for one piece (e.g. agent:code-reviewer)
  suggestions list        List suggestions [--status pending|accepted|rejected|applied]
  suggestions add         Add suggestions from --file <json> or stdin (array of objects)
  suggestions set <id> <status> [--note text]
  status                  Transcripts available, retention, pieces and config

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
  --data-dir <dir>        Where state lives (default: <project>/.imh)
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
    if (!this.isCommandName(commandName)) {
      throw new Error(`Unknown command: ${commandName}. Run \`imh --help\`.`);
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

  private isCommandName(value: string): value is CommandName {
    return Object.hasOwn(this.commandNameToHandler, value);
  }

  private async runSuggestions({ values, rest, common }: Invocation): Promise<unknown> {
    const [subcommand = "list", id, status] = rest;
    const command = new SuggestionsCommand();
    if (subcommand === "list") {
      const statusFilter = values.status;
      if (statusFilter !== undefined && !SuggestionService.isStatus(statusFilter)) {
        throw new Error(`Unknown status: ${statusFilter}`);
      }
      return command.list({
        ...common,
        status: statusFilter,
      });
    }
    if (subcommand === "add") {
      const rawJson = values.file ? await readFile(values.file, "utf8") : await this.readStdin();
      const items = GuardUtil.parseJson(rawJson);
      if (items === undefined) {
        throw new Error("Suggestions must be valid JSON.");
      }
      return command.add({
        ...common,
        items,
      });
    }
    if (subcommand === "set") {
      if (!id || !status || !SuggestionService.isStatus(status)) {
        throw new Error("Usage: imh suggestions set <id> <pending|accepted|rejected|applied> [--note text]");
      }
      return command.setStatus({
        ...common,
        id,
        status,
        note: values.note,
      });
    }
    throw new Error(`Unknown suggestions command: ${subcommand}`);
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
