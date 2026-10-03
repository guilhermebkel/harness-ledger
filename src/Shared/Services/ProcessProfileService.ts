import type { ProcessStage, SessionIndex, StageProfile } from "@/Shared/Protocols/AnalysisProtocol.ts";
import type { SessionFacts, ToolCall, ToolCategory } from "@/Shared/Protocols/SessionProtocol.ts";
import { CollectionUtil } from "@/Shared/Utils/CollectionUtil.ts";
import { NormalizeUtil } from "@/Shared/Utils/NormalizeUtil.ts";
import { NumberUtil } from "@/Shared/Utils/NumberUtil.ts";
import { AttributionService } from "@/Shared/Services/AttributionService.ts";

const MAX_STAGE_COMMANDS = 5;
const MAX_STAGE_PIECES = 5;
const STAGES_WITH_COMMANDS = new Set<ProcessStage>(["setup", "validation", "delivery"]);

interface StageTotals {
  sessionIds: Set<string>;
  steps: number;
  failures: number;
  contextChars: number;
  pieceToCount: Map<string, number>;
  commandToCount: Map<string, number>;
}

export class ProcessProfileService {
  static readonly STAGES: ProcessStage[] = ["setup", "planning", "exploration", "implementation", "validation", "delivery"];

  private static readonly CATEGORY_TO_STAGE: Partial<Record<ToolCategory, ProcessStage>> = {
    plan: "planning",
    read: "exploration",
    search: "exploration",
    edit: "implementation",
  };

  profile(sessions: SessionFacts[], sessionIdToIndex: Map<string, SessionIndex>): StageProfile[] {
    const stageToTotals = new Map<ProcessStage, StageTotals>();
    for (const session of sessions) {
      const index = sessionIdToIndex.get(session.sessionId);
      for (const call of session.tools) {
        const stage = this.stageOf(call);
        if (!stage) {
          continue;
        }
        const totals = stageToTotals.get(stage) ?? this.emptyTotals();
        this.addCall(totals, session.sessionId, call, stage, index);
        stageToTotals.set(stage, totals);
      }
    }
    return ProcessProfileService.STAGES.flatMap((stage) => {
      const totals = stageToTotals.get(stage);
      return totals ? [this.toProfile(stage, totals)] : [];
    });
  }

  private addCall(
    totals: StageTotals,
    sessionId: string,
    call: ToolCall,
    stage: ProcessStage,
    index?: SessionIndex,
  ): void {
    totals.sessionIds.add(sessionId);
    totals.steps++;
    totals.failures += call.result?.isError === true ? 1 : 0;
    totals.contextChars += call.result?.contentChars ?? 0;
    const pieces = (index?.toolCallIdToPieces.get(call.id) ?? [])
      .filter((piece) => piece !== AttributionService.MAIN_PIECE);
    for (const piece of pieces) {
      totals.pieceToCount.set(piece, (totals.pieceToCount.get(piece) ?? 0) + 1);
    }
    if (call.category === "shell" && STAGES_WITH_COMMANDS.has(stage)) {
      totals.commandToCount.set(call.key, (totals.commandToCount.get(call.key) ?? 0) + 1);
    }
  }

  private stageOf(call: ToolCall): ProcessStage | undefined {
    if (call.category === "shell") {
      return NormalizeUtil.commandStage(call.key);
    }
    return ProcessProfileService.CATEGORY_TO_STAGE[call.category];
  }

  private emptyTotals(): StageTotals {
    return {
      sessionIds: new Set(),
      steps: 0,
      failures: 0,
      contextChars: 0,
      pieceToCount: new Map(),
      commandToCount: new Map(),
    };
  }

  private toProfile(stage: ProcessStage, totals: StageTotals): StageProfile {
    return {
      stage,
      sessions: totals.sessionIds.size,
      steps: totals.steps,
      failures: totals.failures,
      contextTokens: NumberUtil.charsToTokens(totals.contextChars),
      pieces: this.mostFrequent(totals.pieceToCount, MAX_STAGE_PIECES),
      commands: this.mostFrequent(totals.commandToCount, MAX_STAGE_COMMANDS),
    };
  }

  private mostFrequent(valueToCount: Map<string, number>, limit: number): string[] {
    return CollectionUtil.unique(
      [...valueToCount.entries()].sort((left, right) => right[1] - left[1]).map(([value]) => value),
    ).slice(0, limit);
  }
}
