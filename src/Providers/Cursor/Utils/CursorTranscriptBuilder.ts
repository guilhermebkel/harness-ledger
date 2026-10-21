import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CursorFixture } from "@/Providers/Cursor/Protocols/CursorFixtureProtocol.ts";
import { CursorPathUtil } from "@/Providers/Cursor/Utils/CursorPathUtil.ts";

export class CursorTranscriptBuilder {
  private readonly lines: string[] = [];

  user(query: string): this {
    const text = `<timestamp>Tuesday, Sep 1, 2026</timestamp>\n<user_query>\n${query}\n</user_query>`;
    return this.row("user", [{ type: "text", text }]);
  }

  attachment(text: string): this {
    return this.row("user", [{ type: "text", text: `<attached_files>\n${text}\n</attached_files>` }]);
  }

  say(text: string): this {
    return this.row("assistant", [{ type: "text", text }]);
  }

  tool(name: string, input: unknown): this {
    return this.row("assistant", [{ type: "tool_use", name, input }]);
  }

  turnEnded(): this {
    this.lines.push(JSON.stringify({ type: "turn_ended", status: "success" }));
    return this;
  }

  failedTurn(error: string): this {
    this.lines.push(JSON.stringify({ type: "turn_ended", status: "error", error }));
    return this;
  }

  raw(record: Record<string, unknown>): this {
    this.lines.push(JSON.stringify(record));
    return this;
  }

  rawLine(text: string): this {
    this.lines.push(text);
    return this;
  }

  writeTo(fixture: CursorFixture, projectFolder: string, relativeFile: string): string {
    const file = join(fixture.cursorHome, "projects", projectFolder, "agent-transcripts", relativeFile);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${this.lines.join("\n")}\n`);
    return file;
  }

  static folderOf(projectDir: string): string {
    return CursorPathUtil.encodeProjectDir(projectDir);
  }

  private row(role: string, content: unknown[]): this {
    this.lines.push(JSON.stringify({ role, message: { content } }));
    return this;
  }
}
