import { rollDie, rollDice, randInt, chance } from '../core/dice.js';
import { computeStats, maxHp, distance, isParty, abilityMod, casterInfo, templateOf, classOf, isPlayerLike, canLevelUp } from './entity.js';
import { SPELLS, EFFECT_TEMPLATES } from '../data/spells.js';
import { MONSTERS } from '../data/monsters.js';
import { ITEMS } from '../data/items.js';
import { dirFromDelta } from './assets.js';

export const ROUND = 3.0; // seconds per combat round

export function hostileTo(a, b) {
  if (a === b || a.dead || b.dead) return false;
  if (a.faction === 'neutral' || b.faction === 'neutral') return false;
  return a.faction !== b.faction;
}

export function isHeld(c) { return c.effects.some(e => e.held); }

// ---------------------------------------------------------------- effects
export function addEffect(game, target, eff, duration, name) {
  const e = { ...eff, remaining: duration, name: name || eff.name || eff.key };
  if (e.tempHp && typeof e.tempHp === 'string') { target.tempHp = Math.max(target.tempHp, rollDice(e.tempHp)); delete e.tempHp; }
  const idx = target.effects.findIndex(x => x.key === e.key);
  if (idx >= 0) target.effects[idx] = e; else target.effects.push(e);
  clampHp(target);
  return e;
}

export function removeEffect(target, key) {
  target.effects = target.effects.filter(e => e.key !== key);
  clampHp(target);
}

export function clampHp(c) {
  const m = maxHp(c);
  if (c.hp > m) c.hp = m;
}

export function tickEffects(game, c) {
  for (const e of c.effects) {
    if (e.dot) {
      const dmg = rollDice(e.dot);
      game.log(`${c.name} takes ${dmg} ${e.dotType || 'acid'} damage from ${e.name}.`, 'dmg');
      applyDamage(game, c, dmg, e.dotType || 'acid', null);
      if (c.dead) return;
    }
    e.remaining--;
  }
  const expired = c.effects.filter(e => e.remaining <= 0);
  if (expired.length) {
    for (const e of expired) if (isParty(c) || e.held) game.log(`${e.name} wears off ${c.name}.`, 'info');
    c.effects = c.effects.filter(e => e.remaining > 0);
    clampHp(c);
  }
}

// ---------------------------------------------------------------- saves
export function savingThrow(game, c, type, dc, label) {
  const st = computeStats(c);
  const r = rollDie(20);
  const total = r + st.saves[type];
  const ok = r === 20 || (r !== 1 && total >= dc);
  game.log(`${c.name} ${type === 'fort' ? 'Fortitude' : type === 'ref' ? 'Reflex' : 'Will'} save${label ? ' vs ' + label : ''}: ${r}+${st.saves[type]}=${total} vs DC ${dc}: ${ok ? 'success' : 'failure'}`, ok ? 'save' : 'fail');
  return ok;
}

// ---------------------------------------------------------------- damage
export function applyDamage(game, target, amount, type, source, opts = {}) {
  if (target.dead) return 0;
  let dmg = Math.max(0, Math.floor(amount));
  const st = computeStats(target);
  const physical = ['slashing', 'piercing', 'bludgeoning', 'physical'].includes(type);
  if (physical && st.dr > 0) {
    const t = templateOf(target);
    const bypass = t && t.dr && t.dr.bypass === type;
    if (!bypass) {
      const absorbed = Math.min(st.dr, dmg);
      dmg -= absorbed;
      if (absorbed > 0) game.log(`${target.name}'s damage reduction absorbs ${absorbed}.`, 'info');
    }
  }
  if (target.tempHp > 0) {
    const t = Math.min(target.tempHp, dmg);
    target.tempHp -= t; dmg -= t;
  }
  target.hp -= dmg;
  game.fx.floatText(target, `-${dmg}`, type === 'fire' ? '#ff8040' : type === 'magic' ? '#a0c0ff' : '#ff4040');
  if (target.hp > 0 && dmg > 0) { game.fx.anim(target, 'hit'); if (game.audio) game.audio.voice(target, 'hit'); }
  if (target.kind === 'monster') target.awake = true;
  if (target.hp <= 0) handleDeath(game, target, source);
  else if (source && hostileTo(source, target) && !target.target) {
    if (!(target.kind === 'player' && (target.path.length || target.intent))) target.target = source.uid;
  }
  return dmg;
}

