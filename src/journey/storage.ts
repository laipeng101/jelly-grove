import { createSession, earnedStars, playMove } from "./session";
import { challengeMet } from "./rules";
import type { JourneySave, JourneySession, Move, ThemeId } from "./types";

export const KEY = "jelly-grove.journey-trial.v1";
export const MAX_JOURNEY_SAVE_CHARACTERS = 4_000_000;
// UTF-8 needs at most three bytes per UTF-16 code unit, including non-ASCII IDs.
export const MAX_JOURNEY_SAVE_FILE_BYTES = MAX_JOURNEY_SAVE_CHARACTERS * 3;
const MAX_HINTED = 10_000;
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
    throw new Error("新关卡存档过大，无法读取。");
  const raw = JSON.parse(text) as JourneySave;
  if (
    !record(raw) ||
    raw.version !== 1 ||
    !record(raw.best) ||
    !validIds(raw.recent, 100) ||
    !validIds(raw.hinted, MAX_HINTED) ||
    !Object.entries(raw.best).every(
      ([key, stars]) =>
        /^1[3-8]$/.test(key) &&
        Number.isInteger(stars) &&
        (stars as number) >= 0 &&
        (stars as number) <= 3,
    )
  ) {
    throw new Error("新关卡存档不完整或版本不兼容。");
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
      throw new Error("新关卡行动记录不完整。");
    session = createSession(saved.puzzle, saved.hintLevel);
    for (const kind of ["win", "challenge", "ordinary"] as const) {
      const witness = createSession(saved.puzzle);
      for (const action of saved.puzzle.proof[kind])
        if (!playMove(witness, action).ok)
          throw new Error("新关卡解法记录无法重放。");
      if (
        witness.state.phase !== "won" ||
        (kind !== "win" &&
          challengeMet(witness.puzzle, witness.state) !==
            (kind === "challenge"))
      )
        throw new Error("新关卡解法与目标或挑战不一致。");
    }
    // Replay every action; submitted state and undo history never become authoritative.
    for (const action of saved.actions as Move[]) {
      if (!playMove(session, action).ok)
        throw new Error("新关卡行动记录无法重放。");
    }
    if (
      canonical(session.state) !== canonical(saved.state) ||
      canonical(session.history) !== canonical(saved.history)
    )
      throw new Error("新关卡状态与行动记录不一致。");
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
      warning: "暂时无法读取试玩存档。请检查浏览器的本地存储权限，再刷新重试。",
    };
  }
  try {
    return { save: text ? parseJourneySave(text) : emptyJourneySave() };
  } catch (error) {
    return {
      save: emptyJourneySave(),
      warning: error instanceof Error ? error.message : "未能解析新关卡存档。",
      // Retain exactly what was read, even if later storage access is denied.
      rawBackup: text ?? "",
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
