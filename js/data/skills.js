export const SKILLS = {
  persuade: { id: 'persuade', name: 'Persuade', ability: 'CHA', desc: 'Talk your way through conversations and haggle for better prices.' },
  lore: { id: 'lore', name: 'Lore', ability: 'INT', desc: 'Knowledge of history, magic and legends. Unlocks dialogue options.' },
  search: { id: 'search', name: 'Search', ability: 'INT', desc: 'Notice hidden traps and secret compartments.' },
  disabletrap: { id: 'disabletrap', name: 'Disable Trap', ability: 'INT', desc: 'Safely disarm traps you have found.' },
  openlock: { id: 'openlock', name: 'Open Lock', ability: 'DEX', desc: 'Pick locks on doors and chests.' },
  concentration: { id: 'concentration', name: 'Concentration', ability: 'CON', desc: 'Cast spells reliably while being attacked.' },
  intimidate: { id: 'intimidate', name: 'Intimidate', ability: 'CHA', desc: 'Frighten others into cooperating.' },
};
export const SKILL_IDS = Object.keys(SKILLS);
