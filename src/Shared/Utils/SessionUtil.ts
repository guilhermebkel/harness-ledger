import type { ThreadRef, ToolCategory } from "@/Shared/Protocols/SessionProtocol.ts";

export class SessionUtil {
  static readonly MAIN_THREAD_ID = "main";
  // Why: a call's key is a command for these categories and an MCP server for those; shared code reads it by role.
  static readonly COMMAND_CATEGORIES: ReadonlySet<ToolCategory> = new Set<ToolCategory>(["shell"]);
  static readonly MCP_CATEGORIES: ReadonlySet<ToolCategory> = new Set<ToolCategory>(["mcp"]);

  static mainThread(): ThreadRef {
    return {
      id: SessionUtil.MAIN_THREAD_ID,
      agentType: SessionUtil.MAIN_THREAD_ID,
    };
  }

  static isMainThread(thread: ThreadRef): boolean {
    return thread.id === SessionUtil.MAIN_THREAD_ID;
  }
}
