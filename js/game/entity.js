import { RACES } from '../data/races.js';
import { CLASSES, babForLevel, saveForLevel, xpForLevel, MAX_LEVEL } from '../data/classes.js';
import { ITEMS, EQUIP_SLOTS, canUseWeapon, canUseArmor } from '../data/items.js';
import { MONSTERS } from '../data/monsters.js';
import { SKILLS, SKILL_IDS } from '../data/skills.js';
import { spellsForClass } from '../data/spells.js';
import { rollDice, mod, roll } from '../core/dice.js';

let uidCounter = 1;
export function nextUid() { return uidCounter++; }
export function setUidCounter(v) { uidCounter = Math.max(uidCounter, v); }

export const ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
export const BASE_SPEED = 3.2;

export function createPlayer({ name, race, cls, abilities, skills, color, gender }) {
  const c = {
    uid: nextUid(), kind: 'player', name, faction: 'party', x: 0, y: 0,
    race, cls, level: 1, xp: 0, gender: gender || 'm',
    baseAbilities: { ...abilities }, skills: { ...skills }, skillPoints: 0, abilityPoints: 0,
    equipment: { weapon: null, armor: null, shield: null, ring: null, amulet: null, cloak: null, boots: null },
    inventory: [], gold: 0, effects: [], hp: 1, tempHp: 0, hpRolls: [],
    spellSlots: {}, rageUses: 0, turnUses: 0, color: color || '#c04040', shape: 'humanoid', size: 1,
    target: null, path: [], nextAttackAt: 0, attackIndex: 0, dead: false, facing: 1,
  };
  const cd = CLASSES[cls];
  c.hpRolls = [cd.hitDie];
  const rd = RACES[race];
  if (rd.toughness) c.hpRolls = [cd.hitDie];
  for (const id of cd.startingItems) addItem(c, id, 1);
  c.gold = cd.startingGold;
  for (const id of cd.startingItems) {
    const it = ITEMS[id];
    if (['weapon', 'armor', 'shield'].includes(it.type) && !c.equipment[it.type]) equipItem(c, id);
  }
  refreshSlots(c);
  c.hp = maxHp(c);
  c.rageUses = rageUsesMax(c);
  c.turnUses = turnUsesMax(c);
  return c;
}

export function createHenchman(id, playerLevel) {
  const level = Math.max(2, Math.min(MAX_LEVEL, playerLevel));
  const c = createPlayer({ name: 'Tomas', race: 'human', cls: 'ranger', abilities: { STR: 14, DEX: 17, CON: 13, INT: 10, WIS: 12, CHA: 8 }, skills: { search: 4, lore: 1 }, color: '#3a6a3a' });
  c.kind = 'henchman'; c.henchId = id; c.uid = nextUid();
  c.inventory = []; c.equipment = { weapon: null, armor: null, shield: null, ring: null, amulet: null, cloak: null, boots: null };
  addItem(c, 'longbow'); addItem(c, 'short_sword'); addItem(c, 'studded_leather'); addItem(c, 'potion_cure_light', 2);
  equipItem(c, 'longbow'); equipItem(c, 'studded_leather');
  c.gold = 0; c.level = 1; c.xp = 0;
  while (c.level < level) { c.level++; c.hpRolls.push(Math.max(3, roll(1, CLASSES.ranger.hitDie))); }
  c.xp = xpForLevel(c.level);
  refreshSlots(c);
  c.hp = maxHp(c);
  return c;
}

export function createMonster(tid, x, y, nameOverride) {
  const t = MONSTERS[tid];
  if (!t) throw new Error('Unknown monster ' + tid);
  const c = {
    uid: nextUid(), kind: 'monster', tid, name: nameOverride || t.name, faction: 'hostile', x: x + 0.5, y: y + 0.5,
    creatureType: t.creatureType, level: Math.max(1, parseInt(t.hp, 10) || 1),
    hp: 0, maxHpBase: Math.max(1, rollDice(t.hp)), tempHp: 0, effects: [], target: null, path: [], nextAttackAt: 0, attackIndex: 0, dead: false,
    homeX: x + 0.5, homeY: y + 0.5, spells: (t.spells || []).map(s => ({ ...s, left: s.uses })), summonsLeft: t.summons ? 1 : 0,
    color: t.color, shape: t.shape, size: t.size || 1, weaponLook: t.weapon, facing: 1, aiTimer: Math.random(), boss: !!t.boss, awake: false,
  };
  c.hp = c.maxHpBase;
  return c;
}

export function templateOf(c) { return c.kind === 'monster' ? MONSTERS[c.tid] : null; }
export function classOf(c) { return c.cls ? CLASSES[c.cls] : null; }
export function raceOf(c) { return c.race ? RACES[c.race] : null; }
export function isParty(c) { return c.faction === 'party'; }
export function isPlayerLike(c) { return c.kind === 'player' || c.kind === 'henchman'; }

