import { TILE } from '../data/areas.js';
import { ITEMS } from '../data/items.js';
import { MONSTERS } from '../data/monsters.js';
import * as E from './entity.js';
import { animFrame, animDone } from './assets.js';
import { LAYER_ORDER, avatarFromEquipment, avatarFromSpec } from './avatar.js';

export const TW = 96, TH = 48;

const colorCache = new Map();
function shade(hex, f) {
  const key = hex + '|' + f.toFixed(2);
  let v = colorCache.get(key);
  if (v) return v;
  let r, g, b;
  if (hex[0] === '#') { r = parseInt(hex.slice(1, 3), 16); g = parseInt(hex.slice(3, 5), 16); b = parseInt(hex.slice(5, 7), 16); }
  else { r = g = b = 128; }
  r = Math.max(0, Math.min(255, Math.round(r * f))); g = Math.max(0, Math.min(255, Math.round(g * f))); b = Math.max(0, Math.min(255, Math.round(b * f)));
  v = `rgb(${r},${g},${b})`;
  colorCache.set(key, v);
  return v;
}
function hash(x, y, salt = 0) { let h = (x * 374761393 + y * 668265263 + salt * 982451653) | 0; h = (h ^ (h >>> 13)) * 1274126177; return Math.abs(h ^ (h >>> 16)); }

// Animation fallbacks when a sheet lacks a clip
const ANIM_FALLBACK = { run: 'stance', hit: 'stance', swing: 'stance', shoot: 'swing', cast: 'stance', die: 'stance', stance: 'stance' };

// ---------------------------------------------------------------- FX system
class FX {
  constructor() { this.list = []; }
  clear() { this.list = []; }
  update(dt) { for (const f of this.list) f.t += dt; this.list = this.list.filter(f => f.t < f.dur); }
  floatText(e, text, color) { this.list.push({ type: 'text', x: e.x, y: e.y, text, color, t: 0, dur: 1.2, off: Math.random() * 10 - 5 }); }
  burst(e, color, radius = 1) { this.list.push({ type: 'burst', x: e.x, y: e.y, color, radius, t: 0, dur: 0.6 }); }
  explosion(e, color, radius = 2) {
    this.list.push({ type: 'explosion', x: e.x, y: e.y, color, radius, t: 0, dur: 0.9 });
    for (let i = 0; i < 24; i++) { const a = Math.random() * Math.PI * 2, s = 0.5 + Math.random() * radius; this.list.push({ type: 'particle', x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, color, t: 0, dur: 0.5 + Math.random() * 0.5 }); }
  }
  projectile(from, to, color, style = 'bolt') { this.list.push({ type: 'proj', x0: from.x, y0: from.y, x1: to.x, y1: to.y, color, style, t: 0, dur: 0.3 }); }
  missiles(from, to, color, n) { for (let i = 0; i < n; i++) this.list.push({ type: 'proj', x0: from.x, y0: from.y, x1: to.x, y1: to.y, color, style: 'missile', t: -i * 0.08, dur: 0.35, wob: (i % 2 ? 1 : -1) * (0.3 + i * 0.1) }); }
  cast(e, color) { this.list.push({ type: 'cast', x: e.x, y: e.y, color, t: 0, dur: 0.5 }); }
  lunge(a, b) { const d = Math.hypot(b.x - a.x, b.y - a.y) || 1; a.lunge = { dx: (b.x - a.x) / d * 0.25, dy: (b.y - a.y) / d * 0.25, t: 0.25 }; }
  clickMarker(tx, ty) { this.list.push({ type: 'click', x: tx + 0.5, y: ty + 0.5, t: 0, dur: 0.5 }); }
  /** Play a one-shot sprite animation (swing, shoot, cast, hit, die). */
  anim(e, name) { if (name === 'hit' && e.anim && e.anim.once && e.anim.name !== 'hit' && !e.animFinished) return; e.anim = { name, t: 0, once: true }; e.animFinished = false; }
}

export class Renderer {
  constructor(canvas, minimap, assets) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.minimap = minimap; this.mctx = minimap.getContext('2d');
    this.assets = assets;
    this.cam = { x: 0, y: 0 };
    this.fx = new FX();
    this.game = null; this.hover = null; this.mouse = { x: -1, y: -1 };
    this.time = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  resize() { this.canvas.width = window.innerWidth; this.canvas.height = window.innerHeight; }
  get useArt() { return this.assets && this.assets.ready; }
  iso(x, y) { return [(x - y) * TW / 2, (x + y) * TH / 2]; }
  toScreen(x, y) { const [ix, iy] = this.iso(x, y); return [ix + this.cam.x, iy + this.cam.y]; }
  toTile(sx, sy) {
    const ix = sx - this.cam.x, iy = sy - this.cam.y;
    return [Math.floor((ix / (TW / 2) + iy / (TH / 2)) / 2), Math.floor((iy / (TH / 2) - ix / (TW / 2)) / 2)];
  }
  snapCamera() { const p = this.game.player; const [ix, iy] = this.iso(p.x, p.y); this.cam.x = this.canvas.width / 2 - ix; this.cam.y = this.canvas.height / 2 - iy; }
  updateCamera(dt) {
    const p = this.game.player; const [ix, iy] = this.iso(p.x, p.y);
    const tx = this.canvas.width / 2 - ix, ty = this.canvas.height / 2 - iy;
    const k = Math.min(1, dt * 6);
    this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * k;
  }

