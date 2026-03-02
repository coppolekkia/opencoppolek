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
    const rel = relative(gitRoot, resolved);
    console.warn(
      `[security] WARNING: OpenClaw config directory is inside a git repo (${gitRoot}).` +
        ` Tokens in openclaw.json may be committed. Add ${rel}/ to .gitignore.`,
    );
  }
}
