import test from "node:test";
import assert from "node:assert/strict";
import backups from "../src/journey/backups.json";
import { selectBackup } from "../src/journey/backups";
import {
  candidate,
  certify,
  fingerprint,
  generatePuzzle,
} from "../src/journey/generator";
import {
  challengeMet,
  initialState,
  validatePuzzle,
} from "../src/journey/rules";
import { replay, solve, stateKey } from "../src/journey/solver";
import type { Board, Point } from "../src/engine";
import type { Move, Puzzle, ThemeId } from "../src/journey/types";
const ids = [13, 14, 15, 16, 17, 18] as ThemeId[];
/** Independent directional BFS, deliberately not the production path enumerator. */
function connects(board: Board, a: Point, b: Point): boolean {
  if (
    board[a.r][a.c] <= 0 ||
    board[a.r][a.c] !== board[b.r][b.c] ||
    (a.r === b.r && a.c === b.c)
  )
    return false;
  const h = board.length,
    w = board[0].length,
    dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ],
    seen = new Map<string, number>();
  const queue = dirs.map((_, dir) => ({ r: a.r, c: a.c, dir, turns: 0 }));
  for (let i = 0; i < queue.length; i++) {
    const q = queue[i];
    for (let dir = 0; dir < 4; dir++) {
      const turns = q.turns + (q.dir === dir ? 0 : 1);
      if (turns > 2) continue;
      const r = q.r + dirs[dir][0],
        c = q.c + dirs[dir][1];
      if (r < -1 || r > h || c < -1 || c > w) continue;
      if (r === b.r && c === b.c) return true;
      if (r >= 0 && r < h && c >= 0 && c < w && board[r][c] !== 0) continue;
      const key = `${r},${c},${dir}`;
      if ((seen.get(key) ?? 3) <= turns) continue;
      seen.set(key, turns);
      queue.push({ r, c, dir, turns });
    }
  }
  return false;
}
type Independent = {
  board: Board;
  progress: Record<number, number>;
  fuel: number;
  outside: number;
  first: number[];
  missed: number[];
};
function independentInitial(p: Puzzle): Independent {
  return {
    board: structuredClone(p.initial),
    progress: {},
    fuel: 0,
    outside: 0,
    first: [],
    missed: [],
  };
}
function independentStep(
  p: Puzzle,
  s: Independent,
  m: Move,
): Independent | null {
  if (!connects(s.board, m.a, m.b)) return null;
  const stage = p.stages[0];
  if (stage.goal.kind === "clear") return null;
  assert.equal(stage.goal.kind, "deliver");
  const f = s.board[m.a.r][m.a.c],
    at = (q: Point) => stage.ports.some((x) => x.r === q.r && x.c === q.c),
    credit =
      stage.goal.quotas[f] &&
      (s.progress[f] || 0) < stage.goal.quotas[f] &&
      (at(m.a) || at(m.b));
  if (
    s.board.flat().filter((v) => v === f).length - 2 <
    Math.max(
      0,
      (stage.goal.quotas[f] || 0) - (s.progress[f] || 0) - (credit ? 1 : 0),
    ) *
      2
  )
    return null;
  const n = structuredClone(s);
  for (const [kind, quota] of Object.entries(stage.goal.quotas)) {
    const k = Number(kind);
    if (
      (s.progress[k] || 0) >= quota ||
      n.first.includes(k) ||
      n.missed.includes(k)
    )
      continue;
    if (stage.ports.some((q) => s.board[q.r][q.c] === k))
      (credit && f === k ? n.first : n.missed).push(k);
  }
  if (credit) n.progress[f] = (n.progress[f] || 0) + 1;
  if (stage.goal.quotas[f] && !at(m.a) && !at(m.b)) n.outside++;
  if (!stage.goal.quotas[f]) n.fuel++;
  n.board[m.a.r][m.a.c] = n.board[m.b.r][m.b.c] = 0;
  const before = structuredClone(n.board);
  assert.equal(stage.movement.kind, "conveyor");
  if (stage.movement.kind === "conveyor")
    for (const t of stage.movement.tracks)
      for (let i = 0; i < t.cells.length; i++) {
        const dest =
            t.cells[(i + t.direction + t.cells.length) % t.cells.length],
          src = t.cells[i];
        n.board[dest.r][dest.c] = before[src.r][src.c];
      }
  return n;
}
function won(p: Puzzle, s: Independent) {
  const g = p.stages[0].goal;
  return (
    g.kind !== "clear" &&
    Object.entries(g.quotas).every(
      ([f, n]) => (s.progress[Number(f)] || 0) >= n,
    )
  );
}
function independentChallenge(p: Puzzle, s: Independent) {
  if (!won(p, s)) return false;
  const c = p.challenge;
  return c.kind === "fuel"
    ? s.fuel <= c.limit
    : c.kind === "no-outside"
      ? s.outside === 0
      : c.kind === "preserve"
        ? s.board.flat().filter((v) => v === c.fruit).length >= c.pairs * 2
        : c.fruits.every((f) => s.first.includes(f) && !s.missed.includes(f));
}
function independentReplay(p: Puzzle, moves: Move[]) {
  let s = independentInitial(p);
  for (const m of moves) {
    assert.equal(won(p, s), false, "proof must stop at first completion");
    const n = independentStep(p, s, m);
    assert.ok(n, `independent rejected ${p.id}`);
    s = n;
  }
  return s;
}
function independentMinimum(p: Puzzle): number {
  const memo = new Map<string, number>();
  const visit = (s: Independent): number => {
    if (won(p, s)) return s.fuel;
    const key = JSON.stringify([s.board, s.progress, s.fuel]);
    if (memo.has(key)) return memo.get(key)!;
    const cells = s.board.flatMap((row, r) =>
      row.flatMap((v, c) => (v > 0 ? [{ r, c }] : [])),
    );
    let min = Infinity;
    for (let i = 0; i < cells.length; i++)
      for (let j = i + 1; j < cells.length; j++) {
        const n = independentStep(p, s, { a: cells[i], b: cells[j] });
        if (n) min = Math.min(min, visit(n));
      }
    memo.set(key, min);
    return min;
  };
  return visit(independentInitial(p));
}

