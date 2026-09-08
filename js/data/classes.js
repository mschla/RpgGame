// Spell slots per class level (index = class level - 1), array index = spell level - 1
const CASTER_SLOTS = [
  [3], [3], [3, 1], [4, 2], [4, 2, 1], [4, 3, 2], [4, 3, 2, 1], [4, 4, 3, 2], [4, 4, 3, 2, 1], [4, 4, 3, 3, 2],
];

export const CLASSES = {
  fighter: {
    id: 'fighter', name: 'Fighter', hitDie: 10, bab: 'full', saves: { fort: 'good', ref: 'poor', will: 'poor' },
    skillPoints: 2, classSkills: ['intimidate', 'lore'],
    armor: ['light', 'medium', 'heavy'], shields: true, weapons: 'martial',
    desc: 'Masters of weapons and armor. Fighters hit hard and often, and can wear the heaviest plate.',
    features: [
      { level: 1, name: 'Weapon Focus', desc: '+1 to attack rolls.' },
      { level: 4, name: 'Weapon Specialization', desc: '+2 to weapon damage.' },
      { level: 6, name: 'Extra Attack', desc: 'Two attacks per round (from base attack bonus).' },
      { level: 8, name: 'Improved Critical', desc: 'Doubled critical threat range.' },
    ],
    startingItems: ['longsword', 'chain_shirt', 'small_shield', 'potion_cure_light', 'potion_cure_light', 'potion_cure_light'], startingGold: 60,
  },
  barbarian: {
    id: 'barbarian', name: 'Barbarian', hitDie: 12, bab: 'full', saves: { fort: 'good', ref: 'poor', will: 'poor' },
    skillPoints: 4, classSkills: ['intimidate', 'search'],
    armor: ['light', 'medium'], shields: true, weapons: 'martial',
    desc: 'Savage warriors from the wild lands. Barbarians can fly into a rage, becoming stronger and tougher.',
    features: [
      { level: 1, name: 'Barbarian Rage', desc: '+4 STR, +4 CON, +2 Will, -2 AC for 5 rounds. Uses per day: 1 + level/4.' },
      { level: 2, name: 'Uncanny Dodge', desc: 'Keep DEX bonus to AC when surprised.' },
      { level: 3, name: 'Fast Movement', desc: '+10% movement speed.' },
      { level: 6, name: 'Extra Attack', desc: 'Two attacks per round (from base attack bonus).' },
    ],
    startingItems: ['greataxe', 'studded_leather', 'potion_cure_light', 'potion_cure_light', 'potion_cure_light'], startingGold: 40,
  },
  rogue: {
    id: 'rogue', name: 'Rogue', hitDie: 6, bab: 'medium', saves: { fort: 'poor', ref: 'good', will: 'poor' },
    skillPoints: 8, classSkills: ['persuade', 'lore', 'search', 'disabletrap', 'openlock', 'intimidate'],
    armor: ['light'], shields: false, weapons: 'rogue',
    desc: 'Cunning and quick. Rogues excel at skills, find traps, pick locks, and deal deadly sneak attacks.',
    features: [
      { level: 1, name: 'Sneak Attack', desc: '+1d6 damage per 2 levels (rounded up) against foes not fighting you.' },
      { level: 2, name: 'Evasion', desc: 'Take no damage on a successful Reflex save against area spells.' },
      { level: 3, name: 'Uncanny Dodge', desc: 'Keep DEX bonus to AC when surprised.' },
    ],
    startingItems: ['short_sword', 'dagger', 'studded_leather', 'thieves_tools', 'potion_cure_light', 'potion_cure_light', 'potion_cure_light'], startingGold: 80,
  },
  ranger: {
    id: 'ranger', name: 'Ranger', hitDie: 8, bab: 'full', saves: { fort: 'good', ref: 'good', will: 'poor' },
    skillPoints: 6, classSkills: ['search', 'lore', 'concentration'],
    armor: ['light', 'medium'], shields: true, weapons: 'martial',
    desc: 'Hunters and trackers of the wilderness. Rangers are deadly with a bow and know their favored enemies well.',
    features: [
      { level: 1, name: 'Favored Enemy: Goblinoids', desc: '+2 damage against goblinoids.' },
      { level: 1, name: 'Point Blank Shot', desc: '+1 attack and damage with ranged weapons.' },
      { level: 5, name: 'Favored Enemy: Undead', desc: '+2 damage against undead.' },
      { level: 6, name: 'Extra Attack', desc: 'Two attacks per round (from base attack bonus).' },
    ],
    startingItems: ['longbow', 'short_sword', 'studded_leather', 'potion_cure_light', 'potion_cure_light', 'potion_cure_light'], startingGold: 50,
  },
  cleric: {
    id: 'cleric', name: 'Cleric', hitDie: 8, bab: 'medium', saves: { fort: 'good', ref: 'poor', will: 'good' },
    skillPoints: 2, classSkills: ['concentration', 'lore', 'persuade'],
    armor: ['light', 'medium', 'heavy'], shields: true, weapons: 'simple',
    casting: { type: 'divine', ability: 'WIS', slots: CASTER_SLOTS },
    desc: 'Servants of the gods who heal the faithful and smite the unholy. Clerics wear armor and cast divine spells.',
    features: [
      { level: 1, name: 'Divine Spellcasting', desc: 'Cast divine spells. Bonus slots from Wisdom.' },
      { level: 1, name: 'Turn Undead', desc: 'Damage all nearby undead. Uses per day: 3 + CHA modifier.' },
    ],
    startingItems: ['mace', 'chain_shirt', 'small_shield', 'holy_symbol', 'potion_cure_light', 'potion_cure_light', 'potion_cure_light'], startingGold: 50,
  },
  wizard: {
    id: 'wizard', name: 'Wizard', hitDie: 4, bab: 'poor', saves: { fort: 'poor', ref: 'poor', will: 'good' },
    skillPoints: 2, classSkills: ['concentration', 'lore', 'search'],
    armor: [], shields: false, weapons: 'wizard',
    casting: { type: 'arcane', ability: 'INT', slots: CASTER_SLOTS },
    desc: 'Scholars of the arcane. Wizards are fragile but command devastating magic. They cannot cast in armor.',
    features: [
      { level: 1, name: 'Arcane Spellcasting', desc: 'Cast arcane spells. Bonus slots from Intelligence.' },
      { level: 1, name: 'Spellbook', desc: 'Learns every spell of a new level automatically.' },
    ],
    startingItems: ['quarterstaff', 'dagger', 'robe', 'potion_cure_light', 'potion_cure_light', 'potion_cure_light'], startingGold: 70,
  },
};

export function babForLevel(type, level) {
  if (type === 'full') return level;
  if (type === 'medium') return Math.floor(level * 3 / 4);
  return Math.floor(level / 2);
}

export function saveForLevel(type, level) {
  if (type === 'good') return 2 + Math.floor(level / 2);
  return Math.floor(level / 3);
}

// XP needed to reach a given level
export function xpForLevel(level) {
  return 400 * (level * (level - 1)) / 2;   // the NWN curve at 40%: the campaign's XP takes a character to level 7
}

export const MAX_LEVEL = 10;