export function heal(game, target, amount) {
  if (target.dead) return 0;
  const m = maxHp(target);
  const before = target.hp;
  target.hp = Math.min(m, target.hp + amount);
  const healed = target.hp - before;
  if (healed > 0) game.fx.floatText(target, `+${healed}`, '#60ff80');
  return healed;
}

export function handleDeath(game, c, killer) {
  c.hp = 0;
  game.fx.anim(c, 'die'); c.moving = false;
  if (game.audio) game.audio.voice(c, 'die');
  if (c.kind === 'henchman') {
    c.dead = true; c.unconscious = true; c.target = null; c.path = [];
    game.log(`${c.name} falls, badly wounded!`, 'death');
    game.fx.floatText(c, 'Down!', '#ffff80');
    return;
  }
  c.dead = true; c.target = null; c.path = [];
  c.deathTime = game.time;
  if (c.kind === 'player') {
    game.log(`${c.name} has died.`, 'death');
    game.onPlayerDeath();
    return;
  }
  game.log(`${c.name} is slain.`, 'death');
  if (c.kind === 'monster') {
    const t = MONSTERS[c.tid];
    if (t.xp) game.awardXp(t.xp, c);
    dropLoot(game, c);
    game.onMonsterKilled(c);
  }
}

export function dropLoot(game, c) {
  const t = MONSTERS[c.tid];
  if (!t.loot) return;
  const gold = t.loot.gold ? randInt(t.loot.gold[0], t.loot.gold[1]) : 0;
  const items = [];
  for (const it of t.loot.items || []) if (chance(it.chance)) items.push(it.id);
  if (gold > 0 || items.length) {
    game.area.entities.push({ type: 'loot', uid: game.nextUid(), name: `Remains of ${c.name}`, x: Math.floor(c.x), y: Math.floor(c.y), loot: { gold, items }, corpse: true });
  }
}

// ---------------------------------------------------------------- attacks
export function canSneakAttack(attacker, defender) {
  if (attacker.cls !== 'rogue') return false;
  if (defender.creatureType === 'undead' || defender.creatureType === 'vermin') return false;
  if (isHeld(defender)) return true;
  return defender.target !== attacker.uid;
}

export function damageTypeOf(attacker) {
  if (attacker.kind === 'monster') {
    const t = MONSTERS[attacker.tid];
    if (t.weapon === 'blade' || t.weapon === 'axe') return 'slashing';
    if (t.weapon === 'bow' || t.weapon === 'spear') return 'piercing';
    if (t.weapon === 'club' || t.weapon === 'mace' || t.weapon === 'staff') return 'bludgeoning';
    return t.creatureType === 'undead' || t.creatureType === 'animal' ? 'slashing' : 'bludgeoning';
  }
  const w = attacker.equipment.weapon ? ITEMS[attacker.equipment.weapon] : null;
  if (!w) return 'bludgeoning';
  if (['mace', 'mace_1', 'quarterstaff', 'staff_of_frost'].includes(w.id)) return 'bludgeoning';
  if (w.ranged || w.id === 'dagger' || w.id === 'rapier') return 'piercing';
  return 'slashing';
}

