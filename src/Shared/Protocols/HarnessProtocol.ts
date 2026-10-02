// The provider-agnostic harness model: the pieces active for a project at a point in time.

export type PieceKind = "instructions" | "skill" | "agent" | "command" | "hook" | "mcp" | "plugin" | "settings";

export type PieceScope = "project" | "local" | "user" | "plugin" | "managed";

export type ModifiedSource = "git" | "mtime";

export interface HarnessPiece {
  /** Stable id, e.g. "agent:code-reviewer", "skill:changelog", "instructions:project". */
  id: string;
  kind: PieceKind;
  name: string;
  scope: PieceScope;
  /** Relative to the project for project and local pieces; absolute with `~` otherwise. */
  path: string;
  /** Short sha256 of the content. */
  hash: string;
  bytes: number;
  approxTokens: number;
  description?: string;
  model?: string;
  tools?: string[];
  /** Last change: the last commit touching the file, or its mtime when uncommitted or outside git. */
  modifiedAt?: string;
  modifiedSource?: ModifiedSource;
  /** False for pieces the user doesn't control (plugins, managed settings). */
  isEditable: boolean;
  /** Plugin id for pieces that come from a plugin. */
  plugin?: string;
}

export interface Retention {
  days: number;
  /** The settings file that set it, or "default". */
  source: string;
}

export interface Inventory {
  provider: string;
  projectDir: string;
  takenAt: string;
  /** Changes whenever any piece changes. */
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

type CompactPieceFields = "id" | "scope" | "path" | "modifiedAt" | "isEditable" | "model" | "description";

/** Enough to identify and locate a piece, without hashes and sizes. */
export interface CompactPiece extends Pick<HarnessPiece, CompactPieceFields> {
  /** Left out for pieces without text (hooks, MCP servers, settings). */
  approxTokens?: number;
}
