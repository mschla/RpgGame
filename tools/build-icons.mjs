// Copies the icons listed in js/data/icons.js from a game-icons/icons checkout
// (https://github.com/game-icons/icons) into assets/icons/, stripping the black background
// so the UI can recolor them with a CSS mask. Also writes an attribution file.
//
//   node tools/build-icons.mjs /path/to/game-icons
//
// The checkout may be a blob-less clone: files that are not present on disk are read with `git show`.
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { ICONS, iconFile } from '../js/data/icons.js';

const SRC = path.resolve(process.argv[2] || '../game-icons');
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'icons');
fs.mkdirSync(OUT, { recursive: true });

function readIcon(rel) {
  const f = path.join(SRC, rel);
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
  return execFileSync('git', ['-C', SRC, 'show', `HEAD:${rel}`], { encoding: 'utf8', maxBuffer: 1 << 24 });
}

const authors = {};
let n = 0;
for (const p of new Set(Object.values(ICONS))) {
  let svg;
  try { svg = readIcon(p + '.svg'); } catch (e) { console.warn('missing icon', p); continue; }
  svg = svg.replace(/<path d="M0 0h512v512H0z"\/>/, '').replace(/ fill="#fff"/g, ' fill="currentColor"');
  fs.writeFileSync(path.join(OUT, iconFile(p)), svg);
  const [author, name] = p.split('/');
  (authors[author] = authors[author] || []).push(name);
  n++;
}
const credits = ['Icons from game-icons.net, licensed CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/).', 'See https://github.com/game-icons/icons/blob/master/license.txt for contributor links.', '']
  .concat(Object.entries(authors).sort().map(([a, names]) => `${a}: ${names.sort().join(', ')}`));
fs.writeFileSync(path.join(OUT, '..', 'CREDITS-game-icons.txt'), credits.join('\n') + '\n');
console.log(`wrote ${n} icons to ${OUT}`);
