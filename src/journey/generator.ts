import { findPath, seedRandom, shuffle, type Point } from "../engine";
import {
  attemptMatch,
  challengeMet,
  initialState,
  legalMoves,
  validatePuzzle,
  rotatePreview,
} from "./rules";
import { solve, stateKey, replay, type SearchResult } from "./solver";
import {
  GENERATOR_VERSION,
  RULE_VERSION,
  type Move,
  type Puzzle,
  type ThemeId,
  type Track,
} from "./types";
export { THEMES } from "./themes";
const same = (a: Point, b: Point) => a.r === b.r && a.c === b.c;
const square = (r: number, c: number): Point[] => [
  { r, c },
  { r, c: c + 1 },
  { r: r + 1, c: c + 1 },
  { r: r + 1, c },
];
const rectangle = (r: number, c: number): Point[] => [
  { r, c },
  { r, c: c + 1 },
  { r, c: c + 2 },
  { r: r + 1, c: c + 2 },
  { r: r + 1, c: c + 1 },
  { r: r + 1, c },
];
export type GenerateResult =
  | {
      status: "generated";
      puzzle: Puzzle;
      attempts: number;
      nodes: number;
      elapsedMs: number;
    }
  | { status: "unknown"; attempts: number; nodes: number; elapsedMs: number };
