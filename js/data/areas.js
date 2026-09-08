import { seededRandom } from '../core/dice.js';

// Tile legend
//  '.' grass  ',' road  '#' wall  'T' tree  '~' water  '=' wood floor  ':' stone floor  'X' rock
//  'p' pillar 'g' grave 'A' altar '*' bush  's' stairs 'c' crate  'r' rug  'b' bones  't' table  'd' door
export const TILE = {
  '.': { name: 'grass', walk: true, opaque: false, color: '#4d7a3a', alt: '#528240' },
  ',': { name: 'road', walk: true, opaque: false, color: '#8a7a5a', alt: '#93825f' },
  '#': { name: 'wall', walk: false, opaque: true, color: '#7a7268', top: '#5a544c', side: '#6a635a', height: 1.5 },
  'T': { name: 'tree', walk: false, opaque: true, color: '#4d7a3a', tree: true },
  '*': { name: 'bush', walk: false, opaque: false, color: '#4d7a3a', bush: true },
  '~': { name: 'water', walk: false, opaque: false, color: '#2c5e8a', alt: '#33689a', water: true },
  '=': { name: 'wood', walk: true, opaque: false, color: '#7a5a3a', alt: '#835f3e' },
  ':': { name: 'stone', walk: true, opaque: false, color: '#5c5a62', alt: '#63616a' },
  'X': { name: 'rock', walk: false, opaque: true, color: '#3a3840', top: '#2e2c33', side: '#3d3a44', height: 1.6 },
  'p': { name: 'pillar', walk: false, opaque: true, color: '#5c5a62', pillar: true },
  'g': { name: 'gravestone', walk: false, opaque: false, color: '#4d7a3a', grave: true },
  'A': { name: 'altar', walk: false, opaque: false, color: '#5c5a62', altar: true },
  's': { name: 'stairs', walk: true, opaque: false, color: '#4a4850', stairs: true },
  'c': { name: 'crate', walk: false, opaque: false, color: '#5c5a62', crate: true },
  'r': { name: 'rug', walk: true, opaque: false, color: '#8a2a2a', alt: '#7a2626' },
  'b': { name: 'bones', walk: true, opaque: false, color: '#5c5a62', bones: true },
  't': { name: 'table', walk: false, opaque: false, color: '#7a5a3a', table: true },
  'd': { name: 'door', walk: true, opaque: false, color: '#8a6a3a', door: true },
  'm': { name: 'mud', walk: true, opaque: false, color: '#5a4a34', alt: '#614f38' },
  'S': { name: 'stump', walk: false, opaque: false, color: '#4d7a3a', stump: true },
  'W': { name: 'well', walk: false, opaque: false, color: '#8a7a5a', well: true },
  'K': { name: 'sarcophagus', walk: false, opaque: false, color: '#5c5a62', altar: true, sarcophagus: true },
};

