// Builds the game's art from a flare-game checkout (https://github.com/flareteam/flare-game).
//
//   node tools/build-assets.mjs /path/to/flare-game [scale]
//
// Needs the playwright package (used only for its bundled Chromium canvas). Sprite sheets are
// scaled (default 0.5: Flare's 192x96 tiles become the game's 96x48), tiles the game uses are
// packed into one atlas, and JSON frame data is written next to the images under assets/.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const FLARE = path.resolve(process.argv[2] || '../flare-game');
const SCALE = parseFloat(process.argv[3] || '0.5');
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const MODS = path.join(FLARE, 'mods');

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

// ------------------------------------------------------------------ what to build
const FC = 'fantasycore', EC = 'empyrean_campaign';
const SPRITES = {
  antlion_small: `${FC}/animations/enemies/antlion_small.txt`,
  antlion: `${FC}/animations/enemies/antlion.txt`,
  fire_ant: `${FC}/animations/enemies/fire_ant.txt`,
  goblin: `${FC}/animations/enemies/goblin.txt`,
  goblin_elite: `${FC}/animations/enemies/goblin_elite.txt`,
  hobgoblin: `${EC}/animations/enemies/hobgoblin.txt`,
  hobgoblin_archer: `${EC}/animations/enemies/hobgoblin_archer.txt`,
  skeleton: `${FC}/animations/enemies/skeleton.txt`,
  skeleton_weak: `${FC}/animations/enemies/skeleton_weak.txt`,
  skeleton_mage: `${FC}/animations/enemies/skeleton_mage.txt`,
  zombie: `${FC}/animations/enemies/zombie.txt`,
  minotaur: `${FC}/animations/enemies/minotaur.txt`,
  knight: `${FC}/animations/npcs/knight.txt`,
  guild_man: `${FC}/animations/npcs/guild_man.txt`,
  peasant_man1: `${FC}/animations/npcs/peasant_man1.txt`,
  peasant_man2: `${FC}/animations/npcs/peasant_man2.txt`,
  peasant_woman1: `${FC}/animations/npcs/peasant_woman1.txt`,
  peasant_woman2: `${FC}/animations/npcs/peasant_woman2.txt`,
  wandering_trader: `${FC}/animations/npcs/wandering_trader.txt`,
};
const AVATAR_LAYERS = ['default_chest', 'default_legs', 'default_feet', 'default_hands', 'cloth_shirt', 'cloth_pants', 'leather_chest', 'leather_pants', 'leather_boots',
  'chain_cuirass', 'chain_greaves', 'plate_cuirass', 'plate_greaves', 'mage_vest', 'mage_skirt', 'mage_hood',
  'dagger', 'shortsword', 'longsword', 'hand_axe', 'battle_axe', 'greatsword', 'mace', 'staff', 'greatstaff', 'longbow', 'shortbow', 'buckler', 'kite_shield'];
