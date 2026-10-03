export type GapKind
  = | "unknown_line"
    | "unmapped_extension"
    | "unmapped_check_tool"
    | "unpriced_model"
    | "unresolved_subagent";

export type IssueTemplate = "mapping-gap" | "rule-question";

export interface IssueLink {
  title: string;
  issueUrl: string;
  searchUrl: string;
}

export interface Gap extends IssueLink {
  kind: GapKind;
  fingerprint: string;
  details: string[];
}

export interface IssueRequest {
  template: IssueTemplate;
  title: string;
  fingerprint: string;
  fieldIdToFieldValue: Record<string, string>;
}

export interface IssueVersions {
  imh: string;
  provider: string;
  agentVersions: string[];
  platforms: string[];
}
