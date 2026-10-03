export type GapKind
  = | "unknown_line"
    | "unmapped_extension"
    | "unmapped_check_tool"
    | "unpriced_model"
    | "unresolved_subagent";

// Why: mapping gaps are usually one line in a catalog; rule questions need a discussion, so they get their own form.
export type IssueTemplate = "mapping-gap" | "rule-question";

export interface IssueLink {
  title: string;
  // Why: opens a prefilled form; the person reads it and decides whether to send it. Nothing is sent by the script.
  issueUrl: string;
  // Why: finds an issue already open for the same fingerprint, so the person can add a 👍 instead.
  searchUrl: string;
}

// Why: shapes and counts only (type names, keys, extensions, package and model names), redacted; never content.
export interface Gap extends IssueLink {
  kind: GapKind;
  fingerprint: string;
  details: string[];
}

export interface IssueRequest {
  template: IssueTemplate;
  title: string;
  fingerprint: string;
  // Why: keys are the form's field ids in .github/ISSUE_TEMPLATE/<template>.yml.
  fields: Record<string, string>;
}

export interface IssueVersions {
  imh: string;
  provider: string;
  agentVersions: string[];
  platforms: string[];
}
