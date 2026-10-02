import { homedir } from "node:os";

export class PathUtil {
  /** Replaces the home directory prefix with `~`, so outputs don't leak usernames. */
  static tildify(path: string): string {
    const home = homedir();
    return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
  }

  static untildify(path: string): string {
    return path.startsWith("~") ? `${homedir()}${path.slice(1)}` : path;
  }
}
