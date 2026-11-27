import { parseSaveJSON } from "../storage";
import { createSession, earnedStars, playMove } from "./session";
import { challengeMet } from "./rules";
import { THEMES } from "./themes";
import type { JourneySave, JourneySession, Move, ThemeId } from "./types";

export const KEY = "jelly-grove.journey-trial.v1";
export const MAX_JOURNEY_SAVE_CHARACTERS = 4_000_000;
// UTF-8 needs at most three bytes per UTF-16 code unit, including non-ASCII IDs.
export const MAX_JOURNEY_SAVE_FILE_BYTES = MAX_JOURNEY_SAVE_CHARACTERS * 3;
const MAX_HINTED = 10_000;
const invalidPuzzle = "这份存档的棋盘无法恢复。";
const invalidHistory = "这份存档的对局记录不完整。";
export function emptyJourneySave(): JourneySave {
  return { version: 1, session: null, best: {}, recent: [], hinted: [] };
}

const record = (v: unknown): v is Record<string, unknown> =>
  !!v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.getPrototypeOf(v) === Object.prototype;
const validIds = (v: unknown, max: number): v is string[] =>
  Array.isArray(v) &&
  v.length <= max &&
  v.every(
    (id) => typeof id === "string" && id.length > 0 && id.length <= 300,
  ) &&
  new Set(v).size === v.length;
const canonical = (v: unknown): string =>
  JSON.stringify(v, (_key, value: unknown) =>
    record(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, value[key]]),
        )
      : value,
  );

/** Keep the latest IDs bounded, always retaining the active puzzle's sticky hint. */
function normalizeHints(
  ids: string[],
  session: JourneySession | null,
): string[] {
  const unique = [...new Set([...ids].reverse())].reverse();
  if (
    session &&
    (session.hintLevel > 0 || unique.includes(session.puzzle.id))
  ) {
    session.hintLevel = Math.max(1, session.hintLevel);
    return [
      ...unique.filter((id) => id !== session.puzzle.id),
      session.puzzle.id,
    ].slice(-MAX_HINTED);
  }
  return unique.slice(-MAX_HINTED);
}

export function parseJourneySave(text: string): JourneySave {
  if (text.length > MAX_JOURNEY_SAVE_CHARACTERS)
    throw new Error("存档文件过大，无法读取。");
  const raw = parseSaveJSON(text) as JourneySave;
  if (
    !record(raw) ||
    raw.version !== 1 ||
    !record(raw.best) ||
    !validIds(raw.recent, 100) ||
    !validIds(raw.hinted, MAX_HINTED) ||
    !Object.entries(raw.best).every(
      ([key, stars]) =>
        THEMES.some(({ id }) => String(id) === key) &&
        Number.isInteger(stars) &&
        (stars as number) >= 0 &&
        (stars as number) <= 3,
    )
  ) {
    throw new Error("这份存档无法在当前版本的流转送达中打开。");
  }
  let session: JourneySession | null = null;
  if (raw.session !== null) {
    const saved = raw.session;
    if (
      !record(saved) ||
      !Array.isArray(saved.actions) ||
      saved.actions.length > 24 ||
      !Array.isArray(saved.history) ||
      saved.history.length !== saved.actions.length ||
      !Number.isInteger(saved.hintLevel) ||
      (saved.hintLevel as number) < 0 ||
      (saved.hintLevel as number) > 3
    )
      throw new Error(invalidHistory);
    try {
      session = createSession(saved.puzzle, saved.hintLevel);
    } catch (cause) {
      throw new Error(invalidPuzzle, { cause });
    }
    for (const kind of ["win", "challenge", "ordinary"] as const) {
      const witness = createSession(saved.puzzle);
      for (const action of saved.puzzle.proof[kind])
        if (!playMove(witness, action).ok)
          throw new Error(invalidPuzzle);
      if (
        witness.state.phase !== "won" ||
        (kind !== "win" &&
          challengeMet(witness.puzzle, witness.state) !==
            (kind === "challenge"))
      )
        throw new Error(invalidPuzzle);
    }
    // Replay every action; submitted state and undo history never become authoritative.
    for (const action of saved.actions as Move[]) {
      if (!playMove(session, action).ok)
        throw new Error(invalidHistory);
    }
    if (
      canonical(session.state) !== canonical(saved.state) ||
      canonical(session.history) !== canonical(saved.history)
    )
      throw new Error(invalidHistory);
  }
  return {
    version: 1,
    session,
    best: { ...raw.best },
    recent: [...raw.recent],
    hinted: normalizeHints(raw.hinted, session),
  };
}

export function loadJourneySave(): {
  save: JourneySave;
  warning?: string;
  rawBackup?: string;
} {
  let text: string | null;
  try {
    text = localStorage.getItem(KEY);
  } catch {
    return {
      save: emptyJourneySave(),
      warning: "浏览器无法读取存档。请检查是否允许此页面保存数据，再刷新重试。",
    };
  }
  if (text === null) return { save: emptyJourneySave() };
  try {
    return { save: parseJourneySave(text) };
  } catch {
    return {
      save: emptyJourneySave(),
      warning: "原存档可能已损坏或与当前版本不兼容。",
      // Retain exactly what was read, even if later storage access is denied.
      rawBackup: text,
    };
  }
}

/** Storage and downloads share this exact compact representation and reader limits. */
export function serializeJourneySave(save: JourneySave): string {
  save.hinted = normalizeHints(save.hinted, save.session);
  const serialized = JSON.stringify(save);
  // Validate before replacing the last readable save or offering a backup to download.
  parseJourneySave(serialized);
  return serialized;
}

export function writeJourneySave(save: JourneySave): boolean {
  try {
    localStorage.setItem(KEY, serializeJourneySave(save));
    return true;
  } catch {
    return false;
  }
}

/** Only a single completed run contributes; max is naturally idempotent across undo/replay. */
export function recordJourneyResult(
  save: JourneySave,
  session: JourneySession,
): void {
  save.hinted = normalizeHints(save.hinted, session);
  const stars = earnedStars(session);
  if (!stars) return;
  const id: ThemeId = session.puzzle.themeId;
  save.best[id] = Math.max(save.best[id] || 0, stars);
}
