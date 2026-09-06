// Loads the Flare-derived art (see tools/build-assets.mjs). Everything degrades to the
// procedural renderer when this fails, so a missing assets folder is not fatal.
export class Assets {
  constructor(base = 'assets/') {
    this.base = base; this.ready = false; this.sprites = {}; this.tiles = null; this.atlas = null; this.error = null;
  }
  async load(onProgress = () => {}) {
    try {
      const manifest = await (await fetch(this.base + 'manifest.json')).json();
      const total = manifest.sprites.length + 2; let done = 0;
      const tick = () => { done++; onProgress(done / total); };
      const tilesJson = await (await fetch(this.base + manifest.tiles)).json(); tick();
      this.tiles = tilesJson.tiles;
      this.atlas = await loadImage(this.base + 'tiles/' + tilesJson.atlas); tick();
      const queue = manifest.sprites.slice();
      const worker = async () => {
        while (queue.length) {
          const name = queue.shift();
          const [data, img] = await Promise.all([fetch(`${this.base}sprites/${name}.json`).then(r => r.json()), loadImage(`${this.base}sprites/${name}.webp`)]);
          this.sprites[name] = { img, ...data };
          tick();
        }
      };
      await Promise.all(Array.from({ length: 6 }, worker));
      this.ready = true;
    } catch (err) {
      this.error = err; this.ready = false;
      console.warn('Art assets unavailable, using procedural graphics:', err);
    }
    return this.ready;
  }
  sprite(name) { return this.sprites[name] || null; }
  /** Pick a tile variant deterministically. */
  tile(name, seed = 0) {
    const list = this.tiles && this.tiles[name];
    if (!list || !list.length) return null;
    return list[Math.abs(seed) % list.length];
  }
  /** Current atlas rect for a tile at time t (handles animated tiles). Returns [x, y]. */
  frameOf(tile, t) {
    if (tile.frames.length === 1) return tile.frames[0];
    const totalDur = tile.frames.reduce((a, f) => a + f[2], 0) || 1;
    let ms = (t * 1000) % totalDur;
    for (const f of tile.frames) { if (ms < f[2]) return f; ms -= f[2]; }
    return tile.frames[0];
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load ' + src));
    img.src = src;
  });
}

// Flare direction index from a movement or facing delta in tile space.
// 0=W 1=NW 2=N 3=NE 4=E 5=SE 6=S 7=SW (screen directions; tile x runs screen-right-down, y runs screen-left-down)
const DIR_VECTORS = [[-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1]];
export function dirFromDelta(dx, dy) {
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return 6;
  const len = Math.hypot(dx, dy); dx /= len; dy /= len;
  let best = 6, bd = -Infinity;
  DIR_VECTORS.forEach(([vx, vy], i) => {
    const l = Math.hypot(vx, vy); const d = (vx * dx + vy * dy) / l;
    if (d > bd) { bd = d; best = i; }
  });
  return best;
}

/** Frame index for an animation at elapsed seconds. */
export function animFrame(anim, elapsed) {
  const n = anim.frames || 1;
  const dur = (anim.duration || 500) / 1000;
  if (anim.type === 'play_once') return Math.min(n - 1, Math.floor(elapsed / dur * n));
  if (anim.type === 'back_forth') { const cycle = Math.max(1, 2 * n - 2); const i = Math.floor(elapsed / dur * cycle) % cycle; return i < n ? i : cycle - i; }
  return Math.floor(elapsed / dur * n) % n;
}
export function animDone(anim, elapsed) { return elapsed >= (anim.duration || 500) / 1000; }
