import type { TokenUsage } from "../core/types.js";

/** USD per million tokens. Defaults are list prices and may be outdated: override in .imh/config.json. */
export interface PriceTable {
  [modelFamily: string]: { input: number; output: number; cacheRead?: number; cacheWrite?: number };
}

export const DEFAULT_PRICES: PriceTable = {
  opus: { input: 5, output: 25 },
  sonnet: { input: 3, output: 15 },
  haiku: { input: 1, output: 5 },
  default: { input: 3, output: 15 },
};

export function family(model: string | undefined, prices: PriceTable): string {
  if (!model) return "default";
  const m = model.toLowerCase();
  for (const key of Object.keys(prices)) if (key !== "default" && m.includes(key)) return key;
  return "default";
}

export function usd(usage: TokenUsage, model: string | undefined, prices: PriceTable): number {
  const p = prices[family(model, prices)] ?? prices.default ?? DEFAULT_PRICES.default!;
  const cacheRead = p.cacheRead ?? p.input * 0.1;
  const cacheWrite = p.cacheWrite ?? p.input * 1.25;
  return (usage.input * p.input + usage.output * p.output + usage.cacheRead * cacheRead + usage.cacheWrite * cacheWrite) / 1e6;
}

export function totalTokens(u: TokenUsage): number {
  return u.input + u.output + u.cacheRead + u.cacheWrite;
}

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return { input: a.input + b.input, output: a.output + b.output, cacheRead: a.cacheRead + b.cacheRead, cacheWrite: a.cacheWrite + b.cacheWrite };
}

export const ZERO: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
