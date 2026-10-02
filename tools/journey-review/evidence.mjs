import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve, relative, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";

export const themes = [13, 14, 15, 16, 17, 18];
export const modes = ["normal", "root32", "visible200"];
export const states = ["initial", "selected", "preview", "after"];
export const requiredChecks = [
  "hints-and-sticky-marker",
  "rejected-action-unchanged",
  "final-undo-and-rewards",
  "refresh-and-history",
  "retry-and-new-board",
  "pause-keyboard-reduced-motion",
  "legacy-three-modes-and-save-isolation",
  "export-import-roundtrip",
  "standalone-offline-generation-match-undo",
  "own-browser-cleanup",
];

export function validateEvidence(document) {
  const errors = [];
  const check = (condition, message) => {
    if (!condition) errors.push(message);
  };
  check(document.schemaVersion === 1, "Unsupported evidence schema");
  check(/^[a-f0-9]{64}$/.test(document.build?.sourceHash ?? ""), "Missing source identity");
  check(/^[a-f0-9]{64}$/.test(document.build?.offlineHash ?? ""), "Missing HTML identity");
  check(document.isolation?.blind === true, "Blind isolation not recorded");
  check(document.isolation?.ownContext === true, "Own browser context not recorded");
  check(document.freezeStart === "unchanged" && document.freezeEnd === "unchanged", "Freeze checks incomplete");
  const terminalKeys = new Set();
  for (const entry of document.terminals ?? []) {
    const key = `${entry.theme}/${entry.kind}`;
    check(!terminalKeys.has(key), `Duplicate terminal ${key}`);
    terminalKeys.add(key);
    check(themes.includes(entry.theme), `Unknown terminal theme ${key}`);
    check(["three-star", "ordinary"].includes(entry.kind), `Unknown terminal kind ${key}`);
    const expected = entry.kind === "three-star" ? "送达完成！★★★" : "送达完成！★★☆";
    check(entry.status?.startsWith(expected), `Nonterminal or wrong stars ${key}`);
    check(entry.hintLevel === 0, `Hints used for blind terminal ${key}`);
    check(Number.isInteger(entry.seed) && Number.isInteger(entry.moves) && entry.moves > 0, `Missing terminal state ${key}`);
    check(entry.goals?.length > 0 && entry.goals.every(goal => goal.delivered >= goal.required), `Incomplete quotas ${key}`);
    check(Boolean(entry.evidence) && Boolean(entry.screenshot), `Missing terminal artifacts ${key}`);
  }
  for (const theme of themes) {
    for (const kind of ["three-star", "ordinary"]) {
      check(terminalKeys.has(`${theme}/${kind}`), `Missing terminal ${theme}/${kind}`);
    }
    for (const mode of modes) {
      const entries = (document.visual ?? []).filter(entry => entry.theme === theme && entry.mode === mode);
      const initial = entries.find(entry => entry.state === "initial");
      for (const state of states) {
        const matches = entries.filter(entry => entry.state === state);
        check(matches.length === 1, `Missing or duplicate visual ${theme}/${mode}/${state}`);
        if (matches.length !== 1) continue;
        const entry = matches[0];
        const key = `${theme}/${mode}/${state}`;
        check(Boolean(entry.screenshot) && entry.viewed === true, `Unreviewed screenshot ${key}`);
        check(entry.viewport?.width === 360 && entry.viewport?.height === 640, `Wrong viewport ${key}`);
        check(entry.seed === initial?.seed, `Changed puzzle during visual capture ${key}`);
        check(entry.cells?.length > 0 && entry.cells.every(cell => cell.width >= 44 && cell.height >= 44), `Missing or small cells ${key}`);
        if (mode !== "normal") {
          check(entry.fonts?.title >= 34 && entry.fonts?.challenge >= 24, `Text enlargement not measured ${key}`);
          if (mode === "root32") check(entry.fonts?.root === 32, `Root enlargement lost ${key}`);
        }
        if (state === "after") {
          check(entry.moves === initial?.moves + 1, `No successful match before after capture ${key}`);
          check(entry.boardText !== initial?.boardText, `Unchanged board after match ${key}`);
        } else check(entry.moves === initial?.moves, `Non-action changed moves ${key}`);
        if (state === "selected") check(entry.selected === true, `No selected cell ${key}`);
        if (state === "preview") check(entry.preview === true, `No actual preview ${key}`);
      }
      if (mode !== "normal") {
        const reach = (document.reachability ?? []).find(entry => entry.theme === theme && entry.mode === mode);
        check(Boolean(reach), `Missing scroll reachability ${theme}/${mode}`);
        for (const target of ["goals", "challenge", "legend", "seed", "save"]) {
          check(reach?.targets?.[target]?.inViewport === true && Boolean(reach.targets[target].screenshot), `Unreachable or uncaptured ${theme}/${mode}/${target}`);
        }
        check(reach?.scrollHeight > reach?.clientHeight && reach?.scrollTop > 0, `Wrong scroll container ${theme}/${mode}`);
      }
    }
  }
  for (const name of requiredChecks) {
    const entry = document.checks?.[name];
    check(entry?.status === "PASS" && entry.evidence?.length > 0, `Missing mandatory check ${name}`);
  }
  check(Array.isArray(document.findings) && document.findings.length === 0, "Findings absent or unresolved");
  check(Array.isArray(document.remaining) && document.remaining.length === 0, "Remaining work absent or incomplete");
  return { pass: errors.length === 0, errors };
}

