import { describe, expect, it } from "vitest";
import { RedactUtil } from "./RedactUtil.js";

describe("redact", () => {
  it.each([
    "sk-ant-api03-abcdefghijklmnopqrstuvwxyz",
    "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
    "AKIAABCDEFGHIJKLMNOP",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop",
  ])("masks %s", (secret) => {
    expect(RedactUtil.redact(`token is ${secret} ok`)).not.toContain(secret);
  });

  it("masks key=value secrets, bearer tokens and URL credentials", () => {
    const text = "API_KEY=supersecretvalue password: \"hunter22\" Authorization: Bearer abcdefghijklmnop123 https://user:pa55word@host.com";
    expect(RedactUtil.redact(text)).not.toMatch(/supersecretvalue|hunter22|abcdefghijklmnop123|pa55word/);
  });
});

describe("excerpt", () => {
  it("keeps ordinary text and collapses whitespace", () => {
    expect(RedactUtil.excerpt("Run   pnpm test\nnow")).toBe("Run pnpm test now");
  });
});
