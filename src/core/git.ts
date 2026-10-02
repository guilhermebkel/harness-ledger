import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 15_000;
const BYTES_PER_KIBIBYTE = 1024;
const BYTES_PER_MEBIBYTE = BYTES_PER_KIBIBYTE * BYTES_PER_KIBIBYTE;
const GIT_MAX_OUTPUT_MEBIBYTES = 32;
const GIT_MAX_OUTPUT_BYTES = GIT_MAX_OUTPUT_MEBIBYTES * BYTES_PER_MEBIBYTE;
const COMMIT_MARKER = "__COMMIT__";
/** `git status --porcelain` prints a two-letter status and a space before the path. */
const PORCELAIN_PATH_OFFSET = 3;

export interface GitChangeDates {
  /** Repository-relative path → ISO date of the last commit that touched it. */
  pathToCommittedAt: Map<string, string>;
  /** Paths with uncommitted or untracked changes: their commit date doesn't describe the file on disk. */
  dirtyPaths: Set<string>;
}

/** Last commit date of each file under `paths`, in one `git log` call. Empty outside a git repository. */
export async function readGitChangeDates(repositoryDir: string, paths: string[]): Promise<GitChangeDates> {
  const changeDates: GitChangeDates = {
    pathToCommittedAt: new Map(),
    dirtyPaths: new Set(),
  };
  try {
    const { stdout: statusOutput } = await execFileAsync(
      "git",
      ["status", "--porcelain", "--untracked-files=all", "--", ...paths],
      { cwd: repositoryDir, timeout: GIT_TIMEOUT_MS },
    );
    for (const line of statusOutput.split("\n").filter((statusLine) => statusLine.length > PORCELAIN_PATH_OFFSET)) {
      changeDates.dirtyPaths.add(line.slice(PORCELAIN_PATH_OFFSET).trim());
    }
    const { stdout: logOutput } = await execFileAsync(
      "git",
      ["log", `--format=${COMMIT_MARKER}%cI`, "--name-only", "--", ...paths],
      { cwd: repositoryDir, timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_MAX_OUTPUT_BYTES },
    );
    let currentCommittedAt: string | undefined;
    for (const line of logOutput.split("\n").map((logLine) => logLine.trim())) {
      if (line.startsWith(COMMIT_MARKER)) {
        currentCommittedAt = line.slice(COMMIT_MARKER.length);
        continue;
      }
      // `git log` lists newest first, so the first date seen for a path is its last change.
      if (line && currentCommittedAt && !changeDates.pathToCommittedAt.has(line)) {
        changeDates.pathToCommittedAt.set(line, currentCommittedAt);
      }
    }
  } catch {
    // Not a git repository, or git isn't installed: every piece falls back to its mtime.
  }
  return changeDates;
}