for (const g of ['male', 'female']) {
  for (const l of AVATAR_LAYERS) SPRITES[`${g}/${l}`] = `${FC}/animations/avatar/${g}/${l}.txt`;
  SPRITES[`${g}/head`] = `${FC}/animations/avatar/${g}/${g === 'male' ? 'head_short' : 'head_long'}.txt`;
}

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const TILES = {
  // plain slabs for most cells; the cracked / mossy slabs are sprinkled in by the renderer
  floor_stone: ['dungeon', [16, 17, 18, 19, 36, 37, 38, 43]], floor_stone_detail: ['dungeon', [39, 40, 41, 42, 44, 45, 46, 47]],
  floor_tile: ['dungeon', range(32, 35)], wall_block: ['dungeon', [48]],
  floor_rug: ['dungeon', [61]],
  statue: ['dungeon', range(128, 131)], throne: ['dungeon', [132, 133]], altar: ['dungeon', [134, 135]], table: ['dungeon', [136, 137]],
  crate: ['dungeon', [146, 147, 160, 161, 162, 163]], lectern: ['dungeon', [148, 149]], brazier: ['dungeon', [167]],
  bones: ['dungeon', range(176, 183)], sarcophagus: ['dungeon', [199, 194]], bed: ['dungeon', [203]],
  door_a: ['dungeon', [208]], door_b: ['dungeon', [209]], stairs: ['dungeon', [284, 285]], floor_decal: ['dungeon', [264]],
  floor_grass: ['grassland', range(16, 31)], floor_grass_alt: ['grassland', range(32, 47)],
  floor_dirt: ['cave', range(16, 23)], floor_dirt_detail: ['cave', range(48, 51)], floor_mud: ['cave', range(24, 31)], floor_planks: ['cave', range(32, 35)],
  chest_closed: ['grassland', [297]], chest_open: ['grassland', [298]], sign: ['grassland', [138]],
  tree: ['grassland', [252, 253, 254, 255]], tree_pine: ['grassland', range(248, 251)], tree_pale: ['grassland', [242, 243]], tree_dead: ['grassland', range(244, 247)],
  bush: ['grassland', range(112, 117)], tuft: ['grassland', range(120, 127)], rock: ['grassland', range(128, 131)], spire: ['grassland', range(132, 135)],
  stump: ['grassland', [136, 137]], grave: ['grassland', [140, 141]], cross: ['grassland', [142, 143]], fence: ['grassland', range(104, 111)], campfire: ['grassland', [102]], logs: ['grassland', [100, 101]],
  // Flare draws its water one tile below the cliff tops (oy=-48); our rivers lie level with the ground
  water: ['water', range(176, 191), { oy: 48 }],
};
// Wall pieces by role, [dungeon ids, cave ids], the way Flare's own maps use them (see wallPieceRole in
// js/game/renderer.js). The two visible faces of a block are SE (+x) and SW (+y): a wall gets a tall piece with a lit
// face when the room is in front of it and a low black stub when the room is behind it, so walls never hide the floor
// of the room they enclose. The cave set has no low stubs; Flare uses tall black rock there.
const WALLS = {
  se: [[64, 68], [64, 68]], sw: [[65, 69], [65, 69]],                     // straight wall, lit SE / SW face toward the room
  se_low: [[80], [64, 68]], sw_low: [[81], [65, 69]],                       // same, but the low black piece that continues a low corner
  nw_low: [[82], [66, 70]], ne_low: [[83], [67, 71]],                       // room behind (NW / NE side): low black stubs
  nw_low_cap: [[70], [66, 70]], ne_low_cap: [[71], [67, 71]],               // first stub after a tall corner: paints the corner's face lit
  corner_nw: [[77], [72, 76]], corner_ne: [[78], [73, 77]], corner_sw: [[76], [75, 79]], corner_se: [[95], [74, 78]], // room corners
  tip_se: [[73], [80, 84]], tip_nw: [[91], [82, 86]], tip_ne: [[88], [83, 87]], tip_sw: [[90], [81, 85]], // convex tips of wall masses
  block_nw: [[75], [82, 86]], block_ne: [[72], [83, 87]], block_sw: [[74], [81, 85]],                    // parts of 2x2 blocks (with tip_se)
  back_y: [[66], [66, 70]], back_x: [[67], [67, 71]], back_corner: [[79], [74, 78]],                   // tall black: more wall behind
  thin_y: [[122], [64, 68]], thin_x: [[123], [65, 69]],                                                // floor on both sides: low rubble
  end_n: [[119], [81, 85]], end_e: [[120], [83, 87]], end_s: [[121], [80, 84]], end_w: [[118], [82, 86]], lone: [[110, 111], [80, 84]],
};
for (const [role, [d, c]] of Object.entries(WALLS)) { TILES['wall_' + role] = ['dungeon', d]; TILES['cave_wall_' + role] = ['cave', c]; }
if (process.env.DEBUG_TILES) {
  for (const id of range(16, 63)) TILES[`dbg_dungeon_${id}`] = ['dungeon', [id]];
  for (const id of range(200, 300)) TILES[`dbg_grass_${id}`] = ['grassland', [id]];
  for (const id of range(16, 60)) TILES[`dbg_cave_${id}`] = ['cave', [id]];
}

