// Icon assignments from game-icons.net (CC BY 3.0). Keys are spell ids, item ids, class ids or
// special names; values are "author/icon-name" paths in the game-icons/icons repository.
// tools/build-icons.mjs copies these into assets/icons/, the UI loads them as CSS masks.
export const ICONS = {
  // ---- spells
  magic_missile: 'lorc/missile-swarm', burning_hands: 'delapouite/fire-spell-cast', mage_armor: 'lorc/magic-shield', shield: 'lorc/energy-shield',
  ray_of_enfeeblement: 'lorc/marrow-drain', acid_arrow: 'lorc/chemical-bolt', bulls_strength: 'lorc/bull', cats_grace: 'lorc/cat',
  scorching_ray: 'lorc/fire-ray', fireball: 'lorc/fireball', lightning_bolt: 'lorc/focused-lightning', haste: 'lorc/sprint',
  vampiric_touch: 'lorc/evil-hand', stoneskin: 'lorc/stone-block', ice_storm: 'lorc/frozen-orb', cone_of_cold: 'lorc/icicles-aura',
  cure_light_wounds: 'lorc/bandage-roll', cure_moderate_wounds: 'delapouite/healing', cure_serious_wounds: 'sbed/health-increase', cure_critical_wounds: 'zeromancer/heart-plus',
  bless: 'lorc/angel-wings', divine_favor: 'lorc/sun', doom: 'lorc/dread-skull', aid: 'delapouite/healing-shield', hold_person: 'delapouite/handcuffed',
  prayer: 'lorc/prayer', searing_light: 'lorc/sunbeams', flame_strike: 'lorc/fire-wave', divine_power: 'lorc/mailed-fist', heal: 'delapouite/hand-of-god',
  // ---- abilities
  rage: 'delapouite/enrage', turn: 'delapouite/sun-priest', rest: 'delapouite/night-sleep', attack: 'lorc/sword-clash',
  // ---- classes
  fighter: 'lorc/crossed-swords', barbarian: 'delapouite/barbarian', rogue: 'lorc/rogue', ranger: 'lorc/bowman', cleric: 'lorc/holy-grail', wizard: 'lorc/wizard-staff',
  // ---- weapons
  dagger: 'lorc/plain-dagger', quarterstaff: 'delapouite/bo', mace: 'delapouite/flanged-mace', light_crossbow: 'carl-olsen/crossbow',
  short_sword: 'skoll/gladius', rapier: 'lorc/pointy-sword', longsword: 'lorc/broadsword', battleaxe: 'lorc/battle-axe', greataxe: 'delapouite/war-axe',
  greatsword: 'delapouite/two-handed-sword', longbow: 'delapouite/bow-arrow', longsword_1: 'lorc/broadsword', mace_1: 'delapouite/flanged-mace',
  short_sword_1: 'skoll/gladius', greataxe_1: 'delapouite/war-axe', longbow_1: 'delapouite/bow-arrow', staff_of_frost: 'delapouite/crescent-staff', dawnblade: 'lorc/shining-sword',
  // ---- armor & shields
  robe: 'lorc/robe', padded_armor: 'lorc/armor-vest', leather_armor: 'delapouite/leather-armor', studded_leather: 'lorc/leather-vest', chain_shirt: 'lorc/mail-shirt',
  scale_mail: 'lorc/scale-mail', chainmail: 'willdabeast/chain-mail', breastplate: 'lorc/breastplate', half_plate: 'delapouite/chest-armor', full_plate: 'lorc/layered-armor',
  studded_leather_1: 'lorc/leather-vest', chainmail_1: 'willdabeast/chain-mail',
  small_shield: 'willdabeast/round-shield', large_shield: 'lorc/crenulated-shield', tower_shield: 'delapouite/roman-shield', large_shield_1: 'lorc/crenulated-shield',
  // ---- accessories
  ring_protection_1: 'delapouite/ring', ring_protection_2: 'delapouite/ring', ring_of_strength: 'delapouite/power-ring', ring_of_wisdom: 'delapouite/diamond-ring',
  amulet_health: 'lorc/gem-pendant', amulet_natural_armor: 'lorc/gem-necklace', amulet_of_dawn: 'delapouite/emerald-necklace', boots_of_striding: 'lorc/boots', cloak_resistance_1: 'lucasms/cloak',
  // ---- consumables
  potion_cure_light: 'delapouite/health-potion', potion_cure_moderate: 'lorc/standing-potion', potion_cure_serious: 'lorc/potion-ball',
  potion_bulls_strength: 'lorc/bubbling-flask', potion_barkskin: 'lorc/round-bottom-flask', potion_speed: 'lorc/fizzing-flask',
  // ---- misc
  thieves_tools: 'delapouite/lockpicks', holy_symbol: 'lorc/holy-symbol', torch: 'delapouite/torch', silver_locket: 'delapouite/heart-necklace',
  goblin_chief_head: 'delapouite/goblin-head', crypt_key: 'lorc/skeleton-key', cult_letter: 'lorc/scroll-unfurled', gem_ruby: 'lorc/gems', gem_sapphire: 'lorc/crystal-bars',
  wolf_pelt: 'delapouite/animal-hide', rat_tail: 'delapouite/rat', gold: 'delapouite/two-coins',
  // ---- fallbacks by item type
  type_weapon: 'lorc/broadsword', type_armor: 'lorc/breastplate', type_shield: 'lorc/crenulated-shield', type_ring: 'delapouite/ring', type_amulet: 'lorc/gem-pendant',
  type_cloak: 'lucasms/cloak', type_boots: 'lorc/boots', type_potion: 'lorc/standing-potion', type_misc: 'lorc/swap-bag', type_key: 'lorc/skeleton-key', type_gem: 'lorc/gems',
};

/** File name of an icon inside assets/icons/ */
export function iconFile(path) { return path.replace('/', '_') + '.svg'; }
