import { RACES } from '../data/races.js';
import { CLASSES, xpForLevel, MAX_LEVEL } from '../data/classes.js';
import { SKILLS, SKILL_IDS } from '../data/skills.js';
import { ITEMS, EQUIP_SLOTS, SLOT_NAMES } from '../data/items.js';
import { SPELLS } from '../data/spells.js';
import { QUESTS } from '../data/quests.js';
import { mod, fmtMod, diceAverage } from '../core/dice.js';
import { ICONS, iconFile } from '../data/icons.js';
import * as E from './entity.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** HTML for a game-icons.net icon; `key` is a spell/item/class id, `fallback` an item type. */
export function icon(key, fallback, cls = '') {
  const path = ICONS[key] || (fallback && ICONS['type_' + fallback]);
  if (!path) return '';
  const u = `url(assets/icons/${iconFile(path)})`;
  return `<span class="gi ${cls}" style="-webkit-mask-image:${u};mask-image:${u}"></span>`;
}

export class UI {
  constructor() {
    this.game = null;
    this.panelName = null; this.modal = null; this.quickSlots = [];
    this.logEl = $('log');
    this.bindStatic();
  }

  bindStatic() {
    $('panel-close').onclick = () => this.closePanel();
    $('modal-close').onclick = () => this.closeModal();
    for (const b of document.querySelectorAll('#menubar [data-panel]')) b.onclick = () => this.togglePanel(b.dataset.panel);
    $('btn-rest').onclick = () => this.game.rest();
    $('btn-pause').onclick = () => this.game.togglePause();
    $('btn-save').onclick = () => this.game.save(1);
    $('btn-loadgame').onclick = () => this.confirmLoad();
  }

  // ---------------------------------------------------------------- basic hooks used by Game
  modalOpen() { return !!this.modal; }
  tick(dt) { if (this.hudTimer === undefined) this.hudTimer = 0; this.hudTimer += dt; if (this.hudTimer > 0.25) { this.hudTimer = 0; this.refreshHud(); } }
  appendLog(msg, cls) {
    const d = el('div', cls, esc(msg));
    this.logEl.appendChild(d);
    while (this.logEl.children.length > 200) this.logEl.removeChild(this.logEl.firstChild);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }
  clearLog() { this.logEl.innerHTML = ''; }
  setPaused(p) { $('paused').classList.toggle('hidden', !p); }
  setTargeting(spell) {
    const t = $('targeting');
    if (!spell) { t.classList.add('hidden'); return; }
    t.textContent = `Casting ${spell.name}: click a ${spell.target === 'enemy' ? 'target' : 'friendly creature'}${spell.area ? ' or location' : ''} (Esc to cancel)`;
    t.classList.remove('hidden');
  }
  showAreaBanner(name) {
    const b = $('banner'); b.textContent = name; b.classList.remove('hidden');
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    clearTimeout(this.bannerT); this.bannerT = setTimeout(() => b.classList.add('hidden'), 3000);
  }
  fade(cb) {
    const f = $('fade'); f.classList.remove('hidden'); f.style.animation = 'none'; void f.offsetWidth; f.style.animation = '';
    setTimeout(cb, 900);
    setTimeout(() => f.classList.add('hidden'), 2000);
  }
  refreshAll() { this.refreshHud(); this.refreshQuickbar(); if (this.panelName) this.renderPanel(this.panelName); if (this.modal === 'shop') this.renderShop(); if (this.modal === 'loot') this.renderLoot(); }

