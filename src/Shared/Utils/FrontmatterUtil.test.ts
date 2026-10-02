import { describe, expect, it } from "vitest";
import { FrontmatterUtil } from "./FrontmatterUtil.js";

describe("parse", () => {
  it("reads scalars, comma lists and folded text", () => {
    const { data } = FrontmatterUtil.parse("---\nname: x\ntools: Read, Bash(git *)\ndescription: >\n  multi\n  line\n---\nbody");
    expect(data.name).toBe("x");
    expect(data.tools).toBe("Read, Bash(git *)");
    expect(data.description).toBe("multi line");
  });
});