test("all 192 backups have independent ordinary/challenge/nonchallenge proofs and semantic diversity", () => {
  for (const themeId of ids) {
    const pool = (backups as Puzzle[]).filter((p) => p.themeId === themeId);
    assert.equal(pool.length, 32);
    assert.equal(new Set(pool.map(fingerprint)).size, 32);
    for (const p of pool) {
      assert.ok(validatePuzzle(p));
      assert.ok(won(p, independentReplay(p, p.proof.win)));
      assert.ok(
        independentChallenge(p, independentReplay(p, p.proof.challenge)),
      );
      const ordinary = independentReplay(p, p.proof.ordinary);
      assert.ok(won(p, ordinary));
      assert.equal(independentChallenge(p, ordinary), false);
      if (themeId === 18)
        assert.equal(p.proof.minimumFuel, independentMinimum(p));
    }
  }
});
test("fresh generation changes geometry/partnership and verifies meaningful critical branches", () => {
  for (const themeId of ids) {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 4; seed++) {
      const r = generatePuzzle(themeId, 730000 + themeId * 100 + seed);
      assert.equal(r.status, "generated");
      if (r.status !== "generated") continue;
      const p = r.puzzle;
      seen.add(fingerprint(p));
      assert.ok(
        independentChallenge(p, independentReplay(p, p.proof.challenge)),
      );
      assert.ok(p.proof.critical.length > 0);
      if (themeId === 15 || themeId === 16)
        assert.ok(p.proof.challenge.length >= 5);
      if (themeId === 17 || themeId === 18)
        assert.ok(p.proof.challenge.length >= 6);
      if (themeId >= 15)
        assert.ok(
          new Set(p.proof.critical.map((b) => b.prefix.length)).size >= 2,
        );
      for (const branch of p.proof.critical) {
        const bad = replay(p, [...branch.prefix, branch.bad]);
        assert.ok(bad);
        const searched = solve(p, {
          start: bad,
          deadline: performance.now() + 3000,
        });
        assert.notEqual(searched.status, "unknown");
        assert.equal(searched.root.challenge, null);
      }
      if (themeId === 18)
        assert.equal(p.proof.minimumFuel, independentMinimum(p));
    }
    assert.equal(seen.size, 4);
  }
});
test("bounded solver reports unknown and certification never admits incomplete evidence", () => {
  const p = candidate(13, 123);
  const r = solve(p, { maxNodes: 0 });
  assert.equal(r.status, "unknown");
  assert.equal(certify(p, r), false);
  assert.equal(generatePuzzle(13, 123, 0).status, "unknown");
});
test("backup selection avoids latest twenty and cloning protects bundled data", () => {
  const pool = (backups as Puzzle[]).filter((p) => p.themeId === 13),
    recent = pool.slice(0, 20).map((p) => p.id);
  const p = selectBackup(13, recent, () => 0);
  assert.ok(!recent.includes(p.id));
  p.initial[0][0] = 99;
  assert.notEqual(selectBackup(13, recent, () => 0).initial[0][0], 99);
});
test("replay agrees with normal runtime terminal challenge evaluation", () => {
  for (const p of (backups as Puzzle[]).filter((_, i) => i % 17 === 0)) {
    assert.equal(initialState(p).phase, "playing");
    const s = replay(p, p.proof.challenge);
    assert.ok(s);
    assert.ok(challengeMet(p, s));
  }
});

