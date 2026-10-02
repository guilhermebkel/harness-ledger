import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "../src/core/frontmatter.js";
import { cleanPrompt, commandKey, errorKey, isCorrection, jaccard, wordSet } from "../src/core/normalize.js";
import { excerpt, redact } from "../src/core/redact.js";
import { activeTime, parsePointInTime } from "../src/core/time.js";

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
    expect(commandKey(command)).toBe(expectedKey);
  });
});

describe("errorKey", () => {
  it("skips exit-code lines and normalizes paths and numbers", () => {
    const error = "Exit code 1\nError: Cannot find module '/home/me/app/x.js' at line 42";
    expect(errorKey(error)).toBe("Error: Cannot find module '…' at line N");
  });

  it("prefers an error-looking line over banners", () => {
    const error = "<notice/>\nThis result includes content.\n{\"verdict\":\"deny\",\"reason\":\"find_ambiguous\"}";
    expect(errorKey(error)).toBe("reason: find_ambiguous");
  });
});

describe("cleanPrompt", () => {
  it("strips system reminders and reads slash commands", () => {
    const prompt = cleanPrompt(
      "<system-reminder>x</system-reminder><command-name>/changelog</command-name><command-args>for v2</command-args>",
    );
    expect(prompt).toEqual({ text: "for v2", command: "changelog" });
  });
});

describe("isCorrection", () => {
  it("detects corrections in English and Portuguese", () => {
    expect(isCorrection("no, use pnpm")).toBe(true);
    expect(isCorrection("Na verdade, era o outro arquivo")).toBe(true);
    expect(isCorrection("não faça commit ainda")).toBe(true);
    expect(isCorrection("Add a login page")).toBe(false);
  });
});

describe("request similarity", () => {
  it("groups reworded requests", () => {
    const request = wordSet("Generate the changelog entry from the last PRs please");
    expect(jaccard(request, wordSet("generate the changelog entry from the last PRs"))).toBeGreaterThanOrEqual(0.5);
    expect(jaccard(request, wordSet("Fix the failing login test"))).toBeLessThan(0.2);
  });
});

describe("redact", () => {
  it.each([
    "sk-ant-api03-abcdefghijklmnopqrstuvwxyz",
    "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
    "AKIAABCDEFGHIJKLMNOP",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop",
  ])("masks %s", (secret) => {
    expect(redact(`token is ${secret} ok`)).not.toContain(secret);
  });

  it("masks key=value secrets, bearer tokens and URL credentials", () => {
    const text = "API_KEY=supersecretvalue password: \"hunter22\" Authorization: Bearer abcdefghijklmnop123 https://user:pa55word@host.com";
    expect(redact(text)).not.toMatch(/supersecretvalue|hunter22|abcdefghijklmnop123|pa55word/);
  });

  it("keeps ordinary text", () => {
    expect(excerpt("Run   pnpm test\nnow")).toBe("Run pnpm test now");
  });
});

describe("time", () => {
  it("parses periods and dates", () => {
    const nowAtMs = Date.parse("2026-10-01T00:00:00Z");
    expect(parsePointInTime("2d", nowAtMs)).toBe(Date.parse("2026-09-29T00:00:00Z"));
    expect(parsePointInTime("2026-09-01", nowAtMs)).toBe(Date.parse("2026-09-01"));
    expect(() => parsePointInTime("yesterday", nowAtMs)).toThrow();
  });

  it("excludes idle gaps from active time", () => {
    expect(activeTime([0, 1000, 2000, 2000 + 10 * 60_000], 5 * 60_000)).toBe(2000);
  });
});

describe("parseFrontmatter", () => {
  it("reads scalars, comma lists and folded text", () => {
    const { data } = parseFrontmatter("---\nname: x\ntools: Read, Bash(git *)\ndescription: >\n  multi\n  line\n---\nbody");
    expect(data.name).toBe("x");
    expect(data.tools).toBe("Read, Bash(git *)");
    expect(data.description).toBe("multi line");
  });
});
