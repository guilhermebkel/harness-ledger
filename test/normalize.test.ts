import { describe, expect, it } from "vitest";
import { cleanPrompt, commandKey, errorKey, isCorrection, jaccard, shingles } from "../src/core/normalize.js";
import { excerpt, redact } from "../src/core/redact.js";
import { parseFrontmatter, parseSince } from "../src/core/util.js";

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
  ])("%s → %s", (cmd, key) => {
    expect(commandKey(cmd)).toBe(key);
  });
});

describe("errorKey", () => {
  it("skips exit-code lines and normalizes paths and numbers", () => {
    expect(errorKey("Exit code 1\nError: Cannot find module '/home/me/app/x.js' at line 42")).toBe("Error: Cannot find module '…' at line N");
  });
  it("prefers an error-looking line over banners", () => {
    expect(errorKey('<notice/>\nThis result includes content.\n{"verdict":"deny","reason":"find_ambiguous"}')).toBe("reason: find_ambiguous");
  });
});

describe("cleanPrompt", () => {
  it("strips system reminders and reads slash commands", () => {
    const r = cleanPrompt("<system-reminder>x</system-reminder><command-name>/changelog</command-name><command-args>for v2</command-args>");
    expect(r).toEqual({ text: "for v2", command: "changelog" });
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

describe("similarity", () => {
  it("groups reworded requests", () => {
    const a = shingles("Generate the changelog entry from the last PRs please");
    const b = shingles("generate the changelog entry from the last PRs");
    expect(jaccard(a, b)).toBeGreaterThanOrEqual(0.5);
    expect(jaccard(a, shingles("Fix the failing login test"))).toBeLessThan(0.2);
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
    const out = redact('API_KEY=supersecretvalue password: "hunter22" Authorization: Bearer abcdefghijklmnop123 https://user:pa55word@host.com');
    expect(out).not.toMatch(/supersecretvalue|hunter22|abcdefghijklmnop123|pa55word/);
  });
  it("keeps ordinary text", () => {
    expect(excerpt("Run   pnpm test\nnow")).toBe("Run pnpm test now");
  });
});

describe("util", () => {
  it("parses periods and dates", () => {
    const now = Date.parse("2026-10-01T00:00:00Z");
    expect(parseSince("2d", now)).toBe(Date.parse("2026-09-29T00:00:00Z"));
    expect(parseSince("2026-09-01", now)).toBe(Date.parse("2026-09-01"));
    expect(() => parseSince("yesterday", now)).toThrow();
  });
  it("reads frontmatter", () => {
    const { data } = parseFrontmatter("---\nname: x\ntools: Read, Bash(git *)\ndescription: >\n  multi\n  line\n---\nbody");
    expect(data.name).toBe("x");
    expect(data.tools).toBe("Read, Bash(git *)");
    expect(data.description).toBe("multi line");
  });
});
