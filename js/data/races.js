export const RACES = {
  human: {
    id: 'human', name: 'Human',
    abilities: {},
    desc: 'Adaptable and ambitious. Humans gain an extra skill point every level and a bonus feat at first level.',
    traits: ['+1 skill point per level', 'Bonus feat: Toughness (+1 HP per level)'],
    skillBonus: {}, saveBonus: {}, extraSkill: 1, toughness: true,
  },
  elf: {
    id: 'elf', name: 'Elf',
    abilities: { DEX: 2, CON: -2 },
    desc: 'Graceful and long-lived. Elves are keen-eyed, resist enchantments, and are natural archers.',
    traits: ['+2 DEX, -2 CON', '+2 Search, +2 Lore', '+2 Will save vs. mind spells', 'Keen senses'],
    skillBonus: { search: 2, lore: 2 }, saveBonus: { will: 1 },
  },
  dwarf: {
    id: 'dwarf', name: 'Dwarf',
    abilities: { CON: 2, CHA: -2 },
    desc: 'Stout and steadfast. Dwarves are hardy, resist poison and magic, and know stonework.',
    traits: ['+2 CON, -2 CHA', '+2 Fortitude save', '+2 Search in dungeons', 'Darkvision'],
    skillBonus: { search: 2 }, saveBonus: { fort: 2 },
  },
  halfling: {
    id: 'halfling', name: 'Halfling',
    abilities: { DEX: 2, STR: -2 },
    desc: 'Small and lucky. Halflings are nimble and quick-witted.',
    traits: ['+2 DEX, -2 STR', '+1 to all saves', '+2 Open Lock, +2 Persuade', 'Small: +1 AC, +1 attack'],
    skillBonus: { openlock: 2, persuade: 2 }, saveBonus: { fort: 1, ref: 1, will: 1 }, small: true,
  },
  halforc: {
    id: 'halforc', name: 'Half-Orc',
    abilities: { STR: 2, INT: -2, CHA: -2 },
    desc: 'Strong and fierce. Half-orcs make fearsome warriors but rarely gifted diplomats.',
    traits: ['+2 STR, -2 INT, -2 CHA', 'Darkvision'],
    skillBonus: {}, saveBonus: {},
  },
  gnome: {
    id: 'gnome', name: 'Gnome',
    abilities: { CON: 2, STR: -2 },
    desc: 'Clever and curious. Gnomes have a knack for lore and tinkering with traps.',
    traits: ['+2 CON, -2 STR', '+2 Lore, +2 Disable Trap', 'Small: +1 AC, +1 attack', 'Low-light vision'],
    skillBonus: { lore: 2, disabletrap: 2 }, saveBonus: {}, small: true,
  },
};