  pick(sx, sy) {
    const g = this.game;
    if (!g || !g.area) return null;
    let best = null, bd = Infinity;
    for (const e of g.area.entities) {
      const isCreature = e.hp !== undefined;
      const ex = isCreature ? e.x : e.x + 0.5 + ((e.w || 1) - 1) / 2, ey = isCreature ? e.y : e.y + 0.5;
      if (!g.isExplored(Math.floor(ex), Math.floor(ey))) continue;
      if (isCreature && (e.dead || !g.isVisible(Math.floor(ex), Math.floor(ey)))) continue;
      if (e.type === 'trap' && !e.found) continue;
      if (e.type === 'door' && e.open) continue;
      const [px, py] = this.toScreen(ex, ey);
      let inside = false, d = Infinity;
      if (e._bounds) {
        const b = e._bounds;
        // creature sprites are tall; only the central column counts so neighbours stay clickable
        const shrink = isCreature ? Math.max(0, (b.w - 44) / 2) : 0;
        inside = sx >= b.x + shrink && sx <= b.x + b.w - shrink && sy >= b.y && sy <= b.y + b.h;
        d = Math.abs(sx - (b.x + b.w / 2)) + Math.abs(sy - (b.y + b.h)) - (isCreature ? 8 : 0);
      } else {
        const h = isCreature ? 34 * (e.size || 1) : 20, w = isCreature ? 16 * (e.size || 1) + 6 : (e.w ? e.w * 20 : 22);
        const cy = py - h / 2;
        inside = Math.abs(sx - px) <= w && Math.abs(sy - cy) <= h / 2 + 4;
        d = Math.abs(sx - px) + Math.abs(sy - cy) - (isCreature ? 8 : 0);
      }
      if (inside && d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // ---------------------------------------------------------------- draw
  draw(dt) {
    const g = this.game; const ctx = this.ctx;
    this.time += dt;
    ctx.fillStyle = '#05070a'; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!g || !g.area || !g.running) return;
    this.updateCamera(dt);
    const a = g.area;
    const animDt = (g.paused || g.dialogue || g.ui.modalOpen()) ? 0 : dt;
    const W = this.canvas.width, H = this.canvas.height;
    const corners = [this.toTile(0, 0), this.toTile(W, 0), this.toTile(0, H), this.toTile(W, H)];
    const minX = Math.max(0, Math.min(...corners.map(c => c[0])) - 3), maxX = Math.min(a.width - 1, Math.max(...corners.map(c => c[0])) + 3);
    const minY = Math.max(0, Math.min(...corners.map(c => c[1])) - 3), maxY = Math.min(a.height - 1, Math.max(...corners.map(c => c[1])) + 6);
    const dimFor = (vis) => vis ? 1 : (a.outdoor ? 0.7 : 0.45);

    // floor pass
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      if (!g.isExplored(x, y)) continue;
      const ch = a.tiles[y][x]; const t = TILE[ch] || TILE['.'];
      this.drawFloor(x, y, ch, t, dimFor(g.isVisible(x, y)));
    }
    // objects & creatures, depth sorted
    const items = [];
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      if (!g.isExplored(x, y)) continue;
      const ch = a.tiles[y][x]; const t = TILE[ch];
      if (!t) continue;
      if (t.height || t.tree || t.bush || t.pillar || t.grave || t.altar || t.crate || t.table || t.well || t.stump || (this.useArt && (t.stairs || t.bones || ch === '.' && hash(x, y, 9) % 14 === 0))) items.push({ d: x + y, x, y, tile: t, ch });
      // black "back" slabs of walls are drawn on the floor tile in front of them
      if (this.useArt && !t.height && (this.hasBack(x + 1, y) || this.hasBack(x, y + 1))) items.push({ d: x + y + 0.4, x, y, wallBack: true });
    }
    for (const e of a.entities) {
      const isCreature = e.hp !== undefined;
      if (isCreature) {
        if (!g.isVisible(Math.floor(e.x), Math.floor(e.y)) && !e.dead) continue;
        if (e.dead && !g.isExplored(Math.floor(e.x), Math.floor(e.y))) continue;
        if (e.dead && !this.useArt && e.kind === 'monster' && g.time - (e.deathTime || 0) > 20) continue;
        items.push({ d: e.x + e.y - 0.01 + (e.dead ? -0.3 : 0), ent: e });
      } else {
        if (!g.isExplored(e.x, e.y)) continue;
        if (e.type === 'trap' && !e.found) continue;
        items.push({ d: e.x + e.y + ((e.w || 1) - 1) / 2 - 0.02, ent: e });
      }
    }
    items.sort((p, q) => p.d - q.d);
    const pl = g.player; const pd = pl.x + pl.y;
    for (const it of items) {
      if (it.wallBack) {
        const near = it.x + it.y >= pd - 0.5 && Math.abs(it.x - pl.x) < 4 && Math.abs(it.y - pl.y) < 4;
        const [cx, cy] = this.toScreen(it.x + 0.5, it.y + 0.5);
        this.drawWallBack(it.x, it.y, cx, cy, dimFor(g.isVisible(it.x, it.y)) * (near ? 0.35 : 1));
        continue;
      }
      if (it.tile) {
        const vis = g.isVisible(it.x, it.y);
        const tall = it.tile.height || it.tile.tree;
        const inFront = tall && it.x + it.y > pd + 0.5 && Math.abs(it.x - pl.x) < 4 && Math.abs(it.y - pl.y) < 4;
        this.drawObject(it.x, it.y, it.tile, it.ch, dimFor(vis) * (inFront ? 0.4 : 1));
      } else if (it.ent.hp !== undefined) this.drawCreature(it.ent, dt, animDt);
      else this.drawEntityObject(it.ent, g.isVisible(it.ent.x, it.ent.y) ? 1 : (a.outdoor ? 0.75 : 0.55));
    }
    this.drawFx();
    this.drawHoverLabel();
    this.drawMinimap();
  }

  diamond(ctx, cx, cy, w = TW, h = TH) { ctx.beginPath(); ctx.moveTo(cx, cy - h / 2); ctx.lineTo(cx + w / 2, cy); ctx.lineTo(cx, cy + h / 2); ctx.lineTo(cx - w / 2, cy); ctx.closePath(); }