class MapBuilder {
  constructor(w, h, fill) {
    this.w = w; this.h = h;
    this.rows = [];
    for (let y = 0; y < h; y++) this.rows.push(new Array(w).fill(fill));
  }
  get(x, y) { return (x < 0 || y < 0 || x >= this.w || y >= this.h) ? '#' : this.rows[y][x]; }
  set(x, y, c) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.rows[y][x] = c; return this; }
  rect(x, y, w, h, c) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c); return this; }
  box(x, y, w, h, c) {
    for (let i = x; i < x + w; i++) { this.set(i, y, c); this.set(i, y + h - 1, c); }
    for (let j = y; j < y + h; j++) { this.set(x, j, c); this.set(x + w - 1, j, c); }
    return this;
  }
  hline(x0, x1, y, c) { for (let i = Math.min(x0, x1); i <= Math.max(x0, x1); i++) this.set(i, y, c); return this; }
  vline(x, y0, y1, c) { for (let j = Math.min(y0, y1); j <= Math.max(y0, y1); j++) this.set(x, j, c); return this; }
  path(points, c, width = 1) {
    for (let k = 0; k < points.length - 1; k++) {
      const [x0, y0] = points[k], [x1, y1] = points[k + 1];
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let s = 0; s <= steps; s++) {
        const x = Math.round(x0 + (x1 - x0) * s / steps), y = Math.round(y0 + (y1 - y0) * s / steps);
        for (let dx = 0; dx < width; dx++) for (let dy = 0; dy < width; dy++) this.set(x + dx, y + dy, c);
      }
    }
    return this;
  }
  circle(cx, cy, r, c) {
    for (let j = Math.floor(cy - r); j <= Math.ceil(cy + r); j++) for (let i = Math.floor(cx - r); i <= Math.ceil(cx + r); i++) {
      if ((i - cx) ** 2 + (j - cy) ** 2 <= r * r) this.set(i, j, c);
    }
    return this;
  }
  scatter(c, count, rng, allowed, avoid = []) {
    let placed = 0, tries = 0;
    while (placed < count && tries < count * 40) {
      tries++;
      const x = Math.floor(rng() * this.w), y = Math.floor(rng() * this.h);
      if (!allowed.includes(this.get(x, y))) continue;
      if (avoid.some(([ax, ay, aw, ah]) => x >= ax && x < ax + aw && y >= ay && y < ay + ah)) continue;
      this.set(x, y, c); placed++;
    }
    return this;
  }
  build() { return this.rows.map(r => r.join('')); }
}

// ---------------------------------------------------------------- TOWN
function buildTown() {
  const W = 42, H = 32;
  const b = new MapBuilder(W, H, '.');
  const rng = seededRandom(1234);
  b.box(0, 0, W, H, 'T');
  b.box(1, 1, W - 2, H - 2, '*');
  // roads
  b.rect(19, 9, 3, 23, ',');           // main street to the south gate
  b.rect(4, 11, 34, 2, ',');           // high street east-west
  b.rect(19, 15, 3, 1, ',');
  // Tavern (top-left)
  b.rect(4, 3, 9, 7, '#'); b.set(8, 9, 'd');
  // Temple (top-center)
  b.rect(16, 2, 9, 7, '#'); b.set(20, 8, 'd'); b.rect(15, 9, 11, 1, ':'); b.set(20, 9, ':');
  // Shop (top-right)
  b.rect(28, 3, 9, 7, '#'); b.set(32, 9, 'd');
  // Mara's cottage (bottom-left)
  b.rect(5, 17, 6, 5, '#'); b.set(8, 21, 'd'); b.rect(8, 22, 1, 1, ',');
  // Barracks (bottom-right)
  b.rect(29, 16, 8, 6, '#'); b.set(30, 21, 'd'); b.rect(26, 22, 5, 1, ',').rect(26, 21, 3, 1, ',').rect(26, 18, 2, 3, ',');   // the lane ends under the doorway; the corner tile (29,21) stays
  // Pond
  b.circle(9.5, 27, 3.2, '~');
  // Well in the square
  b.rect(17, 14, 7, 5, ',');
  b.set(20, 16, 'W');
  // Gate to south
  b.set(19, 31, ','); b.set(20, 31, ','); b.set(21, 31, ',');
  b.set(18, 31, '#'); b.set(22, 31, '#'); b.set(18, 30, '#'); b.set(22, 30, '#');
  b.scatter('T', 26, rng, ['.'], [[3, 2, 36, 12], [15, 13, 12, 8], [4, 16, 8, 8], [25, 15, 13, 10], [16, 26, 9, 6]]);
  b.scatter('*', 10, rng, ['.'], [[3, 2, 36, 12], [15, 13, 12, 8]]);
  b.scatter('S', 4, rng, ['.'], [[3, 2, 36, 12]]);
  return {
    id: 'town', name: 'Bramblewick', outdoor: true, width: W, height: H, tiles: b.build(), start: [20, 10],
    ambient: '#000000',
    entities: [
      { type: 'npc', id: 'captain', name: 'Captain Harlan', x: 23, y: 14, dialogue: 'captain', sprite: 'knight', color: '#3a5a9a', shape: 'humanoid', weapon: 'blade', armor: true },
      { type: 'npc', id: 'priest', name: 'Father Aldric', x: 18, y: 9, dialogue: 'priest', sprite: 'guild_man', color: '#e8e0c0', shape: 'humanoid', weapon: 'staff' },
      { type: 'npc', id: 'merchant', name: 'Ysolde the Trader', x: 33, y: 10, dialogue: 'merchant', sprite: 'peasant_woman1', color: '#9a6a2a', shape: 'humanoid' },
      { type: 'npc', id: 'mara', name: 'Mara', x: 9, y: 22, dialogue: 'mara', sprite: 'peasant_woman2', color: '#6a6a8a', shape: 'humanoid' },
      { type: 'npc', id: 'guard1', name: 'Town Guard', x: 18, y: 29, dialogue: 'guard', sprite: 'knight', color: '#4a5a8a', shape: 'humanoid', weapon: 'spear', armor: true },
      { type: 'npc', id: 'guard2', name: 'Town Guard', x: 22, y: 29, dialogue: 'guard', sprite: 'knight', color: '#4a5a8a', shape: 'humanoid', weapon: 'spear', armor: true },
      { type: 'npc', id: 'villager1', name: 'Villager', x: 12, y: 13, dialogue: 'villager', sprite: 'peasant_man1', color: '#8a7a6a', shape: 'humanoid' },
      { type: 'npc', id: 'villager2', name: 'Old Fisherman', x: 13, y: 26, dialogue: 'fisherman', sprite: 'peasant_man2', color: '#6a7a8a', shape: 'humanoid' },
      { type: 'transition', x: 8, y: 9, to: 'tavern', tx: 9, ty: 10, label: 'The Rusty Tankard' },
      { type: 'transition', x: 19, y: 31, w: 3, to: 'forest', tx: 24, ty: 1, label: 'To the Whispering Woods' },
      { type: 'sign', x: 30, y: 10, label: "Ysolde's Goods - Weapons, Armor, Sundries" },
      { type: 'chest', x: 36, y: 28, loot: { gold: 12, items: ['torch', 'torch'] } },
    ],
  };
}

