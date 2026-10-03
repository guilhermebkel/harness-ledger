import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  CheckCategory,
  CheckRunPlace,
  CheckSource,
  CheckToolDefinition,
  ConfigFileSource,
  LanguageEdits,
  LanguageMatchKind,
  LanguageMatchOf,
  MissingCheck,
  ProjectCheckTool,
  ProjectChecks,
} from "@/Shared/Protocols/CheckProtocol.js";
import type { Inventory } from "@/Shared/Protocols/HarnessProtocol.js";
import type { SessionFacts } from "@/Shared/Protocols/SessionProtocol.js";
import type { UnknownRecord } from "@/Shared/Protocols/UtilProtocol.js";
import { CheckCatalogUtil } from "@/Shared/Utils/CheckCatalogUtil.js";
import { CollectionUtil } from "@/Shared/Utils/CollectionUtil.js";
import { GuardUtil } from "@/Shared/Utils/GuardUtil.js";
import { RedactUtil } from "@/Shared/Utils/RedactUtil.js";
import { RegExpUtil } from "@/Shared/Utils/RegExpUtil.js";

const ESLINT_CONFIG_FILES = [
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  "eslint.config.ts",
  ".eslintrc",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.json",
  ".eslintrc.yml",
  ".eslintrc.yaml",
];
const PYTHON_CONFIG_FILES = [
  "pyproject.toml",
  "setup.cfg",
  "ruff.toml",
  ".ruff.toml",
  ".flake8",
  "tox.ini",
  "requirements.txt",
  "requirements-dev.txt",
];
const GOLANGCI_CONFIG_FILES = [".golangci.yml", ".golangci.yaml", ".golangci.toml", ".golangci.json"];
const MONOREPO_FILES = ["pnpm-workspace.yaml", "lerna.json", "turbo.json", "nx.json"];
// Why: a language with fewer edits than this is a side note in the period, not where checks would pay off.
const MIN_LANGUAGE_EDITS = 5;
const PACKAGE_ENTRY_FIELDS = ["exports", "main", "module", "bin"];
const UNMAPPED_PREFIX = "unmapped:";
// Why: these files belong to one tool, so the file existing means the tool is set up; a Python config file is
// shared, so a Python tool counts only when the file names it.
const DEDICATED_CONFIG_SOURCES = new Set<ConfigFileSource>(["eslint config", "golangci config"]);

type EditKeyFinder<Kind extends LanguageMatchKind> = (match: LanguageMatchOf<Kind>) => string[];
const MATCH_KIND_TO_EDIT_KEYS: { [Kind in LanguageMatchKind]: EditKeyFinder<Kind> } = {
  language: (match) => [match.language],
  notCode: () => [],
  unmapped: (match) => [`${UNMAPPED_PREFIX}${match.extension}`],
};

interface ProjectFiles {
  packageJson?: UnknownRecord;
  sourceToText: Record<Exclude<CheckSource, "package.json">, string>;
  hasMonorepoFile: boolean;
}

export class CheckInventoryService {
  constructor(private readonly projectDir: string) {}

  async inspect(sessions: SessionFacts[], inventory: Inventory): Promise<ProjectChecks> {
    const files = await this.readProjectFiles();
    const languages = CheckInventoryService.languagesOf(sessions);
    const tools = CheckCatalogUtil.TOOLS
      .map((definition) => this.detect(definition, files, sessions))
      .filter((tool): tool is ProjectCheckTool => tool !== undefined);
    const packageJson = files.packageJson;
    return {
      languages,
      tools,
      hooks: inventory.pieces
        .filter((piece) => piece.kind === "hook")
        .map((piece) => RedactUtil.redact(`${piece.name}: ${piece.description ?? ""}`)),
      isMonorepo: files.hasMonorepoFile || packageJson?.workspaces !== undefined,
      isPublishedPackage: CheckInventoryService.isPublished(packageJson),
      missing: CheckInventoryService.missingChecks(languages, tools),
      ...CheckInventoryService.unmappedPart(languages, CheckInventoryService.unmappedToolsOf(files)),
    };
  }

  private static unmappedPart(
    languages: LanguageEdits[],
    unmappedTools: string[],
  ): Pick<ProjectChecks, "unmappedTools" | "isMissingPartial" | "partialReasons"> {
    const unmappedExtensions = languages
      .map((entry) => entry.extension)
      .filter((extension) => extension !== undefined);
    const partialReasons = [
      ...(unmappedExtensions.length ? [`edits in files with no known language: ${unmappedExtensions.join(", ")}`] : []),
      ...(unmappedTools.length ? [`dependencies that may be checks outside the catalog: ${unmappedTools.join(", ")}`] : []),
    ];
    return {
      unmappedTools,
      partialReasons,
      isMissingPartial: partialReasons.length > 0,
    };
  }

