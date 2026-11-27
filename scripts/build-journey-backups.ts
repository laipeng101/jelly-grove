import { writeFileSync, mkdirSync } from "node:fs";
import { generatePuzzle, fingerprint } from "../src/journey/generator";
import { THEMES } from "../src/journey/themes";
import {
  BACKUPS_PER_THEME,
  GENERATOR_VERSION,
  type Puzzle,
} from "../src/journey/types";
import { BATCH_GENERATION_BUDGET_MS } from "./journey-generation";

const backups: Puzzle[] = [],
  metrics = [];
for (const { id: theme } of THEMES) {
  const seen = new Set<string>();
  let seed = theme * 100000,
    attempts = 0;
  while (seen.size < BACKUPS_PER_THEME) {
    if (attempts++ > 1000)
      throw new Error(`Theme ${theme}: insufficient distinct verified boards`);
    const result = generatePuzzle(theme, seed++, BATCH_GENERATION_BUDGET_MS);
    if (result.status !== "generated") continue;
    const p = result.puzzle,
      key = fingerprint(p);
    if (seen.has(key)) continue;
    seen.add(key);
    backups.push(p);
  }
  metrics.push({ theme, distinct: seen.size, requests: attempts });
  console.log(`Theme ${theme}: ${seen.size} distinct certified backups`);
}
const backupDirectory = "src/journey/generated";
mkdirSync(backupDirectory, { recursive: true });
writeFileSync(`${backupDirectory}/backups.json`, JSON.stringify(backups));
mkdirSync("output/journey", { recursive: true });
writeFileSync(
  "output/journey/backups-report.json",
  JSON.stringify({ generatorVersion: GENERATOR_VERSION, metrics }, null, 2),
);
