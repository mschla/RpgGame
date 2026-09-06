// Spell definitions. Durations in rounds. Damage functions take caster level.
const cap = (n, max) => Math.min(n, max);

export const SPELLS = {
  // ================= ARCANE =================
  magic_missile: {
    name: 'Magic Missile', school: 'Evocation', level: 1, list: 'arcane', target: 'enemy', range: 10,
    kind: 'damage', damageType: 'magic', autoHit: true, fx: 'missile', color: '#9ad3ff',
    damage: (lvl) => `${cap(1 + Math.floor((lvl - 1) / 2), 5)}d4+${cap(1 + Math.floor((lvl - 1) / 2), 5)}`,
    desc: 'Darts of force that never miss. 1d4+1 damage per missile; one missile per two levels (max 5).',
  },
  burning_hands: {
    name: 'Burning Hands', school: 'Evocation', level: 1, list: 'arcane', target: 'enemy', range: 3,
    kind: 'damage', damageType: 'fire', area: 1.5, save: 'ref', saveEffect: 'half', fx: 'burst', color: '#ff7a2a',
    damage: (lvl) => `${cap(lvl, 5)}d4`,
    desc: 'A fan of flame. 1d4 fire damage per level (max 5d4) to all foes near the target. Reflex half.',
  },
  mage_armor: {
    name: 'Mage Armor', school: 'Conjuration', level: 1, list: 'arcane', target: 'ally', range: 6,
    kind: 'buff', effect: { key: 'mage_armor', ac: 4 }, duration: (lvl) => 100, fx: 'aura', color: '#7fb0ff',
    desc: '+4 armor bonus to AC for 100 rounds.',
  },
  shield: {
    name: 'Shield', school: 'Abjuration', level: 1, list: 'arcane', target: 'self',
    kind: 'buff', effect: { key: 'shield', ac: 3 }, duration: (lvl) => 10 + lvl, fx: 'aura', color: '#c0d8ff',
    desc: '+3 shield bonus to AC for 10 rounds + level.',
  },
  ray_of_enfeeblement: {
    name: 'Ray of Enfeeblement', school: 'Necromancy', level: 1, list: 'arcane', target: 'enemy', range: 8,
    kind: 'debuff', save: 'fort', effect: { key: 'enfeeble', STR: -4 }, duration: (lvl) => 5 + lvl, fx: 'bolt', color: '#8a4d9e',
    desc: 'The target loses 4 Strength for 5 rounds + level. Fortitude negates.',
  },
  acid_arrow: {
    name: "Melf's Acid Arrow", school: 'Conjuration', level: 2, list: 'arcane', target: 'enemy', range: 10,
    kind: 'damage', damageType: 'acid', autoHit: true, fx: 'bolt', color: '#7ee34a',
    damage: (lvl) => '3d6', dot: { damage: '1d6', rounds: (lvl) => 1 + Math.floor(lvl / 3) },
    desc: 'An arrow of acid dealing 3d6 damage, then 1d6 per round for 1 + level/3 rounds. Never misses.',
  },
  bulls_strength: {
    name: "Bull's Strength", school: 'Transmutation', level: 2, list: 'both', target: 'ally', range: 6,
    kind: 'buff', effect: { key: 'bulls_strength', STR: 4 }, duration: (lvl) => 10 * lvl, fx: 'aura', color: '#e0a04a',
    desc: '+4 Strength for 10 rounds per level.',
  },
  cats_grace: {
    name: "Cat's Grace", school: 'Transmutation', level: 2, list: 'arcane', target: 'ally', range: 6,
    kind: 'buff', effect: { key: 'cats_grace', DEX: 4 }, duration: (lvl) => 10 * lvl, fx: 'aura', color: '#e0d04a',
    desc: '+4 Dexterity for 10 rounds per level.',
  },
  scorching_ray: {
    name: 'Scorching Ray', school: 'Evocation', level: 2, list: 'arcane', target: 'enemy', range: 8,
    kind: 'damage', damageType: 'fire', attackRoll: 'ranged', fx: 'bolt', color: '#ff4a2a',
    damage: (lvl) => `${lvl >= 7 ? 8 : 4}d6`,
    desc: 'A ray of fire dealing 4d6 (8d6 at level 7). Requires a ranged touch attack.',
  },
  fireball: {
    name: 'Fireball', school: 'Evocation', level: 3, list: 'arcane', target: 'enemy', range: 12,
    kind: 'damage', damageType: 'fire', area: 3, save: 'ref', saveEffect: 'half', fx: 'explosion', color: '#ff8a1a',
    damage: (lvl) => `${cap(lvl, 10)}d6`,
    desc: 'A ball of fire dealing 1d6 per level (max 10d6) to all creatures nearby. Reflex half. Careful with allies!',
  },
  lightning_bolt: {
    name: 'Lightning Bolt', school: 'Evocation', level: 3, list: 'arcane', target: 'enemy', range: 10,
    kind: 'damage', damageType: 'electric', area: 1.5, save: 'ref', saveEffect: 'half', fx: 'bolt', color: '#ffffa0', hostileOnly: true,
    damage: (lvl) => `${cap(lvl, 10)}d6`,
    desc: 'A bolt dealing 1d6 per level (max 10d6) to the target and enemies adjacent to it. Reflex half.',
  },
  haste: {
    name: 'Haste', school: 'Transmutation', level: 3, list: 'arcane', target: 'ally', range: 6,
    kind: 'buff', effect: { key: 'haste', extraAttack: 1, ac: 2, speed: 0.5 }, duration: (lvl) => 3 * lvl, fx: 'aura', color: '#ffffff',
    desc: 'The target gains an extra attack per round, +2 AC and moves 50% faster for 3 rounds per level.',
  },
  vampiric_touch: {
    name: 'Vampiric Touch', school: 'Necromancy', level: 3, list: 'arcane', target: 'enemy', range: 1.6,
    kind: 'damage', damageType: 'negative', attackRoll: 'melee', drain: true, fx: 'bolt', color: '#c02060',
    damage: (lvl) => `${cap(Math.floor(lvl / 2), 5)}d6`,
    desc: 'Touch deals 1d6 per two levels (max 5d6) and heals you for the damage dealt. Melee touch attack.',
  },
  stoneskin: {
    name: 'Stoneskin', school: 'Abjuration', level: 4, list: 'arcane', target: 'ally', range: 6,
    kind: 'buff', effect: { key: 'stoneskin', dr: 5 }, duration: (lvl) => 10 * lvl, fx: 'aura', color: '#a0a0a0',
    desc: 'Damage reduction 5 against physical attacks for 10 rounds per level.',
  },
  ice_storm: {
    name: 'Ice Storm', school: 'Evocation', level: 4, list: 'arcane', target: 'enemy', range: 12,
    kind: 'damage', damageType: 'cold', area: 3, fx: 'explosion', color: '#a0e0ff', hostileOnly: true,
    damage: (lvl) => `${cap(3 + Math.floor(lvl / 2), 8)}d6`,
    desc: 'Hail hammers all enemies in a wide radius for 3d6 + 1d6 per two levels. No save.',
  },
  cone_of_cold: {
    name: 'Cone of Cold', school: 'Evocation', level: 5, list: 'arcane', target: 'enemy', range: 8,
    kind: 'damage', damageType: 'cold', area: 3, save: 'ref', saveEffect: 'half', fx: 'explosion', color: '#c0f0ff', hostileOnly: true,
    damage: (lvl) => `${cap(lvl, 15)}d6`,
    desc: 'A blast of frost dealing 1d6 per level (max 15d6) to all enemies near the target. Reflex half.',
  },

  // ================= DIVINE =================
  cure_light_wounds: {
    name: 'Cure Light Wounds', school: 'Conjuration', level: 1, list: 'divine', target: 'ally', range: 1.6,
    kind: 'heal', fx: 'heal', color: '#ffe680', damage: (lvl) => `1d8+${cap(lvl, 5)}`,
    desc: 'Heals 1d8 + level (max +5). Harms undead instead.',
  },
  bless: {
    name: 'Bless', school: 'Enchantment', level: 1, list: 'divine', target: 'self',
    kind: 'buff', party: true, effect: { key: 'bless', attack: 1, will: 1 }, duration: (lvl) => 10 * lvl, fx: 'aura', color: '#fff0a0',
    desc: 'All allies gain +1 attack and +1 Will for 10 rounds per level.',
  },
  divine_favor: {
    name: 'Divine Favor', school: 'Evocation', level: 1, list: 'divine', target: 'self',
    kind: 'buff', effect: (lvl) => ({ key: 'divine_favor', attack: cap(1 + Math.floor(lvl / 3), 5), damage: cap(1 + Math.floor(lvl / 3), 5) }), duration: (lvl) => 10, fx: 'aura', color: '#fff0a0',
    desc: '+1 attack and damage per three levels (max +5) for 10 rounds.',
  },
  doom: {
    name: 'Doom', school: 'Enchantment', level: 1, list: 'divine', target: 'enemy', range: 8,
    kind: 'debuff', save: 'will', effect: { key: 'doom', attack: -2, damage: -2, fort: -2, ref: -2, will: -2 }, duration: (lvl) => 5 + lvl, fx: 'bolt', color: '#604080',
    desc: 'Target takes -2 to attacks, damage and saves. Will negates.',
  },
  cure_moderate_wounds: {
    name: 'Cure Moderate Wounds', school: 'Conjuration', level: 2, list: 'divine', target: 'ally', range: 1.6,
    kind: 'heal', fx: 'heal', color: '#ffe680', damage: (lvl) => `2d8+${cap(lvl, 10)}`,
    desc: 'Heals 2d8 + level (max +10). Harms undead instead.',
  },
  aid: {
    name: 'Aid', school: 'Enchantment', level: 2, list: 'divine', target: 'ally', range: 6,
    kind: 'buff', effect: { key: 'aid', attack: 1, tempHp: '1d8' }, duration: (lvl) => 10 * lvl, fx: 'aura', color: '#fff0a0',
    desc: '+1 attack and 1d8 temporary hit points for 10 rounds per level.',
  },
  hold_person: {
    name: 'Hold Person', school: 'Enchantment', level: 2, list: 'divine', target: 'enemy', range: 8,
    kind: 'debuff', save: 'will', effect: { key: 'held', held: true }, duration: (lvl) => 3, fx: 'bolt', color: '#c0c0ff', humanoidOnly: true,
    desc: 'Paralyzes a humanoid for 3 rounds. Will negates. Held foes are hit automatically.',
  },
  cure_serious_wounds: {
    name: 'Cure Serious Wounds', school: 'Conjuration', level: 3, list: 'divine', target: 'ally', range: 1.6,
    kind: 'heal', fx: 'heal', color: '#ffe680', damage: (lvl) => `3d8+${cap(lvl, 15)}`,
    desc: 'Heals 3d8 + level (max +15). Harms undead instead.',
  },
  prayer: {
    name: 'Prayer', school: 'Enchantment', level: 3, list: 'divine', target: 'self',
    kind: 'buff', party: true, effect: { key: 'prayer', attack: 1, damage: 1, fort: 1, ref: 1, will: 1 }, duration: (lvl) => lvl + 5, fx: 'aura', color: '#fff0a0',
    desc: 'All allies gain +1 attack, damage and saves for 5 rounds + level.',
  },
  searing_light: {
    name: 'Searing Light', school: 'Evocation', level: 3, list: 'divine', target: 'enemy', range: 10,
    kind: 'damage', damageType: 'divine', attackRoll: 'ranged', fx: 'bolt', color: '#ffffd0',
    damage: (lvl, target) => target && target.creatureType === 'undead' ? `${cap(lvl, 10)}d8` : `${cap(Math.floor(lvl / 2), 5)}d8`,
    desc: 'A ray of holy light: 1d8 per two levels (max 5d8), or 1d8 per level (max 10d8) against undead. Ranged touch attack.',
  },
  cure_critical_wounds: {
    name: 'Cure Critical Wounds', school: 'Conjuration', level: 4, list: 'divine', target: 'ally', range: 1.6,
    kind: 'heal', fx: 'heal', color: '#ffe680', damage: (lvl) => `4d8+${cap(lvl, 20)}`,
    desc: 'Heals 4d8 + level (max +20). Harms undead instead.',
  },
  flame_strike: {
    name: 'Flame Strike', school: 'Evocation', level: 4, list: 'divine', target: 'enemy', range: 12,
    kind: 'damage', damageType: 'fire', area: 2, save: 'ref', saveEffect: 'half', fx: 'explosion', color: '#ffd040', hostileOnly: true,
    damage: (lvl) => `${cap(lvl, 15)}d6`,
    desc: 'A column of divine fire dealing 1d6 per level (max 15d6) to enemies near the target. Reflex half.',
  },
  divine_power: {
    name: 'Divine Power', school: 'Evocation', level: 4, list: 'divine', target: 'self',
    kind: 'buff', effect: (lvl) => ({ key: 'divine_power', STR: 6, attack: Math.max(0, lvl - Math.floor(lvl * 3 / 4)), tempHp: `${lvl}` }), duration: (lvl) => lvl, fx: 'aura', color: '#fff0a0',
    desc: '+6 Strength, full warrior attack bonus and temporary HP for 1 round per level.',
  },
  heal: {
    name: 'Heal', school: 'Conjuration', level: 5, list: 'divine', target: 'ally', range: 1.6,
    kind: 'heal', fx: 'heal', color: '#ffffff', damage: (lvl) => '999', cure: true,
    desc: 'Fully restores the target and removes harmful effects.',
  },
};

for (const [id, s] of Object.entries(SPELLS)) s.id = id;

// Effects used by potions and abilities
export const EFFECT_TEMPLATES = {
  bulls_strength: { key: 'bulls_strength', STR: 4, duration: 20, name: "Bull's Strength" },
  barkskin: { key: 'barkskin', ac: 3, duration: 20, name: 'Barkskin' },
  haste: { key: 'haste', extraAttack: 1, ac: 2, speed: 0.5, duration: 10, name: 'Haste' },
  rage: { key: 'rage', STR: 4, CON: 4, will: 2, ac: -2, duration: 5, name: 'Barbarian Rage' },
};

export function spellsForClass(castType, maxSpellLevel) {
  return Object.values(SPELLS).filter(s => (s.list === castType || s.list === 'both') && s.level <= maxSpellLevel)
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}
