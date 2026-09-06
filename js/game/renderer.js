import { TILE } from '../data/areas.js';
import { ITEMS } from '../data/items.js';
import * as E from './entity.js';

export const TW = 64, TH = 32;

const colorCache = new Map();
function shade(hex, f) {
  const key = hex + '|' + f.toFixed(2);
  let v = colorCache.get(key);
  if (v) return v;
  let r, g, b;
  if (hex[0] === '#') {
    r = parseInt(hex.slice(1, 3), 16); g = parseInt(hex.slice(3, 5), 16); b = parseInt(hex.slice(5, 7), 16);
  } else { r = g = b = 128; }
  r = Math.max(0, Math.min(255, Math.round(r * f))); g = Math.max(0, Math.min(255, Math.round(g * f))); b = Math.max(0, Math.min(255, Math.round(b * f)));
  v = `rgb(${r},${g},${b})`;
  colorCache.set(key, v);
  return v;
}

// ---------------------------------------------------------------- FX system
class FX {
  constructor() { this.list = []; this.markers = []; }
  clear() { this.list = []; this.markers = []; }
  update(dt) {
    for (const f of this.list) f.t += dt;
    this.list = this.list.filter(f => f.t < f.dur);
  }
  floatText(e, text, color) { this.list.push({ type: 'text', x: e.x, y: e.y, text, color, t: 0, dur: 1.2, off: Math.random() * 10 - 5 }); }
  burst(e, color, radius = 1) { this.list.push({ type: 'burst', x: e.x, y: e.y, color, radius, t: 0, dur: 0.6 }); }
  explosion(e, color, radius = 2) {
    this.list.push({ type: 'explosion', x: e.x, y: e.y, color, radius, t: 0, dur: 0.9 });
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2, s = 0.5 + Math.random() * radius;
      this.list.push({ type: 'particle', x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, color, t: 0, dur: 0.5 + Math.random() * 0.5 });
    }
  }
  projectile(from, to, color, style = 'bolt') { this.list.push({ type: 'proj', x0: from.x, y0: from.y, x1: to.x, y1: to.y, color, style, t: 0, dur: 0.3 }); }
  missiles(from, to, color, n) {
    for (let i = 0; i < n; i++) this.list.push({ type: 'proj', x0: from.x, y0: from.y, x1: to.x, y1: to.y, color, style: 'missile', t: -i * 0.08, dur: 0.35, wob: (i % 2 ? 1 : -1) * (0.3 + i * 0.1) });
  }
  cast(e, color) { this.list.push({ type: 'cast', x: e.x, y: e.y, color, t: 0, dur: 0.5 }); }
  lunge(a, b) {
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    a.lunge = { dx: (b.x - a.x) / d * 0.35, dy: (b.y - a.y) / d * 0.35, t: 0.25 };
  }
  clickMarker(tx, ty) { this.list.push({ type: 'click', x: tx + 0.5, y: ty + 0.5, t: 0, dur: 0.5 }); }
}

export class Renderer {
  constructor(canvas, minimap) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.minimap = minimap; this.mctx = minimap.getContext('2d');
    this.cam = { x: 0, y: 0 }; this.camTarget = { x: 0, y: 0 };
    this.fx = new FX();
    this.game = null; this.hover = null; this.mouse = { x: -1, y: -1 };
    this.time = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  resize() {
    this.canvas.width = window.innerWidth; this.canvas.height = window.innerHeight;
  }
  iso(x, y) { return [(x - y) * TW / 2, (x + y) * TH / 2]; }
  toScreen(x, y) { const [ix, iy] = this.iso(x, y); return [ix + this.cam.x, iy + this.cam.y]; }
  toTile(sx, sy) {
    const ix = sx - this.cam.x, iy = sy - this.cam.y;
    const x = (ix / (TW / 2) + iy / (TH / 2)) / 2, y = (iy / (TH / 2) - ix / (TW / 2)) / 2;
    return [Math.floor(x), Math.floor(y)];
  }
  snapCamera() {
    const p = this.game.player;
    const [ix, iy] = this.iso(p.x, p.y);
    this.cam.x = this.canvas.width / 2 - ix; this.cam.y = this.canvas.height / 2 - iy;
  }
  updateCamera(dt) {
    const p = this.game.player;
    const [ix, iy] = this.iso(p.x, p.y);
    const tx = this.canvas.width / 2 - ix, ty = this.canvas.height / 2 - iy;
    const k = Math.min(1, dt * 6);
    this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * k;
  }

