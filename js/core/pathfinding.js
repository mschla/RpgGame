// A* pathfinding on a grid with 8-way movement (no corner cutting)

const DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

class MinHeap {
  constructor() { this.a = []; }
  push(item) {
    const a = this.a; a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]]; i = p;
    }
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
  get size() { return this.a.length; }
}

/**
 * Find a path from (sx,sy) to (tx,ty).
 * passable(x,y) -> bool. Returns array of [x,y] excluding start, or null.
 * If the target itself is not passable, paths to the nearest reachable neighbour.
 */
export function findPath(sx, sy, tx, ty, passable, width, height, maxNodes = 6000) {
  if (sx === tx && sy === ty) return [];
  const key = (x, y) => y * width + x;
  const open = new MinHeap();
  const gScore = new Map();
  const came = new Map();
  const closed = new Set();
  const h = (x, y) => {
    const dx = Math.abs(x - tx), dy = Math.abs(y - ty);
    return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
  };
  const startKey = key(sx, sy);
  gScore.set(startKey, 0);
  open.push({ x: sx, y: sy, f: h(sx, sy), g: 0 });
  let best = { x: sx, y: sy, h: h(sx, sy) };
  let nodes = 0;
  const targetPassable = passable(tx, ty);

  while (open.size) {
    const cur = open.pop();
    const ck = key(cur.x, cur.y);
    if (closed.has(ck)) continue;
    closed.add(ck);
    nodes++;
    if (cur.x === tx && cur.y === ty) { best = cur; break; }
    const hc = h(cur.x, cur.y);
    if (hc < best.h) best = { x: cur.x, y: cur.y, h: hc };
    if (!targetPassable && hc <= 1.5) { best = { x: cur.x, y: cur.y, h: hc }; break; }
    if (nodes > maxNodes) break;
    for (const [dx, dy] of DIRS) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const isTarget = nx === tx && ny === ty;
      if (!isTarget && !passable(nx, ny)) continue;
      if (isTarget && !targetPassable) continue;
      if (dx !== 0 && dy !== 0) {
        // no corner cutting
        if (!passable(cur.x + dx, cur.y) || !passable(cur.x, cur.y + dy)) continue;
      }
      const cost = (dx !== 0 && dy !== 0) ? 1.414 : 1;
      const ng = cur.g + cost;
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      if (ng < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, ng);
        came.set(nk, ck);
        open.push({ x: nx, y: ny, f: ng + h(nx, ny), g: ng });
      }
    }
  }
  // reconstruct from best
  const path = [];
  let k = key(best.x, best.y);
  if (k === startKey) return null;
  while (k !== startKey) {
    path.push([k % width, Math.floor(k / width)]);
    k = came.get(k);
    if (k === undefined) return null;
  }
  path.reverse();
  return path;
}

// Bresenham line of sight
export function hasLineOfSight(x0, y0, x1, y1, opaque) {
  x0 = Math.floor(x0); y0 = Math.floor(y0); x1 = Math.floor(x1); y1 = Math.floor(y1);
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0, y = y0;
  for (;;) {
    if (x === x1 && y === y1) return true;
    if (!(x === x0 && y === y0) && opaque(x, y)) return false;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}
