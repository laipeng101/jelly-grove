// The board gets what is left after the actual HUD/control heights, including
// wrapped text. A minimum tile size turns only this region into a scroller.
const compactQuery = matchMedia(
  "(max-width: 870px), (max-height: 620px) and (pointer: coarse)",
);
let observer: ResizeObserver | undefined;
let frame = 0;

function fitBoard() {
  const viewport = document.getElementById("board-viewport");
  const board = document.getElementById("board");
  if (!viewport || !board || !compactQuery.matches) return;
  const cols = Number(board.style.getPropertyValue("--cols"));
  const rows = Number(board.style.getPropertyValue("--rows"));
  const gutter = 32,
    gap = 4;
  const size = Math.max(
    44,
    Math.min(
      76,
      (viewport.clientWidth - gutter - (cols - 1) * gap) / cols,
      (viewport.clientHeight - gutter - (rows - 1) * gap) / rows,
    ),
  );
  // Round down so fractional layout cannot create a one-pixel scroll range.
  const tile = Math.floor(size * 100) / 100;
  const width = `${tile * cols + (cols - 1) * gap}px`;
  const height = `${tile * rows + (rows - 1) * gap}px`;
  if (
    viewport.style.getPropertyValue("--board-width") !== width ||
    viewport.style.getPropertyValue("--board-height") !== height
  ) {
    // A path was measured in the previous grid; do not leave stale endpoints
    // after text wrapping or viewport changes that do not fire window.resize.
    document.getElementById("connections")?.replaceChildren();
  }
  viewport.style.setProperty("--board-width", width);
  viewport.style.setProperty("--board-height", height);
  viewport.classList.toggle(
    "scrollable-board",
    tile * rows + (rows - 1) * gap + gutter > viewport.clientHeight + 1 ||
      tile * cols + (cols - 1) * gap + gutter > viewport.clientWidth + 1,
  );
}

function scheduleFit() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(fitBoard);
}

function syncViewport() {
  const root = document.documentElement;
  root.classList.toggle("compact-play", compactQuery.matches);
  // Do not counteract pinch zoom. Browser-bar/keyboard height changes at normal
  // scale do change the usable viewport and should reflow the game.
  const visual = window.visualViewport;
  const height =
    visual && visual.scale === 1 ? visual.height : window.innerHeight;
  root.style.setProperty("--play-height", `${height}px`);
  scheduleFit();
}

export function observePlayLayout() {
  observer?.disconnect();
  const viewport = document.getElementById("board-viewport");
  if (viewport) {
    observer = new ResizeObserver(scheduleFit);
    observer.observe(viewport);
  }
  syncViewport();
}

window.addEventListener("resize", syncViewport);
window.visualViewport?.addEventListener("resize", syncViewport);
compactQuery.addEventListener("change", syncViewport);
syncViewport();
