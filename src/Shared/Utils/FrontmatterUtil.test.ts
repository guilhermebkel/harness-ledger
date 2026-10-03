import { describe, expect, it } from "vitest";
import { FrontmatterUtil } from "@/Shared/Utils/FrontmatterUtil.ts";

describe("FrontmatterUtil.parse()", () => {
  it("reads scalars, comma lists and folded text", () => {
    const { keyToValue } = FrontmatterUtil.parse("---\nname: x\ntools: Read, Bash(git *)\ndescription: >\n  multi\n  line\n---\nbody");
    expect(keyToValue.name).toBe("x");
    expect(keyToValue.tools).toBe("Read, Bash(git *)");
    expect(keyToValue.description).toBe("multi line");
  });
});
