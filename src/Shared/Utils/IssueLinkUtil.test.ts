import { describe, expect, it } from "vitest";
import { IssueLinkUtil } from "@/Shared/Utils/IssueLinkUtil.ts";

describe("IssueLinkUtil.linkOf()", () => {
  it("cuts the longest field to fit the link and keeps the short ones whole", () => {
    const link = IssueLinkUtil.linkOf({
      template: "rule-question",
      title: "[rule] user_correction",
      fingerprint: "abcd1234",
      fieldIdToFieldValue: {
        explanation: "word ".repeat(3000),
        versions: "harness-ledger 0.1.0 · claude-code 2.1.287 · darwin",
      },
    });
    const params = new URL(link.issueUrl).searchParams;
    expect(link.issueUrl.length).toBeLessThanOrEqual(6000);
    expect(params.get("versions")).toBe("harness-ledger 0.1.0 · claude-code 2.1.287 · darwin");
    expect(params.get("explanation")).toMatch(/\(cut to fit the link\)$/);
    expect(link.title).toBe("[rule] user_correction · abcd1234");
  });
});

describe("IssueLinkUtil.versionsText()", () => {
  it("shows many agent versions as a range", () => {
    const text = IssueLinkUtil.versionsText({
      harnessLedger: "0.1.0",
      provider: "claude-code",
      agentVersions: ["2.1.233", "2.1.246", "2.1.251", "2.1.286"],
      platforms: ["linux"],
    });
    expect(text).toBe("harness-ledger 0.1.0 · claude-code 2.1.233 to 2.1.286 (4 versions) · linux");
  });
});
