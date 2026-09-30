import test from "node:test";
import assert from "node:assert/strict";
import { score } from "../src/audio.ts";

test("high combos vary in a bounded register without increasing the body gain", () => {
  const cues = Array.from({ length: 32 }, (_, i) =>
    score("match", { combo: i + 8 }),
  );
  assert.ok(new Set(cues.map((c) => c[0].frequency)).size >= 5);
  assert.ok(
    cues.every((c) =>
      c.every((n) => n.frequency >= 392 && n.frequency <= 1480),
    ),
  );
  assert.equal(
    cues.filter((c) => c.some((n) => n.role === "accent")).length,
    3,
  );
  assert.ok(cues.every((c) => c[0].gain === cues[0][0].gain));
});
test("clear wins over fever entry while preserving the fruit's acknowledgement", () => {
  for (const fruit of [1, 7, 10]) {
    for (const cleared of ["win", "round"] as const) {
      const cue = score("match", {
        combo: 24,
        fruit,
        startedFever: true,
        cleared,
      });
      const ordinary = score("match", { combo: 24, fruit });
      assert.deepEqual(
        cue[0],
        ordinary.find((n) => n.role === "droplet"),
      );
      assert.deepEqual(
        cue.slice(1),
        score(cleared).map((n) => ({ ...n, delay: n.delay + 0.055 })),
      );
      assert.ok(!cue.some((n) => n.role === "body"));
    }
    const entry = score("match", { combo: 6, fruit, startedFever: true });
    assert.deepEqual(
      entry.slice(1),
      score("fever").map((n) => ({ ...n, delay: n.delay + 0.055 })),
    );
  }
  assert.notDeepEqual(score("finish"), score("win"));
});
test("all ten fruits change material, not melody, and have bounded micro-slides", () => {
  const cues = Array.from({ length: 10 }, (_, i) =>
    score("match", { combo: 9, fruit: i + 1 }),
  );
  assert.equal(new Set(cues.map((c) => JSON.stringify(c))).size, 10);
  for (const cue of cues) {
    assert.deepEqual(
      cue.map((n) => n.frequency),
      cues[0].map((n) => n.frequency),
    );
    assert.ok(cue.every((n) => n.bend <= 1.018 && n.duration <= 0.157));
    assert.ok(cue[1].duration < cue[0].duration);
  }
  for (const fruit of [undefined, 0, 99, NaN])
    assert.deepEqual(score("match", { fruit }), score("match", { fruit: 1 }));
  const base = score("match", { combo: 9, fruit: 7 });
  const fever = score("match", { combo: 9, fruit: 7, fever: true });
  assert.deepEqual(fever.slice(0, 2), base);
  assert.equal(fever.length, base.length + 1);
});