  // Why: a check the catalog doesn't know must not let `missing` claim the category is uncovered, so dependencies
  // whose names look like checks are listed for the skill to look up.
  private static unmappedToolsOf(files: ProjectFiles): string[] {
    const requirementNames = files.sourceToText["python config"]
      .split("\n")
      .map((line) => /^([A-Za-z0-9_.-]+)\s*(?:[=<>~!]|$)/.exec(line.trim())?.[1])
      .filter((name) => name !== undefined);
    const knownPackages = CheckCatalogUtil.knownPackages();
    const names = [...CheckInventoryService.dependencyNames(files.packageJson), ...requirementNames];
    return CollectionUtil.unique(names)
      .filter((name) => CheckCatalogUtil.isCheckLikeName(name) && !knownPackages.has(name))
      .map((name) => RedactUtil.redact(name))
      .sort(CollectionUtil.compareCodeUnits);
  }

  private static languagesOf(sessions: SessionFacts[]): LanguageEdits[] {
    const matches = sessions
      .flatMap((session) => session.tools)
      .filter((call) => call.category === "edit" && call.filePath !== undefined)
      .map((call) => CheckCatalogUtil.languageOf(call.filePath ?? ""));
    const keys = matches.flatMap((match) => CheckInventoryService.editKeysOf(match));
    return Object.entries(CollectionUtil.countBy(keys))
      .map(([key, edits]) => (key.startsWith(UNMAPPED_PREFIX)
        ? {
            edits,
            language: "unmapped",
            extension: RedactUtil.redact(key.slice(UNMAPPED_PREFIX.length)),
          }
        : {
            edits,
            language: key,
          }))
      .sort((left, right) => right.edits - left.edits);
  }

  private static missingChecks(languages: LanguageEdits[], tools: ProjectCheckTool[]): MissingCheck[] {
    const toolDefinitions = tools.map((tool) => ({
      tool,
      definition: CheckCatalogUtil.TOOLS.find((definition) => definition.name === tool.name),
    }));
    return languages
      .filter((entry) => entry.edits >= MIN_LANGUAGE_EDITS && CheckCatalogUtil.hasCoreChecks(entry.language))
      .flatMap(({ language }) => CheckCatalogUtil.CORE_CATEGORIES
        .filter((category) => !toolDefinitions.some(({ tool, definition }) =>
          definition !== undefined && CheckCatalogUtil.coversLanguage(definition, language)
          && tool.categories.includes(category)))
        .map((category) => ({
          language,
          category,
        })));
  }

  private static isPublished(packageJson: UnknownRecord | undefined): boolean {
    const hasEntry = PACKAGE_ENTRY_FIELDS.some((field) => packageJson?.[field] !== undefined);
    return packageJson !== undefined && packageJson.private !== true && typeof packageJson.name === "string" && hasEntry;
  }

  private detect(
    definition: CheckToolDefinition,
    files: ProjectFiles,
    sessions: SessionFacts[],
  ): ProjectCheckTool | undefined {
    const configText = this.ownConfigText(definition, files);
    const scriptRuns = CheckInventoryService.scriptRunsOf(definition, files);
    const runsTool = (text: string): boolean =>
      (definition.commands ?? []).some((command) => CheckInventoryService.mentions(text, command))
      || scriptRuns.some((scriptRun) => scriptRun.test(text));
    const foundIn = this.sourcesOf(definition, files, runsTool);
    const sessionCount = sessions.filter((session) =>
      session.tools.some((call) => call.category === "shell" && runsTool(call.summary))).length;
    if (!foundIn.length && sessionCount === 0) {
      return undefined;
    }
    const markerCategories = (definition.configMarkers ?? [])
      .filter((marker) => marker.pattern.test(configText))
      .flatMap((marker) => marker.categories);
    const places: CheckRunPlace[] = [
      ...(sessionCount > 0 ? ["sessions" as const] : []),
      ...(foundIn.includes("ci") ? ["ci" as const] : []),
    ];
    return {
      name: definition.name,
      categories: CollectionUtil.unique<CheckCategory>([...definition.categories, ...markerCategories]),
      foundIn: foundIn.filter((source) => source !== "ci"),
      runsIn: places,
      sessions: sessionCount,
    };
  }

