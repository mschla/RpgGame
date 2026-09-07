import { Game } from './game/game.js';
import { Renderer } from './game/renderer.js';
import { UI, CharacterCreator } from './game/ui.js';
import { Assets } from './game/assets.js';

const $ = (id) => document.getElementById(id);

const canvas = $('game');
const assets = new Assets('assets/');
const renderer = new Renderer(canvas, $('minimap'), assets);
const ui = new UI();
const game = new Game(ui, renderer);
ui.game = game; renderer.game = game;
window.game = game; // for debugging in the console

const creator = new CharacterCreator(
  (opts) => { showScreen('game'); game.newGame(opts); renderer.snapCamera(); },
  () => showScreen('menu'),
);
creator.renderer = renderer;

function showScreen(name) {
  $('menu').classList.toggle('hidden', name !== 'menu');
  $('create').classList.toggle('hidden', name !== 'create');
  $('game-ui').classList.toggle('hidden', name !== 'game');
  $('endscreen').classList.add('hidden');
  if (name === 'menu') refreshSaveInfo();
}

function refreshSaveInfo() {
  const info = Game.saveInfo(1);
  $('btn-load').disabled = !info;
  $('save-info').textContent = info ? `Saved game: ${info.name}, level ${info.level} ${info.cls} (${new Date(info.savedAt).toLocaleString()})` : 'No saved game.';
}

$('btn-new').onclick = () => { showScreen('create'); creator.reset(); };
$('btn-load').onclick = () => { if (game.load(1)) showScreen('game'); };
$('btn-help-menu').onclick = () => { alert('Click to move and interact. Click enemies to attack, people to talk. Space pauses. C/I/B/J open character, inventory, spellbook and journal. R rests. F5 saves, F9 loads. Numbers 1-9 use the quickbar.'); };
$('end-load').onclick = () => { if (game.load(1)) showScreen('game'); else showScreen('menu'); };
$('end-menu').onclick = () => { game.running = false; showScreen('menu'); };

// ---------------------------------------------------------------- input
let mouseDown = false;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousemove', (e) => {
  renderer.mouse.x = e.clientX; renderer.mouse.y = e.clientY;
  if (game.running) renderer.hover = renderer.pick(e.clientX, e.clientY);
  canvas.style.cursor = renderer.hover ? 'pointer' : 'crosshair';
});
canvas.addEventListener('mouseleave', () => { renderer.mouse.x = -1; renderer.hover = null; });
canvas.addEventListener('mousedown', (e) => {
  if (!game.running || game.gameOver) return;
  if (game.dialogue) { return; }
  if (ui.modalOpen()) return;
  if (e.button === 2) {
    if (game.pendingSpell) { game.cancelTargeting(); return; }
    const ent = renderer.pick(e.clientX, e.clientY);
    if (ent) game.examine(ent);
    return;
  }
  if (e.button !== 0) return;
  const ent = renderer.pick(e.clientX, e.clientY);
  if (ent) game.clickEntity(ent);
  else { const [tx, ty] = renderer.toTile(e.clientX, e.clientY); game.clickTile(tx, ty); }
});

window.addEventListener('keydown', (e) => {
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  const k = e.key.toLowerCase();
  if (!game.running) return;
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { game.keys[k] = true; e.preventDefault(); return; }
  if (game.dialogue) {
    if (/^[1-9]$/.test(k)) { const i = parseInt(k, 10) - 1; if (game.dialogue.options && game.dialogue.options.length === 0 && i === 0) game.endDialogue(); else game.chooseOption(i); }
    if (k === 'escape') game.endDialogue();
    return;
  }
  if (k === 'escape') {
    if (game.pendingSpell) game.cancelTargeting();
    else if (ui.modalOpen()) ui.closeModal();
    else if (ui.panelName) ui.closePanel();
    else game.togglePause();
    return;
  }
  if (ui.modalOpen()) return;
  if (k === ' ') { game.togglePause(); e.preventDefault(); }
  else if (k === 'c') ui.togglePanel('character');
  else if (k === 'i') ui.togglePanel('inventory');
  else if (k === 'b') ui.togglePanel('spells');
  else if (k === 'j') ui.togglePanel('journal');
  else if (k === 'h') ui.togglePanel('help');
  else if (k === 'r') game.rest();
  else if (k === 'f5') { e.preventDefault(); game.save(1); }
  else if (k === 'f9') { e.preventDefault(); ui.confirmLoad(); }
  else if (/^[1-9]$/.test(k)) ui.useQuickSlot(parseInt(k, 10) - 1);
});
window.addEventListener('keyup', (e) => { game.keys[e.key.toLowerCase()] = false; });
window.addEventListener('blur', () => { game.keys = {}; });

// ---------------------------------------------------------------- loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  try {
    game.update(dt);
    renderer.draw(dt);
  } catch (err) {
    console.error(err);
  }
  requestAnimationFrame(frame);
}
showScreen('menu');
requestAnimationFrame(frame);

// ---------------------------------------------------------------- art
const loadingEl = $('loading');
$('btn-new').disabled = true; $('btn-load').disabled = true;
assets.load((f) => { loadingEl.textContent = `Loading art… ${Math.round(f * 100)}%`; }).then((ok) => {
  loadingEl.textContent = ok ? '' : 'Art assets not found; using simple graphics.';
  $('btn-new').disabled = false; refreshSaveInfo();
});