// ------------------------------------------------------------------ parsers
function parseAnim(file) {
  const txt = fs.readFileSync(file, 'utf8');
  const images = [];
  const anims = {};
  let cur = null;
  for (const raw of txt.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('image=')) { const [p, tag] = line.slice(6).split(','); images.push({ path: p.trim(), tag: tag ? tag.trim() : null }); continue; }
    const m = /^\[(\w+)\]$/.exec(line);
    if (m) { cur = { name: m[1], frames: 0, duration: 0, type: 'looped', rects: [] }; anims[m[1]] = cur; continue; }
    if (!cur) continue;
    const [k, v] = line.split('=');
    if (k === 'frames') cur.frames = parseInt(v, 10);
    else if (k === 'duration') cur.duration = parseInt(v, 10);
    else if (k === 'type') cur.type = v.trim();
    else if (k === 'frame') { const [i, d, x, y, w, h, ox, oy] = v.split(',').map(Number); (cur.rects[d] = cur.rects[d] || [])[i] = [x, y, w, h, ox, oy]; }
  }
  return { images, anims };
}

function parseTileset(file) {
  const txt = fs.readFileSync(file, 'utf8');
  const tiles = {}; let img = null; let section = 0;
  for (const raw of txt.split('\n')) {
    const line = raw.trim();
    if (line === '[tileset]') section++;
    if (line.startsWith('img=')) img = line.slice(4).trim();
    if (line.startsWith('tile=')) { const [id, x, y, w, h, ox, oy] = line.slice(5).split(',').map(Number); tiles[`${section}:${id}`] = { id, x, y, w, h, ox, oy, img, frames: null }; }
    if (line.startsWith('animation=')) {
      const [id, ...fr] = line.slice(10).split(';').filter(Boolean);
      const t = tiles[`${section}:${parseInt(id, 10)}`];
      if (t) t.frames = fr.map(f => { const [x, y, d] = f.split(','); return [Number(x), Number(y), parseInt(d, 10)]; });
    }
  }
  return tiles;
}

// ------------------------------------------------------------------ build
fs.mkdirSync(path.join(OUT, 'sprites'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'tiles'), { recursive: true });
const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const page = await browser.newPage();
const blank = path.join(OUT, '.blank.html');
fs.writeFileSync(blank, '<html><body></body></html>');
await page.goto('file://' + blank);
fs.unlinkSync(blank);
const save = (dataUrl, file) => fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
const r = (v) => Math.round(v);
let total = 0;

// sprites
for (const [name, def] of Object.entries(SPRITES)) {
  const file = path.join(MODS, def);
  if (!fs.existsSync(file)) { console.warn('missing', def); continue; }
  const { images, anims } = parseAnim(file);
  const mod = def.split('/')[0];
  const resolveImg = (p) => [mod, FC].map(m => path.join(MODS, m, p)).find(f => fs.existsSync(f));
  const imgFiles = images.map(im => ({ ...im, url: 'file://' + resolveImg(im.path) }));
  const res = await page.evaluate(async ({ imgFiles, scale }) => {
    const loaded = [];
    for (const im of imgFiles) { const img = new Image(); img.src = im.url; await img.decode(); loaded.push(img); }
    const w = Math.ceil(Math.max(...loaded.map(i => i.width)) * scale);
    const offsets = []; let y = 0;
    for (const img of loaded) { offsets.push(y); y += Math.ceil(img.height * scale); }
    const c = document.createElement('canvas'); c.width = w; c.height = y;
    const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high';
    loaded.forEach((img, i) => ctx.drawImage(img, 0, offsets[i], Math.ceil(img.width * scale), Math.ceil(img.height * scale)));
    return { data: c.toDataURL('image/webp', 0.9), offsets, w, h: y };
  }, { imgFiles, scale: SCALE });
  const out = { w: res.w, h: res.h, anims: {} };
  for (const [an, a] of Object.entries(anims)) {
    if (!a.rects.length) continue;
    const imgIdx = Math.max(0, images.findIndex(im => im.tag === an));
    const yOff = res.offsets[imgIdx];
    out.anims[an] = { frames: a.frames, duration: a.duration, type: a.type,
      rects: a.rects.map(dir => dir.map(([x, y, w, h, ox, oy]) => [r(x * SCALE), r(y * SCALE) + yOff, r(w * SCALE), r(h * SCALE), r(ox * SCALE), r(oy * SCALE)])) };
  }
  const outFile = path.join(OUT, 'sprites', name.replace('/', '_'));
  save(res.data, outFile + '.webp');
  fs.writeFileSync(outFile + '.json', JSON.stringify(out));
  const sz = fs.statSync(outFile + '.webp').size; total += sz;
  console.log(`sprite ${name}: ${res.w}x${res.h} ${(sz / 1024).toFixed(0)} KB, anims: ${Object.keys(out.anims).join(' ')}`);
}

