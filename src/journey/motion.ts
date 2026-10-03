import { fruitSVG } from "../art";
import type { Board, Point } from "../engine";
import type { Move, Movement } from "./types";
export const MATCH_MS = 130, MOVE_MS = 280, SETTLE_MS = 90, TOTAL_MS = MATCH_MS + MOVE_MS + SETTLE_MS;
export type ConveyorStep = { fruit: number; from: Point; to: Point };
export function conveyorSteps(before: Board, pair: Move, movement: Movement): ConveyorStep[] {
  if (movement.kind !== "conveyor") return [];
  const matched = (p: Point) => [pair.a, pair.b].some(q => q.r === p.r && q.c === p.c);
  return movement.tracks.flatMap(track => track.cells.flatMap((from, index) => {
    const fruit = before[from.r][from.c];
    return fruit <= 0 || matched(from) ? [] : [{ fruit, from, to: track.cells[(index + track.direction + track.cells.length) % track.cells.length] }];
  }));
}
export function animateConveyor(shell: HTMLElement, steps: ConveyorStep[], pair: Move) {
  const running: Animation[] = [];
  const overlays: HTMLElement[] = [];
  const hidden: SVGElement[] = [];
  let stopped = false, resolveFinished: () => void;
  const finished = new Promise<void>(resolve => { resolveFinished = resolve; });
  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    running.forEach(a => a.cancel());
    overlays.forEach(e => e.remove());
    hidden.forEach(e => e.style.removeProperty("visibility"));
    delete shell.dataset.motionPhase;
    resolveFinished();
  };
  const cell = (point: Point) => shell.querySelector<HTMLElement>(`[data-trial-cell="${point.r},${point.c}"]`)!;
  const animate = (element: Element, frames: Keyframe[], duration: number) => {
    const animation = element.animate(frames, { duration, easing: "cubic-bezier(.22,.72,.28,1)", fill: "forwards" });
    running.push(animation);
    return animation.finished.catch(() => undefined);
  };
  void (async () => {
    try {
      shell.dataset.motionPhase = "match";
      await Promise.all([pair.a, pair.b].map(point => {
        const fruit = cell(point)?.querySelector(".fruit-svg");
        return fruit ? animate(fruit, [{ transform: "scale(1)", opacity: 1 }, { transform: "scale(1.12)", opacity: 1, offset: .3 }, { transform: "scale(.2)", opacity: 0 }], MATCH_MS) : Promise.resolve();
      }));
      if (stopped || !shell.isConnected) return cleanup();
      shell.dataset.motionPhase = "move";
      const shellBox = shell.getBoundingClientRect();
      const shifts = steps.map(step => {
        const source = cell(step.from).querySelector<SVGElement>(".fruit-svg")!;
        const box = source.getBoundingClientRect(), from = cell(step.from).getBoundingClientRect(), to = cell(step.to).getBoundingClientRect();
        const clone = document.createElement("span");
        clone.className = "trial-moving-fruit";
        clone.setAttribute("aria-hidden", "true");
        clone.inert = true;
        Object.assign(clone.style, { left: `${box.left - shellBox.left}px`, top: `${box.top - shellBox.top}px`, width: `${box.width}px`, height: `${box.height}px` });
        clone.innerHTML = fruitSVG(step.fruit);
        shell.append(clone);
        overlays.push(clone);
        hidden.push(source);
        source.style.visibility = "hidden";
        const x = to.left - from.left, y = to.top - from.top;
        return { clone, transform: `translate(${x}px,${y}px)` };
      });
      await Promise.all(shifts.map(({ clone, transform }) => animate(clone, [{ transform: "translate(0,0)" }, { transform }], MOVE_MS)));
      if (stopped || !shell.isConnected) return cleanup();
      shell.dataset.motionPhase = "settle";
      await Promise.all(shifts.map(({ clone, transform }) => animate(clone, [{ transform: `${transform} scale(1)` }, { transform: `${transform} scale(1.045,.965)`, offset: .45 }, { transform: `${transform} scale(1)` }], SETTLE_MS)));
      cleanup();
    } catch { cleanup(); }
  })();
  return { finished, cancel: cleanup };
}
