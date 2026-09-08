// SPDX-License-Identifier: Apache-2.0
// Copy the installable skills into public/ so the site serves /skill.md and /skills/<id>.md.
// One source of truth (../../skills); this build step is the only copy.
import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const skillsDir = join(here, "..", "..", "..", "skills");
const publicDir = join(here, "..", "public");
const outSkills = join(publicDir, "skills");
mkdirSync(outSkills, { recursive: true });

const files = readdirSync(skillsDir).filter((f) => f.endsWith(".skill.md"));
for (const f of files) {
  const id = f.replace(/\.skill\.md$/, "");
  cpSync(join(skillsDir, f), join(outSkills, `${id}.md`));
}
// the platform skill is also served at /skill.md, with a published sha256 the site checks
const platform = readFileSync(join(skillsDir, "arena.skill.md"));
writeFileSync(join(publicDir, "skill.md"), platform);
const sha = createHash("sha256").update(platform).digest("hex");
writeFileSync(join(publicDir, "skill.sha256.txt"), sha + "\n");
console.log(`copied ${files.length} skills; /skill.md sha256 ${sha.slice(0, 16)}...`);
