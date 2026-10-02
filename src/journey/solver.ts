import { attemptMatch, challengeMet, initialState, legalMoves } from "./rules";
import type { JourneyState, Move, Puzzle } from "./types";

export type Reachability = {
  win: Move[] | null;
  challenge: Move[] | null;
  ordinary: Move[] | null;
  minFuel: number;
  minPath: Move[] | null;
  maxFuel: number;
  maxPath: Move[] | null;
};
export type SearchResult = {
  status: "solved" | "unsolvable" | "unknown";
  nodes: number;
  elapsedMs: number;
  root: Reachability;
  states: Map<string, Reachability>;
};
export const stateKey = (s: JourneyState) =>
  [
    s.board.flat().join(","),
    s.stageIndex,
    JSON.stringify(s.progress),
    s.stageMoves,
    s.fuelUsed,
    s.outsideTargets,
    [...s.firstDelivered].sort().join(","),
    [...s.missedFirst].sort().join(","),
  ].join("|");
const empty = (): Reachability => ({
  win: null,
  challenge: null,
  ordinary: null,
  minFuel: Infinity,
  minPath: null,
  maxFuel: -Infinity,
  maxPath: null,
});
/** Exhaustive acyclic search: each move removes two tiles. Unknown is never a proof. */
export function solve(
  puzzle: Puzzle,
  options: { deadline?: number; maxNodes?: number; start?: JourneyState } = {},
): SearchResult {
  const started = performance.now(),
    deadline = options.deadline ?? started + 2000,
    cache = new Map<string, Reachability>();
  let nodes = 0,
    timedOut = false;
  const visit = (s: JourneyState): Reachability => {
    const key = stateKey(s),
      cached = cache.get(key);
    if (cached) return cached;
    if (
      ++nodes > (options.maxNodes ?? 100000) ||
      performance.now() > deadline
    ) {
      timedOut = true;
      return empty();
    }
    const out = empty();
    if (s.phase === "won") {
      out.win = [];
      out.minPath = [];
      out.maxPath = [];
      out.minFuel = out.maxFuel = s.fuelUsed;
      if (challengeMet(puzzle, s)) out.challenge = [];
      else out.ordinary = [];
    } else if (s.phase === "playing")
      for (const move of legalMoves(puzzle, s)) {
        const result = attemptMatch(puzzle, s, move);
        if (!result.ok) continue;
        const child = visit(result.state);
        if (timedOut) return empty();
        for (const field of ["win", "challenge", "ordinary"] as const)
          if (
            child[field] !== null &&
            (out[field] === null ||
              child[field]!.length + 1 < out[field]!.length)
          )
            out[field] = [move, ...child[field]!];
        if (
          child.minPath !== null &&
          (child.minFuel < out.minFuel ||
            (child.minFuel === out.minFuel &&
              child.minPath.length + 1 < (out.minPath?.length ?? Infinity)))
        ) {
          out.minFuel = child.minFuel;
          out.minPath = [move, ...child.minPath];
        }
        if (child.maxPath !== null && child.maxFuel > out.maxFuel) {
          out.maxFuel = child.maxFuel;
          out.maxPath = [move, ...child.maxPath];
        }
      }
    cache.set(key, out);
    return out;
  };
  const root = visit(options.start ?? initialState(puzzle));
  return {
    status: timedOut ? "unknown" : root.win ? "solved" : "unsolvable",
    nodes,
    elapsedMs: performance.now() - started,
    root,
    states: cache,
  };
}
export function replay(puzzle: Puzzle, moves: Move[]): JourneyState | null {
  let s = initialState(puzzle);
  for (const m of moves) {
    const r = attemptMatch(puzzle, s, m);
    if (!r.ok) return null;
    s = r.state;
  }
  return s;
}
