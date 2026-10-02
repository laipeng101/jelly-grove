import { writeFileSync, mkdirSync } from "node:fs";
import { generatePuzzle, fingerprint } from "../src/journey/generator";
import { replay } from "../src/journey/solver";
import { challengeMet } from "../src/journey/rules";
import type { Puzzle, ThemeId } from "../src/journey/types";
const backups: Puzzle[] = [],
  metrics = [];
for (const theme of [13, 14, 15, 16, 17, 18] as ThemeId[]) {
  const seen = new Set<string>();
  let seed = theme * 100000,
    attempts = 0;
  while (seen.size < 32) {
    if (attempts++ > 1000)
      throw new Error(`Theme ${theme}: insufficient distinct verified boards`);
    const result = generatePuzzle(theme, seed++, 2800);
    if (result.status !== "generated") continue;
    const p = result.puzzle,
      key = fingerprint(p);
    if (seen.has(key)) continue;
    const win = replay(p, p.proof.challenge),
      ordinary = replay(p, p.proof.ordinary);
    if (
      !win ||
      !ordinary ||
      !challengeMet(p, win) ||
      ordinary.phase !== "won" ||
      challengeMet(p, ordinary)
    )
      throw new Error("Invalid proof");
    seen.add(key);
    backups.push(p);
  }
  metrics.push({ theme, distinct: seen.size, requests: attempts });
  console.log(`Theme ${theme}: ${seen.size} distinct certified backups`);
}
writeFileSync("src/journey/backups.json", JSON.stringify(backups));
mkdirSync("output/journey", { recursive: true });
writeFileSync(
  "output/journey/backups-report.json",
  JSON.stringify({ generatorVersion: 1, metrics }, null, 2),
);
