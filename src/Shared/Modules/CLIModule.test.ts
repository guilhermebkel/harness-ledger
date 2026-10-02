import { afterEach, describe, expect, it, vi } from "vitest";
import { CLIModule } from "./CLIModule.js";

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

describe("CLIModule", () => {
  it("sets the exit code instead of exiting, so piped output is never cut short", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    new CLIModule().run(["--version"]);
    await vi.waitFor(() => {
      expect(stdoutWrite).toHaveBeenCalled();
    });
    expect(exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
  });

  it("reports errors on stderr with exit code 1", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    new CLIModule().run(["no-such-command"]);
    await vi.waitFor(() => {
      expect(process.exitCode).toBe(1);
    });
    expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining("Unknown command"));
    expect(exit).not.toHaveBeenCalled();
  });
});
