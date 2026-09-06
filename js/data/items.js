// Item templates. Weapon proficiency groups: simple < rogue < martial ; wizard = dagger/staff/crossbow only
export const ITEMS = {
  // ---- Weapons ----
  dagger: { name: 'Dagger', type: 'weapon', damage: '1d4', crit: [19, 2], finesse: true, group: 'simple', value: 4, weight: 1, desc: 'A simple blade. Can be used with finesse.' },
  quarterstaff: { name: 'Quarterstaff', type: 'weapon', damage: '1d6', crit: [20, 2], twoHanded: true, group: 'simple', value: 2, weight: 4, desc: 'A sturdy length of oak.' },
  mace: { name: 'Mace', type: 'weapon', damage: '1d6', crit: [20, 2], group: 'simple', value: 12, weight: 6, desc: 'A heavy bludgeon favored by clerics.' },
  light_crossbow: { name: 'Light Crossbow', type: 'weapon', damage: '1d8', crit: [19, 2], ranged: true, group: 'simple', value: 35, weight: 6, desc: 'Fires bolts at range. Anyone can use one.' },
  short_sword: { name: 'Short Sword', type: 'weapon', damage: '1d6', crit: [19, 2], finesse: true, group: 'rogue', value: 10, weight: 3, desc: 'A quick, light blade.' },
  rapier: { name: 'Rapier', type: 'weapon', damage: '1d6', crit: [18, 2], finesse: true, group: 'rogue', value: 20, weight: 3, desc: 'A slender thrusting sword with a wide critical range.' },
  longsword: { name: 'Longsword', type: 'weapon', damage: '1d8', crit: [19, 2], group: 'martial', value: 15, weight: 4, desc: 'The classic knightly blade.' },
  battleaxe: { name: 'Battleaxe', type: 'weapon', damage: '1d8', crit: [20, 3], group: 'martial', value: 10, weight: 7, desc: 'Brutal criticals.' },
  greataxe: { name: 'Greataxe', type: 'weapon', damage: '1d12', crit: [20, 3], twoHanded: true, group: 'martial', value: 20, weight: 12, desc: 'A massive two-handed axe.' },
  greatsword: { name: 'Greatsword', type: 'weapon', damage: '2d6', crit: [19, 2], twoHanded: true, group: 'martial', value: 50, weight: 15, desc: 'A huge two-handed sword.' },
  longbow: { name: 'Longbow', type: 'weapon', damage: '1d8', crit: [20, 3], ranged: true, twoHanded: true, group: 'martial', value: 75, weight: 3, desc: 'Strikes foes from afar.' },
  longsword_1: { name: 'Longsword +1', type: 'weapon', damage: '1d8', crit: [19, 2], enh: 1, group: 'martial', value: 315, weight: 4, magic: true, desc: 'A finely enchanted blade. +1 attack and damage.' },
  mace_1: { name: 'Mace +1', type: 'weapon', damage: '1d6', crit: [20, 2], enh: 1, group: 'simple', value: 312, weight: 6, magic: true, desc: 'Blessed by the temple. +1 attack and damage.' },
  short_sword_1: { name: 'Short Sword +1', type: 'weapon', damage: '1d6', crit: [19, 2], finesse: true, enh: 1, group: 'rogue', value: 310, weight: 3, magic: true, desc: 'A keen enchanted blade. +1 attack and damage.' },
  greataxe_1: { name: 'Greataxe +1', type: 'weapon', damage: '1d12', crit: [20, 3], twoHanded: true, enh: 1, group: 'martial', value: 320, weight: 12, magic: true, desc: 'Rune-carved axe. +1 attack and damage.' },
  longbow_1: { name: 'Longbow +1', type: 'weapon', damage: '1d8', crit: [20, 3], ranged: true, twoHanded: true, enh: 1, group: 'martial', value: 375, weight: 3, magic: true, desc: 'Elven-crafted bow. +1 attack and damage.' },
  staff_of_frost: { name: 'Staff of Frost', type: 'weapon', damage: '1d6', crit: [20, 2], twoHanded: true, enh: 1, group: 'simple', value: 400, weight: 4, magic: true, bonus: { will: 1 }, desc: 'Cold to the touch. +1 attack and damage, +1 Will.' },
  dawnblade: { name: 'Dawnblade', type: 'weapon', damage: '1d8', crit: [19, 2], enh: 2, group: 'martial', value: 1200, weight: 4, magic: true, bonusVs: { undead: '1d6' }, desc: 'A longsword that glows with holy light. +2 enhancement, +1d6 damage vs undead.' },

  // ---- Armor ----
  robe: { name: 'Robe', type: 'armor', ac: 0, maxDex: 99, category: 'none', value: 2, weight: 1, desc: 'Simple cloth robes. No armor value.' },
  padded_armor: { name: 'Padded Armor', type: 'armor', ac: 1, maxDex: 8, category: 'light', value: 5, weight: 10, desc: 'Quilted layers of cloth.' },
  leather_armor: { name: 'Leather Armor', type: 'armor', ac: 2, maxDex: 6, category: 'light', value: 10, weight: 15, desc: 'Boiled leather.' },
  studded_leather: { name: 'Studded Leather', type: 'armor', ac: 3, maxDex: 5, category: 'light', value: 25, weight: 20, desc: 'Leather reinforced with metal studs.' },
  chain_shirt: { name: 'Chain Shirt', type: 'armor', ac: 4, maxDex: 4, category: 'light', value: 100, weight: 25, desc: 'A shirt of interlocking rings.' },
  scale_mail: { name: 'Scale Mail', type: 'armor', ac: 4, maxDex: 3, category: 'medium', value: 50, weight: 30, desc: 'Overlapping metal scales.' },
  chainmail: { name: 'Chainmail', type: 'armor', ac: 5, maxDex: 2, category: 'medium', value: 150, weight: 40, desc: 'Full suit of mail.' },
  breastplate: { name: 'Breastplate', type: 'armor', ac: 5, maxDex: 3, category: 'medium', value: 200, weight: 30, desc: 'A steel chest piece.' },
  half_plate: { name: 'Half Plate', type: 'armor', ac: 7, maxDex: 0, category: 'heavy', value: 600, weight: 50, desc: 'Heavy plates over mail.' },
  full_plate: { name: 'Full Plate', type: 'armor', ac: 8, maxDex: 1, category: 'heavy', value: 1500, weight: 50, desc: 'The finest protection money can buy.' },
  studded_leather_1: { name: 'Studded Leather +1', type: 'armor', ac: 4, maxDex: 5, category: 'light', value: 275, weight: 20, magic: true, desc: 'Enchanted studded leather.' },
  chainmail_1: { name: 'Chainmail +1', type: 'armor', ac: 6, maxDex: 2, category: 'medium', value: 400, weight: 40, magic: true, desc: 'Enchanted chainmail.' },

  // ---- Shields ----
  small_shield: { name: 'Small Shield', type: 'shield', ac: 1, value: 9, weight: 6, desc: 'A light wooden shield.' },
  large_shield: { name: 'Large Shield', type: 'shield', ac: 2, value: 20, weight: 15, desc: 'A heavy steel shield.' },
  tower_shield: { name: 'Tower Shield', type: 'shield', ac: 3, value: 60, weight: 45, desc: 'A wall of steel.', heavy: true },
  large_shield_1: { name: 'Large Shield +1', type: 'shield', ac: 3, value: 320, weight: 15, magic: true, desc: 'Enchanted steel shield.' },

  // ---- Accessories ----
  ring_protection_1: { name: 'Ring of Protection +1', type: 'ring', bonus: { ac: 1 }, value: 300, weight: 0, magic: true, desc: '+1 deflection bonus to AC.' },
  ring_protection_2: { name: 'Ring of Protection +2', type: 'ring', bonus: { ac: 2 }, value: 900, weight: 0, magic: true, desc: '+2 deflection bonus to AC.' },
  ring_of_strength: { name: 'Ring of Ogre Power', type: 'ring', bonus: { STR: 2 }, value: 800, weight: 0, magic: true, desc: '+2 Strength.' },
  ring_of_wisdom: { name: 'Ring of Insight', type: 'ring', bonus: { WIS: 2 }, value: 800, weight: 0, magic: true, desc: '+2 Wisdom.' },
  amulet_health: { name: 'Amulet of Health', type: 'amulet', bonus: { CON: 2 }, value: 800, weight: 0, magic: true, desc: '+2 Constitution.' },
  amulet_natural_armor: { name: 'Amulet of Natural Armor +1', type: 'amulet', bonus: { ac: 1 }, value: 300, weight: 0, magic: true, desc: '+1 natural armor bonus.' },
  amulet_of_dawn: { name: 'Amulet of Dawn', type: 'amulet', bonus: { ac: 2, will: 2, fort: 2, ref: 2 }, value: 3000, weight: 0, magic: true, quest: true, desc: 'The holy relic of Bramblewick. Radiates warmth. +2 AC, +2 all saves.' },
  boots_of_striding: { name: 'Boots of Striding', type: 'boots', bonus: { speed: 0.2 }, value: 400, weight: 1, magic: true, desc: '+20% movement speed.' },
  cloak_resistance_1: { name: 'Cloak of Resistance +1', type: 'cloak', bonus: { fort: 1, ref: 1, will: 1 }, value: 300, weight: 1, magic: true, desc: '+1 to all saving throws.' },

  // ---- Consumables ----
  potion_cure_light: { name: 'Potion of Cure Light Wounds', type: 'potion', heal: '1d8+1', value: 25, weight: 0.5, stack: true, desc: 'Heals 1d8+1 hit points.' },
  potion_cure_moderate: { name: 'Potion of Cure Moderate Wounds', type: 'potion', heal: '2d8+3', value: 75, weight: 0.5, stack: true, desc: 'Heals 2d8+3 hit points.' },
  potion_cure_serious: { name: 'Potion of Cure Serious Wounds', type: 'potion', heal: '3d8+5', value: 150, weight: 0.5, stack: true, desc: 'Heals 3d8+5 hit points.' },
  potion_bulls_strength: { name: 'Potion of Bull\'s Strength', type: 'potion', buff: 'bulls_strength', value: 100, weight: 0.5, stack: true, desc: '+4 Strength for 20 rounds.' },
  potion_barkskin: { name: 'Potion of Barkskin', type: 'potion', buff: 'barkskin', value: 100, weight: 0.5, stack: true, desc: '+3 natural armor for 20 rounds.' },
  potion_speed: { name: 'Potion of Speed', type: 'potion', buff: 'haste', value: 200, weight: 0.5, stack: true, desc: 'Haste for 10 rounds.' },

  // ---- Misc / quest ----
  thieves_tools: { name: 'Thieves\' Tools', type: 'misc', value: 30, weight: 1, bonus: { openlock: 2, disabletrap: 2 }, desc: 'Picks and probes. +2 Open Lock and Disable Trap while carried.' },
  holy_symbol: { name: 'Holy Symbol', type: 'misc', value: 5, weight: 0.5, desc: 'A silver sunburst of the Dawnfather.' },
  torch: { name: 'Torch', type: 'misc', value: 1, weight: 1, stack: true, desc: 'Lights the way.' },
  silver_locket: { name: 'Silver Locket', type: 'misc', value: 40, weight: 0, quest: true, desc: 'A tarnished locket holding a tiny portrait of a young man.' },
  goblin_chief_head: { name: 'Head of Grubnash', type: 'misc', value: 0, weight: 5, quest: true, desc: 'Proof that the goblin chief is dead.' },
  crypt_key: { name: 'Iron Crypt Key', type: 'key', value: 0, weight: 0.5, quest: true, desc: 'A heavy black key inscribed with a skull. Opens the sanctum door in the Sunken Crypt.' },
  cult_letter: { name: 'Cultist\'s Letter', type: 'misc', value: 0, weight: 0, quest: true, desc: '"The goblins will keep the guards busy. Bring the amulet to the crypt before the new moon. -V"' },
  gem_ruby: { name: 'Ruby', type: 'gem', value: 150, weight: 0, stack: true, desc: 'A blood-red gemstone.' },
  gem_sapphire: { name: 'Sapphire', type: 'gem', value: 250, weight: 0, stack: true, desc: 'A deep blue gemstone.' },
  wolf_pelt: { name: 'Wolf Pelt', type: 'misc', value: 15, weight: 3, stack: true, desc: 'A thick grey pelt. Could be sold to a trader.' },
  rat_tail: { name: 'Rat Tail', type: 'misc', value: 1, weight: 0, stack: true, desc: 'Proof of a slain rat. Bram wants these.' },
};