export function weaponAttack(game, attacker, defender, penalty = 0) {
  if (attacker.dead || defender.dead) return;
  const ast = computeStats(attacker);
  const dst = computeStats(defender);
  const r = rollDie(20);
  const atkBonus = ast.attack - penalty;
  const total = r + atkBonus;
  const held = isHeld(defender);
  attacker.facing = defender.x >= attacker.x ? 1 : -1;
  attacker.dir = dirFromDelta(defender.x - attacker.x, defender.y - attacker.y);
  game.fx.anim(attacker, ast.ranged ? 'shoot' : 'swing');
  if (game.audio) { game.audio.sfx(ast.ranged ? 'shoot' : 'swing', { at: attacker }); game.audio.voice(attacker, 'phys'); }
  if (!ast.ranged) game.fx.lunge(attacker, defender);
  if (ast.ranged) game.fx.projectile(attacker, defender, '#d0c0a0', 'arrow');
  const hit = r !== 1 && (r === 20 || held || total >= dst.ac);
  if (!hit) {
    game.log(`${attacker.name} attacks ${defender.name}: ${r}${fmt(atkBonus)}=${total} vs AC ${dst.ac}: miss.`, 'miss');
    game.fx.floatText(defender, 'miss', '#c0c0c0');
    if (game.audio && !ast.ranged) game.audio.sfx('block', { at: defender, volume: 0.5 });
    if (hostileTo(attacker, defender) && !defender.target && !defender.dead) defender.target = attacker.uid;
    if (defender.kind === 'monster') defender.awake = true;
    return;
  }
  let crit = false;
  if (r >= ast.crit[0] || held) {
    const cr = rollDie(20);
    crit = held || cr + atkBonus >= dst.ac || cr === 20;
  }
  let dmg = rollDice(ast.damageDice) + ast.damageBonus;
  const mult = crit ? ast.crit[1] : 1;
  dmg = Math.max(1, dmg) * mult;
  let extra = '';
  if (attacker.cls === 'ranger') {
    if (defender.creatureType === 'goblinoid' || (attacker.level >= 5 && defender.creatureType === 'undead')) { dmg += 2; extra += ' +2 favored enemy'; }
  }
  if (canSneakAttack(attacker, defender)) {
    const sd = ast.sneakDice || 0;
    if (sd > 0) { const s = rollDice(`${sd}d6`); dmg += s; extra += ` +${s} sneak attack`; }
  }
  const w = attacker.equipment && attacker.equipment.weapon ? ITEMS[attacker.equipment.weapon] : null;
  if (w && w.bonusVs && w.bonusVs[defender.creatureType]) { const b = rollDice(w.bonusVs[defender.creatureType]); dmg += b; extra += ` +${b} holy`; }
  game.log(`${attacker.name} ${crit ? 'CRITICALLY hits' : 'hits'} ${defender.name}: ${r}${fmt(atkBonus)}=${total} vs AC ${dst.ac} for ${dmg} damage${extra}.`, crit ? 'crit' : 'hit');
  if (crit) game.fx.floatText(defender, 'CRIT!', '#ffd040');
  applyDamage(game, defender, dmg, damageTypeOf(attacker), attacker);
  // special attacks
  const t = templateOf(attacker);
  if (t && !defender.dead) {
    if (t.paralyze && defender.creatureType !== 'undead' && !savingThrow(game, defender, 'fort', t.paralyze.dc, 'paralysis')) {
      addEffect(game, defender, { key: 'held', held: true }, t.paralyze.rounds, 'Ghoul Paralysis');
      game.log(`${defender.name} is paralyzed!`, 'fail');
    }
    if (t.poison && !savingThrow(game, defender, 'fort', t.poison.dc, 'poison')) {
      addEffect(game, defender, { key: 'poison', STR: t.poison.STR }, t.poison.rounds, 'Fire Ant Venom');
      game.log(`${defender.name} is poisoned!`, 'fail');
    }
  }
}

function fmt(v) { return v >= 0 ? `+${v}` : `${v}`; }

// ---------------------------------------------------------------- spells
export function spellDc(caster, spell) {
  if (caster.kind === 'monster') return 10 + spell.level + 3;
  const ci = casterInfo(caster);
  return 10 + spell.level + (ci ? abilityMod(caster, ci.ability) : 0);
}

export function casterLevel(caster, spellEntry) {
  if (caster.kind === 'monster') return spellEntry && spellEntry.level ? spellEntry.level : caster.level;
  return caster.level;
}

