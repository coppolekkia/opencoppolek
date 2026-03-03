import { existsSync } from "fs";
import { resolve, dirname, relative } from "path";

function findGitRoot(startDir: string): string | null {
  let dir = resolve(startDir);

  while (true) {
    if (existsSync(resolve(dir, ".git"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function checkConfigInGitRepo(configDir: string): void {
  const resolved = resolve(configDir);
  const gitRoot = findGitRoot(resolved);
  if (gitRoot) {
    // Normalize to forward slashes for .gitignore (Windows compat)
    const rel = relative(gitRoot, resolved).replace(/\\/g, "/");
    // If configDir IS the git root, advise ignoring the config file directly
    const gitignoreEntry = rel === "" ? "openclaw.json" : `${rel}/`;
    console.warn(
      `[security] WARNING: OpenClaw config directory is inside a git repo (${gitRoot}). ` +
        `Tokens in openclaw.json may be committed. Add ${gitignoreEntry} to .gitignore.`,
    );
  }
}
