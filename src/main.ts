import "./style.css";
import {
  LEVELS,
  CHAPTERS,
  generateBoard,
  findPath,
  findPairs,
  reshuffle,
  remaining,
  clone,
  same,
  seedRandom,
  type Point,
  type Level,
} from "./engine";
import { fruitSVG, FRUITS, icon } from "./art";
import { initAudio, setSound, setVolume, stopAudio, sound } from "./audio";
import {
  COMBO_WINDOW,
  advanceGame,
  commitMatch,
  reconcileGame,
  rememberMove,
  repairBoard,
} from "./game";
import {
  loadSave,
  writeSave,
  parseSave,
  type Game,
  type Mode,
} from "./storage";

const loaded = loadSave();
let data = loaded.save;
const app = document.querySelector<HTMLDivElement>("#app")!;
let g: Game;
let selected: Point | null = null,
  hintPair: Point[] = [];
let modalKind = "",
  paused = false,
  busy = false,
  animation = 0;
let previousFocus: HTMLElement | null = null;
let timer = performance.now(),
  saveClock = 0,
  toastTimer = 0;
let lastPointer: Point | null = null;
let keyboardInput = false;
let pendingClicks: { point: Point; fruit: number }[] = [];
let hintTimer = 0;
let storageOK = true;
const hudCache = new Map<string, string>();
function hudHTML(id: string, html: string) {
  if (hudCache.get(id) !== html) {
    $(id).innerHTML = html;
    hudCache.set(id, html);
  }
}
const labels: Record<Mode, string> = {
  journey: "果园漫游",
  free: "自由练习",
  sprint: "限时鲜榨",
};
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const format = (n: number) => Math.floor(n).toLocaleString("zh-CN");
const time = (ms: number) =>
  `${Math.floor(ms / 60000)
    .toString()
    .padStart(2, "0")}:${Math.floor((ms / 1000) % 60)
    .toString()
    .padStart(2, "0")}`;
const stars = (n: number) =>
  Array.from({ length: 3 }, (_, i) => icon("star", i < n ? "lit" : "")).join(
    "",
  );