export const EQUIP_SLOTS = ['weapon', 'armor', 'shield', 'ring', 'amulet', 'cloak', 'boots'];
export const SLOT_NAMES = { weapon: 'Weapon', armor: 'Armor', shield: 'Shield', ring: 'Ring', amulet: 'Amulet', cloak: 'Cloak', boots: 'Boots' };

for (const [id, it] of Object.entries(ITEMS)) it.id = id;

export function makeItem(id, qty = 1) {
  if (!ITEMS[id]) throw new Error('Unknown item ' + id);
  return { id, qty };
}

export const WEAPON_GROUP_RANK = { simple: 0, rogue: 1, martial: 2 };

export function canUseWeapon(cls, item) {
  if (!item || item.type !== 'weapon') return true;
  const allowed = cls.weapons;
  if (allowed === 'wizard') return ['dagger', 'quarterstaff', 'light_crossbow', 'staff_of_frost'].includes(item.id);
  return WEAPON_GROUP_RANK[item.group] <= WEAPON_GROUP_RANK[allowed];
}

export function canUseArmor(cls, item) {
  if (!item) return true;
  if (item.type === 'armor') return item.category === 'none' || cls.armor.includes(item.category);
  if (item.type === 'shield') return cls.shields && !(item.heavy && !cls.armor.includes('heavy'));
  return true;
}