  pick(sx, sy) {
    // returns entity under mouse (prefers creatures), or null
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
      const h = isCreature ? 34 * (e.size || 1) : 20;
      const w = isCreature ? 16 * (e.size || 1) + 6 : (e.w ? e.w * 20 : 22);
      const cy = py - h / 2;
      const dx = Math.abs(sx - px), dy = Math.abs(sy - cy);
      if (dx <= w && dy <= h / 2 + 4) {
        const d = dx + dy - (isCreature ? 8 : 0);
        if (d < bd) { bd = d; best = e; }
      }
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
    const W = this.canvas.width, H = this.canvas.height;
    // visible tile range: compute by scanning bounding box in tile space
    const corners = [this.toTile(0, 0), this.toTile(W, 0), this.toTile(0, H), this.toTile(W, H)];
    const minX = Math.max(0, Math.min(...corners.map(c => c[0])) - 2), maxX = Math.min(a.width - 1, Math.max(...corners.map(c => c[0])) + 2);
    const minY = Math.max(0, Math.min(...corners.map(c => c[1])) - 2), maxY = Math.min(a.height - 1, Math.max(...corners.map(c => c[1])) + 4);

    // floor pass
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      if (!g.isExplored(x, y)) continue;
      const ch = a.tiles[y][x]; const t = TILE[ch] || TILE['.'];
      const vis = g.isVisible(x, y);
      const dim = vis ? 1 : (a.outdoor ? 0.7 : 0.45);
      this.drawFloor(x, y, ch, t, dim);
    }
    // objects & creatures pass, depth sorted
    const items = [];
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      if (!g.isExplored(x, y)) continue;
      const ch = a.tiles[y][x]; const t = TILE[ch];
      if (!t) continue;
      if (t.height || t.tree || t.bush || t.pillar || t.grave || t.altar || t.crate || t.table || t.well || t.stump) items.push({ d: x + y, x, y, tile: t, ch });
    }
    for (const e of a.entities) {
      const isCreature = e.hp !== undefined;
      if (isCreature) {
        if (!g.isVisible(Math.floor(e.x), Math.floor(e.y)) && !e.dead) continue;
        if (e.dead && !g.isExplored(Math.floor(e.x), Math.floor(e.y))) continue;
        if (e.dead && (e.kind === 'monster' && g.time - (e.deathTime || 0) > 20)) continue;
        items.push({ d: e.x + e.y - 0.01, ent: e });
      } else {
        if (!g.isExplored(e.x, e.y)) continue;
        if (e.type === 'trap' && !e.found) continue;
        items.push({ d: e.x + e.y + ((e.w || 1) - 1) / 2 - 0.02, ent: e });
      }
    }
    items.sort((p, q) => p.d - q.d);
    const pl = g.player; const pd = pl.x + pl.y;
    for (const it of items) {
      if (it.tile) {
        const vis = g.isVisible(it.x, it.y);
        // walls standing between the camera and the player are drawn translucent
        const inFront = it.tile.height && it.x + it.y > pd + 0.5 && Math.abs(it.x - pl.x) < 4 && Math.abs(it.y - pl.y) < 4;
        if (inFront) this.ctx.globalAlpha = 0.35;
        this.drawObject(it.x, it.y, it.tile, it.ch, vis ? 1 : (a.outdoor ? 0.7 : 0.45));
        this.ctx.globalAlpha = 1;
      }
      else if (it.ent.hp !== undefined) this.drawCreature(it.ent, dt);
      else this.drawEntityObject(it.ent, g.isVisible(it.ent.x, it.ent.y) ? 1 : (a.outdoor ? 0.75 : 0.55));
    }
    this.drawFx();
    this.drawHoverLabel();
    this.drawMinimap();
  }

  diamond(ctx, cx, cy, w = TW, h = TH) {
    ctx.beginPath(); ctx.moveTo(cx, cy - h / 2); ctx.lineTo(cx + w / 2, cy); ctx.lineTo(cx, cy + h / 2); ctx.lineTo(cx - w / 2, cy); ctx.closePath();
  }

  drawFloor(x, y, ch, t, dim) {
    const ctx = this.ctx;
    const [cx, cy] = this.toScreen(x + 0.5, y + 0.5);
    let color = t.color;
    if (t.alt && ((x + y) & 1)) color = t.alt;
    if (t.water) { const w = Math.sin(this.time * 2 + x * 0.7 + y * 1.3) * 0.08 + 1; color = shade(t.color, w); }
    if (t.height) color = t.color; // base under walls
    ctx.fillStyle = shade(color, dim);
    this.diamond(ctx, cx, cy);
    ctx.fill();
    if (t.stairs) {
      ctx.strokeStyle = shade('#9a98a0', dim); ctx.lineWidth = 2;
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(cx - TW / 2 + 8 + (i + 2) * 5, cy + i * 3); ctx.lineTo(cx + TW / 2 - 8 - (2 - i) * 5, cy + i * 3); ctx.stroke(); }
    } else if (t.bones) {
      ctx.strokeStyle = shade('#d8d0c0', dim); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx - 10, cy - 3); ctx.lineTo(cx + 8, cy + 4); ctx.moveTo(cx - 6, cy + 6); ctx.lineTo(cx + 10, cy - 4); ctx.stroke();
      ctx.fillStyle = shade('#e8e0d0', dim); ctx.beginPath(); ctx.arc(cx + 2, cy - 2, 4, 0, Math.PI * 2); ctx.fill();
    } else if (t.door) {
      ctx.fillStyle = shade('#5a3a1a', dim); ctx.fillRect(cx - 10, cy - 24, 20, 24);
      ctx.fillStyle = shade('#c0a040', dim); ctx.fillRect(cx + 4, cy - 12, 3, 3);
    } else if (t.name === 'road' || t.name === 'grass' || t.name === 'mud') {
      if (t.name === 'grass' && ((x * 7 + y * 13) % 5 === 0)) {
        ctx.strokeStyle = shade('#6a9a4a', dim); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx - 6, cy + 2); ctx.lineTo(cx - 4, cy - 4); ctx.moveTo(cx + 4, cy + 3); ctx.lineTo(cx + 7, cy - 3); ctx.stroke();
      }
    }
  }

  drawObject(x, y, t, ch, dim) {
    const ctx = this.ctx;
    const [cx, cy] = this.toScreen(x + 0.5, y + 0.5);
    if (t.height) {
      const h = t.height * TH;
      // left face (W-S)
      ctx.fillStyle = shade(t.side, dim * 0.85);
      ctx.beginPath(); ctx.moveTo(cx - TW / 2, cy); ctx.lineTo(cx, cy + TH / 2); ctx.lineTo(cx, cy + TH / 2 - h); ctx.lineTo(cx - TW / 2, cy - h); ctx.closePath(); ctx.fill();
      // right face (S-E)
      ctx.fillStyle = shade(t.side, dim * 0.65);
      ctx.beginPath(); ctx.moveTo(cx, cy + TH / 2); ctx.lineTo(cx + TW / 2, cy); ctx.lineTo(cx + TW / 2, cy - h); ctx.lineTo(cx, cy + TH / 2 - h); ctx.closePath(); ctx.fill();
      // top
      ctx.fillStyle = shade(t.top, dim);
      this.diamond(ctx, cx, cy - h); ctx.fill();
      const ga = ctx.globalAlpha;
      ctx.strokeStyle = shade('#000000', 1); ctx.globalAlpha = 0.25 * dim * ga; ctx.lineWidth = 1;
      this.diamond(ctx, cx, cy - h); ctx.stroke(); ctx.globalAlpha = ga;
      return;
    }
    if (t.tree) {
      const sway = Math.sin(this.time * 1.5 + x * 0.9 + y * 0.4) * 1.5;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(cx, cy + 2, 14, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = shade('#5a3a1a', dim); ctx.fillRect(cx - 3, cy - 22, 6, 24);
      const g1 = (x * 31 + y * 17) % 3;
      const greens = ['#2e6a2a', '#357a30', '#2a5e28'];
      ctx.fillStyle = shade(greens[g1], dim);
      ctx.beginPath(); ctx.moveTo(cx + sway, cy - 62); ctx.lineTo(cx + 20 + sway * 0.5, cy - 24); ctx.lineTo(cx - 20 + sway * 0.5, cy - 24); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(greens[(g1 + 1) % 3], dim);
      ctx.beginPath(); ctx.moveTo(cx + sway, cy - 50); ctx.lineTo(cx + 16 + sway * 0.5, cy - 16); ctx.lineTo(cx - 16 + sway * 0.5, cy - 16); ctx.closePath(); ctx.fill();
      return;
    }
    if (t.bush) {
      ctx.fillStyle = shade('#3a7a34', dim);
      ctx.beginPath(); ctx.ellipse(cx, cy - 6, 14, 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = shade('#4a8a3e', dim);
      ctx.beginPath(); ctx.ellipse(cx - 5, cy - 10, 8, 7, 0, 0, Math.PI * 2); ctx.fill();
      return;
    }
    if (t.pillar) {
      ctx.fillStyle = shade('#6a6870', dim * 0.8); ctx.fillRect(cx - 8, cy - 48, 16, 48);
      ctx.fillStyle = shade('#8a8890', dim); ctx.fillRect(cx - 10, cy - 52, 20, 6); ctx.fillRect(cx - 10, cy - 4, 20, 6);
      return;
    }
    if (t.grave) {
      ctx.fillStyle = shade('#8a8890', dim); ctx.fillRect(cx - 6, cy - 18, 12, 18);
      ctx.beginPath(); ctx.arc(cx, cy - 18, 6, Math.PI, 0); ctx.fill();
      return;
    }
    if (t.altar) {
      ctx.fillStyle = shade('#3a3840', dim); ctx.fillRect(cx - 18, cy - 14, 36, 14);
      ctx.fillStyle = shade('#6a6070', dim); ctx.fillRect(cx - 20, cy - 18, 40, 6);
      ctx.fillStyle = shade('#c0a040', dim * (0.8 + Math.sin(this.time * 3) * 0.2)); ctx.fillRect(cx - 3, cy - 26, 6, 8);
      return;
    }
    if (t.crate) {
      ctx.fillStyle = shade('#7a5a30', dim); ctx.fillRect(cx - 12, cy - 18, 24, 18);
      ctx.strokeStyle = shade('#4a3a20', dim); ctx.lineWidth = 2; ctx.strokeRect(cx - 12, cy - 18, 24, 18);
      ctx.beginPath(); ctx.moveTo(cx - 12, cy - 18); ctx.lineTo(cx + 12, cy); ctx.stroke();
      return;
    }
    if (t.table) {
      ctx.fillStyle = shade('#5a3a1a', dim); ctx.fillRect(cx - 12, cy - 12, 3, 12); ctx.fillRect(cx + 9, cy - 12, 3, 12);
      ctx.fillStyle = shade('#8a6a3a', dim); ctx.beginPath(); ctx.ellipse(cx, cy - 14, 18, 8, 0, 0, Math.PI * 2); ctx.fill();
      return;
    }
    if (t.well) {
      ctx.fillStyle = shade('#6a6a70', dim); ctx.beginPath(); ctx.ellipse(cx, cy - 4, 16, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = shade('#1a2a4a', dim); ctx.beginPath(); ctx.ellipse(cx, cy - 6, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = shade('#5a3a1a', dim); ctx.fillRect(cx - 14, cy - 34, 3, 30); ctx.fillRect(cx + 11, cy - 34, 3, 30);
      ctx.fillStyle = shade('#7a2a2a', dim); ctx.beginPath(); ctx.moveTo(cx - 20, cy - 32); ctx.lineTo(cx, cy - 44); ctx.lineTo(cx + 20, cy - 32); ctx.closePath(); ctx.fill();
      return;
    }
    if (t.stump) {
      ctx.fillStyle = shade('#6a4a2a', dim); ctx.fillRect(cx - 7, cy - 10, 14, 10);
      ctx.fillStyle = shade('#a08050', dim); ctx.beginPath(); ctx.ellipse(cx, cy - 10, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
      return;
    }
  }

  drawEntityObject(e, dim) {
    const ctx = this.ctx;
    const g = this.game;
    const hovered = this.hover === e;
    if (e.type === 'transition') {
      for (let i = 0; i < (e.w || 1); i++) {
        const [cx, cy] = this.toScreen(e.x + i + 0.5, e.y + 0.5);
        const pulse = 0.5 + Math.sin(this.time * 3) * 0.2;
        ctx.strokeStyle = `rgba(255,230,120,${pulse * dim})`; ctx.lineWidth = 2;
        this.diamond(ctx, cx, cy, TW - 8, TH - 4); ctx.stroke();
        ctx.fillStyle = `rgba(255,230,120,${0.12 * dim})`; ctx.fill();
      }
      return;
    }
    const [cx, cy] = this.toScreen(e.x + 0.5, e.y + 0.5);
    if (e.type === 'chest') {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(cx, cy + 1, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = shade(e.opened ? '#5a4a30' : '#8a5a20', dim); ctx.fillRect(cx - 12, cy - 14, 24, 14);
      ctx.fillStyle = shade(e.opened ? '#4a3a20' : '#a06a28', dim); ctx.fillRect(cx - 13, cy - 20, 26, 7);
      ctx.fillStyle = shade(e.locked ? '#d0d0d0' : '#e0c040', dim); ctx.fillRect(cx - 2, cy - 14, 4, 5);
      if (hovered) this.outline(cx, cy - 10, 16, 12, '#ffe080');
      return;
    }
    if (e.type === 'loot') {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(cx, cy + 1, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = shade(e.corpse ? '#6a3a3a' : '#8a7a5a', dim);
      ctx.beginPath(); ctx.ellipse(cx, cy - 4, 12, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = shade('#e0c040', dim); ctx.beginPath(); ctx.arc(cx + 3, cy - 6, 3, 0, Math.PI * 2); ctx.fill();
      if (hovered) this.outline(cx, cy - 4, 14, 8, '#ffe080');
      return;
    }
    if (e.type === 'trap') {
      ctx.strokeStyle = e.disarmed ? `rgba(120,200,120,${dim})` : `rgba(255,80,80,${dim})`; ctx.lineWidth = 2;
      this.diamond(ctx, cx, cy, TW - 16, TH - 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - 8, cy - 4); ctx.lineTo(cx + 8, cy + 4); ctx.moveTo(cx - 8, cy + 4); ctx.lineTo(cx + 8, cy - 4); ctx.stroke();
      return;
    }
    if (e.type === 'door') {
      if (e.open) return;
      ctx.fillStyle = shade('#3a2a1a', dim); ctx.fillRect(cx - 14, cy - 50, 28, 50);
      ctx.fillStyle = shade('#6a4a2a', dim); ctx.fillRect(cx - 11, cy - 46, 22, 46);
      ctx.fillStyle = shade(e.locked ? '#b0b0c0' : '#c0a040', dim); ctx.fillRect(cx + 4, cy - 26, 4, 6);
      ctx.strokeStyle = shade('#8a3a9a', dim * (0.6 + Math.sin(this.time * 2) * 0.3)); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy - 34, 6, 0, Math.PI * 2); ctx.stroke();
      if (hovered) this.outline(cx, cy - 25, 16, 27, '#ffe080');
      return;
    }
    if (e.type === 'sign') {
      ctx.fillStyle = shade('#5a3a1a', dim); ctx.fillRect(cx - 2, cy - 24, 4, 24);
      ctx.fillStyle = shade('#a08050', dim); ctx.fillRect(cx - 12, cy - 30, 24, 10);
      if (hovered) this.outline(cx, cy - 16, 14, 16, '#ffe080');
      return;
    }
  }

  outline(cx, cy, hw, hh, color) {
    const ctx = this.ctx;
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.9;
    ctx.strokeRect(cx - hw - 2, cy - hh - 2, hw * 2 + 4, hh * 2 + 4);
    ctx.globalAlpha = 1;
  }

  drawCreature(e, dt) {
    const ctx = this.ctx;
    const g = this.game;
    let ox = 0, oy = 0;
    if (e.lunge) { e.lunge.t -= dt; if (e.lunge.t <= 0) e.lunge = null; else { const k = Math.sin(e.lunge.t / 0.25 * Math.PI); ox = e.lunge.dx * k; oy = e.lunge.dy * k; } }
    const [cx, cy] = this.toScreen(e.x + ox, e.y + oy);
    const s = e.size || 1;
    const isPlayer = e.kind === 'player';
    const targeted = g.player.target === e.uid;
    const hovered = this.hover === e;
    // selection ring
    if (targeted) { ctx.strokeStyle = 'rgba(255,60,60,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(cx, cy, 16 * s, 8 * s, 0, 0, Math.PI * 2); ctx.stroke(); }
    else if (isPlayer) { ctx.strokeStyle = 'rgba(120,255,140,0.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(cx, cy, 15, 7.5, 0, 0, Math.PI * 2); ctx.stroke(); }
    else if (e.kind === 'henchman') { ctx.strokeStyle = 'rgba(120,200,255,0.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(cx, cy, 15, 7.5, 0, 0, Math.PI * 2); ctx.stroke(); }
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(cx, cy, 12 * s, 6 * s, 0, 0, Math.PI * 2); ctx.fill();
    if (e.dead) { this.drawCorpse(e, cx, cy, s); return; }
    const bob = e.moving ? Math.abs(Math.sin(this.time * 12 + e.uid)) * 3 : 0;
    const held = e.effects.some(x => x.held);
    ctx.save();
    ctx.translate(cx, cy - bob);
    if (e.facing < 0) ctx.scale(-1, 1);
    if (e.shape === 'beast') this.drawBeast(e, s);
    else if (e.shape === 'small') this.drawSmall(e, s);
    else if (e.shape === 'spider') this.drawSpider(e, s);
    else this.drawHumanoid(e, s);
    ctx.restore();
    // effects glow
    if (e.effects.length) {
      const good = e.effects.some(x => !x.harmful && !x.held && !x.dot);
      const bad = e.effects.some(x => x.harmful || x.held || x.dot);
      if (good) { ctx.strokeStyle = 'rgba(160,200,255,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(cx, cy - 2, 14 * s, 6 * s, 0, 0, Math.PI * 2); ctx.stroke(); }
      if (bad) { ctx.strokeStyle = 'rgba(200,80,220,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(cx, cy - 1, 13 * s, 5 * s, 0, 0, Math.PI * 2); ctx.stroke(); }
    }
    if (held) { ctx.fillStyle = '#c0c0ff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('HELD', cx, cy - 44 * s); }
    // hp bar
    const maxHp = E.maxHp(e);
    if (e.kind !== 'npc' && (e.hp < maxHp || targeted || hovered || e.kind !== 'monster')) {
      const w = 28 * Math.max(0.8, s), h = 4;
      const y = cy - 40 * s - 4;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(cx - w / 2 - 1, y - 1, w + 2, h + 2);
      const f = Math.max(0, e.hp / maxHp);
      ctx.fillStyle = e.faction === 'hostile' ? '#d03030' : f > 0.5 ? '#40c040' : f > 0.25 ? '#e0c030' : '#e04030';
      ctx.fillRect(cx - w / 2, y, w * f, h);
    }
    if (hovered && !isPlayer) {
      ctx.font = 'bold 12px "Segoe UI", sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      const label = e.name;
      const tw = ctx.measureText(label).width;
      ctx.fillRect(cx - tw / 2 - 4, cy - 40 * s - 22, tw + 8, 16);
      ctx.fillStyle = e.faction === 'hostile' ? '#ff9090' : e.faction === 'party' ? '#a0e0ff' : '#ffe080';
      ctx.fillText(label, cx, cy - 40 * s - 10);
    }
  }

  drawCorpse(e, cx, cy, s) {
    const ctx = this.ctx;
    ctx.fillStyle = shade(e.color || '#888', 0.6);
    ctx.beginPath(); ctx.ellipse(cx, cy - 3, 14 * s, 6 * s, 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(120,20,20,0.5)'; ctx.beginPath(); ctx.ellipse(cx + 4, cy, 10 * s, 4 * s, 0, 0, Math.PI * 2); ctx.fill();
  }

  drawHumanoid(e, s) {
    const ctx = this.ctx;
    const body = e.color || '#888';
    const skin = e.creatureType === 'undead' ? (e.tid === 'zombie' ? '#7a9a6a' : '#e8e0d0') : e.creatureType === 'goblinoid' ? '#7aa050' : '#e0b090';
    const H = 34 * s;
    // legs
    ctx.strokeStyle = shade(body, 0.6); ctx.lineWidth = 4 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-4 * s, -H * 0.4); ctx.lineTo(-5 * s, -1); ctx.moveTo(4 * s, -H * 0.4); ctx.lineTo(5 * s, -1); ctx.stroke();
    // torso
    ctx.fillStyle = body;
    roundRect(ctx, -8 * s, -H * 0.78, 16 * s, H * 0.42, 4 * s); ctx.fill();
    if (e.armorLook || (e.equipment && e.equipment.armor && ITEMS[e.equipment.armor].ac >= 4)) {
      ctx.fillStyle = 'rgba(200,200,220,0.5)'; roundRect(ctx, -7 * s, -H * 0.76, 14 * s, H * 0.26, 3 * s); ctx.fill();
    }
    // arms
    ctx.strokeStyle = skin; ctx.lineWidth = 3 * s;
    ctx.beginPath(); ctx.moveTo(-8 * s, -H * 0.7); ctx.lineTo(-11 * s, -H * 0.45); ctx.moveTo(8 * s, -H * 0.7); ctx.lineTo(12 * s, -H * 0.5); ctx.stroke();
    // head
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(0, -H * 0.88, 6 * s, 0, Math.PI * 2); ctx.fill();
    if (e.kind === 'player' || e.kind === 'henchman' || e.kind === 'npc') {
      ctx.fillStyle = e.kind === 'player' ? shade(body, 0.5) : '#3a2a1a';
      ctx.beginPath(); ctx.arc(0, -H * 0.91, 6 * s, Math.PI, Math.PI * 2); ctx.fill();
    }
    if (e.tid === 'skeleton' || e.tid === 'skeleton_warrior') { ctx.fillStyle = '#222'; ctx.fillRect(1 * s, -H * 0.9, 2 * s, 2 * s); ctx.fillRect(4 * s, -H * 0.9, 2 * s, 2 * s); }
    if (e.tid && (e.tid.startsWith('cult') || e.tid === 'necromancer')) { ctx.fillStyle = shade(body, 0.7); ctx.beginPath(); ctx.moveTo(-8 * s, -H * 0.86); ctx.lineTo(0, -H * 1.02); ctx.lineTo(8 * s, -H * 0.86); ctx.closePath(); ctx.fill(); }
    // weapon
    const look = e.weaponLook || (e.equipment && e.equipment.weapon ? weaponLook(ITEMS[e.equipment.weapon]) : 'none');
    ctx.lineCap = 'round';
    if (look === 'blade' || look === 'axe' || look === 'mace' || look === 'club') {
      ctx.strokeStyle = look === 'club' ? '#7a5a3a' : '#c8c8d0'; ctx.lineWidth = 3 * s;
      ctx.beginPath(); ctx.moveTo(12 * s, -H * 0.5); ctx.lineTo(20 * s, -H * 0.95); ctx.stroke();
      if (look === 'axe') { ctx.fillStyle = '#a0a0a8'; ctx.beginPath(); ctx.moveTo(17 * s, -H * 0.85); ctx.lineTo(26 * s, -H * 0.9); ctx.lineTo(22 * s, -H * 0.7); ctx.closePath(); ctx.fill(); }
      if (look === 'mace') { ctx.fillStyle = '#a0a0a8'; ctx.beginPath(); ctx.arc(20 * s, -H * 0.95, 4 * s, 0, Math.PI * 2); ctx.fill(); }
    } else if (look === 'bow') {
      ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 2.5 * s;
      ctx.beginPath(); ctx.arc(14 * s, -H * 0.55, 12 * s, -Math.PI * 0.5, Math.PI * 0.5); ctx.stroke();
      ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(14 * s, -H * 0.55 - 12 * s); ctx.lineTo(14 * s, -H * 0.55 + 12 * s); ctx.stroke();
    } else if (look === 'staff') {
      ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 3 * s;
      ctx.beginPath(); ctx.moveTo(13 * s, 0); ctx.lineTo(13 * s, -H * 1.05); ctx.stroke();
      ctx.fillStyle = e.tid === 'necromancer' ? '#a040ff' : '#60c0ff'; ctx.beginPath(); ctx.arc(13 * s, -H * 1.05, 3 * s, 0, Math.PI * 2); ctx.fill();
    } else if (look === 'spear') {
      ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 2.5 * s;
      ctx.beginPath(); ctx.moveTo(13 * s, 0); ctx.lineTo(13 * s, -H * 1.15); ctx.stroke();
      ctx.fillStyle = '#c8c8d0'; ctx.beginPath(); ctx.moveTo(10 * s, -H * 1.12); ctx.lineTo(13 * s, -H * 1.3); ctx.lineTo(16 * s, -H * 1.12); ctx.closePath(); ctx.fill();
    }
    if (e.equipment && e.equipment.shield) {
      ctx.fillStyle = '#7a6a4a'; ctx.beginPath(); ctx.ellipse(-12 * s, -H * 0.5, 5 * s, 8 * s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#c0b090'; ctx.lineWidth = 1; ctx.stroke();
    }
  }

  drawBeast(e, s) {
    const ctx = this.ctx;
    const body = e.color;
    ctx.fillStyle = shade(body, 0.7); ctx.lineWidth = 3 * s; ctx.strokeStyle = shade(body, 0.7);
    ctx.beginPath(); ctx.moveTo(-8 * s, -6 * s); ctx.lineTo(-9 * s, 0); ctx.moveTo(8 * s, -6 * s); ctx.lineTo(9 * s, 0); ctx.moveTo(-4 * s, -6 * s); ctx.lineTo(-3 * s, 0); ctx.moveTo(4 * s, -6 * s); ctx.lineTo(5 * s, 0); ctx.stroke();
    ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, -12 * s, 14 * s, 7 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(13 * s, -16 * s, 6 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(10 * s, -20 * s); ctx.lineTo(12 * s, -26 * s); ctx.lineTo(14 * s, -20 * s); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = body; ctx.beginPath(); ctx.moveTo(-14 * s, -14 * s); ctx.lineTo(-20 * s, -20 * s); ctx.stroke();
    ctx.fillStyle = '#ffdd60'; ctx.beginPath(); ctx.arc(16 * s, -17 * s, 1.5 * s, 0, Math.PI * 2); ctx.fill();
  }

  drawSmall(e, s) {
    const ctx = this.ctx;
    ctx.fillStyle = e.color; ctx.beginPath(); ctx.ellipse(0, -6 * s, 12 * s, 6 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(11 * s, -8 * s, 4 * s, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#d0a0a0'; ctx.lineWidth = 1.5 * s; ctx.beginPath(); ctx.moveTo(-12 * s, -6 * s); ctx.quadraticCurveTo(-20 * s, -2 * s, -22 * s, -10 * s); ctx.stroke();
    ctx.fillStyle = '#ff4040'; ctx.beginPath(); ctx.arc(13 * s, -9 * s, 1 * s, 0, Math.PI * 2); ctx.fill();
  }

  drawSpider(e, s) {
    const ctx = this.ctx;
    ctx.strokeStyle = e.color; ctx.lineWidth = 2 * s;
    for (let i = 0; i < 4; i++) {
      const a = -0.6 + i * 0.4;
      ctx.beginPath(); ctx.moveTo(0, -8 * s); ctx.lineTo(Math.cos(a) * 16 * s, -8 * s + Math.sin(a) * 10 * s + 6 * s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -8 * s); ctx.lineTo(-Math.cos(a) * 16 * s, -8 * s + Math.sin(a) * 10 * s + 6 * s); ctx.stroke();
    }
    ctx.fillStyle = e.color; ctx.beginPath(); ctx.ellipse(-3 * s, -10 * s, 10 * s, 7 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(8 * s, -9 * s, 5 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff3030'; ctx.beginPath(); ctx.arc(10 * s, -11 * s, 1.2 * s, 0, Math.PI * 2); ctx.arc(7 * s, -12 * s, 1.2 * s, 0, Math.PI * 2); ctx.fill();
  }

  drawFx() {
    const ctx = this.ctx;
    for (const f of this.fx.list) {
      if (f.t < 0) continue;
      const k = f.t / f.dur;
      if (f.type === 'text') {
        const [cx, cy] = this.toScreen(f.x, f.y);
        ctx.font = 'bold 14px "Segoe UI", sans-serif'; ctx.textAlign = 'center';
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = '#000'; ctx.fillText(f.text, cx + f.off + 1, cy - 44 - k * 30 + 1);
        ctx.fillStyle = f.color; ctx.fillText(f.text, cx + f.off, cy - 44 - k * 30);
        ctx.globalAlpha = 1;
      } else if (f.type === 'burst') {
        const [cx, cy] = this.toScreen(f.x, f.y);
        ctx.strokeStyle = f.color; ctx.lineWidth = 3 * (1 - k); ctx.globalAlpha = 1 - k;
        ctx.beginPath(); ctx.ellipse(cx, cy - 10, f.radius * TW / 2 * k + 6, f.radius * TH / 2 * k + 3, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (f.type === 'explosion') {
        const [cx, cy] = this.toScreen(f.x, f.y);
        const r = f.radius * TW / 2 * Math.min(1, k * 2);
        const grad = ctx.createRadialGradient(cx, cy - 8, 0, cx, cy - 8, r);
        grad.addColorStop(0, f.color); grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = (1 - k) * 0.8; ctx.fillStyle = grad;
        ctx.beginPath(); ctx.ellipse(cx, cy - 8, r, r / 2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      } else if (f.type === 'particle') {
        const [cx, cy] = this.toScreen(f.x + f.vx * f.t, f.y + f.vy * f.t);
        ctx.globalAlpha = 1 - k; ctx.fillStyle = f.color;
        ctx.fillRect(cx - 2, cy - 14 - f.t * 30, 4, 4);
        ctx.globalAlpha = 1;
      } else if (f.type === 'proj') {
        const x = f.x0 + (f.x1 - f.x0) * k, y = f.y0 + (f.y1 - f.y0) * k;
        const [cx, cy] = this.toScreen(x, y);
        const wob = f.wob ? Math.sin(k * Math.PI) * f.wob * 20 : 0;
        const arc = f.style === 'arrow' ? Math.sin(k * Math.PI) * 20 : 0;
        if (f.style === 'arrow') {
          const [x0, y0] = this.toScreen(f.x0, f.y0), [x1, y1] = this.toScreen(f.x1, f.y1);
          const ang = Math.atan2(y1 - y0, x1 - x0);
          ctx.strokeStyle = '#d0c0a0'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(cx - Math.cos(ang) * 8, cy - 20 - arc - Math.sin(ang) * 8); ctx.lineTo(cx + Math.cos(ang) * 8, cy - 20 - arc + Math.sin(ang) * 8); ctx.stroke();
        } else {
          ctx.fillStyle = f.color; ctx.shadowColor = f.color; ctx.shadowBlur = 10;
          ctx.beginPath(); ctx.arc(cx + wob, cy - 20, f.style === 'missile' ? 3 : 5, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
        }
      } else if (f.type === 'cast') {
        const [cx, cy] = this.toScreen(f.x, f.y);
        ctx.strokeStyle = f.color; ctx.globalAlpha = 1 - k; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(cx, cy, 16 + k * 10, 8 + k * 5, 0, 0, Math.PI * 2); ctx.stroke();
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + this.time * 4; ctx.fillStyle = f.color; ctx.fillRect(cx + Math.cos(a) * 14 - 1.5, cy - 20 - k * 20 + Math.sin(a) * 6 - 1.5, 3, 3); }
        ctx.globalAlpha = 1;
      } else if (f.type === 'click') {
        const [cx, cy] = this.toScreen(f.x, f.y);
        ctx.strokeStyle = `rgba(120,255,140,${1 - k})`; ctx.lineWidth = 2;
        this.diamond(ctx, cx, cy, (TW - 10) * (1 - k * 0.5), (TH - 6) * (1 - k * 0.5)); ctx.stroke();
      }
    }
    // spell targeting cursor
    const g = this.game;
    if (g.pendingSpell && this.mouse.x >= 0) {
      const [tx, ty] = this.toTile(this.mouse.x, this.mouse.y);
      const [cx, cy] = this.toScreen(tx + 0.5, ty + 0.5);
      const r = g.pendingSpell.area || 0.5;
      ctx.strokeStyle = g.pendingSpell.color; ctx.lineWidth = 2; ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.ellipse(cx, cy, r * TW / 2 + 8, r * TH / 2 + 4, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  drawHoverLabel() {
    const e = this.hover;
    if (!e || e.hp !== undefined) return;
    const ctx = this.ctx;
    const [cx, cy] = this.toScreen(e.x + 0.5 + ((e.w || 1) - 1) / 2, e.y + 0.5);
    ctx.font = 'bold 12px "Segoe UI", sans-serif'; ctx.textAlign = 'center';
    const label = e.name + (e.type === 'chest' && e.locked ? ' (locked)' : '');
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(cx - tw / 2 - 4, cy - 42, tw + 8, 16);
    ctx.fillStyle = '#ffe080'; ctx.fillText(label, cx, cy - 30);
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

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

function weaponLook(w) {
  if (!w) return 'none';
  if (w.ranged) return 'bow';
  if (w.id.includes('axe')) return 'axe';
  if (w.id.includes('mace')) return 'mace';
  if (w.id.includes('staff')) return 'staff';
  return 'blade';
}
