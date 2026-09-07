// Sound effects, music and ambient loops from Flare's audio (CC-BY-SA, see assets/CREDITS-flare.txt).
// Effects go through Web Audio so many can overlap and fade with distance from the player; music and
// ambience are streamed by <audio> elements and crossfaded. Everything is optional: with the files missing
// or the browser refusing, the game stays silent without errors.
import { ITEMS } from '../data/items.js';
import { MONSTERS } from '../data/monsters.js';

const SFX = {
  swing: ['melee_attack', 'melee_attack_2', 'melee_attack_3'], shoot: 'powers/shoot', block: 'powers/block',
  fire: 'powers/fireball', cold: 'powers/freeze', electric: 'powers/shock', acid: 'powers/burn', negative: 'powers/burn',
  magic: 'powers/thunder', divine: 'powers/heal', heal: 'powers/heal', buff: 'powers/shield', hold: 'powers/timestop',
  warcry: 'powers/warcry', turn: 'powers/thunder', trap: 'powers/spikes', potion: 'powers/potion', no_mana: 'no_mana',
  coins: 'inventory/inventory_coins', pick_potion: 'inventory/inventory_potion', pick_cloth: 'inventory/inventory_cloth',
  pick_leather: 'inventory/inventory_leather', pick_maille: 'inventory/inventory_maille', pick_metal: 'inventory/inventory_metal',
  pick_object: 'inventory/inventory_object', pick_book: 'inventory/inventory_book', page: 'inventory/inventory_page', pick_wood: 'inventory/inventory_wood',
  door: 'door_open', wood_door: 'wood_open', stone: 'environment/stone_open', stairs: 'environment/stairs', chest: 'inventory/inventory_wood',
  level_up: 'level_up', ui: 'widget_activate', loot: 'flying_loot', heartbeat: 'heartbeat',
  male_hit: 'male_hit', female_hit: 'female_hit', male_die: 'male_die', female_die: 'female_die',
};
for (const v of ['goblin', 'skeleton', 'zombie', 'antlion', 'minotaur']) for (const k of ['hit', 'die', 'phys']) SFX[`${v}_${k}`] = `enemies/${v}_${k}`;
for (const s of ['cloth', 'leather', 'metal', 'echo']) SFX[`step_${s}`] = [1, 2, 3, 4].map(i => `steps/step_${s}${i}`);

// Which Flare voice a monster uses; humanoid avatars use the male / female voice, beasts have none
const VOICE = {
  goblin: 'goblin', goblin_archer: 'goblin', goblin_shaman: 'goblin', hobgoblin: 'goblin', goblin_chief: 'goblin',
  skeleton: 'skeleton', skeleton_warrior: 'skeleton', wight: 'skeleton', zombie: 'zombie', ghoul: 'zombie',
  giant_spider: 'antlion', ogre: 'minotaur',
};
const AREA_MUSIC = { town: 'town_theme', tavern: 'safe_room_theme', cellar: 'cave_theme', forest: 'overworld_theme', crypt: 'dungeon_theme' };
const AREA_AMBIENT = { town: 'bird_twitter_loop', tavern: 'open_fire_loop', cellar: 'cave_droplets_loop', forest: 'raven_loop', crypt: 'cave_wind_loop' };
const STORE = 'bramblewick_audio';

