import type { ThreadRef } from "@/Shared/Protocols/SessionProtocol.ts";

export class SessionUtil {
  static readonly MAIN_THREAD_ID = "main";

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
