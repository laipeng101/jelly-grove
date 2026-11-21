import "./view.css";
import { fruitSVG, FRUITS, icon } from "../art";
import { initAudio, setSound, setVolume, sound, stopAudio } from "../audio";
import { loadSave, readSaveFile, watchSaveSettings, writeSettings } from "../storage";
import { offlineDownloadNote } from "../offline";
import type { Board, Point } from "../engine";
import { THEMES } from "./themes";
import { requestPuzzle } from "./client";
import { rotatePreview } from "./rules";
import {
  createSession,
  playMove,
  undoMove,
  retrySession,
  earnedStars,
} from "./session";
import {
  MAX_JOURNEY_SAVE_FILE_BYTES,
  loadJourneySave,
  writeJourneySave,
  parseJourneySave,
  recordJourneyResult,
  serializeJourneySave,
} from "./storage";
import { RECENT_PUZZLE_LIMIT, type JourneySession, type Move, type ThemeId } from "./types";
import { ChallengeMonitor, quickChallengeStatus, type ChallengeStatus } from "./challenge-client";
import { animateConveyor, conveyorSteps } from "./motion";

const esc = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const eq = (a: Point, b: Point) => a.r === b.r && a.c === b.c;
const coord = (p: Point) => `${p.r + 1}行${p.c + 1}列`;
const fruitName = (n: number) => FRUITS[n - 1]?.name ?? "水果";
const starText = (n: number) => "★".repeat(n) + "☆".repeat(3 - n);
const starIcons = (n: number) => Array.from({ length: 3 }, (_, i) => icon("star", i < n ? "lit" : "")).join("");
const saveFailure = "存储不可用，请导出";
const settingsFailure = "未能保存设置。下次打开时可能恢复原设置。";

function challengeText({ puzzle: { challenge }, state }: JourneySession) {
  switch (challenge.kind) {
    case "first-window":
      return challenge.fruits.length > 1
        ? "每种目标都在首次到达采收口时送达"
        : "目标首次到达采收口时送达";
    case "preserve":
      return `通关时至少保留 ${challenge.pairs} 对${fruitName(challenge.fruit)}`;
    case "no-outside":
      return "全程只在采收口配对目标水果";
    case "fuel":
      return `普通水果最多消除 ${challenge.limit} 对（已消除 ${state.fuelUsed} 对）`;
  }
}

function starRequirements(session: JourneySession) {
  return ["完成本盘目标", "通关且未使用解题提示", challengeText(session)];
}

const goalCompletion = {
  clear: "棋盘已清空",
  collect: "收集完成",
  deliver: "送达完成",
};

