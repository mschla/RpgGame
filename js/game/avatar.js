// Maps equipment to Flare avatar sprite layers. Layer order per direction comes from Flare's hero_layers.txt.
import { ITEMS } from '../data/items.js';

// Flare direction index -> draw order of layers (first drawn first)
export const LAYER_ORDER = [
  ['main', 'feet', 'legs', 'hands', 'chest', 'off', 'head'],   // 0 W
  ['main', 'feet', 'legs', 'hands', 'chest', 'off', 'head'],   // 1 NW
  ['feet', 'legs', 'hands', 'chest', 'off', 'head', 'main'],   // 2 N
  ['feet', 'legs', 'hands', 'chest', 'off', 'head', 'main'],   // 3 NE
  ['feet', 'legs', 'hands', 'chest', 'off', 'head', 'main'],   // 4 E
  ['feet', 'legs', 'hands', 'main', 'chest', 'head', 'off'],   // 5 SE
  ['main', 'feet', 'legs', 'hands', 'chest', 'head', 'off'],   // 6 S
  ['main', 'feet', 'legs', 'hands', 'chest', 'off', 'head'],   // 7 SW
];

const WEAPON_LAYER = {
  dagger: 'dagger', short_sword: 'shortsword', short_sword_1: 'shortsword', rapier: 'shortsword',
  longsword: 'longsword', longsword_1: 'longsword', dawnblade: 'longsword',
  battleaxe: 'hand_axe', greataxe: 'battle_axe', greataxe_1: 'battle_axe', greatsword: 'greatsword',
  mace: 'mace', mace_1: 'mace', quarterstaff: 'staff', staff_of_frost: 'greatstaff',
  longbow: 'longbow', longbow_1: 'longbow', light_crossbow: 'shortbow',
};
const SHIELD_LAYER = { small_shield: 'buckler', large_shield: 'kite_shield', large_shield_1: 'kite_shield', tower_shield: 'kite_shield' };
// Head layer a class wears when it has no helmet of its own; heavy armour always comes with its helm
const CLASS_HEAD = { fighter: 'chain_coif', rogue: 'leather_hood', wizard: 'mage_hood' };
const ARMOR_LAYER = {
  none: ['default_chest', 'default_legs'], robe: ['mage_vest', 'mage_skirt'], light: ['leather_chest', 'leather_pants'],
  medium: ['chain_cuirass', 'chain_greaves'], heavy: ['plate_cuirass', 'plate_greaves'],
};

/** Returns { gender, layers: { chest, legs, feet, hands, head, main, off } } with sheet names (without gender prefix). */
export function avatarFromEquipment(c) {
  const gender = c.gender === 'f' ? 'female' : 'male';
  const armor = c.equipment.armor ? ITEMS[c.equipment.armor] : null;
  let set = 'none';
  if (armor) set = armor.category === 'none' ? 'robe' : armor.category;
  const [chest, legs] = ARMOR_LAYER[set];
  const w = c.equipment.weapon ? WEAPON_LAYER[c.equipment.weapon] || 'longsword' : null;
  const s = c.equipment.shield ? SHIELD_LAYER[c.equipment.shield] || 'buckler' : null;
  let head = 'head';
  if (set === 'heavy') head = 'plate_helm';
  else if (CLASS_HEAD[c.cls]) head = CLASS_HEAD[c.cls];
  else if (c.cls === 'barbarian' && gender === 'male') head = 'head_bald';
  return { gender, layers: { chest, legs, feet: set === 'none' || set === 'robe' ? 'default_feet' : 'leather_boots', hands: 'default_hands', head, main: w, off: s } };
}

/** Explicit avatar description used by monsters and NPCs: { gender, chest, legs, head, main, off, feet } */
export function avatarFromSpec(spec) {
  return { gender: spec.gender || 'male', layers: { chest: spec.chest || 'cloth_shirt', legs: spec.legs || 'cloth_pants', feet: spec.feet || 'default_feet', hands: 'default_hands', head: spec.head || 'head', main: spec.main || null, off: spec.off || null } };
}
