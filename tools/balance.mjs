// Headless balance simulator: fights the game's real rules (entity.js, combat.js, the data files) without a
// browser, so encounter difficulty can be measured instead of guessed. Prints, per class, the share of fights won,
// the health the winners keep and the potions they drink.
//
//   node tools/balance.mjs 1,2,3 [--tomas]        levels to simulate, optionally with the henchman
//   ENC='cellar|camp' node tools/balance.mjs 4    only encounters whose name matches the regular expression
//
// The party model is deliberately competent: casters buff before the fight and pick a sensible spell, everyone
// drinks a potion below 40% health, and 'rest' encounters let the party rest between waves, as the game allows
// when nothing is awake nearby. Numbers are therefore an optimistic bound on the difficulty a player will meet.
import * as E from '../js/game/entity.js';
import * as C from '../js/game/combat.js';
import { SPELLS } from '../js/data/spells.js';
import { MONSTERS } from '../js/data/monsters.js';
import { xpForLevel } from '../js/data/classes.js';

const REC = { fighter: { STR: 16, DEX: 13, CON: 14, INT: 10, WIS: 10, CHA: 8 }, barbarian: { STR: 16, DEX: 13, CON: 14, INT: 8, WIS: 10, CHA: 10 }, rogue: { STR: 12, DEX: 16, CON: 12, INT: 14, WIS: 10, CHA: 10 }, ranger: { STR: 14, DEX: 16, CON: 13, INT: 10, WIS: 12, CHA: 8 }, cleric: { STR: 14, DEX: 10, CON: 14, INT: 8, WIS: 16, CHA: 10 }, wizard: { STR: 8, DEX: 14, CON: 14, INT: 16, WIS: 12, CHA: 8 } };
const noop = () => {};
function stubGame(entities) {
  const g = { time: 0, area: { entities, outdoor: true }, audio: null, log: noop, awardXp: noop, onMonsterKilled: noop, onPlayerDeath: noop, nextUid: E.nextUid,
    fx: new Proxy({}, { get: () => noop }), byUid(id) { return entities.find(e => e.uid === id); } };
  return g;
}
function hero(cls, level, race = 'human') {
  const p = E.createPlayer({ name: cls, race, cls, abilities: REC[cls], skills: {}, color: '#fff', gender: 'm' });
  while (p.level < level) { p.xp = xpForLevel(p.level + 1); E.applyLevelUp(p, { abilityChoice: p.level + 1 === 4 ? 'STR' : null }); }
  if (level >= 3) E.addItem(p, 'potion_cure_moderate', 2);   // bought or looted by then
  p.hp = E.maxHp(p); E.restoreSlots(p);
  return p;
}
function tomas(level) { const h = E.createHenchman('tomas', level); h.hp = E.maxHp(h); return h; }
const alive = (c) => !c.dead && c.hp > 0;