/** Independent reachability oracle: 1 means a win exists, 2 means a challenge win exists. */
function independentOutcomes(p: Puzzle) {
  const memo = new Map<string, number>();
  const visit = (s: Independent): number => {
    if (won(p, s)) return independentChallenge(p, s) ? 3 : 1;
    const key = JSON.stringify(s);
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    const cells = s.board.flatMap((row, r) =>
      row.flatMap((v, c) => (v > 0 ? [{ r, c }] : [])),
    );
    let outcomes = 0;
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const next = independentStep(p, s, { a: cells[i], b: cells[j] });
        if (next) outcomes |= visit(next);
        if (outcomes === 3) break;
      }
      if (outcomes === 3) break;
    }
    memo.set(key, outcomes);
    return outcomes;
  };
  return visit;
}
function assertCriticalCausality(p: Puzzle) {
  const outcomes = independentOutcomes(p);
  const isAtPort = (q: Point) =>
    p.stages[0].ports.some((port) => port.r === q.r && port.c === q.c);
  const ready = (s: Independent) => {
    const targets = s.board.flatMap((row, r) =>
      row.flatMap((v, c) => (v === 1 ? [{ r, c }] : [])),
    );
    return targets.some((a, i) =>
      targets
        .slice(i + 1)
        .some(
          (b) =>
            (isAtPort(a) || isAtPort(b)) &&
            independentStep(p, s, { a, b }) !== null,
        ),
    );
  };
  assert.ok(p.proof.critical.length > 0, p.id);
  for (const branch of p.proof.critical) {
    const before = independentReplay(p, branch.prefix);
    const good = independentStep(p, before, branch.good),
      bad = independentStep(p, before, branch.bad);
    assert.ok(good && bad, p.id);
    assert.equal(
      outcomes(good) & 2,
      2,
      `${p.id}: good branch must still reach challenge`,
    );
    const badOutcomes = outcomes(bad);
    assert.equal(
      badOutcomes & 2,
      0,
      `${p.id}: bad branch must not reach challenge`,
    );
    const text = branch.consequence;
    if (text.includes("仍有通关解")) assert.equal(badOutcomes & 1, 1, p.id);
    if (text.includes("没有通关解")) assert.equal(badOutcomes, 0, p.id);
    if (text.includes("两种选择都消耗一对普通水果")) {
      assert.equal(good.fuel, before.fuel + 1, p.id);
      assert.equal(bad.fuel, good.fuel, p.id);
    }
    if (p.themeId === 14) {
      assert.equal(p.challenge.kind, "preserve");
      if (p.challenge.kind !== "preserve") throw new Error("wrong challenge");
      const challenge = p.challenge;
      assert.equal(good.fuel, before.fuel + 1, p.id);
      assert.equal(bad.fuel, good.fuel, p.id);
      for (const state of [good, bad])
        assert.ok(
          state.board.flat().filter((v) => v === challenge.fruit).length >=
            challenge.pairs * 2,
          p.id,
        );
      assert.ok(text.includes("都保留足够的标记水果"), p.id);
    }
    if (text.includes("首次")) {
      assert.equal(p.challenge.kind, "first-window", p.id);
      if (p.challenge.kind !== "first-window")
        throw new Error("wrong challenge");
      assert.ok(p.challenge.fruits.includes(1), p.id);
      for (const state of [before, good, bad]) {
        assert.ok(!state.first.includes(1), p.id);
        assert.ok(!state.missed.includes(1), p.id);
      }
      for (const state of [good, bad])
        assert.ok(
          p.stages[0].ports.some((port) => state.board[port.r][port.c] === 1),
          p.id,
        );
      assert.ok(ready(good), p.id);
      assert.equal(ready(bad), false, p.id);
    }
  }
  if (p.themeId === 14 || p.themeId === 18) {
    assert.ok(
      ![
        ...p.proof.notes,
        ...p.proof.critical.map((branch) => branch.consequence),
      ].some((text) => text.includes("首次")),
      p.id,
    );
  }
}

