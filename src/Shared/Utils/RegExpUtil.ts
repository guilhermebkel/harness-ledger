export class RegExpUtil {
  static escape(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  static wholeTerm(term: string, flags = ""): RegExp {
    return new RegExp(`(?<![\\w-])${RegExpUtil.escape(term)}(?![\\w-])`, flags);
  }
}