// ---------------------------------------------------------------- TAVERN
function buildTavern() {
  const W = 20, H = 13;
  const b = new MapBuilder(W, H, '=');
  b.box(0, 0, W, H, '#');
  b.rect(2, 2, 6, 1, 'c'); b.set(2, 3, 'c'); // bar
  b.rect(3, 4, 4, 1, 'r');
  b.set(11, 4, 't'); b.set(15, 4, 't'); b.set(11, 8, 't'); b.set(15, 8, 't');
  b.set(17, 10, 's'); b.set(18, 10, 's');
  b.set(9, 12, 'd');
  b.set(1, 10, 'c'); b.set(1, 11, 'c'); b.set(2, 11, 'c');
  return {
    id: 'tavern', name: 'The Rusty Tankard', outdoor: false, width: W, height: H, tiles: b.build(), start: [9, 10],
    entities: [
      { type: 'npc', id: 'bram', name: 'Bram the Innkeeper', x: 4, y: 3, dialogue: 'bram', sprite: 'wandering_trader', color: '#a05a3a', shape: 'humanoid' },
      { type: 'npc', id: 'tomas', name: 'Tomas', x: 12, y: 5, dialogue: 'tomas', avatar: { gender: 'male', chest: 'leather_chest', legs: 'leather_pants', feet: 'leather_boots', main: 'longbow' }, color: '#3a6a3a', shape: 'humanoid', weapon: 'bow', henchman: true },
      { type: 'npc', id: 'drunk', name: 'Drunk Patron', x: 16, y: 9, dialogue: 'drunk', sprite: 'peasant_man2', color: '#8a6a5a', shape: 'humanoid' },
      { type: 'transition', x: 9, y: 12, to: 'town', tx: 8, ty: 10, label: 'Leave the tavern' },
      { type: 'transition', x: 18, y: 10, to: 'cellar', tx: 2, ty: 2, label: 'Down to the cellar' },
    ],
  };
}

