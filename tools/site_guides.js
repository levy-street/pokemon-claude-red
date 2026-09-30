// Hand-written guides for claudered.dev, checked against the game (src/scripts, src/game/glitches.js, src/data).
// Numbers that come from data (levels, rates, teams) are filled in from the data, not typed.
'use strict';

module.exports = function guides(x) {
  const { D, monName, monLink, moveLink, locLink, itemName, sprite, table, wildOf, superRod, SPECIAL, GYMS, leaderName, teamOf, list, pct, range, esc, TYPES, typeName, eff, DEX, evoFrom, evoText } = x;
  const out = [];
  const g = o => out.push(o);
  const topLv = cls => Math.max(...teamOf(cls, cls === 'GIOVANNI' ? 3 : 1).map(m => m.lv));
  const ol = steps => `<ol class="steps">${steps.map(s => `<li>${s}</li>`).join('')}</ol>`;
  const strip = s => s.replace(/<[^>]+>/g, '');

  g({ slug: 'play-pokemon-red-online', priority: 1.0, short: 'Play online', h1: 'How to play Pokémon Red online, free in your browser',
    title: 'Play Pokémon Red Online Free in Your Browser (No Download or Emulator)',
    description: 'Play Pokémon Red online for free in any browser, on PC or phone: no download, no emulator, no ROM. Controls, saving, and online battles and trades.',
    lead: 'You can play Pokémon Red online at <a href="/">claudered.dev</a>: open the page and press START. It is Pokémon Claude Red, a free fan remake of the whole game that runs in any modern browser on a computer, tablet or phone. You don\'t need a download, an emulator or a ROM.',
    howto: ['Open claudered.dev in any browser.', 'Choose NEW GAME, pick your name, your look and your rival\'s name.', 'Walk downstairs and out of the house: Professor Oak stops you in the grass and takes you to choose your first POKéMON.', 'Save from the START menu. Your game is kept in the browser; create a free account to keep a copy in the cloud.'],
    body: `<h2>Start playing</h2>${ol(['Open <a href="/?ref=guide-play">claudered.dev</a> in Chrome, Safari, Firefox or Edge.', 'Choose <strong>NEW GAME</strong>, name yourself and your rival, and pick your look (hair, hat, clothes, bag).', 'Head out of the house: Professor Oak stops you in the tall grass and brings you to his lab to choose BULBASAUR, CHARMANDER or SQUIRTLE.', 'Save any time from the START menu.'])}
<h2>Controls</h2>${table(['Action', 'Keyboard', 'Phone or tablet', 'Gamepad'], [['Move', 'Arrow keys or WASD', 'D-pad, or tap where to walk', 'D-pad or stick'], ['A (talk, confirm)', 'Z, J or Space', 'A button, or tap a person', 'A'], ['B (cancel, hold to run)', 'X, K, Backspace or Esc', 'B button', 'B'], ['START (menu)', 'Enter', 'START', 'Start'], ['SELECT', 'Shift or C', 'SELECT', 'Select']])}
<p>On a phone the page turns into a Game Boy when held upright and a Game Boy Advance when turned sideways.</p>
<h2>Saving your game</h2><p>Your save lives in the browser. In-app browsers (Instagram, TikTok, Reddit) can clear storage, so the game offers a free account that keeps a copy on the server and lets you continue on another device. You can also move a save between devices with <strong>SAVE TRANSFER</strong> on the title screen.</p>
<h2>Play with other people</h2><p>Every POKéMON CENTER's Cable Club leads to the <a href="/guides/link-battles-online/">Social Zone</a>, a shared lounge where everyone online walks around together: chat, challenge anyone to a link battle, trade POKéMON (trade evolutions work) or join the random-match queue.</p>
<h2>Is it the real Pokémon Red?</h2><p>It follows the original game's story, maps, trainers, wild POKéMON, moves and even its glitches, converted from the pret/pokered disassembly. Every sprite, tile and sound was redrawn in code, so it's a remake rather than an emulator running a ROM. It's a free, non-commercial fan project.</p>`,
    faq: [['Can you play Pokémon Red online for free?', 'Yes. Pokémon Claude Red at claudered.dev is a free fan remake that runs in the browser with no download or ROM.'], ['Does it work on iPhone and Android?', 'Yes. It has on-screen Game Boy controls in portrait and Game Boy Advance controls in landscape.'], ['Do I need an emulator or a ROM?', 'No. The game is rebuilt in JavaScript, so there is nothing to download.'], ['Can I play with friends?', 'Yes: link battles and trades with anyone online happen in the Social Zone, reached from any POKéMON CENTER.']] });

  g({ slug: 'missingno', priority: 0.9, short: 'MissingNo.', h1: 'How to find MissingNo. in Pokémon Red',
    title: 'How to Get MissingNo. in Pokémon Red (Old Man Glitch, Step by Step)',
    description: 'How to find MissingNo. in Pokémon Red with the old man glitch: watch the catching demo, fly to Cinnabar Island and surf the east coast. What it does and why it works.',
    lead: 'To find MissingNo. in Pokémon Red: watch the old man\'s catching demonstration in Viridian City, fly straight to Cinnabar Island without walking through any grass or caves, then surf up and down the east coast of the island. The glitch works in <a href="/">Pokémon Claude Red</a> exactly as it did on the Game Boy.',
    howto: ['Talk to the old man in Viridian City and say you\'re not in a hurry so he shows you how to catch a POKéMON.', 'Fly to Cinnabar Island without walking through tall grass or a cave on the way.', 'Surf along the column of shore tiles on the east edge of Cinnabar Island until a battle starts.', 'Fight or catch MissingNo., \'M or a very high-level POKéMON; the sixth item in your bag gains 128.'],
    body: `<h2>Steps</h2>${ol(['In <strong>Viridian City</strong>, talk to the old man (after he has had his coffee) and answer that you\'re not in a hurry. He shows you how to catch a WEEDLE.', 'Get to <strong>Cinnabar Island</strong> using FLY, without walking through any tall grass or cave on the way (Surfing on sea routes is fine if you don\'t touch grass).', 'Surf onto the water on the <strong>east edge of Cinnabar Island</strong> and move up and down along the coast tiles.', 'A wild battle starts: MISSINGNO., \'M, or even a high-level POKéMON, depending on the letters in your name.'])}
<h2>Why it works</h2><p>When the old man shows you how to catch, the game backs up your name into the memory that normally holds the local wild POKéMON list. Only areas with tall grass overwrite that list. The shore tiles on Cinnabar\'s east coast take their encounter <em>rate</em> from the water but their POKéMON <em>list</em> from that leftover memory, so the letters of your name are read as levels and species numbers.</p>
<h2>What happens when you meet it</h2><ul><li>The sixth item in your bag gains 128 (see the <a href="/guides/item-duplication/">item duplication glitch</a>).</li><li>Catching MissingNo. can scramble the Hall of Fame records.</li></ul>`,
    faq: [['Is MissingNo. safe to catch?', 'In the original it could scramble the Hall of Fame; in Pokémon Claude Red the recreation affects the Hall of Fame view too, but your save keeps working.'], ['Why does my name matter for MissingNo.?', 'The glitch reads the letters of your name as wild POKéMON levels and species numbers, so different names give different encounters.'], ['What level is MissingNo.?', 'Its level comes from your name\'s letters; it is often very high, which is why the encounter is famous for Lv 100+ POKéMON.']] });

  g({ slug: 'item-duplication', priority: 0.8, short: 'Item duplication', h1: 'The item duplication glitch in Pokémon Red (MissingNo. +128)',
    title: 'Pokémon Red Item Duplication Glitch: Get 128 Rare Candies with MissingNo.',
    description: 'How the MissingNo. item glitch works in Pokémon Red: put Rare Candy or Master Ball in the sixth bag slot, meet MissingNo. and gain 128 more.',
    lead: 'Meeting MissingNo. or \'M in Pokémon Red adds 128 to the quantity of the <strong>sixth item in your bag</strong>. Put the item you want (Rare Candy, Master Ball, Nugget) in slot six first, then trigger a <a href="/guides/missingno/">MissingNo. encounter</a>.',
    howto: ['Arrange your bag so the item you want copied is the sixth item.', 'Set up the MissingNo. glitch: the old man\'s demo in Viridian City, then fly to Cinnabar Island.', 'Surf the east coast of Cinnabar until MissingNo. or \'M appears.', 'After the battle, check the sixth item: it has 128 more.'],
    body: `<h2>Why it works</h2><p>The POKéDEX keeps a "seen" flag for each species. MissingNo. and 'M have species number 0, whose flag sits just outside the POKéDEX data: on the high bit of the sixth bag item's quantity. Seeing one sets that bit, adding 128. Quantities above 99 show as glitchy characters.</p>
<h2>Tips</h2><ul><li>Rare Candy is the classic choice: 128 of them max out several POKéMON.</li><li>The bonus only applies once per slot while the flag is already set, so swap a new item into slot six before each encounter.</li><li>Don't toss items with glitched quantities.</li></ul>`,
    faq: [['Does the MissingNo. glitch duplicate items?', 'Yes: it adds 128 to the quantity of the sixth item in your bag.'], ['Which item should I duplicate?', 'Rare Candy is the most useful; Master Ball and Nugget are popular too.']] });

  g({ slug: 'mew-glitch', priority: 0.9, short: 'Mew glitch', h1: 'How to catch Mew in Pokémon Red (the trainer-Fly glitch)',
    title: 'How to Catch Mew in Pokémon Red: The Mew Glitch Step by Step',
    description: 'Catch a wild Mew in Pokémon Red with the trainer-Fly glitch: press START as a trainer spots you, fly away, battle the Route 25 Slowpoke youngster and return.',
    lead: 'You can catch a <strong>wild level 7 Mew</strong> in Pokémon Red without an event: let a far-off trainer spot you, press START before they walk over, fly away, fight the Route 25 youngster with a Slowpoke, then fly back and walk onto the route again. The glitch works in <a href="/">Pokémon Claude Red</a>.',
    howto: ['Walk into a trainer\'s line of sight from far away and press START before the "!" walk begins, then fly to another town.', 'START now stays closed until you win a trainer battle. Battle the youngster with the Slowpoke on Route 25; its Special stat is 21, Mew\'s internal number.', 'Fly back to the route where the first trainer spotted you and take a step: the START menu opens by itself.', 'Close the menu. A wild Mew at level 7 appears.'],
    body: `<h2>Steps</h2>${ol(['Walk into the view of a trainer who is <strong>far away</strong> on the same route. As the "!" appears, press <strong>START</strong> before they reach you, then use FLY to leave. (A trainer at the far end of a long, straight line of sight works best.)', 'Your START button now does nothing until you win a trainer battle; the route\'s script is left waiting.', 'Battle the <strong>Youngster with a Slowpoke on Route 25</strong>, east of Cerulean City. Let Slowpoke be the last POKéMON you see: its Special is 21, which is Mew\'s internal ID.', 'Fly back to the first route and step onto it. The START menu opens on its own; close it and a <strong>wild Mew (Lv 7)</strong> appears. Catch it!'])}
<h2>Why it works</h2><p>When a trainer spots you, the game stores the upcoming battle and waits for the trainer to walk over. Opening the menu and flying away leaves that waiting script behind. The next battle overwrites the trainer bytes it will read, and the enemy's Special stat ends up used as the species of a wild encounter. A Slowpoke's Special of 21 is Mew.</p>
<h2>Other POKéMON with the same trick</h2><p>Any POKéMON's Special stat (or trainer class) becomes the encounter, so different last opponents give different POKéMON, including high-level ones.</p>`,
    faq: [['Can you get Mew in Pokémon Red without an event?', 'Yes, with the trainer-Fly glitch: it creates a wild level 7 Mew.'], ['Why Slowpoke?', "The Youngster's Slowpoke on Route 25 has a Special stat of 21, which is Mew's internal species number."], ['What level is the glitch Mew?', 'Level 7.']] });

  // walkthrough from the gym data
  const order = GYMS.map(([cls, city, , spec, badge]) => `<li><strong>${leaderName(cls)}</strong> (<a href="/gym-leaders/${cls.toLowerCase().replace('_', '-')}/">${esc(city)}</a>): ${esc(spec)} type, up to Lv ${topLv(cls)}. Reward: ${esc(badge)}.</li>`).join('');
  g({ slug: 'walkthrough', priority: 0.9, short: 'Walkthrough', h1: 'Pokémon Red walkthrough: the whole game in order',
    title: 'Pokémon Red Walkthrough: Every Badge in Order with Levels & Key Items',
    description: 'A step-by-step Pokémon Red walkthrough: the route from Pallet Town to the Elite Four, gym leaders in order with their levels, and where to get every HM and key item.',
    lead: 'Pokémon Red in one page: from Pallet Town to the Elite Four, with the gym leaders in order, the level to aim for at each one, and where you pick up the HMs and key items that open the map.',
    body: `<h2>Gym order and levels</h2><ol>${order}</ol>
<h2>The route</h2><ol class="steps">
<li><strong>Pallet Town → Viridian City.</strong> Choose your starter, beat your rival in the lab, then fetch Oak's Parcel from the Viridian Mart and bring it back for the POKéDEX.</li>
<li><strong>Viridian Forest → Pewter City.</strong> Catch a Pikachu or Caterpie in the forest, then beat <a href="/gym-leaders/brock/">Brock</a>. Water, Grass and Fighting moves are best.</li>
<li><strong>Route 3 → Mt. Moon → Cerulean City.</strong> In <a href="/locations/mt-moon/">Mt. Moon</a> choose the Helix or Dome Fossil. Beat <a href="/gym-leaders/misty/">Misty</a>, cross Nugget Bridge, and help Bill on Route 25 to get the S.S. Ticket.</li>
<li><strong>Vermilion City.</strong> Board the <a href="/locations/ss-anne/">S.S. Anne</a> for HM01 Cut from the captain, then cut the tree to <a href="/gym-leaders/lt-surge/">Lt. Surge</a>'s gym.</li>
<li><strong>Rock Tunnel → Lavender Town.</strong> Get HM05 Flash from Oak's aide on Route 2 (catch 10 POKéMON first) to light <a href="/locations/rock-tunnel/">Rock Tunnel</a>.</li>
<li><strong>Celadon City.</strong> Beat <a href="/gym-leaders/erika/">Erika</a>, then find the switch behind the poster in the Game Corner to raid the <a href="/locations/rocket-hideout/">Rocket Hideout</a> and win the Silph Scope.</li>
<li><strong>Pokémon Tower.</strong> With the Silph Scope, reach the top of the <a href="/locations/pokemon-tower/">Pokémon Tower</a>, rescue Mr. Fuji and get the Poké Flute to wake the Snorlax blocking Routes 12 and 16.</li>
<li><strong>Fuchsia City.</strong> Beat <a href="/gym-leaders/koga/">Koga</a>. In the <a href="/locations/safari-zone/">Safari Zone</a> find HM03 Surf and the warden's Gold Teeth (return them for HM04 Strength). HM02 Fly is in a house on Route 16.</li>
<li><strong>Saffron City.</strong> Clear <a href="/locations/silph-co/">Silph Co.</a> (Lapras on 7F, Giovanni on 11F, Master Ball from the president), then beat <a href="/gym-leaders/sabrina/">Sabrina</a>.</li>
<li><strong>Cinnabar Island.</strong> Surf south, find the Secret Key in the <a href="/locations/pokemon-mansion/">Pokémon Mansion</a>, and beat <a href="/gym-leaders/blaine/">Blaine</a>. Revive your fossils at the lab.</li>
<li><strong>Viridian City.</strong> The last gym is <a href="/gym-leaders/giovanni/">Giovanni</a>'s.</li>
<li><strong>Route 22 → Route 23 → Victory Road → Indigo Plateau.</strong> Show all eight badges, solve the boulders in <a href="/locations/victory-road/">Victory Road</a>, and face <a href="/elite-four/">the Elite Four</a> and the Champion.</li></ol>
<h2>After the credits</h2><p>Cerulean Cave opens north of Cerulean City: <a href="/pokedex/mewtwo/">Mewtwo</a> waits at the bottom at level 70. The three legendary birds are in the <a href="/locations/seafoam-islands/">Seafoam Islands</a>, the <a href="/locations/power-plant/">Power Plant</a> and <a href="/locations/victory-road/">Victory Road</a>.</p>`,
    faq: [['What order do you beat the gyms in Pokémon Red?', GYMS.map(([cls]) => leaderName(cls)).join(', ') + '.'], ['What level should I be for the Elite Four?', `Around level ${topLv('LORELEI')}–${Math.max(...teamOf('RIVAL3', 1).map(m => m.lv))}: Lorelei's team tops out at level ${topLv('LORELEI')}, Lance's at ${topLv('LANCE')} and the Champion's at ${Math.max(...teamOf('RIVAL3', 1).map(m => m.lv))}.`], ['Where do you get Fly in Pokémon Red?', 'HM02 Fly is in a house on Route 16, reached after you wake the Snorlax with the Poké Flute.']] });

  // starters, from the data
  const starters = ['BULBASAUR', 'CHARMANDER', 'SQUIRTLE'];
  const vs = (st, cls) => { const team = teamOf(cls, cls === 'GIOVANNI' ? 3 : 1), types = [...new Set([st, ...(D.species[st].evos || []).map(e => e.to)].flatMap(s => D.species[s].types))];
    const good = team.filter(m => types.some(t => eff(t, D.species[m.sp].types) > 1)).length, bad = team.filter(m => D.species[m.sp].types.some(t => types.some(my => eff(t, [my]) > 1))).length; return good - bad * 0.5; };
  g({ slug: 'best-starter', priority: 0.8, short: 'Best starter', h1: 'Which starter should you pick in Pokémon Red?',
    title: 'Best Starter in Pokémon Red: Bulbasaur vs Charmander vs Squirtle',
    description: 'Bulbasaur, Charmander or Squirtle? How each Pokémon Red starter matches up against the gym leaders, their stats and evolutions, and which is easiest.',
    lead: '<strong>Bulbasaur is the easiest starter in Pokémon Red</strong>: it beats the first two gyms (Brock and Misty) outright. Squirtle is a close second. Charmander is the hard mode: it struggles against both Brock and Misty early on but becomes the powerful Charizard.',
    body: table(['Gym leader', ...starters.map(monName)], GYMS.map(([cls]) => [leaderName(cls), ...starters.map(st => { const v = vs(st, cls); return v > 0.5 ? 'Advantage' : v < -0.5 ? 'Disadvantage' : 'Even'; })])) +
      starters.map(st => { const s = D.species[st], mid = s.evos[0].to, fin = D.species[mid].evos[0].to, F = D.species[fin]; return `<h2>${sprite(st, 48, true)} ${monLink(st)}</h2><p>${monName(st)} evolves into ${monLink(mid)} at level ${s.evos[0].level} and ${monLink(fin)} at level ${D.species[mid].evos[0].level}. ${monName(fin)} has a base stat total of ${['hp', 'atk', 'def', 'spd', 'spc'].reduce((a, k) => a + F[k], 0)}.</p>`; }).join(''),
    faq: [['What is the easiest starter in Pokémon Red?', 'Bulbasaur: Grass and Poison moves beat Brock and Misty, the first two gym leaders.'], ['Is Charmander hard in Pokémon Red?', 'Early on, yes: Brock (Rock) and Misty (Water) both resist Fire. Catch a Nidoran or Mankey to help.']] });

  const legends = SPECIAL.filter(s => ['ARTICUNO', 'ZAPDOS', 'MOLTRES', 'MEWTWO'].includes(s[0]));
  g({ slug: 'legendary-pokemon', priority: 0.8, short: 'Legendaries', h1: 'Where to find every legendary Pokémon in Pokémon Red',
    title: 'Legendary Pokémon in Pokémon Red: Articuno, Zapdos, Moltres, Mewtwo & Mew',
    description: 'Where to find Articuno, Zapdos, Moltres and Mewtwo in Pokémon Red, their levels and how to catch them, plus how to get Mew with the glitch.',
    lead: `Pokémon Red has five legendary POKéMON: ${list(legends.map(s => `${monName(s[0])} (Lv ${s[3]})`))}, plus <a href="/guides/mew-glitch/">Mew</a>. Each one appears once, so save before the battle.`,
    body: legends.map(([sp, map, , lv, note]) => `<h2>${sprite(sp, 64, true)} ${monLink(sp)}, level ${lv}</h2><p>${locLink(map)}: ${esc(note)}. Catch rate ${D.species[sp].catchRate} of 255${D.species[sp].catchRate <= 3 ? ': bring Ultra Balls and use sleep or paralysis, or save the Master Ball for it' : ''}.</p>`).join('') + `<h2>${sprite('MEW', 64, true)} ${monLink('MEW')}</h2><p>Mew was never meant to be caught in Red, but the <a href="/guides/mew-glitch/">trainer-Fly glitch</a> makes a wild level 7 Mew appear.</p>`,
    faq: [['Where is Mewtwo in Pokémon Red?', 'At the bottom of Cerulean Cave, level 70, after you become Champion.'], ['Should I use the Master Ball on Mewtwo?', 'It\'s the usual choice: Mewtwo\'s catch rate is 3, the lowest possible.']] });

  g({ slug: 'fossils', priority: 0.6, short: 'Fossils', h1: 'Fossils in Pokémon Red: Omanyte, Kabuto and Aerodactyl',
    title: 'Pokémon Red Fossils: Helix or Dome Fossil, Old Amber & How to Revive Them',
    description: 'Where to find the Helix Fossil, Dome Fossil and Old Amber in Pokémon Red and how to revive Omanyte, Kabuto and Aerodactyl at the Cinnabar Lab.',
    lead: 'Pokémon Red has three fossils. In <a href="/locations/mt-moon/">Mt. Moon</a> you choose the <strong>Helix Fossil</strong> (Omanyte) or the <strong>Dome Fossil</strong> (Kabuto); the <strong>Old Amber</strong> (Aerodactyl) is behind the Pewter Museum. The Cinnabar Lab revives each at level 30.',
    body: `<ul class="where"><li>${monLink('OMANYTE')}: Helix Fossil from Mt. Moon B2F.</li><li>${monLink('KABUTO')}: Dome Fossil from Mt. Moon B2F (you only get one of the two).</li><li>${monLink('AERODACTYL')}: Old Amber from a scientist at the back of the Pewter Museum (enter from the side door, reached with Cut).</li></ul><p>Take the fossil to the scientist in the <strong>Cinnabar Lab</strong> fossil room, leave, and come back: your POKéMON is ready at level 30.</p>`,
    faq: [['Should I pick the Helix or Dome Fossil?', 'Both are Rock/Water. Omanyte (Omastar) has better Special; Kabuto (Kabutops) has better Attack and Speed.'], ['Where is the Old Amber in Pokémon Red?', 'At the back of the Pewter Museum, through the side entrance.']] });

  const trades = ['KADABRA', 'MACHOKE', 'GRAVELER', 'HAUNTER'];
  g({ slug: 'trade-evolutions', priority: 0.7, short: 'Trade evolutions', h1: 'Trade evolutions in Pokémon Red (and how to trade online)',
    title: 'Pokémon Red Trade Evolutions: Alakazam, Machamp, Golem & Gengar',
    description: 'Kadabra, Machoke, Graveler and Haunter evolve when traded in Pokémon Red. How to trade them online in Pokémon Claude Red and get them back evolved.',
    lead: `Four POKéMON evolve only when traded in Pokémon Red: ${list(trades.map(sp => `${monName(sp)} → ${monName(D.species[sp].evos[0].to)}`))}. In <a href="/">Pokémon Claude Red</a> you can trade with other players online in the <a href="/guides/link-battles-online/">Social Zone</a>, so these evolutions work without a second Game Boy.`,
    body: `<ul class="grid small">${trades.map(sp => `<li><a href="/pokedex/${sp.toLowerCase()}/">${sprite(D.species[sp].evos[0].to, 64, true)}<span>${monName(sp)} → ${monName(D.species[sp].evos[0].to)}</span></a></li>`).join('')}</ul>
<h2>How to trade online</h2>${ol(['Talk to the Cable Club receptionist upstairs in any POKéMON CENTER and enter the Social Zone.', 'Find another player (or press SELECT for the list) and choose TRADE.', 'Both players pick a POKéMON; the one who offered confirms. The trade happens instantly and trade evolutions trigger.', 'Trade it back so you both keep your evolved POKéMON.'])}`,
    faq: [['How do you get Alakazam in Pokémon Red?', 'Trade a Kadabra: it evolves into Alakazam when traded.'], ['Can you evolve trade Pokémon without trading?', 'Not in the original. In Pokémon Claude Red you can trade online with another player in the Social Zone.']] });

  const stoneEvos = {}; for (const sp of DEX) for (const e of D.species[sp].evos || []) if (e.type === 'item') (stoneEvos[e.item] = stoneEvos[e.item] || []).push([sp, e.to]);
  g({ slug: 'evolution-stones', priority: 0.7, short: 'Evolution stones', h1: 'Evolution stones in Pokémon Red: which Pokémon and where to get them',
    title: 'Pokémon Red Evolution Stones: Fire, Water, Thunder, Leaf & Moon Stone',
    description: 'Every evolution stone in Pokémon Red, which Pokémon each one evolves, and where to buy or find them (Celadon Dept. Store, Mt. Moon).',
    lead: `Fire, Water, Thunder and Leaf Stones are sold on the 4th floor of the <strong>Celadon Dept. Store</strong> for ₽${(D.items.FIRE_STONE.price || 0).toLocaleString('en-US')} each. Moon Stones can't be bought: they are found in <a href="/locations/mt-moon/">Mt. Moon</a> and a few other places.`,
    body: Object.entries(stoneEvos).map(([st, l]) => `<h2>${esc(itemName(st))}</h2><ul>${l.map(([a, b]) => `<li>${monLink(a)} → ${monLink(b)}</li>`).join('')}</ul>`).join(''),
    faq: [['Where do you buy evolution stones in Pokémon Red?', 'Celadon Dept. Store, 4th floor: Fire, Water, Thunder and Leaf Stones.'], ['Can you buy a Moon Stone in Pokémon Red?', 'No. Moon Stones are found as items, several of them in Mt. Moon.']] });

  g({ slug: 'hm-locations', priority: 0.8, short: 'HMs', h1: 'Where to get every HM in Pokémon Red',
    title: 'Pokémon Red HM Locations: Cut, Fly, Surf, Strength & Flash',
    description: 'Where to get HM01 Cut, HM02 Fly, HM03 Surf, HM04 Strength and HM05 Flash in Pokémon Red, and which badge lets you use each one outside battle.',
    lead: 'HM01 Cut comes from the S.S. Anne captain, HM05 Flash from Oak\'s aide on Route 2, HM02 Fly from a house on Route 16, HM03 Surf from the Safari Zone\'s secret house and HM04 Strength from the Safari Zone warden in Fuchsia City.',
    body: table(['HM', 'Where', 'Badge needed to use it'], [['HM01 Cut', 'The captain of the <a href="/locations/ss-anne/">S.S. Anne</a> in Vermilion City (rub his back)', 'Cascade Badge'], ['HM02 Fly', 'A girl in a hidden house on <a href="/locations/route-16/">Route 16</a> (cut the tree)', 'Thunder Badge'],
      ['HM03 Surf', 'The secret house at the far end of the <a href="/locations/safari-zone/">Safari Zone</a>', 'Soul Badge'], ['HM04 Strength', "The Safari Zone warden in Fuchsia City, for his Gold Teeth", 'Rainbow Badge'], ['HM05 Flash', "Professor Oak's aide in the <a href=\"/locations/route-2/\">Route 2</a> gate, once you've caught 10 POKéMON", 'Boulder Badge']]),
    faq: [['Where is HM01 Cut in Pokémon Red?', 'From the captain of the S.S. Anne, docked in Vermilion City.'], ['Where do you get Surf in Pokémon Red?', 'In the secret house at the end of the Safari Zone in Fuchsia City.'], ['Where is Flash in Pokémon Red?', "From Oak's aide in the gate on Route 2, after catching 10 POKéMON."]] });

  const safari = ['SafariZoneCenter', 'SafariZoneEast', 'SafariZoneNorth', 'SafariZoneWest'].filter(n => wildOf[n]);
  g({ slug: 'safari-zone', priority: 0.7, short: 'Safari Zone', h1: 'Safari Zone guide for Pokémon Red',
    title: 'Pokémon Red Safari Zone Guide: Pokémon, Rates, Rules & Surf',
    description: 'Every Pokémon in the Pokémon Red Safari Zone by area with encounter rates, how the Safari Balls and steps work, and where to find HM03 Surf and the Gold Teeth.',
    lead: `The Safari Zone in Fuchsia City costs ₽500. You get 30 Safari Balls and 500 steps; you can't battle, only throw bait, rocks or balls. It is the only place in Red to catch ${list(DEX.filter(sp => { const f = x.found[sp] || []; return f.length && f.every(e => e.map && /^SafariZone/.test(e.map)); }).map(monName))}, and it hides HM03 Surf and the Gold Teeth.`,
    body: safari.map(n => `<h2>${locLink(n)}</h2>` + table(['POKéMON', 'Levels', 'Chance'], wildOf[n].grass.map(e => [`${sprite(e.sp, 32, true)} ${monLink(e.sp)}`, range(e.lo, e.hi), pct(e.p)]), 'wild')).join('') +
      '<h2>Tips</h2><ul><li>Bait makes POKéMON less likely to run but harder to catch; rocks make them easier to catch but more likely to flee.</li><li>HM03 Surf is in the secret house in the west area; the Gold Teeth for HM04 Strength are on the ground in the west area too.</li></ul>',
    faq: [['How much does the Safari Zone cost in Pokémon Red?', '₽500 for 30 Safari Balls and 500 steps.'], ['Where is Chansey in Pokémon Red?', 'Only in the Safari Zone, and it is rare.']] });

  g({ slug: 'game-corner', priority: 0.6, short: 'Game Corner', h1: 'Celadon Game Corner: prizes, coins and the Rocket Hideout',
    title: 'Pokémon Red Game Corner Prizes: Dratini, Scyther, Porygon & TMs',
    description: 'Every Celadon Game Corner prize in Pokémon Red with coin prices and levels (Abra, Clefairy, Nidorina, Dratini, Scyther, Porygon, TMs), how to get coins, and the hideout switch.',
    lead: 'The Game Corner in Celadon City sells POKéMON and TMs for coins. You need the <strong>Coin Case</strong> from the man in the Celadon diner. The poster at the back hides the switch to the <a href="/locations/rocket-hideout/">Rocket Hideout</a>.',
    body: table(['Prize', 'Coins', 'Level'], SPECIAL.filter(s => s[2] === 'prize').map(([sp, , , lv, note]) => [`${sprite(sp, 32, true)} ${monLink(sp)}`, note.match(/[\d,]+ coins/)[0], lv]).concat([['TM23 Dragon Rage', '3,300 coins', '—'], ['TM15 Hyper Beam', '5,500 coins', '—'], ['TM50 Substitute', '7,700 coins', '—']]), 'wild') +
      '<h2>Getting coins</h2><ul><li>Buy 50 coins for ₽1,000 from the clerk at the counter.</li><li>Talk to people in the Game Corner: several give you free coins, and some are hidden on the floor.</li><li>Play the slot machines. Lining up 7s pays out best.</li></ul>',
    faq: [['How do you get Porygon in Pokémon Red?', 'Buy it for 9,999 coins at the Celadon Game Corner prize corner.'], ['Where is the Coin Case in Pokémon Red?', 'From the man in the Celadon City diner.']] });

  const rodMaps = Object.keys(superRod);
  g({ slug: 'fishing', priority: 0.6, short: 'Fishing', h1: 'Fishing in Pokémon Red: Old Rod, Good Rod and Super Rod',
    title: 'Pokémon Red Fishing Guide: Where to Get Every Rod & What You Catch',
    description: 'Where to get the Old Rod, Good Rod and Super Rod in Pokémon Red, and every Pokémon you can fish up with the Super Rod, location by location.',
    lead: 'The <strong>Old Rod</strong> (Vermilion City fishing guru) only catches Magikarp. The <strong>Good Rod</strong> (his brother in Fuchsia City) catches Goldeen and Poliwag. The <strong>Super Rod</strong> (their brother on Route 12) finds different POKéMON in each place.',
    body: '<h2>Super Rod by location</h2>' + table(['Location', 'POKéMON'], rodMaps.map(n => [locLink(n), list(superRod[n].map(([lv, sp]) => `${monLink(sp)} Lv ${lv}`))])),
    faq: [['Where is the Super Rod in Pokémon Red?', 'In the fishing guru\'s house on Route 12.'], ['What does the Old Rod catch?', 'Only Magikarp, at level 5.']] });

  g({ slug: 'link-battles-online', priority: 0.8, short: 'Online battles', h1: 'Link battles and trades online in Pokémon Claude Red',
    title: 'Pokémon Red Online Battles & Trades: The Social Zone in Pokémon Claude Red',
    description: 'Battle and trade Pokémon Red online with other players in the Social Zone: a shared lounge with chat, instant link battles, a random-match queue and the Battle Tower.',
    lead: 'Every POKéMON CENTER\'s Cable Club in <a href="/">Pokémon Claude Red</a> leads to the <strong>Social Zone</strong>: one lounge shared by everyone online. You see other players walking around with name tags, can chat, challenge anyone to a link battle, trade POKéMON, or join the random-match queue.',
    body: `<h2>How to battle someone</h2>${ol(['Go upstairs in any POKéMON CENTER and talk to the Cable Club receptionist.', 'Walk up to another player and press A, or press SELECT for the player list, and choose BATTLE.', 'Pick three POKéMON. When they accept, the battle starts at once: everyone battles at level 50, with no items and no EXP.'])}
<h2>Random match</h2><p>Talk to the LINK BATTLE desk and choose FIND A MATCH. You can keep walking around; your battle starts as soon as another trainer joins the queue.</p>
<h2>Trading</h2><p>Choose TRADE, pick a POKéMON, and the other player picks theirs. The player who offered confirms, and the trade happens instantly, trade evolutions included.</p>
<h2>Battle Tower</h2><p>The Social Zone also has a Battle Tower for level-50 win streaks against computer trainers, with Battle Points to spend on prizes.</p>`,
    faq: [['Can you play Pokémon Red online with friends?', 'Yes: in Pokémon Claude Red, battles and trades with anyone online happen in the Social Zone.'], ['Is there chat?', 'Yes, press T on a keyboard or the chat button on a phone.']] });

  g({ slug: 'how-it-was-made', priority: 0.7, short: 'How it was made', h1: 'How an AI rebuilt Pokémon Red from raw pixels',
    title: 'How Claude Rebuilt Pokémon Red in Code (No Image Files)',
    description: 'How Pokémon Claude Red was made: Claude, an AI model by Anthropic, rebuilt Pokémon Red in JavaScript with every sprite, tile and sound drawn by code and no image files.',
    lead: 'Pokémon Claude Red was built by <strong>Claude</strong>, an AI model made by Anthropic, working in Claude Code and directed by <a href="https://levystreet.com">Levy Street</a>. The game contains no image files: every tile, sprite, building and battle effect is drawn pixel by pixel by code.',
    body: `<h2>Drawing with code</h2><ul><li>Each map cell has a label like "tall grass" or "roof", and a painter function draws it with shading and texture.</li><li>Each of the 151 POKéMON is a list of shapes (ellipses, polygons, stripes, eyes) that the game rasterises, shades and outlines at runtime; back sprites and icons come from the same description.</li><li>Characters are small typed templates recoloured for each trainer, which is also how the character creator works.</li></ul>
<h2>Standing on 1996</h2><p>Map layouts, trainers, wild POKéMON, moves and the music's note data are converted from the pret/pokered disassembly, so the game plays like the original, glitches included. The story text was rewritten in new words.</p>
<h2>Open source</h2><p>The code is on <a href="https://github.com/levy-street/pokemon-claude-red">GitHub</a>.</p>`,
    faq: [['Was Pokémon Claude Red made by AI?', 'Yes. Claude (by Anthropic) wrote the code and drew all the art in code, directed by Levy Street.'], ['Does it use any images from the original game?', 'No. There are no image files at all; everything is drawn by code.']] });

  const strongest = DEX.slice().sort((a, b) => ['hp', 'atk', 'def', 'spd', 'spc'].reduce((s, k) => s + D.species[b][k] - D.species[a][k], 0)).slice(0, 25);
  g({ slug: 'strongest-pokemon', priority: 0.7, short: 'Strongest', h1: 'The strongest Pokémon in Pokémon Red (by base stats)',
    title: 'Strongest Pokémon in Pokémon Red: Top 25 by Base Stat Total',
    description: 'The 25 strongest Pokémon in Pokémon Red ranked by base stat total, with their types and where to get them, from Mewtwo and Mew to Dragonite and Snorlax.',
    lead: `By base stat total, the strongest POKéMON in Pokémon Red are ${list(strongest.slice(0, 5).map(monName))}. Here are the top 25 and how to get them.`,
    body: table(['#', 'POKéMON', 'Type', 'Total', 'How to get it'], strongest.map((sp, i) => { const s = D.species[sp], f = (x.found[sp] || [])[0]; return [i + 1, `${sprite(sp, 32, true)} ${monLink(sp)}`, s.types.filter((t, k, a) => a.indexOf(t) === k).map(typeName).join('/'), ['hp', 'atk', 'def', 'spd', 'spc'].reduce((a, k) => a + s[k], 0),
      f ? (f.map ? locLink(f.map) : esc(f.how)) : evoFrom[sp] ? `evolve ${monLink(evoFrom[sp].from)}` : sp === 'MEW' ? '<a href="/guides/mew-glitch/">Mew glitch</a>' : 'trade']; }), 'wild'),
    faq: [['What is the strongest Pokémon in Pokémon Red?', 'Mewtwo, with a base stat total of 590.'], ['What is the best non-legendary Pokémon in Pokémon Red?', 'Dragonite has the highest base stats, but Alakazam, Starmie, Tauros and Snorlax are famous for how well they battle in Generation I.']] });

  return out;
};