test("audit 1 fixed counterexamples cannot pass preservation quality by directly spending marked fruit", () => {
  for (const seed of [408510958, 712968701]) {
    const p = candidate(14, seed);
    const search = solve(p);
    assert.equal(search.status, "solved");
    assert.ok(search.root.challenge && search.root.ordinary);
    assert.equal(certify(p, search), false, p.id);
  }
});

test("audit 1 non-window hint regressions never describe a first-window cause", () => {
  const cases: [ThemeId, number][] = [
    [14, 1854789765],
    [14, 883124702],
    [14, 977885501],
    [14, 582641187],
    [18, 3494616670],
    [18, 3267624936],
    [18, 3766368667],
    [18, 3695756553],
    [18, 1861822786],
  ];
  for (const [theme, seed] of cases) {
    const p = candidate(theme, seed),
      result = solve(p);
    if (certify(p, result)) assertCriticalCausality(p);
    assert.ok(
      p.proof.critical.every((branch) => !branch.consequence.includes("首次")),
      p.id,
    );
  }
});

test("all backup branch hints have independently established counterfactual evidence", () => {
  for (const p of backups as Puzzle[]) assertCriticalCausality(p);
});

/** Build the entire graph with the independent rules above. Then delete the
 * successful edges that make each lesson's choice and look for a bypass.
 */