// ---------------------------------------------------------------- CELLAR
function buildCellar() {
  const W = 18, H = 14;
  const b = new MapBuilder(W, H, 'X');
  b.rect(1, 1, 8, 5, ':'); b.rect(8, 3, 4, 2, ':'); b.rect(11, 1, 6, 6, ':');
  b.rect(3, 6, 2, 3, ':'); b.rect(1, 8, 16, 5, ':');
  b.set(1, 1, 's');
  b.set(7, 1, 'c'); b.set(8, 1, 'c'); b.set(2, 12, 'c'); b.set(3, 12, 'c'); b.set(16, 12, 'c'); b.set(16, 11, 'c');
  b.set(13, 2, 'b'); b.set(9, 10, 'b');
  return {
    id: 'cellar', name: 'Tavern Cellar', outdoor: false, width: W, height: H, tiles: b.build(), start: [2, 2],
    entities: [
      { type: 'transition', x: 1, y: 1, to: 'tavern', tx: 17, ty: 9, label: 'Up to the tavern' },
      { type: 'monster', tid: 'giant_rat', x: 6, y: 3 },
      { type: 'monster', tid: 'giant_rat', x: 14, y: 3 },
      { type: 'monster', tid: 'giant_rat', x: 4, y: 10 },
      { type: 'monster', tid: 'giant_rat', x: 10, y: 11 },
      { type: 'monster', tid: 'dire_rat', x: 14, y: 10, name: 'Rat Matriarch' },
      { type: 'chest', x: 15, y: 9, loot: { gold: 18, items: ['potion_cure_light', 'dagger'] } },
    ],
  };
}