/** Cast a spell. target is a creature (or null for self). Returns true on success. */
export function castSpell(game, caster, spell, target, entry = null) {
  const lvl = casterLevel(caster, entry);
  const targets = [];
  const dc = spellDc(caster, spell);
  const area = game.area;
  const tgt = target || caster;
  caster.facing = tgt.x >= caster.x ? 1 : -1;
  if (tgt !== caster) caster.dir = dirFromDelta(tgt.x - caster.x, tgt.y - caster.y);
  game.fx.anim(caster, 'cast');
  game.fx.cast(caster, spell.color);
  if (game.audio) game.audio.sfx(spell.damageType || (spell.kind === 'heal' ? 'heal' : spell.fx === 'heal' ? 'heal' : spell.kind === 'hold' ? 'hold' : 'buff'), { at: caster });
  game.log(`${caster.name} casts ${spell.name}.`, 'spell');

  if (spell.kind === 'heal') {
    const amt = rollDice(spell.damage(lvl));
    if (tgt.creatureType === 'undead') {
      game.fx.projectile(caster, tgt, spell.color, 'bolt');
      const half = savingThrow(game, tgt, 'will', dc, spell.name);
      applyDamage(game, tgt, half ? Math.floor(amt / 2) : amt, 'divine', caster);
    } else {
      if (spell.cure) { tgt.effects = tgt.effects.filter(e => !e.harmful && !e.held && !e.dot && !(e.STR < 0)); }
      const h = heal(game, tgt, amt);
      game.fx.burst(tgt, spell.color, 0.8);
      game.log(`${tgt.name} is healed for ${h}.`, 'heal');
    }
    return true;
  }
  if (spell.kind === 'buff') {
    const eff = typeof spell.effect === 'function' ? spell.effect(lvl) : spell.effect;
    const dur = spell.duration(lvl);
    const recipients = spell.party ? area.entities.filter(e => e.faction === caster.faction && !e.dead && e.hp !== undefined && distance(e, caster) <= 8) : [tgt];
    for (const r of recipients) { addEffect(game, r, { ...eff }, dur, spell.name); game.fx.burst(r, spell.color, 0.7); }
    return true;
  }
  if (spell.kind === 'debuff' && spell.area) {
    // an area debuff (Sleep): every foe near the target saves, the weakest first while the hit-dice budget lasts
    game.fx.burst(tgt, spell.color, spell.area);
    const foes = area.entities.filter(e => e.hp !== undefined && !e.dead && hostileTo(caster, e) && distance(e, tgt) <= spell.area + 0.01).sort((a, b) => (a.level || 1) - (b.level || 1));
    let budget = spell.maxHd ? spell.maxHd(lvl) : Infinity;
    for (const e of foes) {
      const hd = e.level || 1;
      if (hd > budget) continue;
      budget -= hd;
      if (e.kind === 'monster') e.awake = true;
      if (spell.save && savingThrow(game, e, spell.save, dc, spell.name)) { game.log(`${e.name} resists.`, 'save'); continue; }
      addEffect(game, e, { ...spell.effect }, spell.duration(lvl), spell.name);
      game.log(`${e.name} ${spell.effect.held ? 'falls asleep' : 'is affected'}!`, 'fail');
    }
    return true;
  }
  if (spell.kind === 'debuff') {
    if (spell.humanoidOnly && !['humanoid', 'goblinoid'].includes(tgt.creatureType) && tgt.kind === 'monster') { game.log(`${spell.name} only affects humanoids.`, 'info'); }
    game.fx.projectile(caster, tgt, spell.color, 'bolt');
    if (spell.save && savingThrow(game, tgt, spell.save, dc, spell.name)) { game.log(`${tgt.name} resists.`, 'save'); return true; }
    addEffect(game, tgt, { ...spell.effect, harmful: true }, spell.duration(lvl), spell.name);
    if (spell.effect.held) game.log(`${tgt.name} is held!`, 'fail');
    if (tgt.kind === 'monster') tgt.awake = true;
    if (hostileTo(caster, tgt) && !tgt.target) tgt.target = caster.uid;
    return true;
  }
  if (spell.kind === 'damage') {
    if (spell.area) {
      for (const e of area.entities) {
        if (e.hp === undefined || e.dead || e.faction === 'neutral') continue;
        if (distance(e, tgt) <= spell.area + 0.01) {
          if (spell.hostileOnly && e.faction === caster.faction) continue;
          targets.push(e);
        }
      }
      if (spell.fx === 'explosion') game.fx.explosion(tgt, spell.color, spell.area); else game.fx.burst(tgt, spell.color, spell.area);
      if (spell.fx === 'bolt') game.fx.projectile(caster, tgt, spell.color, 'bolt');
    } else {
      targets.push(tgt);
      if (spell.fx === 'missile') game.fx.missiles(caster, tgt, spell.color, Math.min(5, 1 + Math.floor((lvl - 1) / 2)));
      else game.fx.projectile(caster, tgt, spell.color, 'bolt');
    }
    for (const t of targets) {
      let dmg = rollDice(spell.damage(lvl, t));
      if (spell.attackRoll) {
        const ast = computeStats(caster); const dst = computeStats(t);
        const r = rollDie(20);
        const bonus = (caster.kind === 'monster' ? MONSTERS[caster.tid].attack : ast.attack - (ast.ranged ? 0 : 0)) ;
        const touchAc = 10 + (t.kind === 'monster' ? Math.max(0, dst.ac - 13) : Math.min(abilityMod(t, 'DEX'), 5)) + (isHeld(t) ? -6 : 0);
        if (r !== 20 && (r === 1 || r + bonus < touchAc)) { game.log(`${caster.name}'s ${spell.name} misses ${t.name} (${r}+${bonus} vs touch AC ${touchAc}).`, 'miss'); game.fx.floatText(t, 'miss', '#c0c0c0'); continue; }
      }
      if (spell.save) {
        const ok = savingThrow(game, t, spell.save, dc, spell.name);
        if (ok) {
          if (spell.saveEffect === 'negate') { continue; }
          dmg = t.cls === 'rogue' && t.level >= 2 && spell.save === 'ref' ? 0 : Math.floor(dmg / 2);
          if (dmg === 0) { game.log(`${t.name} evades completely!`, 'save'); continue; }
        }
      }
      game.log(`${spell.name} deals ${dmg} ${spell.damageType} damage to ${t.name}.`, 'dmg');
      const dealt = applyDamage(game, t, dmg, spell.damageType, caster);
      if (spell.drain && dealt > 0) { const h = heal(game, caster, dealt); if (h) game.log(`${caster.name} drains ${h} hit points.`, 'heal'); }
      if (spell.dot && !t.dead) addEffect(game, t, { key: 'acid_dot', dot: spell.dot.damage, dotType: 'acid', harmful: true }, spell.dot.rounds(lvl), spell.name);
      if (t.kind === 'monster') t.awake = true;
    }
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- special abilities
export function useRage(game, c) {
  if (c.rageUses <= 0) { game.log('No rage uses left today.', 'info'); return false; }
  if (c.effects.some(e => e.key === 'rage')) { game.log('You are already raging.', 'info'); return false; }
  c.rageUses--;
  const t = EFFECT_TEMPLATES.rage;
  addEffect(game, c, { ...t }, t.duration + Math.floor(c.level / 4), 'Barbarian Rage');
  c.hp += 2 * (2 + Math.floor(c.level / 4)); // CON bonus hp
  clampHp(c);
  game.fx.burst(c, '#ff4040', 0.8);
  if (game.audio) game.audio.sfx('warcry', { at: c });
  game.log(`${c.name} flies into a rage!`, 'spell');
  return true;
}

export function useTurnUndead(game, c) {
  if (c.turnUses <= 0) { game.log('No Turn Undead uses left today.', 'info'); return false; }
  c.turnUses--;
  game.fx.burst(c, '#fff0a0', 4);
  if (game.audio) game.audio.sfx('turn', { at: c });
  game.log(`${c.name} presents the holy symbol and channels the light of dawn!`, 'spell');
  let hitAny = false;
  for (const e of [...game.area.entities]) {
    if (e.creatureType !== 'undead' || e.dead || distance(e, c) > 4) continue;
    const dmg = rollDice(`${c.level}d6`) + abilityMod(c, 'CHA');
    const half = savingThrow(game, e, 'will', 10 + c.level + abilityMod(c, 'CHA'), 'Turn Undead');
    const d = half ? Math.floor(dmg / 2) : dmg;
    game.log(`The holy light sears ${e.name} for ${d}.`, 'dmg');
    applyDamage(game, e, d, 'divine', c);
    hitAny = true;
  }
  if (!hitAny) game.log('No undead are near enough to be affected.', 'info');
  return true;
}

export function usePotion(game, c, itemId) {
  const it = ITEMS[itemId];
  if (!it || it.type !== 'potion') return false;
  if (it.heal) {
    const amt = rollDice(it.heal);
    const h = heal(game, c, amt);
    game.log(`${c.name} drinks ${it.name} and heals ${h}.`, 'heal');
  } else if (it.buff) {
    const t = EFFECT_TEMPLATES[it.buff];
    addEffect(game, c, { ...t }, t.duration, t.name);
    game.log(`${c.name} drinks ${it.name}.`, 'spell');
  }
  game.fx.burst(c, '#80ff80', 0.6);
  if (game.audio) game.audio.sfx('potion', { at: c });
  return true;
}