export class Audio {
  constructor(base) {
    this.base = base; this.ctx = null; this.buffers = new Map(); this.loading = new Map(); this.ok = true;
    this.musicEl = null; this.musicName = null; this.ambientEl = null; this.ambientName = null; this.fades = new Set();
    this.game = null; this.stepTimer = 0; this.lastCombat = -99; this.musicMode = null; this.musicCheck = 0;
    this.settings = { music: 0.5, sfx: 0.8, muted: false };
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch (e) { /* defaults */ }
  }
  save() { try { localStorage.setItem(STORE, JSON.stringify(this.settings)); } catch (e) { /* ignore */ } }
  /** Browsers only play sound after a user gesture: called from the first click or key press. */
  unlock() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.gain = this.ctx.createGain(); this.gain.connect(this.ctx.destination); } catch (e) { this.ok = false; return; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    this.applyVolumes();
    if (this.pendingMusic) { const m = this.pendingMusic; this.pendingMusic = null; this.music(m); }
  }
  applyVolumes() {
    const m = this.settings.muted;
    if (this.gain) this.gain.gain.value = m ? 0 : this.settings.sfx;
    if (this.musicEl) this.musicEl.volume = m ? 0 : this.settings.music * (this.musicEl._level ?? 1);
    if (this.ambientEl) this.ambientEl.volume = m ? 0 : this.settings.music * 0.45 * (this.ambientEl._level ?? 1);
  }
  set(key, value) { this.settings[key] = value; this.save(); this.applyVolumes(); }
  toggleMute() { this.set('muted', !this.settings.muted); return this.settings.muted; }

  // ---------------------------------------------------------------- effects
  async buffer(file) {
    if (this.buffers.has(file)) return this.buffers.get(file);
    if (!this.loading.has(file)) {
      this.loading.set(file, (async () => {
        try {
          const res = await fetch(`${this.base}audio/sfx/${file}.ogg`);
          if (!res.ok) throw new Error(res.status);
          const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
          this.buffers.set(file, buf); return buf;
        } catch (e) { this.buffers.set(file, null); return null; }
      })());
    }
    return this.loading.get(file);
  }
  /** Decode the common effects up front so the first fight is not silent. */
  preload(names) { if (this.ctx) for (const n of names) { const f = SFX[n]; for (const file of Array.isArray(f) ? f : [f]) this.buffer(file); } }
  /** Play an effect by name (see SFX) or file; `at` (an entity or {x, y}) fades it with distance from the player. */
  async sfx(name, { at = null, volume = 1, vary = 0.08 } = {}) {
    if (!this.ok || !this.ctx || this.settings.muted) return;
    let file = SFX[name] || name;
    if (Array.isArray(file)) file = file[Math.floor(Math.random() * file.length)];
    let gain = volume;
    if (at && this.game && this.game.player) {
      const d = Math.hypot(at.x - this.game.player.x, at.y - this.game.player.y);
      gain *= d <= 4 ? 1 : Math.max(0, 1 - (d - 4) / 12);
      if (gain <= 0.02) return;
    }
    const buf = await this.buffer(file);
    if (!buf || this.settings.muted) return;
    try {
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      src.playbackRate.value = 1 + (Math.random() * 2 - 1) * vary;
      const g = this.ctx.createGain(); g.gain.value = gain;
      src.connect(g); g.connect(this.gain); src.start();
    } catch (e) { /* ignore */ }
  }
  /** A creature's own sound for 'hit', 'die' or 'phys' (its attack grunt). */
  voice(c, kind) {
    if (!c) return;
    let v = null;
    if (c.kind === 'monster') { const t = MONSTERS[c.tid]; v = VOICE[c.tid] || (t && t.avatar ? (t.avatar.gender === 'female' ? 'female' : 'male') : null); }
    else v = (c.gender === 'f' || (c.avatar && c.avatar.gender === 'female')) ? 'female' : 'male';
    if (!v) return;
    if ((v === 'male' || v === 'female') && kind === 'phys') return;
    this.sfx(`${v}_${kind}`, { at: c, volume: kind === 'die' ? 1 : 0.8 });
  }
  /** Sound of picking up or equipping an item. */
  item(id) {
    const it = ITEMS[id]; if (!it) return this.sfx('pick_object');
    if (it.type === 'potion') return this.sfx('pick_potion');
    if (it.type === 'armor') return this.sfx(it.category === 'heavy' || it.category === 'medium' ? 'pick_maille' : it.category === 'light' ? 'pick_leather' : 'pick_cloth');
    if (it.type === 'weapon' || it.type === 'shield') return this.sfx('pick_metal');
    if (it.type === 'scroll' || it.type === 'book') return this.sfx('pick_book');
    return this.sfx('pick_object');
  }
  /** Footsteps while the player walks, in the material of the armour (echoing in the crypt). */
  footsteps(p, dt, area) {
    if (!p.moving || p.dead) { this.stepTimer = 0.18; return; }
    this.stepTimer -= dt;
    if (this.stepTimer > 0) return;
    this.stepTimer = 0.34;
    const armor = p.equipment.armor ? ITEMS[p.equipment.armor] : null;
    const cat = armor ? armor.category : 'none';
    const set = area && area.id === 'crypt' ? 'echo' : cat === 'heavy' || cat === 'medium' ? 'metal' : cat === 'light' ? 'leather' : 'cloth';
    this.sfx(`step_${set}`, { volume: 0.35, vary: 0.12 });
  }

  // ---------------------------------------------------------------- music and ambience
  fade(el, target, ms, then) {
    const start = el.volume, t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      try { el.volume = start + (target - start) * k; } catch (e) { /* ignore */ }
      if (k < 1 && this.fades.has(el)) requestAnimationFrame(step); else { this.fades.delete(el); if (then) then(); }
    };
    this.fades.add(el); requestAnimationFrame(step);
  }
  stream(dir, name, level) {
    const el = document.createElement('audio');
    el.src = `${this.base}audio/${dir}/${name}.ogg`; el.loop = true; el.preload = 'auto'; el._level = level; el.volume = 0;
    el.play().catch(() => {});
    return el;
  }
  /** Switch the music (null stops it), crossfading over a second. Before the first gesture the request is kept. */
  music(name) {
    if (name === this.musicName) return;
    if (!this.ctx) { this.pendingMusic = name; return; }
    const old = this.musicEl; this.musicName = name; this.musicEl = null;
    if (old) { this.fades.delete(old); this.fade(old, 0, 900, () => { old.pause(); old.src = ''; }); }
    if (!name) return;
    const el = this.stream('music', name, 1); this.musicEl = el;
    this.fade(el, this.settings.muted ? 0 : this.settings.music, 1200);
  }
  ambient(name) {
    if (name === this.ambientName) return;
    if (!this.ctx) return;
    const old = this.ambientEl; this.ambientName = name; this.ambientEl = null;
    if (old) { this.fades.delete(old); this.fade(old, 0, 1500, () => { old.pause(); old.src = ''; }); }
    if (!name) return;
    const el = this.stream('ambient', name, 1); this.ambientEl = el;
    this.fade(el, this.settings.muted ? 0 : this.settings.music * 0.45, 2500);
  }
  /** Per-frame: footsteps and the music of the moment (area theme, battle, the boss). */
  update(game, dt) {
    this.game = game;
    if (!game.running || !game.area) return;
    if (!game.paused && !game.dialogue) this.footsteps(game.player, dt, game.area);
    this.musicCheck -= dt;
    if (this.musicCheck > 0) return;
    this.musicCheck = 0.5;
    const a = game.area;
    const boss = a.entities.some(e => e.kind === 'monster' && e.tid === 'necromancer' && e.awake && !e.dead);
    if (game.inCombat()) this.lastCombat = game.time;
    const fighting = game.time - this.lastCombat < 4;
    const want = game.gameOver ? null : boss ? 'boss_theme' : fighting ? 'battle_theme' : AREA_MUSIC[a.id] || null;
    this.music(want);
    this.ambient(game.gameOver ? null : AREA_AMBIENT[a.id] || null);
  }
}