/** The trial owns its DOM and events; the classic app never starts on this URL. */
export function initJourneyView(app: HTMLElement) {
  document.body.classList.add("journey-trial");
  const loaded = loadJourneySave();
  let save = loaded.save;
  let preferences = loadSave().save.settings;
  let selected: Point | null = null;
  let preview = false;
  let previewOrigin: Point | null = null;
  let busy = false;
  let request: { controller: AbortController; themeId: ThemeId } | null = null;
  let themeToResume: ThemeId | undefined;
  let importRevision = 0;
  let message = "配对后，轨道沿箭头移动一格。";
  let storageOK = !loaded.warning;
  let settingsOK = true;
  let generation = "";
  let path: Point[] = [];
  let animationBoard: Board | null = null;
  let animation = 0;
  const challengeMonitor = new ChallengeMonitor();
  let challengeState: ChallengeStatus = { status: "unknown", reason: "" };
  let moving: ReturnType<typeof animateConveyor> | null = null;
  let idleTimer = 0;
  let idleInterval = 0;
  let pendingResult = false;
  let lastFocus: HTMLElement | null = null;
  let dialogOpen = false;
  let boardObserver: ResizeObserver | null = null;
  let session = () => save.session!;
  let theme = () => THEMES.find((t) => t.id === session().puzzle.themeId)!;
  const motionEnabled = () => preferences.motion && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  function refreshChallenge() {
    challengeMonitor.cancel();
    if (!save.session) return;
    challengeState = quickChallengeStatus(session().puzzle, session().state);
    challengeMonitor.check(session().puzzle, session().state, value => {
      challengeState = value;
      if (!busy) {
        const card = app.querySelector<HTMLElement>(".trial-card > .trial-stars-card");
        if (card) {
          const focusedAction = card.contains(document.activeElement)
            ? (document.activeElement as HTMLElement).dataset.trial
            : undefined;
          const oldChallenge = card.querySelector(".trial-challenge");
          if (oldChallenge) boardObserver?.unobserve(oldChallenge);
          card.outerHTML = starConditions(session());
          const replacement = app.querySelector<HTMLElement>(".trial-card > .trial-stars-card")!;
          bindActions(replacement);
          boardObserver?.observe(replacement.querySelector(".trial-challenge")!);
          fitBoard();
          if (focusedAction) {
            const target = replacement.querySelector<HTMLElement>(`[data-trial="${focusedAction}"]`)
              ?? app.querySelector<HTMLElement>(`.trial-tools [data-trial="${focusedAction}"]:not(:disabled)`);
            target?.focus({ preventScroll: true });
          }
        }
      }
    });
  }
  function cancelIdle() {
    clearTimeout(idleTimer);
    clearInterval(idleInterval);
    app.querySelector(".trial-board-shell")?.classList.remove("trial-idle-cue");
  }
  function scheduleIdle() {
    cancelIdle();
    if (!motionEnabled() || busy || selected || preview || dialogOpen || document.hidden || !save.session || session().state.phase !== "playing") return;
    const shell = app.querySelector<HTMLElement>(".trial-board-shell");
    const pulse = () => {
      if (!shell?.isConnected || !motionEnabled() || document.hidden) return;
      shell.classList.remove("trial-idle-cue");
      void shell.offsetWidth;
      shell.classList.add("trial-idle-cue");
    };
    idleTimer = window.setTimeout(() => { pulse(); idleInterval = window.setInterval(pulse, 3000); }, 1500);
  }
  function syncPreferences() {
    setSound(preferences.sound);
    setVolume(preferences.volume);
    document.documentElement.classList.toggle(
      "reduce-motion",
      !preferences.motion,
    );
    const slider = app.querySelector<HTMLInputElement>("#trial-volume");
    if (!slider) return;
    slider.value = String(Math.round(preferences.volume * 100));
    slider.disabled = !preferences.sound;
    app.querySelector("#trial-volume-value")!.textContent = `${slider.value}%`;
    for (const key of ["sound", "motion"] as const) {
      const button = app.querySelector<HTMLButtonElement>(`#trial-${key}`)!;
      button.textContent = preferences[key] ? "开启" : "关闭";
      button.setAttribute("aria-checked", String(preferences[key]));
    }
  }
  function persist() {
    if (loaded.warning && !save.session) return;
    storageOK = writeJourneySave(save);
    const label = app.querySelector("#trial-save");
    if (label)
      label.textContent = storageOK ? "已保存" : saveFailure;
  }
  function render() {
    cancelIdle();
    const scrollPositions = [".trial-card", ".trial-board-viewport"].map(
      (selector) => {
        const element = app.querySelector<HTMLElement>(selector);
        return {
          selector,
          top: element?.scrollTop ?? 0,
          left: element?.scrollLeft ?? 0,
        };
      },
    );
    const retainedDialog = dialogOpen
      ? app.querySelector("#trial-dialog-root")
      : null;
    const retainedFocus = dialogOpen
      ? (document.activeElement as HTMLElement)
      : null;
    const s = save.session;
    syncPreferences();
    const current = s && THEMES.find((t) => t.id === s.puzzle.themeId)!;
    app.innerHTML = `<main class="trial-page ${s && s.state.board.length >= 5 ? "trial-dense" : ""}"><header class="trial-header"><a href="?" class="trial-home" aria-label="返回果冻果园">‹ 果冻果园</a><span>新关卡试玩</span><button data-trial="settings" aria-label="音效与设置">设置</button></header><section class="trial-card" aria-label="流转送达试玩"><div class="trial-title"><button data-trial="themes" class="trial-theme-button">${s ? `${s.puzzle.themeId} · ${esc(current!.name)} ▾` : "选择主题 ▾"}</button><div class="trial-title-tools"><button class="trial-dense-settings" data-trial="settings" aria-label="音效与设置">设置</button><button data-trial="pause" ${!s ? "disabled" : ""}>暂停</button></div></div>${s ? body(s) : `<div class="trial-loading" role="status">${busy ? "正在生成棋盘…" : "选择主题开始试玩。"}</div>`}<div class="trial-bottom"><span id="trial-save">${storageOK ? (s ? "已保存" : "") : saveFailure}</span>${s ? `<span class="trial-seed" title="${esc(s.puzzle.id)}">种子 ${s.puzzle.seed}</span>` : ""}</div></section></main><div id="trial-dialog-root"></div><input id="trial-import" type="file" accept=".json,application/json" hidden>`;
    bindActions(app);
    if (retainedDialog) {
      app.querySelector("#trial-dialog-root")!.replaceWith(retainedDialog);
      app.querySelector<HTMLElement>(".trial-page")!.inert = true;
      retainedFocus?.focus({ preventScroll: true });
    }
    app.querySelector("#trial-import")!.addEventListener("change", importFile);
    app.querySelector("#trial-board")?.addEventListener("click", (e) => {
      const cell = (e.target as HTMLElement).closest<HTMLButtonElement>(
        "[data-trial-cell]",
      );
      if (cell)
        select({ r: Number(cell.dataset.r), c: Number(cell.dataset.c) });
    });
    app.querySelector("#trial-board")?.addEventListener("keydown", boardKey);
    boardObserver?.disconnect();
    const viewport = app.querySelector<HTMLElement>(".trial-board-viewport");
    if (viewport) {
      boardObserver = new ResizeObserver(fitBoard);
      boardObserver.observe(viewport);
      // Short screens already reserve board space, so text can grow without
      // resizing that viewport. Observe the labels used to detect text zoom.
      for (const selector of [".trial-challenge", ".trial-theme-button"])
        boardObserver.observe(app.querySelector(selector)!);
      fitBoard();
    }
    drawPath();
    scheduleIdle();
    const renderedPage = app.querySelector(".trial-page")!;
    requestAnimationFrame(() => {
      if (!renderedPage.isConnected) return;
      fitBoard();
      for (const { selector, top, left } of scrollPositions) {
        const element = app.querySelector<HTMLElement>(selector);
        if (element) {
          element.scrollTop = top;
          element.scrollLeft = left;
        }
      }
    });
  }
  function fitBoard() {
    const viewport = app.querySelector<HTMLElement>(".trial-board-viewport");
    const shell = app.querySelector<HTMLElement>(".trial-board-shell");
    if (!viewport || !shell || !save.session) return;
    app
      .querySelector(".trial-page")!
      .classList.toggle(
        "trial-large-text",
        parseFloat(getComputedStyle(document.documentElement).fontSize) > 20 ||
          parseFloat(
            getComputedStyle(app.querySelector(".trial-challenge")!).fontSize,
          ) > 20 ||
          parseFloat(
            getComputedStyle(app.querySelector(".trial-theme-button")!)
              .fontSize,
          ) > 26,
      );
    const rows = session().state.board.length,
      cols = session().state.board[0].length;
    const size = Math.max(
      44,
      Math.min(
        64,
        (viewport.clientWidth - 32 - (cols - 1) * 4) / cols,
        (viewport.clientHeight - 32 - (rows - 1) * 4) / rows,
      ),
    );
    shell.style.setProperty("--tile", `${Math.floor(size * 100) / 100}px`);
    drawPath();
  }
  function drawPath() {
    const svg = app.querySelector<SVGSVGElement>("#trial-path");
    const shell = app
      .querySelector(".trial-board-shell")
      ?.getBoundingClientRect();
    if (!svg || !shell || !path.length) return;
    svg.setAttribute("viewBox", `0 0 ${shell.width} ${shell.height}`);
    const board = session().state.board;
    const cellBox = (p: Point) =>
      app
        .querySelector(
          `[data-trial-cell="${Math.max(0, Math.min(board.length - 1, p.r))},${Math.max(0, Math.min(board[0].length - 1, p.c))}"]`,
        )!
        .getBoundingClientRect();
    svg.querySelector("polyline")!.setAttribute(
      "points",
      path
        .map((p) => {
          const cell = cellBox(p);
          return `${p.c < 0 ? 7 : p.c >= board[0].length ? shell.width - 7 : cell.left - shell.left + cell.width / 2},${p.r < 0 ? 7 : p.r >= board.length ? shell.height - 7 : cell.top - shell.top + cell.height / 2}`;
        })
        .join(" "),
    );
    svg.querySelector("polyline")!.setAttribute("style", "stroke-width:4px");
  }
  function starConditions(s: JourneySession, result = false) {
    const won = s.state.phase === "won";
    const first = won ? "achieved" : s.state.phase === "lost" ? "failed" : "pending";
    const second = s.hintLevel > 0 ? "failed" : won ? "achieved" : "pending";
    const third = challengeState.status === "achieved" ? "achieved" : challengeState.status === "failed" ? "failed" : "pending";
    const requirements = starRequirements(s);
    const rows = [
      { status: first, condition: requirements[0], reason: s.state.phase === "lost" ? "可以撤销一步再试。" : "" },
      { status: second, condition: requirements[1], reason: s.hintLevel > 0 ? "已使用解题提示，重试也会保留记录。" : "" },
      { status: third, condition: requirements[2], reason: challengeState.reason },
    ];
    return `<div class="trial-stars-card${result ? " trial-result-reasons" : ""}" aria-label="本盘三颗星条件">${rows.map((row, index) => `<div class="trial-star-row" data-star="${index + 1}" data-status="${row.status}"><span class="trial-condition-icon ${row.status}" aria-hidden="true">${icon("star", row.status === "achieved" ? "lit" : "")}${row.status === "failed" ? '<i></i>' : ""}</span><div><span class="trial-star-condition ${index === 2 ? "trial-challenge" : ""}">${esc(row.condition)}</span><span class="trial-star-reason"${index === 0 && first === "failed" ? " hidden" : ""}>${row.status === "achieved" ? "已获得" : row.status === "failed" ? `本盘未达成${row.reason ? ` · ${esc(row.reason)}` : ""}` : esc(row.reason)}</span></div>${index === 2 && row.status === "failed" && s.history.length && !result ? `<button data-trial="undo" class="trial-challenge-undo" ${busy ? "disabled" : ""}>撤销一步</button>` : ""}</div>`).join("")}</div>`;
  }
  function resultDialog() {
    const s = session();
    if (s.state.phase !== "won") return;
    const finalTheme = s.puzzle.themeId === THEMES.at(-1)!.id;
    const allCompleted = THEMES.every(({ id }) => (save.best[id] ?? 0) > 0);
    pendingResult = false;
    modal(allCompleted ? "六主题体验完成" : goalCompletion[s.puzzle.stages[s.state.stageIndex].goal.kind], `<div class="result-fruits">${fruitSVG(3)}${fruitSVG(1)}${fruitSVG(2)}</div><div class="result-stars">${[true, s.hintLevel === 0, challengeState.status === "achieved"].map(earned => icon("star", earned ? "lit" : "")).join("")}</div>${starConditions(s, true)}<button id="trial-result-next" class="primary-button">${finalTheme ? "选择主题" : `进入下一主题 · ${THEMES.find(t => t.id === s.puzzle.themeId + 1)!.name}`} ${icon("arrow")}</button><button id="trial-result-stay" class="secondary-button">留在本盘</button><button id="trial-result-retry" class="secondary-button">${finalTheme ? "再玩一盘" : "重试本盘"}</button>`);
    app.querySelector("#trial-result-next")!.addEventListener("click", () => {
      closeModal();
      if (finalTheme) themes();
      else void start((s.puzzle.themeId + 1) as ThemeId);
    });
    app.querySelector("#trial-result-stay")!.addEventListener("click", closeModal);
    app.querySelector("#trial-result-retry")!.addEventListener("click", () => { closeModal(); action(finalTheme ? "new" : "retry"); });
  }
  function body(s: JourneySession) {
    const { puzzle: p, state: st } = s;
    const stage = p.stages[st.stageIndex];
    const quotas = stage.goal.kind === "clear" ? {} : stage.goal.quotas;
    const goals = Object.entries(quotas)
      .map(
        ([n, q]) =>
          `<span>${fruitSVG(Number(n))}<strong>${fruitName(Number(n))} ${st.progress[st.stageIndex]?.[Number(n)] ?? 0}/${q} 对</strong></span>`,
      )
      .join("");
    const won = st.phase === "won";
    const displayedStars = won ? earnedStars(s) : (save.best[p.themeId] ?? 0);
    return `<div class="trial-objective" aria-label="本阶段目标"><div><small>${stage.goal.kind === "deliver" ? "送达目标" : "配对目标"}</small><div class="trial-goal-fruits">${goals || "清空棋盘"}</div></div><button data-trial="challenge" class="trial-star" aria-label="查看三星条件" title="${won ? "本盘收获" : "本主题最佳收获"} · ${displayedStars} 星"><span aria-hidden="true">${won ? "本盘" : "最佳"}</span><span class="trial-star-icons" aria-hidden="true">${starIcons(displayedStars)}</span></button></div>${starConditions(s)}<div class="trial-stats"><span>步数 <b>${stage.budget === undefined ? st.moves : `${st.stageMoves} / ${stage.budget}`}</b></span><span>连消 <b>${st.combo}</b></span><span>得分 <b>${st.score}</b></span><span class="trial-juice" aria-label="果汁蓄能 ${st.juice}%">果汁 ${st.juice}%<i style="width:${st.juice}%"></i></span></div><div class="trial-board-viewport" style="--rows:${st.board.length}"><div class="trial-board-shell" style="--cols:${st.board[0].length}"><div id="trial-board" class="trial-board ${preview ? "trial-preview" : ""}" role="group" aria-label="${preview ? "下一拍位置预览" : "水果棋盘"}">${boardHTML(s)}</div><svg class="trial-path" id="trial-path" aria-hidden="true" viewBox="-0.35 -0.35 ${st.board[0].length + 0.7} ${st.board.length + 0.7}" preserveAspectRatio="none">${path.length ? `<polyline points="${path.map((v) => `${Math.max(-0.2, Math.min(st.board[0].length + 0.2, v.c + 0.5))},${Math.max(-0.2, Math.min(st.board.length + 0.2, v.r + 0.5))}`).join(" ")}"/>` : ""}</svg></div></div><div class="trial-legend"><span>▣ 采收口</span><span>箭头表示移动方向</span></div><div class="trial-feedback ${st.phase !== "playing" ? "trial-ended" : ""}" role="status">${won ? `${goalCompletion[stage.goal.kind]}！${starText(earnedStars(s))} · 可撤销最后一步` : st.phase === "lost" ? `${esc(st.failure ?? "本盘已结束，可以撤销。")}` : preview ? "预览轨道移动一格后的位置。实战先消除，再移动。" : esc(message)}</div><div class="trial-actions"><div class="trial-tools"><button data-trial="undo" ${busy || !s.history.length ? "disabled" : ""}>↶ 撤销</button><button data-trial="preview" title="预览轨道移动" aria-label="${preview ? "返回棋盘" : "下一拍"}" aria-pressed="${preview}" ${busy ? "disabled" : ""}>${preview ? "返回" : "下一拍"}</button><button data-trial="hint" aria-label="解题提示" ${busy ? "disabled" : ""}>提示</button></div><div class="trial-secondary"><button data-trial="retry" aria-label="重试本盘" ${busy ? "disabled" : ""}>重试</button><button data-trial="new" ${busy ? "disabled" : ""}>${busy ? "准备中…" : "换一盘"}</button><button data-trial="rules" aria-label="玩法说明">玩法</button></div></div>${won ? `<button data-trial="result" class="primary-button trial-result-entry">查看收获 ${icon("arrow")}</button>` : ""}`;
  }
  function boardHTML(s: JourneySession) {
    const p = s.puzzle,
      st = s.state,
      stage = p.stages[st.stageIndex];
    const board = animationBoard ?? (preview ? rotatePreview(p, st) : st.board);
    return board
      .map((row, r) =>
        row
          .map((value, c) => {
            const point = { r, c },
              port = stage.ports.some((v) => eq(v, point));
            let arrow = "",
              trackIndex = -1;
            if (stage.movement.kind === "conveyor")
              stage.movement.tracks.forEach((track, ti) => {
                const index = track.cells.findIndex((v) => eq(v, point));
                if (index < 0) return;
                trackIndex = ti;
                const next =
                  track.cells[
                    (index + track.direction + track.cells.length) %
                      track.cells.length
                  ];
                arrow =
                  next.r < r ? "↑" : next.r > r ? "↓" : next.c < c ? "←" : "→";
              });
            return `<button class="trial-cell ${port ? "trial-port" : ""} ${value === -1 ? "trial-stone" : ""} ${!preview && selected && eq(selected, point) ? "selected" : ""} ${trackIndex >= 0 ? `on-track track-${trackIndex}` : ""}" data-trial-cell="${r},${c}" data-r="${r}" data-c="${c}" data-fruit="${value}" style="--cue-x:${arrow === "→" ? 2 : arrow === "←" ? -2 : 0}px;--cue-y:${arrow === "↓" ? 2 : arrow === "↑" ? -2 : 0}px" aria-label="${value > 0 ? fruitName(value) : value < 0 ? "石头" : "空格"}，第 ${r + 1} 行第 ${c + 1} 列${port ? "，采收口" : ""}${arrow ? `，轨道${trackIndex + 1}${arrow}` : ""}" aria-pressed="${!preview && !!selected && eq(selected, point)}" ${value <= 0 || preview || busy || st.phase !== "playing" ? "disabled" : ""}>${value > 0 ? fruitSVG(value) : value < 0 ? "◆" : ""}${arrow ? `<svg class="trial-arrow" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path transform="rotate(${{ "→": 0, "↓": 90, "←": 180, "↑": 270 }[arrow]} 6 6)" d="M2 6h8m-3-3 3 3-3 3"/></svg>` : ""}${port ? '<svg class="trial-port-mark" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><rect x="2" y="2" width="8" height="8" rx=".5"/><rect x="4.5" y="4.5" width="3" height="3" fill="currentColor" stroke="none"/></svg>' : ""}</button>`;
          })
          .join(""),
      )
      .join("");
  }
  function bindActions(root: ParentNode) {
    root
      .querySelectorAll<HTMLButtonElement>("[data-trial]")
      .forEach((b) =>
        b.addEventListener("click", () => action(b.dataset.trial!)),
      );
  }
  async function select(point: Point) {
    if (busy || preview || dialogOpen || session().state.phase !== "playing")
      return;
    initAudio();
    if (!selected) {
      selected = point;
      sound("tap");
      render();
      focusCell(point);
      return;
    }
    if (eq(point, selected)) {
      selected = null;
      render();
      focusCell(point);
      return;
    }
    const previous = selected;
    const before = structuredClone(session().state.board);
    const stageBefore = session().puzzle.stages[session().state.stageIndex];
    const movementBefore = stageBefore.movement;
    const result = playMove(session(), { a: previous, b: point });
    if (!result.ok) {
      selected =
        session().state.board[previous.r][previous.c] !==
        session().state.board[point.r][point.c]
          ? point
          : null;
      message = result.reason;
      sound("error");
      render();
      focusCell(point);
      return;
    }
    selected = null;
    path = result.path;
    animationBoard = before;
    busy = true;
    const token = ++animation;
    sound("match", { combo: session().state.combo });
    if (result.delivered === null) {
      message = movementBefore.kind === "conveyor" ? "配对成功，轨道移动一格。" : "配对成功。";
    } else {
      const action = stageBefore.goal.kind === "deliver" ? "送达" : "收集";
      message = `已${action} 1 对${fruitName(result.delivered)}。`;
    }
    if (result.bloomed) {
      message += "果汁已蓄满。";
      sound("fever");
    }
    recordJourneyResult(save, session());
    persist();
    refreshChallenge();
    pendingResult = session().state.phase === "won";
    render();
    const finish = () => {
        if (token !== animation) return;
        path = [];
        animationBoard = null;
        moving = null;
        busy = false;
        render();
        if (pendingResult && !dialogOpen && !document.hidden) resultDialog();
        if (!dialogOpen) focusCell(point);
    };
    if (motionEnabled()) {
      moving = animateConveyor(app.querySelector<HTMLElement>(".trial-board-shell")!, conveyorSteps(before, { a: previous, b: point }, movementBefore), { a: previous, b: point });
      void moving.finished.then(finish);
    } else finish();
  }
  function focusCell(point: Point) {
    const target =
      app.querySelector<HTMLButtonElement>(
        `[data-trial-cell="${point.r},${point.c}"]:not(:disabled)`,
      ) ??
      app.querySelector<HTMLButtonElement>(
        "[data-trial-cell]:not(:disabled)",
      ) ??
      app.querySelector<HTMLButtonElement>(
        '[data-trial="undo"]:not(:disabled)',
      ) ??
      app.querySelector<HTMLButtonElement>('[data-trial="new"]');
    target?.focus({ preventScroll: true });
  }
  function boardKey(event: Event) {
    const e = event as KeyboardEvent;
    const target = (e.target as HTMLElement).closest<HTMLButtonElement>(
      "[data-trial-cell]",
    );
    if (!target) return;
    const directions: Record<string, Point> = {
      ArrowUp: { r: -1, c: 0 },
      ArrowDown: { r: 1, c: 0 },
      ArrowLeft: { r: 0, c: -1 },
      ArrowRight: { r: 0, c: 1 },
    };
    const d = directions[e.key];
    if (!d) return;
    e.preventDefault();
    let r = Number(target.dataset.r) + d.r,
      c = Number(target.dataset.c) + d.c;
    const board = session().state.board;
    while (r >= 0 && r < board.length && c >= 0 && c < board[0].length) {
      const next = app.querySelector<HTMLButtonElement>(
        `[data-trial-cell="${r},${c}"]:not(:disabled)`,
      );
      if (next) {
        next.focus();
        return;
      }
      r += d.r;
      c += d.c;
    }
  }
  function action(name: string) {
    if (name === "settings") return settings();
    if (name === "themes") return themes();
    if (name === "rules") return rules();
    if (!save.session || busy) return;
    if (name === "result") return resultDialog();
    if (name === "pause") {
      stopAudio();
      persist();
      return modal(
        "已暂停",
        `<p>${storageOK ? "进度已保存。" : "未能保存进度，请在设置中导出。"}</p><button data-close class="trial-primary">继续这一局</button>`,
      );
    }
    if (name === "challenge") return challenge();
    if (name === "hint") return hints();
    if (name === "undo") {
      if (undoMove(session())) {
        selected = null;
        preview = false;
        message = "已撤销一步。";
        pendingResult = false;
        refreshChallenge();
        persist();
        render();
        app.querySelector<HTMLButtonElement>('[data-trial="undo"]')?.focus();
      }
    }
    if (name === "preview") {
      if (!preview) {
        const cell = document.activeElement?.getAttribute("data-trial-cell");
        previewOrigin = null;
        if (cell) {
          const [r, c] = cell.split(",").map(Number);
          previewOrigin = { r, c };
        }
      }
      preview = !preview;
      render();
      if (!preview && previewOrigin) {
        focusCell(previewOrigin);
        previewOrigin = null;
      } else {
        app.querySelector<HTMLButtonElement>('[data-trial="preview"]')?.focus();
      }
    }
    if (name === "retry") {
      modal(
        "重试本盘？",
        '<p>回到开局，保留已用提示记录。</p><button id="trial-confirm-retry" class="trial-primary">确认重试</button>',
      );
      app
        .querySelector("#trial-confirm-retry")!
        .addEventListener("click", () => {
          pendingResult = false;
          closeModal();
          save.session = retrySession(session());
          selected = null;
          preview = false;
          message = "已回到开局。";
          pendingResult = false;
          refreshChallenge();
          persist();
          render();
        });
    }
    if (name === "new") {
      modal(
        "换一盘？",
        '<p>生成同主题的新棋盘，并保留最高星数。</p><button id="trial-confirm-new" class="trial-primary">确认换一盘</button>',
      );
      app.querySelector("#trial-confirm-new")!.addEventListener("click", () => {
        closeModal();
        void start(session().puzzle.themeId);
      });
    }
  }
  async function start(id: ThemeId) {
    moving?.cancel();
    challengeMonitor.cancel();
    pendingResult = false;
    request?.controller.abort();
    const controller = new AbortController();
    request = { controller, themeId: id };
    busy = true;
    selected = null;
    preview = false;
    path = [];
    animationBoard = null;
    animation++;
    message = "正在生成棋盘…";
    render();
    try {
      const result = await requestPuzzle(id, save.recent, controller.signal);
      if (controller.signal.aborted) return;
      save.session = createSession(
        result.puzzle,
        save.hinted.includes(result.puzzle.id) ? 1 : 0,
      );
      save.recent = [
        result.puzzle.id,
        ...save.recent.filter((x) => x !== result.puzzle.id),
      ].slice(0, RECENT_PUZZLE_LIMIT);
      const source = result.source === "generated" ? "实时生成" : "备用棋盘";
      generation = `${source} · ${Math.round(result.elapsedMs)} ms`;
      message = THEMES.find((t) => t.id === id)!.lesson;
      busy = false;
      refreshChallenge();
      persist();
      render();
    } catch (error) {
      if (controller.signal.aborted) return;
      busy = false;
      message = error instanceof Error ? error.message : "请重试。";
      render();
      modal(
        "棋盘生成失败",
        `<p>${esc(message)}</p><button id="trial-generate-again" class="trial-primary">重新生成</button>`,
      );
      app
        .querySelector("#trial-generate-again")!
        .addEventListener("click", () => {
          closeModal();
          void start(id);
        });
    } finally {
      if (request?.controller === controller) request = null;
    }
  }
  function modal(title: string, content: string) {
    importRevision++;
    cancelIdle();
    if (!dialogOpen) lastFocus = document.activeElement as HTMLElement;
    dialogOpen = true;
    app.querySelector<HTMLElement>(".trial-page")!.inert = true;
    app.querySelector("#trial-dialog-root")!.innerHTML =
      `<div class="trial-backdrop"><section class="trial-dialog" role="dialog" aria-modal="true" aria-labelledby="trial-dialog-title"><div class="trial-dialog-heading"><h2 id="trial-dialog-title">${esc(title)}</h2><button data-close aria-label="关闭弹窗">×</button></div>${content}</section></div>`;
    app
      .querySelectorAll("[data-close]")
      .forEach((b) => b.addEventListener("click", closeModal));
    app.querySelector<HTMLElement>(".trial-dialog button")?.focus();
  }
  function closeModal() {
    importRevision++;
    app.querySelector("#trial-dialog-root")!.innerHTML = "";
    app.querySelector<HTMLElement>(".trial-page")!.inert = false;
    dialogOpen = false;
    lastFocus?.focus({ preventScroll: true });
    if (!lastFocus?.isConnected) app.querySelector<HTMLElement>('[data-trial="result"], [data-trial="pause"]')?.focus({ preventScroll: true });
    scheduleIdle();
    if (pendingResult && !busy && !document.hidden) resultDialog();
  }
  function themes() {
    modal(
      "选择主题",
      `<div class="trial-theme-list">${THEMES.map((t) => `<button data-pick-theme="${t.id}"><b>${t.id} · ${esc(t.name)} <em class="trial-star-summary" aria-label="最佳 ${save.best[t.id] ?? 0} 星">${starIcons(save.best[t.id] ?? 0)}</em></b><span>${esc(t.lesson)}</span></button>`).join("")}</div><p class="trial-fine">选择主题会替换当前棋盘，各主题的最高星数保留。</p>`,
    );
    app.querySelectorAll<HTMLButtonElement>("[data-pick-theme]").forEach((b) =>
      b.addEventListener("click", () => {
        pendingResult = false;
        closeModal();
        void start(Number(b.dataset.pickTheme) as ThemeId);
      }),
    );
  }
  function rules() {
    modal(
      "流转送达玩法",
      `<ol class="trial-rules"><li>点选两颗相同水果。连线最多转两次弯，可经过空格和棋盘外沿。</li><li>每次消除后，所有轨道沿箭头移动一格，空格也会移动。「下一拍」预览这次移动。</li><li>消除一对目标水果时，至少一颗已经在采收口（▣）才计为送达。</li><li>可在采收口外消除多余的目标水果。若剩余数量不足以完成任务，系统会拒绝这次操作。</li><li>没有可消除的配对或本阶段步数用尽时，可以撤销。撤销也会还原连消、分数和果汁。</li></ol><p>方向键移动焦点，Enter 点选，Z 撤销，H 提示，P 预览，空格或 Esc 暂停。</p>`,
    );
  }
  function challenge() {
    const s = session();
    modal(
      "三星条件",
      `<ul class="trial-star-rules">${starRequirements(s).map(requirement => `<li>${esc(requirement)}</li>`).join("")}</ul>${s.puzzle.challenge.kind === "fuel" ? "<p>普通水果的对数只统计非目标水果。</p>" : ""}<p>每个主题记录单盘最高星数。查看规则和预览不会扣星。</p><details class="trial-diagnostics"><summary>复现信息</summary><p class="trial-fine">种子 ${s.puzzle.seed} · 规则 v${s.puzzle.version} · 生成器 v${s.puzzle.generatorVersion}<br>${esc(s.puzzle.id)}${generation ? `<br>${esc(generation)}` : ""}</p></details>`,
    );
  }
  function hints() {
    const s = session(),
      level = s.hintLevel;
    modal(
      "解题提示",
      `<p>${level === 0 ? "查看解题提示会失去“不用提示”星。撤销或重试都会保留这条记录。" : "本盘已用提示，无法获得“不用提示”星。"}</p>${level >= 1 ? `<div class="trial-hint"><b>1 · 主题思路</b><p>${esc(theme().hint)}</p></div>` : ""}${
        level >= 2
          ? `<div class="trial-hint"><b>2 · 本盘关键关系</b><p>${esc(theme().lesson)}</p><p>以下坐标用于复盘。请从初盘开始推演，坐标以各步操作前的棋盘为准。</p>${s.puzzle.proof.critical
              .slice(0, 2)
              .map(
                (c) =>
                  `<div class="trial-hint-choices"><p>${c.prefix.length ? `从初盘依次配对 ${c.prefix.map((m) => `${coord(m.a)} ↔ ${coord(m.b)}`).join("、")}。以下两种选项都以推演后的棋盘为准。` : "以下两种选项都以初盘为准。"}</p><p><b>选项 A：</b>${coord(c.good.a)} ↔ ${coord(c.good.b)}。这样做仍有机会完成本盘挑战。</p><p><b>选项 B：</b>${coord(c.bad.a)} ↔ ${coord(c.bad.b)}。${esc(c.consequence)}</p></div>`,
              )
              .join("")}</div>`
          : ""
      }${level >= 3 ? `<div class="trial-hint"><b>3 · 完整解法</b><p>从开局按顺序配对可完成挑战。每一步都从当前棋盘左上角数行列。</p><ol>${s.puzzle.proof.challenge.map((m: Move) => `<li>${coord(m.a)} ↔ ${coord(m.b)}</li>`).join("")}</ol></div>` : `<button id="trial-reveal-hint" class="trial-primary">${level === 0 ? "使用提示 · 展开主题思路" : level === 1 ? "展开本盘关键关系" : "展开本盘完整解法"}</button>`}`,
    );
    app.querySelector("#trial-reveal-hint")?.addEventListener("click", () => {
      s.hintLevel++;
      persist();
      render();
      hints();
    });
  }
  function settings() {
    const volume = Math.round(preferences.volume * 100);
    modal(
      "音效与设置",
      `<div class="trial-setting"><span id="trial-sound-label">音效</span><button id="trial-sound" role="switch" aria-labelledby="trial-sound-label" aria-checked="${preferences.sound}">${preferences.sound ? "开启" : "关闭"}</button></div>
      <div class="trial-setting"><label for="trial-volume">音量</label><div class="trial-volume"><input id="trial-volume" type="range" min="0" max="100" value="${volume}" ${preferences.sound ? "" : "disabled"}><output id="trial-volume-value" for="trial-volume">${volume}%</output></div></div>
      <div class="trial-setting"><span id="trial-motion-label">动效</span><button id="trial-motion" role="switch" aria-labelledby="trial-motion-label" aria-checked="${preferences.motion}">${preferences.motion ? "开启" : "关闭"}</button></div>
      <p id="trial-settings-status" class="trial-fine" aria-live="polite">${settingsOK ? "" : settingsFailure}</p>
      <p class="trial-fine">经典模式与试玩共用音效和动效设置。两边的存档分别导入和导出。</p><div class="trial-backups"><button id="trial-export">导出试玩进度</button><button id="trial-import-button">导入试玩进度</button></div>${offlineDownloadNote}<a class="trial-return" href="?">返回经典模式 →</a>`,
    );
    for (const key of ["sound", "motion"] as const)
      app.querySelector(`#trial-${key}`)!.addEventListener("click", () => {
        preferences[key] = !preferences[key];
        syncPreferences();
        if (!motionEnabled()) moving?.cancel();
        settingsOK = writeSettings({ [key]: preferences[key] });
        app.querySelector("#trial-settings-status")!.textContent = settingsOK ? "" : settingsFailure;
      });
    const slider = app.querySelector<HTMLInputElement>("#trial-volume")!;
    slider.addEventListener("input", () => {
      preferences.volume = slider.valueAsNumber / 100;
      setVolume(preferences.volume);
      app.querySelector("#trial-volume-value")!.textContent = `${slider.value}%`;
    });
    slider.addEventListener("change", () => {
      settingsOK = writeSettings({ volume: preferences.volume });
      app.querySelector("#trial-settings-status")!.textContent = settingsOK ? "" : settingsFailure;
    });
    app.querySelector("#trial-export")!.addEventListener("click", () => {
      try {
        persist();
        // A localStorage quota failure must not prevent downloading valid progress.
        const url = URL.createObjectURL(
          new Blob([serializeJourneySave(save)], { type: "application/json" }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = "果冻果园-新关卡试玩.json";
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (error) {
        modal(
          "无法导出这份进度",
          `<p>${esc(error instanceof Error ? error.message : "无法生成存档文件。")}</p>`,
        );
      }
    });
    app
      .querySelector("#trial-import-button")!
      .addEventListener("click", () =>
        app.querySelector<HTMLInputElement>("#trial-import")!.click(),
      );
  }
  async function importFile(e: Event) {
    const input = e.target as HTMLInputElement,
      file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const revision = ++importRevision;
    try {
      const text = await readSaveFile(file, MAX_JOURNEY_SAVE_FILE_BYTES);
      if (revision !== importRevision) return;
      const imported = parseJourneySave(text);
      modal(
        "导入试玩进度？",
        `<p>导入将替换本机的试玩棋盘和试玩星数。</p><button id="trial-confirm-import" class="trial-primary">确认导入</button>`,
      );
      app
        .querySelector("#trial-confirm-import")!
        .addEventListener("click", () => {
          request?.controller.abort();
          moving?.cancel();
          challengeMonitor.cancel();
          animation++;
          pendingResult = false;
          closeModal();
          save = imported;
          selected = null;
          preview = false;
          busy = false;
          path = [];
          animationBoard = null;
          message = "已导入试玩进度。";
          generation = "";
          refreshChallenge();
          persist();
          render();
          if (!save.session) void start(13);
        });
    } catch (error) {
      if (revision !== importRevision) return;
      modal(
        "无法导入这份进度",
        `<p>${esc(error instanceof Error ? error.message : "无法读取存档。")}</p><p>请在流转送达重新导出进度后再试。</p><button id="trial-import-error-settings" class="trial-primary">返回设置</button>`,
      );
      app.querySelector("#trial-import-error-settings")!.addEventListener("click", settings);
    }
  }
  document.addEventListener("keydown", (e) => {
    if (dialogOpen) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeModal();
      }
      if (e.key === "Tab") {
        const focusable = Array.from(
          app.querySelectorAll<HTMLElement>(
            ".trial-dialog button:not(:disabled),.trial-dialog input:not(:disabled),.trial-dialog a",
          ),
        );
        const first = focusable[0],
          last = focusable.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
      return;
    }
    if (
      e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(
        (e.target as HTMLElement).tagName,
      )
    )
      return;
    const key = e.key.toLowerCase();
    if (["z", "h", "p"].includes(key)) {
      e.preventDefault();
      action(key === "z" ? "undo" : key === "h" ? "hint" : "preview");
    }
    if (
      e.key === "Escape" ||
      (e.code === "Space" &&
        ((e.target as HTMLElement).hasAttribute("data-trial-cell") ||
          e.target === document.body))
    ) {
      e.preventDefault();
      action("pause");
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelIdle();
      moving?.cancel();
      stopAudio();
      if (!dialogOpen && save.session && !busy) action("pause");
      else persist();
    } else scheduleIdle();
  });
  window.addEventListener("pagehide", () => {
    importRevision++;
    cancelIdle();
    moving?.cancel();
    challengeMonitor.cancel();
    stopAudio();
    persist();
    themeToResume = request?.themeId;
    request?.controller.abort();
  });
  watchSaveSettings((settings) => {
    const motionChanged = settings.motion !== preferences.motion;
    preferences = settings;
    syncPreferences();
    if (motionChanged) {
      if (!motionEnabled()) moving?.cancel();
      scheduleIdle();
    }
  });
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    // A cached document resumes with its terminated workers still gone.
    if (themeToResume !== undefined) {
      const id = themeToResume;
      themeToResume = undefined;
      void start(id);
      return;
    }
    refreshChallenge();
    scheduleIdle();
    if (pendingResult && !busy && !dialogOpen && !document.hidden) resultDialog();
  });
  window.addEventListener("resize", () => { moving?.cancel(); drawPath(); });
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", () => { if (!motionEnabled()) moving?.cancel(); scheduleIdle(); });
  refreshChallenge();
  render();
  if (loaded.warning) {
    const canExportOriginal = loaded.rawBackup !== undefined;
    modal(
      "发现需要处理的试玩存档",
      `<p>${esc(loaded.warning)}</p>${canExportOriginal ? `<p>开始新试玩会替换原存档。可以先导出原文件。</p><button id="trial-export-damaged" class="trial-primary">导出原存档</button>` : `<p>暂时无法导出原文件。开始新试玩后，浏览器恢复写入时可能覆盖原进度。</p>`}<p id="trial-recovery-error" role="alert"></p><button id="trial-reset-damaged" class="trial-primary">开始新的试玩</button>`,
    );
    app
      .querySelector("#trial-export-damaged")
      ?.addEventListener("click", () => {
        let url: string | undefined;
        const feedback = app.querySelector("#trial-recovery-error")!;
        try {
          url = URL.createObjectURL(
            new Blob([loaded.rawBackup!], { type: "application/json" }),
          );
          const a = document.createElement("a");
          a.href = url;
          a.download = "果冻果园-待修复试玩存档.json";
          a.click();
          feedback.textContent =
            "已发起原存档下载。请确认文件已保存，再开始新的试玩。";
        } catch (error) {
          feedback.textContent = `无法导出原存档：${error instanceof Error ? error.message : "下载暂不可用。"} 原始内容仍保留，可以重试。`;
        } finally {
          if (url) {
            const downloadURL = url;
            setTimeout(() => URL.revokeObjectURL(downloadURL), 1000);
          }
        }
      });
    app.querySelector("#trial-reset-damaged")!.addEventListener("click", () => {
      closeModal();
      void start(13);
    });
  } else if (!save.session) void start(13);
  else action("pause");
}
