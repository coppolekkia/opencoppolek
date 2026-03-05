import fs from "node:fs";
import path from "node:path";
import { loadSkillsFromDir } from "@mariozechner/pi-coding-agent";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { resolveBundledSkillsDir, type BundledSkillsResolveOptions } from "./bundled-dir.js";
import { parseFrontmatter } from "./frontmatter.js";
import { normalizeLoadedSkills } from "./normalize.js";

const skillsLogger = createSubsystemLogger("skills");
let hasWarnedMissingBundledDir = false;
let cachedBundledContext: { dir: string; names: Set<string> } | null = null;

export type BundledSkillsContext = {
  dir?: string;
  names: Set<string>;
};

export function resolveBundledSkillsContext(
  opts: BundledSkillsResolveOptions = {},
): BundledSkillsContext {
  const dir = resolveBundledSkillsDir(opts);
  const names = new Set<string>();
  if (!dir) {
    if (!hasWarnedMissingBundledDir) {
      hasWarnedMissingBundledDir = true;
      skillsLogger.warn(
        "Bundled skills directory could not be resolved; built-in skills may be missing.",
      );
    }
    return { dir, names };
  }

  if (cachedBundledContext?.dir === dir) {
    return { dir, names: new Set(cachedBundledContext.names) };
  }
  const result = loadSkillsFromDir({ dir, source: "openclaw-bundled" });
  for (const skill of normalizeLoadedSkills(result.skills)) {
    if (skill.name.trim()) {
      names.add(skill.name);
    }
  }
  const dirEntries = (() => {
    try {
      return fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }
  })();
  for (const entry of dirEntries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules" || !entry.isDirectory()) {
      continue;
    }
    const skillMdPath = path.join(dir, entry.name, "SKILL.md");
    if (!fs.existsSync(skillMdPath)) {
      continue;
    }
    try {
      const raw = fs.readFileSync(skillMdPath, "utf-8");
      const frontmatter = parseFrontmatter(raw);
      const name = (
        typeof frontmatter.name === "string" ? frontmatter.name : String(frontmatter.name ?? "")
      ).trim();
      if (name) {
        names.add(name);
      }
    } catch {
      // Ignore malformed bundled skill files.
    }
  }
  cachedBundledContext = { dir, names: new Set(names) };
  return { dir, names };
}
