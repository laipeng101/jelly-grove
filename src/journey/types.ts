import type { Board, Point } from "../engine";

export type ThemeId = 13 | 14 | 15 | 16 | 17 | 18;
export type Move = { a: Point; b: Point };
export type Track = { cells: Point[]; direction: 1 | -1 };
export type Movement =
  | { kind: "none" }
  | { kind: "compact"; direction: "down" | "left" }
  | { kind: "conveyor"; tracks: Track[] };
export type Goal =
  | { kind: "clear" }
  | { kind: "collect" | "deliver"; quotas: Record<number, number> };
/** Quotas count pairs. Ports are fixed board coordinates, independent of tracks. */
export type Stage = {
  goal: Goal;
  movement: Movement;
  ports: Point[];
  budget?: number;
};
export type Challenge =
  | { kind: "first-window"; fruits: number[] }
  | { kind: "preserve"; fruit: number; pairs: number }
  | { kind: "no-outside" }
  | { kind: "fuel"; limit: number };
export type Proof = {
  win: Move[];
  challenge: Move[];
  ordinary: Move[];
  /** A legally playable branch that loses a goal or challenge opportunity. */
  critical: { prefix: Move[]; good: Move; bad: Move; consequence: string }[];
  /** Minimum proved by exhaustive / bounded-optimal search, never a guess. */
  minimumFuel?: number;
  notes: string[];
};
export type Puzzle = {
  version: 1;
  generatorVersion: number;
  id: string;
  themeId: ThemeId;
  seed: number;
  initial: Board;
  stages: Stage[];
  challenge: Challenge;
  proof: Proof;
};
export type JourneyState = {
  board: Board;
  stageIndex: number;
  progress: Record<number, number>[];
  stageMoves: number;
  moves: number;
  combo: number;
  score: number;
  juice: number;
  blooms: number;
  fuelUsed: number;
  outsideTargets: number;
  firstDelivered: number[];
  missedFirst: number[];
  phase: "playing" | "won" | "lost";
  failure: string | null;
};
export type JourneySession = {
  puzzle: Puzzle;
  state: JourneyState;
  history: JourneyState[];
  actions: Move[];
  /** Sticky for this exact initial puzzle, including undo and retry. */
  hintLevel: number;
};
export type JourneySave = {
  version: 1;
  session: JourneySession | null;
  best: Partial<Record<ThemeId, number>>;
  recent: string[];
  hinted: string[];
};
export type Theme = {
  id: ThemeId;
  name: string;
  lesson: string;
  challengeText: string;
  hint: string;
};
export type MatchResult =
  | { ok: false; reason: string }
  | {
      ok: true;
      state: JourneyState;
      path: Point[];
      delivered: number | null;
      bloomed: boolean;
    };

export const RULE_VERSION = 1;
export const GENERATOR_VERSION = 1;
