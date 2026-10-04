export type PieceKind = "instructions" | "skill" | "agent" | "command" | "hook" | "mcp" | "plugin" | "settings";

export type PieceScope = "project" | "local" | "user" | "plugin" | "managed";

export type ModifiedSource = "git" | "mtime";

export interface HarnessPiece {
  id: string;
  kind: PieceKind;
  name: string;
  scope: PieceScope;
  path: string;
  linkedPath?: string;
  hash: string;
  bytes: number;
  approxTokens: number;
  description?: string;
  model?: string;
  tools?: string[];
  modifiedAt?: string;
  modifiedSource?: ModifiedSource;
  isEditable: boolean;
  plugin?: string;
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

export interface CompactPiece extends Pick<HarnessPiece, CompactPieceFields> { approxTokens?: number }