// ---------------------------------------------------------------- inventory
export function addItem(c, id, qty = 1) {
  const t = ITEMS[id];
  if (!t) throw new Error('Unknown item ' + id);
  if (t.stack) {
    const ex = c.inventory.find(i => i.id === id);
    if (ex) { ex.qty += qty; return; }
    c.inventory.push({ id, qty });
  } else {
    for (let i = 0; i < qty; i++) c.inventory.push({ id, qty: 1 });
  }
}

export function removeItem(c, id, qty = 1) {
  let left = qty;
  for (let i = c.inventory.length - 1; i >= 0 && left > 0; i--) {
    const it = c.inventory[i];
    if (it.id !== id) continue;
    const take = Math.min(it.qty, left);
    it.qty -= take; left -= take;
    if (it.qty <= 0) c.inventory.splice(i, 1);
  }
  return qty - left;
}

export function countItem(c, id) {
  let n = 0;
  for (const it of c.inventory) if (it.id === id) n += it.qty;
  for (const s of EQUIP_SLOTS) if (c.equipment[s] === id) n++;
  return n;
}

export function hasItem(c, id) { return countItem(c, id) > 0; }

export function canEquip(c, id) {
  const it = ITEMS[id];
  const cd = classOf(c);
  if (!it || !cd) return { ok: false, why: 'Cannot equip.' };
  if (it.type === 'weapon' && !canUseWeapon(cd, it)) return { ok: false, why: `${cd.name}s are not proficient with this weapon.` };
  if ((it.type === 'armor' || it.type === 'shield') && !canUseArmor(cd, it)) return { ok: false, why: `${cd.name}s cannot wear this.` };
  if (it.type === 'shield') {
    const w = c.equipment.weapon && ITEMS[c.equipment.weapon];
    if (w && w.twoHanded) return { ok: false, why: 'Cannot use a shield with a two-handed weapon.' };
  }
  if (it.type === 'weapon' && it.twoHanded && c.equipment.shield) return { ok: false, why: 'Unequip your shield first.' };
  if (!EQUIP_SLOTS.includes(it.type)) return { ok: false, why: 'This item cannot be equipped.' };
  return { ok: true };
}

export function equipItem(c, id) {
  const chk = canEquip(c, id);
  if (!chk.ok) return chk;
  const it = ITEMS[id];
  const slot = it.type;
  if (removeItem(c, id, 1) < 1) return { ok: false, why: 'Item not in inventory.' };
  if (c.equipment[slot]) addItem(c, c.equipment[slot], 1);
  c.equipment[slot] = id;
  return { ok: true };
}

export function unequipItem(c, slot) {
  if (!c.equipment[slot]) return;
  addItem(c, c.equipment[slot], 1);
  c.equipment[slot] = null;
}

export function equippedItems(c) {
  const out = [];
  for (const s of EQUIP_SLOTS) if (c.equipment && c.equipment[s]) out.push(ITEMS[c.equipment[s]]);
  return out;
}

// ---------------------------------------------------------------- stats
export function effectSum(c, key) {
  let t = 0;
  for (const e of c.effects) if (typeof e[key] === 'number') t += e[key];
  return t;
}

export function itemBonus(c, key) {
  if (!c.equipment) return 0;
  let t = 0;
  for (const it of equippedItems(c)) if (it.bonus && typeof it.bonus[key] === 'number') t += it.bonus[key];
  for (const inv of (c.inventory || [])) { const it = ITEMS[inv.id]; if (it.type === 'misc' && it.bonus && typeof it.bonus[key] === 'number') t += it.bonus[key]; }
  return t;
}

export function ability(c, ab) {
  if (c.kind === 'npc') return 10 + effectSum(c, ab);
  if (c.kind === 'monster') return 10 + effectSum(c, ab) + (ab === 'STR' && MONSTERS[c.tid].size > 1.2 ? 8 : 0);
  const r = raceOf(c);
  return c.baseAbilities[ab] + (r.abilities[ab] || 0) + itemBonus(c, ab) + effectSum(c, ab);
}

export function abilityMod(c, ab) { return mod(ability(c, ab)); }

export function bab(c) {
  if (c.kind === 'monster') return MONSTERS[c.tid].attack;
  return babForLevel(classOf(c).bab, c.level);
}

export function maxHp(c) {
  if (c.kind === 'npc') return c.maxHpBase || 20;
  if (c.kind === 'monster') return Math.max(1, c.maxHpBase + effectSum(c, 'CON') / 2 * c.level);
  const conMod = abilityMod(c, 'CON');
  let hp = 0;
  for (const r of c.hpRolls) hp += r;
  hp += conMod * c.level;
  if (raceOf(c).toughness) hp += c.level;
  return Math.max(1, hp);
}

