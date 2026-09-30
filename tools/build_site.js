// The searchable side of claudered.dev: a Pokédex, moves, locations, types, gym leaders, TMs, evolutions and guides
// for Pokémon Red, written from the game's own data (src/data, converted from pret/pokered) with sprites and maps
// rendered by the game's own code. Also the favicon set (a pixel POKé BALL), the web manifest, llms.txt and the sitemap.
// Called by tools/build_dist.js:  require('./build_site.js')(OUT, site, H)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
// local build state (git-ignored data/): each page's content hash and the date it last really changed, and the pages
// changed since the last successful IndexNow submission (tools/indexnow.js sends and clears them after a deploy)
const STATE = path.join(__dirname, '..', 'data'), MANIFEST = path.join(STATE, 'seo-manifest.json'), PENDING = path.join(STATE, 'seo-pending.json');
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const LASTMOD = '%%LASTMOD%%';

module.exports = function buildSite(OUT, site, H) {
  const SITE = (site || 'https://claudered.dev/').replace(/\/?$/, '/');
  const G = H.loadGame({ search: '?map=PalletTown&x=5&y=6' }).G; G.boot();
  const D = G.DATA, M = G.MAPDATA.maps, { Surface, hex } = G.gfx;
  const TODAY = new Date().toISOString().slice(0, 10);
  const pages = []; // [path, priority]
  const prev = readJSON(MANIFEST, {}), next = {}, changed = [];
  // a page's date is the day its content last changed (hashed with the date left out), not the day of the build
  const stamp = (p, html) => { const h = crypto.createHash('sha1').update(html).digest('hex'), same = prev[p] && prev[p].hash === h;
    next[p] = { hash: h, lastmod: same ? prev[p].lastmod : TODAY }; if (!same) changed.push(p); return next[p].lastmod; };
  const write = (p, html, priority) => { const f = path.join(OUT, p, 'index.html'); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, html.split(LASTMOD).join(stamp(p, html))); pages.push([p, priority || 0.6]); };
  const strip = s => String(s).replace(/<[^>]+>/g, '');
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const list = (a, and) => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + (a.length > 2 ? ',' : '') + ' ' + (and || 'and') + ' ' + a[a.length - 1];
  const pct = x => (Math.round(x * 1000) / 10).toString().replace(/\.0$/, '') + '%';
  const range = (a, b) => a === b ? 'Lv ' + a : 'Lv ' + a + '–' + b;

  // ================================================================ names and slugs
  const MON_NAMES = { NIDORAN_F: 'Nidoran♀', NIDORAN_M: 'Nidoran♂', MR_MIME: 'Mr. Mime', FARFETCHD: "Farfetch'd" };
  const cap = w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  const monName = sp => MON_NAMES[sp] || cap(D.species[sp].name);
  const monSlug = sp => ({ NIDORAN_F: 'nidoran-f', NIDORAN_M: 'nidoran-m', MR_MIME: 'mr-mime', FARFETCHD: 'farfetchd' })[sp] || sp.toLowerCase();
  const MOVE_NAMES = { DOUBLESLAP: 'Double Slap', THUNDERPUNCH: 'Thunder Punch', THUNDERSHOCK: 'Thunder Shock', VICEGRIP: 'Vise Grip', SOLARBEAM: 'Solar Beam', POISONPOWDER: 'Poison Powder',
    SONICBOOM: 'Sonic Boom', SELFDESTRUCT: 'Self-Destruct', BUBBLEBEAM: 'Bubble Beam', DOUBLE_EDGE: 'Double-Edge', SOFTBOILED: 'Soft-Boiled', HI_JUMP_KICK: 'High Jump Kick', PSYCHIC_M: 'Psychic', SMOKESCREEN: 'Smokescreen' };
  const moveName = id => MOVE_NAMES[id] || id.split('_').map(cap).join(' ');
  const moveSlug = id => moveName(id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const TYPES = ['NORMAL', 'FIRE', 'WATER', 'ELECTRIC', 'GRASS', 'ICE', 'FIGHTING', 'POISON', 'GROUND', 'FLYING', 'PSYCHIC_TYPE', 'BUG', 'ROCK', 'GHOST', 'DRAGON'];
  const typeName = t => t === 'PSYCHIC_TYPE' ? 'Psychic' : cap(t);
  const typeSlug = t => typeName(t).toLowerCase();
  const TYPE_COL = { NORMAL: '#a8a878', FIRE: '#f08030', WATER: '#6890f0', ELECTRIC: '#f8d030', GRASS: '#78c850', ICE: '#98d8d8', FIGHTING: '#c03028', POISON: '#a040a0', GROUND: '#e0c068',
    FLYING: '#a890f0', PSYCHIC_TYPE: '#f85888', BUG: '#a8b820', ROCK: '#b8a038', GHOST: '#705898', DRAGON: '#7038f8' };
  const typeBadge = t => `<a class="type" style="--c:${TYPE_COL[t] || '#888'}" href="/types/${typeSlug(t)}/">${typeName(t)}</a>`;
  const PHYSICAL = new Set(['NORMAL', 'FIGHTING', 'FLYING', 'POISON', 'GROUND', 'ROCK', 'BUG', 'GHOST']);
  const ITEM_NAMES = { POKE_BALL: 'Poké Ball', POKE_DOLL: 'Poké Doll', POKE_FLUTE: 'Poké Flute', PARLYZ_HEAL: 'Parlyz Heal', X_ACCURACY: 'X Accuracy', SS_TICKET: 'S.S. Ticket', S_S_TICKET: 'S.S. Ticket', HP_UP: 'HP Up', PP_UP: 'PP Up' };
  const TM_LIST = D.tmMoves.filter(m => D.moves[m]).slice(0, 50); // the converted list ends with a stray entry
  const tmNum = id => { const i = TM_LIST.indexOf(id); if (i >= 0) return 'TM' + String(i + 1).padStart(2, '0'); const h = D.hmMoves.indexOf(id); return h >= 0 ? 'HM' + String(h + 1).padStart(2, '0') : null; };
  const itemName = id => {
    if (ITEM_NAMES[id]) return ITEM_NAMES[id];
    const m = /^(TM|HM)_(.+)$/.exec(id); if (m && D.moves[m[2] === 'PSYCHIC' ? 'PSYCHIC_M' : m[2]]) { const mv = m[2] === 'PSYCHIC' ? 'PSYCHIC_M' : m[2]; return (tmNum(mv) || m[1]) + ' ' + moveName(mv); }
    const it = D.items[id]; return (it ? it.name : id).split(/[ _]/).map(cap).join(' ').replace(/Pokeball/i, 'Poké Ball');
  };
  const monLink = sp => `<a href="/pokedex/${monSlug(sp)}/">${esc(monName(sp))}</a>`;
  const moveLink = id => `<a href="/moves/${moveSlug(id)}/">${esc(moveName(id))}</a>`;
  const DEX = D.dexOrder.slice(1, 152);

  // maps: pretty names, grouped into location pages
  const pretty = n => n.replace(/^Pokemon/, 'Pokémon').replace(/Pokemon/g, 'Pokémon').replace(/^SSAnne/, 'S.S. Anne').replace(/^MtMoon/, 'Mt. Moon').replace(/^SilphCo/, 'Silph Co. ').replace(/^Digletts/, "Diglett's")
    .replace(/([a-zé])([A-Z0-9])/g, '$1 $2').replace(/(\d)([A-Z][a-z])/g, '$1 $2').replace(/\s+/g, ' ').replace(/ B (\d)F/, ' B$1F').replace(/Co\. {2}/, 'Co. ').trim();
  const AREAS = [ // [slug, name, map name pattern, blurb]
    ['viridian-forest', 'Viridian Forest', /^ViridianForest$/, 'the maze of trees and tall grass between Viridian City and Pewter City'],
    ['mt-moon', 'Mt. Moon', /^MtMoon(1F|B1F|B2F)$/, 'the cave on Route 3 and Route 4 where Team Rocket digs for fossils'],
    ['rock-tunnel', 'Rock Tunnel', /^RockTunnel(1F|B1F)$/, 'the pitch-dark cave between Route 10 and Lavender Town'],
    ['pokemon-tower', 'Pokémon Tower', /^PokemonTower\dF$/, 'the haunted graveyard tower in Lavender Town'],
    ['safari-zone', 'Safari Zone', /^SafariZone(Center|East|North|West)$/, "Fuchsia City's catch-only park, reached through the Safari Zone gate"],
    ['seafoam-islands', 'Seafoam Islands', /^SeafoamIslands(1F|B\dF)$/, 'the icy cave islands on Route 20 where ARTICUNO sleeps'],
    ['power-plant', 'Power Plant', /^PowerPlant$/, 'the abandoned power station on Route 10, home of ZAPDOS'],
    ['pokemon-mansion', 'Pokémon Mansion', /^PokemonMansion(\dF|B1F)$/, 'the burned-out research mansion on Cinnabar Island'],
    ['victory-road', 'Victory Road', /^VictoryRoad\dF$/, 'the final cave before the Indigo Plateau, full of boulder puzzles'],
    ['cerulean-cave', 'Cerulean Cave', /^CeruleanCave(1F|2F|B1F)$/, 'the post-game cave north of Cerulean City where MEWTWO waits'],
    ['digletts-cave', "Diglett's Cave", /^DiglettsCave$/, 'the long tunnel from Route 2 to Route 11 dug by DIGLETT'],
    ['ss-anne', 'S.S. Anne', /^SSAnne(1F|2F|3F|B1F|Bow|Kitchen|CaptainsRoom)$/, 'the luxury cruise ship docked in Vermilion City'],
    ['rocket-hideout', 'Rocket Hideout', /^RocketHideoutB\dF$/, "Team Rocket's base under the Celadon Game Corner"],
    ['silph-co', 'Silph Co.', /^SilphCo\d+F$/, 'the eleven-floor headquarters in Saffron City taken over by Team Rocket'],
  ];
  const TOWNS = ['PalletTown', 'ViridianCity', 'PewterCity', 'CeruleanCity', 'VermilionCity', 'LavenderTown', 'CeladonCity', 'FuchsiaCity', 'SaffronCity', 'CinnabarIsland', 'IndigoPlateau'];
  const ROUTES = Array.from({ length: 25 }, (_, i) => 'Route' + (i + 1));
  const locSlug = n => pretty(n).toLowerCase().replace(/[^a-z0-9é]+/g, '-').replace(/é/g, 'e').replace(/^-|-$/g, '');
  const areaOf = n => AREAS.find(a => a[2].test(n));
  const locHref = n => { const a = areaOf(n); if (a) return '/locations/' + a[0] + '/'; if (TOWNS.includes(n) || ROUTES.includes(n)) return '/locations/' + locSlug(n) + '/'; return null; };
  const locName = n => { const a = areaOf(n); return a ? a[1] + (n.match(/(B?\d+F|Center|East|North|West)$/) && !/^(ViridianForest|PowerPlant|DiglettsCave)$/.test(n) ? ' (' + (n.match(/(B?\d+F|Center|East|North|West)$/)[0]) + ')' : '') : pretty(n); };
  const locLink = n => { const h = locHref(n); return h ? `<a href="${h}">${esc(locName(n))}</a>` : esc(locName(n)); };

  // ================================================================ facts derived from the data
  const SLOT = D.slotChances.map(x => x / 256);
  function wildTable(list) { // [[lv, sp] x10] -> [{sp, lo, hi, p}]
    const by = new Map();
    list.forEach(([lv, sp], i) => { const e = by.get(sp) || { sp, lo: lv, hi: lv, p: 0 }; e.lo = Math.min(e.lo, lv); e.hi = Math.max(e.hi, lv); e.p += SLOT[i] || 0; by.set(sp, e); });
    return [...by.values()].sort((a, b) => b.p - a.p);
  }
  const mapsByCnst = {}; for (const n of Object.keys(M)) if (M[n].cnst) mapsByCnst[M[n].cnst] = n;
  const found = {}; // sp -> [{map, how, lo, hi, p, note}]
  const add = (sp, e) => { if (!D.species[sp]) return; (found[sp] = found[sp] || []).push(e); };
  const wildOf = {}; // map name -> {grass, water, rate, wrate}
  for (const [cnst, w] of Object.entries(D.wild)) {
    const n = mapsByCnst[cnst]; if (!n) continue;
    const g = w.grass && w.grass.rate ? wildTable(w.grass.mons) : [], wa = w.water && w.water.rate ? wildTable(w.water.mons) : [];
    if (!g.length && !wa.length) continue;
    wildOf[n] = { grass: g, water: wa, rate: w.grass ? w.grass.rate : 0, wrate: w.water ? w.water.rate : 0 };
    const cave = /Cave|Tunnel|Moon|Seafoam|Victory|Tower|Mansion|Plant|Hideout/.test(n);
    for (const e of g) add(e.sp, { map: n, how: cave ? 'walking' : 'tall grass', lo: e.lo, hi: e.hi, p: e.p });
    for (const e of wa) add(e.sp, { map: n, how: 'surfing', lo: e.lo, hi: e.hi, p: e.p });
  }
  const superRod = {}; for (const [cnst, l] of Object.entries(D.superRod)) { const n = mapsByCnst[cnst]; if (!n) continue; superRod[n] = l; for (const [lv, sp] of l) add(sp, { map: n, how: 'Super Rod', lo: lv, hi: lv, p: 1 / l.length }); }
  const SPECIAL = [ // from the story scripts (src/scripts)
    ['BULBASAUR', 'OaksLab', 'starter', 5, 'choose it as your first POKéMON from Professor Oak'], ['CHARMANDER', 'OaksLab', 'starter', 5, 'choose it as your first POKéMON from Professor Oak'],
    ['SQUIRTLE', 'OaksLab', 'starter', 5, 'choose it as your first POKéMON from Professor Oak'],
    ['MAGIKARP', 'MtMoonPokecenter', 'bought', 5, 'buy it for ₽500 from the salesman in the POKéMON CENTER outside Mt. Moon (Route 4)'],
    ['EEVEE', 'CeladonMansionRoofHouse', 'gift', 25, 'take the POKé BALL in the secret room on the roof of Celadon Mansion'],
    ['LAPRAS', 'SilphCo7F', 'gift', 15, 'a Silph Co. employee on 7F gives it to you while Team Rocket occupies the building'],
    ['HITMONLEE', 'FightingDojo', 'gift', 30, 'beat the Karate Master in the Fighting Dojo in Saffron City and pick HITMONLEE or HITMONCHAN'],
    ['HITMONCHAN', 'FightingDojo', 'gift', 30, 'beat the Karate Master in the Fighting Dojo in Saffron City and pick HITMONLEE or HITMONCHAN'],
    ['OMANYTE', 'CinnabarLab', 'fossil', 30, 'choose the Helix Fossil in Mt. Moon and have it revived at the Cinnabar Lab'],
    ['KABUTO', 'CinnabarLab', 'fossil', 30, 'choose the Dome Fossil in Mt. Moon and have it revived at the Cinnabar Lab'],
    ['AERODACTYL', 'CinnabarLab', 'fossil', 30, 'get the Old Amber from the back of the Pewter Museum and have it revived at the Cinnabar Lab'],
    ['SNORLAX', 'Route12', 'static', 30, 'wake the one sleeping on Route 12 with the Poké Flute'], ['SNORLAX', 'Route16', 'static', 30, 'wake the one sleeping on Route 16 with the Poké Flute'],
    ['ARTICUNO', 'SeafoamIslandsB4F', 'static', 50, 'it waits on the bottom floor of the Seafoam Islands'], ['ZAPDOS', 'PowerPlant', 'static', 50, 'it roosts at the far end of the Power Plant'],
    ['MOLTRES', 'VictoryRoad2F', 'static', 50, 'it sits in Victory Road on the way to the Indigo Plateau'], ['MEWTWO', 'CeruleanCaveB1F', 'static', 70, 'it waits at the bottom of Cerulean Cave after you become Champion'],
    ['VOLTORB', 'PowerPlant', 'static', 40, 'several "items" on the Power Plant floor are Voltorb in disguise'], ['ELECTRODE', 'PowerPlant', 'static', 43, 'two "items" on the Power Plant floor are Electrode in disguise'],
    ['ABRA', 'GameCorner', 'prize', 9, 'exchange 180 coins at the Celadon Game Corner prize corner'], ['CLEFAIRY', 'GameCorner', 'prize', 8, 'exchange 500 coins at the Celadon Game Corner prize corner'],
    ['NIDORINA', 'GameCorner', 'prize', 17, 'exchange 1,200 coins at the Celadon Game Corner prize corner'], ['DRATINI', 'GameCorner', 'prize', 18, 'exchange 2,800 coins at the Celadon Game Corner prize corner'],
    ['SCYTHER', 'GameCorner', 'prize', 25, 'exchange 5,500 coins at the Celadon Game Corner prize corner'], ['PORYGON', 'GameCorner', 'prize', 26, 'exchange 9,999 coins at the Celadon Game Corner prize corner'],
  ];
  const TRADE_AT = { 0: 'Route 11 gate (upstairs)', 1: 'the house on Route 2', 3: 'the Cinnabar Lab fossil room', 4: 'the trade house in Vermilion City', 5: 'the Route 18 gate (upstairs)',
    6: 'the trade house in Cerulean City', 7: 'the Cinnabar Lab trade room', 8: 'the Cinnabar Lab trade room', 9: 'the Underground Path entrance on Route 5' };
  const TRADE_MAP = { 0: 'Route11', 1: 'Route2', 3: 'CinnabarIsland', 4: 'VermilionCity', 5: 'Route18', 6: 'CeruleanCity', 7: 'CinnabarIsland', 8: 'CinnabarIsland', 9: 'Route5' };
  for (const [sp, map, how, lv, note] of SPECIAL) add(sp, { map, how, lo: lv, hi: lv, note });
  D.trades.forEach((t, i) => { if (TRADE_AT[i]) add(t.get, { map: TRADE_MAP[i], how: 'in-game trade', note: `trade a ${monName(t.give)} to the trainer in ${TRADE_AT[i]} (it arrives nicknamed ${t.nick})`, give: t.give }); });
  add('MAGIKARP', { map: null, how: 'Old Rod', lo: 5, hi: 5, note: 'fish with the Old Rod in any water' });
  for (const [lv, sp] of D.goodRod) add(sp, { map: null, how: 'Good Rod', lo: lv, hi: lv, note: 'fish with the Good Rod in any water (50%)' });
  // evolutions both ways
  const evoFrom = {}; for (const sp of DEX) for (const e of D.species[sp].evos || []) evoFrom[e.to] = { from: sp, ...e };
  const evoText = e => e.type === 'level' ? 'at level ' + e.level : e.type === 'item' ? 'with a ' + itemName(e.item) : e.type === 'trade' ? 'when traded' : e.type;
  const obtainable = new Set(Object.keys(found));
  for (let k = 0; k < 4; k++) for (const sp of DEX) if (obtainable.has(sp)) for (const e of D.species[sp].evos || []) obtainable.add(e.to);
  function family(sp) { let root = sp; while (evoFrom[root]) root = evoFrom[root].from; const out = []; (function walk(s, depth) { out.push([s, depth]); for (const e of D.species[s].evos || []) walk(e.to, depth + 1); })(root, 0); return out; }
  // learners
  const levelLearners = {}, tmLearners = {};
  for (const sp of DEX) { const s = D.species[sp];
    for (const mv of s.moves1) (levelLearners[mv] = levelLearners[mv] || []).push([sp, 1]);
    for (const [lv, mv] of s.learn) (levelLearners[mv] = levelLearners[mv] || []).push([sp, lv]);
    for (const mv of s.tmhm) (tmLearners[mv] = tmLearners[mv] || []).push(sp); }
  const STATS = [['hp', 'HP'], ['atk', 'Attack'], ['def', 'Defense'], ['spc', 'Special'], ['spd', 'Speed']];
  const total = sp => STATS.reduce((a, [k]) => a + D.species[sp][k], 0);
  const rank = (sp, k) => 1 + DEX.filter(o => (k === 'total' ? total(o) : D.species[o][k]) > (k === 'total' ? total(sp) : D.species[sp][k])).length;
  const eff = (atk, defTypes) => G.typeMult(atk, defTypes);
  // trainers and items by map
  const partyOf = (cls, n) => ((D.parties[cls] || [])[(n || 1) - 1]) || [];
  const clsName = cls => { const c = D.trainerClasses[cls]; return c ? c.name.split(/[ _]/).map(cap).join(' ').replace('Jr ', 'Jr. ').replace(/Pokemaniac/i, 'PokéManiac') : cls; };
  const trainersOn = n => (M[n].objs || []).filter(o => o.trainer && D.parties[o.trainer.cls] && !/^RIVAL/.test(o.trainer.cls)).map(o => ({ cls: o.trainer.cls, n: o.trainer.n, party: partyOf(o.trainer.cls, o.trainer.n) }));
  const itemsOn = n => [...(M[n].objs || []).filter(o => o.item && o.item !== '0' && D.items[o.item] || (o.item && /^(TM|HM)_/.test(o.item))).map(o => ({ id: o.item, hidden: false })),
    ...(M[n].hidden || []).filter(h => h.fn === 'HiddenItems' && h.arg).map(h => ({ id: h.arg, hidden: true }))];
  const martOf = town => { const k = Object.keys(D.marts).find(k => k.toLowerCase().startsWith(town.replace(/City|Town|Island|Plateau/, '').toLowerCase())); return k ? D.marts[k] : null; };

  // ================================================================ images: sprites, maps, icons
  fs.mkdirSync(path.join(OUT, 'sprites'), { recursive: true }); fs.mkdirSync(path.join(OUT, 'maps'), { recursive: true });
  for (const sp of DEX) H.savePNG(G.pokeSprite(sp, 'front', 64), path.join(OUT, 'sprites', monSlug(sp) + '.png'), 2);
  const mapImg = {};
  function renderMap(n) {
    if (mapImg[n] !== undefined) return mapImg[n];
    try {
      const m = G.maps.getMap(n), R = G.mapRender.build(m), comp = R.s.clone(); comp.blit(R.up, 0, 0);
      const mx = (R.mx !== undefined ? R.mx : G.mapRender.MX) * 16, my = (R.my !== undefined ? R.my : G.mapRender.MY) * 16;
      const out = new Surface(m.w * 16, m.h * 16); out.blit(comp, 0, 0, { sx: mx, sy: my, sw: m.w * 16, sh: m.h * 16 });
      const file = 'maps/' + locSlug(n) + '.png'; H.savePNG(out, path.join(OUT, file)); return (mapImg[n] = { src: '/' + file, w: m.w * 16, h: m.h * 16 });
    } catch (e) { return (mapImg[n] = null); }
  }
  // favicon: a pixel POKé BALL drawn like the game's (src/game/battlescene.js G.drawBall), sharp at every size
  function ball(N) {
    const s = new Surface(N, N), R = N / 2 - 0.5, ow = Math.max(1, Math.round(N / 16)), band = Math.max(0.6, N / 22), cr = N * 0.17;
    const red = hex('#e04848'), redL = hex('#f47a6e'), redD = hex('#a82c34'), white = hex('#f8f8f8'), grey = hex('#c8c8d8'), ink = hex('#1b1a2e');
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = x + 0.5 - N / 2, dy = y + 0.5 - N / 2, d = Math.hypot(dx, dy);
      if (d > R + 0.5) continue;
      let c = dy < 0 ? (dx < -R * 0.25 && dy < -R * 0.35 ? redL : dx > R * 0.35 ? redD : red) : (dx > R * 0.35 ? grey : white);
      if (Math.abs(dy) < band || d > R + 0.5 - ow) c = ink;
      if (d < cr + ow) c = d < cr ? (d < cr * 0.55 ? white : white) : ink;
      if (d < cr && d > cr - ow * 0.9) c = ink;
      if (d < cr - ow * 0.9) c = white;
      s.pset(x, y, c);
    }
    return s;
  }
  const png = (surf, file, scale) => { const p = path.join(OUT, file); H.savePNG(surf, p, scale || 1); return fs.readFileSync(p); };
  const icons = [16, 32, 48].map(n => png(ball(n), `favicon-${n}.png`));
  { // favicon.ico: the three PNGs in one ICO container
    const head = Buffer.alloc(6 + 16 * icons.length); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(icons.length, 4);
    let off = head.length; [16, 32, 48].forEach((n, i) => { const e = 6 + i * 16; head[e] = n; head[e + 1] = n; head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6); head.writeUInt32LE(icons[i].length, e + 8); head.writeUInt32LE(off, e + 12); off += icons[i].length; });
    fs.writeFileSync(path.join(OUT, 'favicon.ico'), Buffer.concat([head, ...icons]));
  }
  { // favicon.svg from the 32px ball, one rect per run of pixels
    const b = ball(32); let rects = '';
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32;) { const c = b.data[y * 32 + x]; if (!(c >>> 24)) { x++; continue; } let w = 1; while (x + w < 32 && b.data[y * 32 + x + w] === c) w++;
      rects += `<rect x="${x}" y="${y}" width="${w}" height="1" fill="#${[c & 255, (c >>> 8) & 255, (c >>> 16) & 255].map(v => v.toString(16).padStart(2, '0')).join('')}"/>`; x += w; }
    fs.writeFileSync(path.join(OUT, 'favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges">${rects}</svg>`);
  }
  const padded = (N, art, pad) => { const s = new Surface(N, N); s.rect(0, 0, N, N, hex('#0d0c16')); const b = ball(art), k = Math.floor((N - pad * 2) / art), o = Math.floor((N - art * k) / 2);
    for (let y = 0; y < art; y++) for (let x = 0; x < art; x++) { const c = b.data[y * art + x]; if (c >>> 24) s.rect(o + x * k, o + y * k, k, k, c); } return s; };
  png(padded(180, 32, 18), 'apple-touch-icon.png'); png(padded(192, 32, 20), 'icon-192.png'); png(padded(512, 32, 56), 'icon-512.png');
  fs.writeFileSync(path.join(OUT, 'site.webmanifest'), JSON.stringify({ name: 'Pokémon Claude Red', short_name: 'Claude Red', description: 'Pokémon Red, remade from raw pixels by Claude. Free in your browser.',
    start_url: '/?ref=pwa', display: 'fullscreen', orientation: 'any', background_color: '#0d0c16', theme_color: '#0d0c16',
    icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }] }, null, 2));

  // ================================================================ page shell
  fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'assets', 'site.css'), CSS);
  const NAV = [['/pokedex/', 'Pokédex'], ['/moves/', 'Moves'], ['/locations/', 'Locations'], ['/types/', 'Types'], ['/gym-leaders/', 'Gyms'], ['/guides/', 'Guides']];
  const UPPER = {}; for (const sp of DEX) UPPER[D.species[sp].name] = monName(sp); // BULBASAUR -> Bulbasaur in page text
  const prose = (h, ...v) => (Array.isArray(h) && h.raw ? String.raw({ raw: h }, ...v) : h).replace(/\b[A-Z][A-Z'.]{2,}\b/g, w => UPPER[w] || w).replace(/POKéMON CENTER/g, 'Pokémon Center').replace(/POKé MART/g, 'Poké Mart').replace(/POKéMON/g, 'Pokémon').replace(/POKé BALLS?/g, m => m.endsWith('S') ? 'Poké Balls' : 'Poké Ball').replace(/POKéDEX/g, 'Pokédex').replace(/POKé FLUTE/g, 'Poké Flute');
  function shell(o) { return prose(shellRaw(o)); }
  function shellRaw({ path: p, title, description, h1, crumbs, body, faq, jsonld, image, lead }) {
    const url = SITE + p.replace(/^\//, '');
    const bc = [['/', 'Home'], ...(crumbs || [])];
    const ld = [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: bc.map(([h, n], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: SITE + h.replace(/^\//, '') })) }];
    if (faq && faq.length) ld.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '') } })) });
    for (const j of jsonld || []) ld.push(Object.assign({ '@context': 'https://schema.org' }, j));
    const img = image ? SITE + image.replace(/^\//, '') : SITE + 'preview.png';
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article"><meta property="og:site_name" content="Pokémon Claude Red"><meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:image" content="${img}">
<meta name="twitter:card" content="${image ? 'summary' : 'summary_large_image'}"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${img}">
<meta name="theme-color" content="#0d0c16">
<link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="manifest" href="/site.webmanifest">
<link rel="stylesheet" href="/assets/site.css">
<script type="application/ld+json">${JSON.stringify(ld.length === 1 ? ld[0] : ld).replace(/</g, '\\u003c')}</script>
</head>
<body>
<header class="top"><a class="brand" href="/"><img src="/favicon.svg" alt="" width="22" height="22">Pokémon Claude Red</a>
<nav aria-label="Sections">${NAV.map(([h, n]) => `<a href="${h}"${p.startsWith(h) ? ' aria-current="page"' : ''}>${n}</a>`).join('')}</nav>
<a class="play" href="/?ref=site-header">▶ Play free</a></header>
<main>
<nav class="crumbs" aria-label="Breadcrumb">${bc.map(([h, n], i) => i === bc.length - 1 ? `<span>${esc(n)}</span>` : `<a href="${h}">${esc(n)}</a>`).join(' <span aria-hidden="true">›</span> ')}</nav>
<h1>${esc(h1)}</h1>
${lead ? `<p class="lead">${lead}</p>` : ''}
${body}
${faq && faq.length ? `<section class="faq"><h2>Frequently asked questions</h2>${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${a}</p></details>`).join('')}</section>` : ''}
<aside class="cta"><div><strong>Play Pokémon Red in your browser, free.</strong> Pokémon Claude Red is a fan remake of Pokémon Red where every pixel is drawn by code: all 151 POKéMON, the full Kanto story, link battles and trades online. No download, no emulator, works on your phone.</div><a class="play big" href="/?ref=site-cta">▶ Play now</a></aside>
</main>
<footer><p><a href="/faq/">About &amp; FAQ</a> · <a href="/guides/">Guides</a> · <a href="https://github.com/levy-street/pokemon-claude-red">Source code</a> · <a href="https://levystreet.com/?utm_source=claudered">Levy St.</a></p>
<p class="fine">A free, non-commercial fan project. Pokémon © Nintendo / Creatures Inc. / GAME FREAK inc. Game data from the pret/pokered disassembly. Not affiliated with Nintendo, The Pokémon Company, GAME FREAK, Creatures Inc. or Anthropic. Last updated ${LASTMOD}.</p></footer>
</body>
</html>
`;
  }
  const table = (head, rows, cls) => `<div class="tw"><table${cls ? ` class="${cls}"` : ''}><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const sprite = (sp, size, lazy) => `<img class="px" src="/sprites/${monSlug(sp)}.png" alt="${esc(monName(sp))} pixel-art sprite" width="${size}" height="${size}"${lazy ? ' loading="lazy"' : ''}>`;
  const bar = v => `<span class="bar"><i style="width:${Math.min(100, Math.round(v / 1.6))}%"></i></span>`;

  // ================================================================ Pokédex
  const howLine = e => {
    const where = e.map ? locLink(e.map) : 'anywhere with water';
    if (e.how === 'in-game trade') return `${where}: ${e.note}.`;
    if (e.note) return `${where}: ${e.note}${e.lo ? ` (${range(e.lo, e.hi)})` : ''}.`;
    return `${where}: ${e.how}, ${range(e.lo, e.hi)}${e.p !== undefined ? `, ${pct(e.p)} of encounters` : ''}.`;
  };
  const whereSummary = sp => {
    const f = found[sp] || [];
    const wild = f.filter(e => ['tall grass', 'walking', 'surfing', 'Super Rod', 'Good Rod', 'Old Rod'].includes(e.how));
    const best = wild.filter(e => e.map).sort((a, b) => (b.p || 0) - (a.p || 0) || a.lo - b.lo)[0];
    const special = f.filter(e => !wild.includes(e));
    if (best) return `You can catch ${monName(sp)} in ${list([...new Set(wild.filter(e => e.map).map(e => locName(e.map)))].slice(0, 4))}${wild.filter(e => e.map).length > 4 ? ' and more' : ''}; the best odds are ${best.how === 'tall grass' ? 'in the tall grass of' : best.how === 'surfing' ? 'surfing in' : best.how === 'walking' ? 'in' : 'with the ' + best.how + ' in'} ${locName(best.map)} (${pct(best.p)}, ${range(best.lo, best.hi)}).`;
    if (special.length) return `${monName(sp)} isn't found in the wild in Pokémon Red: ${special[0].note}.`;
    if (evoFrom[sp]) return `${monName(sp)} isn't found in the wild in Pokémon Red: evolve ${monName(evoFrom[sp].from)} ${evoText(evoFrom[sp])}.`;
    if (!obtainable.has(sp)) return sp === 'MEW' ? 'MEW was only ever given out at events, but the famous Mew glitch (the trainer-Fly trick) makes a wild one appear.' : `${monName(sp)} can't be caught in Pokémon Red: it's a Pokémon Blue exclusive, so you trade for it (in Pokémon Claude Red, other players can trade you one in the Social Zone).`;
    return '';
  };
  const monIndex = [];
  DEX.forEach((sp, i) => {
    const s = D.species[sp], N = monName(sp), no = '#' + String(s.dex).padStart(3, '0'), types = s.types.filter((t, k) => s.types.indexOf(t) === k);
    const f = found[sp] || [], tot = total(sp);
    const best = STATS.slice().sort((a, b) => s[b[0]] - s[a[0]])[0];
    const weak = [], resist = [], immune = [], four = [], quarter = [];
    for (const t of TYPES) { const m = eff(t, types); if (m >= 4) four.push(t); else if (m > 1) weak.push(t); else if (m === 0) immune.push(t); else if (m <= 0.25) quarter.push(t); else if (m < 1) resist.push(t); }
    const next = s.evos || [], prev = evoFrom[sp];
    const fam = family(sp);
    const tms = s.tmhm.map(mv => [tmNum(mv), mv]).filter(x => x[0]).sort((a, b) => a[0].localeCompare(b[0]));
    const learn = [...s.moves1.map(mv => [1, mv]), ...s.learn];
    const where = whereSummary(sp);
    const evoLine = next.length ? `It evolves into ${list(next.map(e => monName(e.to) + ' ' + evoText(e)), 'or')}.` : prev ? `It evolves from ${monName(prev.from)} ${evoText(prev)}${fam.length > 2 ? '' : ''} and doesn't evolve further.` : "It doesn't evolve.";
    const lead = `<strong>${esc(N)}</strong> (${no}) is a${/^[AEIOU]/.test(typeName(types[0])) ? 'n' : ''} ${types.map(typeName).join('/')}-type ${esc(cap(s.cat))} POKéMON in Pokémon Red. ${esc(where)} ${esc(evoLine)} Its best stat is ${best[1]} (${s[best[0]]}), and its base stat total of ${tot} ranks #${rank(sp, 'total')} of 151.`;
    const body = `
<div class="mon-top">
  <figure class="mon-art">${sprite(sp, 192)}<figcaption>${esc(N)}, drawn from code for Pokémon Claude Red</figcaption></figure>
  <dl class="facts">
    <dt>National No.</dt><dd>${no}</dd>
    <dt>Type</dt><dd>${types.map(typeBadge).join(' ')}</dd>
    <dt>Category</dt><dd>${esc(cap(s.cat))} POKéMON</dd>
    <dt>Height</dt><dd>${s.ht[0]}′${String(s.ht[1]).padStart(2, '0')}″ (${(((s.ht[0] * 12 + s.ht[1]) * 2.54) / 100).toFixed(1)} m)</dd>
    <dt>Weight</dt><dd>${(s.wt / 10).toFixed(1)} lb (${(s.wt / 22.046).toFixed(1)} kg)</dd>
    <dt>Catch rate</dt><dd>${s.catchRate} of 255</dd>
    <dt>Base EXP</dt><dd>${s.baseExp}</dd>
    <dt>Growth rate</dt><dd>${esc(s.growth.split('_').map(cap).join(' '))}</dd>
  </dl>
</div>
${G.DEX_TEXT && G.DEX_TEXT[sp] ? `<blockquote class="dex">${esc(G.DEX_TEXT[sp].replace(/\b[A-Z][A-Z_'.]{2,}\b/g, w => { const k = DEX.find(d => D.species[d].name === w || d === w); return k ? monName(k) : w; }))}</blockquote>` : ''}
<h2>Where to find ${esc(N)} in Pokémon Red</h2>
${f.length ? `<ul class="where">${f.slice().sort((a, b) => (b.p || 0) - (a.p || 0)).map(e => `<li>${howLine(e)}</li>`).join('')}</ul>` : `<p>${esc(where)}</p>`}
<h2>Base stats</h2>
${table(['Stat', 'Base', '', 'Rank'], [...STATS.map(([k, n]) => [n, s[k], bar(s[k]), '#' + rank(sp, k) + ' of 151']), ['<strong>Total</strong>', `<strong>${tot}</strong>`, '', '#' + rank(sp, 'total') + ' of 151']], 'stats')}
<p class="note">Generation I uses a single Special stat for both special attack and special defense.</p>
<h2>Evolution</h2>
<ol class="evo">${fam.map(([f2, d]) => `<li style="--d:${d}">${sprite(f2, 64, true)}<span>${monLink(f2)}${evoFrom[f2] ? ` <small>${esc(evoText(evoFrom[f2]))}</small>` : ''}</span></li>`).join('')}</ol>
<h2>Type effectiveness against ${esc(N)}</h2>
${table(['Damage taken', 'Types'], [['4× (double weakness)', four.map(typeBadge).join(' ') || '—'], ['2× (weak to)', weak.map(typeBadge).join(' ') || '—'], ['½× (resists)', resist.map(typeBadge).join(' ') || '—'],
  ['¼× (double resistance)', quarter.map(typeBadge).join(' ') || '—'], ['0× (immune)', immune.map(typeBadge).join(' ') || '—']])}
<h2>Moves learned by level up</h2>
${table(['Level', 'Move', 'Type', 'Power', 'Accuracy', 'PP'], learn.map(([lv, mv]) => { const m = D.moves[mv]; return [lv === 1 ? 'Start' : lv, moveLink(mv), typeBadge(m.type), m.power > 1 ? m.power : '—', m.acc + '%', m.pp]; }))}
<h2>TM and HM moves</h2>
${tms.length ? table(['TM/HM', 'Move', 'Type', 'Power'], tms.map(([no, mv]) => [no, moveLink(mv), typeBadge(D.moves[mv].type), D.moves[mv].power > 1 ? D.moves[mv].power : '—'])) : `<p>${esc(N)} can't learn any TMs or HMs.</p>`}
<nav class="pager">${i > 0 ? `<a href="/pokedex/${monSlug(DEX[i - 1])}/">← ${esc(monName(DEX[i - 1]))}</a>` : '<span></span>'}<a href="/pokedex/">All 151 Pokémon</a>${i < 150 ? `<a href="/pokedex/${monSlug(DEX[i + 1])}/">${esc(monName(DEX[i + 1]))} →</a>` : '<span></span>'}</nav>`;
    const firstWild = f.find(e => e.map && e.p);
    const faq = [
      [`Where do you find ${N} in Pokémon Red?`, where || `${N} is only available by evolving ${evoFrom[sp] ? monName(evoFrom[sp].from) : 'another POKéMON'}.`],
      [`What type is ${N}?`, `${N} is ${types.map(typeName).join('/')} type. It takes double damage from ${list([...four, ...weak].map(typeName)) || 'no types'}${immune.length ? ` and is immune to ${list(immune.map(typeName))}` : ''}.`],
      [next.length ? `What level does ${N} evolve?` : `Does ${N} evolve?`, next.length ? `${N} evolves into ${list(next.map(e => monName(e.to) + ' ' + evoText(e)), 'or')}.` : prev ? `${N} is the final form: it evolves from ${monName(prev.from)} ${evoText(prev)}.` : `No, ${N} doesn't evolve in Pokémon Red.`],
      [`What moves does ${N} learn?`, `${N} starts with ${list(s.moves1.map(moveName))}${s.learn.length ? ` and learns ${list(s.learn.map(([lv, mv]) => moveName(mv) + ' (Lv ' + lv + ')'))} by leveling up` : ''}. It can learn ${tms.length} TMs and HMs.`],
      [`What are ${N}'s base stats?`, `HP ${s.hp}, Attack ${s.atk}, Defense ${s.def}, Special ${s.spc}, Speed ${s.spd}, for a total of ${tot}.`],
    ];
    if (firstWild) faq.push([`What's the catch rate of ${N}?`, `${N}'s catch rate is ${s.catchRate} out of 255${s.catchRate >= 190 ? ', so it is easy to catch' : s.catchRate <= 45 ? ', so bring plenty of POKé BALLS and lower its HP first' : ''}.`]);
    const title = `${N} in Pokémon Red: Location, Evolution, Moves & Stats`;
    const desc = `${N} (${no}) in Pokémon Red: ${where.replace(/ \(.*?\)/g, '').slice(0, 90)} ${types.map(typeName).join('/')} type, base stats, level-up moves, TMs and evolution.`.replace(/\s+/g, ' ').slice(0, 158);
    write(`/pokedex/${monSlug(sp)}/`, shell({ path: `/pokedex/${monSlug(sp)}/`, title, description: desc, h1: `${N} (${no})`, crumbs: [['/pokedex/', 'Pokédex'], [`/pokedex/${monSlug(sp)}/`, N]], lead, body, faq, image: `/sprites/${monSlug(sp)}.png` }), 0.7);
    monIndex.push(sp);
  });
  write('/pokedex/', shell({ path: '/pokedex/', title: 'Pokémon Red Pokédex: All 151 Pokémon, Locations & Evolutions', description: 'The complete Pokémon Red Pokédex: all 151 Pokémon with where to find them, types, base stats, moves and evolutions, with pixel art drawn in code.',
    h1: 'Pokémon Red Pokédex: all 151 Pokémon', crumbs: [['/pokedex/', 'Pokédex']],
    lead: 'Every POKéMON in Pokémon Red, from BULBASAUR (#001) to MEW (#151): where to catch each one, its type, base stats, moves and evolutions. The sprites are drawn by code in <a href="/">Pokémon Claude Red</a>.',
    body: `<ul class="grid">${DEX.map(sp => `<li><a href="/pokedex/${monSlug(sp)}/">${sprite(sp, 96, true)}<span>#${String(D.species[sp].dex).padStart(3, '0')} ${esc(monName(sp))}</span><span class="types">${D.species[sp].types.filter((t, k, a) => a.indexOf(t) === k).map(typeName).join('/')}</span></a></li>`).join('')}</ul>` }), 0.9);

  // ================================================================ moves
  const EFFECT = { NO_ADDITIONAL: 'deals damage with no extra effect', TWO_TO_FIVE_ATTACKS: 'hits 2 to 5 times in one turn', PAY_DAY: 'scatters coins you pick up after the battle (2× the user\'s level per use)',
    BURN_SIDE1: 'has a 10% chance to burn', FREEZE_SIDE1: 'has a 10% chance to freeze', PARALYZE_SIDE1: 'has a 10% chance to paralyze', OHKO: 'knocks the target out in one hit if it lands (it fails against faster POKéMON)',
    CHARGE: 'charges on the first turn and strikes on the second', ATTACK_UP2: "sharply raises the user's Attack (+2)", SWITCH_AND_TELEPORT: 'ends wild battles (it fails against trainers)', FLY: 'flies up on the first turn (dodging almost everything) and strikes on the second',
    TRAPPING: 'traps the target for 2–5 turns, stopping it from attacking', FLINCH_SIDE2: 'has a 30% chance to make the target flinch', ATTACK_TWICE: 'hits twice in one turn', JUMP_KICK: 'hurts the user by 1 HP if it misses',
    ACCURACY_DOWN1: "lowers the target's accuracy", PARALYZE_SIDE2: 'has a 30% chance to paralyze', RECOIL: 'hurts the user with a quarter of the damage dealt', THRASH_PETAL_DANCE: 'attacks for 2–3 turns, then leaves the user confused',
    DEFENSE_DOWN1: "lowers the target's Defense", POISON_SIDE1: 'has a 20% chance to poison', TWINEEDLE: 'hits twice, each hit with a 20% chance to poison', FLINCH_SIDE1: 'has a 10% chance to make the target flinch',
    ATTACK_DOWN1: "lowers the target's Attack", SLEEP: 'puts the target to sleep', CONFUSION: 'confuses the target', SPECIAL_DAMAGE: 'deals fixed damage, ignoring types and stats', DISABLE: "disables the target's last move for a few turns",
    DEFENSE_DOWN_SIDE: "has a 33% chance to lower the target's Defense", MIST: "protects the user's stats from being lowered", CONFUSION_SIDE: 'has a 10% chance to confuse', SPEED_DOWN_SIDE: "has a 33% chance to lower the target's Speed",
    ATTACK_DOWN_SIDE: "has a 33% chance to lower the target's Attack", HYPER_BEAM: 'is very powerful, but the user must recharge next turn (not after a KO)', DRAIN_HP: 'restores half the damage dealt to the user',
    LEECH_SEED: 'saps 1/16 of the target\'s max HP every turn to heal the user (Grass types are immune)', SPECIAL_UP1: "raises the user's Special", POISON: 'poisons the target (TOXIC badly poisons it)', PARALYZE: 'paralyzes the target',
    SPEED_DOWN1: "lowers the target's Speed", SPECIAL_DOWN_SIDE: "has a 33% chance to lower the target's Special", ATTACK_UP1: "raises the user's Attack", SPEED_UP2: "sharply raises the user's Speed (+2)", RAGE: "keeps attacking, and the user's Attack rises each time it is hit",
    MIMIC: 'copies one of the target\'s moves for the rest of the battle', DEFENSE_DOWN2: "sharply lowers the target's Defense (−2)", EVASION_UP1: "raises the user's evasion", HEAL: 'restores the user\'s HP (REST heals fully and sleeps for 2 turns)',
    DEFENSE_UP1: "raises the user's Defense", DEFENSE_UP2: "sharply raises the user's Defense (+2)", LIGHT_SCREEN: 'halves special damage the user takes', HAZE: 'resets every stat change and status on both sides', REFLECT: 'halves physical damage the user takes',
    FOCUS_ENERGY: 'is meant to raise critical-hit odds (in Red it lowers them, a famous bug)', BIDE: 'stores the damage taken for 2–3 turns and returns it double', METRONOME: 'uses a random move', MIRROR_MOVE: 'uses the last move the target used',
    EXPLODE: 'deals huge damage but makes the user faint', POISON_SIDE2: 'has a 40% chance to poison', BURN_SIDE2: 'has a 30% chance to burn', SWIFT: 'never misses', SPECIAL_UP2: "sharply raises the user's Special (+2)",
    DREAM_EATER: 'only works on a sleeping target, and restores half the damage dealt', TRANSFORM: 'turns the user into a copy of the target', SPLASH: 'does nothing at all', CONVERSION: "changes the user's type to match the target's",
    SUPER_FANG: "cuts the target's HP in half", SUBSTITUTE: 'spends a quarter of the user\'s HP to make a decoy that takes hits' };
  const moveIds = D.moveList.filter(id => D.moves[id] && id !== 'STRUGGLE');
  for (const id of moveIds) {
    const m = D.moves[id], N = moveName(id), no = tmNum(id), cat = m.power > 0 && m.effect !== 'SPECIAL_DAMAGE' ? (PHYSICAL.has(m.type) ? 'Physical' : 'Special') : m.effect === 'SPECIAL_DAMAGE' ? 'Fixed damage' : 'Status';
    const lv = (levelLearners[id] || []).slice().sort((a, b) => a[1] - b[1]), tm = tmLearners[id] || [];
    const fx = EFFECT[m.effect] || 'has a special effect';
    const gen1 = D.moves[id].name !== N.toUpperCase() ? ` (written ${D.moves[id].name} in Red)` : '';
    const lead = `<strong>${esc(N)}</strong>${esc(gen1)} is a${/^[AEIOU]/.test(typeName(m.type)) ? 'n' : ''} ${typeName(m.type)}-type ${cat.toLowerCase()} move in Pokémon Red${m.power > 1 ? ` with ${m.power} power` : ''}, ${m.acc}% accuracy and ${m.pp} PP. It ${fx}.${no ? ` It is ${no}, so any compatible POKéMON can learn it from the disc.` : ''} ${lv.length ? `${lv.length} POKéMON learn it by leveling up` : 'No POKéMON learns it by leveling up'}${tm.length ? ` and ${tm.length} can learn it by ${no ? no.slice(0, 2) : 'TM'}` : ''}.`;
    const body = `
<dl class="facts wide"><dt>Type</dt><dd>${typeBadge(m.type)}</dd><dt>Category</dt><dd>${cat}</dd><dt>Power</dt><dd>${m.power > 1 ? m.power : '—'}</dd><dt>Accuracy</dt><dd>${m.acc}%</dd><dt>PP</dt><dd>${m.pp} (max ${Math.floor(m.pp * 1.6)} with PP Ups)</dd>${no ? `<dt>${no.slice(0, 2)}</dt><dd>${no}</dd>` : ''}<dt>Move No.</dt><dd>${m.num}</dd></dl>
<h2>What ${esc(N)} does</h2><p>${esc(N)} ${esc(fx)}.${cat === 'Physical' || cat === 'Special' ? ` In Generation I every ${typeName(m.type)}-type move is ${cat.toLowerCase()}, so its damage uses the user's ${cat === 'Physical' ? 'Attack against the target\'s Defense' : 'Special against the target\'s Special'}.` : ''}</p>
<h2>POKéMON that learn ${esc(N)} by level up</h2>
${lv.length ? table(['POKéMON', 'Level'], lv.map(([sp, l]) => [monLink(sp), l === 1 ? 'Start' : l])) : '<p>None: it can only be learned from a TM/HM or copied with MIMIC.</p>'}
${tm.length ? `<h2>POKéMON that learn ${esc(N)} by ${no}</h2><ul class="chips">${tm.map(sp => `<li>${monLink(sp)}</li>`).join('')}</ul>` : ''}`;
    const faq = [[`What does ${N} do in Pokémon Red?`, `${N} ${fx}. It is ${typeName(m.type)} type with ${m.power > 1 ? m.power + ' power, ' : ''}${m.acc}% accuracy and ${m.pp} PP.`],
      [`Which Pokémon learn ${N}?`, lv.length || tm.length ? `${lv.length ? `By level up: ${list(lv.slice(0, 8).map(([sp, l]) => monName(sp) + (l > 1 ? ' (Lv ' + l + ')' : '')))}${lv.length > 8 ? ' and more' : ''}.` : ''}${tm.length ? ` By ${no}: ${tm.length} POKéMON.` : ''}`.trim() : `No POKéMON learns ${N} normally.`]];
    if (no) faq.push([`Is ${N} a TM in Pokémon Red?`, `Yes, ${N} is ${no}.`]);
    write(`/moves/${moveSlug(id)}/`, shell({ path: `/moves/${moveSlug(id)}/`, title: `${N} in Pokémon Red: Effect, Power & Who Learns It`, description: `${N} in Pokémon Red: ${typeName(m.type)} type, ${m.power > 1 ? m.power + ' power, ' : ''}${m.acc}% accuracy, ${m.pp} PP. It ${fx}. Every Pokémon that learns it${no ? ' and how to get ' + no : ''}.`.slice(0, 158),
      h1: `${N}${no ? ' (' + no + ')' : ''}`, crumbs: [['/moves/', 'Moves'], [`/moves/${moveSlug(id)}/`, N]], lead, body, faq }), 0.5);
  }
  write('/moves/', shell({ path: '/moves/', title: 'Pokémon Red Move List: All 165 Moves with Power, Accuracy & PP', description: 'Every move in Pokémon Red: type, category, power, accuracy, PP, TM/HM numbers and effects, with the Pokémon that learn each one.',
    h1: 'Pokémon Red move list', crumbs: [['/moves/', 'Moves']], lead: 'All 165 moves in Pokémon Red. Tap a move to see exactly what it does and every POKéMON that learns it.',
    body: table(['Move', 'Type', 'Category', 'Power', 'Accuracy', 'PP', 'TM/HM'], moveIds.map(id => { const m = D.moves[id]; return [moveLink(id), typeBadge(m.type), m.power > 1 ? (PHYSICAL.has(m.type) ? 'Physical' : 'Special') : m.effect === 'SPECIAL_DAMAGE' ? 'Fixed' : 'Status', m.power > 1 ? m.power : '—', m.acc + '%', m.pp, tmNum(id) || '']; }), 'sortable') }), 0.8);

  const GYMS = [['BROCK', 'Pewter City', 'PewterCity', 'Rock', 'Boulder Badge', 'TM34 Bide', 'raises Attack and lets you use FLASH outside battle'],
    ['MISTY', 'Cerulean City', 'CeruleanCity', 'Water', 'Cascade Badge', 'TM11 Bubble Beam', 'lets you use CUT outside battle'], ['LT_SURGE', 'Vermilion City', 'VermilionCity', 'Electric', 'Thunder Badge', 'TM24 Thunderbolt', 'raises Speed and lets you use FLY outside battle'],
    ['ERIKA', 'Celadon City', 'CeladonCity', 'Grass', 'Rainbow Badge', 'TM21 Mega Drain', 'lets you use STRENGTH outside battle'], ['KOGA', 'Fuchsia City', 'FuchsiaCity', 'Poison', 'Soul Badge', 'TM06 Toxic', 'raises Defense and lets you use SURF outside battle'],
    ['SABRINA', 'Saffron City', 'SaffronCity', 'Psychic', 'Marsh Badge', 'TM46 Psywave', 'makes traded POKéMON up to level 70 obey you'], ['BLAINE', 'Cinnabar Island', 'CinnabarIsland', 'Fire', 'Volcano Badge', 'TM38 Fire Blast', 'raises Special'],
    ['GIOVANNI', 'Viridian City', 'ViridianCity', 'Ground', 'Earth Badge', 'TM27 Fissure', 'makes every POKéMON obey you']];
  const leaderName = cls => ({ LT_SURGE: 'Lt. Surge' })[cls] || cap(cls);
  // ================================================================ locations
  const connName = (n, dir) => { const c = M[n].conns && M[n].conns[dir]; return c ? c.map : null; };
  function wildSection(n, title) {
    const w = wildOf[n]; let out = '';
    if (w && w.grass.length) out += `<h3>${title || (/Cave|Tunnel|Moon|Seafoam|Victory|Tower|Mansion|Plant/.test(n) ? 'Wild POKéMON' : 'Tall grass')}</h3>` + table(['POKéMON', 'Levels', 'Chance'], w.grass.map(e => [`${sprite(e.sp, 32, true)} ${monLink(e.sp)}`, range(e.lo, e.hi), pct(e.p)]), 'wild');
    if (w && w.water.length) out += '<h3>Surfing</h3>' + table(['POKéMON', 'Levels', 'Chance'], w.water.map(e => [`${sprite(e.sp, 32, true)} ${monLink(e.sp)}`, range(e.lo, e.hi), pct(e.p)]), 'wild');
    if (superRod[n]) out += `<h3>Fishing</h3><p>Old Rod: ${monLink('MAGIKARP')} (Lv 5). Good Rod: ${monLink('GOLDEEN')} or ${monLink('POLIWAG')} (Lv 10). Super Rod: ${list(superRod[n].map(([lv, sp]) => monLink(sp) + ' (Lv ' + lv + ')'), 'or')}, each equally likely.</p>`;
    return out;
  }
  function trainerSection(n) {
    const t = trainersOn(n); if (!t.length) return '';
    return `<h3>Trainers</h3>` + table(['Trainer', 'Team', 'Prize'], t.map(x => [esc(clsName(x.cls)), x.party.map(([lv, sp]) => `${monLink(sp)} Lv ${lv}`).join(', '), '₽' + ((D.trainerClasses[x.cls] || {}).money || 0) / 100 * Math.max(...x.party.map(p => p[0]))]));
  }
  function itemSection(n) { const it = itemsOn(n); if (!it.length) return ''; return `<h3>Items</h3><ul class="chips">${it.map(x => `<li>${esc(itemName(x.id))}${x.hidden ? ' <small>(hidden)</small>' : ''}</li>`).join('')}</ul>`; }
  const TOWN_INFO = { PalletTown: ["your quiet hometown, with your house, your rival's house and Professor Oak's lab", null], ViridianCity: ['the city with the old man\'s catching lesson and, at the end of your journey, the eighth gym', 'GIOVANNI'],
    PewterCity: ["the stone-grey city with Brock's gym and the Pewter Museum of Science", 'BROCK'], CeruleanCity: ["the city of Misty's gym, the Bike Shop and the way to Bill's cottage", 'MISTY'], VermilionCity: ["the port city with Lt. Surge's gym, the POKéMON Fan Club and the S.S. Anne dock", 'LT_SURGE'],
    LavenderTown: ['the small town of the POKéMON Tower and Mr. Fuji\'s house', null], CeladonCity: ["the big city of Erika's gym, the Celadon Dept. Store and the Game Corner", 'ERIKA'], FuchsiaCity: ["the city of Koga's gym and the Safari Zone", 'KOGA'],
    SaffronCity: ["the city at the center of Kanto with Sabrina's gym, the Fighting Dojo and Silph Co.", 'SABRINA'], CinnabarIsland: ["the volcanic island with Blaine's gym, the POKéMON Mansion and the Cinnabar Lab", 'BLAINE'], IndigoPlateau: ['the home of the POKéMON League, where the Elite Four wait', null] };
  const locIndex = [];
  function locationPage(slug, name, maps, blurb) {
    const town = TOWN_INFO[maps[0]]; if (town && !blurb) blurb = town[0];
    const p = `/locations/${slug}/`, main = maps[0], floors = maps.length > 1;
    const allWild = maps.flatMap(n => { const w = wildOf[n]; return w ? [...w.grass, ...w.water] : []; });
    const species = [...new Set(allWild.map(e => e.sp))];
    const trainers = maps.flatMap(trainersOn), items = maps.flatMap(itemsOn);
    const conns = !floors ? ['north', 'south', 'east', 'west'].map(d => [d, connName(main, d)]).filter(x => x[1]) : [];
    const specials = SPECIAL.filter(s => maps.includes(s[1]));
    const img = renderMap(main);
    const mart = TOWNS.includes(main) ? martOf(main) : null;
    const lvls = allWild.length ? [Math.min(...allWild.map(e => e.lo)), Math.max(...allWild.map(e => e.hi))] : null;
    const lead = `<strong>${esc(name)}</strong> ${blurb ? 'is ' + esc(blurb) : ''}${conns.length ? `${blurb ? '. It' : 'connects'} ${blurb ? 'connects ' : ''}${list(conns.map(([d, m]) => locName(m) + ' to the ' + d))}` : ''}${blurb || conns.length ? '.' : ''} ${species.length ? `Wild POKéMON here: ${list(species.map(monName))} (${range(lvls[0], lvls[1])}).` : 'There are no wild POKéMON here.'}${trainers.length ? ` ${trainers.length} trainer${trainers.length > 1 ? 's' : ''} battle you here.` : ''}${specials.length ? ` Special: ${list(specials.map(s => monName(s[0]) + ' (Lv ' + s[3] + ')'))}.` : ''}`;
    const k = img && img.h * 2 <= 1600 ? 2 : 1; // crisp 2x unless the map is very tall (CYCLING ROAD)
    let body = img ? `<figure class="map"><img class="px" src="${img.src}" alt="Map of ${esc(locName(main))} in Pokémon Claude Red" width="${img.w}" height="${img.h}" style="width:${img.w * k}px" loading="lazy"><figcaption>${esc(locName(main))}, rendered by the game's own code</figcaption></figure>` : '';
    if (specials.length) body += `<h2>Special POKéMON</h2><ul class="where">${specials.map(([sp, , how, lv, note]) => `<li>${monLink(sp)} (Lv ${lv}): ${esc(note)}.</li>`).join('')}</ul>`;
    for (const n of maps) {
      const sec = wildSection(n) + trainerSection(n) + itemSection(n);
      if (!sec) continue;
      body += floors ? `<h2>${esc(locName(n))}</h2>${sec}` : `<h2>POKéMON, trainers and items</h2>${sec}`;
    }
    if (town && town[1]) body += `<h2>Gym</h2><p><a href="/gym-leaders/${town[1].toLowerCase().replace('_', '-')}/">${esc(leaderName(town[1]))}'s gym</a>: ${esc(GYMS.find(x => x[0] === town[1])[3])} type, ${esc(GYMS.find(x => x[0] === town[1])[4])}.</p>`;
    if (maps[0] === 'IndigoPlateau') body += '<h2>POKéMON League</h2><p>Face <a href="/elite-four/">the Elite Four and the Champion</a> inside.</p>';
    if (mart) body += `<h2>POKé MART</h2><ul class="chips">${mart.map(id => `<li>${esc(itemName(id))} <small>₽${(D.items[id] || {}).price || '?'}</small></li>`).join('')}</ul>`;
    if (conns.length) body += `<h2>Getting there</h2><ul>${conns.map(([d, m]) => `<li>${cap(d)}: ${locLink(m)}</li>`).join('')}</ul>`;
    const faq = [];
    const on = /^Route/.test(main) ? 'on' : 'in';
    if (species.length) faq.push([`What Pokémon are ${on} ${name} in Pokémon Red?`, `${list(species.map(monName))}, at ${range(lvls[0], lvls[1])}.`]);
    if (species.length) { const rare = allWild.slice().sort((a, b) => a.p - b.p)[0]; faq.push([`What is the rarest Pokémon ${on} ${name}?`, `${monName(rare.sp)}, at ${pct(rare.p)} of encounters${floors ? ' on its floor' : ''}.`]); }
    if (trainers.length) faq.push([`How many trainers are in ${name}?`, `${trainers.length}, the strongest with a Lv ${Math.max(...trainers.flatMap(t => t.party.map(p => p[0])))} POKéMON.`]);
    if (items.length) faq.push([`What items are in ${name}?`, `${list([...new Set(items.map(x => itemName(x.id)))])}${items.some(x => x.hidden) ? ' (some are hidden: press A facing the spot)' : ''}.`]);
    if (mart) faq.push([`What does the ${name} Poké Mart sell?`, list(mart.map(itemName)) + '.']);
    const title = `${name} in Pokémon Red: ${species.length ? 'Wild Pokémon, ' : ''}Trainers, Items${img ? ' & Map' : ''}`;
    const desc = (species.length ? `${name} in Pokémon Red: wild Pokémon (${list(species.slice(0, 4).map(monName))}${species.length > 4 ? '…' : ''}) with levels and encounter rates, trainers, items${mart ? ', mart' : ''} and a full map.`
      : `${name} in Pokémon Red: ${blurb || 'trainers and items'}. ${town && town[1] ? 'Gym leader, ' : ''}${trainers.length ? trainers.length + ' trainers, ' : ''}items${mart ? ', Poké Mart' : ''} and a full map.`).replace(/\s+/g, ' ').slice(0, 158);
    write(p, shell({ path: p, title, description: desc, h1: `${name}`, crumbs: [['/locations/', 'Locations'], [p, name]], lead, body, faq, image: img ? img.src : null }), 0.6);
    locIndex.push([slug, name, species.length, main]);
  }
  for (const n of [...TOWNS, ...ROUTES]) if (M[n]) locationPage(locSlug(n), pretty(n), [n], TOWNS.includes(n) ? null : null);
  for (const [slug, name, re, blurb] of AREAS) { const maps = Object.keys(M).filter(n => re.test(n)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })); if (maps.length) locationPage(slug, name, maps, blurb); }
  write('/locations/', shell({ path: '/locations/', title: 'Pokémon Red Locations: Every Route, Town & Dungeon (Wild Pokémon & Maps)', description: 'Every location in Pokémon Red: wild Pokémon with levels and encounter rates, trainers, items, Poké Marts and maps for all 25 routes, 11 towns and every dungeon.',
    h1: 'Pokémon Red locations', crumbs: [['/locations/', 'Locations']], lead: 'Every town, route and dungeon in Kanto: what you can catch there and how often, the trainers you will battle, the items on the ground and a map drawn by the game.',
    body: ['Towns and cities', 'Routes', 'Caves, buildings and dungeons'].map((h, k) => `<h2>${h}</h2><ul class="cols">${locIndex.filter(([, , , main]) => k === 0 ? TOWNS.includes(main) : k === 1 ? ROUTES.includes(main) : !TOWNS.includes(main) && !ROUTES.includes(main)).map(([slug, name, n]) => `<li><a href="/locations/${slug}/">${esc(name)}</a>${n ? ` <small>${n} POKéMON</small>` : ''}</li>`).join('')}</ul>`).join('') }), 0.8);

  // ================================================================ types
  for (const t of TYPES) {
    const T = typeName(t), p = `/types/${typeSlug(t)}/`;
    const sEff = TYPES.filter(d => eff(t, [d]) > 1), nve = TYPES.filter(d => eff(t, [d]) < 1 && eff(t, [d]) > 0), none = TYPES.filter(d => eff(t, [d]) === 0);
    const weakTo = TYPES.filter(a => eff(a, [t]) > 1), resists = TYPES.filter(a => eff(a, [t]) < 1 && eff(a, [t]) > 0), immuneTo = TYPES.filter(a => eff(a, [t]) === 0);
    const mons = DEX.filter(sp => D.species[sp].types.includes(t)), moves = moveIds.filter(id => D.moves[id].type === t).sort((a, b) => D.moves[b].power - D.moves[a].power);
    const lead = `<strong>${T}</strong> is one of the 15 types in Pokémon Red. ${T} moves are ${PHYSICAL.has(t) ? 'physical (they use Attack and Defense)' : 'special (they use the Special stat)'} and are super effective against ${list(sEff.map(typeName)) || 'no types'}. ${T}-type POKéMON are weak to ${list(weakTo.map(typeName)) || 'nothing'}. There are ${mons.length} ${T}-type POKéMON and ${moves.length} ${T}-type moves.`;
    const body = `<h2>${T} attacking</h2>${table(['Effect', 'Against'], [['Super effective (2×)', sEff.map(typeBadge).join(' ') || '—'], ['Not very effective (½×)', nve.map(typeBadge).join(' ') || '—'], ['No effect (0×)', none.map(typeBadge).join(' ') || '—']])}
<h2>${T} defending</h2>${table(['Effect', 'From'], [['Weak to (2×)', weakTo.map(typeBadge).join(' ') || '—'], ['Resists (½×)', resists.map(typeBadge).join(' ') || '—'], ['Immune (0×)', immuneTo.map(typeBadge).join(' ') || '—']])}
${t === 'GHOST' ? '<p class="note">A famous Generation I bug: Ghost moves have no effect on Psychic POKéMON (they were meant to be super effective), and the only damaging Ghost moves are LICK and NIGHT SHADE.</p>' : ''}${t === 'PSYCHIC_TYPE' ? '<p class="note">Psychic is the strongest type in Generation I: its only weakness is Bug, and Ghost moves (which should hit it hard) have no effect because of a bug.</p>' : ''}
<h2>${T}-type POKéMON</h2><ul class="grid small">${mons.map(sp => `<li><a href="/pokedex/${monSlug(sp)}/">${sprite(sp, 64, true)}<span>${esc(monName(sp))}</span></a></li>`).join('')}</ul>
<h2>${T}-type moves</h2>${table(['Move', 'Power', 'Accuracy', 'PP', 'TM/HM'], moves.map(id => [moveLink(id), D.moves[id].power > 1 ? D.moves[id].power : '—', D.moves[id].acc + '%', D.moves[id].pp, tmNum(id) || '']))}`;
    const faq = [[`What is ${T} weak to in Pokémon Red?`, `${T}-type POKéMON take double damage from ${list(weakTo.map(typeName)) || 'no types'}.`], [`What is ${T} strong against in Pokémon Red?`, `${T} moves are super effective against ${list(sEff.map(typeName)) || 'no types'}.`],
      [`What is the strongest ${T} move in Pokémon Red?`, moves.length ? `${moveName(moves[0])}, with ${D.moves[moves[0]].power} power.` : 'There are no damaging moves of this type.']];
    write(p, shell({ path: p, title: `${T} Type in Pokémon Red: Weaknesses, Pokémon & Moves`, description: `${T} type in Pokémon Red (Gen 1): super effective against ${list(sEff.map(typeName)) || 'nothing'}, weak to ${list(weakTo.map(typeName)) || 'nothing'}. All ${T} Pokémon and moves.`.slice(0, 158), h1: `${T} type`, crumbs: [['/types/', 'Types'], [p, T]], lead, body, faq }), 0.6);
  }
  write('/types/', shell({ path: '/types/', title: 'Pokémon Red Type Chart (Gen 1): Strengths & Weaknesses of All 15 Types', description: 'The Generation I type chart used by Pokémon Red and Blue, including the Ghost/Psychic bug: which types are super effective, not very effective or have no effect.',
    h1: 'Pokémon Red type chart', crumbs: [['/types/', 'Types']], lead: 'The 15 types in Pokémon Red and how they match up. Rows are the attacking type, columns the defending type. Generation I has quirks later games fixed: Ghost moves do nothing to Psychic POKéMON, Bug and Poison are super effective against each other, and Ice is only normal damage against Fire.',
    body: `<div class="tw"><table class="chart"><thead><tr><th>Atk ↓ / Def →</th>${TYPES.map(d => `<th><a href="/types/${typeSlug(d)}/" title="${typeName(d)}">${typeName(d).slice(0, 3)}</a></th>`).join('')}</tr></thead><tbody>${TYPES.map(a => `<tr><th>${typeBadge(a)}</th>${TYPES.map(d => { const m = eff(a, [d]); return `<td class="m${String(m).replace('.', '')}">${m === 1 ? '' : m === 0.5 ? '½' : m}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>
<ul class="chips">${TYPES.map(t => `<li>${typeBadge(t)}</li>`).join('')}</ul>`,
    faq: [['What type is strongest in Pokémon Red?', 'Psychic: its only weakness is Bug, the Bug moves in Generation I are weak, and a bug makes Ghost moves (which should beat it) do nothing.'], ['Does Ghost beat Psychic in Pokémon Red?', 'No. It was meant to, but in Generation I Ghost-type moves have no effect on Psychic POKéMON because of a programming bug.']] }), 0.8);

  // ================================================================ gym leaders, Elite Four and Champion
  const teamOf = (cls, n) => { const party = partyOf(cls, n); return party.map(([lv, sp]) => { const m = new G.Mon(sp, lv, { dvs: { atk: 9, def: 8, spd: 8, spc: 8 } }); return { sp, lv, moves: m.moves.map(x => x.id) }; }); };
  const counters = team => { const score = TYPES.map(t => [t, team.reduce((a, x) => a + (eff(t, D.species[x.sp].types) > 1 ? 1 : 0) - (eff(t, D.species[x.sp].types) < 1 ? 0.5 : 0), 0)]).sort((a, b) => b[1] - a[1]); return score.filter(s => s[1] > 0).slice(0, 3).map(s => s[0]); };
  const teamTable = team => table(['POKéMON', 'Level', 'Type', 'Moves'], team.map(x => [`${sprite(x.sp, 32, true)} ${monLink(x.sp)}`, x.lv, D.species[x.sp].types.filter((t, k, a) => a.indexOf(t) === k).map(typeBadge).join(' '), x.moves.map(moveLink).join(', ')]), 'wild');
  const gymIndex = [];
  GYMS.forEach(([cls, city, cityMap, spec, badge, tm, perk], k) => {
    const n = cls === 'GIOVANNI' ? 3 : 1, team = teamOf(cls, n), N = leaderName(cls), p = `/gym-leaders/${cls.toLowerCase().replace('_', '-')}/`, top = Math.max(...team.map(x => x.lv)), best = counters(team);
    const lead = `<strong>${N}</strong> is the ${['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'][k]} gym leader in Pokémon Red, in ${city}. ${N} uses ${spec}-type POKéMON: ${list(team.map(x => monName(x.sp) + ' (Lv ' + x.lv + ')'))}. Beat ${N} for the ${badge}, which ${perk}, and ${tm}. Best counters: ${list(best.map(typeName)) || 'a strong, balanced team'} moves.`;
    const body = `<h2>${N}'s team</h2>${teamTable(team)}
<h2>How to beat ${N}</h2><p>${esc(N)}'s strongest POKéMON is level ${top}, so aim for a team around level ${top + 2}–${top + 5}. ${best.length ? `${list(best.map(typeName))} moves are super effective against most of the team.` : ''} ${team.map(x => { const w = TYPES.filter(t => eff(t, D.species[x.sp].types) > 1); return `${monName(x.sp)} is weak to ${list(w.map(typeName)) || 'nothing'}.`; }).join(' ')}</p>
<h2>Rewards</h2><ul><li><strong>${badge}</strong>: ${perk}.</li><li><strong>${tm}</strong>.</li></ul>
<p>${k > 0 ? `Previous gym: <a href="/gym-leaders/${GYMS[k - 1][0].toLowerCase().replace('_', '-')}/">${leaderName(GYMS[k - 1][0])}</a>. ` : ''}${k < 7 ? `Next gym: <a href="/gym-leaders/${GYMS[k + 1][0].toLowerCase().replace('_', '-')}/">${leaderName(GYMS[k + 1][0])}</a>.` : 'Next: <a href="/elite-four/">the Elite Four</a>.'} The gym is in ${locLink(cityMap)}.</p>`;
    const faq = [[`What level is ${N} in Pokémon Red?`, `${N}'s POKéMON are level ${Math.min(...team.map(x => x.lv))} to ${top}.`], [`What type is ${N}'s gym?`, `${spec}. ${N} uses ${list(team.map(x => monName(x.sp)))}.`], [`How do you beat ${N}?`, `Use ${list(best.map(typeName)) || 'strong'} moves and bring POKéMON around level ${top + 3}.`], [`What do you get for beating ${N}?`, `The ${badge} (${perk}) and ${tm}.`]];
    write(p, shell({ path: p, title: `How to Beat ${N} in Pokémon Red: Team, Levels & Best Counters`, description: `${N}, ${city} gym leader in Pokémon Red: ${spec}-type team (${list(team.map(x => monName(x.sp) + ' Lv ' + x.lv))}), weaknesses, best counters and the ${badge}.`.slice(0, 158), h1: `${N}, ${city} Gym`, crumbs: [['/gym-leaders/', 'Gym leaders'], [p, N]], lead, body, faq }), 0.7);
    gymIndex.push([p, N, city, spec, badge, top]);
  });
  write('/gym-leaders/', shell({ path: '/gym-leaders/', title: 'Pokémon Red Gym Leaders: Order, Teams, Levels & Badges', description: 'All 8 Pokémon Red gym leaders in order, Brock to Giovanni: their types, teams, levels, badges and TM rewards, plus how to beat each one.',
    h1: 'Pokémon Red gym leaders in order', crumbs: [['/gym-leaders/', 'Gym leaders']], lead: 'The eight gym leaders of Kanto in the order you face them, with each leader\'s type, strongest POKéMON and badge.',
    body: table(['#', 'Leader', 'City', 'Type', 'Top level', 'Badge'], gymIndex.map(([p, N, c, t, b, top], i) => [i + 1, `<a href="${p}">${esc(N)}</a>`, esc(c), esc(t), top, esc(b)])) + '<p>After the eighth badge, take Route 23 and Victory Road to <a href="/elite-four/">the Elite Four</a>.</p>',
    faq: [['What order are the gym leaders in Pokémon Red?', gymIndex.map(g => g[1] + ' (' + g[2] + ')').join(', ') + '.'], ['Who is the hardest gym leader in Pokémon Red?', 'Many players find Misty (Starmie) or Sabrina (Alakazam) hardest for their level, and Giovanni has the highest levels.']] }), 0.8);
  const E4 = [['LORELEI', 'Ice'], ['BRUNO', 'Fighting'], ['AGATHA', 'Ghost'], ['LANCE', 'Dragon']];
  const e4Rows = [];
  E4.forEach(([cls, spec], k) => {
    const team = teamOf(cls, 1), N = cap(cls), p = `/elite-four/${cls.toLowerCase()}/`, top = Math.max(...team.map(x => x.lv)), best = counters(team);
    const lead = `<strong>${N}</strong> is the ${['first', 'second', 'third', 'fourth'][k]} member of the Elite Four in Pokémon Red and uses ${spec}-type POKéMON: ${list(team.map(x => monName(x.sp) + ' (Lv ' + x.lv + ')'))}. Best counters: ${list(best.map(typeName))} moves.`;
    write(p, shell({ path: p, title: `How to Beat ${N} in Pokémon Red (Elite Four): Team & Counters`, description: `${N} of the Pokémon Red Elite Four: ${spec} team (${list(team.map(x => monName(x.sp) + ' Lv ' + x.lv))}), movesets and best counters.`.slice(0, 158),
      h1: `${N}, Elite Four`, crumbs: [['/elite-four/', 'Elite Four'], [p, N]], lead, body: `<h2>${N}'s team</h2>${teamTable(team)}<h2>How to beat ${N}</h2><p>${team.map(x => `${monName(x.sp)} is weak to ${list(TYPES.filter(t => eff(t, D.species[x.sp].types) > 1).map(typeName)) || 'nothing in particular'}.`).join(' ')} Bring POKéMON around level ${top + 3} and stock up on Full Restores: there's no healing between the Elite Four battles.</p>`,
      faq: [[`What level is ${N}?`, `${N}'s POKéMON are level ${Math.min(...team.map(x => x.lv))} to ${top}.`], [`What is ${N} weak to?`, `${list(best.map(typeName))} moves hit most of ${N}'s team super effectively.`]] }), 0.6);
    e4Rows.push([`<a href="${p}">${N}</a>`, spec, top]);
  });
  const champ = ['BULBASAUR', 'CHARMANDER', 'SQUIRTLE'].map((st, k) => [st, teamOf('RIVAL3', k + 1)]);
  write('/elite-four/champion/', shell({ path: '/elite-four/champion/', title: 'Champion Rival Battle in Pokémon Red: Teams for Every Starter', description: "Your rival's Champion team in Pokémon Red for each starter you picked (Bulbasaur, Charmander, Squirtle), with levels, moves and how to win.",
    h1: 'The Champion: your rival', crumbs: [['/elite-four/', 'Elite Four'], ['/elite-four/champion/', 'Champion']], lead: 'After the Elite Four, your rival is already the Champion. His team depends on the starter you chose in Professor Oak\'s lab: he always takes the one that beats yours.',
    body: champ.map(([st, team]) => `<h2>If you chose ${monName(st)}</h2>${teamTable(team)}`).join(''), faq: [['What level is the Champion in Pokémon Red?', `Your rival's team is level ${Math.min(...champ[0][1].map(x => x.lv))} to ${Math.max(...champ[0][1].map(x => x.lv))}.`], ["Who is the Champion in Pokémon Red?", 'Your rival (BLUE by default), who beat the Elite Four just before you.']] }), 0.6);
  write('/elite-four/', shell({ path: '/elite-four/', title: 'Pokémon Red Elite Four: Lorelei, Bruno, Agatha, Lance & the Champion', description: 'The Pokémon Red Elite Four in order with teams, levels and counters: Lorelei, Bruno, Agatha, Lance and your rival as Champion.',
    h1: 'The Elite Four in Pokémon Red', crumbs: [['/elite-four/', 'Elite Four']], lead: 'The Elite Four wait at the Indigo Plateau after Victory Road. You battle all four in a row, then the Champion, with no chance to heal at a POKéMON CENTER in between.',
    body: table(['Order', 'Trainer', 'Type', 'Top level'], [...e4Rows.map((r, i) => [i + 1, ...r]), [5, '<a href="/elite-four/champion/">Champion (your rival)</a>', 'Mixed', Math.max(...champ[0][1].map(x => x.lv))]]) }), 0.7);

  // ================================================================ TMs, evolutions
  const tmRows = [...TM_LIST.map((mv, i) => ['TM' + String(i + 1).padStart(2, '0'), mv]), ...D.hmMoves.map((mv, i) => ['HM' + String(i + 1).padStart(2, '0'), mv])];
  const tmWhere = {}; for (const n of Object.keys(M)) for (const it of itemsOn(n)) { const m = /^TM_(.+)$/.exec(it.id); if (m) { const mv = m[1] === 'PSYCHIC' ? 'PSYCHIC_M' : m[1]; (tmWhere[mv] = tmWhere[mv] || []).push(locName(n)); } }
  for (const [, , , , , tmr] of GYMS) { const mv = TM_LIST[+tmr.slice(2, 4) - 1]; (tmWhere[mv] = tmWhere[mv] || []).push('gym reward'); }
  for (const k of Object.keys(D.marts)) for (const id of D.marts[k]) { const m = /^TM_(.+)$/.exec(id); if (m) (tmWhere[m[1]] = tmWhere[m[1]] || []).push('Celadon Dept. Store'); }
  write('/tms/', shell({ path: '/tms/', title: 'Pokémon Red TM and HM List: All 50 TMs and 5 HMs', description: 'Every TM and HM in Pokémon Red, with the move, type, power, accuracy, where to find it and how many Pokémon can learn it.',
    h1: 'Pokémon Red TMs and HMs', crumbs: [['/tms/', 'TMs & HMs']], lead: 'All 50 TMs and 5 HMs in Pokémon Red. TMs are single-use in Generation I, so pick carefully who learns them; HMs can be used as often as you like and are needed to get around Kanto.',
    body: table(['No.', 'Move', 'Type', 'Power', 'Acc.', 'Found at', 'Learners'], tmRows.map(([no, mv]) => [no, moveLink(mv), typeBadge(D.moves[mv].type), D.moves[mv].power > 1 ? D.moves[mv].power : '—', D.moves[mv].acc + '%', esc([...new Set(tmWhere[mv] || [])].join(', ')), (tmLearners[mv] || []).length])),
    faq: [['Are TMs reusable in Pokémon Red?', 'No. In Generation I each TM can be used once; HMs can be reused.'], ['Where do you get HM01 Cut in Pokémon Red?', "From the captain of the S.S. Anne in Vermilion City (rub his back when he's seasick)."]] }), 0.8);
  const fams = []; const seen = new Set();
  for (const sp of DEX) { let root = sp; while (evoFrom[root]) root = evoFrom[root].from; if (seen.has(root) || !(D.species[root].evos || []).length) continue; seen.add(root); fams.push(family(root)); }
  write('/evolutions/', shell({ path: '/evolutions/', title: 'Pokémon Red Evolution Chart: Levels, Stones & Trade Evolutions', description: 'Every evolution in Pokémon Red: the level each Pokémon evolves, which evolution stone to use, and which Pokémon evolve by trading.',
    h1: 'Pokémon Red evolution chart', crumbs: [['/evolutions/', 'Evolutions']], lead: 'How every POKéMON evolves in Pokémon Red: by level, with a Fire, Water, Thunder, Leaf or Moon Stone, or by trading. Trade evolutions work in <a href="/">Pokémon Claude Red</a> too: trade with another player in the Social Zone.',
    body: `<ul class="families">${fams.map(f => `<li>${f.map(([sp, d]) => `${d ? `<span class="arrow">${esc(evoText(evoFrom[sp]))} →</span>` : ''}<a href="/pokedex/${monSlug(sp)}/">${sprite(sp, 48, true)}<span>${esc(monName(sp))}</span></a>`).join('')}</li>`).join('')}</ul>`,
    faq: [['Which Pokémon evolve by trading in Pokémon Red?', 'Kadabra (into Alakazam), Machoke (Machamp), Graveler (Golem) and Haunter (Gengar).'], ['What level does Charmander evolve in Pokémon Red?', 'Charmander evolves into Charmeleon at level 16, and Charmeleon into Charizard at level 36.']] }), 0.8);

  // ================================================================ items: where to find them
  const ITEM_DESC = {
    RARE_CANDY: 'raises a POKéMON\'s level by one', PP_UP: 'raises the maximum PP of one move by a fifth (up to three times)', HP_UP: 'raises a POKéMON\'s HP stat experience', PROTEIN: 'raises a POKéMON\'s Attack stat experience',
    IRON: 'raises a POKéMON\'s Defense stat experience', CARBOS: 'raises a POKéMON\'s Speed stat experience', CALCIUM: 'raises a POKéMON\'s Special stat experience', MOON_STONE: 'evolves Nidorina, Nidorino, Clefairy, Jigglypuff and more',
    FIRE_STONE: 'evolves Vulpix, Growlithe and Eevee (into Flareon)', WATER_STONE: 'evolves Poliwhirl, Shellder, Staryu and Eevee (into Vaporeon)', THUNDER_STONE: 'evolves Pikachu and Eevee (into Jolteon)', LEAF_STONE: 'evolves Gloom, Weepinbell and Exeggcute',
    NUGGET: 'is worth ₽5,000 when you sell it', MAX_REVIVE: 'revives a fainted POKéMON with full HP', REVIVE: 'revives a fainted POKéMON with half its HP', MAX_POTION: 'fully restores one POKéMON\'s HP', FULL_RESTORE: 'fully restores HP and cures any status problem',
    HYPER_POTION: 'restores 200 HP', SUPER_POTION: 'restores 50 HP', POTION: 'restores 20 HP', MAX_ELIXER: 'fully restores the PP of every move', ELIXER: 'restores 10 PP to every move', MAX_ETHER: 'fully restores the PP of one move', ETHER: 'restores 10 PP to one move',
    FULL_HEAL: 'cures any status problem', ESCAPE_ROPE: 'takes you back to the entrance of a cave or dungeon', MAX_REPEL: 'keeps weak wild POKéMON away for 250 steps', SUPER_REPEL: 'keeps weak wild POKéMON away for 200 steps', REPEL: 'keeps weak wild POKéMON away for 100 steps',
    ULTRA_BALL: 'catches POKéMON better than a Great Ball', GREAT_BALL: 'catches POKéMON better than a Poké Ball', POKE_BALL: 'catches wild POKéMON', MASTER_BALL: 'catches any wild POKéMON without fail', X_ACCURACY: 'raises accuracy in battle (and makes one-hit KO moves hit)',
    X_ATTACK: 'raises Attack in battle', X_DEFEND: 'raises Defense in battle', X_SPEED: 'raises Speed in battle', X_SPECIAL: 'raises Special in battle', DIRE_HIT: 'raises the critical-hit ratio in battle', GUARD_SPEC: 'stops your stats being lowered in battle',
    ANTIDOTE: 'cures poison', AWAKENING: 'wakes a sleeping POKéMON', BURN_HEAL: 'cures a burn', ICE_HEAL: 'thaws a frozen POKéMON', PARLYZ_HEAL: 'cures paralysis', POKE_DOLL: 'lets you escape any wild battle',
  };
  const itemPlaces = {};
  for (const n of Object.keys(M)) for (const it of itemsOn(n)) (itemPlaces[it.id] = itemPlaces[it.id] || []).push([n, it.hidden]);
  const itemShops = {}; for (const [k, l] of Object.entries(D.marts)) for (const id of l) (itemShops[id] = itemShops[id] || []).push(k.replace(/MartClerk\d?Text|Clerk\d?Text|LobbyClerkText/, '').replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace('Celadon Mart', 'Celadon Dept. Store').replace(/ (\d)F/, ' $1F').replace('Indigo Plateau', 'Indigo Plateau'));
  const itemSlug = id => itemName(id).toLowerCase().replace(/é/g, 'e').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const itemRows = [];
  for (const id of Object.keys(ITEM_DESC)) {
    const places = itemPlaces[id] || [], shops = [...new Set(itemShops[id] || [])];
    if (!places.length && !shops.length) continue;
    const N = itemName(id), p = `/items/${itemSlug(id)}/`, price = (D.items[id] || {}).price;
    const where = [...new Set(places.map(([n]) => locName(n)))];
    const lead = `The <strong>${esc(N)}</strong> ${esc(ITEM_DESC[id])}. In Pokémon Red ${places.length ? `you can find ${places.length === 1 ? 'one' : places.length} on the ground (${places.filter(x => x[1]).length} of them hidden) in ${list(where.slice(0, 6))}${where.length > 6 ? ' and more' : ''}` : 'it isn\'t found on the ground'}${shops.length ? `${places.length ? ', and' : ', but'} it's sold at ${list(shops.slice(0, 5))}${price ? ` for ₽${price.toLocaleString('en-US')}` : ''}` : ''}.`;
    const body = (places.length ? '<h2>Where to find it</h2>' + table(['Location', ''], places.map(([n, hid]) => [locLink(n), hid ? 'Hidden: face the spot and press A (or use the Itemfinder)' : 'On the ground'])) : '') +
      (shops.length ? `<h2>Where to buy it</h2><ul>${shops.map(x => `<li>${esc(x)}${price ? ` (₽${price.toLocaleString('en-US')})` : ''}</li>`).join('')}</ul>` : '');
    const faq = [[`Where do you find ${N} in Pokémon Red?`, strip(lead.replace(/^The <strong>[^<]*<\/strong> [^.]*\. /, ''))], [`What does ${N} do in Pokémon Red?`, `It ${ITEM_DESC[id]}.`]];
    write(p, shell({ path: p, title: `${N} in Pokémon Red: Every Location${shops.length ? ' & Where to Buy' : ''}`, description: `Every ${N} in Pokémon Red: ${places.length ? places.length + ' found on the ground' + (places.some(x => x[1]) ? ' (including hidden ones)' : '') : 'where to buy it'}${shops.length && places.length ? ' plus shops' : ''}. The ${N} ${ITEM_DESC[id]}.`.slice(0, 158),
      h1: `${N} locations in Pokémon Red`, crumbs: [['/items/', 'Items'], [p, N]], lead, body, faq }), 0.5);
    itemRows.push([`<a href="${p}">${esc(N)}</a>`, places.length, shops.length ? 'Yes' : '—']);
  }
  write('/items/', shell({ path: '/items/', title: 'Pokémon Red Item Locations: Rare Candy, Stones, Nuggets & More', description: 'Where to find every useful item in Pokémon Red: Rare Candy, PP Up, vitamins, evolution stones, Nuggets and Max Revives, including hidden items and shops.',
    h1: 'Pokémon Red item locations', crumbs: [['/items/', 'Items']], lead: 'Where to find the items worth hunting for in Pokémon Red, from Rare Candy and PP Ups to evolution stones and Nuggets, including the hidden ones.',
    body: table(['Item', 'Found on the ground', 'Sold in shops'], itemRows) }), 0.7);

  // ================================================================ guides and FAQ (written by hand, checked against the game)
  const guides = require('./site_guides.js')({ G, D, M, monName, monLink, moveLink, locLink, itemName, sprite, table, typeBadge, wildOf, superRod, SPECIAL, GYMS, leaderName, teamOf, list, pct, range, esc, TYPES, typeName, eff, found, obtainable, DEX, evoFrom, evoText });
  for (const g of guides) write(`/guides/${g.slug}/`, shell({ path: `/guides/${g.slug}/`, title: g.title, description: g.description, h1: g.h1, crumbs: [['/guides/', 'Guides'], [`/guides/${g.slug}/`, g.short || g.h1]], lead: g.lead, body: g.body, faq: g.faq,
    jsonld: [{ '@type': g.howto ? 'HowTo' : 'Article', headline: g.h1, ...(g.howto ? { name: g.h1, step: g.howto.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, text: s })) } : {}), author: { '@type': 'Organization', name: 'Levy Street' }, publisher: { '@type': 'Organization', name: 'Levy Street', url: 'https://levystreet.com' }, dateModified: LASTMOD, mainEntityOfPage: SITE + 'guides/' + g.slug + '/' }] }), g.priority || 0.7);
  write('/guides/', shell({ path: '/guides/', title: 'Pokémon Red Guides: Walkthrough, Glitches, Legendaries & More', description: 'Pokémon Red guides: walkthrough, MissingNo. and the Mew glitch, legendary Pokémon, HMs, evolution stones, fossils, fishing, the Safari Zone and how to play online.',
    h1: 'Pokémon Red guides', crumbs: [['/guides/', 'Guides']], lead: 'Guides for Pokémon Red, written for <a href="/">Pokémon Claude Red</a> and true to the original game: the classic glitches work here exactly as they did in 1996.',
    body: `<ul class="cards">${guides.map(g => `<li><a href="/guides/${g.slug}/"><strong>${esc(g.h1)}</strong><span>${esc(g.description)}</span></a></li>`).join('')}</ul>
<h2>Reference</h2><ul class="cards"><li><a href="/pokedex/"><strong>Pokédex</strong><span>All 151 POKéMON with locations, stats and moves.</span></a></li><li><a href="/locations/"><strong>Locations</strong><span>Every route, town and dungeon with wild POKéMON and maps.</span></a></li><li><a href="/gym-leaders/"><strong>Gym leaders</strong><span>All eight leaders with teams and counters.</span></a></li><li><a href="/tms/"><strong>TMs &amp; HMs</strong><span>All 55 machines and where to find them.</span></a></li><li><a href="/evolutions/"><strong>Evolutions</strong><span>Levels, stones and trade evolutions.</span></a></li><li><a href="/types/"><strong>Type chart</strong><span>The Gen 1 chart with its famous bugs.</span></a></li><li><a href="/items/"><strong>Item locations</strong><span>Rare Candy, stones, Nuggets and hidden items.</span></a></li><li><a href="/elite-four/"><strong>Elite Four</strong><span>Lorelei, Bruno, Agatha, Lance and the Champion.</span></a></li></ul>` }), 0.9);
  const faqPage = require('./site_guides.js').faq;
  write('/faq/', shell({ path: '/faq/', title: 'Pokémon Claude Red FAQ: Is It Free? How Was It Made? Does It Work on Phones?', description: 'Answers about Pokémon Claude Red, the free browser remake of Pokémon Red built by Claude: how to play, saving, phones, online battles and trades, and how an AI made it.',
    h1: 'About Pokémon Claude Red', crumbs: [['/faq/', 'About & FAQ']], lead: 'Pokémon Claude Red is a free, non-commercial fan remake of Pokémon Red that runs in any web browser. Claude, an AI model by Anthropic, rebuilt the whole game from raw pixels in JavaScript: there is not a single image file in it.',
    body: '<p><a class="play big" href="/?ref=faq">▶ Play Pokémon Claude Red</a></p>', faq: faqPage, jsonld: [{ '@type': 'VideoGame', name: 'Pokémon Claude Red', url: SITE, applicationCategory: 'Game', gamePlatform: 'Web browser', operatingSystem: 'Any', genre: ['Role-playing game', 'Adventure'], offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, author: { '@type': 'Organization', name: 'Levy Street', url: 'https://levystreet.com' } }] }), 0.9);

  // ================================================================ sitemap, llms.txt
  stamp('/', fs.readFileSync(path.join(OUT, 'index.html'), 'utf8')); // the game page itself (its script hashes change with the code)
  const urls = [['/', 1.0], ...pages].map(([p, pr]) => `  <url><loc>${SITE}${p.replace(/^\//, '')}</loc><lastmod>${next[p].lastmod}</lastmod><priority>${pr.toFixed(1)}</priority></url>`);
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
  fs.writeFileSync(path.join(OUT, 'llms.txt'), prose`# Pokémon Claude Red

> A free, non-commercial fan remake of Pokémon Red that runs in any web browser at ${SITE}. Claude (an AI model by Anthropic) rebuilt the game from raw pixels in JavaScript, directed by Levy Street: all 151 POKéMON, the full Kanto story, the eight gyms and the Elite Four, the classic glitches (MissingNo., the Mew trick), and online link battles and trades in the Social Zone. No download, emulator or ROM needed; it works on phones.

The site also has reference pages for Pokémon Red generated from the game's own data (converted from the pret/pokered disassembly).

## Play
- [Play Pokémon Claude Red](${SITE}): the game itself, free in the browser
- [About & FAQ](${SITE}faq/): what it is, how it was made, saving, phones, online play
- [How to play Pokémon Red online](${SITE}guides/play-pokemon-red-online/)

## Reference
- [Pokédex](${SITE}pokedex/): all 151 Pokémon with locations, stats, moves and evolutions
- [Moves](${SITE}moves/): all 165 moves with power, accuracy, PP and effects
- [Locations](${SITE}locations/): wild Pokémon, trainers, items and maps for every route, town and dungeon
- [Type chart](${SITE}types/): the Generation I type chart and its bugs
- [Gym leaders](${SITE}gym-leaders/) and [Elite Four](${SITE}elite-four/): teams, levels and counters
- [TMs and HMs](${SITE}tms/) and [Evolutions](${SITE}evolutions/)

## Guides
${guides.map(g => `- [${g.h1}](${SITE}guides/${g.slug}/): ${g.description}`).join('\n')}

## Source
- [GitHub: levy-street/pokemon-claude-red](https://github.com/levy-street/pokemon-claude-red)
`);
  fs.mkdirSync(STATE, { recursive: true });
  fs.writeFileSync(MANIFEST, JSON.stringify(next));
  const pending = [...new Set([...readJSON(PENDING, []), ...changed])];
  fs.writeFileSync(PENDING, JSON.stringify(pending));
  console.log(`site: ${changed.length} page(s) changed, ${pending.length} waiting for IndexNow`);
  return pages.length + 1;
};

const CSS = `:root{--bg:#0d0c16;--panel:#17152c;--line:#2a2544;--ink:#ece8f6;--muted:#a9a3c9;--accent:#e08a5f;--link:#9fc4ff}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
a{color:var(--link)}a:hover{color:#fff}
.top{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:16px;padding:10px 16px;background:rgba(13,12,22,.92);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:8px;color:var(--ink);text-decoration:none;font-weight:800;white-space:nowrap}.brand img{image-rendering:pixelated}
.top nav{display:flex;gap:4px;overflow-x:auto;flex:1;scrollbar-width:none}.top nav a{padding:6px 10px;border-radius:8px;color:var(--muted);text-decoration:none;white-space:nowrap;font-size:14px}.top nav a:hover,.top nav a[aria-current]{background:var(--panel);color:#fff}
.play{display:inline-block;padding:8px 14px;border-radius:9px;background:var(--accent);color:#1b1020;font-weight:800;text-decoration:none;white-space:nowrap}.play:hover{color:#1b1020;filter:brightness(1.08)}.play.big{padding:12px 20px;font-size:17px}
main{max-width:980px;margin:0 auto;padding:18px 16px 40px}.crumbs{font-size:13px;color:var(--muted);margin-bottom:6px}.crumbs a{color:var(--muted)}
h1{font-size:clamp(26px,5vw,38px);line-height:1.15;margin:.2em 0 .4em}h2{font-size:22px;margin:1.8em 0 .6em;padding-top:.4em;border-top:1px solid var(--line)}h3{font-size:17px;margin:1.3em 0 .5em;color:#ffd66a}
.lead{font-size:18px;color:#d8d3ee}.note{color:var(--muted);font-size:14px}
.px{image-rendering:pixelated;image-rendering:crisp-edges}
.mon-top{display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start}.mon-art{margin:0;padding:12px;background:radial-gradient(circle at 50% 60%,#26224a,#141226);border:1px solid var(--line);border-radius:14px;text-align:center}.mon-art figcaption{font-size:12px;color:var(--muted);max-width:200px}
.facts{display:grid;grid-template-columns:auto 1fr;gap:6px 16px;margin:0;flex:1;min-width:240px}.facts dt{color:var(--muted)}.facts dd{margin:0}.facts.wide{max-width:520px}
.dex{margin:18px 0;padding:12px 16px;border-left:3px solid var(--accent);background:var(--panel);border-radius:0 10px 10px 0;color:#d8d3ee}
.type{display:inline-block;padding:1px 9px;border-radius:999px;background:var(--c);color:#111;font-size:13px;font-weight:700;text-decoration:none;text-shadow:0 1px 0 rgba(255,255,255,.25);margin:1px 0}.type:hover{color:#000;filter:brightness(1.1)}
.tw{overflow-x:auto;margin:8px 0}table{border-collapse:collapse;width:100%;font-size:15px}th,td{padding:7px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}th{color:var(--muted);font-weight:600;font-size:13px}
table.wild img{vertical-align:middle;margin-right:4px}.bar{display:inline-block;width:160px;max-width:40vw;height:8px;background:#221f3a;border-radius:4px;overflow:hidden}.bar i{display:block;height:100%;background:linear-gradient(90deg,#e08a5f,#ffd66a)}
.chart td,.chart th{text-align:center;padding:5px;font-size:13px}.chart td.m2{background:#2f6b3a;color:#dfffe4;font-weight:800}.chart td.m05{background:#6b3a2f;color:#ffe6df}.chart td.m0{background:#111;color:#ff8a8a;font-weight:800}
.where li{margin:4px 0}.chips{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:6px}.chips li{background:var(--panel);border:1px solid var(--line);border-radius:999px;padding:3px 10px;font-size:14px}
.grid{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px}.grid.small{grid-template-columns:repeat(auto-fill,minmax(100px,1fr))}.grid a{display:flex;flex-direction:column;align-items:center;padding:8px;background:var(--panel);border:1px solid var(--line);border-radius:12px;text-decoration:none;color:var(--ink);font-size:14px;text-align:center}.grid a:hover{border-color:var(--accent)}.grid img{image-rendering:pixelated}.grid .types{color:var(--muted);font-size:12px}
.evo{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:12px}.evo li{display:flex;align-items:center;gap:6px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:6px 12px 6px 6px}.evo img{image-rendering:pixelated}.evo small{display:block;color:var(--muted)}
.families{list-style:none;padding:0}.families li{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--line)}.families a{display:flex;flex-direction:column;align-items:center;text-decoration:none;font-size:13px;color:var(--ink)}.families img{image-rendering:pixelated}.arrow{color:var(--muted);font-size:13px}
.cols{columns:3 220px;padding-left:18px}.cols li{margin:3px 0}.cols small{color:var(--muted)}
.cards{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}.cards a{display:block;height:100%;padding:14px;background:var(--panel);border:1px solid var(--line);border-radius:12px;text-decoration:none;color:var(--ink)}.cards a:hover{border-color:var(--accent)}.cards strong{display:block;margin-bottom:4px}.cards span{color:var(--muted);font-size:14px}
.map{margin:12px 0;text-align:center}.map img{max-width:100%;height:auto !important;border-radius:8px;border:1px solid var(--line)}.map figcaption{font-size:12px;color:var(--muted)}
.pager{display:flex;justify-content:space-between;gap:10px;margin:26px 0;flex-wrap:wrap}
.faq details{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px 14px;margin:8px 0}.faq summary{cursor:pointer;font-weight:700}.faq p{margin:.6em 0 0;color:#d8d3ee}
.steps li{margin:8px 0}
.cta{display:flex;flex-wrap:wrap;align-items:center;gap:16px;justify-content:space-between;margin:34px 0 0;padding:18px;border:1px solid #4a3a60;border-radius:14px;background:linear-gradient(135deg,#231c3a,#171329)}.cta div{flex:1;min-width:240px;color:#d8d3ee}
footer{border-top:1px solid var(--line);padding:18px 16px 30px;text-align:center;color:var(--muted);font-size:14px}footer .fine{font-size:12px;max-width:760px;margin:8px auto 0}
@media (max-width:640px){.top{flex-wrap:wrap;gap:8px}.top nav{order:3;flex-basis:100%}.lead{font-size:16px}}
`;