  /** Draw a tile atlas entry with its origin at the diamond centre (cx, cy). */
  blit(tile, cx, cy, alpha = 1, scale = 1) {
    if (!tile) return false;
    const ctx = this.ctx; const [fx, fy] = this.assets.frameOf(tile, this.time);
    if (alpha !== 1) ctx.globalAlpha = alpha;
    ctx.drawImage(tile.image || this.assets.atlas, fx, fy, tile.w, tile.h, cx - tile.ox * scale, cy - tile.oy * scale, tile.w * scale, tile.h * scale);
    if (alpha !== 1) ctx.globalAlpha = 1;
    return true;
  }

  // Which floor art a tile shows. Object tiles borrow the floor of a walkable neighbour.
  floorName(x, y, ch) {
    const a = this.game.area;
    const direct = { '.': 'floor_grass', ',': 'floor_dirt', 'm': 'floor_mud', ':': 'floor_stone', '=': a.outdoor ? 'floor_planks' : 'floor_tile', 'r': 'floor_rug', '~': 'water', 's': 'floor_stone', 'b': 'floor_stone' };
    if (direct[ch]) {
      if (ch === '.' && hash(x, y, 3) % 5 === 0) return 'floor_grass_alt';
      return direct[ch];
    }
    if (ch === 'X') return null;
    if (ch === '#') return 'floor_stone';
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, -1]]) {
      const c = this.game.tileChar(x + dx, y + dy);
      if (direct[c] && c !== '~') return direct[c] === 'floor_rug' ? 'floor_stone' : direct[c];
    }
    return a.outdoor ? 'floor_grass' : 'floor_stone';
  }

  drawFloor(x, y, ch, t, dim) {
    const ctx = this.ctx;
    const [cx, cy] = this.toScreen(x + 0.5, y + 0.5);
    if (this.useArt) {
      const name = this.floorName(x, y, ch);
      if (!name) return;
      const tile = this.assets.tile(name, hash(x, y, 1));
      if (tile) { this.blit(tile, cx, cy, dim); if (ch === 'd') this.drawDoorway(cx, cy, dim); return; }
    }
    // ---- procedural fallback
    let color = t.color;
    if (t.alt && ((x + y) & 1)) color = t.alt;
    if (t.water) { const w = Math.sin(this.time * 2 + x * 0.7 + y * 1.3) * 0.08 + 1; color = shade(t.color, w); }
    ctx.fillStyle = shade(color, dim);
    this.diamond(ctx, cx, cy); ctx.fill();
    if (t.stairs) { ctx.strokeStyle = shade('#9a98a0', dim); ctx.lineWidth = 2; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(cx - TW / 2 + 12 + (i + 2) * 7, cy + i * 4); ctx.lineTo(cx + TW / 2 - 12 - (2 - i) * 7, cy + i * 4); ctx.stroke(); } }
    else if (t.bones) { ctx.strokeStyle = shade('#d8d0c0', dim); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 14, cy - 4); ctx.lineTo(cx + 12, cy + 6); ctx.moveTo(cx - 8, cy + 8); ctx.lineTo(cx + 14, cy - 6); ctx.stroke(); }
    else if (t.door) { ctx.fillStyle = shade('#5a3a1a', dim); ctx.fillRect(cx - 14, cy - 34, 28, 34); }
  }
  drawDoorway(cx, cy, dim) { const ctx = this.ctx; ctx.fillStyle = shade('#3a2a1a', dim); ctx.fillRect(cx - 16, cy - 40, 32, 40); ctx.fillStyle = shade('#6a4a2a', dim); ctx.fillRect(cx - 13, cy - 36, 26, 36); }

  isWall(x, y) { const c = this.game.tileChar(x, y); return c === '#' || c === 'X'; }
  /** Wall style prefix for a wall tile: dungeon slabs indoors, cave rock for outdoor 'X', brick blocks for outdoor '#'. */
  wallSet(x, y) {
    const c = this.game.tileChar(x, y);
    if (c !== '#' && c !== 'X') return null;
    if (!this.game.area.outdoor) return '';
    return c === 'X' ? 'cave_' : 'block';
  }
  hasBack(x, y) { const w = this.wallSet(x, y); return w !== null && w !== 'block'; }

  /** Lit wall faces sit on a rock tile's near (SE / SW) edges, facing the room in front of them. */
  drawWall(x, y, cx, cy, dim) {
    const set = this.wallSet(x, y);
    if (set === 'block') {
      // Blender-rendered log walls and palisades when present (tools/blender/render_iso.py), Flare brick otherwise
      const thick = this.isThick(x, y);
      const custom = this.assets.tile(thick ? 'logblock' : 'palisade', 0);
      if (custom) { this.blit(custom, cx, cy, dim); return; }
      const t = this.assets.tile('wall_block', 0); if (t) this.blitBottom(t, cx, cy, dim); return;
    }
    const open = (i, j) => !this.isWall(i, j);
    const seed = hash(x, y, 5);
    const fSE = open(x + 1, y), fSW = open(x, y + 1);
    let piece = null;
    if (fSE && fSW) piece = 'wall_corner_front';
    else if (fSE) piece = 'wall_b';
    else if (fSW) piece = 'wall_a';
    else if (open(x + 1, y + 1)) piece = 'wall_corner_front';
    if (piece) this.blit(this.assets.tile(set + piece, seed), cx, cy, dim);
  }
  /** Dark back sides of walls, drawn on the floor tile that lies in front of a wall (its SE / SW edges). */
  drawWallBack(x, y, cx, cy, dim) {
    const rSE = this.hasBack(x + 1, y), rSW = this.hasBack(x, y + 1);
    const set = this.wallSet(rSE ? x + 1 : x, rSE ? y : y + 1) || '';
    const piece = rSE && rSW ? 'wall_corner_back' : rSE ? 'wall_back_a' : 'wall_back_b';
    this.blit(this.assets.tile(set + piece, hash(x, y, 6)), cx, cy, dim);
  }
  /** Part of a 2x2 block of wall tiles: a building rather than a fence line. */
  isThick(x, y) {
    const w = (i, j) => this.isWall(i, j);
    for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) if (w(x + dx, y) && w(x, y + dy) && w(x + dx, y + dy)) return true;
    return false;
  }
  /** Draw a tile so its image bottom sits on the diamond's bottom corner (for block tiles whose origin is at their top). */
  blitBottom(tile, cx, cy, alpha = 1) {
    const ctx = this.ctx; const [fx, fy] = this.assets.frameOf(tile, this.time);
    if (alpha !== 1) ctx.globalAlpha = alpha;
    ctx.drawImage(this.assets.atlas, fx, fy, tile.w, tile.h, cx - tile.w / 2, cy + TH / 2 - tile.h, tile.w, tile.h);
    if (alpha !== 1) ctx.globalAlpha = 1;
  }
  drawObject(x, y, t, ch, dim) {
    const ctx = this.ctx;
    const [cx, cy] = this.toScreen(x + 0.5, y + 0.5);
    if (this.useArt) {
      const seed = hash(x, y, 7);
      if (t.height) { this.drawWall(x, y, cx, cy, dim); return; }
      let name = null;
      if (t.tree) { const r = seed % 10; name = r < 6 ? 'tree' : r < 9 ? 'tree_pine' : 'tree_pale'; }
      else if (t.bush) name = 'bush';
      else if (t.stump) name = 'stump';
      else if (t.pillar) name = 'statue';
      else if (t.grave) name = 'grave';
      else if (t.sarcophagus) name = 'sarcophagus';
      else if (t.altar) name = 'altar';
      else if (t.crate) name = 'crate';
      else if (t.table) name = 'table';
      else if (t.stairs) name = 'stairs';
      else if (t.bones) name = 'bones';
      else if (ch === '.') name = seed % 4 === 0 ? 'rock' : 'tuft';
      if (t.well) name = 'well';
      if (name && this.blit(this.assets.tile(name, seed), cx, cy, dim)) return;
      if (t.well) { this.drawWellProcedural(cx, cy, dim); return; }
      return;
    }
    // ---- procedural fallback
    if (t.height) {
      const h = t.height * TH;
      ctx.fillStyle = shade(t.side, dim * 0.85);
      ctx.beginPath(); ctx.moveTo(cx - TW / 2, cy); ctx.lineTo(cx, cy + TH / 2); ctx.lineTo(cx, cy + TH / 2 - h); ctx.lineTo(cx - TW / 2, cy - h); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(t.side, dim * 0.65);
      ctx.beginPath(); ctx.moveTo(cx, cy + TH / 2); ctx.lineTo(cx + TW / 2, cy); ctx.lineTo(cx + TW / 2, cy - h); ctx.lineTo(cx, cy + TH / 2 - h); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(t.top, dim); this.diamond(ctx, cx, cy - h); ctx.fill();
      return;
    }
    if (t.tree) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(cx, cy + 2, 20, 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = shade('#5a3a1a', dim); ctx.fillRect(cx - 4, cy - 32, 8, 34);
      ctx.fillStyle = shade('#2e6a2a', dim); ctx.beginPath(); ctx.moveTo(cx, cy - 90); ctx.lineTo(cx + 30, cy - 34); ctx.lineTo(cx - 30, cy - 34); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade('#357a30', dim); ctx.beginPath(); ctx.moveTo(cx, cy - 72); ctx.lineTo(cx + 24, cy - 22); ctx.lineTo(cx - 24, cy - 22); ctx.closePath(); ctx.fill();
      return;
    }
    if (t.bush) { ctx.fillStyle = shade('#3a7a34', dim); ctx.beginPath(); ctx.ellipse(cx, cy - 8, 20, 14, 0, 0, Math.PI * 2); ctx.fill(); return; }
    if (t.pillar) { ctx.fillStyle = shade('#6a6870', dim * 0.8); ctx.fillRect(cx - 12, cy - 70, 24, 70); ctx.fillStyle = shade('#8a8890', dim); ctx.fillRect(cx - 15, cy - 76, 30, 8); return; }
    if (t.grave) { ctx.fillStyle = shade('#8a8890', dim); ctx.fillRect(cx - 9, cy - 26, 18, 26); return; }
    if (t.altar) { ctx.fillStyle = shade('#3a3840', dim); ctx.fillRect(cx - 26, cy - 20, 52, 20); ctx.fillStyle = shade('#6a6070', dim); ctx.fillRect(cx - 30, cy - 26, 60, 8); return; }
    if (t.crate) { ctx.fillStyle = shade('#7a5a30', dim); ctx.fillRect(cx - 18, cy - 26, 36, 26); ctx.strokeStyle = shade('#4a3a20', dim); ctx.lineWidth = 2; ctx.strokeRect(cx - 18, cy - 26, 36, 26); return; }
    if (t.table) { ctx.fillStyle = shade('#8a6a3a', dim); ctx.beginPath(); ctx.ellipse(cx, cy - 20, 26, 12, 0, 0, Math.PI * 2); ctx.fill(); return; }
    if (t.well) { this.drawWellProcedural(cx, cy, dim); return; }
    if (t.stump) { ctx.fillStyle = shade('#6a4a2a', dim); ctx.fillRect(cx - 10, cy - 14, 20, 14); return; }
  }
  drawWellProcedural(cx, cy, dim) {
    const ctx = this.ctx;
    ctx.fillStyle = shade('#6a6a70', dim); ctx.beginPath(); ctx.ellipse(cx, cy - 6, 24, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shade('#1a2a4a', dim); ctx.beginPath(); ctx.ellipse(cx, cy - 8, 15, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shade('#5a3a1a', dim); ctx.fillRect(cx - 20, cy - 50, 4, 44); ctx.fillRect(cx + 16, cy - 50, 4, 44);
    ctx.fillStyle = shade('#7a2a2a', dim); ctx.beginPath(); ctx.moveTo(cx - 30, cy - 48); ctx.lineTo(cx, cy - 66); ctx.lineTo(cx + 30, cy - 48); ctx.closePath(); ctx.fill();
  }

  drawEntityObject(e, dim) {
    const ctx = this.ctx;
    const hovered = this.hover === e;
    if (e.type === 'transition') {
      for (let i = 0; i < (e.w || 1); i++) {
        const [cx, cy] = this.toScreen(e.x + i + 0.5, e.y + 0.5);
        const pulse = 0.5 + Math.sin(this.time * 3) * 0.2;
        ctx.strokeStyle = `rgba(255,230,120,${pulse * dim})`; ctx.lineWidth = 2;
        this.diamond(ctx, cx, cy, TW - 10, TH - 5); ctx.stroke();
        ctx.fillStyle = `rgba(255,230,120,${0.12 * dim})`; ctx.fill();
      }
      e._bounds = null;
      return;
    }
    const [cx, cy] = this.toScreen(e.x + 0.5, e.y + 0.5);
    if (this.useArt) {
      let tile = null;
      if (e.type === 'chest') tile = this.assets.tile(e.opened ? 'chest_open' : 'chest_closed', 0);
      else if (e.type === 'sign') tile = this.assets.tile('sign', 0);
      else if (e.type === 'door' && !e.open) {
        const g = this.game; const wallAcross = !g.isWalkable(e.x - 1, e.y) && !g.isWalkable(e.x + 1, e.y);
        tile = this.assets.tile(wallAcross ? 'door_b' : 'door_a', 0);
      }
      if (tile) {
        this.blit(tile, cx, cy, dim);
        e._bounds = { x: cx - tile.ox, y: cy - tile.oy, w: tile.w, h: tile.h };
        if (hovered) this.outline(cx - tile.ox + tile.w / 2, cy - tile.oy + tile.h / 2, tile.w / 2, tile.h / 2, '#ffe080');
        if (e.type === 'chest' && e.locked) { ctx.fillStyle = '#d0d0e0'; ctx.fillRect(cx - 3, cy - 20, 6, 8); }
        return;
      }
    }
    e._bounds = null;
    if (e.type === 'chest') {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(cx, cy + 1, 20, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = shade(e.opened ? '#5a4a30' : '#8a5a20', dim); ctx.fillRect(cx - 18, cy - 20, 36, 20);
      ctx.fillStyle = shade(e.opened ? '#4a3a20' : '#a06a28', dim); ctx.fillRect(cx - 19, cy - 28, 38, 9);
      ctx.fillStyle = shade(e.locked ? '#d0d0d0' : '#e0c040', dim); ctx.fillRect(cx - 3, cy - 20, 6, 7);
      if (hovered) this.outline(cx, cy - 14, 22, 16, '#ffe080');
      return;
    }
    if (e.type === 'loot') {
      const pulse = 0.6 + Math.sin(this.time * 4) * 0.3;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(cx, cy + 1, 16, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = shade(e.corpse ? '#6a4a3a' : '#8a7a5a', dim); ctx.beginPath(); ctx.ellipse(cx, cy - 5, 14, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,220,90,${pulse * dim})`; ctx.beginPath(); ctx.arc(cx + 4, cy - 8, 4, 0, Math.PI * 2); ctx.fill();
      e._bounds = { x: cx - 22, y: cy - 24, w: 44, h: 30 };
      if (hovered) this.outline(cx, cy - 6, 18, 12, '#ffe080');
      return;
    }
    if (e.type === 'trap') {
      ctx.strokeStyle = e.disarmed ? `rgba(120,200,120,${dim})` : `rgba(255,80,80,${dim})`; ctx.lineWidth = 2;
      this.diamond(ctx, cx, cy, TW - 24, TH - 12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - 10, cy - 5); ctx.lineTo(cx + 10, cy + 5); ctx.moveTo(cx - 10, cy + 5); ctx.lineTo(cx + 10, cy - 5); ctx.stroke();
      e._bounds = { x: cx - 30, y: cy - 16, w: 60, h: 32 };
      return;
    }
    if (e.type === 'door') {
      if (e.open) return;
      ctx.fillStyle = shade('#3a2a1a', dim); ctx.fillRect(cx - 20, cy - 74, 40, 74);
      ctx.fillStyle = shade('#6a4a2a', dim); ctx.fillRect(cx - 16, cy - 68, 32, 68);
      ctx.fillStyle = shade(e.locked ? '#b0b0c0' : '#c0a040', dim); ctx.fillRect(cx + 6, cy - 38, 6, 9);
      if (hovered) this.outline(cx, cy - 36, 22, 38, '#ffe080');
      return;
    }
    if (e.type === 'sign') {
      ctx.fillStyle = shade('#5a3a1a', dim); ctx.fillRect(cx - 3, cy - 36, 6, 36);
      ctx.fillStyle = shade('#a08050', dim); ctx.fillRect(cx - 18, cy - 44, 36, 14);
      if (hovered) this.outline(cx, cy - 24, 20, 22, '#ffe080');
    }
  }

  outline(cx, cy, hw, hh, color) { const ctx = this.ctx; ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.9; ctx.strokeRect(cx - hw - 2, cy - hh - 2, hw * 2 + 4, hh * 2 + 4); ctx.globalAlpha = 1; }

  // ---------------------------------------------------------------- creatures
  /** Sprite description for a creature: { sheets: [sheetName...], scale } drawn in order, or null for procedural. */
  spriteDesc(e) {
    if (!this.useArt) return null;
    let avatar = null, sheet = null, scale = 1;
    if (e.kind === 'monster') { const t = MONSTERS[e.tid]; sheet = t.sprite; avatar = t.avatar ? avatarFromSpec(t.avatar) : null; scale = t.spriteScale || 1; }
    else if (e.kind === 'npc') { sheet = e.sprite; avatar = e.avatar ? avatarFromSpec(e.avatar) : null; }
    else avatar = avatarFromEquipment(e);
    if (sheet && this.assets.sprite(sheet)) return { sheets: [sheet], scale, order: null };
    if (avatar) {
      const g = avatar.gender;
      const byLayer = {};
      for (const [layer, name] of Object.entries(avatar.layers)) if (name && this.assets.sprite(`${g}_${name}`)) byLayer[layer] = `${g}_${name}`;
      if (Object.keys(byLayer).length) return { sheets: null, byLayer, scale, order: true };
    }
    return null;
  }

  currentAnim(e, sheetData, animDt) {
    e.animT = (e.animT || 0) + animDt;
    if (e.anim) e.anim.t += animDt;
    const lookup = (n) => { let clip = sheetData.anims[n], guard = 0; while (!clip && guard++ < 4) { n = ANIM_FALLBACK[n] || 'stance'; clip = sheetData.anims[n]; } return clip ? { name: n, clip } : null; };
    const idle = () => lookup(e.moving ? 'run' : 'stance');
    if (e.dead) {
      const r = lookup('die'); if (!r) return null;
      const t = e.anim && e.anim.name === 'die' ? e.anim.t : 99;
      return { ...r, frame: animFrame(r.clip, t) };
    }
    if (e.anim && e.anim.once && !e.animFinished) {
      const r = lookup(e.anim.name);
      if (r && !animDone(r.clip, e.anim.t)) return { ...r, frame: animFrame(r.clip, e.anim.t) };
      e.animFinished = true;
    }
    const r = idle(); if (!r) return null;
    return { ...r, frame: animFrame(r.clip, e.animT) };
  }

  drawCreature(e, dt, animDt) {
    const ctx = this.ctx; const g = this.game;
    let ox = 0, oy = 0;
    if (e.lunge) { e.lunge.t -= dt; if (e.lunge.t <= 0) e.lunge = null; else { const k = Math.sin(e.lunge.t / 0.25 * Math.PI); ox = e.lunge.dx * k; oy = e.lunge.dy * k; } }
    const [cx, cy] = this.toScreen(e.x + ox, e.y + oy);
    const isPlayer = e.kind === 'player';
    const targeted = g.player.target === e.uid;
    const hovered = this.hover === e;
    if (!e.dead) {
      if (targeted) { ctx.strokeStyle = 'rgba(255,60,60,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(cx, cy, 24, 12, 0, 0, Math.PI * 2); ctx.stroke(); }
      else if (isPlayer) { ctx.strokeStyle = 'rgba(120,255,140,0.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(cx, cy, 22, 11, 0, 0, Math.PI * 2); ctx.stroke(); }
      else if (e.kind === 'henchman') { ctx.strokeStyle = 'rgba(120,200,255,0.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(cx, cy, 22, 11, 0, 0, Math.PI * 2); ctx.stroke(); }
    }
    const desc = this.spriteDesc(e);
    let top = cy - 50, drawn = false;
    if (desc) {
      const dir = e.dir === undefined ? (e.facing < 0 ? 7 : 5) : e.dir;
      const sc = desc.scale;
      const dim = 1;
      let bounds = null;
      const drawSheet = (sheetName, layerRefFrame) => {
        const sd = this.assets.sprite(sheetName);
        if (!sd) return;
        const cur = this.currentAnim(e, sd, layerRefFrame ? 0 : animDt);
        if (!cur) return;
        const rects = cur.clip.rects[dir] || cur.clip.rects[0];
        const r = rects && rects[Math.min(cur.frame, rects.length - 1)];
        if (!r) return;
        const [sx, sy, sw, sh, rox, roy] = r;
        const dx = cx - rox * sc, dy = cy - roy * sc;
        ctx.drawImage(sd.img, sx, sy, sw, sh, dx, dy, sw * sc, sh * sc);
        if (!bounds) bounds = { x: dx, y: dy, w: sw * sc, h: sh * sc }; else { const x0 = Math.min(bounds.x, dx), y0 = Math.min(bounds.y, dy); const x1 = Math.max(bounds.x + bounds.w, dx + sw * sc), y1 = Math.max(bounds.y + bounds.h, dy + sh * sc); bounds = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; }
      };
      if (desc.sheets) { for (const s of desc.sheets) drawSheet(s, false); }
      else {
        let first = true;
        for (const layer of LAYER_ORDER[dir]) { const s = desc.byLayer[layer]; if (!s) continue; drawSheet(s, !first); first = false; }
      }
      if (bounds) { e._bounds = bounds; top = bounds.y; drawn = true; }
    }
    if (!drawn) {
      e._bounds = null;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(cx, cy, 18 * (e.size || 1), 9 * (e.size || 1), 0, 0, Math.PI * 2); ctx.fill();
      if (e.dead) { this.drawCorpse(e, cx, cy, e.size || 1); return; }
      const bob = e.moving ? Math.abs(Math.sin(this.time * 12 + e.uid)) * 3 : 0;
      ctx.save(); ctx.translate(cx, cy - bob); ctx.scale(1.5, 1.5);
      if (e.facing < 0) ctx.scale(-1, 1);
      const s = e.size || 1;
      if (e.shape === 'beast') this.drawBeast(e, s); else if (e.shape === 'small') this.drawSmall(e, s); else if (e.shape === 'spider') this.drawSpider(e, s); else this.drawHumanoid(e, s);
      ctx.restore();
      top = cy - 52 * (e.size || 1);
    }
    if (e.dead) return;
    // status rings
    if (e.effects.length) {
      const good = e.effects.some(x => !x.harmful && !x.held && !x.dot), bad = e.effects.some(x => x.harmful || x.held || x.dot);
      if (good) { ctx.strokeStyle = 'rgba(160,200,255,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(cx, cy - 2, 20, 9, 0, 0, Math.PI * 2); ctx.stroke(); }
      if (bad) { ctx.strokeStyle = 'rgba(200,80,220,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(cx, cy - 1, 19, 8, 0, 0, Math.PI * 2); ctx.stroke(); }
    }
    const held = e.effects.some(x => x.held);
    if (held) { ctx.fillStyle = '#c0c0ff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('HELD', cx, top - 4); }
    const maxHp = E.maxHp(e);
    if (e.kind !== 'npc' && (e.hp < maxHp || targeted || hovered || e.kind !== 'monster')) {
      const w = 36, h = 4, y = top - 12;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(cx - w / 2 - 1, y - 1, w + 2, h + 2);
      const f = Math.max(0, e.hp / maxHp);
      ctx.fillStyle = e.faction === 'hostile' ? '#d03030' : f > 0.5 ? '#40c040' : f > 0.25 ? '#e0c030' : '#e04030';
      ctx.fillRect(cx - w / 2, y, w * f, h);
    }
    if (hovered && !isPlayer) {
      ctx.font = 'bold 12px "Segoe UI", sans-serif'; ctx.textAlign = 'center';
      const label = e.name; const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(cx - tw / 2 - 4, top - 30, tw + 8, 16);
      ctx.fillStyle = e.faction === 'hostile' ? '#ff9090' : e.faction === 'party' ? '#a0e0ff' : '#ffe080';
      ctx.fillText(label, cx, top - 18);
    }
  }

  drawCorpse(e, cx, cy, s) {
    const ctx = this.ctx;
    ctx.fillStyle = shade(e.color || '#888', 0.6); ctx.beginPath(); ctx.ellipse(cx, cy - 3, 20 * s, 9 * s, 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(120,20,20,0.5)'; ctx.beginPath(); ctx.ellipse(cx + 4, cy, 14 * s, 6 * s, 0, 0, Math.PI * 2); ctx.fill();
  }

  // ---- procedural creature fallbacks (used when art is unavailable)
  drawHumanoid(e, s) {
    const ctx = this.ctx; const body = e.color || '#888';
    const skin = e.creatureType === 'undead' ? '#e8e0d0' : e.creatureType === 'goblinoid' ? '#7aa050' : '#e0b090';
    const H = 34 * s;
    ctx.strokeStyle = shade(body, 0.6); ctx.lineWidth = 4 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-4 * s, -H * 0.4); ctx.lineTo(-5 * s, -1); ctx.moveTo(4 * s, -H * 0.4); ctx.lineTo(5 * s, -1); ctx.stroke();
    ctx.fillStyle = body; ctx.fillRect(-8 * s, -H * 0.78, 16 * s, H * 0.42);
    ctx.strokeStyle = skin; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.moveTo(-8 * s, -H * 0.7); ctx.lineTo(-11 * s, -H * 0.45); ctx.moveTo(8 * s, -H * 0.7); ctx.lineTo(12 * s, -H * 0.5); ctx.stroke();
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(0, -H * 0.88, 6 * s, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#c8c8d0'; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.moveTo(12 * s, -H * 0.5); ctx.lineTo(20 * s, -H * 0.95); ctx.stroke();
  }
  drawBeast(e, s) {
    const ctx = this.ctx; const body = e.color;
    ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, -12 * s, 14 * s, 7 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(13 * s, -16 * s, 6 * s, 0, Math.PI * 2); ctx.fill();
  }
  drawSmall(e, s) { const ctx = this.ctx; ctx.fillStyle = e.color; ctx.beginPath(); ctx.ellipse(0, -6 * s, 12 * s, 6 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(11 * s, -8 * s, 4 * s, 0, Math.PI * 2); ctx.fill(); }
  drawSpider(e, s) { const ctx = this.ctx; ctx.fillStyle = e.color; ctx.beginPath(); ctx.ellipse(-3 * s, -10 * s, 10 * s, 7 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = e.color; ctx.lineWidth = 2 * s; for (let i = 0; i < 4; i++) { const a = -0.6 + i * 0.4; ctx.beginPath(); ctx.moveTo(0, -8 * s); ctx.lineTo(Math.cos(a) * 16 * s, -2 * s + Math.sin(a) * 10 * s); ctx.moveTo(0, -8 * s); ctx.lineTo(-Math.cos(a) * 16 * s, -2 * s + Math.sin(a) * 10 * s); ctx.stroke(); } }

  drawFx() {
    const ctx = this.ctx;
    for (const f of this.fx.list) {
      if (f.t < 0) continue;
      const k = f.t / f.dur;
      if (f.type === 'text') {
        const [cx, cy] = this.toScreen(f.x, f.y);
        ctx.font = 'bold 15px "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.globalAlpha = 1 - k;
        ctx.fillStyle = '#000'; ctx.fillText(f.text, cx + f.off + 1, cy - 70 - k * 30 + 1);
        ctx.fillStyle = f.color; ctx.fillText(f.text, cx + f.off, cy - 70 - k * 30);
        ctx.globalAlpha = 1;
      } else if (f.type === 'burst') {
        const [cx, cy] = this.toScreen(f.x, f.y);
        ctx.strokeStyle = f.color; ctx.lineWidth = 3 * (1 - k); ctx.globalAlpha = 1 - k;
        ctx.beginPath(); ctx.ellipse(cx, cy - 14, f.radius * TW / 2 * k + 8, f.radius * TH / 2 * k + 4, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (f.type === 'explosion') {
        const [cx, cy] = this.toScreen(f.x, f.y);
        const r = f.radius * TW / 2 * Math.min(1, k * 2);
        const grad = ctx.createRadialGradient(cx, cy - 10, 0, cx, cy - 10, r);
        grad.addColorStop(0, f.color); grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = (1 - k) * 0.8; ctx.fillStyle = grad;
        ctx.beginPath(); ctx.ellipse(cx, cy - 10, r, r / 2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      } else if (f.type === 'particle') {
        const [cx, cy] = this.toScreen(f.x + f.vx * f.t, f.y + f.vy * f.t);
        ctx.globalAlpha = 1 - k; ctx.fillStyle = f.color; ctx.fillRect(cx - 2, cy - 20 - f.t * 40, 5, 5); ctx.globalAlpha = 1;
      } else if (f.type === 'proj') {
        const x = f.x0 + (f.x1 - f.x0) * k, y = f.y0 + (f.y1 - f.y0) * k;
        const [cx, cy] = this.toScreen(x, y);
        const wob = f.wob ? Math.sin(k * Math.PI) * f.wob * 20 : 0;
        if (f.style === 'arrow') {
          const arc = Math.sin(k * Math.PI) * 25;
          const [x0, y0] = this.toScreen(f.x0, f.y0), [x1, y1] = this.toScreen(f.x1, f.y1);
          const ang = Math.atan2(y1 - y0, x1 - x0);
          ctx.strokeStyle = '#d0c0a0'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(cx - Math.cos(ang) * 10, cy - 34 - arc - Math.sin(ang) * 10); ctx.lineTo(cx + Math.cos(ang) * 10, cy - 34 - arc + Math.sin(ang) * 10); ctx.stroke();
        } else {
          ctx.fillStyle = f.color; ctx.shadowColor = f.color; ctx.shadowBlur = 12;
          ctx.beginPath(); ctx.arc(cx + wob, cy - 34, f.style === 'missile' ? 4 : 6, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
        }
      } else if (f.type === 'cast') {
        const [cx, cy] = this.toScreen(f.x, f.y);
        ctx.strokeStyle = f.color; ctx.globalAlpha = 1 - k; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(cx, cy, 24 + k * 14, 12 + k * 7, 0, 0, Math.PI * 2); ctx.stroke();
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + this.time * 4; ctx.fillStyle = f.color; ctx.fillRect(cx + Math.cos(a) * 20 - 2, cy - 30 - k * 30 + Math.sin(a) * 8 - 2, 4, 4); }
        ctx.globalAlpha = 1;
      } else if (f.type === 'click') {
        const [cx, cy] = this.toScreen(f.x, f.y);
        ctx.strokeStyle = `rgba(120,255,140,${1 - k})`; ctx.lineWidth = 2;
        this.diamond(ctx, cx, cy, (TW - 14) * (1 - k * 0.5), (TH - 8) * (1 - k * 0.5)); ctx.stroke();
      }
    }
    const g = this.game;
    if (g.pendingSpell && this.mouse.x >= 0) {
      const [tx, ty] = this.toTile(this.mouse.x, this.mouse.y);
      const [cx, cy] = this.toScreen(tx + 0.5, ty + 0.5);
      const r = g.pendingSpell.area || 0.5;
      ctx.strokeStyle = g.pendingSpell.color; ctx.lineWidth = 2; ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.ellipse(cx, cy, r * TW / 2 + 10, r * TH / 2 + 5, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  drawHoverLabel() {
    const e = this.hover;
    if (!e || e.hp !== undefined) return;
    const ctx = this.ctx;
    const [cx, cy] = this.toScreen(e.x + 0.5 + ((e.w || 1) - 1) / 2, e.y + 0.5);
    const top = e._bounds ? e._bounds.y : cy - 40;
    ctx.font = 'bold 12px "Segoe UI", sans-serif'; ctx.textAlign = 'center';
    const label = e.name + (e.type === 'chest' && e.locked ? ' (locked)' : '');
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(cx - tw / 2 - 4, top - 20, tw + 8, 16);
    ctx.fillStyle = '#ffe080'; ctx.fillText(label, cx, top - 8);
  }

  drawMinimap() {
    const g = this.game; const a = g.area; const ctx = this.mctx;
    const W = this.minimap.width, H = this.minimap.height;
    ctx.fillStyle = '#0a0c10'; ctx.fillRect(0, 0, W, H);
    const scale = Math.min(W / (a.width + a.height), H / ((a.width + a.height) / 2));
    const ox = W / 2, oy = 4;
    const px = (x, y) => [ox + (x - y) * scale, oy + (x + y) * scale / 2];
    for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
      if (!g.isExplored(x, y)) continue;
      const t = TILE[a.tiles[y][x]] || TILE['.'];
      const [sx, sy] = px(x, y);
      ctx.fillStyle = t.walk ? (g.isVisible(x, y) ? '#6a7a5a' : '#3a4235') : (t.tree ? '#1e3a1e' : '#22242a');
      ctx.fillRect(sx - scale, sy - scale / 2, scale * 2, scale);
    }
    for (const e of a.entities) {
      if (e.hp === undefined) {
        if (e.type === 'transition' && g.isExplored(e.x, e.y)) { const [sx, sy] = px(e.x + 0.5, e.y + 0.5); ctx.fillStyle = '#ffe070'; ctx.fillRect(sx - 2, sy - 2, 4, 4); }
        continue;
      }
      if (e.dead || !g.isVisible(Math.floor(e.x), Math.floor(e.y))) continue;
      const [sx, sy] = px(e.x, e.y);
      ctx.fillStyle = e.kind === 'player' ? '#80ff80' : e.kind === 'henchman' ? '#80c0ff' : e.faction === 'hostile' ? '#ff5050' : '#ffd050';
      ctx.fillRect(sx - 2, sy - 2, 4, 4);
    }
  }
}