module.exports.faq = [
  ['What is Pokémon Claude Red?', 'A free, non-commercial fan remake of Pokémon Red that runs in any web browser. Claude, an AI model by Anthropic, rebuilt the game from raw pixels in JavaScript, directed by Levy Street.'],
  ['Is Pokémon Claude Red free?', 'Yes, completely free, with no ads or purchases.'],
  ['Do I need an emulator or a ROM?', 'No. It is not an emulator: the whole game is rebuilt in code, so you just open claudered.dev.'],
  ['Does it work on phones?', 'Yes. On a phone it shows Game Boy controls when held upright and Game Boy Advance controls when turned sideways. You can also tap to walk.'],
  ['How do I save?', 'From the START menu. The save lives in your browser; a free account keeps a copy on the server and lets you continue on another device.'],
  ['Is it the full game?', 'Yes: all 151 POKéMON, the full Kanto story from Pallet Town to the Elite Four, every trainer and gym, and post-game Cerulean Cave.'],
  ['Can I play with friends online?', 'Yes. The Social Zone, reached from any POKéMON CENTER\'s Cable Club, is a shared lounge with chat, live link battles, trades and a random-match queue.'],
  ['Do the classic glitches work?', 'Yes. MissingNo., the item duplication glitch and the Mew trick are recreated from how the original code works.'],
  ['Who made it?', 'Claude (Anthropic\'s AI model), working in Claude Code, directed by Levy Street. The source code is on GitHub.'],
  ['Is it affiliated with Nintendo?', 'No. It is an unofficial fan project. Pokémon © Nintendo / Creatures Inc. / GAME FREAK inc.'],
];
