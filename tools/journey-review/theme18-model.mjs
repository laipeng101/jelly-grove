// Independent theme18 model: no game, path, generator or solver imports.
export function connect(board, a, b, width) {
  if (a === b || board[a] <= 0 || board[a] !== board[b]) return false;
  const height = board.length / width;
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const start = [Math.floor(a / width), a % width];
  const target = [Math.floor(b / width), b % width];
  const queue = dirs.map((_, dir) => [...start, dir, 0]);
  const seen = new Map();
  for (let i = 0; i < queue.length; i++) {
    const [r, c, previous, turns] = queue[i];
    for (let dir = 0; dir < 4; dir++) {
      const nextTurns = turns + Number(dir !== previous);
      if (nextTurns > 2) continue;
      const nr = r + dirs[dir][0], nc = c + dirs[dir][1];
      if (nr < -1 || nr > height || nc < -1 || nc > width) continue;
      if (nr === target[0] && nc === target[1]) return true;
      if (nr >= 0 && nr < height && nc >= 0 && nc < width && board[nr * width + nc] !== 0) continue;
      const key = `${nr},${nc},${dir}`;
      if ((seen.get(key) ?? 3) <= nextTurns) continue;
      seen.set(key, nextTurns);
      queue.push([nr, nc, dir, nextTurns]);
    }
  }
  return false;
}

export function theme18Model(puzzle) {
  if (puzzle.themeId !== 18 || puzzle.stages.length !== 1 || puzzle.stages[0].goal.kind !== 'deliver' || puzzle.stages[0].movement.kind !== 'conveyor' || puzzle.challenge.kind !== 'fuel') throw new Error('Unsupported puzzle');
  const stage = puzzle.stages[0], width = puzzle.initial[0].length;
  const index = p => p.r * width + p.c;
  const point = i => ({ r: Math.floor(i / width), c: i % width });
  const quotas = stage.goal.quotas, fruits = Object.keys(quotas).map(Number);
  const ports = new Set(stage.ports.map(index));
  const initial = { board: puzzle.initial.flat(), progress: {}, fuel: 0 };
  const key = s => JSON.stringify([s.board, s.progress, s.fuel]);
  const moveCache = new Map();
  const won = s => fruits.every(f => (s.progress[f] ?? 0) >= quotas[f]);
  const moves = s => {
    if (won(s)) return [];
    const id = key(s);
    if (moveCache.has(id)) return moveCache.get(id);
    const out = [];
    for (let a = 0; a < s.board.length; a++) {
      const f = s.board[a];
      if (f <= 0) continue;
      for (let b = a + 1; b < s.board.length; b++) {
        if (f !== s.board[b] || !connect(s.board, a, b, width)) continue;
        const credit = (quotas[f] ?? 0) > (s.progress[f] ?? 0) && (ports.has(a) || ports.has(b));
        const remaining = Math.max(0, (quotas[f] ?? 0) - (s.progress[f] ?? 0) - Number(credit));
        if (s.board.filter(v => v === f).length - 2 < remaining * 2) continue;
        out.push({ a: point(a), b: point(b) });
      }
    }
    moveCache.set(id, out);
    return out;
  };
  const step = (s, move) => {
    const a = index(move.a), b = index(move.b);
    if (!moves(s).some(m => (index(m.a) === a && index(m.b) === b) || (index(m.a) === b && index(m.b) === a))) return null;
    const fruit = s.board[a], before = s.board.slice(), progress = { ...s.progress };
    if ((quotas[fruit] ?? 0) > (progress[fruit] ?? 0) && (ports.has(a) || ports.has(b))) progress[fruit] = (progress[fruit] ?? 0) + 1;
    before[a] = before[b] = 0;
    const board = before.slice();
    for (const track of stage.movement.tracks) {
      for (let i = 0; i < track.cells.length; i++) {
        const destination = (i + track.direction + track.cells.length) % track.cells.length;
        board[index(track.cells[destination])] = before[index(track.cells[i])];
      }
    }
    return { board, progress, fuel: s.fuel + Number(!quotas[fruit]) };
  };
  const replay = path => {
    let state = initial;
    for (const move of path) {
      state = step(state, move);
      if (!state) return null;
    }
    return state;
  };
  const search = (start = initial, maxNodes = 100000) => {
    const cache = new Map();
    let edges = 0;
    const visit = state => {
      const id = key(state);
      if (cache.has(id)) return cache.get(id);
      if (cache.size >= maxNodes) throw new Error('Independent search budget exhausted');
      const result = { state, win: false, challenge: false, ordinary: false, minimum: Infinity, maximum: -Infinity, path: null, choices: [] };
      cache.set(id, result);
      if (won(state)) {
        result.win = true;
        result.challenge = state.fuel <= puzzle.challenge.limit;
        result.ordinary = !result.challenge;
        result.minimum = result.maximum = state.fuel;
        result.path = [];
        return result;
      }
      for (const move of moves(state)) {
        const next = step(state, move), child = visit(next);
        edges++;
        result.choices.push({ move, next, child });
        result.win ||= child.win;
        result.challenge ||= child.challenge;
        result.ordinary ||= child.ordinary;
        if (child.minimum < result.minimum) {
          result.minimum = child.minimum;
          result.path = [move, ...child.path];
        }
        result.maximum = Math.max(result.maximum, child.maximum);
      }
      return result;
    };
    return { root: visit(start), cache, get edges() { return edges; } };
  };
  return { initial, key, won, moves, step, replay, search };
}
