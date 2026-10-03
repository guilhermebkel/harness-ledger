export type PieceKind = "instructions" | "skill" | "agent" | "command" | "hook" | "mcp" | "plugin" | "settings";

export type PieceScope = "project" | "local" | "user" | "plugin" | "managed";

export type ModifiedSource = "git" | "mtime";

export interface HarnessPiece {
  // Why: stable ids; suggestions and before/after refer to them.
  id: string;
  kind: PieceKind;
  name: string;
  scope: PieceScope;
  // Why: relative to the project for project and local pieces; absolute with `~` otherwise.
  path: string;
  hash: string;
  bytes: number;
  approxTokens: number;
  description?: string;
  model?: string;
  tools?: string[];
  // Why: the last commit touching the file, or its mtime when uncommitted or outside git.
  modifiedAt?: string;
  modifiedSource?: ModifiedSource;
  // Why: false for pieces the user doesn't control (plugins, managed settings).
  isEditable: boolean;
  plugin?: string;
  // Why: relative to `path`'s folder.
  files?: string[];
  preloadedSkills?: string[];
}

export interface Retention {
  days: number;
  source: string;
}

export interface Inventory {
  provider: string;
  projectDir: string;
  takenAt: string;
  fingerprint: string;
  pieces: HarnessPiece[];
  retention: Retention;
  notes: string[];
}

export type PieceChangeKind = "added" | "removed" | "modified";

export interface InventoryChange {
  id: string;
  change: PieceChangeKind;
}

type CompactPieceFields
  = | "id"
    | "scope"
    | "path"
    | "modifiedAt"
    | "isEditable"
    | "model"
    | "description"
    | "files"
    | "preloadedSkills";

export interface CompactPiece extends Pick<HarnessPiece, CompactPieceFields> {
  // Why: left out for pieces without text (hooks, MCP servers, settings).
  approxTokens?: number;
}
