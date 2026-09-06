import { buildArea, TILE } from '../data/areas.js';
import { ITEMS, EQUIP_SLOTS } from '../data/items.js';
import { SPELLS } from '../data/spells.js';
import { QUESTS } from '../data/quests.js';
import { DIALOGUES } from '../data/dialogues.js';
import { MONSTERS } from '../data/monsters.js';
import { CLASSES } from '../data/classes.js';
import { findPath, hasLineOfSight } from '../core/pathfinding.js';
import { rollDie, rollDice } from '../core/dice.js';
import * as E from './entity.js';
import * as C from './combat.js';
import { dirFromDelta } from './assets.js';

const SAVE_KEY = 'bramblewick_save_';

export class Game {
  constructor(ui, renderer) {
    this.ui = ui; this.renderer = renderer;
    this.fx = renderer.fx;
    this.areas = {}; this.area = null;
    this.player = null; this.henchman = null; this.henchmanMode = 'follow';
    this.quests = {}; this.flags = {};
    this.time = 0; this.clock = 8 * 3600; this.paused = true; this.running = false;
    this.roundTimer = 0; this.logLines = [];
    this.pendingSpell = null; this.hover = null; this.dialogue = null;
    this.gameOver = false; this.victory = false;
    this.lastVis = -1; this.keys = {};
    this.visible = new Set();
  }

  nextUid() { return E.nextUid(); }

  // ------------------------------------------------------------ logging
  log(msg, cls = '') {
    this.logLines.push({ msg, cls, t: this.time });
    if (this.logLines.length > 300) this.logLines.shift();
    this.ui.appendLog(msg, cls);
  }

  // ------------------------------------------------------------ new game
  newGame(opts) {
    this.areas = {}; this.quests = {}; this.flags = {}; this.logLines = []; this.time = 0; this.clock = 8 * 3600;
    this.gameOver = false; this.victory = false; this.henchman = null; this.dialogue = null; this.pendingSpell = null;
    this.player = E.createPlayer(opts);
    const area = this.getArea('town');
    this.area = area;
    this.player.x = area.start[0] + 0.5; this.player.y = area.start[1] + 0.5;
    area.entities.push(this.player);
    this.running = true; this.paused = false;
    this.ui.clearLog();
    this.log(`Welcome to Bramblewick, ${this.player.name}. Click to move, click enemies to attack, click people to talk. Press Space to pause.`, 'info');
    this.log('The town is uneasy. Captain Harlan by the well is looking for capable hands.', 'info');
    this.updateVisibility(true);
    this.ui.showAreaBanner(area.name);
    this.ui.refreshAll();
  }

  getArea(id) {
    if (!this.areas[id]) this.areas[id] = this.instantiateArea(id);
    return this.areas[id];
  }

  instantiateArea(id) {
    const def = buildArea(id);
    const area = { id, name: def.name, width: def.width, height: def.height, tiles: def.tiles, outdoor: def.outdoor, start: def.start,
      entities: [], explored: new Uint8Array(def.width * def.height) };
    if (def.outdoor) area.explored.fill(1);
    for (const e of def.entities) {
      if (e.type === 'monster') {
        area.entities.push(E.createMonster(e.tid, e.x, e.y, e.name));
      } else if (e.type === 'npc') {
        area.entities.push({ uid: this.nextUid(), kind: 'npc', type: 'npc', id: e.id, name: e.name, x: e.x + 0.5, y: e.y + 0.5, faction: 'neutral', dialogue: e.dialogue,
          color: e.color, shape: e.shape || 'humanoid', size: 1, weaponLook: e.weapon, armorLook: e.armor, sprite: e.sprite || null, avatar: e.avatar || null, effects: [], hp: 20, maxHpBase: 20, henchmanId: e.henchman ? e.id : null, facing: 1, dir: 6, npcTimer: Math.random() * 5 });
      } else if (e.type === 'chest') {
        area.entities.push({ uid: this.nextUid(), type: 'chest', name: e.locked ? 'Locked Chest' : 'Chest', x: e.x, y: e.y, loot: { gold: e.loot.gold || 0, items: [...(e.loot.items || [])] }, locked: e.locked || 0, trap: e.trap ? { ...e.trap, found: false, disarmed: false } : null, opened: false });
      } else if (e.type === 'transition') {
        area.entities.push({ uid: this.nextUid(), type: 'transition', name: e.label, x: e.x, y: e.y, w: e.w || 1, to: e.to, tx: e.tx, ty: e.ty });
      } else if (e.type === 'trap') {
        area.entities.push({ uid: this.nextUid(), type: 'trap', name: e.name, x: e.x, y: e.y, dc: e.dc, disarmDc: e.disarmDc, damage: e.damage, damageType: e.damageType || 'piercing', found: false, disarmed: false, triggered: false });
      } else if (e.type === 'door') {
        area.entities.push({ uid: this.nextUid(), type: 'door', name: e.name, x: e.x, y: e.y, locked: !!e.locked, dc: e.dc, key: e.key, open: false });
      } else if (e.type === 'sign') {
        area.entities.push({ uid: this.nextUid(), type: 'sign', name: 'Sign', x: e.x, y: e.y, text: e.label });
      }
    }
    return area;
  }

  // ------------------------------------------------------------ helpers
  tileAt(x, y) {
    if (x < 0 || y < 0 || x >= this.area.width || y >= this.area.height) return TILE['X'];
    return TILE[this.area.tiles[y][x]] || TILE['.'];
  }
  tileChar(x, y) { return this.area.tiles[y] ? this.area.tiles[y][x] : 'X'; }
  isWalkable(x, y) {
    if (!this.tileAt(x, y).walk) return false;
    for (const e of this.area.entities) if (e.type === 'door' && !e.open && e.x === x && e.y === y) return false;
    return true;
  }
  isOpaque(x, y) {
    if (this.tileAt(x, y).opaque) return true;
    for (const e of this.area.entities) if (e.type === 'door' && !e.open && e.x === x && e.y === y) return true;
    return false;
  }
  creatures() { return this.area.entities.filter(e => e.hp !== undefined && e.kind); }
  creatureAt(tx, ty, except) {
    for (const e of this.area.entities) if (e.hp !== undefined && !e.dead && e !== except && Math.floor(e.x) === tx && Math.floor(e.y) === ty) return e;
    return null;
  }
  byUid(uid) { return this.area.entities.find(e => e.uid === uid) || null; }
  los(a, b) { return hasLineOfSight(a.x, a.y, b.x, b.y, (x, y) => this.isOpaque(x, y)); }
  party() { return [this.player, this.henchman].filter(c => c && !c.dead && c.areaId === undefined); }
  partyMembers() { return this.area.entities.filter(e => e.faction === 'party' && !e.dead); }
  hostilesAwake(range = 12, from = this.player) {
    return this.area.entities.filter(e => e.kind === 'monster' && !e.dead && e.awake && E.distance(e, from) <= range);
  }
  inCombat() { return this.hostilesAwake(14).length > 0; }

