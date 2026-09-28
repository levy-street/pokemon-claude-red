// The classic Red/Blue glitches, rebuilt from how the original code works (read off the pokered disassembly):
// MissingNo. and the old man glitch, the +128 item glitch, the HALL OF FAME corruption, and the Trainer-Fly glitch
// behind the "Mew trick".
//
// MissingNo.: the old man's catching demo backs the player's name up into the RAM that holds the area's grass
// encounters (wLinkEnemyTrainerName shares its address with wGrassRate + wGrassMons). Loading a map only replaces that
// list when the map HAS grass encounters, so after flying to Cinnabar the name is still there. The "left shore"
// half-blocks at the west edge of Route 20 (the east coast of Cinnabar, and east of the last Seafoam cave) take their
// encounter RATE from their bottom-right 8x8 tile, which is water, but their SPECIES LIST from the bottom-left one,
// which isn't, so they read the grass list: the name's bytes as level/species pairs in internal index order.
// Letters give real Pokémon or MISSINGNO., the terminator ($50) is MISSINGNO., $00 is 'M. Pokédex #000's "seen" flag
// sits outside the Pokédex, on bit 7 of the 6th bag item's quantity (+128), and MissingNo.'s block sprite
// decompresses over the HALL OF FAME records.
//
// Mew: press START mid-step as a trainer spots you, then leave with FLY / TELEPORT / DIG / an ESCAPE ROPE. The
// route's script is left waiting to start that battle, and "seen by a trainer" stays set (no START menu, no talking)
// until a trainer battle ends. The trainer class/party bytes that battle will read share RAM with the last enemy's
// stats, so after any battle they hold the low byte of its Special (the species) and its Attack stage (the level,
// 7 when unchanged). Beat the Route 25 Youngster's Lv17 SLOWPOKE (Special 21 = MEW's index) and go back: the last
// text box (the START menu you flew away with) opens by itself, and closing it starts the battle.
(function (G) {
  'use strict';
  // Gen 1 internal species order (pokered constants/pokemon_constants.asm); 0 = a MissingNo. slot
  const ORDER = ['NO_MON','RHYDON','KANGASKHAN','NIDORAN_M','CLEFAIRY','SPEAROW','VOLTORB','NIDOKING','SLOWBRO','IVYSAUR','EXEGGUTOR','LICKITUNG','EXEGGCUTE','GRIMER','GENGAR','NIDORAN_F','NIDOQUEEN','CUBONE','RHYHORN','LAPRAS','ARCANINE','MEW','GYARADOS','SHELLDER','TENTACOOL','GASTLY','SCYTHER','STARYU','BLASTOISE','PINSIR','TANGELA',0,0,'GROWLITHE','ONIX','FEAROW','PIDGEY','SLOWPOKE','KADABRA','GRAVELER','CHANSEY','MACHOKE','MR_MIME','HITMONLEE','HITMONCHAN','ARBOK','PARASECT','PSYDUCK','DROWZEE','GOLEM',0,'MAGMAR',0,'ELECTABUZZ','MAGNETON','KOFFING',0,'MANKEY','SEEL','DIGLETT','TAUROS',0,0,0,'FARFETCHD','VENONAT','DRAGONITE',0,0,0,'DODUO','POLIWAG','JYNX','MOLTRES','ARTICUNO','ZAPDOS','DITTO','MEOWTH','KRABBY',0,0,0,'VULPIX','NINETALES','PIKACHU','RAICHU',0,0,'DRATINI','DRAGONAIR','KABUTO','KABUTOPS','HORSEA','SEADRA',0,0,'SANDSHREW','SANDSLASH','OMANYTE','OMASTAR','JIGGLYPUFF','WIGGLYTUFF','EEVEE','FLAREON','JOLTEON','VAPOREON','MACHOP','ZUBAT','EKANS','PARAS','POLIWHIRL','POLIWRATH','WEEDLE','KAKUNA','BEEDRILL',0,'DODRIO','PRIMEAPE','DUGTRIO','VENOMOTH','DEWGONG',0,0,'CATERPIE','METAPOD','BUTTERFREE','MACHAMP',0,'GOLDUCK','HYPNO','GOLBAT','MEWTWO','SNORLAX','MAGIKARP',0,0,'MUK',0,'KINGLER','CLOYSTER',0,'ELECTRODE','CLEFABLE','WEEZING','PERSIAN','MAROWAK',0,'HAUNTER','ABRA','ALAKAZAM','PIDGEOTTO','PIDGEOT','STARMIE','BULBASAUR','VENUSAUR','TENTACRUEL',0,'GOLDEEN','SEAKING',0,0,0,0,'PONYTA','RAPIDASH','RATTATA','RATICATE','NIDORINO','NIDORINA','GEODUDE','PORYGON','AERODACTYL',0,'MAGNEMITE',0,0,'CHARMANDER','SQUIRTLE','CHARMELEON','WARTORTLE','CHARIZARD',0,'FOSSIL_KABUTOPS','FOSSIL_AERODACTYL','MON_GHOST','ODDISH','GLOOM','VILEPLUME','BELLSPROUT','WEEPINBELL','VICTREEBEL'];
  // Gen 1 text encoding for the characters a name can hold (pokered constants/charmap.asm)
  const CHARMAP = {"@":80," ":127,"A":128,"B":129,"C":130,"D":131,"E":132,"F":133,"G":134,"H":135,"I":136,"J":137,"K":138,"L":139,"M":140,"N":141,"O":142,"P":143,"Q":144,"R":145,"S":146,"T":147,"U":148,"V":149,"W":150,"X":151,"Y":152,"Z":153,"a":160,"b":161,"c":162,"d":163,"e":164,"f":165,"g":166,"h":167,"i":168,"j":169,"k":170,"l":171,"m":172,"n":173,"o":174,"p":175,"q":176,"r":177,"s":178,"t":179,"u":180,"v":181,"w":182,"x":183,"y":184,"z":185,"0":246,"1":247,"2":248,"3":249,"4":250,"5":251,"6":252,"7":253,"8":254,"9":255};
  // trainer classes in id order (pokered constants/trainer_constants.asm); a battle with id >= 200 is a trainer
  const TRAINERS = ["NOBODY", "YOUNGSTER", "BUG_CATCHER", "LASS", "SAILOR", "JR_TRAINER_M", "JR_TRAINER_F", "POKEMANIAC", "SUPER_NERD", "HIKER", "BIKER", "BURGLAR", "ENGINEER", "UNUSED_JUGGLER", "FISHER", "SWIMMER", "CUE_BALL", "GAMBLER", "BEAUTY", "PSYCHIC_TR", "ROCKER", "JUGGLER", "TAMER", "BIRD_KEEPER", "BLACKBELT", "RIVAL1", "PROF_OAK", "CHIEF", "SCIENTIST", "GIOVANNI", "ROCKET", "COOLTRAINER_M", "COOLTRAINER_F", "BRUNO", "BROCK", "MISTY", "LT_SURGE", "ERIKA", "KOGA", "BLAINE", "SABRINA", "GENTLEMAN", "RIVAL2", "RIVAL3", "LORELEI", "CHANNELER", "AGATHA", "LANCE"];
  const { Surface, hex, hash2 } = G.gfx;
  const WATER = 0x14; // "in all tilesets with a water tile, this is its id"
  const rnd = n => Math.floor(Math.random() * n);
  const hex2 = b => ('0' + (b & 255).toString(16).toUpperCase()).slice(-2);
  const GS = () => (G.state ? (G.state.glitch = G.state.glitch || {}) : {});
  const INDEX = {}; ORDER.forEach((n, i) => { if (n) INDEX[n] = i; });

  // ---------------- the player's name, as the 11 bytes the old man's demo copies (NAME_LENGTH) ----------------
  const DEFAULT_NAMES = 'NEW NAME@RED@ASH@JACK@NEW NAME@BLUE@GARY@JOHN@'; // the ROM's name lists, back to back
  const code = c => CHARMAP[c] !== undefined ? CHARMAP[c] : 0x7f;
  const encode = s => [...s].map(code);
  function nameBytes() {
    const S = G.state;
    if (Array.isArray(S.nameBuf) && S.nameBuf.length === 11 && S.nameBufFor === S.name) return S.nameBuf;
    // picked from the list: GetDefaultName copies straight out of the ROM, so the next names come along ("RED@ASH@JAC")
    if (['RED', 'ASH', 'JACK'].includes(S.name)) { const i = DEFAULT_NAMES.indexOf('@' + S.name + '@') + 1; return encode(DEFAULT_NAMES.slice(i, i + 11)); }
    // typed: the naming screen leaves the letters, a terminator, then the buffer's zeroes
    const b = encode(S.name || 'RED'); b.push(0x50);
    while (b.length < 11) b.push(0);
    return b.slice(0, 11);
  }
  // the naming screen writes each letter with a terminator after it, and a delete leaves the old terminator behind
  G.nameBuffer = () => { const b = new Array(11).fill(0); b[0] = 0x50; return {
    add(len, ch) { if (len < 10) { b[len] = code(ch); b[len + 1] = 0x50; } },
    del(len) { if (len >= 0 && len < 11) b[len] = 0x50; },
    bytes: () => b.slice(),
  }; };

  // ---------------- internal index -> species, including the ones that aren't Pokémon ----------------
  const BLOCK = 'MISSINGNO', FOSSIL_K = 'MISSINGNO_KABUTOPS', FOSSIL_A = 'MISSINGNO_AERODACTYL', GHOST = 'MISSINGNO_GHOST', M00 = 'GLITCH_00';
  function speciesFor(b) {
    b &= 255;
    if (b === 0) return M00;
    if (b < ORDER.length) {
      const n = ORDER[b];
      if (n === 'FOSSIL_KABUTOPS') return FOSSIL_K;
      if (n === 'FOSSIL_AERODACTYL') return FOSSIL_A;
      if (n === 'MON_GHOST') return GHOST;
      return n && G.DATA.species[n] ? n : BLOCK;
    }
    return 'GLITCH_' + hex2(b);
  }
  // names past the table are whatever bytes follow it; spell them with the font's odd glyphs
  function glitchName(b) {
    const P = ['A', '4', 'M', 'PK', 'MN', '?', "'", '-', 'é', 'x', '.', ' ', 'h', 'Q'];
    let s = ''; for (let i = 0, n = 2 + Math.floor(hash2(b, 1, 77) * 4); i < n; i++) s += P[Math.floor(hash2(b, i + 2, 78) * P.length)];
    return s.trim() || '?';
  }
  // Pokédex #000: its data is read from just before BULBASAUR's. BIRD/NORMAL, 33/136/0/29/6, WATER GUN x2 + SKY ATTACK
  function defGlitch(key, name, look, seed) {
    G.DATA.species[key] = { id: key, name, hp: 33, atk: 136, def: 0, spd: 29, spc: 6, types: ['BIRD', 'NORMAL'], catchRate: 29, baseExp: 0,
      moves1: ['WATER_GUN', 'SKY_ATTACK'], fixedMoves: ['WATER_GUN', 'WATER_GUN', 'SKY_ATTACK'], growth: 'MEDIUM_FAST', tmhm: [], evos: [], learn: [],
      dex: 0, cat: '???', ht: 0, wt: 0, glitch: { look, seed } };
  }
  defGlitch(BLOCK, 'MISSINGNO.', 'block', 0x1F);
  defGlitch(FOSSIL_K, 'MISSINGNO.', 'fossil:KABUTOPS', 0xB6);
  defGlitch(FOSSIL_A, 'MISSINGNO.', 'fossil:AERODACTYL', 0xB7);
  defGlitch(GHOST, 'MISSINGNO.', 'ghost', 0xB8);
  defGlitch(M00, "'M", 'block', 0);
  for (let b = ORDER.length; b < 256; b++) defGlitch('GLITCH_' + hex2(b), glitchName(b), 'block', b);
  const isGlitch = sp => { const d = G.DATA.species[sp]; return !!(d && d.glitch); };

  // ---------------- sprites: MissingNo.'s famous block is decompressed garbage in the shape of a backwards L ----------------
  const SHADES = ['#181820', '#5c5c70', '#a8a8b8', '#f0f0f0'].map(hex);
  function block(seed, view, size) {
    const s = new Surface(size, size), t = Math.max(2, Math.floor(size / 8)), n = view === 'back' ? 8 : 7;
    const ox = view === 'back' ? 0 : size - n * t, oy = size - n * t;
    for (let ty = 0; ty < n; ty++) for (let tx = 0; tx < n; tx++) {
      if (view !== 'back' && tx < 4 && ty < 4) continue; // the empty upper-left corner
      const r = k => hash2(seed * 31 + tx, ty * 17 + k, 911 + seed);
      const kind = Math.floor(r(0) * 7), a = SHADES[Math.floor(r(1) * 4)], b = SHADES[Math.floor(r(2) * 4)];
      for (let y = 0; y < t; y++) for (let x = 0; x < t; x++) {
        const gx = Math.floor(x * 8 / t), gy = Math.floor(y * 8 / t);
        const on = kind === 0 ? true : kind === 1 ? gy % 2 === 0 : kind === 2 ? gx % 2 === 0 : kind === 3 ? (gx + gy) % 2 === 0
          : kind === 4 ? hash2(gx + tx * 8, gy + ty * 8, seed + 5) > 0.5 : kind === 5 ? (gx + gy) % 4 < 2 : ((hash2(gx >> 1, gy, seed + tx * 7 + ty) > 0.45) && gy % 7 && gx % 6);
        s.data[(oy + ty * t + y) * size + ox + tx * t + x] = on ? a : b;
      }
    }
    return s;
  }
  function fossil(real, view, size) { // the museum's fossil pictures: the Pokémon, turned to stone
    const src = G.pokeSprite(real, view, size), s = new Surface(size, size), P = ['#2e2820', '#6e6250', '#aa9d84', '#d8cfb8'].map(hex);
    for (let i = 0; i < src.data.length; i++) {
      const c = src.data[i]; if (!(c >>> 24)) continue;
      const l = ((c & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + ((c >> 16) & 255) * 0.11) / 255;
      s.data[i] = P[Math.min(3, Math.floor(l * 4))];
    }
    return s;
  }
  G.glitchSprite = function (sp, view, size) {
    const d = G.DATA.species[sp]; if (!d || !d.glitch) return null;
    const look = d.glitch.look;
    if (look.startsWith('fossil:')) return fossil(look.slice(7), view, size);
    if (look === 'ghost' && G.ghostPic && view !== 'back' && size === 64) return G.ghostPic();
    return block(d.glitch.seed, view, size);
  };

  // ---------------- Pokédex #000: the flag lives on the 6th item's quantity, and the sprite lands on the HALL OF FAME ----------------
  function flag000(sp) {
    const S = G.state, b = S && S.bag;
    if (b && b.length >= 6 && b[5].n < 128) { b[5].n += 128; G.track && G.track('glitch', { what: 'item128', item: b[5].id }); }
    const d = G.DATA.species[sp];
    if (d && d.glitch && d.glitch.look === 'block' && GS().hofBefore === undefined) GS().hofBefore = (S.hallOfFame || []).length;
  }
  const seen = G.dexSeen, caught = G.dexCaught;
  G.dexSeen = sp => isGlitch(sp) ? flag000(sp) : seen(sp);
  G.dexCaught = sp => isGlitch(sp) ? flag000(sp) : caught(sp);
  // records written before MissingNo. showed up read back as garbage (the save's own data is left alone)
  G.hofView = function (recs) {
    const k = GS().hofBefore; if (k === undefined) return recs;
    return recs.map((r, i) => i >= k ? r : Object.assign({}, r, { team: r.team.map((m, j) => {
      const h = n => Math.floor(hash2(i * 7 + j, n, 4242) * 256);
      return { species: speciesFor(h(1)), level: h(2), name: glitchName(h(3)) };
    }) }));
  };
  // quantities past 99 print a tens "digit" of 10+, which is some other tile entirely
  G.drawGlitchQty = function (s, n, right, y) {
    const F = G.font, ones = String(n % 10), w = F.measure('×') + 10 + F.measure(ones), x = right - w;
    G.ui.text(s, '×', x, y);
    const gx = x + F.measure('×') + 2, tens = Math.floor(n / 10);
    for (let j = 0; j < 8; j++) for (let i = 0; i < 7; i++) if (hash2(i + tens * 8, j, 313) > 0.55) s.pset(gx + i, y + 1 + j, G.ui.INK);
    G.ui.text(s, ones, gx + 8, y);
  };

  // ---------------- wild encounters, done the way TryDoWildEncounter does them ----------------
  const pack = mons => [].concat(...mons.map(([lv, sp]) => [lv & 255, INDEX[sp] || 0]));
  // LoadWildData: only a map WITH grass encounters overwrites the grass list (Cinnabar, the sea routes and towns don't)
  function loadWildData(map) {
    const w = G.DATA.wild[map.d.cnst];
    if (w && w.grass && w.grass.rate && w.grass.mons.length === 10) GS().grass = pack(w.grass.mons);
  }
  function grassRAM() {
    const g = GS();
    if (!Array.isArray(g.grass) || g.grass.length !== 20) { // saves from before this existed: the last route walked through
      const m = G.maps.getMap(G.state.lastOutdoor || 'Route1'), w = m && G.DATA.wild[m.d.cnst];
      g.grass = pack((w && w.grass && w.grass.rate ? w : G.DATA.wild.ROUTE_1).grass.mons);
    }
    return g.grass;
  }
  const slot = () => { let r = rnd(256); const c = G.DATA.slotChances; for (let i = 0; i < c.length; i++) { r -= c[i]; if (r < 0) return i; } return c.length - 1; };
  G.encounters.check = function (map, x, y) {
    const w = G.DATA.wild[map.d.cnst];
    if (!w) return false;
    const S = G.state;
    if (S.repel > 0) { S.repel--; if (S.repel === 0) { G.spawnScript(G.say('REPEL\'s effect wore off.')); return true; } }
    const q = map.quad(x, y) || [], bl = q[2], br = q[3], ov = map.overrides && map.overrides[y * map.w + x];
    // the chance comes from the half-block's bottom-right tile...
    let rate;
    if (map.ts.grass >= 0 && br === map.ts.grass && !ov) rate = w.grass.rate;
    else if (br === WATER) rate = w.water.rate;
    else if (!map.outdoor && map.tsName !== 'Forest') rate = w.grass.rate; // caves and buildings: anywhere
    else return false;
    if (!rate || G.noEncounters || rnd(256) >= rate) return false;
    // ...and the list from its bottom-left tile: anything that isn't water reads the grass list, out of RAM
    const i = slot();
    let lv, sp;
    if (bl === WATER) { if (w.water.mons.length !== 10) return false; [lv, sp] = w.water.mons[i]; }
    else { const g = grassRAM(); lv = g[i * 2]; sp = speciesFor(g[i * 2 + 1]); }
    if (S.repel > 0) { const lead = S.party.find(m => m.hp > 0); if (lead && lv < lead.level) return false; }
    const safari = /^SafariZone/.test(map.name) && S.safariBalls !== undefined && S.safariSteps !== undefined;
    G.spawnScript(G.startWildBattle(sp, lv, { safari }), 'wild');
    return true;
  };

  // ---------------- the Trainer-Fly glitch ----------------
  const actorIndex = a => { const objs = G.ow && G.ow.map && G.ow.map.objs; const i = objs ? objs.indexOf(a.obj) : -1; return i + 1; };
  G.glitch = {
    nameBytes, speciesFor,
    // the old man's demo: wLinkEnemyTrainerName <- the name, over wGrassRate and the first half of wGrassMons
    oldManBackup() { const n = nameBytes(), g = grassRAM().slice(); for (let i = 0; i < 10; i++) g[i] = n[i + 1]; GS().grass = g; },
    onMapLoad(map) {
      loadWildData(map);
      const g = GS();
      if (g.escaped && g.escaped.map === map.name && !g.npcMoving) G.spawnScript(resume(), 'glitch_resume');
    },
    // whoever talked last (wSpriteIndex) decides which text box the stuck script shows; the START menu is 0
    noteText(a) { GS().lastText = a ? actorIndex(a) : 0; },
    // BIT_SEEN_BY_TRAINER: no START menu, no talking to people or signs
    blocked() { return !!GS().seenLock; },
    // a route whose script is stuck waiting to start a battle doesn't check for trainers
    stuck(mapName) { const e = GS().escaped; return !!(e && e.map === mapName); },
    npcWalked() { GS().npcMoving = false; },
    // the battle's enemy struct shares RAM with wEngagedTrainerClass / wEngagedTrainerSet
    afterBattle(b, opts) {
      const g = GS(), e = b.e && b.mon(b.e);
      if (e) g.enemy = { spc: e.spc & 255, atk: 7 + ((b.e.v && b.e.v.st && b.e.v.st.atk) || 0) };
      if (opts && opts.type === 'trainer') g.seenLock = false; // EndTrainerBattle
    },
    // START pressed mid-step as a trainer spots you: the menu opens before the trainer's walk
    *spotted(a, dist) {
      const g = GS(), map = G.ow.map.name, tr = a.obj.trainer;
      g.enemy = { spc: 200 + Math.max(0, TRAINERS.indexOf(tr.cls)), atk: tr.n }; // EngageMapTrainer already ran
      a.emote = '!'; a.emoteT = 0; G.sfx && G.sfx('exclaim');
      yield* G.startMenu();
      a.emote = null;
      if (G.ow.map.name === map) { g.lastText = actorIndex(a); yield* G.startTrainerSighted(a, dist); return; } // stayed: the trainer walks over as usual
      g.escaped = { map, flag: a.obj.th.flag }; g.seenLock = true; g.npcMoving = true;
    },
  };
  // back on the route: DisplayEnemyTrainerTextAndStartBattle, run on whatever the last battle left behind
  function* resume() {
    while (G.scriptRunning > 1 || G.fadeLevel > 0) yield; // let the warp that brought us here finish
    const g = GS(), esc = g.escaped; if (!esc) return;
    g.escaped = null;
    const a = g.lastText ? G.ow.actors.find(x => actorIndex(x) === g.lastText) : null;
    if (!g.lastText) {
      yield* G.startMenu(); // text box 0: the START menu
      if (G.ow.map.name !== esc.map) { g.escaped = esc; return; } // flew off again: still stuck
    } else if (a && a.trainer && a.obj.th && !G.flag(a.obj.th.flag)) { // that sprite is a trainer: they take the battle instead
      yield* G.trainerBattleFlow(a); g.seenLock = false; return;
    } else if (a && G.talkTo) yield* G.talkTo(a);
    const cls = g.enemy ? g.enemy.spc : 0, set = g.enemy ? g.enemy.atk : 0;
    if (cls >= 200) { const tc = TRAINERS[cls - 200]; if (tc && G.DATA.parties[tc]) yield* G.startTrainerBattle(tc, Math.max(1, set), {}); }
    else if (cls > 0) { G.track && G.track('glitch', { what: 'trainer_fly', sp: speciesFor(cls), lv: set }); yield* G.startWildBattle(speciesFor(cls), set); }
    G.setFlag(esc.flag); // EndTrainerBattle marks the trainer who spotted you as fought
    g.seenLock = false;
  }
})(window.G);
