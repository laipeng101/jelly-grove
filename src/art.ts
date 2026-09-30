export const FRUITS = [
  {
    name: "草莓",
    color: "#ed8992",
    light: "#ffc9c9",
    dark: "#dc5976",
    shape: "M17 29C17 18 47 18 47 29C47 43 37 55 32 55S17 43 17 29Z",
    leaf: "M32 24Q16 22 19 14Q29 12 32 24M32 24Q32 8 42 11Q47 19 32 24",
  },
  {
    name: "蜜橘",
    color: "#f1b570",
    light: "#ffdf9d",
    dark: "#e89349",
    shape: "M13 36C13 14 50 14 51 35C52 59 11 59 13 36Z",
    leaf: "M32 21Q31 9 45 12Q46 21 32 21",
  },
  {
    name: "青柠",
    color: "#a3c784",
    light: "#e2edac",
    dark: "#73ac6c",
    shape: "M13 39Q10 27 26 19Q40 12 51 26Q59 41 42 49Q22 57 13 39Z",
    leaf: "M42 20Q46 7 56 13Q55 23 42 20",
  },
  {
    name: "蓝莓",
    color: "#9aaee8",
    light: "#d5dffa",
    dark: "#7c8cd3",
    shape: "M13 37C11 13 51 13 51 37C51 59 13 59 13 37Z",
    leaf: "M25 19L27 12L33 16L40 12L39 21L32 24Z",
  },
  {
    name: "蜜桃",
    color: "#f4aea5",
    light: "#ffdad0",
    dark: "#e78e91",
    shape: "M32 25C14 10 6 36 20 49Q33 61 45 48C58 33 50 11 32 25Z",
    leaf: "M32 24Q23 8 35 9Q43 11 32 24",
  },
  {
    name: "葡萄",
    color: "#b99cdb",
    light: "#e3c8f5",
    dark: "#a180c7",
    shape:
      "M20 22Q30 14 35 22Q47 17 49 31Q53 41 42 45Q39 58 29 54Q19 55 18 44Q5 39 14 29Q13 24 20 22Z",
    leaf: "M32 21Q27 5 41 10Q48 16 32 21",
  },
  {
    name: "西瓜",
    color: "#8fc9a1",
    light: "#c4ebc6",
    dark: "#62ae84",
    shape: "M9 25Q32 17 55 25Q55 55 32 56Q9 55 9 25Z",
    leaf: "",
  },
  {
    name: "香梨",
    color: "#c7cb78",
    light: "#f1e8a9",
    dark: "#a9b15d",
    shape: "M24 20Q32 14 39 22Q40 29 48 37C61 59 6 62 15 39Q23 30 24 20Z",
    leaf: "M31 20Q32 5 46 11Q46 19 31 20",
  },
  {
    name: "樱桃",
    color: "#df889d",
    light: "#ffc4d3",
    dark: "#c96785",
    shape:
      "M31 32C20 17 4 33 12 46C19 57 31 51 33 43C38 56 56 48 53 36C51 22 36 21 31 32Z",
    leaf: "M25 30Q37 20 37 10Q43 22 42 29M37 11Q46 4 54 13Q47 23 37 11",
  },
  {
    name: "芒果",
    color: "#e6c96b",
    light: "#fff0b7",
    dark: "#d7a74d",
    shape: "M40 17C58 21 54 44 35 53C13 64 8 44 18 32Q30 14 40 17Z",
    leaf: "M37 19Q35 7 49 10Q50 18 37 19",
  },
];
let id = 0;
export function fruitSVG(type: number, extra = ""): string {
  const f = FRUITS[type - 1] || FRUITS[0],
    uid = `f${id++}`;
  const details =
    type === 1
      ? '<g fill="#ffe8bf" opacity=".8"><ellipse cx="24" cy="29" rx="1.2" ry="1.8"/><ellipse cx="39" cy="28" rx="1.2" ry="1.8"/><ellipse cx="24" cy="42" rx="1.2" ry="1.8"/><ellipse cx="40" cy="40" rx="1.2" ry="1.8"/><ellipse cx="32" cy="49" rx="1.2" ry="1.8"/></g>'
      : type === 7
        ? '<path d="M13 26Q32 21 51 26Q49 49 32 51Q15 49 13 26" fill="#f4a2a4"/><path d="M17 27Q32 24 47 27" fill="none" stroke="#ffdbcb" stroke-width="3"/><g fill="#926b72"><ellipse cx="20" cy="31" rx="1" ry="1.8"/><ellipse cx="44" cy="32" rx="1" ry="1.8"/><ellipse cx="32" cy="46" rx="1" ry="1.8"/></g>'
        : type === 5
          ? '<path d="M33 26Q37 32 34 37" fill="none" stroke="#ec9297" stroke-width="1.5" opacity=".65"/>'
          : type === 6
            ? '<g fill="none" stroke="#eee0fa" opacity=".35" stroke-width="1.4"><path d="M21 27q6 0 7 5M36 28q7 0 6 6M25 44q4 2 8-1"/></g>'
            : "";
  return `<svg class="fruit-svg ${extra}" viewBox="0 0 64 64" aria-hidden="true"><defs><radialGradient id="${uid}" cx="30%" cy="22%" r="82%"><stop stop-color="${f.light}"/><stop offset=".65" stop-color="${f.color}"/><stop offset="1" stop-color="${f.dark}"/></radialGradient><linearGradient id="${uid}h" x2=".3" y2="1"><stop stop-color="white" stop-opacity=".88"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient></defs><ellipse cx="32" cy="55" rx="17" ry="3" fill="${f.dark}" opacity=".12"/><path d="${f.shape}" fill="url(#${uid})" stroke="${f.dark}" stroke-opacity=".25" stroke-width=".8"/>${details}<path d="M21 29Q23 24 28 25" fill="none" stroke="url(#${uid}h)" stroke-width="4.5" stroke-linecap="round"/><path d="M18 34l-.5 2" stroke="white" stroke-opacity=".45" stroke-width="2" stroke-linecap="round"/><path d="${f.leaf}" fill="#69966c" stroke="#5d8661" stroke-width=".5"/><g fill="#604f55"><ellipse cx="26" cy="36" rx="1.65" ry="2"/><ellipse cx="38" cy="36" rx="1.65" ry="2"/></g><path d="M30 41q2 2.6 4 0" fill="none" stroke="#785d5d" stroke-width="1.3" stroke-linecap="round"/><ellipse cx="22" cy="40" rx="3" ry="1.6" fill="#e98791" opacity=".38"/><ellipse cx="42" cy="40" rx="3" ry="1.6" fill="#e98791" opacity=".38"/></svg>`;
}
export const icons: Record<string, string> = {
  leaf: '<path d="M19 4C9 3 4 8 5 14s10 7 13-1c1-3 1-6 1-9Z"/><path d="m5 20 9-11"/>',
  play: '<path d="m9 5 11 7-11 7Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  hint: '<path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2Z"/><path d="M12 1v1M3 5l1 1m16 0 1-1"/>',
  shuffle:
    '<path d="M3 6h3c4 0 8 12 12 12h3m-4-4 4 4-4 4M3 18h3c1.5 0 3-2 4-4m4-4c1-2 2.5-4 4-4h3m-4-4 4 4-4 4"/>',
  undo: '<path d="m8 3-5 5 5 5M3 8h10a7 7 0 0 1 0 14"/>',
  sound: '<path d="m11 4-5 5H2v6h4l5 5Zm4 4q5 4 0 8m3-11q8 7 0 14"/>',
  mute: '<path d="m11 4-5 5H2v6h4l5 5Zm5 5 6 6m0-6-6 6"/>',
  settings:
    '<path d="m10 2-1 3-3 1-3 1 1 4-1 3 3 3 3 1 1 4h4l1-4 3-1 3-3-1-3 1-4-3-1-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3v.1"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  star: '<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  trophy:
    '<path d="M7 3h10v6a5 5 0 0 1-10 0ZM7 5H3v3a4 4 0 0 0 5 4m9-7h4v3a4 4 0 0 1-5 4M12 14v6m-5 1h10"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  heart:
    '<path d="M12 21S2 15 2 8a5 5 0 0 1 10-2A5 5 0 0 1 22 8c0 7-10 13-10 13Z"/>',
  spark:
    '<path d="m12 2 2 7 7 3-7 2-2 8-3-8-7-2 7-3Zm7-1 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  infinity: '<path d="M12 12c-3-8-10-7-10 0s7 8 10 0 10-7 10 0-7 8-10 0Z"/>',
  home: '<path d="m3 11 9-8 9 8M5 9v12h14V9M9 21v-7h6v7"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
};
export function icon(name: string, cls = "") {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.leaf}</svg>`;
}
