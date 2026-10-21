import { describe, expect, it } from "vitest";
import { CursorPathUtil } from "@/Providers/Cursor/Utils/CursorPathUtil.ts";

describe("CursorPathUtil.encodeProjectDir()", () => {
  it.each([
    ["/Users/ana/work/my-app", "Users-ana-work-my-app"],
    ["C:\\Users\\ana\\my_app", "C-Users-ana-my-app"],
  ])("turns %j into the folder name %j", (projectDir, expected) => {
    expect(CursorPathUtil.encodeProjectDir(projectDir)).toBe(expected);
  });
});
