// Dice and random helpers

export function rollDie(sides) {
  return 1 + Math.floor(Math.random() * sides);
}

export function roll(n, sides, bonus = 0) {
  let t = bonus;
  for (let i = 0; i < n; i++) t += rollDie(sides);
  return t;
}

// Parse strings like "2d6+3", "1d8", "d4-1", "5"
export function parseDice(str) {
  if (typeof str === 'number') return { n: 0, sides: 0, bonus: str };
  const m = /^(\d*)d(\d+)([+-]\d+)?$/i.exec(str.trim());
  if (!m) {
    const v = parseInt(str, 10);
    return { n: 0, sides: 0, bonus: isNaN(v) ? 0 : v };
  }
  return { n: m[1] === '' ? 1 : parseInt(m[1], 10), sides: parseInt(m[2], 10), bonus: m[3] ? parseInt(m[3], 10) : 0 };
}

export function rollDice(str) {
  const d = parseDice(str);
  return roll(d.n, d.sides, d.bonus);
}

export function diceAverage(str) {
  const d = parseDice(str);
  return d.n * (d.sides + 1) / 2 + d.bonus;
}

export function mod(score) {
  return Math.floor((score - 10) / 2);
}

export function fmtMod(v) {
  return v >= 0 ? `+${v}` : `${v}`;
}

export function randInt(a, b) {
  return a + Math.floor(Math.random() * (b - a + 1));
}

export function choice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function chance(p) {
  return Math.random() < p;
}

// Deterministic PRNG (mulberry32) for map generation
export function seededRandom(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