function independentTeachingBypasses(p: Puzzle) {
  type Edge = { move: Move; next: Node; lesson: number };
  type Node = { state: Independent; challenge: boolean; edges: Edge[] };
  const memo = new Map<string, Node>();
  const graph = (state: Independent): Node => {
    const key = JSON.stringify(state),
      cached = memo.get(key);
    if (cached) return cached;
    const node: Node = { state, challenge: false, edges: [] };
    memo.set(key, node);
    if (won(p, state)) {
      node.challenge = independentChallenge(p, state);
      return node;
    }
    const cells = state.board.flatMap((row, r) =>
      row.flatMap((v, c) => (v > 0 ? [{ r, c }] : [])),
    );
    for (let i = 0; i < cells.length; i++)
      for (let j = i + 1; j < cells.length; j++) {
        const move = { a: cells[i], b: cells[j] },
          next = independentStep(p, state, move);
        if (next) node.edges.push({ move, next: graph(next), lesson: 0 });
      }
    node.challenge = node.edges.some((edge) => edge.next.challenge);
    const goal = p.stages[0].goal;
    assert.notEqual(goal.kind, "clear");
    if (goal.kind === "clear") throw new Error("wrong goal");
    for (const good of node.edges.filter((edge) => edge.next.challenge)) {
      const fruit = state.board[good.move.a.r][good.move.a.c];
      for (const bad of node.edges.filter((edge) => !edge.next.challenge)) {
        const other = state.board[bad.move.a.r][bad.move.a.c];
        if (
          goal.quotas[fruit] &&
          fruit === other &&
          [good.move.a, good.move.b].some((a) =>
            [bad.move.a, bad.move.b].some((b) => a.r === b.r && a.c === b.c),
          )
        )
          good.lesson |= 1;
        if (
          !goal.quotas[fruit] &&
          !goal.quotas[other] &&
          good.next.state.fuel === state.fuel + 1 &&
          bad.next.state.fuel === good.next.state.fuel
        )
          good.lesson |= 2;
      }
    }
    return node;
  };
  const root = graph(independentInitial(p));
  const bypass = (forbidden: number): Move[] | null => {
    const visited = new Set<Node>();
    const search = (node: Node): Move[] | null => {
      if (!node.challenge || visited.has(node)) return null;
      visited.add(node);
      if (won(p, node.state)) return [];
      for (const edge of node.edges) {
        if (edge.lesson & forbidden) continue;
        const suffix = search(edge.next);
        if (suffix !== null) return [edge.move, ...suffix];
      }
      return null;
    };
    return search(root);
  };
  assert.ok(root.challenge, `${p.id}: independent challenge must exist`);
  return { partner: bypass(1), resource: bypass(2) };
}

test("integrated theme rejects all three independently reproduced teaching bypass classes", () => {
  for (const [seed, partnerBypass, resourceBypass] of [
    [1623209115, true, true],
    [3351294012, false, true],
    [858135497, true, false],
  ] as const) {
    const p = candidate(18, seed),
      result = solve(p);
    assert.equal(result.status, "solved");
    assert.equal(certify(p, result), false, p.id);
    const bypasses = independentTeachingBypasses(p);
    assert.equal(bypasses.partner !== null, partnerBypass, p.id);
    assert.equal(bypasses.resource !== null, resourceBypass, p.id);
    for (const moves of Object.values(bypasses))
      if (moves)
        assert.ok(independentChallenge(p, independentReplay(p, moves)), p.id);
  }
});

test("integrated teaching remains necessary while allowing unrelated moves to swap order", () => {
  const p = candidate(18, 1861822786);
  assert.equal(certify(p, solve(p)), true);
  assert.deepEqual(independentTeachingBypasses(p), {
    partner: null,
    resource: null,
  });
  const alternate = [...p.proof.challenge];
  [alternate[0], alternate[1]] = [alternate[1], alternate[0]];
  assert.notDeepEqual(alternate, p.proof.challenge);
  for (const moves of [p.proof.challenge, alternate])
    assert.ok(independentChallenge(p, independentReplay(p, moves)));
});

test("integrated certification rejects unknown, missing DAG evidence and expired certification budget", () => {
  const p = candidate(18, 1861822786),
    incomplete = solve(p, { maxNodes: 0 });
  assert.equal(certify(structuredClone(p), incomplete), false);
  const complete = solve(p);
  assert.equal(complete.status, "solved");
  assert.equal(certify(structuredClone(p), complete, -Infinity), false);
  const first = replay(p, [complete.root.minPath![0]]);
  assert.ok(first);
  for (const state of [initialState(p), first]) {
    const missing = { ...complete, states: new Map(complete.states) };
    missing.states.delete(stateKey(state));
    assert.equal(certify(structuredClone(p), missing), false);
  }
});

test("every integrated backup and fresh challenge route requires both consequential choices", () => {
  const puzzles = (backups as Puzzle[]).filter((p) => p.themeId === 18);
  for (let i = 0; i < 8; i++) {
    const result = generatePuzzle(18, (0xc3180000 + i * 2654435761) >>> 0);
    assert.equal(result.status, "generated");
    if (result.status === "generated") puzzles.push(result.puzzle);
  }
  for (const p of puzzles)
    assert.deepEqual(
      independentTeachingBypasses(p),
      { partner: null, resource: null },
      p.id,
    );
});
