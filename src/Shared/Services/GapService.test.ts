import { describe, expect, it } from "vitest";
import type { ProjectChecks } from "@/Shared/Protocols/CheckProtocol.js";
import type { IssueVersions } from "@/Shared/Protocols/GapProtocol.js";
import { SessionFactsBuilder } from "@/Shared/Utils/SessionFactsFixtureUtil.js";
import { GapService } from "./GapService.js";

const VERSIONS: IssueVersions = {
  imh: "0.1.0",
  provider: "claude-code",
  agentVersions: ["2.1.287"],
  platforms: ["darwin"],
};

function checksWith(fields: Partial<ProjectChecks>): ProjectChecks {
  return {
    languages: [],
    tools: [],
    hooks: [],
    isMonorepo: false,
    isPublishedPackage: false,
    missing: [],
    unmappedTools: [],
    isMissingPartial: false,
    partialReasons: [],
    ...fields,
  };
}

const noChecks = checksWith({});

function paramsOf(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

describe("GapService", () => {
  it("turns each mapping gap into a prefilled mapping-gap issue", () => {
    const [gap] = new GapService(VERSIONS).gapsOf({
      sessions: [],
      checks: checksWith({ languages: [{ language: "unmapped", edits: 12, extension: ".ex" }] }),
      unpricedModels: [],
      usage: [],
    });
    expect(gap?.kind).toBe("unmapped_extension");
    expect(gap?.details).toStrictEqual(["extension: .ex", "edits: 12"]);
    const params = paramsOf(gap?.issueUrl ?? "");
    expect(params.get("template")).toBe("mapping-gap.yml");
    expect(params.get("title")).toBe(`[gap] file extension with no language ".ex" · ${gap?.fingerprint ?? ""}`);
    expect(params.get("details")).toBe("extension: .ex\nedits: 12");
    expect(params.get("versions")).toBe("imh 0.1.0 · claude-code 2.1.287 · darwin");
    expect(gap?.searchUrl).toContain(`is%3Aissue+${gap?.fingerprint ?? ""}`);
  });

  it("adds up unknown line shapes across sessions", () => {
    const shape = { type: "workspace-sync", keys: ["syncId", "type"] };
    const first = new SessionFactsBuilder("s1").build();
    first.unknownLines = [{ ...shape, count: 2 }];
    const second = new SessionFactsBuilder("s2").build();
    second.unknownLines = [{ ...shape, count: 1 }];
    const [gap] = new GapService(VERSIONS).gapsOf({
      sessions: [first, second],
      checks: noChecks,
      unpricedModels: [],
      usage: [],
    });
    expect(gap?.details).toStrictEqual(["type: workspace-sync", "keys: syncId, type", "lines: 3 in 2 sessions"]);
  });

  it("keeps a package's scope out of the link, and never carries a secret", () => {
    const gaps = new GapService(VERSIONS).gapsOf({
      sessions: [],
      checks: checksWith({ unmappedTools: ["@acme/lint-config", "lint-ghp_abcdefghijklmnopqrstuvwxyz123456"] }),
      unpricedModels: [],
      usage: [],
    });
    expect(gaps.map((gap) => gap.details)).toStrictEqual([
      ["package: @<private>/lint-config"],
      ["package: lint-[REDACTED]"],
    ]);
    expect(gaps.map((gap) => gap.issueUrl).join(" ")).not.toContain("acme");
    expect(gaps.map((gap) => gap.issueUrl).join(" ")).not.toContain("ghp_");
  });

  it("gives the same gap the same fingerprint on every run", () => {
    const input = { sessions: [], checks: noChecks, unpricedModels: ["glm-5.2"], usage: [] };
    const [first] = new GapService(VERSIONS).gapsOf(input);
    const [again] = new GapService({ ...VERSIONS, imh: "0.2.0" }).gapsOf(input);
    expect(first?.kind).toBe("unpriced_model");
    expect(again?.fingerprint).toBe(first?.fingerprint);
  });

  it("orders agent versions by number, oldest first", () => {
    const sessions = ["2.1.100", "2.1.99", "2.1.100"].map((agentVersion, index) => {
      const session = new SessionFactsBuilder(`s${index}`).build();
      session.agentVersion = agentVersion;
      return session;
    });
    expect(GapService.versionsOf(sessions, "0.1.0", "claude-code").agentVersions).toStrictEqual(["2.1.99", "2.1.100"]);
  });
});
