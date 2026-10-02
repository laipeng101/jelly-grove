import test from "node:test";
import assert from "node:assert/strict";
import { classicLevel } from "../src/classic-levels";
import { LEVELS, makeLayout } from "../src/engine";

test("classic presets preserve geometry independently of journey content", () => {
  for (const mode of ["free", "sprint"] as const) {
    for (let difficulty = 0; difficulty < 3; difficulty++) {
      const classic = classicLevel(mode, difficulty);
      const previous = LEVELS[[2, 7, 16][difficulty]];
      assert.deepEqual(makeLayout(classic), makeLayout(previous));
      assert.equal(classic.kinds, previous.kinds);
      assert.equal(classic.gravity, mode === "free" && difficulty === 2);
    }
  }
  const preset = classicLevel("free", 2);
  preset.layout!.stones![0].r = 0;
  assert.equal(classicLevel("free", 2).layout!.stones![0].r, 1);
});
