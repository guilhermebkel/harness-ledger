import type { ThreadRef } from "../Protocols/SessionProtocol.js";

export class SessionUtil {
  /** Thread id (and agent type) of a session's main thread. */
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