  private ownConfigText(definition: CheckToolDefinition, files: ProjectFiles): string {
    return definition.configSource ? files.sourceToText[definition.configSource] : "";
  }

  private static editKeysOf<Kind extends LanguageMatchKind>(match: LanguageMatchOf<Kind>): string[] {
    const keysOf: EditKeyFinder<Kind> = MATCH_KIND_TO_EDIT_KEYS[match.kind];
    return keysOf(match);
  }

  private sourcesOf(
    definition: CheckToolDefinition,
    files: ProjectFiles,
    runsTool: (text: string) => boolean,
  ): CheckSource[] {
    const names = [definition.name, ...(definition.packages ?? []), ...(definition.commands ?? [])];
    const dependencies = CheckInventoryService.dependencyNames(files.packageJson);
    const scripts = Object.values(GuardUtil.asRecord(files.packageJson?.scripts) ?? {}).map(String).join("\n");
    const isInPackageJson = (definition.packages ?? []).some((name) => dependencies.has(name))
      || (definition.commands ?? []).some((command) => CheckInventoryService.mentions(scripts, command));
    const sources: CheckSource[] = isInPackageJson ? ["package.json"] : [];
    const ownConfig = definition.configSource;
    const ownConfigSources = ownConfig && DEDICATED_CONFIG_SOURCES.has(ownConfig) && files.sourceToText[ownConfig] !== ""
      ? [ownConfig]
      : [];
    const isPython = definition.languages.includes("python")
      && names.some((name) => CheckInventoryService.mentions(files.sourceToText["python config"], name));
    const isInCi = runsTool(files.sourceToText.ci);
    return [
      ...sources,
      ...ownConfigSources,
      ...(isPython ? ["python config" as const] : []),
      ...(isInCi ? ["ci" as const] : []),
    ];
  }

  // Why: the agent and CI often run a check through a package.json script (`pnpm lint` running eslint), so a run
  // counts when it calls the tool directly or a script that does.
  private static scriptRunsOf(definition: CheckToolDefinition, files: ProjectFiles): RegExp[] {
    const commands = definition.commands ?? [];
    const scripts = GuardUtil.asRecord(files.packageJson?.scripts) ?? {};
    return Object.entries(scripts)
      .filter(([, scriptText]) =>
        commands.some((command) => CheckInventoryService.mentions(String(scriptText), command)))
      .map(([name]) => new RegExp(`\\b(npm|pnpm|yarn|bun)( run)? ${RegExpUtil.escape(name)}(?![\\w-])`));
  }

  private static mentions(text: string, word: string): boolean {
    return RegExpUtil.wholeTerm(word).test(text);
  }

  private static dependencyNames(packageJson: UnknownRecord | undefined): Set<string> {
    const dependencyFields = ["dependencies", "devDependencies", "optionalDependencies"];
    return new Set(dependencyFields.flatMap((field) => Object.keys(GuardUtil.asRecord(packageJson?.[field]) ?? {})));
  }

  private async readProjectFiles(): Promise<ProjectFiles> {
    const packageText = await this.readText("package.json");
    const workflowDir = join(this.projectDir, ".github", "workflows");
    const workflowFiles = await readdir(workflowDir).catch(() => [] as string[]);
    const ciTexts = await Promise.all([
      ...workflowFiles.filter((file) => /\.ya?ml$/.test(file)).map((file) => {
        const workflowFile = join(".github", "workflows", file);
        return this.readText(workflowFile);
      }),
      this.readText(".gitlab-ci.yml"),
    ]);
    const monorepoTexts = await Promise.all(MONOREPO_FILES.map((file) => this.readText(file)));
    return {
      packageJson: GuardUtil.asRecord(GuardUtil.parseJson(packageText)),
      sourceToText: {
        "eslint config": await this.readAll(ESLINT_CONFIG_FILES),
        "python config": await this.readAll(PYTHON_CONFIG_FILES),
        "golangci config": await this.readAll(GOLANGCI_CONFIG_FILES),
        "ci": ciTexts.join("\n"),
      },
      hasMonorepoFile: monorepoTexts.some((text) => text !== ""),
    };
  }

  private async readAll(relativePaths: string[]): Promise<string> {
    const texts = await Promise.all(relativePaths.map((relativePath) => this.readText(relativePath)));
    return texts.join("\n").trim();
  }

  private async readText(relativePath: string): Promise<string> {
    return readFile(join(this.projectDir, relativePath), "utf8").catch(() => "");
  }
}