// ---------------------------------------------------------------- FOREST
function buildForest() {
  const W = 50, H = 44;
  const b = new MapBuilder(W, H, '.');
  const rng = seededRandom(777);
  b.box(0, 0, W, H, 'T');
  b.box(1, 1, W - 2, H - 2, 'T');
  // road: north entrance winding south
  b.path([[24, 1], [24, 8], [20, 14], [21, 22], [26, 28], [24, 34], [24, 42]], ',', 2);
  b.set(24, 0, ','); b.set(25, 0, ',');
  b.set(24, 43, ','); b.set(25, 43, ',');
  // goblin camp (east) with wooden palisade
  b.rect(33, 22, 13, 12, 'm');
  b.box(33, 22, 13, 12, '#'); b.rect(33, 27, 1, 3, 'm'); // opening on the west
  b.set(38, 27, 'c'); b.set(42, 25, 'c'); b.set(42, 26, 'c'); b.set(36, 31, 't');
  // path from road to camp
  b.path([[27, 28], [33, 28]], 'm', 2);
  // river across the south-west with a bridge
  b.path([[1, 30], [10, 32], [16, 36], [22, 42]], '~', 2);
  b.set(11, 32, '='); b.set(11, 33, '='); b.set(12, 32, '='); b.set(12, 33, '=');
  // wolf den (west) clearing
  b.circle(9, 14, 5, '.'); b.rect(3, 9, 12, 10, '.');
  // ogre cave (south-west beyond river)
  b.rect(2, 34, 9, 8, 'X'); b.rect(4, 36, 5, 5, ':'); b.set(8, 38, ':'); b.set(9, 38, ':'); b.set(10, 38, ':');
  // ruined shrine (north-east)
  b.rect(36, 5, 8, 6, ':'); b.set(36, 5, 'p'); b.set(43, 5, 'p'); b.set(36, 10, 'p'); b.set(43, 10, 'p'); b.set(39, 7, 'A');
  b.scatter('T', 380, rng, ['.'], [[20, 0, 8, 44], [3, 9, 12, 10], [27, 26, 8, 5], [33, 21, 14, 14], [35, 4, 10, 8], [1, 33, 12, 10], [10, 30, 5, 5]]);
  b.scatter('*', 40, rng, ['.'], [[20, 0, 8, 44]]);
  b.scatter('S', 8, rng, ['.'], []);
  // trails drawn after scattering so they stay clear
  b.path([[26, 8], [31, 7], [36, 8]], 'm', 1);                 // trail to the ruined shrine
  b.path([[22, 12], [16, 12], [12, 14]], 'm', 1);               // trail to the wolf den
  b.path([[23, 30], [17, 31], [14, 31]], 'm', 1);               // trail to the river crossing
  b.vline(13, 31, 32, 'm'); b.rect(13, 33, 2, 3, '='); b.vline(13, 36, 37, 'm'); b.path([[13, 37], [11, 38]], 'm', 1);
  return {
    id: 'forest', name: 'Whispering Woods', outdoor: true, width: W, height: H, tiles: b.build(), start: [24, 1],
    entities: [
      { type: 'transition', x: 24, y: 0, w: 2, to: 'town', tx: 20, ty: 29, label: 'Back to Bramblewick' },
      { type: 'transition', x: 24, y: 43, w: 2, to: 'crypt', tx: 20, ty: 1, label: 'The Sunken Crypt' },
      { type: 'sign', x: 26, y: 3, label: 'Bramblewick north. Beware: goblins east, wolves west.' },
      // bandits on the road
      { type: 'monster', tid: 'bandit', x: 19, y: 15 },
      { type: 'monster', tid: 'bandit', x: 21, y: 19, name: 'Bandit Leader' },
      // wolves
      { type: 'monster', tid: 'wolf', x: 8, y: 12 }, { type: 'monster', tid: 'wolf', x: 11, y: 15 }, { type: 'monster', tid: 'wolf', x: 6, y: 16 },
      { type: 'monster', tid: 'dire_wolf', x: 5, y: 13, name: 'Old Greymane' },
      { type: 'chest', x: 4, y: 10, loot: { gold: 25, items: ['silver_locket', 'potion_cure_light'] } },
      // shrine
      { type: 'monster', tid: 'giant_spider', x: 38, y: 8 }, { type: 'monster', tid: 'giant_spider', x: 41, y: 9 },
      { type: 'chest', x: 42, y: 6, loot: { gold: 60, items: ['ring_protection_1', 'potion_cure_moderate'] }, locked: 18 },
      // goblin camp
      { type: 'monster', tid: 'goblin', x: 30, y: 27 }, { type: 'monster', tid: 'goblin', x: 31, y: 29 },
      { type: 'monster', tid: 'goblin', x: 36, y: 25 }, { type: 'monster', tid: 'goblin', x: 36, y: 30 },
      { type: 'monster', tid: 'goblin_archer', x: 39, y: 24 }, { type: 'monster', tid: 'goblin_archer', x: 40, y: 31 },
      { type: 'monster', tid: 'hobgoblin', x: 41, y: 28 }, { type: 'monster', tid: 'hobgoblin', x: 43, y: 30 },
      { type: 'monster', tid: 'goblin_shaman', x: 43, y: 27 },
      { type: 'monster', tid: 'goblin_chief', x: 44, y: 28 },
      { type: 'chest', x: 44, y: 24, loot: { gold: 45, items: ['potion_cure_moderate', 'gem_ruby', 'studded_leather_1'] } },
      // ogre cave
      { type: 'monster', tid: 'ogre', x: 6, y: 38, name: 'Grolm the Minotaur' },
      { type: 'chest', x: 4, y: 36, loot: { gold: 80, items: ['longsword_1', 'potion_cure_serious', 'gem_sapphire'] } },
      // stragglers
      { type: 'monster', tid: 'goblin', x: 28, y: 36 }, { type: 'monster', tid: 'goblin', x: 20, y: 38 },
      { type: 'monster', tid: 'wolf', x: 16, y: 26 },
    ],
  };
}