function levelFor(mode: Mode, level = 1, difficulty = 1): Level {
  if (mode === "journey") return LEVELS[level - 1];
  return {
    ...LEVELS[difficulty === 0 ? 2 : difficulty === 1 ? 7 : 16],
    id: level,
    gravity: mode === "free" && difficulty === 2,
    name:
      mode === "sprint"
        ? "120 秒，鲜榨快乐"
        : ["轻松一盘", "刚刚好的挑战", "高手的果园"][difficulty],
    target: [4, 5, 6][difficulty],
  };
}
function config() {
  return levelFor(g.mode, g.level, g.difficulty);
}
function newGame(mode: Mode, level = 1, difficulty = 1) {
  const seed = Math.floor(Math.random() * 0xffffffff),
    l = levelFor(mode, level, difficulty);
  const board = generateBoard(l, seedRandom(seed));
  g = {
    mode,
    level,
    difficulty,
    seed,
    board,
    score: 0,
    cleared: 0,
    total: remaining(board),
    combo: 0,
    bestCombo: 0,
    juice: 0,
    fever: 0,
    lastMatch: -1,
    assists: 0,
    elapsed: 0,
    timeLeft: 120000,
    round: 1,
    phase: "playing",
    history: [],
  };
  // A negative match timestamp is only transient; saved snapshots use zero.
  g.lastMatch = 0;
  data.mode = mode;
  selected = null;
  hintPair = [];
  busy = false;
  animation++;
  stopAudio();
  paused = false;
  pendingClicks = [];
  timer = performance.now();
  save();
  render();
}
function save() {
  data.sessions[g.mode] = g;
  data.mode = g.mode;
  const ok = writeSave(data);
  storageOK = ok;
  const el = $("save-label");
  if (el) {
    el.textContent = ok ? "进度已自动保存" : "存储不可用 · 请导出进度";
    el.classList.toggle("save-error", !ok);
  }
  return ok;
}
function remember() {
  rememberMove(g);
}
function recordResult() {
  if (g.phase === "won") {
    if (g.mode === "journey")
      data.stars[g.level - 1] = Math.max(
        data.stars[g.level - 1],
        starsEarned(),
      );
    else data.freeBest = Math.max(data.freeBest, g.score);
  } else if (g.phase === "lost" && g.mode === "sprint")
    data.best = Math.max(data.best, g.score);
}
function restoreCurrent() {
  reconcileGame(g, config());
  recordResult();
  pendingClicks = [];
  selected = null;
  hintPair = [];
  busy = false;
  animation++;
  save();
  render();
  if (g.phase === "playing") showPause();
  else showResult();
}
function starsEarned() {
  return (
    1 + (g.assists === 0 ? 1 : 0) + (g.bestCombo >= config().target ? 1 : 0)
  );
}
function render() {
  hudCache.clear();
  setSound(data.settings.sound);
  setVolume(data.settings.volume);
  document.documentElement.classList.toggle(
    "reduce-motion",
    !data.settings.motion,
  );
  const l = config(),
    chapter = CHAPTERS[l.chapter];
  document.body.classList.toggle("deep-grove", g.board.length > 6);
  app.innerHTML = `<header class="site-header"><a class="brand" href="#" aria-label="果冻果园 · 选择关卡"><span class="brand-mark">${icon("leaf")}</span><span>果冻果园<small>JELLY GROVE</small></span></a><div class="header-right"><span class="save-status"><i></i><span id="save-label" class="${storageOK ? "" : "save-error"}">${storageOK ? "进度已自动保存" : "存储不可用 · 请导出进度"}</span></span><button class="icon-btn" data-action="sound" aria-label="${data.settings.sound ? "关闭音效" : "开启音效"}">${icon(data.settings.sound ? "sound" : "mute")}</button><button class="icon-btn" data-action="help" aria-label="玩法说明">${icon("help")}</button><button class="icon-btn" data-action="settings" aria-label="设置">${icon("settings")}</button></div></header>
  <main class="page"><section class="hero"><div><div class="eyebrow"><span></span> YOUR LITTLE POCKET OF JOY</div><h1>连起一点<span>甜。</span><svg class="title-swish" viewBox="0 0 116 16"><path d="M3 10Q58 0 111 8M22 15Q65 7 92 12"/></svg></h1><p>不赶时间，让小小的快乐，刚好相遇。</p></div><div class="hero-art" aria-hidden="true"><span class="art-spark s1">✧</span><span class="art-spark s2">✳</span><div class="floating-fruit peach">${fruitSVG(5)}</div><div class="floating-fruit lime">${fruitSVG(3)}</div><div class="floating-fruit berry">${fruitSVG(1)}</div><span class="art-caption">freshly picked happiness</span><svg class="art-loop" viewBox="0 0 310 125"><path d="M8 88C50 123 274 124 296 54M265 58l31-4-10 25"/></svg></div></section>
  <div class="mode-row"><nav class="mode-tabs" aria-label="游戏模式">${(["journey", "free", "sprint"] as Mode[]).map((m) => `<button data-mode="${m}" class="mode-tab ${g.mode === m ? "active" : ""}" aria-pressed="${g.mode === m}">${icon(m === "journey" ? "leaf" : m === "free" ? "infinity" : "clock")}${labels[m]}${m === "journey" ? "<span>24 关</span>" : ""}</button>`).join("")}</nav><span class="mode-note">${g.mode === "sprint" ? "一点心跳，也是一点快乐。" : "慢慢来，好事会相遇。"} ${icon("heart")}</span></div>
  <div class="game-layout"><aside class="left-column"><section class="journey-card"><div class="overline">${g.mode === "journey" ? "YOUR LITTLE JOURNEY" : "MAKE IT YOURS"}</div><div class="section-label">${icon(g.mode === "journey" ? "leaf" : "infinity")}<h2>${g.mode === "journey" ? chapter.name : g.mode === "free" ? "随心开一盘" : "一杯的时间"}</h2></div><p>${g.mode === "journey" ? chapter.description : g.mode === "free" ? "没有终点，没有催促。\n只需要享受每一次相遇。" : "120 秒能收获多少甜？\n连消与缤纷时刻让分数翻倍。"}</p>${
    g.mode === "journey"
      ? `<div class="chapter-progress"><span>CHAPTER 0${l.chapter + 1}</span><span>${data.stars.slice(l.chapter * 6, l.chapter * 6 + 6).filter((x) => x > 0).length} / 6</span></div><div class="level-mini">${LEVELS.slice(
          l.chapter * 6,
          l.chapter * 6 + 6,
        )
          .map(
            (v) =>
              `<button class="mini-level ${v.id === g.level ? "current" : ""} ${data.stars[v.id - 1] ? "completed" : ""}" data-level="${v.id}" aria-label="第 ${v.id} 关 ${v.name}" ${isUnlocked(v.id) ? "" : "disabled"}><span>${isUnlocked(v.id) ? String(v.id).padStart(2, "0") : icon("lock")}</span><span class="mini-stars">${stars(data.stars[v.id - 1])}</span></button>`,
          )
          .join(
            "",
          )}</div><button class="text-button" data-action="levels">全部关卡 ${icon("arrow")}</button>`
      : `<div class="difficulty-label">当前难度 <strong>${["轻松", "标准", "进阶"][g.difficulty]}</strong></div><button class="text-button" data-action="mode-options">调整${g.mode === "free" ? "难度" : "挑战"} ${icon("arrow")}</button>`
  }</section>
  <section class="tip-card"><span class="tiny-spark">✧</span><span class="overline">LITTLE FIELD NOTES</span><h3>${l.gravity ? "落下，也会有新惊喜" : l.pattern === "stones" ? "给相遇绕一点弯" : "两次转弯，刚好遇见"}</h3><div class="route-doodle">${fruitSVG(1)}<svg viewBox="0 0 130 46"><path d="M4 32H37V10H91V32H125"/><circle cx="4" cy="32" r="3"/><circle cx="125" cy="32" r="3"/></svg>${fruitSVG(1)}</div><p>${l.gravity ? "这一章的水果会向下落。\n每次消除后，再看一眼新布局。" : l.pattern === "stones" ? "小石头不能穿过，也不能消除。\n试试空隙，或棋盘外沿。" : "相同水果，最多转两次弯。\n空白处和棋盘外沿，都可以走。"}</p><button class="text-button" data-action="help">玩法小抄 ${icon("arrow")}</button></section></aside>
  <section class="game-card" aria-label="连连看游戏"><div class="game-card-top"><div class="level-heading"><span class="level-badge">${g.mode === "journey" ? `LEVEL ${String(g.level).padStart(2, "0")}` : g.mode === "free" ? `ROUND ${String(g.round).padStart(2, "0")}` : "120 SECONDS"}</span><button class="board-selector" data-action="${g.mode === "journey" ? "levels" : "mode-options"}" aria-label="${g.mode === "journey" ? "选择关卡" : "调整难度"}"><h2>${l.name}</h2>${icon("arrow")}</button></div><div class="board-top-actions"><span class="rule-tag">${l.gravity ? "↓ 下落" : l.pattern === "stones" ? "◇ 石径" : "✧ 经典"}${g.mode !== "journey" ? " · " + ["轻松", "标准", "进阶"][g.difficulty] : ""}</span><button class="icon-btn pause-btn" data-action="pause" aria-label="${g.phase === "playing" ? "暂停游戏" : "查看收获"}">${icon(g.phase === "playing" ? "pause" : "arrow")}</button></div></div>
  <div class="score-strip"><div><span>${g.mode === "sprint" ? "剩余时间" : "本局得分"}</span><strong id="primary-stat">${g.mode === "sprint" ? time(g.timeLeft) : format(g.score)}</strong></div><div class="score-divider"></div><div><span>${g.mode === "sprint" ? "本局得分" : "等待相遇"}</span><strong id="secondary-stat">${g.mode === "sprint" ? format(g.score) : `${remaining(g.board)}<small> 对</small>`}</strong></div><div class="combo-stat"><span>最佳连消</span><strong id="best-combo">${g.bestCombo}<small> 连</small></strong></div></div>
  <div class="round-objectives" id="round-objectives" aria-label="本局目标"></div>
  <div class="board-shell" id="board-shell"><div class="board" id="board" role="group" aria-label="水果棋盘"></div><svg id="connections" class="connections" aria-hidden="true"></svg><div class="particles" id="particles" aria-hidden="true"></div><div id="board-announcement" class="board-announcement" aria-live="polite"></div></div>
  <div class="play-meters"><div class="combo-meter"><span id="combo-label">连消 · 慢慢找也没关系</span><div class="meter-track"><i id="combo-window"></i></div></div><div class="mini-juice"><span id="mini-juice-label">缤纷蓄能 0%</span><div class="meter-track"><i id="mini-juice-fill"></i></div></div></div>
  <div class="board-caption"><span id="play-caption">${g.mode === "journey" && g.level === 1 ? "点一下水果，再点它的同伴。" : "找到一对相同的水果，连起好心情。"}</span><span class="combo-badge" id="combo-badge"></span></div>
  <div class="tools"><button data-action="hint" class="tool-button" title="标出一对可连接的水果（H）">${icon("hint")}<span>提示<small>找点灵感</small></span><kbd>H</kbd></button><button data-action="shuffle" class="tool-button" title="重新排列剩余水果（S）">${icon("shuffle")}<span>洗牌<small>换个心情</small></span><kbd>S</kbd></button><button data-action="undo" class="tool-button" id="undo-button" title="撤销上一步（Z）">${icon("undo")}<span>撤销<small>再想一步</small></span><kbd>Z</kbd></button></div></section>
  <aside class="right-column"><section class="juice-card"><div class="overline">A LITTLE EXTRA SWEET</div><h2>好心情，蓄满中</h2><p>每次相遇，都在积攒快乐。</p><div class="juice-visual"><span class="juice-spark a">✦</span><span class="juice-spark b">✧</span><div class="juice-jar"><div class="juice-water" id="juice-water"><i></i><i></i><i></i></div><span class="jar-face"><i></i><i></i><b>⌣</b></span><span class="jar-shine"></span><span class="jar-tick t1"></span><span class="jar-tick t2"></span><span class="jar-tick t3"></span><span class="jar-fruit">${fruitSVG(1)}</span></div><span class="juice-percent" id="juice-percent">${g.juice}<small>%</small></span></div><div class="juice-description" id="juice-description">蓄满即开启 <strong>缤纷时刻</strong><br><span>10 秒双倍分数，快乐加一点料。</span></div><div class="juice-track"><i id="juice-track-fill"></i></div></section>
  <section class="harvest-card"><div class="harvest-title">${icon("star")}<h3>${g.mode === "journey" ? "这一关的小收获" : "留下你的高光"}</h3></div><div id="star-objectives" class="star-objectives"></div><div class="fruit-friends">${fruitSVG(2)}${fruitSVG(1)}${fruitSVG(3)}</div><p>每一颗，都有自己的甜。</p></section></aside></div>
  <footer><span>${icon("leaf")}一座随时欢迎你的小果园</span><span>无需赶路 · 自动存档 · 随时回来</span><button class="text-button" data-action="restart">重新开始 ${icon("undo")}</button></footer></main><div id="toast" class="toast" role="status"></div><div id="modal-root"></div><input type="file" id="import-file" accept="application/json,.json" hidden/>`;
  renderBoard();
  updateHUD();
  app.querySelector(".brand")!.addEventListener("click", (e) => {
    e.preventDefault();
    showLevels();
  });
  app
    .querySelectorAll<HTMLButtonElement>("[data-action]")
    .forEach((el) =>
      el.addEventListener("click", () => action(el.dataset.action!)),
    );
  app
    .querySelectorAll<HTMLButtonElement>("[data-mode]")
    .forEach((el) =>
      el.addEventListener("click", () => switchMode(el.dataset.mode as Mode)),
    );
  app
    .querySelectorAll<HTMLButtonElement>("[data-level]")
    .forEach((el) =>
      el.addEventListener("click", () => chooseLevel(Number(el.dataset.level))),
    );
  $("board").addEventListener("click", (e) => {
    const tile = (e.target as HTMLElement).closest<HTMLButtonElement>(
      "[data-cell]",
    );
    if (tile) {
      keyboardInput = (e as MouseEvent).detail === 0;
      selectCell({ r: Number(tile.dataset.r), c: Number(tile.dataset.c) });
    }
  });
  $("board").addEventListener("keydown", boardKeyboard);
  $("import-file").addEventListener("change", importProgress);
}
function renderBoard() {
  const b = $("board");
  b.style.setProperty("--cols", String(g.board[0].length));
  b.style.setProperty("--rows", String(g.board.length));
  b.innerHTML = g.board
    .map((row, r) =>
      row
        .map((v, c) =>
          v === -1
            ? `<div class="stone-cell" aria-label="石头障碍"><span>✧</span></div>`
            : v === 0
              ? '<div class="empty-cell" aria-hidden="true"></div>'
              : `<button class="fruit-tile" data-cell="${r},${c}" data-r="${r}" data-c="${c}" data-fruit="${v}" ${g.phase !== "playing" ? "disabled" : ""} aria-label="${FRUITS[v - 1].name}，第 ${r + 1} 行第 ${c + 1} 列" aria-pressed="false" style="--fruit-color:${FRUITS[v - 1].color}">${fruitSVG(v)}<span class="selection-dot"></span></button>`,
        )
        .join(""),
    )
    .join("");
  updateSelection();
  $("board-shell").querySelector(".finished-board")?.remove();
  if (g.phase !== "playing") {
    const panel = document.createElement("div");
    panel.className = "finished-board";
    panel.innerHTML = `<div>${fruitSVG(1)}</div><h3>${g.mode === "sprint" ? "鲜榨完成，收获满满。" : "这一盘，甜蜜收获。"}</h3><button class="primary-button" id="board-result">查看收获 · 继续游玩 ${icon("arrow")}</button>`;
    $("board-shell").append(panel);
    panel.querySelector("button")!.addEventListener("click", showResult);
  }
}
function updateSelection() {
  document.querySelectorAll<HTMLButtonElement>("[data-cell]").forEach((el) => {
    const p = { r: Number(el.dataset.r), c: Number(el.dataset.c) };
    el.classList.toggle("selected", !!selected && same(selected, p));
    el.classList.toggle(
      "hinted",
      hintPair.some((x) => same(x, p)),
    );
    el.setAttribute("aria-pressed", String(!!selected && same(selected, p)));
  });
}
function updateHUD() {
  if (!$("primary-stat")) return;
  $("primary-stat").textContent =
    g.mode === "sprint" ? time(g.timeLeft) : format(g.score);
  $("primary-stat").classList.toggle(
    "time-warning",
    g.mode === "sprint" && g.timeLeft < 20000,
  );
  $("secondary-stat").innerHTML =
    g.mode === "sprint"
      ? format(g.score)
      : `${remaining(g.board)}<small> 对</small>`;
  $("best-combo").innerHTML = `${g.bestCombo}<small> 连</small>`;
  const comboLive = g.combo > 0 && g.elapsed - g.lastMatch < COMBO_WINDOW;
  $("combo-badge").textContent = comboLive
    ? `${g.combo} 连消${g.combo > 1 ? " ✧" : ""}`
    : "";
  $("combo-badge").classList.toggle("visible", comboLive);
  const fever = g.fever > 0;
  document.body.classList.toggle("fever", fever);
  $("juice-water").style.height = `${fever ? 88 : 8 + g.juice * 0.8}%`;
  $("juice-percent").innerHTML = fever
    ? `${Math.ceil(g.fever / 1000)}<small>s</small>`
    : `${Math.floor(g.juice)}<small>%</small>`;
  $("juice-track-fill").style.width = `${fever ? g.fever / 100 : g.juice}%`;
  $("juice-description").innerHTML = fever
    ? "缤纷时刻 <strong>得分 × 2</strong><br><span>这一刻，甜度刚刚好。</span>"
    : "蓄满即开启 <strong>缤纷时刻</strong><br><span>10 秒双倍分数，快乐加一点料。</span>";
  document
    .querySelectorAll<HTMLButtonElement>(".tool-button")
    .forEach((btn) => {
      btn.disabled =
        g.phase !== "playing" ||
        busy ||
        (btn.dataset.action === "undo" && !g.history.length);
    });
  $("combo-label").textContent = comboLive
    ? `${g.combo} 连消 · ${((COMBO_WINDOW - (g.elapsed - g.lastMatch)) / 1000).toFixed(1)}s`
    : "连消 · 慢慢找也没关系";
  $("combo-window").style.width =
    `${comboLive ? Math.max(0, 1 - (g.elapsed - g.lastMatch) / COMBO_WINDOW) * 100 : 0}%`;
  $("mini-juice-label").textContent = fever
    ? `缤纷时刻 ×2 · ${(g.fever / 1000).toFixed(1)}s`
    : `缤纷蓄能 ${Math.floor(g.juice)}%`;
  $("mini-juice-fill").style.width = `${fever ? g.fever / 100 : g.juice}%`;
  hudHTML(
    "round-objectives",
    g.mode === "journey"
      ? `<span class="${g.phase === "won" ? "achieved" : ""}">${icon("star")}清盘 ${g.cleared}/${g.total}</span><span class="${g.assists === 0 ? "achieved" : "inactive"}">${icon(g.assists === 0 ? "check" : "star")}${g.assists === 0 ? "不用辅助" : "辅助已用"}</span><span class="${g.bestCombo >= config().target ? "achieved" : ""}">${icon("spark")}目标 ${config().target} 连消</span>`
      : `<span>${icon("leaf")}第 ${g.round} 盘</span><span>${icon("trophy")}最佳 ${format(g.mode === "sprint" ? data.best : data.freeBest)}</span><span>${g.mode === "sprint" ? "清盘 +500" : "不限时 · 随心玩"}</span>`,
  );
  $("star-objectives").innerHTML =
    g.mode === "journey"
      ? `<div class="${g.phase === "won" ? "achieved" : ""}">${icon(g.phase === "won" ? "check" : "star")}清空这一盘<span>${g.cleared}/${g.total}</span></div><div class="${g.assists === 0 ? "achieved" : ""}">${icon(g.assists === 0 ? "check" : "star")}不用辅助通关<span>${g.assists === 0 ? "保持中" : "下次再试"}</span></div><div class="${g.bestCombo >= config().target ? "achieved" : ""}">${icon(g.bestCombo >= config().target ? "check" : "star")}达到 ${config().target} 连消<span>${Math.min(g.bestCombo, config().target)}/${config().target}</span></div>`
      : `<div>${icon("trophy")}历史最高<span>${format(g.mode === "sprint" ? data.best : data.freeBest)}</span></div><div>${icon("spark")}本局连消<span>${g.bestCombo} 连</span></div><div>${icon("leaf")}收获水果<span>${g.cleared} 对</span></div>`;
}
function isUnlocked(id: number) {
  return id === 1 || data.stars[id - 2] > 0;
}
function toast(message: string) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove("show"), 2700);
}
function caption(message: string) {
  $("play-caption").textContent = message;
}
function selectCell(p: Point) {
  syncTime();
  if (paused || modalKind || g.phase !== "playing") return;
  if (busy) {
    const tile = document.querySelector<HTMLElement>(
        `[data-cell="${p.r},${p.c}"]`,
      ),
      fruit = Number(tile?.dataset.fruit);
    if (
      tile &&
      !tile.classList.contains("popping") &&
      fruit > 0 &&
      g.board[p.r]?.[p.c] === fruit &&
      pendingClicks.length < 2
    )
      pendingClicks.push({ point: p, fruit });
    return;
  }
  if (g.board[p.r]?.[p.c] <= 0) return;
  clearTimeout(hintTimer);
  $("connections").innerHTML = "";
  initAudio();
  hintPair = [];
  lastPointer = p;
  if (!selected) {
    selected = p;
    sound("tap");
    updateSelection();
    return;
  }
  if (same(selected, p)) {
    selected = null;
    updateSelection();
    return;
  }
  const path = findPath(g.board, selected, p);
  if (path) {
    void match(selected, p, path);
    return;
  }
  const old = selected;
  caption(
    g.board[old.r][old.c] !== g.board[p.r][p.c]
      ? "要找同一种水果哦，这颗也在等它的同伴。"
      : "这条路暂时不通，试试空隙或棋盘外沿。",
  );
  const el = document.querySelector(`[data-cell="${p.r},${p.c}"]`);
  el?.classList.add("nope");
  sound("error");
  selected = p;
  updateSelection();
}
function drawPath(path: Point[], fruit: number, effect = true) {
  const shell = $("board-shell").getBoundingClientRect(),
    board = $("board").getBoundingClientRect();
  const first = document.querySelector<HTMLElement>("[data-cell]");
  if (!first) return;
  const size = first.getBoundingClientRect(),
    style = getComputedStyle($("board")),
    gap = parseFloat(style.gap) || 0;
  const columnStep = parseFloat(style.gridTemplateColumns) + gap,
    rowStep = parseFloat(style.gridTemplateRows) + gap;
  // The logical outer row/column is drawn in a compact gutter around the tiles.
  const center = (p: Point) => ({
    x:
      p.c < 0
        ? board.left - shell.left - 8
        : p.c >= g.board[0].length
          ? board.right - shell.left + 8
          : board.left - shell.left + p.c * columnStep + size.width / 2,
    y:
      p.r < 0
        ? board.top - shell.top - 8
        : p.r >= g.board.length
          ? board.bottom - shell.top + 8
          : board.top - shell.top + p.r * rowStep + size.height / 2,
  });
  const pts = path.map(center),
    svg = $("connections") as unknown as SVGSVGElement;
  svg.classList.toggle("hint-connection", !effect);
  svg.setAttribute("viewBox", `0 0 ${shell.width} ${shell.height}`);
  const points = pts.map((p) => `${p.x},${p.y}`).join(" ");
  svg.innerHTML = `<polyline points="${points}" class="connection-glow"/><polyline points="${points}" class="connection-line"/>${pts.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="#fff"/>`).join("")}`;
  if (data.settings.motion && effect)
    for (const p of [pts[0], pts[pts.length - 1]])
      for (let i = 0; i < 9; i++) {
        const s = document.createElement("i");
        s.className = "particle";
        s.style.cssText = `left:${p.x}px;top:${p.y}px;--dx:${(Math.random() - 0.5) * 105}px;--dy:${(Math.random() - 0.5) * 110}px;--rot:${Math.random() * 360}deg;background:${i % 3 === 0 ? "#f2d288" : FRUITS[fruit - 1].color};animation-delay:${Math.random() * 50}ms;`;
        $("particles").append(s);
        setTimeout(() => s.remove(), 900);
      }
}
function focusNear(origin: Point | null) {
  if (!keyboardInput || !origin || modalKind) return;
  const cells = [
    ...document.querySelectorAll<HTMLButtonElement>(
      "[data-cell]:not(:disabled)",
    ),
  ];
  cells.sort(
    (a, b) =>
      Math.abs(Number(a.dataset.r) - origin.r) +
      Math.abs(Number(a.dataset.c) - origin.c) -
      Math.abs(Number(b.dataset.r) - origin.r) -
      Math.abs(Number(b.dataset.c) - origin.c),
  );
  cells[0]?.focus({ preventScroll: true });
}
function fallingPositions(a: Point, b: Point) {
  const moves: { r: number; c: number; top: number }[] = [];
  if (!config().gravity || !data.settings.motion) return moves;
  for (let c = 0; c < g.board[0].length; c++) {
    let bottom = g.board.length - 1;
    for (let r = bottom; r >= -1; r--)
      if (r === -1 || g.board[r][c] === -1) {
        let target = bottom;
        for (let from = bottom; from > r; from--)
          if (
            g.board[from][c] > 0 &&
            !same({ r: from, c }, a) &&
            !same({ r: from, c }, b)
          ) {
            const tile = document.querySelector<HTMLElement>(
              `[data-cell="${from},${c}"]`,
            );
            if (tile && from !== target)
              moves.push({
                r: target,
                c,
                top: tile.getBoundingClientRect().top,
              });
            target--;
          }
        bottom = r - 1;
      }
  }
  return moves;
}
async function match(a: Point, b: Point, path: Point[]) {
  busy = true;
  const token = ++animation,
    fruit = g.board[a.r][a.c],
    falls = fallingPositions(a, b);
  drawPath(path, fruit);
  const tile = document.querySelector<HTMLElement>(
    `[data-cell="${b.r},${b.c}"]`,
  );
  if (tile && data.settings.motion) {
    const rect = tile.getBoundingClientRect(),
      shell = $("board-shell").getBoundingClientRect();
    const pop = document.createElement("b");
    pop.className = "score-pop";
    pop.style.cssText = `left:${rect.left - shell.left + rect.width / 2}px;top:${rect.top - shell.top}px;`;
    pop.textContent = "";
    $("particles").append(pop);
    setTimeout(() => pop.remove(), 800);
  }
  for (const p of [a, b])
    document
      .querySelector(`[data-cell="${p.r},${p.c}"]`)
      ?.classList.add("popping");
  const outcome = commitMatch(g, { a, b }, config());
  data.totalPairs++;
  recordResult();
  const pop = $("particles").querySelector(".score-pop:last-child");
  if (pop) pop.textContent = `+${outcome.points}`;
  sound("match", {
    fruit,
    combo: outcome.combo,
    fever: outcome.fever,
    startedFever: outcome.startedFever,
    cleared: outcome.clearedBoard
      ? g.mode === "sprint"
        ? "round"
        : "win"
      : undefined,
  });
  if (outcome.startedFever && g.phase === "playing") {
    announce("缤纷时刻", "甜度翻倍 · 10 秒");
  }
  selected = null;
  hintPair = [];
  save();
  updateHUD();
  caption(
    g.combo >= 3
      ? `${g.combo} 连消！好事正在接连发生。`
      : `甜甜相遇 +${outcome.points} · 再找一对吧。`,
  );
  await new Promise((r) => setTimeout(r, data.settings.motion ? 260 : 45));
  if (token !== animation) return;
  $("connections").innerHTML = "";
  renderBoard();
  busy = false;
  if (outcome.clearedBoard) {
    if (g.mode === "sprint") {
      announce("一盘鲜榨完成", "清盘奖励 +500 · 继续收获");
    } else {
      if (!modalKind) {
        render();
        showResult();
      }
      return;
    }
  } else if (!outcome.autoShuffled) {
    for (const move of falls) {
      const target = document.querySelector<HTMLElement>(
        `[data-cell="${move.r},${move.c}"]`,
      );
      if (target) {
        const dy = move.top - target.getBoundingClientRect().top;
        target.animate(
          [
            { transform: `translateY(${dy}px)` },
            { transform: "translateY(0)" },
          ],
          { duration: 210, easing: "cubic-bezier(.2,.7,.3,1)" },
        );
      }
    }
  }
  if (outcome.autoShuffled) {
    toast("没有路可连啦，果园已免费整理好。星级不受影响。");
    sound("shuffle");
  }
  updateHUD();
  focusNear(b);
  const queued = pendingClicks.splice(0);
  if (!modalKind && !paused)
    for (const input of queued)
      if (g.board[input.point.r]?.[input.point.c] === input.fruit)
        selectCell(input.point);
}
function announce(title: string, subtitle: string) {
  const el = $("board-announcement");
  el.innerHTML = `<strong>${title}</strong><span>${subtitle}</span>`;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 1600);
}
function ensureMove() {
  if (repairBoard(g)) {
    renderBoard();
    save();
    toast("没有路可连啦，果园已免费整理好。星级不受影响。");
    sound("shuffle");
  }
}
function finishSprint() {
  g.phase = "lost";
  g.timeLeft = 0;
  g.fever = 0;
  g.combo = 0;
  busy = false;
  pendingClicks = [];
  animation++;
  recordResult();
  save();
  render();
  sound("finish");
  showResult();
}
function assist(kind: "hint" | "shuffle" | "undo") {
  syncTime();
  if (paused || modalKind || busy || g.phase !== "playing") return;
  if (kind === "undo") {
    const s = g.history.pop();
    if (!s) {
      toast("还没有需要撤销的一步。");
      return;
    }
    // Time and consumed fever duration cannot be reclaimed by undo.
    const currentFever = g.fever;
    Object.assign(g, s, {
      board: clone(s.board),
      combo: 0,
      lastMatch: 0,
      fever: Math.min(currentFever, s.fever),
    });
    g.assists++;
    selected = null;
    hintPair = [];
    renderBoard();
    sound("undo");
    caption("回到上一步。慢慢想，没关系。");
  } else if (kind === "hint") {
    const pair = findPairs(g.board, 1)[0];
    if (!pair) {
      ensureMove();
      return;
    }
    if (hintPair.length && hintPair.some((p) => same(p, pair.a))) return;
    g.assists++;
    hintPair = [pair.a, pair.b];
    selected = null;
    updateSelection();
    drawPath(pair.path, g.board[pair.a.r][pair.a.c], false);
    clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => {
      $("connections").innerHTML = "";
    }, 1600);
    sound("hint");
    caption("这两颗在发光，它们之间有一条甜甜的路。");
  } else {
    remember();
    g.assists++;
    g.board = reshuffle(g.board);
    g.combo = 0;
    selected = null;
    hintPair = [];
    renderBoard();
    sound("shuffle");
    caption("换个心情，好事重新排列。");
  }
  updateHUD();
  save();
  if (kind !== "hint") focusNear(lastPointer);
}
function action(a: string) {
  initAudio();
  if (a === "hint" || a === "shuffle" || a === "undo") {
    assist(a);
    return;
  }
  if (a === "pause") showPause();
  if (a === "help") showHelp();
  if (a === "levels") showLevels();
  if (a === "settings") showSettings();
  if (a === "restart") confirmRestart();
  if (a === "mode-options") showModeOptions(g.mode);
  if (a === "sound") {
    data.settings.sound = !data.settings.sound;
    setSound(data.settings.sound);
    save();
    const btn = document.querySelector('[data-action="sound"]')!;
    btn.innerHTML = icon(data.settings.sound ? "sound" : "mute");
    btn.setAttribute(
      "aria-label",
      data.settings.sound ? "关闭音效" : "开启音效",
    );
    toast(
      data.settings.sound
        ? "声音已开启，小小音符准备好啦。"
        : "声音已关闭，安静地享受果园。",
    );
  }
}
function openModal(kind: string, html: string, wide = false) {
  if (kind !== "result" && syncTime()) return;
  pendingClicks = [];
  if (!modalKind) previousFocus = document.activeElement as HTMLElement;
  if (kind !== "result") stopAudio();
  modalKind = kind;
  paused = true;
  $("modal-root").innerHTML =
    `<div class="modal-backdrop"><section class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><button class="icon-btn modal-close" data-close aria-label="关闭">${icon("close")}</button>${html}</section></div>`;
  document.querySelector("main")?.setAttribute("inert", "");
  document.querySelector("header")?.setAttribute("inert", "");
  $("modal-root")
    .querySelector("[data-close]")!
    .addEventListener("click", () => closeModal());
  $("modal-root")
    .querySelector(".modal-backdrop")!
    .addEventListener("click", (e) => {
      if (e.target === e.currentTarget && kind !== "result") closeModal();
    });
  $("modal-root")
    .querySelector<HTMLElement>("button:not(.modal-close),input,select")
    ?.focus({ preventScroll: true });
}
function closeModal() {
  $("modal-root").innerHTML = "";
  modalKind = "";
  paused = false;
  timer = performance.now();
  document.querySelector("main")?.removeAttribute("inert");
  document.querySelector("header")?.removeAttribute("inert");
  if (g.phase !== "playing") {
    render();
    caption("这局已经收获完成。查看收获，开启下一段小冒险。");
  }
  // A finished board re-renders its controls; restore their new DOM identity.
  let focusTarget =
    previousFocus?.isConnected &&
    previousFocus !== document.body &&
    previousFocus !== document.documentElement
      ? previousFocus
      : null;
  if (!focusTarget && previousFocus) {
    for (const attribute of ["id", "data-action", "data-mode", "data-level"]) {
      const value = previousFocus.getAttribute(attribute);
      if (!value) continue;
      focusTarget =
        Array.from(
          document.querySelectorAll<HTMLElement>(`[${attribute}]`),
        ).find((element) => element.getAttribute(attribute) === value) ?? null;
      if (focusTarget) break;
    }
  }
  if (!focusTarget && g.phase !== "playing") focusTarget = $("board-result");
  focusTarget?.focus({ preventScroll: true });
}
function bind(id: string, fn: () => void) {
  $(id)?.addEventListener("click", fn);
}
function showPause() {
  if (g.phase !== "playing") {
    showResult();
    return;
  }
  openModal(
    "pause",
    `<div class="modal-illustration">${fruitSVG(5)}</div><div class="overline">TAKE A LITTLE BREATHER</div><h2 id="dialog-title">果园等你，不着急。</h2><p>这一局已经替你记住了。<br>休息一下，回来继续连起好心情。</p><div class="pause-stats"><span>得分 <b>${format(g.score)}</b></span><span>${g.mode === "sprint" ? "剩余" : "已玩"} <b>${time(g.mode === "sprint" ? g.timeLeft : g.elapsed)}</b></span></div><button id="resume" class="primary-button">${icon("play")} 继续这一局</button><button id="pause-restart" class="secondary-button">重新开始</button>`,
  );
  bind("resume", closeModal);
  bind("pause-restart", confirmRestart);
  save();
}
function showHelp() {
  openModal(
    "help",
    `<div class="overline">THE LITTLE HOW-TO</div><h2 id="dialog-title">相遇，只需要一点巧思。</h2><div class="help-example">${fruitSVG(1)}<svg viewBox="0 0 160 70"><path d="M5 55H48V15H112V55H155"/><circle cx="48" cy="15" r="8"/><circle cx="112" cy="15" r="8"/><text x="48" y="18">1</text><text x="112" y="18">2</text></svg>${fruitSVG(1)}</div><div class="help-list"><div><b>01</b><p><strong>找到一对同样的水果</strong>依次点选。连线最多两次转弯，经过的地方必须为空，也能绕过棋盘外沿。</p></div><div><b>02</b><p><strong>连着消除，收获更多快乐</strong>在 5.5 秒内接着消除，连消继续。每对 100 分，每级连消额外加 25 分（最多加 225 分）。不用急，连消断了也能继续。</p></div><div><b>03</b><p><strong>果汁蓄满，进入缤纷时刻</strong>消除给果汁充能，连消充得更多。蓄满后 10 秒得分翻倍；暂停时所有计时也会暂停。</p></div><div><b>04</b><p><strong>有点卡住？让果园帮帮你</strong>提示、洗牌、撤销自由使用。没有可连接的水果会自动洗牌，不影响星级。石头不能穿过，下落关会在消除后向下补齐。</p></div></div><div class="help-foot">${icon("star")}清盘一星 · 不用辅助一星 · 达到关卡连消目标一星<br><span>键盘：方向键移动，Enter 选中 · H 提示 · S 洗牌 · Z 撤销 · 空格暂停</span></div><button id="help-ok" class="primary-button">知道啦，去收获一点甜 ${icon("arrow")}</button>`,
  );
  bind("help-ok", closeModal);
}
function showSettings() {
  openModal(
    "settings",
    `<div class="overline">A GROVE THAT FEELS LIKE YOU</div><h2 id="dialog-title">让果园，合你的心意。</h2><div class="setting-row"><div><strong>果园音效</strong><span>清亮的水果音，偶尔收获一点惊喜</span></div><button role="switch" aria-checked="${data.settings.sound}" id="setting-sound" class="switch ${data.settings.sound ? "on" : ""}" aria-label="果园音效"><i></i></button></div><div class="setting-row volume-row"><label for="setting-volume"><strong>音效音量</strong><span>调到舒服的位置，松手试听</span></label><div class="volume-control"><input id="setting-volume" type="range" min="0" max="100" step="1" value="${Math.round(data.settings.volume * 100)}" aria-label="音效音量" ${data.settings.sound ? "" : "disabled"}><output id="volume-value" for="setting-volume">${Math.round(data.settings.volume * 100)}%</output></div></div><div class="setting-row"><div><strong>灵动效果</strong><span>关闭后减少弹跳、粒子和闪烁</span></div><button role="switch" aria-checked="${data.settings.motion}" id="setting-motion" class="switch ${data.settings.motion ? "on" : ""}" aria-label="灵动效果"><i></i></button></div><div class="storage-note">${icon("leaf")}进度保存在当前浏览器，包括三个模式各自的棋局。清理浏览器数据会移除存档；换设备前可以导出备份。</div><div class="backup-buttons"><button id="export" class="secondary-button">${icon("download")} 导出进度</button><button id="import" class="secondary-button">${icon("upload")} 导入进度</button></div><div class="settings-small">果冻果园 v1.0 · 为一点纯粹的快乐而做</div>`,
  );
  const volumeSlider = $("setting-volume") as HTMLInputElement;
  volumeSlider.addEventListener("input", () => {
    data.settings.volume = Number(volumeSlider.value) / 100;
    setVolume(data.settings.volume);
    $("volume-value").textContent = `${volumeSlider.value}%`;
    save();
  });
  volumeSlider.addEventListener("change", () => sound("match", { combo: 3 }));
  for (const key of ["sound", "motion"] as const)
    bind(`setting-${key}`, () => {
      data.settings[key] = !data.settings[key];
      setSound(data.settings.sound);
      volumeSlider.disabled = !data.settings.sound;
      if (key === "sound" && data.settings.sound) sound("tap");
      document.documentElement.classList.toggle(
        "reduce-motion",
        !data.settings.motion,
      );
      const b = $(`setting-${key}`);
      b.classList.toggle("on", data.settings[key]);
      b.setAttribute("aria-checked", String(data.settings[key]));
      save();
      const soundBtn = document.querySelector('[data-action="sound"]')!;
      soundBtn.innerHTML = icon(data.settings.sound ? "sound" : "mute");
      soundBtn.setAttribute(
        "aria-label",
        data.settings.sound ? "关闭音效" : "开启音效",
      );
    });
  bind("export", () => {
    save();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `果冻果园-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("进度已经打包好啦。");
  });
  bind("import", () => $("import-file").click());
}
async function importProgress(e: Event) {
  const input = e.target as HTMLInputElement,
    file = input.files?.[0];
  if (!file) return;
  try {
    if (file.size > 2_000_000)
      throw new Error("存档文件太大，请选择果冻果园导出的 JSON 文件。");
    const imported = parseSave(await file.text());
    openModal(
      "import",
      `<div class="modal-illustration">${fruitSVG(3)}</div><h2 id="dialog-title">带回这座小果园？</h2><p>这份存档包含 ${imported.stars.filter((v) => v > 0).length} 个已通关关卡、${imported.stars.reduce((a, b) => a + b, 0)} 颗星。<br>导入会替换本机当前进度。</p><button id="confirm-import" class="primary-button">确认导入</button><button id="cancel-import" class="secondary-button">保留当前果园</button>`,
    );
    bind("confirm-import", () => {
      const restored = imported.sessions[imported.mode];
      closeModal();
      data = imported;
      selected = null;
      hintPair = [];
      busy = false;
      animation++;
      if (!restored) newGame("journey");
      else {
        g = restored;
        restoreCurrent();
      }
      toast("欢迎回来，果园已恢复。");
    });
    bind("cancel-import", showSettings);
  } catch (error) {
    toast(error instanceof Error ? error.message : "未能读取这份存档。");
  }
  input.value = "";
}
function showLevels() {
  openModal(
    "levels",
    `<div class="overline">24 LITTLE MOMENTS OF JOY</div><h2 id="dialog-title">你的小小果园漫游。</h2><p>收集的不是星星，是一颗接一颗的好心情。<br><span class="total-stars">${icon("star")} ${data.stars.reduce((a, b) => a + b, 0)} / 72</span></p><div class="chapter-grid">${CHAPTERS.map(
      (c, i) =>
        `<section><div class="chapter-title"><b>0${i + 1}</b><span><strong>${c.name}</strong><small>${c.description}</small></span></div><div class="chapter-levels">${LEVELS.slice(
          i * 6,
          i * 6 + 6,
        )
          .map(
            (l) =>
              `<button data-pick="${l.id}" class="level-select ${g.mode === "journey" && g.level === l.id ? "current" : ""}" ${isUnlocked(l.id) ? "" : "disabled"}><span>${isUnlocked(l.id) ? String(l.id).padStart(2, "0") : icon("lock")}</span><small>${l.name}</small><span class="mini-stars">${stars(data.stars[l.id - 1])}</span></button>`,
          )
          .join("")}</div></section>`,
    ).join("")}</div>`,
    true,
  );
  document
    .querySelectorAll<HTMLButtonElement>("[data-pick]")
    .forEach((b) =>
      b.addEventListener("click", () => chooseLevel(Number(b.dataset.pick))),
    );
}
function chooseLevel(id: number) {
  if (!isUnlocked(id)) return;
  if (g.mode === "journey" && g.level === id && g.phase === "playing") {
    closeModal();
    return;
  }
  if (g.mode === "journey" && g.phase === "playing" && g.cleared > 0) {
    openModal(
      "leave",
      `<h2 id="dialog-title">去另一片果园看看？</h2><p>切换关卡会重新开始一局。已经收集的星星会保留。</p><button id="leave-ok" class="primary-button">前往第 ${id} 关</button><button id="leave-no" class="secondary-button">继续当前关卡</button>`,
    );
    bind("leave-ok", () => {
      closeModal();
      newGame("journey", id);
    });
    bind("leave-no", closeModal);
  } else {
    closeModal();
    newGame("journey", id);
  }
}
function switchMode(mode: Mode) {
  if (g.mode === mode) {
    if (mode === "journey") showLevels();
    else showModeOptions(mode);
    return;
  }
  syncTime();
  save();
  if (data.sessions[mode]) {
    closeModal();
    g = data.sessions[mode]!;
    data.mode = mode;
    selected = null;
    hintPair = [];
    animation++;
    busy = false;
    restoreCurrent();
  } else showModeOptions(mode);
}
function showModeOptions(mode: Mode) {
  if (mode === "journey") {
    closeModal();
    newGame("journey");
    return;
  }
  openModal(
    "mode-options",
    `<div class="modal-illustration">${fruitSVG(mode === "free" ? 3 : 2)}</div><div class="overline">${mode === "free" ? "JUST FOR THE JOY OF IT" : "FRESHLY SQUEEZED IN 120 SECONDS"}</div><h2 id="dialog-title">${mode === "free" ? "今天，想要几分甜？" : "来一杯，限时鲜榨。"}</h2><p>${mode === "free" ? "不限时、不催促，每一盘都是新的。" : "120 秒，尽情消除。清盘奖励 500 分，并自动进入新棋盘。"}<br>${g.mode === mode && g.phase === "playing" && g.cleared > 0 ? "开始新一局会替换本模式当前棋局。" : "各模式的当前棋局会分别保存。"}</p><div class="difficulty-options">${["轻松", "标准", "进阶"].map((s, i) => `<button data-difficulty="${i}" class="difficulty-option ${i === 1 ? "recommended" : ""}"><strong>${s}</strong><small>${mode === "sprint" ? ["4 种水果 · 经典", "6 种水果 · 留白", "9 种水果 · 石径"][i] : ["4 种水果 · 经典", "6 种水果 · 留白", "9 种水果 · 下落石径"][i]}</small>${i === 1 ? "<span>刚刚好</span>" : ""}</button>`).join("")}</div>`,
  );
  document
    .querySelectorAll<HTMLButtonElement>("[data-difficulty]")
    .forEach((b) =>
      b.addEventListener("click", () => {
        const difficulty = Number(b.dataset.difficulty);
        closeModal();
        newGame(mode, 1, difficulty);
      }),
    );
}
function confirmRestart() {
  openModal(
    "restart",
    `<div class="modal-illustration">${fruitSVG(2)}</div><h2 id="dialog-title">换一盘，新鲜好心情。</h2><p>这一局的分数和棋盘会重新开始。<br>已经收集的星星、历史最佳都会保留。</p><button id="restart-ok" class="primary-button">重新开始 ${icon("shuffle")}</button><button id="restart-no" class="secondary-button">再想想，继续这局</button>`,
  );
  bind("restart-ok", () => {
    const { mode, level, difficulty } = g;
    closeModal();
    newGame(mode, level, difficulty);
  });
  bind("restart-no", () => {
    closeModal();
    if (g.phase !== "playing") showResult();
  });
}
function showResult() {
  const n = starsEarned(),
    journey = g.mode === "journey",
    sprint = g.mode === "sprint",
    all = journey && g.level === 24;
  openModal(
    "result",
    `<div class="result-fruits">${fruitSVG(3)}${fruitSVG(1)}${fruitSVG(2)}</div><div class="overline">${sprint ? "FRESHLY SQUEEZED. NICELY DONE." : all ? "A WHOLE SUMMER OF SWEETNESS" : "A LITTLE MOMENT, WELL SPENT."}</div><h2 id="dialog-title">${sprint ? "这一杯，收获满满。" : all ? "整个夏天，都甜了。" : "莓好相遇，收获完成！"}</h2><p>${sprint ? "时间刚好，快乐新鲜。下一杯会更甜吗？" : all ? "24 次小小冒险，串起了整座果园。\n随时回来，把喜欢的关卡再玩一遍。" : journey ? "又一片小小果园，被你点亮了。" : "没有白过的片刻，只有刚好的快乐。"}</p>${journey ? `<div class="result-stars">${stars(n)}</div>` : ""}<div class="result-stats"><div><small>本局得分</small><strong>${format(g.score)}</strong></div><div><small>最佳连消</small><strong>${g.bestCombo}<em> 连</em></strong></div><div><small>${sprint ? "收获水果" : "慢享时光"}</small><strong>${sprint ? g.cleared : time(g.elapsed)}${sprint ? "<em> 对</em>" : ""}</strong></div></div>${journey ? `<div class="result-reasons"><span class="yes">${icon("check")}完成消除</span><span class="${g.assists === 0 ? "yes" : ""}">${icon(g.assists === 0 ? "check" : "star")}不用辅助</span><span class="${g.bestCombo >= config().target ? "yes" : ""}">${icon(g.bestCombo >= config().target ? "check" : "star")}${config().target} 连消</span></div>` : `<div class="best-line">${icon("trophy")}历史最佳 ${format(sprint ? data.best : data.freeBest)}</div>`}<button id="result-next" class="primary-button">${journey ? (all ? "回到果园，重温快乐" : "下一关 · " + LEVELS[Math.min(g.level, 23)].name) : sprint ? "再鲜榨一杯" : "再来一盘，新鲜出发"} ${icon("arrow")}</button><button id="result-replay" class="secondary-button">${journey ? "再玩一次，摘更多星" : "调整难度"}</button>`,
  );
  bind("result-next", () => {
    const { mode, level, difficulty, round } = g;
    closeModal();
    if (all) {
      showLevels();
      return;
    }
    newGame(mode, journey ? level + 1 : 1, difficulty);
    if (mode === "free") {
      g.round = round + 1;
      save();
      render();
    }
  });
  bind("result-replay", () => {
    if (journey) {
      closeModal();
      newGame("journey", g.level);
    } else showModeOptions(g.mode);
  });
}
function boardKeyboard(e: KeyboardEvent) {
  keyboardInput = true;
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-cell]");
  if (!el) return;
  const directions: Record<string, Point> = {
    ArrowUp: { r: -1, c: 0 },
    ArrowDown: { r: 1, c: 0 },
    ArrowLeft: { r: 0, c: -1 },
    ArrowRight: { r: 0, c: 1 },
  };
  const d = directions[e.key];
  if (!d) return;
  e.preventDefault();
  let r = Number(el.dataset.r) + d.r,
    c = Number(el.dataset.c) + d.c;
  while (r >= 0 && r < g.board.length && c >= 0 && c < g.board[0].length) {
    const next = document.querySelector<HTMLElement>(`[data-cell="${r},${c}"]`);
    if (next) {
      next.focus();
      return;
    }
    r += d.r;
    c += d.c;
  }
}
document.addEventListener("keydown", (e) => {
  if (modalKind) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeModal();
      return;
    }
    if (e.key === "Tab") {
      const items = [
        ...$("modal-root").querySelectorAll<HTMLElement>(
          'button:not(:disabled),input,select,[tabindex="0"]',
        ),
      ];
      const first = items[0],
        last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    return;
  }
  if (
    e.ctrlKey ||
    e.metaKey ||
    e.altKey ||
    ["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement).tagName)
  )
    return;
  if (
    e.key === "Escape" ||
    (e.code === "Space" &&
      (e.target === document.body ||
        (e.target as HTMLElement).hasAttribute("data-cell")))
  ) {
    e.preventDefault();
    showPause();
  }
  if (e.key.toLowerCase() === "h") {
    keyboardInput = true;
    assist("hint");
  }
  if (e.key.toLowerCase() === "s") {
    keyboardInput = true;
    assist("shuffle");
  }
  if (e.key.toLowerCase() === "z") {
    keyboardInput = true;
    assist("undo");
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopAudio();
    save();
    if (g.phase === "playing" && !modalKind) showPause();
  }
  timer = performance.now();
});
window.addEventListener("pagehide", () => {
  stopAudio();
  save();
});
window.addEventListener("resize", () => {
  $("connections").innerHTML = "";
});
function syncTime(now = performance.now()) {
  const dt = Math.max(0, now - timer);
  timer = now;
  if (!g || paused || modalKind || document.hidden || g.phase !== "playing")
    return false;
  saveClock += dt;
  const previousFever = g.fever,
    previousTime = g.timeLeft;
  if (advanceGame(g, dt)) {
    finishSprint();
    return true;
  }
  if (g.mode === "sprint" && previousTime > 10000 && g.timeLeft <= 10000)
    sound("time");
  else if (previousFever > 0 && g.fever === 0) sound("feverEnd");
  return false;
}
function tick(now: number) {
  syncTime(now);
  if (!paused && !modalKind && !document.hidden) {
    if (saveClock > 2000) {
      save();
      saveClock = 0;
    }
    updateHUD();
  }
  window.setTimeout(() => tick(performance.now()), 100);
}
const saved = data.sessions[data.mode];
if (saved) {
  g = saved;
  restoreCurrent();
} else newGame("journey");
if (loaded.warning) setTimeout(() => toast(loaded.warning!), 250);
tick(performance.now());