/** One fight. opts: { hench, potions, engage: 'all' | n (monsters arrive n at a time as the previous die) } */
function fight(cls, level, tids, opts = {}) {
  const p = hero(cls, level); const party = [p];
  if (opts.hench) party.push(tomas(level));
  const monsters = tids.map((t, i) => E.createMonster(t, 5 + i, 5));
  const ents = [...party, ...monsters]; const g = stubGame(ents);
  for (const m of monsters) { m.awake = true; m.maxHpBase = m.maxHpBase || m.hp; }
  let active = opts.engage === 'all' || !opts.engage ? monsters.slice() : monsters.slice(0, opts.engage); let next = opts.engage === 'all' || !opts.engage ? monsters.length : opts.engage;
  let potionsUsed = 0;
  // casters buff before the fight, as a player would on seeing enemies
  const slot = (c, L) => { const sl = c.spellSlots[L]; if (sl && sl.cur > 0) { sl.cur--; return true; } return false; };
  const prebuff = () => {
    if (p.cls === 'wizard') { if (p.spellSlots[1] && p.spellSlots[1].cur > 1 && slot(p, 1)) C.castSpell(g, p, SPELLS.mage_armor, p); if (p.spellSlots[4] && slot(p, 4)) C.castSpell(g, p, SPELLS.stoneskin, p); if (p.spellSlots[3] && p.spellSlots[3].cur > 1 && slot(p, 3)) C.castSpell(g, p, SPELLS.haste, p); }
    if (p.cls === 'cleric') { if (p.spellSlots[1] && p.spellSlots[1].cur > 1 && slot(p, 1)) C.castSpell(g, p, SPELLS.bless, p); if (p.spellSlots[3] && slot(p, 3)) C.castSpell(g, p, SPELLS.prayer, p); else if (p.spellSlots[2] && p.spellSlots[2].cur > 1 && slot(p, 2)) C.castSpell(g, p, SPELLS.aid, p); if (p.spellSlots[4] && slot(p, 4)) C.castSpell(g, p, SPELLS.divine_power, p); }
  };
  prebuff();
  let summoned = false;
  for (let round = 0; round < 60; round++) {
    g.time = round * C.ROUND;
    const foes = active.filter(alive);
    if (!foes.length) {
      if (next < monsters.length) {
        // the next wave is still asleep: the party can rest first, as the game allows with no awake foe within 12 tiles
        if (opts.rest) for (const c of party) { c.hp = E.maxHp(c); c.dead = false; E.restoreSlots(c); c.effects = []; }
        if (opts.rest) prebuff();
        active.push(monsters[next++]); continue;
      }
      return { win: true, hpLeft: p.hp / E.maxHp(p), rounds: round, potionsUsed };
    }
    // Malachar raises two skeletons once he is hurt (game.js monster AI)
    const necro = monsters.find(m => m.tid === 'necromancer');
    if (necro && !summoned && alive(necro) && necro.hp < necro.maxHpBase * 0.7) { summoned = true; for (let i = 0; i < 2; i++) { const s = E.createMonster('skeleton', 6, 6); s.awake = true; s.maxHpBase = s.maxHpBase || s.hp; monsters.push(s); active.push(s); ents.push(s); } }
    if (!alive(p)) return { win: false, hpLeft: 0, rounds: round, potionsUsed };
    for (const c of party) {
      if (!alive(c)) continue;
      const st = E.computeStats(c);
      const low = c.hp < E.maxHp(c) * (c === p ? 0.4 : 0.3);
      const pot = E.hasItem(c, 'potion_cure_moderate') ? 'potion_cure_moderate' : E.hasItem(c, 'potion_cure_light') ? 'potion_cure_light' : null;
      if (low && pot) { E.removeItem(c, pot, 1); C.usePotion(g, c, pot); if (c === p) potionsUsed++; continue; }
      const asleep = foes.filter(f => C.isHeld(f));
      const target = asleep.length ? asleep[0] : foes.reduce((a, b) => (a.hp < b.hp ? a : b));
      if (c.cls === 'wizard' && foes.length >= 2 && !asleep.length && c.spellSlots[1] && c.spellSlots[1].cur > 0) { c.spellSlots[1].cur--; C.castSpell(g, c, SPELLS.sleep, target); continue; }
      if (c.cls === 'cleric') {
        if (low) { if (slot(c, 3)) { C.castSpell(g, c, SPELLS.cure_serious_wounds, c); continue; } if (slot(c, 2)) { C.castSpell(g, c, SPELLS.cure_moderate_wounds, c); continue; } if (slot(c, 1)) { C.castSpell(g, c, SPELLS.cure_light_wounds, c); continue; } }
        const strong = foes.filter(f => !C.isHeld(f)).sort((a, b) => b.hp - a.hp)[0];
        if (strong && ['humanoid', 'goblinoid'].includes(strong.creatureType) && slot(c, 2)) { C.castSpell(g, c, SPELLS.hold_person, strong); continue; }
        if (slot(c, 4)) { C.castSpell(g, c, SPELLS.flame_strike, target); continue; }
        if (slot(c, 3)) { C.castSpell(g, c, SPELLS.searing_light, target); continue; }
      }
      if (c.cls === 'wizard') {
        if (foes.length >= 2 && slot(c, 3)) { C.castSpell(g, c, SPELLS.fireball, target); continue; }
        if (slot(c, 3)) { C.castSpell(g, c, SPELLS.lightning_bolt, target); continue; }
        if (slot(c, 2)) { C.castSpell(g, c, SPELLS.scorching_ray, target); continue; }
        if (slot(c, 1)) { C.castSpell(g, c, SPELLS.magic_missile, target); continue; }
      }
      if (c.cls === 'barbarian' && c.rageUses > 0 && round === 0) { C.useRage(g, c); }
      for (let a = 0; a < st.attacks; a++) { const t = foes.find(alive); if (t) C.weaponAttack(g, c, t, a * 5); }
    }
    for (const m of active.filter(alive)) {
      const tmpl = MONSTERS[m.tid];
      if (tmpl.spells && (m._uses = m._uses ?? 3) > 0) { m._uses--; C.castSpell(g, m, SPELLS[tmpl.spells[0].id], p); continue; }
      const tgt = opts.hench && Math.random() < 0.35 && alive(party[1]) ? party[1] : p;
      const st = E.computeStats(m);
      for (let a = 0; a < st.attacks; a++) if (alive(tgt)) C.weaponAttack(g, m, tgt, a * 5);
    }
  }
  return { win: alive(p) && !active.some(alive), hpLeft: p.hp / E.maxHp(p), rounds: 60, potionsUsed };
}
export function run(cls, level, tids, opts, n = 400) {
  let wins = 0, hp = 0, pots = 0;
  for (let i = 0; i < n; i++) { const r = fight(cls, level, tids, opts); if (r.win) { wins++; hp += r.hpLeft; } pots += r.potionsUsed; }
  return { win: wins / n, hpLeft: wins ? hp / wins : 0, potions: pots / n };
}
const ENC = {
  'cellar rats, 2 at a time': [['giant_rat', 'giant_rat', 'giant_rat', 'giant_rat', 'dire_rat'], { engage: 2 }],
  'cellar rats, 2 + rest': [['giant_rat', 'giant_rat', 'giant_rat', 'giant_rat', 'dire_rat'], { engage: 2, rest: true }],
  'cellar rats, all at once': [['giant_rat', 'giant_rat', 'giant_rat', 'giant_rat', 'dire_rat'], { engage: 'all' }],
  'road bandits x2': [['bandit', 'bandit'], { engage: 'all' }],
  'wolf + dire wolf': [['wolf', 'dire_wolf'], { engage: 'all' }],
  'lone wolf': [['wolf'], { engage: 'all' }],
  'fire ant': [['giant_spider'], { engage: 'all' }],
  'goblin camp (all)': [['goblin', 'goblin', 'goblin_archer', 'hobgoblin', 'goblin_shaman', 'goblin_chief'], { engage: 'all' }],
  'goblin camp, 2 at a time': [['goblin', 'goblin', 'goblin_archer', 'hobgoblin', 'goblin_shaman', 'goblin_chief'], { engage: 2 }],
  'goblin camp, 2 + rest': [['goblin', 'goblin', 'goblin_archer', 'hobgoblin', 'goblin_shaman', 'goblin_chief'], { engage: 2, rest: true }],
  'goblin chief alone': [['goblin_chief'], { engage: 'all' }],
  'minotaur': [['ogre'], { engage: 'all' }],
  'crypt: 2 skeletons + zombie': [['skeleton', 'skeleton', 'zombie'], { engage: 'all' }],
  'crypt: skel warrior + wight': [['skeleton_warrior', 'wight'], { engage: 'all' }],
  'crypt: ghoul + 2 zombies': [['ghoul', 'zombie', 'zombie'], { engage: 'all' }],
  'cult: 2 cultists + acolyte': [['cultist', 'cultist', 'cult_acolyte'], { engage: 'all' }],
  'cult: priestess + cultist': [['cult_priest', 'cultist'], { engage: 'all' }],
  'boss: necromancer + 2': [['necromancer', 'skeleton', 'wight'], { engage: 'all' }],
};
const ONLY = process.env.ENC ? Object.fromEntries(Object.entries(ENC).filter(([k]) => new RegExp(process.env.ENC).test(k))) : ENC;
const classes = ['fighter', 'barbarian', 'rogue', 'ranger', 'cleric', 'wizard'];
const levels = (process.argv[2] || '1').split(',').map(Number);
const withHench = process.argv.includes('--tomas');
for (const level of levels) {
  console.log(`\n=== level ${level}${withHench ? ' + Tomas' : ''} (win% / hp left of winners / potions used)`);
  console.log('encounter'.padEnd(28) + classes.map(c => c.padStart(11)).join(''));
  for (const [name, [tids, o]] of Object.entries(ONLY)) {
    const cells = classes.map(cls => { const r = run(cls, level, tids, { ...o, hench: withHench }, 300); return `${Math.round(r.win * 100)}%/${Math.round(r.hpLeft * 100)}/${r.potions.toFixed(1)}`.padStart(11); });
    console.log(name.padEnd(28) + cells.join(''));
  }
}
