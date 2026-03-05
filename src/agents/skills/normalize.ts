import type { Skill } from "@mariozechner/pi-coding-agent";

function normalizeSkillName(name: unknown): string {
  return (typeof name === "string" ? name : String(name ?? "")).trim();
}

export function normalizeLoadedSkills(skills: ReadonlyArray<Skill>): Skill[] {
  const normalized: Skill[] = [];
  for (const skill of skills) {
    const name = normalizeSkillName((skill as { name?: unknown }).name);
    if (!name) {
      continue;
    }
    normalized.push({
      ...skill,
      name,
    });
  }
  return normalized;
}
