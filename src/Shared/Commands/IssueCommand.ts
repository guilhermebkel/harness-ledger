import type { IssueOptions } from "@/Shared/Protocols/CommandProtocol.js";
import type { IssueLink } from "@/Shared/Protocols/GapProtocol.js";
import { AnalysisService } from "@/Shared/Services/AnalysisService.js";
import { ContextService } from "@/Shared/Services/ContextService.js";
import { IssueLinkUtil } from "@/Shared/Utils/IssueLinkUtil.js";
import { RedactUtil } from "@/Shared/Utils/RedactUtil.js";

const MAX_SIGNAL_ID_CHARS = 120;

// Why: a rule question carries the signal and the rule that produced it, and the person's own words; never an
// excerpt from a session.
export class IssueCommand {
  async run(options: IssueOptions): Promise<IssueLink> {
    const context = await ContextService.create(options);
    const analysis = await AnalysisService.lastAnalysis(context.store);
    const signal = AnalysisService.signalById(analysis, options.signalId);
    return IssueLinkUtil.linkOf({
      template: "rule-question",
      title: `[rule] ${signal.type}`,
      fingerprint: IssueLinkUtil.fingerprintOf("rule_question", signal.type),
      fields: {
        signal: `${signal.type}: ${RedactUtil.excerpt(signal.id, MAX_SIGNAL_ID_CHARS)}`,
        rule: `${signal.cost.method} (${signal.cost.bound})`,
        explanation: options.note,
        versions: IssueLinkUtil.versionsText(analysis.versions),
      },
    });
  }
}
