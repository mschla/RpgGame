export const QUESTS = {
  rats: {
    name: 'Rats in the Cellar', xp: 250,
    stages: {
      1: 'Bram, the innkeeper of the Rusty Tankard, is overrun with rats in his cellar. He will pay for five rat tails.',
      2: 'I have collected enough rat tails. I should return to Bram for my reward.',
      3: 'Bram paid me for clearing out his cellar. The Rusty Tankard is rat-free, for now.',
    },
    done: 3,
  },
  goblins: {
    name: 'Goblin Trouble', xp: 500,
    stages: {
      1: 'Captain Harlan asked me to deal with the goblins raiding the roads. Their chief, Grubnash, has a camp in the eastern part of the Whispering Woods, south of town.',
      2: 'Grubnash is dead. I found a letter on his body: someone signing as "V" paid the goblins to keep the guards busy while an amulet was taken to a crypt. I should show this to Captain Harlan.',
      3: 'Captain Harlan rewarded me for killing Grubnash. The letter pointed him to the Pale Hand cult and the Sunken Crypt.',
    },
    done: 3,
  },
  crypt: {
    name: 'The Amulet of Dawn', xp: 1500,
    stages: {
      1: 'The Pale Hand cult stole the Amulet of Dawn from the temple of Bramblewick and took it into the Sunken Crypt, south of the Whispering Woods. Their leader is a necromancer named Malachar. I must recover the amulet.',
      2: 'I have recovered the Amulet of Dawn from Malachar. Father Aldric at the temple will want it back.',
      3: 'I returned the Amulet of Dawn to the temple. Bramblewick is safe from the Pale Hand.',
    },
    done: 3,
  },
  locket: {
    name: 'The Silver Locket', xp: 200,
    stages: {
      1: 'Mara\'s son Tam went hunting in the Whispering Woods and never returned. She asked me to look for the silver locket he carried, somewhere near the wolves\' den to the west.',
      2: 'I found Tam\'s silver locket in the wolf den. I should bring it to Mara.',
      3: 'I returned Tam\'s locket to Mara. She can grieve properly now.',
    },
    done: 3,
  },
  elric: {
    name: 'The Scholar in the Crypt', xp: 300,
    stages: {
      1: 'I found a scholar named Elric held prisoner by the cultists in the Sunken Crypt. He told me the sanctum door can only be opened with the key Priestess Vashti carries.',
      2: 'Elric escaped the crypt. He said he would wait for me at the Rusty Tankard.',
    },
    done: 2,
  },
};
