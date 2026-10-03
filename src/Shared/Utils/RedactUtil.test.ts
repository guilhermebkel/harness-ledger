import { homedir } from "node:os";
import { describe, expect, it } from "vitest";
import { RedactUtil } from "@/Shared/Utils/RedactUtil.ts";

describe("RedactUtil.redact()", () => {
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

  it("masks a sensitive assignment that follows another one", () => {
    expect(RedactUtil.redact("a=password=secret1 x_auth_token: \"tok12345\"")).not.toMatch(/secret1|tok12345/);
  });

  it("stays fast on long strings without secrets", () => {
    const longWord = "a".repeat(200_000);
    const startedAtMs = performance.now();
    RedactUtil.redact(`${longWord}=value ${longWord}`);
    expect(performance.now() - startedAtMs).toBeLessThan(1000);
  });

  describe("on the home folder", () => {
    it("shows the home folder, and the user name in it, as ~", () => {
      const command = `cd ${homedir()}/work/app && npm test`;
      expect(RedactUtil.redact(command)).toBe("cd ~/work/app && npm test");
    });
  });
});

describe("RedactUtil.excerpt()", () => {
  it("keeps ordinary text and collapses whitespace", () => {
    expect(RedactUtil.excerpt("Run   pnpm test\nnow")).toBe("Run pnpm test now");
  });
});
