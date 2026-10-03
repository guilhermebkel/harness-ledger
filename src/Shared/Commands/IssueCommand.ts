import type { IssueOptions } from "@/Shared/Protocols/CommandProtocol.ts";
import type { IssueLink } from "@/Shared/Protocols/GapProtocol.ts";
import { AnalysisService } from "@/Shared/Services/AnalysisService.ts";
import { ContextService } from "@/Shared/Services/ContextService.ts";
import { IssueLinkUtil } from "@/Shared/Utils/IssueLinkUtil.ts";
import { RedactUtil } from "@/Shared/Utils/RedactUtil.ts";

const MAX_SIGNAL_ID_CHARS = 120;

export class IssueCommand {
  async run(options: IssueOptions): Promise<IssueLink> {
    const context = await ContextService.create(options);
    const analysis = await AnalysisService.lastAnalysis(context.store);
    const signal = AnalysisService.signalById(analysis, options.signalId);
    return IssueLinkUtil.linkOf({
      template: "rule-question",
      title: `[rule] ${signal.type}`,
      fingerprint: IssueLinkUtil.fingerprintOf("rule_question", signal.type),
      // Why: only the signal, its rule and the person's own words go in; never an excerpt from a session (ADR 0010).
      fieldIdToFieldValue: {
        signal: `${signal.type}: ${RedactUtil.excerpt(signal.id, MAX_SIGNAL_ID_CHARS)}`,
        rule: `${signal.cost.method} (${signal.cost.bound})`,
        explanation: options.note,
        versions: IssueLinkUtil.versionsText(analysis.versions),
      },
    });
  }
}
