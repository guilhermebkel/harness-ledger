export class RegExpUtil {
  static escape(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Why: whole terms only: "cat" must not match "category", and "lint" must not match "eslint-plugin".
  static wholeTerm(term: string, flags = ""): RegExp {
    return new RegExp(`(?<![\\w-])${RegExpUtil.escape(term)}(?![\\w-])`, flags);
  }
}
