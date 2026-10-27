import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findSkillRootDir(startDir) {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "SKILL.md"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  throw new Error("无法定位技能根目录，找不到 SKILL.md");
}

export const SKILL_ROOT = findSkillRootDir(__dirname);