// ---------------------------------------------------------------- CRYPT
function buildCrypt() {
  const W = 44, H = 40;
  const b = new MapBuilder(W, H, 'X');
  // Entry stairs & hall
  b.rect(19, 1, 3, 4, ':'); b.set(20, 0, 's'); b.set(20, 1, 's');
  b.rect(15, 5, 11, 7, ':');                     // entry hall
  b.set(16, 6, 'p'); b.set(24, 6, 'p'); b.set(16, 10, 'p'); b.set(24, 10, 'p');
  b.set(20, 8, 'b');
  // west wing: corridor to skeleton barracks
  b.rect(6, 8, 9, 2, ':');                         // corridor west
  b.rect(3, 4, 8, 9, ':'); b.rect(3, 4, 8, 9, ':'); // barracks room
  b.rect(3, 4, 8, 1, 'X'); b.rect(3, 4, 8, 9, ':');
  b.set(5, 6, 'b'); b.set(8, 11, 'b'); b.set(4, 11, 'c'); b.set(4, 12, 'c');
  // west wing south: trap corridor down to the tomb of the knight
  b.rect(6, 13, 2, 9, ':');
  b.rect(3, 22, 10, 7, ':'); b.set(7, 25, 'K'); b.set(4, 23, 'p'); b.set(11, 23, 'p'); b.set(4, 27, 'p'); b.set(11, 27, 'p');
  // east wing: corridor to zombie pit
  b.rect(26, 8, 9, 2, ':');
  b.rect(33, 4, 8, 9, ':'); b.set(36, 6, 'b'); b.set(38, 10, 'b'); b.set(39, 5, 'c');
  b.rect(36, 13, 2, 8, ':');                       // corridor south to ghoul den
  b.rect(31, 21, 10, 7, ':'); b.set(33, 23, 'b'); b.set(38, 26, 'b'); b.set(35, 24, 'b');
  // central corridor south from hall
  b.rect(19, 12, 3, 8, ':');
  // cult shrine (center)
  b.rect(13, 20, 15, 9, ':');
  b.set(14, 21, 'p'); b.set(26, 21, 'p'); b.set(14, 27, 'p'); b.set(26, 27, 'p');
  b.rect(19, 22, 3, 5, 'r'); b.set(20, 24, 'A');
  // connections to wings
  b.rect(12, 24, 1, 2, ':'); b.rect(28, 24, 3, 2, ':');
  // prisoner cell (off the shrine, east)
  b.rect(28, 30, 5, 4, ':'); b.rect(27, 29, 1, 1, ':'); b.set(28, 29, ':'); b.set(27, 28, ':');
  b.set(30, 31, 'b');
  // corridor from shrine south to sanctum door
  b.rect(19, 29, 3, 5, ':'); b.set(19, 33, 'X'); b.set(21, 33, 'X');
  // sanctum
  b.rect(12, 34, 16, 5, ':'); b.set(13, 35, 'p'); b.set(27, 35, 'p'); b.set(13, 38, 'p'); b.set(27, 38, 'p');
  b.set(20, 37, 'A'); b.set(16, 36, 'b'); b.set(24, 36, 'b'); b.set(18, 38, 'b');
  // treasure alcove
  b.rect(8, 35, 4, 3, ':'); b.set(9, 36, 'c');
  return {
    id: 'crypt', name: 'The Sunken Crypt', outdoor: false, width: W, height: H, tiles: b.build(), start: [20, 2],
    entities: [
      { type: 'transition', x: 20, y: 0, to: 'forest', tx: 24, ty: 41, label: 'Climb out to the woods' },
      { type: 'sign', x: 22, y: 5, label: 'The dead keep their own counsel. Turn back.' },
      // entry hall
      { type: 'monster', tid: 'skeleton', x: 17, y: 7 }, { type: 'monster', tid: 'skeleton', x: 23, y: 9 },
      { type: 'monster', tid: 'zombie', x: 20, y: 11 },
      // west barracks
      { type: 'monster', tid: 'skeleton', x: 5, y: 7 }, { type: 'monster', tid: 'skeleton', x: 8, y: 6 },
      { type: 'monster', tid: 'skeleton', x: 6, y: 10 }, { type: 'monster', tid: 'skeleton_warrior', x: 9, y: 9, name: 'Skeletal Captain' },
      { type: 'chest', x: 4, y: 5, loot: { gold: 35, items: ['potion_cure_moderate', 'chainmail'] } },
      // trap corridor
      { type: 'trap', x: 6, y: 16, dc: 14, disarmDc: 16, damage: '3d6', name: 'Spike Trap' },
      { type: 'trap', x: 7, y: 19, dc: 16, disarmDc: 18, damage: '4d6', name: 'Fire Trap', damageType: 'fire' },
      // knight's tomb
      { type: 'monster', tid: 'wight', x: 7, y: 24, name: 'Sir Aldous the Fallen' },
      { type: 'monster', tid: 'skeleton_warrior', x: 5, y: 26 }, { type: 'monster', tid: 'skeleton_warrior', x: 10, y: 26 },
      { type: 'chest', x: 7, y: 27, loot: { gold: 120, items: ['dawnblade', 'large_shield_1', 'potion_cure_serious'] }, locked: 22, trap: { dc: 15, disarmDc: 18, damage: '4d6', name: 'Needle Trap' } },
      // east zombie pit
      { type: 'monster', tid: 'zombie', x: 35, y: 6 }, { type: 'monster', tid: 'zombie', x: 38, y: 8 },
      { type: 'monster', tid: 'zombie', x: 36, y: 11 }, { type: 'monster', tid: 'zombie', x: 39, y: 11 },
      { type: 'chest', x: 40, y: 5, loot: { gold: 30, items: ['potion_cure_light', 'potion_cure_light', 'amulet_natural_armor'] } },
      { type: 'trap', x: 37, y: 17, dc: 15, disarmDc: 17, damage: '3d6', name: 'Dart Trap' },
      // ghoul den
      { type: 'monster', tid: 'ghoul', x: 33, y: 24 }, { type: 'monster', tid: 'ghoul', x: 38, y: 23 }, { type: 'monster', tid: 'ghoul', x: 36, y: 26 },
      { type: 'chest', x: 40, y: 22, loot: { gold: 50, items: ['potion_bulls_strength', 'gem_ruby', 'boots_of_striding'] } },
      // central corridor
      { type: 'monster', tid: 'cultist', x: 20, y: 15 }, { type: 'monster', tid: 'cultist', x: 20, y: 18 },
      // shrine
      { type: 'monster', tid: 'cultist', x: 16, y: 23 }, { type: 'monster', tid: 'cultist', x: 24, y: 26 },
      { type: 'monster', tid: 'cult_acolyte', x: 17, y: 26 }, { type: 'monster', tid: 'cult_acolyte', x: 23, y: 22 },
      { type: 'monster', tid: 'cult_priest', x: 20, y: 25 },
      // prisoner
      { type: 'npc', id: 'elric', name: 'Elric the Scholar', x: 31, y: 32, dialogue: 'elric', sprite: 'guild_man', color: '#8a8aa0', shape: 'humanoid' },
      // sanctum door
      { type: 'door', x: 20, y: 33, locked: true, dc: 28, key: 'crypt_key', name: 'Sanctum Door' },
      // sanctum
      { type: 'monster', tid: 'necromancer', x: 20, y: 36 },
      { type: 'monster', tid: 'skeleton_warrior', x: 15, y: 37 }, { type: 'monster', tid: 'skeleton', x: 25, y: 37 },
      { type: 'monster', tid: 'wight', x: 22, y: 35 },
      { type: 'chest', x: 10, y: 36, loot: { gold: 200, items: ['potion_cure_serious', 'potion_speed', 'ring_protection_1', 'chainmail_1'] }, locked: 20 },
    ],
  };
}

export const AREA_BUILDERS = { town: buildTown, tavern: buildTavern, cellar: buildCellar, forest: buildForest, crypt: buildCrypt };

export function buildArea(id) {
  const def = AREA_BUILDERS[id]();
  const rows = def.tiles.map(r => r.split(''));
  for (const e of def.entities) {
    if (e.type === 'sign') continue;
    for (let i = 0; i < (e.w || 1); i++) {
      const c = rows[e.y][e.x + i];
      if ('T*Sg'.includes(c)) rows[e.y][e.x + i] = def.outdoor ? '.' : ':';
    }
  }
  def.tiles = rows.map(r => r.join(''));
  return def;
}