export function weaponOf(c) {
  if (c.kind === 'monster') return null;
  return c.equipment.weapon ? ITEMS[c.equipment.weapon] : null;
}

export function isRanged(c) {
  if (c.kind === 'monster') return !!MONSTERS[c.tid].ranged;
  const w = weaponOf(c);
  return !!(w && w.ranged);
}

export function attackRange(c) {
  if (c.kind === 'monster') return MONSTERS[c.tid].ranged || 1.6;
  return isRanged(c) ? 9 : 1.6;
}

export function armorCheck(c) {
  // wizards in armor suffer arcane spell failure
  if (c.kind === 'monster' || c.cls !== 'wizard') return 0;
  const a = c.equipment.armor && ITEMS[c.equipment.armor];
  const s = c.equipment.shield && ITEMS[c.equipment.shield];
  return (a ? a.ac * 10 : 0) + (s ? s.ac * 10 : 0);
}

export function computeStats(c) {
  const st = {};
  if (c.kind === 'npc') {
    return { ac: 12, attack: 2, damageDice: '1d4', damageBonus: 0, crit: [20, 2], attacks: 1, saves: { fort: 2, ref: 2, will: 2 }, speed: BASE_SPEED, dr: 0, range: 1.6, maxHp: maxHp(c), ranged: false };
  }
  if (c.kind === 'monster') {
    const t = MONSTERS[c.tid];
    st.ac = t.ac + effectSum(c, 'ac') + (c.effects.some(e => e.held) ? -6 : 0);
    st.attack = t.attack + effectSum(c, 'attack') + Math.floor(effectSum(c, 'STR') / 2);
    st.damageDice = t.damage;
    st.damageBonus = effectSum(c, 'damage') + Math.floor(effectSum(c, 'STR') / 2);
    st.crit = [20, 2];
    st.attacks = 1 + (t.attack >= 8 ? 1 : 0) + effectSum(c, 'extraAttack');
    st.saves = { fort: t.saves.fort + effectSum(c, 'fort'), ref: t.saves.ref + effectSum(c, 'ref'), will: t.saves.will + effectSum(c, 'will') };
    st.speed = t.speed * (1 + effectSum(c, 'speed'));
    st.dr = effectSum(c, 'dr') + (t.dr ? t.dr.amount : 0);
    st.range = attackRange(c);
    st.maxHp = maxHp(c);
    st.ranged = !!t.ranged;
    return st;
  }
  const cd = classOf(c), rd = raceOf(c);
  const strM = abilityMod(c, 'STR'), dexM = abilityMod(c, 'DEX');
  const armor = c.equipment.armor ? ITEMS[c.equipment.armor] : null;
  const shield = c.equipment.shield ? ITEMS[c.equipment.shield] : null;
  const weapon = weaponOf(c);
  const maxDex = armor ? armor.maxDex : 99;
  const sizeBonus = rd.small ? 1 : 0;
  st.ac = 10 + (armor ? armor.ac : 0) + (shield ? shield.ac : 0) + Math.min(dexM, maxDex) + sizeBonus + itemBonus(c, 'ac') + effectSum(c, 'ac');
  if (c.effects.some(e => e.held)) st.ac -= 6;
  const ranged = !!(weapon && weapon.ranged);
  const finesse = !!(weapon && weapon.finesse) && dexM > strM;
  let atk = bab(c) + (ranged || finesse ? dexM : strM) + sizeBonus + (weapon && weapon.enh ? weapon.enh : 0) + itemBonus(c, 'attack') + effectSum(c, 'attack');
  if (c.cls === 'fighter') atk += 1;
  if (c.cls === 'ranger' && ranged) atk += 1;
  st.attack = atk;
  st.damageDice = weapon ? weapon.damage : '1d3';
  let dmg = (weapon && weapon.enh ? weapon.enh : 0) + effectSum(c, 'damage') + itemBonus(c, 'damage');
  if (!ranged) dmg += weapon && weapon.twoHanded ? Math.floor(strM * 1.5) : strM;
  else if (c.cls === 'ranger') dmg += 1;
  if (c.cls === 'fighter' && c.level >= 4) dmg += 2;
  st.damageBonus = dmg;
  st.crit = weapon ? [...weapon.crit] : [20, 2];
  if (c.cls === 'fighter' && c.level >= 8) st.crit[0] = 21 - (21 - st.crit[0]) * 2;
  const b = bab(c);
  st.attacks = 1 + (b >= 6 ? 1 : 0) + (b >= 11 ? 1 : 0) + effectSum(c, 'extraAttack');
  const sv = cd.saves;
  st.saves = {
    fort: saveForLevel(sv.fort, c.level) + abilityMod(c, 'CON') + (rd.saveBonus.fort || 0) + itemBonus(c, 'fort') + effectSum(c, 'fort'),
    ref: saveForLevel(sv.ref, c.level) + dexM + (rd.saveBonus.ref || 0) + itemBonus(c, 'ref') + effectSum(c, 'ref'),
    will: saveForLevel(sv.will, c.level) + abilityMod(c, 'WIS') + (rd.saveBonus.will || 0) + itemBonus(c, 'will') + effectSum(c, 'will'),
  };
  st.speed = BASE_SPEED * (1 + itemBonus(c, 'speed') + effectSum(c, 'speed') + (c.cls === 'barbarian' && c.level >= 3 ? 0.1 : 0));
  st.dr = effectSum(c, 'dr');
  st.range = attackRange(c);
  st.maxHp = maxHp(c);
  st.ranged = ranged;
  st.sneakDice = c.cls === 'rogue' ? Math.ceil(c.level / 2) : 0;
  return st;
}

