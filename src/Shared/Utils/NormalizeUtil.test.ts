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
    ["source ~/.nvm/nvm.sh && nvm use 18 && timeout 300 npm run build", "npm run build"],
    ["cd repo; B=feat/x\ngit checkout -b $B", "git checkout"],
    ["for f in a b\ndo\n  wc -l $f\ndone", "wc"],
  ])("%s → %s", (command, expectedKey) => {
    expect(NormalizeUtil.commandKey(command)).toBe(expectedKey);
  });

  it("skips warnings printed before the error", () => {
    expect(NormalizeUtil.errorKey("npm WARN deprecated x@1.0.0\nnpm ERR! code E404")).toBe("npm ERR! code E404");
  });
});

describe("commandStage", () => {
  it.each([
    ["npm run test", "validation"],
    ["npx tsc", "validation"],
    ["pnpm lint", "validation"],
    ["git push", "delivery"],
    ["gh pr", "delivery"],
    ["git checkout", "setup"],
    ["pnpm install", "setup"],
    ["grep", "exploration"],
    ["python3 report.py", undefined],
  ])("%s → %s", (commandKey, expectedStage) => {
    expect(NormalizeUtil.commandStage(commandKey)).toBe(expectedStage);
  });
});

describe("bugs found running the skill on real sessions", () => {
  it("doesn't read Portuguese 'no' (in the) as a correction", () => {
    expect(NormalizeUtil.isCorrection("no backend não precisa de permissão")).toBe(false);
    expect(NormalizeUtil.isCorrection("no, use pnpm")).toBe(true);
    expect(NormalizeUtil.isCorrection("no")).toBe(true);
  });

  it("strips terminal colors and clock times from error keys", () => {
    expect(NormalizeUtil.errorKey("\u001b[0m14:44:07  Database Error in model stg_x")).toBe("Database Error in model stg_x");
  });

  it("keys an error announced by a header line on the line after it", () => {
    const dbtOutput = "\u001b[0m14:44:07  Running with dbt=1.8.0\n\u001b[0m14:44:08  Encountered an error:\nCompilation Error in model stg_users";
    expect(NormalizeUtil.errorKey(dbtOutput)).toBe("Compilation Error in model stg_users");
  });

  it("skips separator lines and keys a cut-off traceback on what follows it", () => {
    expect(NormalizeUtil.errorKey("Exit code 1\n=========\nAttributeError: no row field 'x'")).toBe("AttributeError: no row field '…'");
    expect(NormalizeUtil.errorKey("Traceback (most recent call last):\n  File \"a.py\", line 3")).toBe("File '…', line N");
  });
});
