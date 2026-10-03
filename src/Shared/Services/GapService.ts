import type { PieceUsage } from "@/Shared/Protocols/AnalysisProtocol.ts";
import type { ProjectChecks } from "@/Shared/Protocols/CheckProtocol.ts";
import type { Gap, GapKind, IssueVersions } from "@/Shared/Protocols/GapProtocol.ts";
import type { SessionFacts } from "@/Shared/Protocols/SessionProtocol.ts";
import { AttributionService } from "@/Shared/Services/AttributionService.ts";
import { CollectionUtil } from "@/Shared/Utils/CollectionUtil.ts";
import { IssueLinkUtil } from "@/Shared/Utils/IssueLinkUtil.ts";
import { RedactUtil } from "@/Shared/Utils/RedactUtil.ts";

const MAX_NAME_CHARS = 80;
const MAX_DETAIL_CHARS = 200;
const PRIVATE_SCOPE = "@<private>";

interface GapInput {
  sessions: SessionFacts[];
  checks: ProjectChecks;
  unpricedModels: string[];
  usage: PieceUsage[];
}

interface GapDraft {
  title: string;
  key: string;
  details: string[];
}

interface LineShapeCount {
  type: string;
  keys: string[];
  lines: number;
  sessionIds: Set<string>;
}

export class GapService {
  private readonly kindToDrafts: Record<GapKind, (input: GapInput) => GapDraft[]> = {
    unknown_line: (input) => GapService.unknownLineDrafts(input.sessions),
    unmapped_extension: (input) => input.checks.languages
      .filter((language) => language.extension !== undefined)
      .map((language) => ({
        key: language.extension ?? "",
        title: `file extension with no language "${language.extension ?? ""}"`,
        details: [`extension: ${language.extension ?? ""}`, `edits: ${language.edits}`],
      })),
    unmapped_check_tool: (input) => input.checks.unmappedTools.map((name) => {
      const shownName = GapService.publicName(name);
      return {
        key: shownName,
        title: `check tool not in the catalog "${shownName}"`,
        details: [`package: ${shownName}`],
      };
    }),
    unpriced_model: (input) => input.unpricedModels.map((model) => ({
      key: model,
      title: `model with no price "${model}"`,
      details: [`model: ${model}`],
    })),
    unresolved_subagent: (input) => input.usage
      .filter((usage) => usage.piece === AttributionService.UNRESOLVED_SUBAGENT_PIECE)
      .map((usage) => ({
        key: usage.piece,
        title: "subagent type not resolved",
        details: [`invocations: ${usage.invocations}`, `sessions: ${usage.sessions}`],
      })),
  };

  constructor(private readonly versions: IssueVersions) {}

  static publicName(packageName: string): string {
    const shortName = RedactUtil.excerpt(packageName, MAX_NAME_CHARS);
    // Why: a scoped package often names the company (`@acme/lint-config`); the scope never goes in a link.
    return shortName.startsWith("@") ? `${PRIVATE_SCOPE}/${shortName.split("/").slice(1).join("/")}` : shortName;
  }

  static versionsOf(sessions: SessionFacts[], imhVersion: string, provider: string): IssueVersions {
    const agentVersions = sessions.map((session) => session.agentVersion).filter((version) => version !== undefined);
    const platforms = sessions
      .map((session) => session.environment.platform)
      .filter((platform) => platform !== undefined);
    return {
      provider,
      imh: imhVersion,
      agentVersions: CollectionUtil.unique(agentVersions).sort(GapService.compareVersions),
      platforms: CollectionUtil.unique(platforms).sort(CollectionUtil.compareCodeUnits),
    };
  }

  private static readonly compareVersions = (left: string, right: string): number =>
    left.localeCompare(right, "en", { numeric: true });

  gapsOf(input: GapInput): Gap[] {
    return (Object.keys(this.kindToDrafts) as GapKind[]).flatMap((kind) =>
      this.kindToDrafts[kind](input).map((draft) => this.gapOf(kind, draft)));
  }

  private gapOf(kind: GapKind, draft: GapDraft): Gap {
    const fingerprint = IssueLinkUtil.fingerprintOf(kind, draft.key);
    const details = draft.details.map((detail) => RedactUtil.excerpt(detail, MAX_DETAIL_CHARS));
    const link = IssueLinkUtil.linkOf({
      fingerprint,
      template: "mapping-gap",
      title: `[gap] ${draft.title}`,
      fieldIdToFieldValue: {
        kind,
        details: details.join("\n"),
        versions: IssueLinkUtil.versionsText(this.versions),
      },
    });
    return {
      kind,
      fingerprint,
      details,
      ...link,
    };
  }

  private static unknownLineDrafts(sessions: SessionFacts[]): GapDraft[] {
    const signatureToCount = new Map<string, LineShapeCount>();
    for (const session of sessions) {
      for (const shape of session.unknownLines ?? []) {
        const signature = `${shape.type}|${shape.keys.join(",")}`;
        const count = signatureToCount.get(signature) ?? {
          type: shape.type,
          keys: shape.keys,
          lines: 0,
          sessionIds: new Set<string>(),
        };
        count.lines += shape.count;
        count.sessionIds.add(session.sessionId);
        signatureToCount.set(signature, count);
      }
    }
    return [...signatureToCount.values()].map((count) => ({
      key: `${count.type}|${count.keys.join(",")}`,
      title: `unknown transcript line "${count.type}"`,
      details: [
        `type: ${count.type}`,
        `keys: ${count.keys.join(", ")}`,
        `lines: ${count.lines} in ${count.sessionIds.size} sessions`,
      ],
    }));
  }
}