/** Parameterized geometry, phase, anchors, obstacles and pairing are chosen anew per candidate. */
export function candidate(themeId: ThemeId, seed: number): Puzzle {
  const rng = seedRandom(seed),
    large = themeId === 15 || themeId === 16 || themeId === 17,
    rows = large ? 5 : 4,
    cols = large ? 6 : 5,
    initial = Array.from({ length: rows }, () => Array(cols).fill(0));
  const dual = themeId >= 17;
  const trackCells =
    themeId === 15 || themeId === 16
      ? [rectangle(1 + Math.floor(rng() * 2), 1 + Math.floor(rng() * 2))]
      : themeId === 17
        ? [
            rectangle(Math.floor(rng() * 4), 0),
            rectangle(Math.floor(rng() * 4), 3),
          ]
        : dual
          ? [square(Math.floor(rng() * 3), 0), square(Math.floor(rng() * 3), 3)]
          : [square(Math.floor(rng() * 3), 1 + Math.floor(rng() * 2))];
  const tracks: Track[] = trackCells.map((cells) => ({
    cells,
    direction: rng() < 0.5 ? 1 : -1,
  }));
  const onTrack = (p: Point) =>
    trackCells.some((cells) => cells.some((x) => same(p, x)));
  const all = initial.flatMap((row, r) => row.map((_, c) => ({ r, c })));
  const off = shuffle(
    all.filter((p) => !onTrack(p)),
    rng,
  );
  const ports: Point[] = [],
    targets = dual ? [1, 2] : [1];
  for (let i = 0; i < targets.length; i++) {
    const track = tracks[i],
      portIndex = Math.floor(rng() * track.cells.length),
      distance =
        themeId === 15
          ? 4
          : themeId === 16
            ? 2 + Math.floor(rng() * 2)
            : themeId === 17
              ? 2 + Math.floor(rng() * 4)
              : 1 + Math.floor(rng() * (dual ? 3 : 2));
    ports.push(track.cells[portIndex]);
    const moving =
      track.cells[
        (portIndex - track.direction * distance + track.cells.length * 2) %
          track.cells.length
      ];
    initial[moving.r][moving.c] = targets[i];
    const mate = off.pop()!;
    initial[mate.r][mate.c] = targets[i];
  }
  if (themeId === 16) {
    const track = tracks[0],
      portIndex = track.cells.findIndex((p) => same(p, ports[0]));
    const moving =
      track.cells[
        (portIndex - track.direction * 5 + track.cells.length * 2) %
          track.cells.length
      ];
    initial[moving.r][moving.c] = 1;
    for (let i = 0; i < 3; i++) {
      const p = off.pop()!;
      initial[p.r][p.c] = 1;
    }
  }
  if (themeId === 18) {
    for (let i = 0; i < 2; i++) {
      const p = off.pop()!;
      initial[p.r][p.c] = 1;
    }
  }
  const empty = () =>
    shuffle(
      all.filter((p) => initial[p.r][p.c] === 0),
      rng,
    );
  const stones =
    themeId === 16
      ? 4
      : themeId === 15 || themeId === 18
        ? 2
        : themeId === 13
          ? 0
          : 1;
  for (let i = 0; i < stones && off.length; i++) {
    const p = off.pop()!;
    if (!initial[p.r][p.c]) initial[p.r][p.c] = -1;
  }
  const fuelPairs =
    themeId === 15
      ? 10
      : themeId === 17
        ? 9
        : themeId === 16
          ? 6
          : themeId === 18
            ? 5
            : dual
              ? 6
              : 7;
  const cells = empty();
  for (let f = 0; f < fuelPairs; f++)
    for (let n = 0; n < 2; n++) {
      const p = cells.pop();
      if (p) initial[p.r][p.c] = 3 + (f % 8);
    }
  const puzzle: Puzzle = {
    version: RULE_VERSION,
    generatorVersion: GENERATOR_VERSION,
    id: `flow-${themeId}-${seed >>> 0}`,
    themeId,
    seed: seed >>> 0,
    initial,
    stages: [
      {
        goal: {
          kind: "deliver",
          quotas: Object.fromEntries(
            targets.map((t) => [t, themeId === 16 ? 2 : 1]),
          ),
        },
        movement: { kind: "conveyor", tracks },
        ports,
      },
    ],
    challenge:
      themeId === 14
        ? {
            kind: "preserve",
            fruit: 3 + Math.floor(rng() * fuelPairs),
            pairs: 1,
          }
        : themeId === 16
          ? { kind: "no-outside" }
          : themeId === 18
            ? { kind: "fuel", limit: 99 }
            : { kind: "first-window", fruits: targets },
    proof: { win: [], challenge: [], ordinary: [], critical: [], notes: [] },
  };
  if (themeId === 18) puzzle.challenge = { kind: "fuel", limit: 72 };
  return puzzle;
}
function transition(p: Puzzle, s: ReturnType<typeof initialState>, m: Move) {
  const r = attemptMatch(p, s, m);
  return r.ok ? r.state : null;
}
/** Semantic identity preserves target/preserve roles, but ignores cosmetic fruit renaming. */
export function fingerprint(p: Puzzle): string {
  const h = p.initial.length,
    w = p.initial[0].length;
  const transforms = [
    (q: Point) => q,
    (q: Point) => ({ r: h - 1 - q.r, c: q.c }),
    (q: Point) => ({ r: q.r, c: w - 1 - q.c }),
    (q: Point) => ({ r: h - 1 - q.r, c: w - 1 - q.c }),
  ];
  return transforms
    .map((transform) => {
      const role = new Map<number, number>();
      let next = 3;
      const goal = p.stages[0].goal;
      if (goal.kind !== "clear")
        Object.keys(goal.quotas)
          .map(Number)
          .forEach((v, i) => role.set(v, i + 1));
      if (p.challenge.kind === "preserve") role.set(p.challenge.fruit, 10);
      const board = p.initial.map((row) => row.map(() => 0));
      p.initial.forEach((row, r) =>
        row.forEach((v, c) => {
          const q = transform({ r, c });
          board[q.r][q.c] = v;
        }),
      );
      const normalized = board.map((row) =>
        row.map((v) => {
          if (v <= 0) return v;
          if (!role.has(v)) role.set(v, next++);
          return role.get(v);
        }),
      );
      const stages = p.stages.map((stage) => ({
        ...stage,
        ports: stage.ports
          .map(transform)
          .sort((a, b) => a.r - b.r || a.c - b.c),
        movement:
          stage.movement.kind !== "conveyor"
            ? stage.movement
            : {
                kind: "conveyor",
                tracks: stage.movement.tracks
                  .map((track) => {
                    let cells = track.cells.map(transform);
                    if (track.direction === -1) cells = cells.slice().reverse();
                    const variants = cells.map((_, i) =>
                      JSON.stringify([...cells.slice(i), ...cells.slice(0, i)]),
                    );
                    return variants.sort()[0];
                  })
                  .sort(),
              },
      }));
      const challenge =
        p.challenge.kind === "preserve"
          ? { ...p.challenge, fruit: 10 }
          : p.challenge;
      return JSON.stringify([normalized, stages, challenge]);
    })
    .sort()[0];
}
/** Every optimal route must actually make both kinds of consequential choice.
 * A choice labels its successful edge, not every other action at the same state.
 * Intersecting edge-or-suffix masks permits different solutions and action order.
 */
