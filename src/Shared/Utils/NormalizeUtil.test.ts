import { describe, expect, it } from "vitest";
import { NormalizeUtil } from "./NormalizeUtil.js";

describe("commandKey", () => {
  it.each([
    ["npm test", "npm test"],
    ["cd app && CI=1 npm run test -- --watch=false", "npm run test"],
    ["pnpm test --filter web", "pnpm test"],
    ["git push origin main", "git push"],
    ["/usr/local/bin/pytest tests/unit -x", "pytest"],
    ["python -m pytest -q", "python -m pytest"],
    ["sudo docker compose up -d", "docker compose"],
    ["ls -la | grep foo", "ls"],
    ["export FOO=1; make build", "make build"],
  ])("%s → %s", (command, expectedKey) => {
    expect(NormalizeUtil.commandKey(command)).toBe(expectedKey);
  });
});

describe("errorKey", () => {
  it("skips exit-code lines and normalizes paths and numbers", () => {
    const error = "Exit code 1\nError: Cannot find module '/home/me/app/x.js' at line 42";
    expect(NormalizeUtil.errorKey(error)).toBe("Error: Cannot find module '…' at line N");
  });

  it("prefers an error-looking line over banners", () => {
    const error = "<notice/>\nThis result includes content.\n{\"verdict\":\"deny\",\"reason\":\"find_ambiguous\"}";
    expect(NormalizeUtil.errorKey(error)).toBe("reason: find_ambiguous");
  });
});

describe("isCorrection", () => {
  it("detects corrections in English and Portuguese", () => {
    expect(NormalizeUtil.isCorrection("no, use pnpm")).toBe(true);
    expect(NormalizeUtil.isCorrection("Na verdade, era o outro arquivo")).toBe(true);
    expect(NormalizeUtil.isCorrection("não faça commit ainda")).toBe(true);
    expect(NormalizeUtil.isCorrection("Add a login page")).toBe(false);
  });
});

describe("request similarity", () => {
  it("groups reworded requests", () => {
    const request = NormalizeUtil.wordSet("Generate the changelog entry from the last PRs please");
    const reworded = NormalizeUtil.wordSet("generate the changelog entry from the last PRs");
    expect(NormalizeUtil.jaccard(request, reworded)).toBeGreaterThanOrEqual(0.5);
    expect(NormalizeUtil.jaccard(request, NormalizeUtil.wordSet("Fix the failing login test"))).toBeLessThan(0.2);
  });
});

describe("keys for cases seen in real sessions", () => {
  it.each([
    ["git -C ../api stash pop", "git stash"],
    ["git -c core.pager=cat --no-pager log -5", "git log"],
    ["git --git-dir=.bare worktree list", "git worktree"],
  ])("%s → %s", (command, expectedKey) => {
    expect(NormalizeUtil.commandKey(command)).toBe(expectedKey);
  });

  it("skips warnings printed before the error", () => {
    expect(NormalizeUtil.errorKey("npm WARN deprecated x@1.0.0\nnpm ERR! code E404")).toBe("npm ERR! code E404");
  });
});