export async function validateArtifacts(document, directory) {
  const errors = [];
  const references = new Set();
  for (const entry of document.terminals ?? []) {
    if (entry.evidence) references.add(entry.evidence);
    if (entry.screenshot) references.add(entry.screenshot);
  }
  for (const entry of document.visual ?? []) if (entry.screenshot) references.add(entry.screenshot);
  for (const entry of document.reachability ?? []) {
    for (const target of Object.values(entry.targets ?? {})) if (target.screenshot) references.add(target.screenshot);
  }
  for (const entry of Object.values(document.checks ?? {})) {
    for (const path of entry.evidence ?? []) references.add(path);
  }
  for (const path of references) {
    const absolute = resolve(directory, path);
    const local = relative(directory, absolute);
    if (isAbsolute(path) || local === ".." || local.startsWith("../") || isAbsolute(local)) {
      errors.push(`Artifact outside own directory: ${path}`);
      continue;
    }
    try {
      const content = await readFile(absolute);
      const digest = createHash("sha256").update(content).digest("hex");
      if (document.artifactHashes?.[path] !== digest) errors.push(`Missing or incorrect artifact hash: ${path}`);
    } catch {
      errors.push(`Missing artifact: ${path}`);
    }
  }
  for (const entry of document.terminals ?? []) {
    if (!references.has(entry.evidence) || !entry.status) continue;
    const local = relative(directory, resolve(directory, entry.evidence));
    if (isAbsolute(entry.evidence) || local.startsWith("..")) continue;
    try {
      const text = await readFile(resolve(directory, entry.evidence), "utf8");
      if (!text.includes(entry.status) || !text.includes(`种子 ${entry.seed}`) || !text.includes(`操作 ${entry.moves}`)) {
        errors.push(`Terminal does not match raw evidence: ${entry.theme}/${entry.kind}`);
      }
    } catch {}
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (!process.argv[2]) throw new Error("Usage: node tools/journey-review/evidence.mjs /path/to/evidence.json");
    const path = resolve(process.argv[2]);
    const document = JSON.parse(await readFile(path, "utf8"));
    const result = validateEvidence(document);
    result.errors.push(...await validateArtifacts(document, dirname(path)));
    result.pass = result.errors.length === 0;
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.pass ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