  // ---------------------------------------------------------------- HUD
  refreshHud() {
    const g = this.game; if (!g || !g.player) return;
    const p = g.player;
    const maxHp = E.maxHp(p);
    $('hud-name').textContent = p.name;
    $('hud-sub').textContent = `Level ${p.level} ${RACES[p.race].name} ${CLASSES[p.cls].name} · ${p.gold} gold`;
    $('hud-hp').style.width = `${Math.max(0, p.hp / maxHp * 100)}%`;
    $('hud-hp-text').textContent = `${p.hp}${p.tempHp ? '+' + p.tempHp : ''} / ${maxHp}`;
    const cur = xpForLevel(p.level), next = xpForLevel(p.level + 1);
    const f = p.level >= MAX_LEVEL ? 1 : (p.xp - cur) / (next - cur);
    $('hud-xp').style.width = `${Math.min(100, f * 100)}%`;
    $('hud-xp-text').textContent = p.level >= MAX_LEVEL ? `${p.xp} XP (max level)` : `${p.xp} / ${next} XP${E.canLevelUp(p) ? ' — LEVEL UP!' : ''}`;
    const port = $('hud-portrait'); port.style.background = p.color; port.innerHTML = icon(p.cls, null, 'big');
    const h = g.henchman;
    const hc = $('hud-hench');
    if (h) {
      hc.classList.remove('hidden');
      const hm = E.maxHp(h);
      $('hench-name').textContent = `${h.name} (Lv ${h.level} Ranger)${h.unconscious ? ' — down' : ''}`;
      $('hench-hp').style.width = `${Math.max(0, h.hp / hm * 100)}%`;
      $('hench-hp-text').textContent = `${h.hp} / ${hm}`;
      const hp = $('hench-portrait'); hp.style.background = h.color; hp.innerHTML = icon('ranger', null, 'big');
    } else hc.classList.add('hidden');
    const eff = $('hud-effects'); eff.innerHTML = '';
    for (const e of p.effects) eff.appendChild(el('span', 'effect-chip' + (e.harmful || e.held || e.dot ? ' bad' : ''), `${esc(e.name)} (${e.remaining})`));
    $('area-name').textContent = g.area.name;
    const hrs = Math.floor(g.clock / 3600) % 24, mins = Math.floor(g.clock / 60) % 60;
    $('clock').textContent = `Day ${1 + Math.floor(g.clock / 86400)}, ${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }

  // ---------------------------------------------------------------- quickbar
  refreshQuickbar() {
    const g = this.game; if (!g || !g.player) return;
    const p = g.player;
    const qb = $('quickbar'); qb.innerHTML = '';
    const slots = [];
    if (p.cls === 'barbarian') slots.push({ kind: 'ability', id: 'rage', name: 'Rage', count: p.rageUses });
    if (p.cls === 'cleric') slots.push({ kind: 'ability', id: 'turn', name: 'Turn Undead', count: p.turnUses });
    for (const s of E.spellsKnown(p)) slots.push({ kind: 'spell', id: s.id, name: s.name, count: p.spellSlots[s.level] ? p.spellSlots[s.level].cur : 0, level: s.level });
    const potions = {};
    for (const it of p.inventory) if (ITEMS[it.id].type === 'potion') potions[it.id] = (potions[it.id] || 0) + it.qty;
    for (const [id, n] of Object.entries(potions)) slots.push({ kind: 'potion', id, name: ITEMS[id].name.replace('Potion of ', ''), count: n });
    this.quickSlots = slots;
    slots.forEach((s, i) => {
      const d = el('div', `qb ${s.kind}${s.count <= 0 ? ' empty' : ''}`);
      d.innerHTML = `<span class="key">${i < 9 ? i + 1 : ''}</span>${icon(s.id, 'potion', 'qb-icon')}<span class="qb-name">${esc(s.name)}</span><span class="count">${s.level ? 'L' + s.level + ' · ' : ''}${s.count}</span>`;
      d.onclick = () => this.useQuickSlot(i);
      d.onmouseenter = (ev) => this.showTooltip(ev, this.quickTooltip(s));
      d.onmousemove = (ev) => this.moveTooltip(ev);
      d.onmouseleave = () => this.hideTooltip();
      qb.appendChild(d);
    });
  }
  useQuickSlot(i) {
    const s = this.quickSlots[i]; const g = this.game;
    if (!s) return;
    if (s.kind === 'ability') g.useAbility(s.id);
    else if (s.kind === 'spell') g.beginSpell(s.id);
    else if (s.kind === 'potion') g.drinkPotion(s.id);
  }
  quickTooltip(s) {
    if (s.kind === 'spell') { const sp = SPELLS[s.id]; return `<div class="tname">${icon(s.id)}${sp.name}</div><div>Level ${sp.level} ${sp.school}</div><div class="tdesc">${esc(sp.desc)}</div>`; }
    if (s.kind === 'potion') return this.itemTooltip(ITEMS[s.id]);
    if (s.id === 'rage') return `<div class="tname">Barbarian Rage</div><div class="tdesc">+4 STR, +4 CON, +2 Will, -2 AC for 5 rounds. ${s.count} uses left.</div>`;
    if (s.id === 'turn') return `<div class="tname">Turn Undead</div><div class="tdesc">Sears all undead within 4 tiles for 1d6 per level + CHA modifier (Will half). ${s.count} uses left.</div>`;
    return '';
  }

  // ---------------------------------------------------------------- tooltips
  showTooltip(ev, html) { const t = $('tooltip'); t.innerHTML = html; t.classList.remove('hidden'); this.moveTooltip(ev); }
  moveTooltip(ev) { const t = $('tooltip'); const x = Math.min(ev.clientX + 14, window.innerWidth - 300), y = Math.min(ev.clientY + 14, window.innerHeight - t.offsetHeight - 10); t.style.left = x + 'px'; t.style.top = y + 'px'; }
  hideTooltip() { $('tooltip').classList.add('hidden'); }
  itemTooltip(it) {
    let s = `<div class="tname">${icon(it.id, it.type)}${esc(it.name)}</div>`;
    if (it.type === 'weapon') s += `<div>Damage ${it.damage}, crit ${it.crit[0] === 20 ? '20' : it.crit[0] + '-20'} x${it.crit[1]}${it.twoHanded ? ', two-handed' : ''}${it.ranged ? ', ranged' : ''}${it.finesse ? ', finesse' : ''}</div><div>Proficiency: ${it.group}</div>`;
    if (it.type === 'armor') s += `<div>Armor bonus +${it.ac}, max DEX bonus ${it.maxDex >= 99 ? 'unlimited' : '+' + it.maxDex} (${it.category})</div>`;
    if (it.type === 'shield') s += `<div>Shield bonus +${it.ac}</div>`;
    if (it.bonus) s += `<div>${Object.entries(it.bonus).map(([k, v]) => `${fmtMod(typeof v === 'number' && k !== 'speed' ? v : Math.round(v * 100))}${k === 'speed' ? '% speed' : ' ' + k.toUpperCase()}`).join(', ')}</div>`;
    if (it.heal) s += `<div>Heals ${it.heal}</div>`;
    s += `<div class="tdesc">${esc(it.desc)}</div><div>Value: ${it.value} gold · Weight: ${it.weight}</div>`;
    return s;
  }

  // ---------------------------------------------------------------- panels
  togglePanel(name) { if (this.panelName === name) this.closePanel(); else this.openPanel(name); }
  openPanel(name) { this.panelName = name; $('panel').classList.remove('hidden'); this.renderPanel(name); }
  closePanel() { this.panelName = null; $('panel').classList.add('hidden'); this.hideTooltip(); }
  renderPanel(name) {
    const body = $('panel-body'); body.innerHTML = '';
    const titles = { character: 'Character Sheet', inventory: 'Inventory', spells: 'Spellbook', journal: 'Journal', help: 'How to Play' };
    $('panel-title').textContent = titles[name] || name;
    if (name === 'character') this.renderCharacter(body);
    else if (name === 'inventory') this.renderInventory(body);
    else if (name === 'spells') this.renderSpells(body);
    else if (name === 'journal') this.renderJournal(body);
    else if (name === 'help') this.renderHelp(body);
  }

  renderCharacter(body) {
    const g = this.game, p = g.player;
    const st = E.computeStats(p);
    const cd = CLASSES[p.cls], rd = RACES[p.race];
    let h = `<h3>${icon(p.cls)}${esc(p.name)} — Level ${p.level} ${rd.name} ${cd.name}</h3>`;
    if (E.canLevelUp(p)) h += `<button id="btn-levelup" class="primary" style="width:100%;margin:6px 0">Level Up to ${p.level + 1}!</button>`;
    h += `<div class="two-col">`;
    for (const ab of E.ABILITIES) h += `<div><span>${ab}</span><span>${E.ability(p, ab)} (${fmtMod(E.abilityMod(p, ab))})</span></div>`;
    h += `</div><h3>Combat</h3><div class="two-col">
      <div><span>Hit Points</span><span>${p.hp} / ${st.maxHp}</span></div>
      <div><span>Armor Class</span><span>${st.ac}</span></div>
      <div><span>Base Attack</span><span>${fmtMod(E.bab(p))}</span></div>
      <div><span>Attack Bonus</span><span>${fmtMod(st.attack)}${st.attacks > 1 ? ' / ' + fmtMod(st.attack - 5) : ''}</span></div>
      <div><span>Damage</span><span>${st.damageDice}${fmtMod(st.damageBonus)}</span></div>
      <div><span>Attacks / round</span><span>${st.attacks}</span></div>
      <div><span>Fortitude</span><span>${fmtMod(st.saves.fort)}</span></div>
      <div><span>Reflex</span><span>${fmtMod(st.saves.ref)}</span></div>
      <div><span>Will</span><span>${fmtMod(st.saves.will)}</span></div>
      <div><span>Experience</span><span>${p.xp}${p.level < MAX_LEVEL ? ' / ' + xpForLevel(p.level + 1) : ''}</span></div>
    </div><h3>Skills</h3><div class="two-col">`;
    for (const id of SKILL_IDS) h += `<div><span>${SKILLS[id].name}${E.isClassSkill(p, id) ? '' : ' <span class="muted">(cross)</span>'}</span><span>${fmtMod(E.skillTotal(p, id))} <span class="muted">(${p.skills[id] || 0} ranks)</span></span></div>`;
    h += `</div><h3>Class Features</h3>`;
    for (const f of cd.features) if (f.level <= p.level) h += `<div class="row"><span class="name">${f.name}</span><span class="muted">${esc(f.desc)}</span></div>`;
    h += `<h3>Racial Traits</h3>`;
    for (const t of rd.traits) h += `<div class="row"><span class="name">${esc(t)}</span></div>`;
    if (p.effects.length) { h += `<h3>Active Effects</h3>`; for (const e of p.effects) h += `<div class="row"><span class="name">${esc(e.name)}</span><span class="muted">${e.remaining} rounds</span></div>`; }
    body.innerHTML = h;
    const b = $('btn-levelup'); if (b) b.onclick = () => this.showLevelUp();
  }

  renderInventory(body) {
    const g = this.game, p = g.player;
    let h = `<div class="row"><span class="name">${icon('gold')}Gold</span><span class="gold">${p.gold}</span></div><h3>Equipped</h3>`;
    body.innerHTML = h;
    for (const s of EQUIP_SLOTS) {
      const id = p.equipment[s];
      const row = el('div', 'row equipped');
      row.innerHTML = `<span class="muted" style="width:60px">${SLOT_NAMES[s]}</span><span class="name">${id ? this.itemLabel(ITEMS[id]) : '<span class="muted">—</span>'}</span>`;
      if (id) {
        const act = el('div', 'actions'); const b = el('button', '', 'Unequip'); b.onclick = () => g.unequip(s); act.appendChild(b); row.appendChild(act);
        row.onmouseenter = (ev) => this.showTooltip(ev, this.itemTooltip(ITEMS[id])); row.onmousemove = (ev) => this.moveTooltip(ev); row.onmouseleave = () => this.hideTooltip();
      }
      body.appendChild(row);
    }
    body.appendChild(el('h3', '', `Backpack (${p.inventory.length} items)`));
    if (!p.inventory.length) body.appendChild(el('div', 'muted', 'Empty.'));
    p.inventory.forEach((inv, idx) => {
      const it = ITEMS[inv.id];
      const row = el('div', 'row');
      row.innerHTML = `<span class="name">${this.itemLabel(it)}${inv.qty > 1 ? ` <span class="muted">x${inv.qty}</span>` : ''}</span>`;
      const act = el('div', 'actions');
      if (EQUIP_SLOTS.includes(it.type)) { const b = el('button', '', 'Equip'); b.onclick = () => g.equip(inv.id); act.appendChild(b); }
      if (it.type === 'potion') { const b = el('button', '', 'Drink'); b.onclick = () => g.drinkPotion(inv.id); act.appendChild(b); }
      if (g.henchman && g.area.entities.includes(g.henchman) && !it.quest) { const b = el('button', '', 'Give'); b.title = 'Give to Tomas'; b.onclick = () => g.giveToHenchman(idx); act.appendChild(b); }
      if (!it.quest) { const b = el('button', '', 'Drop'); b.onclick = () => g.dropItem(idx); act.appendChild(b); }
      row.appendChild(act);
      row.onmouseenter = (ev) => this.showTooltip(ev, this.itemTooltip(it)); row.onmousemove = (ev) => this.moveTooltip(ev); row.onmouseleave = () => this.hideTooltip();
      body.appendChild(row);
    });
    if (g.henchman && g.area.entities.includes(g.henchman)) {
      const h2 = g.henchman;
      body.appendChild(el('h3', '', `${h2.name}'s Equipment`));
      for (const s of ['weapon', 'armor', 'shield']) body.appendChild(el('div', 'row', `<span class="muted" style="width:60px">${SLOT_NAMES[s]}</span><span class="name">${h2.equipment[s] ? esc(ITEMS[h2.equipment[s]].name) : '<span class="muted">—</span>'}</span>`));
      body.appendChild(el('div', 'muted', `Potions: ${h2.inventory.filter(i => ITEMS[i.id].type === 'potion').reduce((a, b) => a + b.qty, 0)}`));
    }
  }
  itemLabel(it) { return `<span class="${it.magic ? 'item-magic' : it.quest ? 'item-quest' : ''}">${icon(it.id, it.type)}${esc(it.name)}</span>`; }

  renderSpells(body) {
    const g = this.game, p = g.player;
    const known = E.spellsKnown(p);
    if (!known.length) { body.innerHTML = `<div class="muted">${CLASSES[p.cls].name}s cannot cast spells.</div>`; return; }
    let lvl = 0;
    for (const s of known) {
      if (s.level !== lvl) { lvl = s.level; const slot = p.spellSlots[lvl]; body.appendChild(el('h3', '', `Level ${lvl} — ${slot ? slot.cur + ' / ' + slot.max : 0} slots`)); }
      const row = el('div', 'spell-row');
      row.innerHTML = `<div><span class="sname">${icon(s.id)}${s.name}</span> <span class="muted">${s.school} · ${s.target === 'self' ? 'self' : s.target}${s.range ? ', range ' + s.range : ''}${s.area ? ', radius ' + s.area : ''}</span></div><div class="sdesc">${esc(s.desc)}</div>`;
      row.onclick = () => { g.beginSpell(s.id); if (s.target !== 'self') this.closePanel(); };
      body.appendChild(row);
    }
    if (E.armorCheck(p) > 0) body.prepend(el('div', 'fail', 'Warning: you are wearing armor and cannot cast arcane spells.'));
  }

  renderJournal(body) {
    const g = this.game;
    const active = [], done = [];
    for (const [id, q] of Object.entries(g.quests)) (q.done ? done : active).push(id);
    if (!active.length && !done.length) { body.innerHTML = '<div class="muted">Your journal is empty. Talk to the people of Bramblewick.</div>'; return; }
    if (active.length) body.appendChild(el('h3', '', 'Active Quests'));
    for (const id of active) body.appendChild(el('div', 'quest', `<div class="qname">${QUESTS[id].name}</div><div class="qtext">${esc(QUESTS[id].stages[g.quests[id].stage] || '')}</div>`));
    if (done.length) body.appendChild(el('h3', '', 'Completed Quests'));
    for (const id of done) body.appendChild(el('div', 'quest done', `<div class="qname">${QUESTS[id].name}</div><div class="qtext muted">${esc(QUESTS[id].stages[g.quests[id].stage] || '')}</div>`));
  }

  renderHelp(body) {
    body.innerHTML = `<div class="help">
      <h3>Controls</h3>
      <p><b>Left click</b> ground to move. Click an enemy to attack it, a person to talk, a chest or corpse to loot, a glowing tile to travel.</p>
      <p><b>Right click</b> a creature or object to examine it (or cancel spell targeting).</p>
      <p><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrow keys also move you. <kbd>Space</kbd> pauses; you can still open panels and queue a spell while paused.</p>
      <p><kbd>1</kbd>–<kbd>9</kbd> use quickbar slots (abilities, spells, potions). In conversation, number keys pick replies.</p>
      <p><kbd>C</kbd> character, <kbd>I</kbd> inventory, <kbd>B</kbd> spellbook, <kbd>J</kbd> journal, <kbd>R</kbd> rest, <kbd>F5</kbd> save, <kbd>F9</kbd> load, <kbd>Esc</kbd> close.</p>
      <h3>Rules</h3>
      <p>Combat uses d20 rules: attack roll d20 + attack bonus vs. Armor Class. A natural 20 threatens a critical hit. Spells force saving throws against DC 10 + spell level + casting ability modifier.</p>
      <p>Rounds last 3 seconds. Warriors gain a second attack at base attack +6. Rogues deal sneak attack damage to foes who are not fighting them.</p>
      <p><b>Rest</b> (when no enemies are near) fully restores hit points, spells and daily abilities.</p>
      <p>Your henchman follows you, fights, and recovers after combat if knocked down. Give him better gear from the inventory panel.</p>
      <p>Skills matter: Search finds traps, Disable Trap and Open Lock deal with them, Persuade and Lore open dialogue options. Anyone can try to bash a lock.</p>
      <h3>Tips</h3>
      <p>Talk to everyone in Bramblewick before heading south. Buy healing potions. Wizards should stay behind the fighter and never wear armor. Return to town to rest and sell loot.</p>
    </div>`;
  }

  // ---------------------------------------------------------------- modals
  openModal(name, title) { this.modal = name; $('modal-title').textContent = title; $('modal').classList.remove('hidden'); $('modal-body').innerHTML = ''; $('modal-close').style.display = ''; return $('modal-body'); }
  closeModal() { this.modal = null; this.modalData = null; $('modal').classList.add('hidden'); this.hideTooltip(); if (this.game) this.game.ui.refreshAll(); }

  showChoice(title, text, choices) {
    const body = this.openModal('choice', title);
    body.appendChild(el('p', '', esc(text)));
    for (const c of choices) { const b = el('button', 'choice', esc(c.text)); b.onclick = () => { this.closeModal(); c.action(); }; body.appendChild(b); }
  }

  showLoot(e) { this.modalData = e; this.openModal('loot', e.name); this.renderLoot(); }
  renderLoot() {
    const e = this.modalData; const g = this.game;
    const body = $('modal-body'); body.innerHTML = '';
    if (!e.loot.gold && !e.loot.items.length) { body.appendChild(el('div', 'muted', 'Empty.')); return; }
    if (e.loot.gold > 0) { const row = el('div', 'row', `<span class="name gold">${icon('gold')}${e.loot.gold} gold</span>`); const b = el('button', '', 'Take'); b.onclick = () => g.takeLoot(e, 'gold'); const a = el('div', 'actions'); a.appendChild(b); row.appendChild(a); body.appendChild(row); }
    e.loot.items.forEach((id, i) => {
      const it = ITEMS[id];
      const row = el('div', 'row', `<span class="name">${this.itemLabel(it)}</span>`);
      const b = el('button', '', 'Take'); b.onclick = () => g.takeLoot(e, i); const a = el('div', 'actions'); a.appendChild(b); row.appendChild(a);
      row.onmouseenter = (ev) => this.showTooltip(ev, this.itemTooltip(it)); row.onmousemove = (ev) => this.moveTooltip(ev); row.onmouseleave = () => this.hideTooltip();
      body.appendChild(row);
    });
    const all = el('button', 'primary', 'Take All'); all.style.marginTop = '8px'; all.onclick = () => { g.takeLoot(e, 'all'); this.closeModal(); };
    body.appendChild(all);
  }

  showShop(title, ids, mult) { this.modalData = { title, ids, mult, tab: 'buy' }; this.openModal('shop', title); this.game.dialogue = null; $('dialogue').classList.add('hidden'); this.renderShop(); }
  renderShop() {
    const d = this.modalData; const g = this.game; const p = g.player;
    const body = $('modal-body'); body.innerHTML = '';
    const tabs = el('div', 'tabs');
    for (const t of ['buy', 'sell']) { const b = el('button', d.tab === t ? 'active' : '', t === 'buy' ? 'Buy' : 'Sell'); b.onclick = () => { d.tab = t; this.renderShop(); }; tabs.appendChild(b); }
    tabs.appendChild(el('span', 'gold', `&nbsp;&nbsp;Your gold: ${p.gold}`));
    body.appendChild(tabs);
    if (d.tab === 'buy') {
      for (const id of d.ids) {
        const it = ITEMS[id]; const price = Math.max(1, Math.round(it.value * d.mult));
        const row = el('div', 'row', `<span class="name">${this.itemLabel(it)}</span><span class="gold">${price}</span>`);
        const b = el('button', '', 'Buy'); b.disabled = p.gold < price; b.onclick = () => { if (g.buy(id, price)) this.renderShop(); };
        const a = el('div', 'actions'); a.appendChild(b); row.appendChild(a);
        row.onmouseenter = (ev) => this.showTooltip(ev, this.itemTooltip(it)); row.onmousemove = (ev) => this.moveTooltip(ev); row.onmouseleave = () => this.hideTooltip();
        body.appendChild(row);
      }
    } else {
      if (!p.inventory.length) body.appendChild(el('div', 'muted', 'Nothing to sell.'));
      p.inventory.forEach((inv, idx) => {
        const it = ITEMS[inv.id]; if (it.quest) return;
        const price = Math.max(0, Math.floor(it.value * 0.5));
        const row = el('div', 'row', `<span class="name">${this.itemLabel(it)}${inv.qty > 1 ? ` <span class="muted">x${inv.qty}</span>` : ''}</span><span class="gold">${price}</span>`);
        const b = el('button', '', 'Sell'); b.onclick = () => { if (g.sell(idx, price)) this.renderShop(); };
        const a = el('div', 'actions'); a.appendChild(b); row.appendChild(a);
        row.onmouseenter = (ev) => this.showTooltip(ev, this.itemTooltip(it)); row.onmousemove = (ev) => this.moveTooltip(ev); row.onmouseleave = () => this.hideTooltip();
        body.appendChild(row);
      });
    }
  }

  showHenchmanMenu(h) {
    const g = this.game;
    this.showChoice(h.name, `"${g.henchmanMode === 'passive' ? "I'll hold back." : "Ready when you are."}" (${h.hp}/${E.maxHp(h)} HP)`, [
      { text: g.henchmanMode === 'passive' ? 'Attack enemies on sight' : 'Hold back, only defend yourself', action: () => { g.henchmanMode = g.henchmanMode === 'passive' ? 'follow' : 'passive'; g.log(`${h.name}: "${g.henchmanMode === 'passive' ? 'Understood, I will hold.' : 'Understood, I will engage.'}"`, 'info'); } },
      { text: 'Give you a healing potion', action: () => { if (E.hasItem(g.player, 'potion_cure_light')) { E.removeItem(g.player, 'potion_cure_light'); E.addItem(h, 'potion_cure_light'); g.log(`You give ${h.name} a potion.`, 'info'); } else g.log('You have no Potions of Cure Light Wounds.', 'info'); } },
      { text: 'Wait here for me (dismiss)', action: () => g.dismissHenchman() },
      { text: 'Never mind', action: () => {} },
    ]);
  }

  showDialogue(name, text, options) {
    const d = $('dialogue'); d.classList.remove('hidden');
    $('dlg-name').textContent = name; $('dlg-text').textContent = text;
    const o = $('dlg-options'); o.innerHTML = '';
    options.forEach((opt, i) => { const r = el('div', '', `<span class="num">${i + 1}.</span>${esc(opt.label)}`); r.onclick = () => this.game.chooseOption(i); o.appendChild(r); });
    if (!options.length) { const r = el('div', '', `<span class="num">1.</span>[End]`); r.onclick = () => this.game.endDialogue(); o.appendChild(r); }
  }
  hideDialogue() { $('dialogue').classList.add('hidden'); }

  // ---------------------------------------------------------------- level up
  showLevelUp() {
    const g = this.game, p = g.player;
    if (!E.canLevelUp(p)) return;
    const newLevel = p.level + 1;
    const cd = CLASSES[p.cls];
    const points = E.skillPointsPerLevel(p);
    const alloc = {}; let left = points;
    let abilityChoice = null;
    const body = this.openModal('levelup', `Level Up — ${cd.name} ${newLevel}`);
    body.classList.add('levelup');
    const render = () => {
      body.innerHTML = `<p>Hit points: +1d${cd.hitDie}${fmtMod(E.abilityMod(p, 'CON'))}${RACES[p.race].toughness ? ' +1' : ''}. Base attack ${fmtMod(E.bab({ ...p, level: newLevel }))}.</p>`;
      const feats = cd.features.filter(f => f.level === newLevel);
      if (feats.length) body.innerHTML += `<p><b>New:</b> ${feats.map(f => f.name + ' — ' + esc(f.desc)).join('<br>')}</p>`;
      if (cd.casting) { const s = cd.casting.slots[newLevel - 1]; body.innerHTML += `<p>Spell slots: ${s.map((n, i) => `L${i + 1}: ${n}`).join(', ')}${s.length > cd.casting.slots[p.level - 1].length ? ' — new spell level!' : ''}</p>`; }
      if (newLevel % 4 === 0) {
        body.innerHTML += `<h3>Ability increase (+1)</h3>`;
        const row = el('div', 'card-list');
        for (const ab of E.ABILITIES) { const c = el('div', 'card' + (abilityChoice === ab ? ' selected' : ''), `${ab} ${E.ability(p, ab)}`); c.onclick = () => { abilityChoice = ab; render(); }; row.appendChild(c); }
        body.appendChild(row);
      }
      body.appendChild(el('h3', '', `Skill points: ${left} remaining`));
      const tbl = el('table', 'stat-table');
      for (const id of SKILL_IDS) {
        const cls = E.isClassSkill(p, id);
        const max = cls ? newLevel + 3 : Math.floor((newLevel + 3) / 2);
        const cur = (p.skills[id] || 0) + (alloc[id] || 0);
        const cost = cls ? 1 : 2;
        const tr = el('tr', '', `<td>${SKILLS[id].name}${cls ? '' : ' <span class="muted">(x2)</span>'}</td><td class="num">${cur}</td><td class="num muted">/${max}</td>`);
        const tdm = el('td'); const bm = el('button', '', '−'); bm.disabled = !(alloc[id] > 0); bm.onclick = () => { alloc[id]--; left += cost; render(); }; tdm.appendChild(bm);
        const tdp = el('td'); const bp = el('button', '', '+'); bp.disabled = left < cost || cur >= max; bp.onclick = () => { alloc[id] = (alloc[id] || 0) + 1; left -= cost; render(); }; tdp.appendChild(bp);
        tr.appendChild(tdm); tr.appendChild(tdp); tbl.appendChild(tr);
      }
      body.appendChild(tbl);
      const ok = el('button', 'primary', 'Confirm'); ok.style.marginTop = '10px';
      ok.disabled = (newLevel % 4 === 0 && !abilityChoice);
      ok.onclick = () => { this.closeModal(); g.levelUp({ skillAlloc: alloc, abilityChoice }); this.openPanel('character'); };
      body.appendChild(ok);
    };
    render();
  }

  // ---------------------------------------------------------------- end screens
  showDeath() {
    $('game-ui').classList.add('hidden');
    $('end-title').textContent = 'You Have Died';
    $('end-text').textContent = `${this.game.player.name} fell in ${this.game.area.name}. The shadows over Bramblewick deepen.`;
    $('endscreen').classList.remove('hidden');
  }
  showVictory() {
    setTimeout(() => {
      $('game-ui').classList.add('hidden');
      $('end-title').textContent = 'The Dawn Returns';
      $('end-text').textContent = `With the Amulet of Dawn restored to its altar, the dead beneath the hill sleep once more. Malachar is dust, the Pale Hand is broken, and the people of Bramblewick will tell stories of ${this.game.player.name} for generations. You may load your save to keep exploring.`;
      $('endscreen').classList.remove('hidden');
    }, 800);
  }

  confirmLoad() {
    const info = this.game.constructor.saveInfo(1);
    if (!info) { this.game.log('No saved game found.', 'info'); return; }
    this.showChoice('Load Game', `Load ${info.name}, level ${info.level} ${info.cls}? Unsaved progress will be lost.`, [
      { text: 'Load', action: () => this.game.load(1) },
      { text: 'Cancel', action: () => {} },
    ]);
  }
}

