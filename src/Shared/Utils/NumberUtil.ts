const DECIMAL_BASE = 10;
const CHARS_PER_TOKEN = 4;

export class NumberUtil {
  static round(value: number, digits = 2): number {
    const factor = DECIMAL_BASE ** digits;
    return Math.round(value * factor) / factor;
  }

  /** A rough token estimate from text length, good enough to compare sizes. */
  static approxTokens(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  static charsToTokens(chars: number): number {
    return Math.round(chars / CHARS_PER_TOKEN);
  }
}
