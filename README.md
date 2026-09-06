# Shadows of Bramblewick

A browser-based role-playing game in the spirit of *Neverwinter Nights*: an isometric world, d20 combat rules, character creation with races and classes, real-time-with-pause fighting, spells, dialogue trees with skill checks, a quest journal, a henchman, loot, traps, locks, and save games.

No build step and no runtime dependencies. It is plain HTML, CSS and ES modules drawn on a canvas. The art comes from the open-source game [Flare](https://github.com/flareteam/flare-game) (see *Art* below).

## Running it

Serve the folder with any static file server (ES modules will not load from `file://`):

```
python3 -m http.server 8000
```

Then open <http://localhost:8000/>. It also works when published on GitHub Pages or any static host.

## The game

You arrive in the town of Bramblewick. Goblins raid the south road, antlings infest the tavern cellar, a widow's son never came home from the woods, and someone has stolen the Amulet of Dawn from the temple. The trail leads through the Whispering Woods to the Sunken Crypt, where the Pale Hand cult and the necromancer Malachar wait.

Five areas: Bramblewick, the Rusty Tankard tavern, its cellar, the Whispering Woods and the Sunken Crypt. Five quests, a hireable ranger companion, shops, a temple healer, a locked sanctum, trapped corridors, antlions and fire ants in the woods, a minotaur in a cave, and a final boss who raises the dead.

### Character creation

* Six races: Human, Elf, Dwarf, Halfling, Half-Orc, Gnome. Each has ability modifiers and traits.
* Six classes: Fighter, Barbarian, Rogue, Ranger, Cleric, Wizard. Each has a hit die, attack and save progression, proficiencies, class skills and features (Rage, Sneak Attack, Turn Undead, Favored Enemy, Weapon Specialization, spellcasting).
* Point-buy abilities (30 points, NWN cost curve), skill ranks with class and cross-class costs, and a summary of the resulting stats.

### Rules

* Attack roll d20 + attack bonus vs. Armor Class. Natural 20 threatens a critical; weapons have their own threat range and multiplier.
* Damage is weapon dice + Strength (x1.5 two-handed), enhancement, and class bonuses. Rogues add sneak attack dice against foes not fighting them. Rangers add favored-enemy damage.
* Saving throws (Fortitude, Reflex, Will) against spell DC 10 + spell level + casting ability modifier. Rogues get Evasion.
* Rounds last three seconds. A second attack at base attack +6. Haste grants an extra attack.
* Armor limits the Dexterity bonus. Wizards cannot cast while wearing armor. Classes have weapon and armor proficiency lists.
* Damage reduction (skeletons, Stoneskin), paralysis (ghouls, Hold Person), poison (spiders), damage over time (Acid Arrow), temporary hit points (Aid), party buffs (Bless, Prayer).
* Experience thresholds follow the NWN table (level n needs 1000 × n(n−1)/2). Level cap 10. Level-up lets you spend skill points and, every fourth level, raise an ability.
* Twenty-eight spells across five levels for Wizards (arcane) and Clerics (divine), with slots per level and bonus slots from the casting ability.

### Controls

| Input | Action |
| --- | --- |
| Left click | Move, attack an enemy, talk, loot, travel through a glowing exit |
| Right click | Examine, or cancel spell targeting |
| WASD / arrows | Walk |
| Space | Pause and unpause |
| 1–9 | Quickbar slots (abilities, spells, potions); pick dialogue replies |
| C / I / B / J | Character sheet, inventory, spellbook, journal |
| R | Rest (no enemies nearby) |
| F5 / F9 | Save / load (browser localStorage) |
| Esc | Close panels, cancel targeting, pause |

## Art

Tiles, props and animated creature sprites are taken from Flare's fantasycore assets (CC-BY-SA 3.0, credits in `assets/CREDITS-flare.txt`, license in `assets/LICENSE-flare-art.txt`). They were rendered at half of Flare's 192x96 resolution, so the game grid is 96x48. Human characters, enemies and NPCs alike, are drawn from Flare's layered avatar sheets, so the hero's armor, weapon and shield show on the sprite. If the `assets/` folder is missing the game falls back to simple procedural graphics.

Spell, item, ability and class icons are from [game-icons.net](https://game-icons.net) (CC BY 3.0, attribution in `assets/CREDITS-game-icons.txt`). The assignments live in `js/data/icons.js`; `node tools/build-icons.mjs /path/to/game-icons` extracts the SVGs from a checkout of the game-icons/icons repository.

To regenerate the Flare assets from a flare-game checkout (needs Node and the `playwright` package, whose bundled Chromium does the image scaling):

```
node tools/build-assets.mjs /path/to/flare-game
```

## Code layout

```
index.html            page skeleton
css/style.css         UI theme
js/main.js            bootstrap, input, game loop
js/core/dice.js       dice, modifiers, seeded RNG
js/core/pathfinding.js A* with no corner cutting, Bresenham line of sight
js/data/              races, classes, skills, items, spells, monsters, areas, dialogues, quests
js/game/entity.js     creature creation, inventory, derived stats, spell slots, level-up
js/game/combat.js     attacks, damage, saves, spells, effects, special abilities, loot
js/game/game.js       world state, AI, player actions, interactions, dialogue API, save/load
js/game/renderer.js   isometric canvas renderer, tile atlas, sprite animation, fog of war, effects, minimap
js/game/assets.js     art loader, direction and animation helpers
js/game/avatar.js     equipment to avatar sprite layer mapping
tools/build-assets.mjs builds assets/ from a flare-game checkout
tools/build-icons.mjs  extracts the game-icons.net SVGs listed in js/data/icons.js
js/game/ui.js         HUD, quickbar, panels, dialogue, shop, loot, level-up, character creation
```

Areas are generated from small builder scripts in `js/data/areas.js`, so new maps can be added by describing rooms, roads and scatter rather than drawing tiles by hand. Dialogue trees in `js/data/dialogues.js` receive a small game API (`questStage`, `setQuest`, `hasItem`, `addGold`, `openShop`, `hireHenchman`, ...) so writing a new NPC needs no engine changes.