// tiles: gather all rects, shelf-pack into one atlas
const defs = {
  dungeon: parseTileset(path.join(MODS, FC, 'tilesetdefs/tileset_dungeon.txt')),
  grassland: parseTileset(path.join(MODS, FC, 'tilesetdefs/tileset_grassland.txt')),
  water: parseTileset(path.join(MODS, FC, 'tilesetdefs/tileset_grassland.txt')),
  cave: parseTileset(path.join(MODS, FC, 'tilesetdefs/tileset_cave.txt')),
};
const entries = [];
for (const [name, [set, ids, opt = {}]] of Object.entries(TILES)) {
  const section = set === 'water' ? 2 : 1;
  for (const id of ids) {
    const t = defs[set][`${section}:${id}`];
    if (!t) { console.warn('missing tile', set, id); continue; }
    const frames = t.frames && t.frames.length > 1 ? t.frames : [[t.x, t.y, 0]];
    const ox = opt.ox ?? t.ox, oy = opt.oy ?? t.oy;
    entries.push({ name, id, img: 'file://' + path.join(MODS, FC, t.img), w: r(t.w * SCALE), h: r(t.h * SCALE), ox: r(ox * SCALE), oy: r(oy * SCALE), sw: t.w, sh: t.h,
      frames: frames.map(([x, y, d]) => ({ sx: x, sy: y, dur: d })) });
  }
}
// pack
const ATLAS_W = 2048; let px = 0, py = 0, rowH = 0;
const placed = [];
for (const e of entries.slice().sort((a, b) => b.h - a.h)) {
  for (const f of e.frames) {
    if (px + e.w > ATLAS_W) { px = 0; py += rowH; rowH = 0; }
    f.x = px; f.y = py; px += e.w; rowH = Math.max(rowH, e.h);
  }
  placed.push(e);
}
const atlasH = py + rowH;
const atlas = await page.evaluate(async ({ entries, atlasW, atlasH }) => {
  const imgs = {};
  for (const e of entries) if (!imgs[e.img]) { const im = new Image(); im.src = e.img; await im.decode(); imgs[e.img] = im; }
  const c = document.createElement('canvas'); c.width = atlasW; c.height = atlasH;
  const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high';
  for (const e of entries) for (const f of e.frames) ctx.drawImage(imgs[e.img], f.sx, f.sy, e.sw, e.sh, f.x, f.y, e.w, e.h);
  return c.toDataURL('image/webp', 0.92);
}, { entries: placed, atlasW: ATLAS_W, atlasH });
save(atlas, path.join(OUT, 'tiles', 'atlas.webp'));
const tilesJson = { atlas: 'atlas.webp', tiles: {} };
for (const e of entries) (tilesJson.tiles[e.name] = tilesJson.tiles[e.name] || []).push({ id: e.id, w: e.w, h: e.h, ox: e.ox, oy: e.oy, frames: e.frames.map(f => [f.x, f.y, f.dur]) });
fs.writeFileSync(path.join(OUT, 'tiles', 'tiles.json'), JSON.stringify(tilesJson));
const asz = fs.statSync(path.join(OUT, 'tiles', 'atlas.webp')).size; total += asz;
console.log(`atlas: ${ATLAS_W}x${atlasH} ${(asz / 1024).toFixed(0)} KB, ${entries.length} tiles`);

// license + credits
fs.copyFileSync(path.join(FLARE, 'LICENSE.txt'), path.join(OUT, 'LICENSE-flare-art.txt'));
fs.copyFileSync(path.join(FLARE, 'CREDITS.txt'), path.join(OUT, 'CREDITS-flare.txt'));
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ scale: SCALE, sprites: Object.keys(SPRITES).map(n => n.replace('/', '_')), tiles: 'tiles/tiles.json' }));
console.log(`total ${(total / 1024 / 1024).toFixed(1)} MB`);
await browser.close();
