// Monster templates. hp is dice; attack is bonus; damage is dice string.
export const MONSTERS = {
  giant_rat: {
    name: 'Giant Rat', sprite: 'rat', spriteScale: 1.15, creatureType: 'animal', hp: '1d8+1', ac: 13, attack: 1, damage: '1d4', speed: 3.2, xp: 30,
    saves: { fort: 3, ref: 3, will: 1 }, aggro: 5, color: '#8a7a6a', shape: 'small', size: 0.6,
    loot: { gold: [0, 2], items: [{ id: 'rat_tail', chance: 1 }] },
  },
  dire_rat: {
    name: 'Dire Rat', sprite: 'rat', spriteScale: 1.35, creatureType: 'animal', hp: '1d8+4', ac: 14, attack: 3, damage: '1d6', speed: 3.4, xp: 60,
    saves: { fort: 4, ref: 4, will: 2 }, aggro: 6, color: '#5a4a3a', shape: 'small', size: 0.8,
    loot: { gold: [0, 5], items: [{ id: 'rat_tail', chance: 1 }] },
  },
  wolf: {
    name: 'Wolf', sprite: 'wolf', spriteScale: 1.0, creatureType: 'animal', hp: '2d8', ac: 13, attack: 3, damage: '1d6', speed: 3.6, xp: 70,
    saves: { fort: 5, ref: 5, will: 1 }, aggro: 7, color: '#777', shape: 'beast', size: 0.9,
    loot: { gold: [0, 0], items: [{ id: 'wolf_pelt', chance: 0.6 }] },
  },
  dire_wolf: {
    name: 'Dire Wolf', sprite: 'wolf', spriteScale: 1.3, creatureType: 'animal', hp: '4d8+8', ac: 14, attack: 7, damage: '1d8+4', speed: 3.6, xp: 300,
    saves: { fort: 8, ref: 8, will: 6 }, aggro: 8, color: '#444', shape: 'beast', size: 1.3,
    loot: { gold: [0, 0], items: [{ id: 'wolf_pelt', chance: 1 }, { id: 'wolf_pelt', chance: 0.5 }] },
  },
  giant_spider: {
    name: 'Giant Fire Ant', sprite: 'fire_ant', spriteScale: 0.9, creatureType: 'vermin', hp: '2d8+4', ac: 14, attack: 3, damage: '1d6+2', speed: 3.0, xp: 150,
    saves: { fort: 5, ref: 4, will: 1 }, aggro: 6, color: '#2a1a2a', shape: 'spider', size: 1.1, poison: { dc: 12, STR: -2, rounds: 5 },
    loot: { gold: [0, 4], items: [] },
  },
  goblin: {
    name: 'Goblin', sprite: 'goblin', creatureType: 'goblinoid', hp: '1d8+1', ac: 14, attack: 2, damage: '1d6', speed: 3.0, xp: 45,
    saves: { fort: 2, ref: 1, will: 0 }, aggro: 7, color: '#6a9a3a', shape: 'humanoid', size: 0.75, weapon: 'blade',
    loot: { gold: [1, 8], items: [{ id: 'potion_cure_light', chance: 0.1 }, { id: 'dagger', chance: 0.1 }] },
  },
  goblin_archer: {
    name: 'Goblin Archer', sprite: 'hobgoblin_archer', spriteScale: 0.9, creatureType: 'goblinoid', hp: '1d8+1', ac: 14, attack: 3, damage: '1d6', speed: 3.0, xp: 50,
    saves: { fort: 2, ref: 2, will: 0 }, aggro: 8, ranged: 8, color: '#5a8a3a', shape: 'humanoid', size: 0.75, weapon: 'bow',
    loot: { gold: [1, 8], items: [] },
  },
  goblin_shaman: {
    name: 'Goblin Shaman', sprite: 'goblin_elite', creatureType: 'goblinoid', hp: '2d8+2', ac: 13, attack: 2, damage: '1d6', speed: 3.0, xp: 130,
    saves: { fort: 3, ref: 2, will: 4 }, aggro: 8, color: '#4a7a6a', shape: 'humanoid', size: 0.8, weapon: 'staff',
    spells: [{ id: 'magic_missile', level: 1, uses: 2 }],
    loot: { gold: [5, 20], items: [{ id: 'potion_cure_light', chance: 0.5 }] },
  },
  hobgoblin: {
    name: 'Hobgoblin', sprite: 'hobgoblin', creatureType: 'goblinoid', hp: '2d8+2', ac: 15, attack: 3, damage: '1d8+1', speed: 3.0, xp: 90,
    saves: { fort: 4, ref: 1, will: 0 }, aggro: 7, color: '#a05a3a', shape: 'humanoid', size: 1.0, weapon: 'blade',
    loot: { gold: [3, 12], items: [{ id: 'longsword', chance: 0.15 }, { id: 'scale_mail', chance: 0.05 }] },
  },
  goblin_chief: {
    name: 'Grubnash the Chief', sprite: 'goblin_elite', spriteScale: 1.2, creatureType: 'goblinoid', hp: '4d8+8', ac: 16, attack: 6, damage: '1d8+3', speed: 3.0, xp: 450, boss: true,
    saves: { fort: 7, ref: 3, will: 3 }, aggro: 8, color: '#3a6a2a', shape: 'humanoid', size: 1.1, weapon: 'axe',
    loot: { gold: [40, 80], items: [{ id: 'goblin_chief_head', chance: 1 }, { id: 'cult_letter', chance: 1 }, { id: 'battleaxe', chance: 1 }, { id: 'potion_cure_moderate', chance: 1 }] },
  },
  ogre: {
    name: 'Minotaur', sprite: 'minotaur', creatureType: 'giant', hp: '5d8+10', ac: 16, attack: 7, damage: '2d6+5', speed: 2.8, xp: 400,
    saves: { fort: 6, ref: 0, will: 1 }, aggro: 7, color: '#8a8a5a', shape: 'humanoid', size: 1.6, weapon: 'club',
    loot: { gold: [30, 90], items: [{ id: 'gem_ruby', chance: 0.5 }, { id: 'ring_of_strength', chance: 0.3 }] },
  },
  bandit: {
    name: 'Bandit', avatar: { gender: 'male', chest: 'leather_chest', legs: 'leather_pants', feet: 'leather_boots', main: 'longsword' }, creatureType: 'humanoid', hp: '1d8+3', ac: 14, attack: 2, damage: '1d6+1', speed: 3.1, xp: 70,
    saves: { fort: 3, ref: 2, will: 0 }, aggro: 7, color: '#7a5a4a', shape: 'humanoid', size: 1.0, weapon: 'blade',
    loot: { gold: [5, 20], items: [{ id: 'short_sword', chance: 0.15 }, { id: 'leather_armor', chance: 0.1 }, { id: 'potion_cure_light', chance: 0.2 }] },
  },
  skeleton: {
    name: 'Skeleton', sprite: 'skeleton_weak', creatureType: 'undead', hp: '1d12', ac: 13, attack: 1, damage: '1d6', speed: 2.8, xp: 55,
    saves: { fort: 0, ref: 0, will: 2 }, aggro: 6, color: '#e8e0d0', shape: 'humanoid', size: 1.0, weapon: 'blade', dr: { amount: 3, bypass: 'bludgeoning' },
    loot: { gold: [0, 3], items: [] },
  },
  skeleton_warrior: {
    name: 'Skeleton Warrior', sprite: 'skeleton', creatureType: 'undead', hp: '4d12', ac: 16, attack: 6, damage: '1d8+2', speed: 2.8, xp: 180,
    saves: { fort: 1, ref: 1, will: 4 }, aggro: 6, color: '#d8d0c0', shape: 'humanoid', size: 1.05, weapon: 'blade',
    loot: { gold: [0, 10], items: [{ id: 'longsword', chance: 0.2 }] },
  },
  zombie: {
    name: 'Zombie', sprite: 'zombie', creatureType: 'undead', hp: '2d12+3', ac: 11, attack: 2, damage: '1d6+1', speed: 1.8, xp: 65,
    saves: { fort: 0, ref: -1, will: 3 }, aggro: 6, color: '#6a8a5a', shape: 'humanoid', size: 1.0, weapon: 'none',
    loot: { gold: [0, 4], items: [] },
  },
  ghoul: {
    name: 'Ghoul', sprite: 'zombie', spriteScale: 0.95, creatureType: 'undead', hp: '2d12+6', ac: 14, attack: 3, damage: '1d6+1', speed: 3.2, xp: 150,
    saves: { fort: 0, ref: 2, will: 5 }, aggro: 7, color: '#9aa070', shape: 'humanoid', size: 0.95, weapon: 'none',
    paralyze: { dc: 12, rounds: 2 },
    loot: { gold: [0, 8], items: [{ id: 'gem_sapphire', chance: 0.15 }] },
  },
  wight: {
    name: 'Wight', sprite: 'skeleton_mage', creatureType: 'undead', hp: '3d12+6', ac: 15, attack: 4, damage: '1d6+2', speed: 3.0, xp: 260,
    saves: { fort: 1, ref: 1, will: 5 }, aggro: 7, color: '#506070', shape: 'humanoid', size: 1.0, weapon: 'none',
    loot: { gold: [10, 30], items: [{ id: 'cloak_resistance_1', chance: 0.3 }] },
  },
  cultist: {
    name: 'Cultist of the Pale Hand', avatar: { gender: 'male', chest: 'mage_vest', legs: 'mage_skirt', head: 'mage_hood', main: 'dagger' }, creatureType: 'humanoid', hp: '2d8+3', ac: 14, attack: 3, damage: '1d6+1', speed: 3.0, xp: 120,
    saves: { fort: 3, ref: 2, will: 3 }, aggro: 7, color: '#5a3a7a', shape: 'humanoid', size: 1.0, weapon: 'blade',
    loot: { gold: [5, 25], items: [{ id: 'potion_cure_light', chance: 0.3 }, { id: 'dagger', chance: 0.2 }] },
  },
  cult_acolyte: {
    name: 'Pale Hand Acolyte', avatar: { gender: 'female', chest: 'mage_vest', legs: 'mage_skirt', head: 'mage_hood', main: 'staff' }, creatureType: 'humanoid', hp: '3d8+3', ac: 14, attack: 3, damage: '1d6', speed: 3.0, xp: 150,
    saves: { fort: 3, ref: 1, will: 5 }, aggro: 8, color: '#7a4a9a', shape: 'humanoid', size: 1.0, weapon: 'staff',
    spells: [{ id: 'magic_missile', level: 3, uses: 2 }, { id: 'doom', level: 3, uses: 1 }],
    loot: { gold: [10, 30], items: [{ id: 'potion_cure_moderate', chance: 0.4 }] },
  },
  cult_priest: {
    name: 'Vashti, Priestess of the Pale Hand', avatar: { gender: 'female', chest: 'mage_vest', legs: 'mage_skirt', main: 'mace', off: 'buckler' }, creatureType: 'humanoid', hp: '6d8+12', ac: 16, attack: 6, damage: '1d6+3', speed: 3.0, xp: 600, boss: true,
    saves: { fort: 7, ref: 3, will: 8 }, aggro: 8, color: '#8a2a9a', shape: 'humanoid', size: 1.05, weapon: 'mace',
    spells: [{ id: 'hold_person', level: 5, uses: 1 }, { id: 'cure_moderate_wounds', level: 5, uses: 2, self: true }, { id: 'doom', level: 5, uses: 1 }],
    loot: { gold: [60, 120], items: [{ id: 'crypt_key', chance: 1 }, { id: 'mace_1', chance: 1 }, { id: 'ring_of_wisdom', chance: 1 }] },
  },
  necromancer: {
    name: 'Malachar the Necromancer', avatar: { gender: 'male', chest: 'mage_vest', legs: 'mage_skirt', head: 'mage_hood', main: 'greatstaff' }, creatureType: 'humanoid', hp: '7d4+14', ac: 17, attack: 5, damage: '1d6+1', speed: 3.0, xp: 1500, boss: true,
    saves: { fort: 6, ref: 5, will: 10 }, aggro: 9, color: '#1a1a2a', shape: 'humanoid', size: 1.1, weapon: 'staff',
    spells: [{ id: 'magic_missile', level: 4, uses: 2 }, { id: 'acid_arrow', level: 5, uses: 1 }, { id: 'ray_of_enfeeblement', level: 5, uses: 1 }, { id: 'vampiric_touch', level: 5, uses: 1 }],
    summons: { id: 'skeleton', count: 2, rounds: 4 },
    loot: { gold: [150, 300], items: [{ id: 'amulet_of_dawn', chance: 1 }, { id: 'staff_of_frost', chance: 1 }, { id: 'ring_protection_2', chance: 1 }, { id: 'gem_sapphire', chance: 1 }] },
  },
};

for (const [id, m] of Object.entries(MONSTERS)) m.id = id;
