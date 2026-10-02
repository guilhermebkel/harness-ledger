import type { TokenUsage } from "@/Shared/Protocols/SessionProtocol.js";

export class TokenUsageUtil {
  static zero(): TokenUsage {
    return {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    };
  }

  static add(left: TokenUsage, right: TokenUsage): TokenUsage {
    return {
      input: left.input + right.input,
      output: left.output + right.output,
      cacheRead: left.cacheRead + right.cacheRead,
      cacheWrite: left.cacheWrite + right.cacheWrite,
    };
  }

  static total(usage: TokenUsage): number {
    return usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
  }
}