export function skillTotal(c, skillId) {
  if (c.kind === 'monster') return 0;
  const sk = SKILLS[skillId];
  const rd = raceOf(c);
  return (c.skills[skillId] || 0) + abilityMod(c, sk.ability) + (rd.skillBonus[skillId] || 0) + itemBonus(c, skillId) + effectSum(c, skillId);
}

export function isClassSkill(c, skillId) { return classOf(c).classSkills.includes(skillId); }
export function maxRank(c, skillId) { return isClassSkill(c, skillId) ? c.level + 3 : Math.floor((c.level + 3) / 2); }

export function skillPointsPerLevel(c) {
  const cd = classOf(c), rd = raceOf(c);
  return Math.max(1, cd.skillPoints + abilityMod(c, 'INT') + (rd.extraSkill || 0));
}

// ---------------------------------------------------------------- spells
export function casterInfo(c) {
  const cd = classOf(c);
  return cd && cd.casting ? cd.casting : null;
}

export function maxSpellLevel(c) {
  const ci = casterInfo(c);
  if (!ci) return 0;
  const slots = ci.slots[c.level - 1];
  return slots.length;
}

export function spellsKnown(c) {
  const ci = casterInfo(c);
  if (!ci) return [];
  return spellsForClass(ci.type, maxSpellLevel(c));
}

export function refreshSlots(c) {
  const ci = casterInfo(c);
  const prev = c.spellSlots || {};
  c.spellSlots = {};
  if (!ci) return;
  const table = ci.slots[c.level - 1];
  const abMod = abilityMod(c, ci.ability);
  for (let lvl = 1; lvl <= table.length; lvl++) {
    const bonus = abMod >= lvl ? 1 + Math.floor((abMod - lvl) / 4) : 0;
    const max = table[lvl - 1] + bonus;
    const cur = prev[lvl] ? Math.min(max, prev[lvl].cur + Math.max(0, max - prev[lvl].max)) : max;
    c.spellSlots[lvl] = { max, cur };
  }
}

export function restoreSlots(c) {
  refreshSlots(c);
  for (const k of Object.keys(c.spellSlots)) c.spellSlots[k].cur = c.spellSlots[k].max;
}

export function rageUsesMax(c) { return c.cls === 'barbarian' ? 1 + Math.floor(c.level / 4) : 0; }
export function turnUsesMax(c) { return c.cls === 'cleric' ? Math.max(1, 3 + abilityMod(c, 'CHA')) : 0; }

// ---------------------------------------------------------------- xp & level
export function xpToNext(c) { return c.level >= MAX_LEVEL ? Infinity : xpForLevel(c.level + 1); }
export function canLevelUp(c) { return c.level < MAX_LEVEL && c.xp >= xpForLevel(c.level + 1); }

export function applyLevelUp(c, { skillAlloc = {}, abilityChoice = null } = {}) {
  const cd = classOf(c);
  c.level++;
  const rollHp = Math.max(1, roll(1, cd.hitDie));
  c.hpRolls.push(rollHp);
  if (abilityChoice && ABILITIES.includes(abilityChoice)) c.baseAbilities[abilityChoice]++;
  for (const [sk, n] of Object.entries(skillAlloc)) c.skills[sk] = (c.skills[sk] || 0) + n;
  refreshSlots(c);
  const newMax = maxHp(c);
  c.hp = Math.min(newMax, c.hp + rollHp + Math.max(0, abilityMod(c, 'CON')));
  c.rageUses = Math.max(c.rageUses, rageUsesMax(c));
  c.turnUses = Math.max(c.turnUses, turnUsesMax(c));
  return rollHp;
}

export function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
