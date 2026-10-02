import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import {
  cmdAnalyze,
  cmdCompare,
  cmdEvidence,
  cmdInventory,
  cmdStatus,
  cmdSuggestionsAdd,
  cmdSuggestionsList,
  cmdSuggestionsSet,
  VERSION,
  type NewSuggestion,
} from "./commands.js";
import type { SuggestionStatus } from "./state/store.js";

const HELP = `imh ${VERSION} — improve-my-harness analysis script

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
  --since <period|date>   e.g. 14d, 2w, 2026-09-01
  --until <period|date>
  --piece <id>            Focus on a piece (repeatable)
  --at <date>             compare: when the piece changed (default: applied suggestion or last change)
  --project-only          Ignore user-level and plugin pieces
  --all-projects          Read transcripts from every project
  --max-signals <n>       analyze: signals in stdout (default 25)
  --max-evidence <n>      analyze: evidence per signal in stdout (default 5)
  --data-dir <dir>        Where state lives (default: <project>/.imh)
  --exclude-session <id>  Leave a session out, e.g. the one running the analysis (repeatable)
  --no-cache              Re-parse every transcript
  --pretty                Indented JSON

Output is JSON on stdout. Nothing leaves your machine.`;

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      project: { type: "string" },
      since: { type: "string" },
      until: { type: "string" },
      piece: { type: "string", multiple: true },
      at: { type: "string" },
      status: { type: "string" },
      note: { type: "string" },
      file: { type: "string" },
      max: { type: "string" },
      "max-signals": { type: "string" },
      "max-evidence": { type: "string" },
      "data-dir": { type: "string" },
      "project-only": { type: "boolean" },
      "all-projects": { type: "boolean" },
      "no-cache": { type: "boolean" },
      "exclude-session": { type: "string", multiple: true },
      pretty: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });

  if (values.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  const [cmd, ...rest] = positionals;
  if (values.help || !cmd || cmd === "help") {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }

  const major = Number(process.versions.node.split(".")[0]);
  if (major < 20) throw new Error(`Node.js 20+ is required (found ${process.version}).`);

  const common = {
    project: values.project,
    dataDir: values["data-dir"],
    projectOnly: values["project-only"],
    allProjects: values["all-projects"],
    noCache: values["no-cache"],
    excludeSessions: values["exclude-session"],
  };
  const int = (v: string | undefined) => (v === undefined ? undefined : Number.parseInt(v, 10));

  let result: unknown;
  switch (cmd) {
    case "analyze":
      result = await cmdAnalyze({
        ...common,
        since: values.since,
        until: values.until,
        pieces: values.piece,
        maxSignals: int(values["max-signals"]),
        maxEvidence: int(values["max-evidence"]),
      });
      break;
    case "inventory":
      result = await cmdInventory(common);
      break;
    case "evidence":
      if (!rest[0]) throw new Error("Usage: imh evidence <signal-id>");
      result = await cmdEvidence({ ...common, signal: rest[0], max: int(values.max) });
      break;
    case "compare": {
      const piece = values.piece?.[0];
      if (!piece) throw new Error("Usage: imh compare --piece <id> [--at <date>]");
      result = await cmdCompare({ ...common, piece, at: values.at, since: values.since });
      break;
    }
    case "status":
      result = await cmdStatus(common);
      break;
    case "suggestions": {
      const sub = rest[0] ?? "list";
      if (sub === "list") result = await cmdSuggestionsList({ ...common, status: values.status });
      else if (sub === "add") {
        const raw = values.file ? await readFile(values.file, "utf8") : await readStdin();
        const parsed = JSON.parse(raw) as NewSuggestion | NewSuggestion[];
        result = await cmdSuggestionsAdd({ ...common, items: Array.isArray(parsed) ? parsed : [parsed] });
      } else if (sub === "set") {
        const [, id, status] = rest;
        if (!id || !status) throw new Error("Usage: imh suggestions set <id> <pending|accepted|rejected|applied> [--note text]");
        result = await cmdSuggestionsSet({ ...common, id, status: status as SuggestionStatus, note: values.note });
      } else throw new Error(`Unknown suggestions command: ${sub}`);
      break;
    }
    default:
      throw new Error(`Unknown command: ${cmd}. Run \`imh --help\`.`);
  }
  process.stdout.write(`${JSON.stringify(result, null, values.pretty ? 2 : 0)}\n`);
  return 0;
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) throw new Error("Pass --file <json> or pipe JSON on stdin.");
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    process.stderr.write(`imh: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