// ==================================================================== Character creation
export class CharacterCreator {
  constructor(onStart, onBack) {
    this.onStart = onStart; this.onBack = onBack;
    this.race = 'human'; this.cls = 'fighter'; this.gender = 'm';
    this.abilities = { STR: 8, DEX: 8, CON: 8, INT: 8, WIS: 8, CHA: 8 };
    this.skills = {};
    for (const c of document.querySelectorAll('#cc-gender .card')) c.onclick = () => { this.gender = c.dataset.g; for (const d of document.querySelectorAll('#cc-gender .card')) d.classList.toggle('selected', d === c); };
    $('cc-back').onclick = () => onBack();
    $('cc-start').onclick = () => this.start();
    $('cc-name').oninput = () => this.renderSummary();
    $('cc-color').oninput = () => {};
  }
  reset() {
    this.race = 'human'; this.cls = 'fighter';
    this.abilities = { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 };
    this.skills = {};
    this.render();
  }
  static pointCost(v) { if (v <= 14) return v - 8; if (v <= 16) return 6 + (v - 14) * 2; return 10 + (v - 16) * 3; }
  pointsUsed() { return E.ABILITIES.reduce((t, a) => t + CharacterCreator.pointCost(this.abilities[a]), 0); }
  skillBudget() { const cd = CLASSES[this.cls]; const rd = RACES[this.race]; const intMod = mod(this.abilities.INT + (rd.abilities.INT || 0)); return Math.max(1, cd.skillPoints + intMod + (rd.extraSkill || 0)) * 4; }
  skillSpent() { const cd = CLASSES[this.cls]; return SKILL_IDS.reduce((t, id) => t + (this.skills[id] || 0) * (cd.classSkills.includes(id) ? 1 : 2), 0); }
  render() {
    const races = $('cc-races'); races.innerHTML = '';
    for (const r of Object.values(RACES)) { const c = el('div', 'card' + (this.race === r.id ? ' selected' : ''), r.name); c.onclick = () => { this.race = r.id; this.skills = {}; this.render(); }; races.appendChild(c); }
    const classes = $('cc-classes'); classes.innerHTML = '';
    for (const c of Object.values(CLASSES)) { const d = el('div', 'card' + (this.cls === c.id ? ' selected' : ''), icon(c.id) + c.name); d.onclick = () => { this.cls = c.id; this.skills = {}; this.applyRecommended(); this.render(); }; classes.appendChild(d); }
    const rd = RACES[this.race];
    const used = this.pointsUsed();
    $('cc-points').textContent = `(${30 - used} points left)`;
    const tbl = $('cc-abilities'); tbl.innerHTML = '';
    for (const ab of E.ABILITIES) {
      const v = this.abilities[ab]; const total = v + (rd.abilities[ab] || 0);
      const tr = el('tr', '', `<td>${ab}</td><td class="num">${v}</td><td class="num muted">${rd.abilities[ab] ? fmtMod(rd.abilities[ab]) : ''}</td><td class="num"><b>${total}</b></td><td class="num muted">(${fmtMod(mod(total))})</td>`);
      const tdm = el('td'); const bm = el('button', '', '−'); bm.disabled = v <= 8; bm.onclick = () => { this.abilities[ab]--; this.render(); }; tdm.appendChild(bm);
      const tdp = el('td'); const bp = el('button', '', '+'); const nextCost = CharacterCreator.pointCost(v + 1) - CharacterCreator.pointCost(v); bp.disabled = v >= 18 || used + nextCost > 30; bp.onclick = () => { this.abilities[ab]++; this.render(); }; tdp.appendChild(bp);
      tr.appendChild(tdm); tr.appendChild(tdp); tbl.appendChild(tr);
    }
    const budget = this.skillBudget(), spent = this.skillSpent();
    if (spent > budget) this.skills = {};
    $('cc-skillpoints').textContent = `(${budget - this.skillSpent()} points left)`;
    const st = $('cc-skills'); st.innerHTML = '';
    const cd = CLASSES[this.cls];
    for (const id of SKILL_IDS) {
      const cls = cd.classSkills.includes(id); const cost = cls ? 1 : 2; const max = cls ? 4 : 2;
      const cur = this.skills[id] || 0;
      const tr = el('tr', '', `<td title="${esc(SKILLS[id].desc)}">${SKILLS[id].name}${cls ? '' : ' <span class="muted">(x2)</span>'}</td><td class="num">${cur}</td><td class="num muted">/${max}</td>`);
      const tdm = el('td'); const bm = el('button', '', '−'); bm.disabled = cur <= 0; bm.onclick = () => { this.skills[id]--; this.render(); }; tdm.appendChild(bm);
      const tdp = el('td'); const bp = el('button', '', '+'); bp.disabled = cur >= max || budget - this.skillSpent() < cost; bp.onclick = () => { this.skills[id] = cur + 1; this.render(); }; tdp.appendChild(bp);
      tr.appendChild(tdm); tr.appendChild(tdp); st.appendChild(tr);
    }
    this.renderSummary();
    $('cc-desc').innerHTML = `<p><b>${rd.name}.</b> ${esc(rd.desc)}</p><ul>${rd.traits.map(t => `<li>${esc(t)}</li>`).join('')}</ul><p><b>${cd.name}.</b> ${esc(cd.desc)}</p><ul>${cd.features.map(f => `<li>Lv ${f.level}: ${f.name} — ${esc(f.desc)}</li>`).join('')}</ul><p class="muted">Starting gear: ${cd.startingItems.map(i => ITEMS[i].name).join(', ')}, ${cd.startingGold} gold.</p>`;
  }
  applyRecommended() {
    const rec = { fighter: { STR: 16, DEX: 13, CON: 14, INT: 10, WIS: 10, CHA: 8 }, barbarian: { STR: 16, DEX: 13, CON: 14, INT: 8, WIS: 10, CHA: 10 }, rogue: { STR: 12, DEX: 16, CON: 12, INT: 14, WIS: 10, CHA: 10 }, ranger: { STR: 14, DEX: 16, CON: 13, INT: 10, WIS: 12, CHA: 8 }, cleric: { STR: 14, DEX: 10, CON: 14, INT: 8, WIS: 16, CHA: 10 }, wizard: { STR: 8, DEX: 14, CON: 14, INT: 16, WIS: 12, CHA: 8 } };
    this.abilities = { ...rec[this.cls] };
  }
  renderSummary() {
    const tmp = E.createPlayer({ name: $('cc-name').value || 'Hero', race: this.race, cls: this.cls, abilities: this.abilities, skills: this.skills, color: $('cc-color').value });
    const st = E.computeStats(tmp);
    $('cc-summary').innerHTML = `<div><span>Hit Points</span><span>${st.maxHp}</span></div><div><span>Armor Class</span><span>${st.ac}</span></div><div><span>Attack Bonus</span><span>${fmtMod(st.attack)}</span></div><div><span>Damage</span><span>${st.damageDice}${fmtMod(st.damageBonus)}</span></div><div><span>Fort / Ref / Will</span><span>${fmtMod(st.saves.fort)} / ${fmtMod(st.saves.ref)} / ${fmtMod(st.saves.will)}</span></div><div><span>Speed</span><span>${st.speed.toFixed(1)}</span></div>${tmp.spellSlots[1] ? `<div><span>Level 1 spells</span><span>${tmp.spellSlots[1].max}</span></div>` : ''}`;
  }
  start() {
    const name = $('cc-name').value.trim() || 'Hero';
    this.onStart({ name, race: this.race, cls: this.cls, abilities: { ...this.abilities }, skills: { ...this.skills }, color: $('cc-color').value, gender: this.gender });
  }
}
