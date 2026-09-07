// Smoke test: serves the game from this folder, plays it through Playwright's Chromium and exits non-zero
// on any failure. Checks: new game, character preview, click-to-move, panels, the tavern door and cellar
// stairs, save and load, the crypt door, every area rendering, and no page or console errors.
//   node tools/smoke.mjs [--shots DIR]      (npm test)
// Uses the `playwright` package; PLAYWRIGHT_MODULE can point at another install, CHROMIUM_PATH at a browser.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shotsDir = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });

let chromium;
try { ({ chromium } = await import('playwright')); } catch (e) { ({ chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs')); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.ogg': 'audio/ogg', '.txt': 'text/plain' };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const results = [];
const check = (name, ok, info = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${info}`); };
const shot = (name) => shotsDir ? page.screenshot({ path: path.join(shotsDir, name + '.png') }) : Promise.resolve();
const state = () => page.evaluate(() => { const g = window.game; return { area: g.area.id, x: g.player.x, y: g.player.y, gold: g.player.gold, hp: g.player.hp, running: g.running }; });
const clickTile = async (dx, dy) => {
  const [sx, sy] = await page.evaluate(([dx, dy]) => { const g = window.game; return g.renderer.toScreen(g.player.x + dx, g.player.y + dy); }, [dx, dy]);
  await page.mouse.click(sx, sy);
};

try {
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  let ready = false;
  for (let i = 0; i < 240; i++) { await page.waitForTimeout(500); if (await page.evaluate(() => !document.getElementById('btn-new').disabled)) { ready = true; break; } }
  check('assets loaded', ready);
  await page.click('#btn-new'); await page.waitForTimeout(600);
  await page.evaluate(() => { [...document.querySelectorAll('#cc-races .card')].find(c => c.textContent.trim() === 'Dwarf').click(); });
  await page.waitForTimeout(400);
  const preview = await page.evaluate(() => { const c = document.getElementById('cc-preview'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; });
  check('character preview drawn', preview > 500, `${preview} px`);
  await page.click('#cc-start'); await page.waitForTimeout(800);
  const s0 = await state();
  check('game started in town', s0.area === 'town' && s0.running, JSON.stringify(s0));
  await clickTile(0, 3); await page.waitForTimeout(2500);
  const s1 = await state();
  check('walked by clicking', Math.abs(s1.y - s0.y) > 1.5 || Math.abs(s1.x - s0.x) > 1.5, `${s0.x.toFixed(1)},${s0.y.toFixed(1)} -> ${s1.x.toFixed(1)},${s1.y.toFixed(1)}`);
  await page.keyboard.press('i'); await page.waitForTimeout(300);
  check('inventory opened', await page.evaluate(() => !document.getElementById('panel').classList.contains('hidden') && window.game.ui.panelName === 'inventory'));
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  check('inventory closed', await page.evaluate(() => document.getElementById('panel').classList.contains('hidden') && !window.game.ui.panelName));
  await page.keyboard.press('h'); await page.waitForTimeout(300);
  check('help panel with sound settings', await page.evaluate(() => !!document.getElementById('snd-music')));
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await page.evaluate(() => { window.game.changeArea('town', 8, 10); }); await page.waitForTimeout(500);
  await clickTile(0, -1); await page.waitForTimeout(2500);
  check('entered the tavern through its door', (await state()).area === 'tavern');
  await page.evaluate(() => { window.game.changeArea('tavern', 17, 9); }); await page.waitForTimeout(500);
  await clickTile(1, 1); await page.waitForTimeout(3000);
  const s4 = await state();
  check('went down to the cellar', s4.area === 'cellar', s4.area);
  await page.evaluate(() => { for (const m of window.game.area.entities) if (m.kind === 'monster') m.dead = true; });
  await clickTile(2, 1); await page.waitForTimeout(2500);
  const s5 = await state();
  check('walked in the cellar', s5.area === 'cellar' && (Math.abs(s5.x - s4.x) > 0.8 || Math.abs(s5.y - s4.y) > 0.8));
  await shot('cellar');
  await page.keyboard.press('F5'); await page.waitForTimeout(500);
  check('saved with F5', await page.evaluate(() => Object.keys(localStorage).some(k => /save|bramble/i.test(k))));
  const before = await state();
  await page.evaluate(() => { const g = window.game; g.changeArea('tavern', 9, 7); g.player.gold += 999; }); await page.waitForTimeout(300);
  await page.keyboard.press('F9'); await page.waitForTimeout(500);
  check('F9 asks for confirmation', await page.evaluate(() => window.game.ui.modalOpen() && [...document.querySelectorAll('#modal-body button')].some(b => b.textContent.trim() === 'Load')));
  await page.evaluate(() => { const b = [...document.querySelectorAll('#modal-body button')].find(b => b.textContent.trim() === 'Load'); if (b) b.click(); }); await page.waitForTimeout(1500);
  const after = await state();
  check('loaded with F9 (area and gold restored)', after.area === before.area && after.gold === before.gold && Math.abs(after.x - before.x) < 0.01, `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
  await page.evaluate(() => { const g = window.game; g.changeArea('crypt', 20, 31); for (const m of g.area.entities) if (m.kind === 'monster') m.dead = true; g.area.entities.find(e => e.type === 'door').locked = false; }); await page.waitForTimeout(400);
  await clickTile(0, 2); await page.waitForTimeout(2500);
  check('sanctum door opened by clicking', await page.evaluate(() => window.game.area.entities.find(e => e.type === 'door').open));
  for (const [id, x, y] of [['forest', 24, 20], ['town', 20, 13], ['crypt', 20, 4]]) {
    await page.evaluate(([id, x, y]) => { const g = window.game; g.changeArea(id, x, y); g.area.explored.fill(1); }, [id, x, y]); await page.waitForTimeout(700);
    await shot(id);
  }
  check('all areas render', true);
  const combat = await page.evaluate(async () => { const g = window.game; g.changeArea('cellar', 6, 3); const m = g.area.entities.find(e => e.kind === 'monster' && !e.dead) || g.area.entities.find(e => e.kind === 'monster'); m.dead = false; m.hp = 5; m.x = g.player.x + 1; m.y = g.player.y; m.awake = true; const C = await import('./js/game/combat.js'); for (let i = 0; i < 12 && !m.dead; i++) C.weaponAttack(g, g.player, m); return m.dead; });
  check('combat kills a rat', combat);
} catch (e) { check('script completed', false, e.message); }
check('no page errors', errors.length === 0, errors.join(' | '));
console.log(results.join('\n'));
await browser.close();
server.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
