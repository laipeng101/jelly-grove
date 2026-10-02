import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { themes, modes, states, requiredChecks, validateEvidence, validateArtifacts } from "./evidence.mjs";

function completeEvidence() {
  return {
    schemaVersion: 1,
    build: { sourceHash: "a".repeat(64), offlineHash: "b".repeat(64) },
    isolation: { blind: true, ownContext: true },
    freezeStart: "unchanged",
    freezeEnd: "unchanged",
    terminals: themes.flatMap(theme => ["three-star", "ordinary"].map(kind => ({ theme, kind, status: kind === "three-star" ? "送达完成！★★★ · 可撤销最后一步" : "送达完成！★★☆ · 可撤销最后一步", hintLevel: 0, seed: theme, moves: 3, goals: [{ delivered: 1, required: 1 }], evidence: `${theme}-${kind}.txt`, screenshot: `${theme}-${kind}.png` }))),
    visual: themes.flatMap(theme => modes.flatMap(mode => states.map(state => ({ theme, mode, state, seed: theme, moves: state === "after" ? 1 : 0, boardText: state === "after" ? "changed" : "initial", screenshot: `${theme}-${mode}-${state}.png`, viewed: true, viewport: { width: 360, height: 640 }, cells: [{ width: 44, height: 44 }], fonts: { root: mode === "root32" ? 32 : 16, title: 34, challenge: 24 }, selected: state === "selected", preview: state === "preview" })))),
    reachability: themes.flatMap(theme => modes.filter(mode => mode !== "normal").map(mode => ({ theme, mode, scrollHeight: 1100, clientHeight: 630, scrollTop: 470, targets: Object.fromEntries(["goals", "challenge", "legend", "seed", "save"].map(target => [target, { inViewport: true, screenshot: `${theme}-${mode}-${target}.png` }])) }))),
    checks: Object.fromEntries(requiredChecks.map(name => [name, { status: "PASS", evidence: [`${name}.txt`] }])),
    findings: [],
    remaining: [],
  };
}

test("complete semantic matrix is accepted", () => assert.equal(validateEvidence(completeEvidence()).pass, true));
for (const [name, mutate, message] of [
  ["misnamed nonterminal", document => document.terminals[0].status = "同类水果需要用不超过两弯的空路连接。", "Nonterminal"],
  ["unfinished theme", document => document.terminals.pop(), "Missing terminal"],
  ["rejected match as after", document => document.visual.find(entry => entry.state === "after").moves = 0, "No successful match"],
  ["puzzle changes mid-capture", document => document.visual[1].seed = 999, "Changed puzzle"],
  ["lost text zoom", document => document.visual.find(entry => entry.mode === "root32").fonts.root = 16, "Root enlargement lost"],
  ["wrong scroll container", document => document.reachability[0].scrollTop = 0, "Wrong scroll container"],
  ["unviewed screenshots", document => document.visual[0].viewed = false, "Unreviewed screenshot"],
  ["missing mandatory specialty", document => delete document.checks[requiredChecks[0]], "Missing mandatory check"],
  ["unfinished quotas", document => document.terminals[0].goals[0].delivered = 0, "Incomplete quotas"],
]) {
  test(`rejects ${name}`, () => {
    const document = completeEvidence();
    mutate(document);
    const result = validateEvidence(document);
    assert.equal(result.pass, false);
    assert.ok(result.errors.some(error => error.includes(message)));
  });
}

test("rejects missing files, missing digests and path traversal", async () => {
  const directory = await mkdtemp(join(tmpdir(), "journey-evidence-"));
  try {
    await writeFile(join(directory, "present.txt"), "raw evidence");
    const errors = await validateArtifacts({ checks: { example: { evidence: ["present.txt", "missing.txt", "../outside.txt"] } } }, directory);
    assert.ok(errors.some(error => error.includes("incorrect artifact hash")));
    assert.ok(errors.some(error => error.includes("Missing artifact")));
    assert.ok(errors.some(error => error.includes("outside own directory")));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