function integratedChoicesNecessary(
  p: Puzzle,
  result: SearchResult,
  deadline: number,
): boolean {
  const partner = 1,
    resource = 2,
    required = partner | resource,
    memo = new Map<string, number>(),
    goal = p.stages[0].goal;
  if (goal.kind === "clear") return false;
  const visit = (state: ReturnType<typeof initialState>): number | null => {
    if (performance.now() > deadline) return null;
    const key = stateKey(state),
      cached = memo.get(key);
    if (cached !== undefined) return cached;
    if (!result.states.has(key)) return null;
    if (state.phase === "won") return 0;
    const choices = [];
    for (const move of legalMoves(p, state)) {
      const next = transition(p, state, move);
      if (!next) return null;
      const child = result.states.get(stateKey(next));
      // Absence is incomplete evidence, never proof that an alternative fails.
      if (!child) return null;
      choices.push({
        move,
        next,
        succeeds:
          child.minPath !== null && child.minFuel <= result.root.minFuel,
      });
    }
    const good = choices.filter((choice) => choice.succeeds),
      bad = choices.filter((choice) => !choice.succeeds);
    if (!good.length) return null;
    let allRoutes = required;
    for (const choice of good) {
      const fruit = state.board[choice.move.a.r][choice.move.a.c];
      let edge = 0;
      for (const alternative of bad) {
        const other = state.board[alternative.move.a.r][alternative.move.a.c];
        if (
          goal.quotas[fruit] &&
          fruit === other &&
          [choice.move.a, choice.move.b].some((a) =>
            [alternative.move.a, alternative.move.b].some((b) => same(a, b)),
          )
        )
          edge |= partner;
        if (
          !goal.quotas[fruit] &&
          !goal.quotas[other] &&
          choice.next.fuelUsed === state.fuelUsed + 1 &&
          alternative.next.fuelUsed === choice.next.fuelUsed
        )
          edge |= resource;
      }
      const suffix = visit(choice.next);
      if (suffix === null) return null;
      allRoutes &= edge | suffix;
    }
    memo.set(key, allRoutes);
    return allRoutes;
  };
  return visit(initialState(p)) === required;
}
export function certify(
  p: Puzzle,
  result: SearchResult,
  deadline = Infinity,
): boolean {
  if (result.status !== "solved") return false;
  const root = result.root;
  if (p.themeId === 18) {
    if (
      !root.minPath ||
      !root.maxPath ||
      root.minFuel === root.maxFuel ||
      root.minFuel < 3
    )
      return false;
    p.challenge = { kind: "fuel", limit: root.minFuel };
    root.challenge = root.minPath;
    root.ordinary = root.maxPath;
  }
  if (
    !root.win ||
    !root.challenge ||
    !root.ordinary ||
    root.challenge.length < 2
  )
    return false;
  p.proof.critical = [];
  p.proof.win = root.win;
  p.proof.challenge = root.challenge;
  p.proof.ordinary = root.ordinary;
  if (p.themeId === 18) p.proof.minimumFuel = root.minFuel;
  let state = initialState(p);
  const prefix: Move[] = [];
  let opening = false,
    partnerChoice = false,
    deferred = false,
    preservedFuture = false;
  for (const good of root.challenge) {
    for (const bad of legalMoves(p, state)) {
      if (same(bad.a, good.a) && same(bad.b, good.b)) continue;
      const after = transition(p, state, bad)!;
      const child = result.states.get(stateKey(after));
      const succeeds =
        p.themeId === 18
          ? !!child?.minPath && child.minFuel <= root.minFuel
          : !!child?.challenge;
      if (!succeeds) {
        const atPort = p.stages[0].ports.some(
          (port) => after.board[port.r][port.c] === 1,
        );
        const targets = after.board.flatMap((row, r) =>
          row.flatMap((v, c) => (v === 1 ? [{ r, c }] : [])),
        );
        const blocked =
          atPort &&
          !targets.some((a, i) =>
            targets
              .slice(i + 1)
              .some(
                (b) =>
                  p.stages[0].ports.some(
                    (port) => same(port, a) || same(port, b),
                  ) && findPath(after.board, a, b),
              ),
          );
        const goodAfter = transition(p, state, good)!;
        const goodChild = result.states.get(stateKey(goodAfter));
        const goodSucceeds =
          p.themeId === 18
            ? !!goodChild?.minPath && goodChild.minFuel <= root.minFuel
            : !!goodChild?.challenge;
        if (!goodSucceeds) continue;
        const fruit = state.board[good.a.r][good.a.c],
          badFruit = state.board[bad.a.r][bad.a.c];
        const partner =
          fruit === badFruit &&
          fruit <= 2 &&
          [good.a, good.b].some((a) => [bad.a, bad.b].some((b) => same(a, b)));
        const future =
          fruit >= 3 && badFruit >= 3 && goodAfter.fuelUsed === after.fuelUsed;
        const markedFuture =
          p.challenge.kind === "preserve" &&
          future &&
          [goodAfter, after].every(
            (next) =>
              next.board
                .flat()
                .filter(
                  (value) =>
                    value ===
                    (p.challenge.kind === "preserve" ? p.challenge.fruit : -1),
                ).length >=
              (p.challenge.kind === "preserve"
                ? p.challenge.pairs * 2
                : Infinity),
          );
        // The preservation lesson must survive both immediate choices. Removing the
        // marked fruit directly is a scoring violation, not evidence of planning.
        if (p.themeId === 14 && !markedFuture) continue;
        const freshFirstWindow =
          p.challenge.kind === "first-window" &&
          p.challenge.fruits.includes(1) &&
          future &&
          blocked &&
          [state, goodAfter, after].every(
            (next) =>
              !next.firstDelivered.includes(1) && !next.missedFirst.includes(1),
          ) &&
          p.stages[0].ports.some(
            (port) => goodAfter.board[port.r][port.c] === 1,
          ) &&
          legalMoves(p, goodAfter).some(
            (move) =>
              goodAfter.board[move.a.r][move.a.c] === 1 &&
              p.stages[0].ports.some(
                (port) => same(port, move.a) || same(port, move.b),
              ),
          );
        partnerChoice ||= partner;
        deferred ||= future;
        preservedFuture ||= markedFuture;
        opening ||= freshFirstWindow;
        // Only describe the property checked above. A one-sided blocked position
        // does not establish its cause, and other challenges do not use windows.
        const reachability = child?.win
          ? "这个选择之后仍有通关解，但无法再完成本关挑战。"
          : "这个选择之后没有通关解。";
        p.proof.critical.push({
          prefix: [...prefix],
          good,
          bad,
          consequence: freshFirstWindow
            ? "两种选择之后，目标都会首次到站；一种保留了可连接路线，另一种被挡住，无法在首次窗口送达。"
            : markedFuture
              ? `两种选择都消耗一对普通水果，也都保留足够的标记水果。${reachability}`
              : partner
                ? `同一颗目标改选这个搭档。${reachability}`
                : future
                  ? `两种选择都消耗一对普通水果。${reachability}`
                  : reachability,
        });
      }
    }
    state = transition(p, state, good)!;
    prefix.push(good);
  }
  if (!p.proof.critical.length || (p.themeId === 14 && !preservedFuture))
    return false;
  if (p.themeId === 15) {
    if (
      !opening ||
      root.challenge.length < 5 ||
      new Set(p.proof.critical.map((c) => c.prefix.length)).size < 2
    )
      return false;
    let untouched = initialState(p),
      blockedOnArrival = false;
    for (let beat = 0; beat < 12; beat++) {
      const targets = untouched.board.flatMap((row, r) =>
        row.flatMap((v, c) => (v === 1 ? [{ r, c }] : [])),
      );
      if (
        p.stages[0].ports.some((port) => untouched.board[port.r][port.c] === 1)
      ) {
        blockedOnArrival =
          targets.length === 2 &&
          !findPath(untouched.board, targets[0], targets[1]);
        break;
      }
      untouched = { ...untouched, board: rotatePreview(p, untouched) };
    }
    if (!blockedOnArrival) return false;
  }
  if (
    p.themeId >= 17 &&
    (new Set(p.proof.critical.map((c) => c.prefix.length)).size < 2 ||
      root.challenge.length < 4)
  )
    return false;
  if (
    p.themeId === 16 &&
    (root.challenge.length < 5 || !partnerChoice || !deferred)
  )
    return false;
  if (p.themeId === 17 && (root.challenge.length < 6 || !deferred))
    return false;
  if (
    p.themeId === 18 &&
    (!partnerChoice || !deferred || root.challenge.length < 6)
  )
    return false;
  if (p.themeId === 18 && !integratedChoicesNecessary(p, result, deadline))
    return false;
  // Neither goal begins in a port; without motion delivery is impossible by construction.
  if (
    p.stages[0].ports.some((port) => {
      const f = p.initial[port.r][port.c];
      const g = p.stages[0].goal;
      return g.kind !== "clear" && !!g.quotas[f];
    })
  )
    return false;
  p.proof.notes = [
    `已完整搜索 ${result.nodes} 个状态；轨道推进是到站的必要条件。`,
    p.themeId === 15
      ? "存在未及时开路会错过首次到站的分支；两弯外沿路线也无法绕过阻挡。"
      : `发现 ${p.proof.critical.length} 处会影响后续通关或挑战的选择。`,
  ];
  const win = replay(p, p.proof.win),
    challenge = replay(p, p.proof.challenge),
    ordinary = replay(p, p.proof.ordinary);
  return (
    validatePuzzle(p) &&
    win?.phase === "won" &&
    !!challenge &&
    challengeMet(p, challenge) &&
    ordinary?.phase === "won" &&
    !challengeMet(p, ordinary)
  );
}
export function generatePuzzle(
  themeId: ThemeId,
  seed: number,
  budgetMs = 2850,
): GenerateResult {
  const start = performance.now(),
    deadline = start + budgetMs;
  let attempts = 0,
    nodes = 0;
  const rng = seedRandom(seed);
  while (performance.now() < deadline) {
    const p = candidate(themeId, Math.floor(rng() * 0x100000000));
    attempts++;
    const result = solve(p, {
      deadline: Math.min(deadline, performance.now() + 240),
      maxNodes: 18000,
    });
    nodes += result.nodes;
    if (certify(p, result, deadline) && performance.now() <= deadline)
      return {
        status: "generated",
        puzzle: p,
        attempts,
        nodes,
        elapsedMs: performance.now() - start,
      };
  }
  return {
    status: "unknown",
    attempts,
    nodes,
    elapsedMs: performance.now() - start,
  };
}
