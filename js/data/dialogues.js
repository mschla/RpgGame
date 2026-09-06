// Dialogue trees. Each node: { text, options: [{ text, next, cond, action, check: {skill, dc}, fail }] }
// `g` is the game API passed to functions.

const SHOP_YSOLDE = ['dagger', 'short_sword', 'rapier', 'longsword', 'battleaxe', 'greataxe', 'greatsword', 'mace', 'quarterstaff', 'light_crossbow', 'longbow',
  'padded_armor', 'leather_armor', 'studded_leather', 'chain_shirt', 'scale_mail', 'chainmail', 'breastplate', 'half_plate', 'full_plate',
  'small_shield', 'large_shield', 'tower_shield', 'thieves_tools', 'torch', 'potion_cure_light'];
const SHOP_YSOLDE_MAGIC = ['longsword_1', 'short_sword_1', 'greataxe_1', 'longbow_1', 'ring_protection_1', 'amulet_health', 'cloak_resistance_1', 'boots_of_striding'];
const SHOP_TEMPLE = ['potion_cure_light', 'potion_cure_moderate', 'potion_cure_serious', 'potion_bulls_strength', 'potion_barkskin', 'holy_symbol'];

export const DIALOGUES = {
  // ---------------------------------------------------------------- CAPTAIN HARLAN
  captain: {
    start: (g) => {
      if (g.questStage('crypt') >= 3) return 'after_all';
      if (g.questStage('crypt') >= 1) return 'crypt_active';
      if (g.questStage('goblins') === 2) return 'goblins_done';
      if (g.questStage('goblins') === 1) return 'goblins_active';
      return 'intro';
    },
    nodes: {
      intro: {
        text: "A broad-shouldered man in a battered breastplate looks you over. \"You've the look of someone who can handle a blade. Name's Harlan, captain of what passes for a guard in Bramblewick. We've trouble, and not enough hands.\"",
        options: [
          { text: 'What kind of trouble?', next: 'trouble' },
          { text: "I'm just passing through.", next: null },
        ],
      },
      trouble: {
        text: "\"Goblins. They've been hitting caravans on the south road for a month. A chief named Grubnash has them organized, which is unusual for the little wretches. His camp's somewhere in the eastern Whispering Woods. And three nights ago, someone broke into the temple and stole the Amulet of Dawn while my men were chasing goblins.\"",
        options: [
          { text: "I'll kill Grubnash for you. What's it pay?", next: 'pay' },
          { text: 'Tell me about the amulet.', next: 'amulet' },
          { text: 'Not my problem.', next: null },
        ],
      },
      amulet: {
        text: "\"Ask Father Aldric at the temple, he'll talk your ear off about it. All I know is it's old, it's holy, and the town's been uneasy since it went missing. Whoever took it knew exactly when to strike.\"",
        options: [
          { text: "I'll kill Grubnash for you. What's it pay?", next: 'pay' },
          { text: "I'll think about it.", next: null },
        ],
      },
      pay: {
        text: "\"Two hundred gold from the town coffers, and my thanks. Bring me proof. His head will do.\"",
        options: [
          { text: 'Two hundred? The goblins are organized, you said. Make it three.', check: { skill: 'persuade', dc: 14 }, next: 'pay_more', fail: 'pay_fail' },
          { text: "Done. I'll be back with his head.", action: (g) => g.setQuest('goblins', 1), next: 'accept' },
          { text: "Too dangerous for that price.", next: null },
        ],
      },
      pay_more: {
        text: "He grimaces, then nods. \"Three hundred. Don't make me regret it.\"",
        options: [{ text: "I'll be back with his head.", action: (g) => { g.setQuest('goblins', 1); g.setFlag('goblin_bonus', true); }, next: 'accept' }],
      },
      pay_fail: {
        text: "\"Two hundred is what the coffers have. Take it or leave it.\"",
        options: [
          { text: "Fine. Two hundred.", action: (g) => g.setQuest('goblins', 1), next: 'accept' },
          { text: 'I leave it.', next: null },
        ],
      },
      accept: {
        text: "\"Take the south gate. Follow the road into the woods and head east, you'll smell the camp before you see it. If you need a hand, there's a ranger named Tomas drinking his wages at the Tankard. Good luck.\"",
        options: [{ text: 'Farewell.', next: null }],
      },
      goblins_active: {
        text: "\"Grubnash still breathing? The camp's east of the road through the Whispering Woods. Watch for archers.\"",
        options: [{ text: "I'm on it.", next: null }],
      },
      goblins_done: {
        text: "You hand over the goblin chief's head. Harlan turns it over grimly. \"That's him. Grubnash the Chief, ugly as his reputation.\" He notices the letter. \"What's this?\"",
        options: [
          { text: 'I found it on his body. Someone paid the goblins to distract you.', next: 'letter' },
        ],
      },
      letter: {
        text: "Harlan reads the letter twice, his face darkening. \"'Bring the amulet to the crypt before the new moon. V.' The Pale Hand. I thought that cult was wiped out years ago. There's an old crypt south of the woods, sunk into the hill. That's where they've taken the amulet.\" He counts out your reward.",
        options: [
          { text: 'Then that is where I am going.', action: (g) => { g.removeItem('goblin_chief_head'); g.removeItem('cult_letter'); g.addGold(g.flag('goblin_bonus') ? 300 : 200); g.completeQuest('goblins'); g.setQuest('crypt', 1); }, next: 'crypt_start' },
        ],
      },
      crypt_start: {
        text: "\"Talk to Father Aldric before you go, he knows more about the Pale Hand than he lets on. The crypt will be full of the dead, and worse. Bring the amulet back and Bramblewick will never forget it.\"",
        options: [{ text: 'I will return with it.', next: null }],
      },
      crypt_active: {
        text: "\"The crypt lies south of the Whispering Woods, past the river. Bring back the amulet. And come back alive, we need you.\"",
        options: [{ text: "I'll be careful.", next: null }],
      },
      after_all: {
        text: "Harlan claps you on the shoulder. \"The amulet's back on the altar and Malachar's ashes are scattered. Bramblewick owes you everything. There'll always be a place for you here.\"",
        options: [{ text: 'It was an honor, Captain.', next: null }],
      },
    },
  },

  // ---------------------------------------------------------------- FATHER ALDRIC
  priest: {
    start: (g) => {
      if (g.questStage('crypt') === 2 && g.hasItem('amulet_of_dawn')) return 'return_amulet';
      if (g.questStage('crypt') >= 3) return 'after';
      return 'intro';
    },
    nodes: {
      intro: {
        text: "An elderly priest in sun-colored robes greets you with a tired smile. \"Welcome to the temple of the Dawnfather, traveler. How may I serve? I can tend your wounds, or sell you what blessed draughts we have left.\"",
        options: [
          { text: 'Heal me. (20 gold)', cond: (g) => g.needsHealing(), action: (g) => { if (g.gold() >= 20) { g.addGold(-20); g.healParty(); g.log('Father Aldric tends your wounds.'); } else g.log('You cannot afford the healing.'); }, next: 'healed' },
          { text: 'What do you have for sale?', action: (g) => g.openShop('Temple of the Dawnfather', SHOP_TEMPLE, 1.1), next: null },
          { text: 'Tell me about the Amulet of Dawn.', next: 'amulet' },
          { text: 'Tell me about the Pale Hand.', cond: (g) => g.questStage('crypt') >= 1, next: 'palehand' },
          { text: 'Farewell.', next: null },
        ],
      },
      healed: {
        text: "Warm light washes over you. \"Go with the Dawnfather's blessing.\"",
        options: [{ text: 'Thank you, Father.', next: null }],
      },
      amulet: {
        text: "\"It was forged in the first days of the town, when the priests sealed the crypt beneath the southern hill and bound the dead within. The amulet was the seal's other half. While it lay on our altar, nothing in that crypt could rise.\" He looks at his hands. \"It has been stolen. I fear what is stirring beneath the hill.\"",
        options: [
          { text: 'Who would want it?', next: 'who' },
          { text: 'I see. Farewell.', next: null },
        ],
      },
      who: {
        text: "\"A necromancer, or someone who serves one. The amulet in the wrong hands does not merely fail to bind the dead. It commands them.\"",
        options: [
          { text: 'A grim thought. Farewell.', next: null },
          { text: 'Is there anything you know of the old sealing rites?', check: { skill: 'lore', dc: 12 }, next: 'lore', fail: 'lore_fail' },
        ],
      },
      lore: {
        text: "The priest's eyebrows rise. \"You have read the old chronicles? Then you know the crypt was the tomb of Sir Aldous, the town's founder, before it became a prison for the dead. His blade, the Dawnblade, was buried with him. It burns the undead like sunlight. If you go beneath the hill, seek his tomb in the western wing.\"",
        options: [{ text: 'I will remember that.', action: (g) => g.setFlag('know_dawnblade', true), next: null }],
      },
      lore_fail: {
        text: "\"Old rites, old words. I would not burden you with them.\"",
        options: [{ text: 'Farewell.', next: null }],
      },
      palehand: {
        text: "\"The Pale Hand worship death as a master to be served, not a door to pass through. A woman named Vashti led them here twenty years ago; we drove them out, or thought we did. If they hold the crypt, expect the dead to walk, and expect Vashti to be well guarded. Their true master will be whoever taught her necromancy.\"",
        options: [
          { text: 'Heal me before I go. (20 gold)', cond: (g) => g.needsHealing(), action: (g) => { if (g.gold() >= 20) { g.addGold(-20); g.healParty(); } else g.log('You cannot afford the healing.'); }, next: 'healed' },
          { text: 'Thank you, Father.', next: null },
        ],
      },
      return_amulet: {
        text: "Father Aldric's hands tremble as he takes the Amulet of Dawn. He sets it upon the altar, and for a moment the whole temple is bathed in golden light. \"It is done. The dead will sleep. You have saved this town, and I have nothing worthy to give you but this.\" He presses a ring into your palm.",
        options: [
          { text: 'It was worth doing.', action: (g) => { g.removeItem('amulet_of_dawn'); g.giveItem('ring_protection_2'); g.addGold(500); g.completeQuest('crypt'); g.endGame(); }, next: null },
        ],
      },
      after: {
        text: "\"The amulet rests on the altar once more. Every prayer said here is said for you, friend. Heal you? Of course, no charge for the savior of Bramblewick.\"",
        options: [
          { text: 'Heal me.', cond: (g) => g.needsHealing(), action: (g) => g.healParty(), next: 'healed' },
          { text: 'What do you have for sale?', action: (g) => g.openShop('Temple of the Dawnfather', SHOP_TEMPLE, 1.0), next: null },
          { text: 'Farewell.', next: null },
        ],
      },
    },
  },

  // ---------------------------------------------------------------- YSOLDE
  merchant: {
    start: () => 'intro',
    nodes: {
      intro: {
        text: "A sharp-eyed woman leans on her counter. \"Weapons, armor, oddments. Ysolde's the name, coin's the game. What'll it be?\"",
        options: [
          { text: "Let's see your wares.", action: (g) => g.openShop("Ysolde's Goods", SHOP_YSOLDE, 1.0), next: null },
          { text: 'Anything... special?', cond: (g) => g.questStage('goblins') >= 2 || g.level() >= 3, next: 'special' },
          { text: 'Heard any news?', next: 'news' },
          { text: 'Just looking.', next: null },
        ],
      },
      special: {
        text: "She glances at the door, then reaches under the counter. \"Enchanted goods. Don't ask where I got them.\"",
        options: [
          { text: 'Show me.', action: (g) => g.openShop("Ysolde's Private Stock", SHOP_YSOLDE_MAGIC, 1.0), next: null },
          { text: 'Talk down the price a little?', check: { skill: 'persuade', dc: 15 }, next: 'discount', fail: 'no_discount' },
        ],
      },
      discount: {
        text: "\"Silver tongue on you. Ten percent off, and not a copper more.\"",
        options: [{ text: 'Show me.', action: (g) => g.openShop("Ysolde's Private Stock", SHOP_YSOLDE_MAGIC, 0.9), next: null }],
      },
      no_discount: {
        text: "\"Nice try. Price is the price.\"",
        options: [{ text: 'Show me anyway.', action: (g) => g.openShop("Ysolde's Private Stock", SHOP_YSOLDE_MAGIC, 1.0), next: null }],
      },
      news: {
        text: "\"Goblins on the south road, so no caravans, so my shelves are thin. Bram's got bugs in his cellar. Mara's still waiting for a boy who isn't coming home. And someone robbed the temple. Cheerful place, Bramblewick.\"",
        options: [{ text: "Let's see your wares.", action: (g) => g.openShop("Ysolde's Goods", SHOP_YSOLDE, 1.0), next: null }, { text: 'Thanks.', next: null }],
      },
    },
  },

  // ---------------------------------------------------------------- MARA
  mara: {
    start: (g) => {
      if (g.questStage('locket') >= 3) return 'after';
      if (g.questStage('locket') >= 1 && g.hasItem('silver_locket')) return 'found';
      if (g.questStage('locket') === 1) return 'active';
      return 'intro';
    },
    nodes: {
      intro: {
        text: "A woman with red-rimmed eyes stands in her doorway, looking south toward the woods. \"Are you going into the Whispering Woods? Everyone who goes in comes back with a story, except my Tam.\"",
        options: [
          { text: 'What happened to Tam?', next: 'tam' },
          { text: "I'm sorry for your loss.", next: null },
        ],
      },
      tam: {
        text: "\"He went hunting west of the road, near the old antlion nest. That was in spring. The guards found his bow but not him, and not the locket he wore. It had my husband's picture in it.\" She grips your arm. \"If you find it, bring it to me. Please. I have thirty gold saved.\"",
        options: [
          { text: "I'll look for it. Keep your gold.", action: (g) => { g.setQuest('locket', 1); g.setFlag('locket_noble', true); }, next: 'thanks' },
          { text: "I'll look for it.", action: (g) => g.setQuest('locket', 1), next: 'thanks' },
          { text: "I can't promise anything.", next: null },
        ],
      },
      thanks: {
        text: "\"Thank you. Thank you. Be careful of the antlions.\"",
        options: [{ text: 'I will.', next: null }],
      },
      active: {
        text: "\"Any sign of the locket? It was near the antlion nest, west of the road.\"",
        options: [{ text: 'Not yet.', next: null }],
      },
      found: {
        text: "You hold out the tarnished silver locket. Mara takes it with both hands and opens it, and for a long moment says nothing at all. \"That's him. That's my Aldo. Tam carried it everywhere.\" She wipes her eyes. \"Take the gold. Please. It's all I can do.\"",
        options: [
          { text: 'Keep it. Remember them both.', action: (g) => { g.removeItem('silver_locket'); g.completeQuest('locket'); g.addXp(100); g.log('Mara looks at you with quiet gratitude.'); }, next: 'after_noble' },
          { text: 'Thank you. (Take 30 gold)', action: (g) => { g.removeItem('silver_locket'); g.completeQuest('locket'); g.addGold(30); }, next: 'after' },
        ],
      },
      after_noble: {
        text: "\"You're a good soul. The Dawnfather keep you.\"",
        options: [{ text: 'Farewell, Mara.', next: null }],
      },
      after: {
        text: "Mara holds the locket close. \"I sleep a little better now. Thank you.\"",
        options: [{ text: 'Take care, Mara.', next: null }],
      },
    },
  },

  // ---------------------------------------------------------------- BRAM
  bram: {
    start: (g) => {
      if (g.questStage('rats') >= 3) return 'after';
      if (g.questStage('rats') >= 1 && g.countItem('antling_mandible') >= 5) return 'tails';
      if (g.questStage('rats') === 1) return 'active';
      return 'intro';
    },
    nodes: {
      intro: {
        text: "A barrel-chested innkeeper wipes a mug that will never be clean. \"Welcome to the Rusty Tankard. Ale's a copper, beds are free if you can stand the snoring. What can I do for you?\"",
        options: [
          { text: 'You look like a man with a problem.', next: 'rats' },
          { text: 'Who is the ranger in the corner?', next: 'tomas' },
          { text: 'Heard any rumors?', next: 'rumors' },
          { text: 'Nothing, thanks.', next: null },
        ],
      },
      rats: {
        text: "\"Antlings. Burrowing insects the size of dogs, chewing through my stock. My last cellar boy came up screaming about one with mandibles like scythes. Clear them out and bring me five mandibles as proof and I'll pay fifty gold. Stairs are in the back corner.\"",
        options: [
          { text: "Consider it done.", action: (g) => g.setQuest('rats', 1), next: 'accept' },
          { text: "I don't do bugs.", next: null },
        ],
      },
      accept: {
        text: "\"Good. Mind the big one.\"",
        options: [{ text: 'Right.', next: null }],
      },
      active: {
        text: "\"Five mandibles, friend, and fifty gold is yours. The cellar stairs are in the corner.\"",
        options: [{ text: 'Working on it.', next: null }],
      },
      tails: {
        text: "Bram grimaces at the handful of mandibles, then laughs. \"Ha! That's them. And the big one too, I hope. Here's your fifty, and a drink on the house.\"",
        options: [{ text: 'Pleasure doing business.', action: (g) => { g.removeItem('antling_mandible', 5); g.addGold(50); g.completeQuest('rats'); }, next: null }],
      },
      after: {
        text: "\"My cellar's quiet at last. Ale's on the house for you, always.\"",
        options: [
          { text: 'Heard any rumors?', next: 'rumors' },
          { text: 'Thanks, Bram.', next: null },
        ],
      },
      tomas: {
        text: "\"Tomas? Ranger out of the western hills. Best shot I ever saw, when he's sober. He's been drinking through his savings since the goblins burned his cabin. Might be he'd go with you if you asked right.\"",
        options: [{ text: 'Interesting.', next: null }],
      },
      rumors: {
        text: "\"Old Greymandible's back in the western woods, an antlion the size of a pony. And a minotaur's moved into the cave past the river. Then there's the crypt in the south hills. Folk say lights have been seen there at night. Nobody goes near it.\"",
        options: [{ text: 'Thanks for the warning.', next: null }],
      },
    },
  },

  // ---------------------------------------------------------------- TOMAS
  tomas: {
    start: (g) => {
      if (g.flag('tomas_hired')) return 'hired';
      if (g.questStage('elric') >= 2 && !g.flag('elric_thanked')) return 'hired';
      return 'intro';
    },
    nodes: {
      intro: {
        text: "A lean man with a longbow across his knees regards you over a mug of ale. \"If you're looking for company, I'm not it. If you're looking for a ranger, I was one, until Grubnash's goblins burned everything I owned.\"",
        options: [
          { text: "I'm going after Grubnash. Come with me.", cond: (g) => g.questStage('goblins') >= 1 && g.questStage('goblins') < 3, action: (g) => g.hireHenchman('tomas'), next: 'join_revenge' },
          { text: "I could use a good bow. I'll pay 100 gold.", cond: (g) => g.gold() >= 100, action: (g) => { g.addGold(-100); g.hireHenchman('tomas'); }, next: 'join_gold' },
          { text: "Sitting here won't get your cabin back. Come with me and hit them where it hurts.", check: { skill: 'persuade', dc: 13 }, action: (g) => g.hireHenchman('tomas'), next: 'join_persuade', fail: 'refuse' },
          { text: 'Maybe another time.', next: null },
        ],
      },
      join_revenge: {
        text: "He sets down the mug. \"Grubnash. Well. That changes things.\" He stands and shoulders the bow. \"Lead the way. I'll watch your back, you get me a clear shot at that green bastard.\"",
        options: [{ text: 'Welcome aboard.', next: null }],
      },
      join_gold: {
        text: "He counts the coins, then nods. \"Fair enough. A bow for hire.\" He drains the mug and stands. \"Lead on.\"",
        options: [{ text: "Let's go.", next: null }],
      },
      join_persuade: {
        text: "He stares at you for a long moment. Then he laughs, short and bitter. \"You're right. Damn you, but you're right.\" He stands. \"Let's go kill something.\"",
        options: [{ text: "That's the spirit.", next: null }],
      },
      refuse: {
        text: "\"Save the speeches. I've heard better from worse.\" He goes back to his ale.",
        options: [{ text: 'Suit yourself.', next: null }],
      },
      hired: {
        text: "\"Where to next? I'm with you.\"",
        options: [
          { text: 'How are you holding up?', next: 'status' },
          { text: 'Wait here for me.', cond: (g) => g.flag('tomas_hired'), action: (g) => g.dismissHenchman(), next: 'wait' },
          { text: "Let's move.", next: null },
        ],
      },
      status: {
        text: (g) => `\"Still standing.\" He checks his quiver. \"${g.henchmanHp()}\"`,
        options: [{ text: 'Good.', next: null }],
      },
      wait: {
        text: "\"I'll be at the Tankard. Don't die without me.\"",
        options: [{ text: "I'll be back.", next: null }],
      },
    },
  },

  // ---------------------------------------------------------------- ELRIC
  elric: {
    start: (g) => g.questStage('elric') >= 1 ? 'again' : 'intro',
    nodes: {
      intro: {
        text: "A gaunt man in a torn scholar's robe presses himself against the back of the cell as you approach, then sags with relief. \"You're not one of them. Thank the gods. I'm Elric, I came to study the crypt's inscriptions and walked straight into the Pale Hand.\"",
        options: [
          { text: 'What are the cultists doing here?', next: 'cult' },
          { text: "You're free. Get out of here.", action: (g) => { g.setQuest('elric', 1); g.setFlag('elric_freed', true); }, next: 'free' },
        ],
      },
      cult: {
        text: "\"Their master, Malachar, has the amulet in the sanctum below. With it he can raise every corpse in these catacombs, and there are hundreds. The sanctum door is warded; only the iron key opens it, and Vashti, their priestess, keeps it on her belt. She never leaves the shrine.\"",
        options: [
          { text: "Then I'll take it from her. Get out while you can.", action: (g) => { g.setQuest('elric', 1); g.setFlag('elric_freed', true); }, next: 'free' },
        ],
      },
      free: {
        text: "\"I owe you my life. I'll make for the town. If you survive this, find me at the tavern.\" He hurries off toward the stairs, hugging the walls.",
        options: [{ text: 'Go carefully.', action: (g) => { g.completeQuest('elric'); g.removeNpc('elric'); }, next: null }],
      },
      again: {
        text: "\"I should be going.\"",
        options: [{ text: 'Yes.', action: (g) => { g.completeQuest('elric'); g.removeNpc('elric'); }, next: null }],
      },
    },
  },

  // ---------------------------------------------------------------- MISC
  guard: {
    start: (g) => g.questStage('crypt') >= 3 ? 'after' : 'intro',
    nodes: {
      intro: { text: "\"Stay on the road if you're heading south. Goblins have been bold lately, and there's worse in those woods than goblins.\"", options: [{ text: 'Noted.', next: null }] },
      after: { text: "The guard salutes you. \"Hero of Bramblewick! Good day to you.\"", options: [{ text: 'Good day.', next: null }] },
    },
  },
  villager: {
    start: () => 'intro',
    nodes: {
      intro: { text: "\"The temple's been dark since the amulet was taken. My grandmother says the dead under the hill can feel it. I say she's had too much of Bram's ale.\"", options: [{ text: 'Perhaps.', next: null }] },
    },
  },
  fisherman: {
    start: () => 'intro',
    nodes: {
      intro: { text: "\"Nothing bites anymore. Fish know something we don't.\" He squints at the water. \"There's a crossing over the forest river, west of the road, if you're looking for the minotaur's cave. Don't know why you would be.\"", options: [{ text: 'Thanks for the tip.', next: null }] },
    },
  },
  drunk: {
    start: () => 'intro',
    nodes: {
      intro: { text: "\"Th' bugs... they've got a queen down there. Big as a hound. Saw her mandibles.\" He slumps back onto the table.", options: [{ text: 'Sleep it off.', next: null }] },
    },
  },
};
