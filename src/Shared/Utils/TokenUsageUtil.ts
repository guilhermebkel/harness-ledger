import type { TokenUsage } from "@/Shared/Protocols/SessionProtocol.ts";

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

  static scale(usage: TokenUsage, factor: number): TokenUsage {
    return {
      input: usage.input * factor,
      output: usage.output * factor,
      cacheRead: usage.cacheRead * factor,
      cacheWrite: usage.cacheWrite * factor,
    };
  }

  static sum(usages: TokenUsage[]): TokenUsage {
    return usages.reduce((total, usage) => TokenUsageUtil.add(total, usage), TokenUsageUtil.zero());
  }

  // Why: includes cache reads and writes.
  static input(usage: TokenUsage): number {
    return usage.input + usage.cacheRead + usage.cacheWrite;
  }

  static total(usage: TokenUsage): number {
    return usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
  }
}
