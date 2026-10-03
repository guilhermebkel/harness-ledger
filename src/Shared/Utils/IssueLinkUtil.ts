import type { IssueLink, IssueRequest, IssueVersions } from "@/Shared/Protocols/GapProtocol.js";
import { HashUtil } from "@/Shared/Utils/HashUtil.js";
import { RedactUtil } from "@/Shared/Utils/RedactUtil.js";

const REPOSITORY_URL = "https://github.com/guilhermebkel/improve-my-harness";
const FINGERPRINT_CHARS = 8;
const MAX_FIELD_CHARS = 1500;
// Why: browsers and GitHub cut long URLs; past this the form opens without some fields.
const MAX_URL_CHARS = 6000;
const TRUNCATED = "\n(cut to fit the link)";
const MAX_LISTED_VERSIONS = 3;

export class IssueLinkUtil {
  static fingerprintOf(...parts: string[]): string {
    return HashUtil.sha(parts.join("\u0000"), FINGERPRINT_CHARS);
  }

  static versionsText(versions: IssueVersions): string {
    const agentVersions = IssueLinkUtil.versionRange(versions.agentVersions);
    const platforms = versions.platforms.length ? versions.platforms.join(", ") : "unknown";
    return `imh ${versions.imh} · ${versions.provider} ${agentVersions} · ${platforms}`;
  }

  // Why: sessions span many agent versions; the oldest and newest are what a format change is dated by.
  private static versionRange(sortedVersions: string[]): string {
    const oldest = sortedVersions[0];
    const newest = sortedVersions.at(-1);
    if (oldest === undefined || newest === undefined) {
      return "unknown";
    }
    return sortedVersions.length > MAX_LISTED_VERSIONS
      ? `${oldest} to ${newest} (${sortedVersions.length} versions)`
      : sortedVersions.join(", ");
  }

  static linkOf(request: IssueRequest): IssueLink {
    const title = RedactUtil.redact(`${request.title} · ${request.fingerprint}`);
    const params = new URLSearchParams({
      title,
      template: `${request.template}.yml`,
    });
    for (const [field, value] of Object.entries(request.fields)) {
      const redacted = RedactUtil.redact(value);
      params.set(field, IssueLinkUtil.fit(redacted, MAX_FIELD_CHARS));
    }
    const search = new URLSearchParams({ q: `is:issue ${request.fingerprint}` });
    return {
      title,
      issueUrl: IssueLinkUtil.withinLimit(params),
      searchUrl: `${REPOSITORY_URL}/issues?${search.toString()}`,
    };
  }

  private static fit(text: string, maxChars: number): string {
    return text.length > maxChars ? `${text.slice(0, maxChars - TRUNCATED.length)}${TRUNCATED}` : text;
  }

  // Why: the longest field is cut first, so a short field like the versions always survives.
  private static withinLimit(params: URLSearchParams): string {
    const base = `${REPOSITORY_URL}/issues/new?`;
    let url = `${base}${params.toString()}`;
    while (url.length > MAX_URL_CHARS) {
      const [longestField, longestValue] = [...params.entries()]
        .reduce((longest, entry) => (entry[1].length > longest[1].length ? entry : longest));
      if (longestValue.length <= TRUNCATED.length) {
        break;
      }
      const keptChars = Math.max(TRUNCATED.length, longestValue.length - (url.length - MAX_URL_CHARS));
      const shortened = IssueLinkUtil.fit(longestValue, keptChars);
      params.set(longestField, shortened);
      url = `${base}${params.toString()}`;
    }
    return url;
  }
}