  computePath(c, tx, ty) {
    const sx = Math.floor(c.x), sy = Math.floor(c.y);
    const target = c.target ? this.byUid(c.target) : null;
    const passable = (x, y) => {
      if (!this.isWalkable(x, y)) return false;
      const occ = this.creatureAt(x, y, c);
      if (occ && occ !== target && (occ.faction !== c.faction || occ.kind === 'npc') && !(x === tx && y === ty)) return false;
      return true;
    };
    const p = findPath(sx, sy, tx, ty, passable, this.area.width, this.area.height);
    return p;
  }

  moveTo(c, tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.area.width || ty >= this.area.height) return false;
    const p = this.computePath(c, tx, ty);
    c.path = p || [];
    c.repathAt = this.time + 0.6;
    return !!p;
  }

  // ------------------------------------------------------------ main loop
  update(dt) {
    if (!this.running || this.gameOver) return;
    this.fx.update(dt);
    if (this.paused || this.dialogue || this.ui.modalOpen()) return;
    this.time += dt; this.clock += dt * 20;
    this.roundTimer += dt;
    if (this.roundTimer >= C.ROUND) {
      this.roundTimer -= C.ROUND;
      for (const c of this.creatures()) if (!c.dead) C.tickEffects(this, c);
      this.checkHenchmanRecovery();
    }
    this.handleKeys();
    for (const c of [...this.area.entities]) {
      if (c.hp === undefined || c.dead) continue;
      if (c.kind === 'player') this.updatePlayer(c, dt);
      else if (c.kind === 'henchman') this.updateHenchman(c, dt);
      else if (c.kind === 'monster') this.updateMonster(c, dt);
      else if (c.kind === 'npc') this.updateNpc(c, dt);
    }
    this.updateVisibility();
    this.checkTraps();
    this.ui.tick(dt);
  }

  handleKeys() {
    const p = this.player;
    if (p.dead || p.path.length) return;
    let dx = 0, dy = 0;
    if (this.keys.w || this.keys.arrowup) { dx -= 1; dy -= 1; }
    if (this.keys.s || this.keys.arrowdown) { dx += 1; dy += 1; }
    if (this.keys.a || this.keys.arrowleft) { dx -= 1; dy += 1; }
    if (this.keys.d || this.keys.arrowright) { dx += 1; dy -= 1; }
    if (!dx && !dy) return;
    dx = Math.sign(dx); dy = Math.sign(dy);
    const tx = Math.floor(p.x) + dx, ty = Math.floor(p.y) + dy;
    if (this.isWalkable(tx, ty) && !this.creatureAt(tx, ty, p)) {
      if (dx && dy && (!this.isWalkable(tx, Math.floor(p.y)) || !this.isWalkable(Math.floor(p.x), ty))) return;
      p.target = null; p.intent = null; p.path = [[tx, ty]];
    }
  }

  stepMovement(c, dt) {
    if (!c.path.length) return false;
    if (C.isHeld(c)) return false;
    const st = E.computeStats(c);
    const [nx, ny] = c.path[0];
    const cx = nx + 0.5, cy = ny + 0.5;
    const occ = this.creatureAt(nx, ny, c);
    if (occ && !(Math.floor(c.x) === nx && Math.floor(c.y) === ny)) {
      c.blockedTime = (c.blockedTime || 0) + dt;
      if (c.blockedTime > 0.4) {
        c.blockedTime = 0;
        const last = c.path[c.path.length - 1];
        this.moveTo(c, last[0], last[1]);
        if (c.path.length && this.creatureAt(c.path[0][0], c.path[0][1], c)) c.path = [];
      }
      return false;
    }
    c.blockedTime = 0;
    const d = Math.hypot(cx - c.x, cy - c.y);
    const step = st.speed * dt;
    const mx = cx - c.x, my = cy - c.y;
    if (d <= step) { c.x = cx; c.y = cy; c.path.shift(); }
    else { c.x += mx / d * step; c.y += my / d * step; }
    if (d > 0.01) { c.facing = mx > 0.01 ? 1 : mx < -0.01 ? -1 : c.facing; c.dir = dirFromDelta(mx, my); }
    c.moving = true;
    return true;
  }

  // ------------------------------------------------------------ player
  updatePlayer(p, dt) {
    p.moving = false;
    if (p.intent) { this.processIntent(p, dt); return; }
    if (p.target) {
      const t = this.byUid(p.target);
      if (!t || t.dead || !C.hostileTo(p, t)) { p.target = null; p.path = []; }
      else this.pursueAndAttack(p, t, dt);
      return;
    }
    this.stepMovement(p, dt);
    if (!p.path.length && !p.intent && !p.target) {
      // auto-retaliate against adjacent attackers
      for (const m of this.area.entities) if (m.kind === 'monster' && !m.dead && m.target === p.uid && E.distance(m, p) <= 1.7) { p.target = m.uid; break; }
    }
  }

  pursueAndAttack(c, t, dt) {
    const st = E.computeStats(c);
    const d = E.distance(c, t);
    if (C.isHeld(c)) return;
    const inRange = d <= st.range && (st.range <= 2 || this.los(c, t));
    if (inRange) {
      c.path = [];
      c.facing = t.x >= c.x ? 1 : -1; c.dir = dirFromDelta(t.x - c.x, t.y - c.y);
      if (this.time >= c.nextAttackAt) {
        const n = st.attacks;
        const idx = c.attackIndex % n;
        C.weaponAttack(this, c, t, idx * 5);
        c.attackIndex = (idx + 1) % n;
        c.nextAttackAt = this.time + C.ROUND / n;
      }
    } else {
      if (!c.path.length || this.time >= (c.repathAt || 0)) {
        this.moveTo(c, Math.floor(t.x), Math.floor(t.y));
        c.repathAt = this.time + 0.5;
      }
      this.stepMovement(c, dt);
    }
  }

  processIntent(p, dt) {
    const it = p.intent;
    const e = this.byUid(it.uid);
    if (!e) { p.intent = null; return; }
    const ex = e.hp !== undefined ? e.x : e.x + 0.5 + ((e.w || 1) - 1) / 2, ey = e.hp !== undefined ? e.y : e.y + 0.5;
    const d = Math.hypot(ex - p.x, ey - p.y);
    const need = it.range || 1.6;
    if (d <= need) {
      p.path = []; p.intent = null;
      this.performInteraction(p, e, it);
      return;
    }
    if (!p.path.length || this.time >= (p.repathAt || 0)) {
      const ok = this.moveTo(p, Math.floor(ex), Math.floor(ey));
      if (!ok && !p.path.length) { p.intent = null; this.log("You can't reach that.", 'info'); return; }
    }
    this.stepMovement(p, dt);
    if (!p.path.length && Math.hypot(ex - p.x, ey - p.y) > need) {
      // arrived as close as possible
      if (Math.hypot(ex - p.x, ey - p.y) <= need + 1.0) { p.intent = null; this.performInteraction(p, e, it); }
      else { p.intent = null; this.log("You can't reach that.", 'info'); }
    }
  }

  performInteraction(p, e, it) {
    switch (it.type) {
      case 'talk': this.startDialogue(e); break;
      case 'loot': this.openContainer(e); break;
      case 'transition': this.changeArea(e.to, e.tx, e.ty); break;
      case 'door': this.tryDoor(e); break;
      case 'disarm': this.tryDisarm(e); break;
      case 'read': this.log(`The sign reads: "${e.text}"`, 'info'); break;
      case 'cast': {
        const spell = SPELLS[it.spell];
        if (it.fromQuickbar) this.castPlayerSpell(spell, e, true);
        break;
      }
    }
  }

  // ------------------------------------------------------------ clicks
  clickEntity(e) {
    const p = this.player;
    if (p.dead || this.gameOver) return;
    if (this.pendingSpell) { this.targetSpell(e); return; }
    if (e.hp !== undefined) {
      if (e.dead) return;
      if (e.kind === 'monster') { p.target = e.uid; p.intent = null; return; }
      if (e.kind === 'npc') { p.target = null; p.intent = { type: 'talk', uid: e.uid, range: 1.8 }; return; }
      if (e.kind === 'henchman') { p.target = null; p.intent = { type: 'talk', uid: e.uid, range: 1.8 }; return; }
      return;
    }
    p.target = null;
    if (e.type === 'chest' || e.type === 'loot') p.intent = { type: 'loot', uid: e.uid, range: 1.6 };
    else if (e.type === 'transition') p.intent = { type: 'transition', uid: e.uid, range: 0.8 };
    else if (e.type === 'door') p.intent = { type: 'door', uid: e.uid, range: 1.6 };
    else if (e.type === 'trap') p.intent = { type: 'disarm', uid: e.uid, range: 1.6 };
    else if (e.type === 'sign') p.intent = { type: 'read', uid: e.uid, range: 1.8 };
  }

  clickTile(tx, ty) {
    const p = this.player;
    if (p.dead || this.gameOver) return;
    if (this.pendingSpell) { this.targetSpellTile(tx, ty); return; }
    p.target = null; p.intent = null;
    if (!this.isWalkable(tx, ty)) {
      // find nearest walkable neighbor
      let best = null, bd = 9;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (this.isWalkable(tx + dx, ty + dy)) { const d = Math.abs(dx) + Math.abs(dy); if (d < bd) { bd = d; best = [tx + dx, ty + dy]; } }
      }
      if (!best) return;
      [tx, ty] = best;
    }
    this.moveTo(p, tx, ty);
    this.fx.clickMarker(tx, ty);
  }

  examine(e) {
    if (!e) return;
    if (e.kind === 'monster') {
      const t = MONSTERS[e.tid];
      const st = E.computeStats(e);
      this.log(`${e.name}: ${t.creatureType}, AC ${st.ac}, ${e.hp <= e.maxHpBase * 0.25 ? 'near death' : e.hp <= e.maxHpBase * 0.6 ? 'wounded' : 'uninjured'}.`, 'info');
    } else if (e.type === 'chest') this.log(`${e.name}${e.opened ? ' (empty)' : e.locked ? ' (locked, DC ' + e.locked + ')' : ''}.`, 'info');
    else if (e.type === 'trap') this.log(`${e.name}: disarm DC ${e.disarmDc}.`, 'info');
    else if (e.type === 'door') this.log(`${e.name}${e.locked ? ' (locked)' : ''}.`, 'info');
    else if (e.name) this.log(`${e.name}.`, 'info');
  }

  // ------------------------------------------------------------ spells & abilities
  beginSpell(spellId) {
    const p = this.player;
    const spell = SPELLS[spellId];
    if (!spell || p.dead) return;
    const slot = p.spellSlots[spell.level];
    if (!slot || slot.cur <= 0) { this.log(`No level ${spell.level} spell slots remaining. Rest to recover.`, 'info'); return; }
    if (E.armorCheck(p) > 0) { this.log('You cannot cast arcane spells while wearing armor or a shield.', 'info'); return; }
    if (spell.target === 'self') { this.castPlayerSpell(spell, p, true); return; }
    this.pendingSpell = spell;
    this.ui.setTargeting(spell);
  }

  cancelTargeting() { this.pendingSpell = null; this.ui.setTargeting(null); }

  targetSpell(e) {
    const spell = this.pendingSpell;
    if (e.hp === undefined || e.dead) { this.log('Invalid target.', 'info'); return; }
    if (spell.target === 'enemy' && e.faction === 'party') { this.log('That spell targets enemies.', 'info'); return; }
    if (spell.target === 'ally' && e.faction === 'hostile') { this.log('That spell targets allies.', 'info'); return; }
    if (e.faction === 'neutral' && spell.target === 'enemy') { this.log('You cannot attack that person.', 'info'); return; }
    this.cancelTargeting();
    const p = this.player;
    const d = E.distance(p, e);
    if (d <= spell.range && (spell.range <= 2 || this.los(p, e))) this.castPlayerSpell(spell, e, true);
    else { p.target = null; p.intent = { type: 'cast', uid: e.uid, range: spell.range, spell: spell.id, fromQuickbar: true }; }
  }

  targetSpellTile(tx, ty) {
    const spell = this.pendingSpell;
    if (!spell.area) { this.log('Choose a creature to target.', 'info'); return; }
    // Cast at a point: use a phantom target
    this.cancelTargeting();
    const p = this.player;
    const ghost = { uid: -1, name: 'the ground', x: tx + 0.5, y: ty + 0.5, faction: 'none', effects: [], hp: undefined };
    if (Math.hypot(ghost.x - p.x, ghost.y - p.y) > spell.range) { this.log('Too far away.', 'info'); return; }
    this.castPlayerSpell(spell, ghost, true);
  }

  castPlayerSpell(spell, target, consume) {
    const p = this.player;
    if (p.dead) return;
    const slot = p.spellSlots[spell.level];
    if (!slot || slot.cur <= 0) { this.log('No spell slots remaining.', 'info'); return; }
    if (consume) slot.cur--;
    C.castSpell(this, p, spell, target);
    p.nextAttackAt = Math.max(p.nextAttackAt, this.time + C.ROUND * 0.6);
    if (target && target.kind === 'monster' && !target.dead && spell.target === 'enemy') p.target = target.uid;
    this.ui.refreshHud(); this.ui.refreshQuickbar();
  }

  useAbility(name) {
    const p = this.player;
    if (p.dead) return;
    if (name === 'rage') C.useRage(this, p);
    if (name === 'turn') C.useTurnUndead(this, p);
    this.ui.refreshHud(); this.ui.refreshQuickbar();
  }

  drinkPotion(itemId, who = this.player) {
    if (!E.hasItem(who, itemId)) return;
    E.removeItem(who, itemId, 1);
    C.usePotion(this, who, itemId);
    this.ui.refreshAll();
  }

  // ------------------------------------------------------------ monsters AI
  updateMonster(m, dt) {
    m.moving = false;
    m.aiTimer -= dt;
    const t = MONSTERS[m.tid];
    if (C.isHeld(m)) return;
    if (m.aiTimer <= 0) {
      m.aiTimer = 0.25;
      const party = this.partyMembers();
      let tgt = m.target ? this.byUid(m.target) : null;
      if (tgt && (tgt.dead || E.distance(m, tgt) > 18)) { tgt = null; m.target = null; }
      if (!tgt) {
        let best = null, bd = Infinity;
        for (const pm of party) {
          const d = E.distance(m, pm);
          if (d <= (m.awake ? 14 : t.aggro) && d < bd && this.los(m, pm)) { best = pm; bd = d; }
        }
        if (best) { m.target = best.uid; tgt = best; if (!m.awake) { m.awake = true; if (m.boss) this.log(`${m.name} turns to face you!`, 'info'); } }
      }
      if (!tgt) {
        m.awake = false;
        if (Math.hypot(m.x - m.homeX, m.y - m.homeY) > 1 && !m.path.length) this.moveTo(m, Math.floor(m.homeX), Math.floor(m.homeY));
      } else if (this.time >= (m.spellCheckAt || 0)) {
        m.spellCheckAt = this.time + C.ROUND;
        if (this.monsterTryCast(m, tgt)) return;
      }
    }
    const tgt = m.target ? this.byUid(m.target) : null;
    if (tgt && !tgt.dead) this.pursueAndAttack(m, tgt, dt);
    else this.stepMovement(m, dt);
  }

  monsterTryCast(m, tgt) {
    const t = MONSTERS[m.tid];
    if (t.summons && m.summonsLeft > 0 && m.hp < m.maxHpBase * 0.7) {
      m.summonsLeft--;
      this.log(`${m.name} raises the dead!`, 'spell');
      this.fx.burst(m, '#8040c0', 2);
      for (let i = 0; i < t.summons.count; i++) {
        const spots = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
        for (const [dx, dy] of spots) {
          const x = Math.floor(m.x) + dx, y = Math.floor(m.y) + dy;
          if (this.isWalkable(x, y) && !this.creatureAt(x, y)) {
            const s = E.createMonster(t.summons.id, x, y, 'Risen Skeleton');
            s.awake = true; s.target = tgt.uid; s.summoned = true;
            this.area.entities.push(s);
            break;
          }
        }
      }
      m.nextAttackAt = this.time + C.ROUND;
      return true;
    }
    if (!m.spells || !m.spells.length) return false;
    const usable = m.spells.filter(s => s.left > 0);
    if (!usable.length) return false;
    if (Math.random() < (m.boss ? 0.15 : 0.35)) return false;
    const d = E.distance(m, tgt);
    for (const s of usable) {
      const spell = SPELLS[s.id];
      if (s.self) {
        if (m.hp < m.maxHpBase * 0.5) { s.left--; C.castSpell(this, m, spell, m, s); m.nextAttackAt = this.time + C.ROUND; return true; }
        continue;
      }
      if (d <= spell.range && this.los(m, tgt)) {
        s.left--; C.castSpell(this, m, spell, tgt, s); m.nextAttackAt = this.time + C.ROUND; return true;
      }
    }
    return false;
  }

  updateNpc(n, dt) {
    n.moving = false;
    n.npcTimer -= dt;
    if (n.npcTimer <= 0) {
      n.npcTimer = 3 + Math.random() * 5;
      n.facing = Math.random() < 0.5 ? 1 : -1;
      if (!this.dialogue || this.dialogue.npc !== n) n.dir = [4, 5, 6, 7, 0][Math.floor(Math.random() * 5)];
    }
  }

  // ------------------------------------------------------------ henchman AI
  updateHenchman(h, dt) {
    h.moving = false;
    if (h.unconscious) return;
    if (C.isHeld(h)) return;
    const p = this.player;
    h.aiTimer = (h.aiTimer || 0) - dt;
    if (h.aiTimer <= 0) {
      h.aiTimer = 0.3;
      // potion when low
      if (h.hp < E.maxHp(h) * 0.3 && E.hasItem(h, 'potion_cure_light') && this.time >= h.nextAttackAt) { this.drinkPotion('potion_cure_light', h); h.nextAttackAt = this.time + C.ROUND; }
      let tgt = h.target ? this.byUid(h.target) : null;
      if (tgt && (tgt.dead || E.distance(h, tgt) > 14)) { tgt = null; h.target = null; }
      if (!tgt && this.henchmanMode !== 'passive') {
        let best = null, bd = Infinity;
        for (const m of this.area.entities) {
          if (m.kind !== 'monster' || m.dead) continue;
          const d = E.distance(h, m);
          const threat = m.awake && (m.target === p.uid || m.target === h.uid);
          if ((threat && d <= 12 || d <= 6) && this.los(h, m) && d < bd) { best = m; bd = d; }
        }
        if (best) { h.target = best.uid; tgt = best; }
      }
      if (this.henchmanMode === 'passive') { h.target = null; tgt = null; }
    }
    const tgt = h.target ? this.byUid(h.target) : null;
    if (tgt && !tgt.dead && E.distance(h, p) < 16) { this.pursueAndAttack(h, tgt, dt); return; }
    const d = E.distance(h, p);
    if (d > 2.5) {
      if (!h.path.length || this.time >= (h.repathAt || 0)) { this.moveTo(h, Math.floor(p.x), Math.floor(p.y)); h.repathAt = this.time + 0.5; }
      if (d > 20) { this.teleportNear(h, p); h.path = []; }
    } else if (h.path.length && d < 1.5) h.path = [];
    this.stepMovement(h, dt);
  }

  teleportNear(c, target) {
    for (let r = 1; r <= 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = Math.floor(target.x) + dx, y = Math.floor(target.y) + dy;
      if (this.isWalkable(x, y) && !this.creatureAt(x, y)) { c.x = x + 0.5; c.y = y + 0.5; return; }
    }
  }

  checkHenchmanRecovery() {
    const h = this.henchman;
    if (!h || !h.unconscious) return;
    if (this.area.entities.includes(h) && !this.inCombat()) {
      h.unconscious = false; h.dead = false; h.hp = Math.max(1, Math.floor(E.maxHp(h) * 0.25)); h.effects = []; h.anim = null;
      this.log(`${h.name} staggers back to his feet.`, 'heal');
    }
  }

  hireHenchman(id) {
    if (this.henchman) return;
    const h = E.createHenchman(id, this.player.level);
    this.henchman = h;
    const npc = this.area.entities.find(e => e.kind === 'npc' && e.id === id);
    if (npc) { h.x = npc.x; h.y = npc.y; this.area.entities = this.area.entities.filter(e => e !== npc); }
    else this.teleportNear(h, this.player);
    this.area.entities.push(h);
    this.flags.tomas_hired = true;
    this.log(`${h.name} joins your party.`, 'quest');
    this.ui.refreshAll();
  }

  dismissHenchman() {
    const h = this.henchman;
    if (!h) return;
    this.area.entities = this.area.entities.filter(e => e !== h);
    this.henchman = null; this.flags.tomas_hired = false;
    const tavern = this.getArea('tavern');
    tavern.entities.push({ uid: this.nextUid(), kind: 'npc', type: 'npc', id: 'tomas', name: 'Tomas', x: 12.5, y: 5.5, faction: 'neutral', dialogue: 'tomas', color: '#3a6a3a', shape: 'humanoid', size: 1, weaponLook: 'bow', avatar: { gender: 'male', chest: 'leather_chest', legs: 'leather_pants', feet: 'leather_boots', main: 'longbow' }, effects: [], hp: 20, maxHpBase: 20, henchmanId: 'tomas', facing: 1, dir: 6, npcTimer: 1 });
    this.log('Tomas returns to the Rusty Tankard.', 'info');
    this.ui.refreshAll();
  }

  // ------------------------------------------------------------ visibility
  updateVisibility(force) {
    if (!force && this.time - this.lastVis < 0.15) return;
    this.lastVis = this.time;
    const p = this.player;
    const R = this.area.outdoor ? 11 : 8;
    const vis = new Set();
    const px = Math.floor(p.x), py = Math.floor(p.y);
    for (let y = py - R; y <= py + R; y++) for (let x = px - R; x <= px + R; x++) {
      if (x < 0 || y < 0 || x >= this.area.width || y >= this.area.height) continue;
      if ((x - px) ** 2 + (y - py) ** 2 > R * R) continue;
      if (hasLineOfSight(px, py, x, y, (a, b) => this.isOpaque(a, b)) || this.adjacentVisible(px, py, x, y)) {
        vis.add(y * this.area.width + x);
        this.area.explored[y * this.area.width + x] = 1;
      }
    }
    this.visible = vis;
    // search checks for traps
    if (this.time >= (this.searchAt || 0)) {
      this.searchAt = this.time + 1.0;
      for (const e of this.area.entities) {
        if (e.type === 'trap' && !e.found && !e.triggered && E.distance({ x: e.x + 0.5, y: e.y + 0.5 }, p) <= 3.5) {
          const r = rollDie(20) + E.skillTotal(p, 'search');
          if (r >= e.dc) { e.found = true; this.log(`You notice a ${e.name.toLowerCase()}!`, 'save'); this.fx.floatText({ x: e.x + 0.5, y: e.y + 0.5 }, 'Trap found!', '#ff8080'); }
        }
        if (e.type === 'chest' && e.trap && !e.trap.found && !e.trap.disarmed && E.distance({ x: e.x + 0.5, y: e.y + 0.5 }, p) <= 2.5) {
          const r = rollDie(20) + E.skillTotal(p, 'search');
          if (r >= e.trap.dc) { e.trap.found = true; this.log(`You notice the chest is trapped with a ${e.trap.name.toLowerCase()}!`, 'save'); }
        }
      }
    }
  }
  adjacentVisible(px, py, x, y) {
    // walls adjacent to a visible floor tile are shown (so room outlines render)
    if (!this.isOpaque(x, y)) return false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!this.isOpaque(nx, ny) && (nx - px) ** 2 + (ny - py) ** 2 <= 49 && hasLineOfSight(px, py, nx, ny, (a, b) => this.isOpaque(a, b))) return true;
    }
    return false;
  }
  isVisible(x, y) { return this.visible.has(y * this.area.width + x); }
  isExplored(x, y) { return this.area.explored[y * this.area.width + x] === 1; }

  // ------------------------------------------------------------ traps, doors, containers
  checkTraps() {
    for (const c of this.partyMembers()) {
      const tx = Math.floor(c.x), ty = Math.floor(c.y);
      for (const e of this.area.entities) {
        if (e.type !== 'trap' || e.disarmed || e.triggered || e.x !== tx || e.y !== ty) continue;
        e.triggered = true;
        this.triggerTrap(e, c);
      }
    }
  }
  triggerTrap(trap, victim) {
    this.log(`${victim.name} triggers a ${trap.name.toLowerCase()}!`, 'fail');
    this.fx.explosion({ x: trap.x + 0.5, y: trap.y + 0.5 }, trap.damageType === 'fire' ? '#ff8020' : '#c0c0c0', 1);
    let dmg = rollDice(trap.damage);
    if (C.savingThrow(this, victim, 'ref', 15, trap.name)) dmg = victim.cls === 'rogue' && victim.level >= 2 ? 0 : Math.floor(dmg / 2);
    if (dmg > 0) C.applyDamage(this, victim, dmg, trap.damageType, null); else this.log(`${victim.name} evades the trap.`, 'save');
  }
  tryDisarm(trap) {
    if (trap.disarmed) return;
    const p = this.player;
    const r = rollDie(20), sk = E.skillTotal(p, 'disabletrap');
    if (r + sk >= trap.disarmDc) { trap.disarmed = true; this.log(`Disable Trap: ${r}+${sk}=${r + sk} vs DC ${trap.disarmDc}. You disarm the ${trap.name.toLowerCase()}.`, 'save'); this.awardXp(25 * Math.max(1, Math.floor(trap.disarmDc / 8))); }
    else if (r + sk < trap.disarmDc - 6) { this.log(`Disable Trap: ${r}+${sk}=${r + sk} vs DC ${trap.disarmDc}. You fumble and set it off!`, 'fail'); trap.triggered = true; this.triggerTrap(trap, p); }
    else this.log(`Disable Trap: ${r}+${sk}=${r + sk} vs DC ${trap.disarmDc}. You fail to disarm it.`, 'miss');
    p.nextAttackAt = this.time + C.ROUND;
  }
  tryDoor(door) {
    if (door.open) return;
    const p = this.player;
    if (!door.locked) { door.open = true; this.log(`You open the ${door.name.toLowerCase()}.`, 'info'); return; }
    if (door.key && E.hasItem(p, door.key)) { door.open = true; door.locked = false; this.log(`You unlock the ${door.name.toLowerCase()} with the ${ITEMS[door.key].name}.`, 'quest'); this.fx.burst({ x: door.x + 0.5, y: door.y + 0.5 }, '#ffe080', 1); return; }
    this.ui.showChoice(`${door.name} (locked)`, `The door is locked and warded. ${door.key ? 'It needs a key.' : ''}`, [
      { text: `Pick the lock (Open Lock +${E.skillTotal(p, 'openlock')} vs DC ${door.dc})`, action: () => this.pickLock(door) },
      { text: `Bash it (STR check vs DC ${door.dc - 6})`, action: () => this.bash(door) },
      { text: 'Leave it', action: () => {} },
    ]);
  }
  pickLock(obj) {
    const p = this.player;
    const r = rollDie(20), sk = E.skillTotal(p, 'openlock');
    const dc = obj.type === 'door' ? obj.dc : obj.locked;
    p.nextAttackAt = this.time + C.ROUND;
    if (r + sk >= dc) {
      this.log(`Open Lock: ${r}+${sk}=${r + sk} vs DC ${dc}: success!`, 'save');
      this.awardXp(20 * Math.max(1, Math.floor(dc / 8)));
      if (obj.type === 'door') { obj.open = true; obj.locked = false; } else { obj.locked = 0; obj.name = 'Chest'; this.openContainer(obj); }
    } else this.log(`Open Lock: ${r}+${sk}=${r + sk} vs DC ${dc}: failure.`, 'miss');
  }
  bash(obj) {
    const p = this.player;
    const r = rollDie(20), sm = E.abilityMod(p, 'STR');
    const dc = (obj.type === 'door' ? obj.dc : obj.locked) - 6;
    p.nextAttackAt = this.time + C.ROUND;
    this.fx.lunge(p, { x: obj.x + 0.5, y: obj.y + 0.5 });
    if (r + sm >= dc) {
      this.log(`Bash: ${r}${sm >= 0 ? '+' : ''}${sm}=${r + sm} vs DC ${dc}: it breaks open!`, 'save');
      if (obj.type === 'door') { obj.open = true; obj.locked = false; }
      else {
        obj.locked = 0; obj.name = 'Broken Chest';
        obj.loot.items = obj.loot.items.filter(id => !(ITEMS[id].type === 'potion' && Math.random() < 0.5));
        this.openContainer(obj);
      }
    } else this.log(`Bash: ${r}${sm >= 0 ? '+' : ''}${sm}=${r + sm} vs DC ${dc}: it holds.`, 'miss');
  }
  openContainer(e) {
    const p = this.player;
    if (e.type === 'chest' && e.locked) {
      this.ui.showChoice(e.name, 'The chest is locked.', [
        { text: `Pick the lock (Open Lock +${E.skillTotal(p, 'openlock')} vs DC ${e.locked})`, action: () => this.pickLock(e) },
        { text: `Bash it open (STR check vs DC ${e.locked - 6}; may break potions)`, action: () => this.bash(e) },
        { text: 'Leave it', action: () => {} },
      ]);
      return;
    }
    if (e.type === 'chest' && e.trap && !e.trap.disarmed) {
      if (e.trap.found) {
        this.ui.showChoice(e.name, `The chest is rigged with a ${e.trap.name.toLowerCase()}.`, [
          { text: `Disarm it (Disable Trap +${E.skillTotal(p, 'disabletrap')} vs DC ${e.trap.disarmDc})`, action: () => {
            const r = rollDie(20), sk = E.skillTotal(p, 'disabletrap');
            if (r + sk >= e.trap.disarmDc) { e.trap.disarmed = true; this.log(`Disable Trap: ${r}+${sk} vs DC ${e.trap.disarmDc}: disarmed.`, 'save'); this.awardXp(50); this.openContainer(e); }
            else { this.log(`Disable Trap: ${r}+${sk} vs DC ${e.trap.disarmDc}: failed.`, 'miss'); if (r + sk < e.trap.disarmDc - 6) { e.trap.disarmed = true; this.triggerTrap({ ...e.trap, x: e.x, y: e.y }, p); } }
          } },
          { text: 'Open it anyway', action: () => { e.trap.disarmed = true; this.triggerTrap({ ...e.trap, x: e.x, y: e.y }, p); if (!p.dead) this.openContainer(e); } },
          { text: 'Leave it', action: () => {} },
        ]);
        return;
      }
      e.trap.disarmed = true;
      this.triggerTrap({ ...e.trap, x: e.x, y: e.y }, p);
      if (p.dead) return;
    }
    e.opened = true;
    this.ui.showLoot(e);
  }
  takeLoot(e, index) {
    const p = this.player;
    if (index === 'gold') { if (e.loot.gold > 0) { this.log(`You take ${e.loot.gold} gold.`, 'loot'); p.gold += e.loot.gold; e.loot.gold = 0; } }
    else if (index === 'all') {
      if (e.loot.gold > 0) { this.log(`You take ${e.loot.gold} gold.`, 'loot'); p.gold += e.loot.gold; e.loot.gold = 0; }
      for (const id of e.loot.items) { E.addItem(p, id, 1); this.log(`You take ${ITEMS[id].name}.`, 'loot'); this.onItemAcquired(id); }
      e.loot.items = [];
    } else {
      const id = e.loot.items[index];
      if (id) { e.loot.items.splice(index, 1); E.addItem(p, id, 1); this.log(`You take ${ITEMS[id].name}.`, 'loot'); this.onItemAcquired(id); }
    }
    if (e.type === 'loot' && !e.loot.gold && !e.loot.items.length) this.area.entities = this.area.entities.filter(x => x !== e);
    this.ui.refreshAll();
  }
  onItemAcquired(id) {
    if (id === 'amulet_of_dawn' && this.questStage('crypt') < 2) { this.setQuest('crypt', 2); }
    if (id === 'silver_locket' && this.questStage('locket') === 1) { this.setQuest('locket', 2); }
    if (id === 'silver_locket' && this.questStage('locket') === 0) { this.log('A tarnished silver locket. Someone in town may be missing it.', 'info'); }
    if (id === 'goblin_chief_head' && this.questStage('goblins') === 1) this.setQuest('goblins', 2);
    if (id === 'antling_mandible' && this.questStage('rats') === 1 && E.countItem(this.player, 'antling_mandible') >= 5) this.setQuest('rats', 2);
  }

  // ------------------------------------------------------------ area transitions
  changeArea(toId, tx, ty) {
    const from = this.area;
    const party = [this.player, this.henchman].filter(Boolean);
    from.entities = from.entities.filter(e => !party.includes(e));
    const area = this.getArea(toId);
    this.area = area;
    this.player.x = tx + 0.5; this.player.y = ty + 0.5; this.player.path = []; this.player.target = null; this.player.intent = null;
    area.entities.push(this.player);
    if (this.henchman) {
      this.henchman.path = []; this.henchman.target = null;
      this.teleportNear(this.henchman, this.player);
      area.entities.push(this.henchman);
    }
    this.visible = new Set();
    this.updateVisibility(true);
    this.fx.clear();
    this.renderer.snapCamera();
    this.log(`You enter ${area.name}.`, 'info');
    this.ui.showAreaBanner(area.name);
    if (toId === 'crypt' && !this.flags.crypt_visited) { this.flags.crypt_visited = true; this.log('The air is cold and smells of old death. Something down here is awake.', 'info'); }
    this.ui.refreshAll();
  }

  // ------------------------------------------------------------ rest
  rest() {
    const p = this.player;
    if (p.dead || this.gameOver) return;
    if (this.hostilesAwake(12).length) { this.log('You cannot rest with enemies nearby.', 'info'); return; }
    this.ui.fade(() => {
      for (const c of [this.player, this.henchman]) {
        if (!c) continue;
        c.unconscious = false; c.dead = false; c.effects = []; c.tempHp = 0; c.anim = null;
        c.hp = E.maxHp(c); E.restoreSlots(c); c.rageUses = E.rageUsesMax(c); c.turnUses = E.turnUsesMax(c);
      }
      this.clock += 8 * 3600;
      this.log('You rest and recover your strength.', 'heal');
      // some monsters return to their posts
      for (const m of this.area.entities) if (m.kind === 'monster' && !m.dead) m.awake = false;
      this.ui.refreshAll();
    });
  }

  // ------------------------------------------------------------ xp, quests, dialogue API
  awardXp(amount, source) {
    const p = this.player;
    if (p.dead) return;
    p.xp += amount;
    this.log(`Gained ${amount} experience.`, 'xp');
    if (this.henchman && this.henchman.level < this.player.level + 1) {
      this.henchman.xp += amount;
      while (E.canLevelUp(this.henchman)) { E.applyLevelUp(this.henchman, { skillAlloc: { search: 1 } }); this.log(`${this.henchman.name} reaches level ${this.henchman.level}.`, 'xp'); }
    }
    if (E.canLevelUp(p)) { this.log('You have enough experience to level up! Open your character sheet (C).', 'xp'); this.fx.floatText(p, 'LEVEL UP!', '#ffd040'); }
    this.ui.refreshHud();
  }
  onMonsterKilled(m) {
    const p = this.player;
    if (m.tid === 'goblin_chief') this.flags.chief_dead = true;
    if (m.tid === 'cult_priest') this.flags.priest_dead = true;
    if (m.tid === 'necromancer') { this.flags.necro_dead = true; this.log('Malachar crumbles to dust. The crypt falls silent.', 'quest'); }
  }
  onPlayerDeath() {
    this.gameOver = true;
    this.ui.showDeath();
  }
  endGame() {
    this.victory = true;
    this.ui.showVictory();
  }

  questStage(id) { return this.quests[id] ? this.quests[id].stage : 0; }
  setQuest(id, stage) {
    const q = QUESTS[id];
    if (!this.quests[id]) { this.quests[id] = { stage, done: false }; this.log(`Journal updated: ${q.name}`, 'quest'); }
    else if (this.quests[id].stage !== stage) { this.quests[id].stage = stage; this.log(`Journal updated: ${q.name}`, 'quest'); }
    this.ui.refreshHud();
  }
  completeQuest(id) {
    const q = QUESTS[id];
    if (!this.quests[id]) this.quests[id] = { stage: q.done, done: false };
    if (this.quests[id].done) return;
    this.quests[id].stage = q.done; this.quests[id].done = true;
    this.log(`Quest completed: ${q.name}`, 'quest');
    this.awardXp(q.xp);
  }

  dialogueApi() {
    const g = this;
    const p = this.player;
    return {
      player: p,
      questStage: (id) => g.questStage(id),
      setQuest: (id, s) => g.setQuest(id, s),
      completeQuest: (id) => g.completeQuest(id),
      flag: (k) => g.flags[k],
      setFlag: (k, v) => { g.flags[k] = v; },
      hasItem: (id) => E.hasItem(p, id),
      countItem: (id) => E.countItem(p, id),
      removeItem: (id, qty = 1) => { E.removeItem(p, id, qty); for (const s of EQUIP_SLOTS) if (p.equipment[s] === id) p.equipment[s] = null; },
      giveItem: (id, qty = 1) => { E.addItem(p, id, qty); g.log(`You receive ${ITEMS[id].name}.`, 'loot'); },
      gold: () => p.gold,
      addGold: (n) => { p.gold += n; g.log(n >= 0 ? `You receive ${n} gold.` : `You pay ${-n} gold.`, 'loot'); },
      addXp: (n) => g.awardXp(n),
      level: () => p.level,
      log: (m) => g.log(m, 'info'),
      needsHealing: () => p.hp < E.maxHp(p) || (g.henchman && g.henchman.hp < E.maxHp(g.henchman)),
      healParty: () => { for (const c of [p, g.henchman]) if (c) { c.hp = E.maxHp(c); c.unconscious = false; c.dead = false; c.anim = null; c.effects = c.effects.filter(e => !e.harmful); } g.fx.burst(p, '#ffe680', 1); g.log('Your wounds are healed.', 'heal'); },
      openShop: (title, ids, mult) => g.ui.showShop(title, ids, mult),
      hireHenchman: (id) => g.hireHenchman(id),
      dismissHenchman: () => g.dismissHenchman(),
      henchmanHp: () => g.henchman ? `${g.henchman.hp}/${E.maxHp(g.henchman)} hit points, level ${g.henchman.level}.` : '',
      removeNpc: (id) => { g.area.entities = g.area.entities.filter(e => !(e.kind === 'npc' && e.id === id)); g.flags['npc_removed_' + id] = true; },
      endGame: () => g.endGame(),
      skillCheck: (skill, dc) => g.skillCheck(skill, dc),
    };
  }

  skillCheck(skill, dc) {
    const r = rollDie(20), sk = E.skillTotal(this.player, skill);
    const ok = r + sk >= dc;
    const name = { persuade: 'Persuade', lore: 'Lore', intimidate: 'Intimidate', search: 'Search' }[skill] || skill;
    this.log(`${name} check: ${r}+${sk}=${r + sk} vs DC ${dc}: ${ok ? 'success' : 'failure'}.`, ok ? 'save' : 'fail');
    return ok;
  }

  startDialogue(npc) {
    if (npc.kind === 'henchman') { this.ui.showHenchmanMenu(npc); return; }
    const d = DIALOGUES[npc.dialogue];
    if (!d) { this.log(`${npc.name} has nothing to say.`, 'info'); return; }
    npc.facing = this.player.x >= npc.x ? 1 : -1; npc.dir = dirFromDelta(this.player.x - npc.x, this.player.y - npc.y);
    this.player.facing = npc.x >= this.player.x ? 1 : -1; this.player.dir = dirFromDelta(npc.x - this.player.x, npc.y - this.player.y);
    const api = this.dialogueApi();
    const start = typeof d.start === 'function' ? d.start(api) : d.start;
    this.dialogue = { npc, def: d, node: start };
    this.showDialogueNode();
  }
  showDialogueNode() {
    const dlg = this.dialogue;
    if (!dlg || !dlg.node) { this.dialogue = null; this.ui.hideDialogue(); this.ui.refreshAll(); return; }
    const api = this.dialogueApi();
    const node = dlg.def.nodes[dlg.node];
    if (!node) { this.dialogue = null; this.ui.hideDialogue(); return; }
    const text = typeof node.text === 'function' ? node.text(api) : node.text;
    const options = node.options.filter(o => !o.cond || o.cond(api)).map(o => ({ ...o, label: o.check ? `[${SKILLNAME(o.check.skill)} DC ${o.check.dc}] ${o.text}` : o.text }));
    dlg.options = options;
    this.ui.showDialogue(dlg.npc.name, text, options);
  }
  chooseOption(i) {
    const dlg = this.dialogue;
    if (!dlg) return;
    const o = dlg.options[i];
    if (!o) return;
    const api = this.dialogueApi();
    let next = o.next;
    if (o.check) {
      const ok = this.skillCheck(o.check.skill, o.check.dc);
      if (!ok) next = o.fail || null;
      else if (o.action) o.action(api);
    } else if (o.action) o.action(api);
    if (this.dialogue !== dlg) return; // dialogue was replaced/closed by an action (e.g. shop)
    if (this.ui.modalOpen() && next === null) { this.dialogue = null; this.ui.hideDialogue(); return; }
    dlg.node = next === undefined ? null : next;
    this.showDialogueNode();
  }
  endDialogue() { this.dialogue = null; this.ui.hideDialogue(); this.ui.refreshAll(); }

  // ------------------------------------------------------------ inventory actions
  equip(id) {
    const r = E.equipItem(this.player, id);
    if (!r.ok) this.log(r.why, 'info');
    else { this.log(`You equip ${ITEMS[id].name}.`, 'info'); E.refreshSlots(this.player); C.clampHp(this.player); }
    this.ui.refreshAll();
  }
  unequip(slot) { E.unequipItem(this.player, slot); E.refreshSlots(this.player); C.clampHp(this.player); this.ui.refreshAll(); }
  dropItem(index) {
    const p = this.player;
    const it = p.inventory[index];
    if (!it) return;
    if (ITEMS[it.id].quest) { this.log('You should hold on to that.', 'info'); return; }
    p.inventory.splice(index, 1);
    this.area.entities.push({ uid: this.nextUid(), type: 'loot', name: 'Dropped items', x: Math.floor(p.x), y: Math.floor(p.y), loot: { gold: 0, items: Array(it.qty).fill(it.id) } });
    this.log(`You drop ${ITEMS[it.id].name}.`, 'info');
    this.ui.refreshAll();
  }
  giveToHenchman(index) {
    const p = this.player, h = this.henchman;
    if (!h || !this.area.entities.includes(h)) return;
    const it = p.inventory[index];
    if (!it || ITEMS[it.id].quest) return;
    p.inventory.splice(index, 1);
    E.addItem(h, it.id, it.qty);
    if (['weapon', 'armor'].includes(ITEMS[it.id].type)) { const r = E.equipItem(h, it.id); if (r.ok) this.log(`${h.name} equips ${ITEMS[it.id].name}.`, 'info'); }
    else this.log(`You give ${ITEMS[it.id].name} to ${h.name}.`, 'info');
    this.ui.refreshAll();
  }
  buy(id, price) {
    const p = this.player;
    if (p.gold < price) { this.log('You cannot afford that.', 'info'); return false; }
    p.gold -= price; E.addItem(p, id, 1);
    this.log(`Bought ${ITEMS[id].name} for ${price} gold.`, 'loot');
    return true;
  }
  sell(index, price) {
    const p = this.player;
    const it = p.inventory[index];
    if (!it || ITEMS[it.id].quest) return false;
    if (it.qty > 1) it.qty--; else p.inventory.splice(index, 1);
    p.gold += price;
    this.log(`Sold ${ITEMS[it.id].name} for ${price} gold.`, 'loot');
    return true;
  }
  levelUp(alloc) {
    const p = this.player;
    if (!E.canLevelUp(p)) return;
    const hp = E.applyLevelUp(p, alloc);
    this.log(`${p.name} reaches level ${p.level}! (+${hp + E.abilityMod(p, 'CON')} hit points)`, 'xp');
    this.fx.burst(p, '#ffd040', 1.2);
    this.ui.refreshAll();
  }

  togglePause() {
    if (!this.running || this.gameOver) return;
    this.paused = !this.paused;
    this.ui.setPaused(this.paused);
  }

  // ------------------------------------------------------------ save / load
  save(slot = 1) {
    if (!this.running || this.gameOver) return false;
    const areas = {};
    for (const [id, a] of Object.entries(this.areas)) {
      areas[id] = { entities: a.entities.filter(e => e.kind !== 'player' && e.kind !== 'henchman'), explored: Array.from(a.explored) };
    }
    const data = {
      version: 1, savedAt: Date.now(), time: this.time, clock: this.clock, currentArea: this.area.id,
      player: this.player, henchman: this.henchman, henchmanMode: this.henchmanMode, quests: this.quests, flags: this.flags,
      areas, log: this.logLines.slice(-40),
    };
    try {
      localStorage.setItem(SAVE_KEY + slot, JSON.stringify(data, (k, v) => (k === '_bounds' || k === 'anim' || k === 'lunge') ? undefined : v));
      this.log('Game saved.', 'info');
      return true;
    } catch (err) { this.log('Save failed: ' + err.message, 'fail'); return false; }
  }
  static saveInfo(slot = 1) {
    try {
      const raw = localStorage.getItem(SAVE_KEY + slot);
      if (!raw) return null;
      const d = JSON.parse(raw);
      return { name: d.player.name, level: d.player.level, cls: CLASSES[d.player.cls].name, area: d.currentArea, savedAt: d.savedAt };
    } catch { return null; }
  }
  load(slot = 1) {
    let d;
    try { d = JSON.parse(localStorage.getItem(SAVE_KEY + slot)); } catch { return false; }
    if (!d) return false;
    this.areas = {};
    for (const [id, a] of Object.entries(d.areas)) {
      const fresh = this.instantiateArea(id);
      fresh.entities = a.entities;
      fresh.explored = Uint8Array.from(a.explored);
      this.areas[id] = fresh;
    }
    // item ids renamed since the save was written
    const LEGACY_ITEMS = { antlion_chitin: 'wolf_pelt' };
    const migrate = (list) => { for (const it of list || []) if (LEGACY_ITEMS[it.id]) it.id = LEGACY_ITEMS[it.id]; };
    for (const c of [d.player, d.henchman]) if (c) migrate(c.inventory);
    for (const a of Object.values(this.areas)) for (const e of a.entities) { if (e.inventory) migrate(e.inventory); if (e.loot && e.loot.items) e.loot.items = e.loot.items.map(id => LEGACY_ITEMS[id] || id); }
    this.player = d.player; this.henchman = d.henchman; this.henchmanMode = d.henchmanMode || 'follow';
    this.quests = d.quests; this.flags = d.flags; this.time = d.time; this.clock = d.clock;
    this.area = this.areas[d.currentArea];
    this.area.entities.push(this.player);
    if (this.henchman) this.area.entities.push(this.henchman);
    let maxUid = Math.max(this.player.uid, this.henchman ? this.henchman.uid : 0);
    for (const a of Object.values(this.areas)) for (const e of a.entities) if (e.uid > maxUid) maxUid = e.uid;
    E.setUidCounter(maxUid + 1);
    this.gameOver = false; this.victory = false; this.dialogue = null; this.pendingSpell = null;
    this.player.path = []; this.player.intent = null; this.player.target = null;
    this.running = true; this.paused = false;
    this.ui.clearLog();
    for (const l of d.log || []) this.ui.appendLog(l.msg, l.cls);
    this.logLines = d.log || [];
    this.visible = new Set();
    this.updateVisibility(true);
    this.fx.clear();
    this.renderer.snapCamera();
    this.log('Game loaded.', 'info');
    this.ui.showAreaBanner(this.area.name);
    this.ui.refreshAll();
    return true;
  }
}

function SKILLNAME(id) { return { persuade: 'Persuade', lore: 'Lore', intimidate: 'Intimidate', search: 'Search' }[id] || id; }
