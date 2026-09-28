// SOCIAL ZONE: one shared hangout reached from the CABLE CLUB receptionist in every POKéMON CENTER.
// Battle Tower (level-50 win streaks, BP prizes), link battles against friends' teams (shared as links) and local
// 2-player versus, two-way trades by link, a records board, a photographer and friends hanging out in the lounge.
// Teams and trades can travel as links/codes (validated on import); progress lives in G.state.social. The live lounge
// (everyone online in one room, chat, real-time battles and trades) is src/game/lounge.js.
(function (G) {
  'use strict';
  const { Surface, hex, mix, shade } = G.gfx;
  const F = G.font;
  const ZONE = 'SocialZone';

  // ---------------- the map (built from the lobby tileset) ----------------
  // 24x14 cells: three service desks along the back wall, a carpeted lounge, exit mats at the bottom.
  const W = 24, H = 14;
  const ROWS = [
    '14 14 14 14 14 14 14 14 14 14 14 14 14 14 14 14 14 14 14 14 14 14 14 14',
    ' 0 18  3  0  0  3  0 16  0  3  0  0  3  0 16  0  3  0  0  3  0 19 19  0',
    ' 2  2  4  2  2  4  2  2  2  4  2  2  4  2  2  2  4  2  2  4  2 20 20  2',
    ' 2  2 11 12 12 21  2  2  2 11 12 12 21  2  2  2 11 12 12 21  2  2  2  2',
    ' 2  2  2  2  2  2  2  2  2  2  2  2  2  2  2  2  2  2  2  2  2  2  2  2',
    ' 2  2  2  5  5  5  5  5  5  5  5  5  5  5  5  5  5  5  5  5  5  2  2  2',
    ' 2  2  2  5  1  1  5  5  5  1  1  5  5  1  1  5  5  5  1  1  5  2  2  2',
    ' 2  2  2  5  6  7  5  5  5  6  7  5  5  6  7  5  5  5  6  7  5  2  2  2',
    ' 2  2  2  5  8  9  5  5  5  8  9  5  5  8  9  5  5  5  8  9  5  2  2  2',
    ' 2  2  2  5  1  1  5  5  5  1  1  5  5  1  1  5  5  5  1  1  5  2  2  2',
    ' 2  2  2  5  5  5  5  5  5  5  5  5  5  5  5  5  5  5  5  5  5  2  2  2',
    ' 2  2  2  2  2  2  2  2  2  2  2  2  2  2  2  2  2  2  2  2  2  2  2  2',
    ' 2  2  2  2  2  2  2  2  2  2  2  2  2  2  2  2  2  2  2  2  2  2  2  2',
    ' 2  2  2  2  2  2  2  2  2  2  2 10 10  2  2  2  2  2  2  2  2  2  2  2',
  ];
  const obj = (id, x, y, sprite, dir, move) => ({ id, x, y, sprite, move: move || 'STAY', dir: dir || 'DOWN', text: '', textLabel: '' });
  const BASE_OBJS = [
    obj('SOCIAL_TOWER_CLERK', 3, 2, 'link_receptionist'), obj('SOCIAL_BP_CLERK', 4, 2, 'clerk'),
    obj('SOCIAL_LINK_CLERK', 10, 2, 'link_receptionist'), obj('SOCIAL_VERSUS_HOST', 11, 2, 'cooltrainer_m'),
    obj('SOCIAL_TRADE_CLERK', 17, 2, 'link_receptionist'), obj('SOCIAL_TRADE_HELPER', 18, 2, 'scientist'),
    obj('SOCIAL_PHOTOGRAPHER', 1, 6, 'gentleman', 'RIGHT'), obj('SOCIAL_REGULAR_1', 22, 8, 'beauty', 'LEFT'),
    obj('SOCIAL_REGULAR_2', 15, 11, 'super_nerd', 'UP', 'WALK'), obj('SOCIAL_QUIZ_HOST', 22, 4, 'gym_guide', 'LEFT'),
  ];
  // lounge chairs where friends' avatars sit (they face their table)
  const SEATS = [[4, 6, 'DOWN'], [5, 9, 'UP'], [9, 6, 'DOWN'], [10, 9, 'UP'], [13, 6, 'DOWN'], [14, 9, 'UP'], [18, 6, 'DOWN'], [19, 9, 'UP']];
  function installMap() {
    const M = G.MAPDATA;
    M.maps[ZONE] = {
      cnst: 'SOCIAL_ZONE', ts: 'lobby', tsc: 'Lobby', w: W, h: H, cells: ROWS.join(' ').trim().split(/\s+/).map(Number),
      border: [13, 13, 13, 13], conns: {}, hidden: [],
      warps: [{ x: 11, y: 13, to: 'SOCIAL_RETURN', warp: 0 }, { x: 12, y: 13, to: 'SOCIAL_RETURN', warp: 0 }],
      signs: [{ x: 7, y: 1, text: 'SOCIAL_RECORDS', textLabel: '' }, { x: 14, y: 1, text: 'SOCIAL_WELCOME', textLabel: '' }, { x: 1, y: 1, text: 'SOCIAL_PHOTO', textLabel: '' }],
      objs: BASE_OBJS.map(o => Object.assign({}, o)),
    };
    if (G.MUSIC && G.MUSIC.mapSongs) G.MUSIC.mapSongs.SOCIAL_ZONE = 'GameCorner';
  }
  installMap();

  // ---------------- state ----------------
  function S() {
    const st = G.state;
    st.social = st.social || {};
    const s = st.social;
    for (const [k, v] of Object.entries({ bp: 0, streak: 0, best: 0, towerWins: 0, pvpWins: 0, pvpLosses: 0, versus: 0, trades: 0, friends: [], outgoing: [], offers: [] })) if (s[k] === undefined) s[k] = Array.isArray(v) ? [] : v;
    return s;
  }
  G.socialState = S;
  const say = t => G.say(t);
  const ask = t => G.ask(t);
  const choose = (items, o) => G.choose(items, Object.assign({ x: 320 - 6 - Math.max(...items.map(i => F.measure(String(i)))) - 34 }, o || {}));
  const playerName = () => G.state.name;

  // ---------------- entering / leaving ----------------
  function* enterZone() {
    const p = G.ow.player;
    S().ret = { map: G.ow.map.name, x: p.x, y: p.y, dir: p.dir };
    G.sfx && G.sfx('teleport');
    yield* G.fadeOut(16);
    G.ow.load(ZONE, 11, 12, 'up');
    G.ow.snapCamera && G.ow.snapCamera();
    yield* G.fadeIn(16);
    G.ow.showBanner && G.ow.showBanner();
  }
  G.leaveSocialZone = function* () {
    const r = S().ret || { map: 'PalletTown', x: 5, y: 6, dir: 'down' };
    G.sfx && G.sfx('teleport');
    yield* G.fadeOut(16);
    G.ow.load(r.map, r.x, r.y, 'down');
    G.ow.snapCamera && G.ow.snapCamera();
    yield* G.fadeIn(16);
  };
  // the zone's exit mats lead back to the POKéMON CENTER you came from
  const OW = G.Overworld.prototype, origWarp = OW.doWarp;
  OW.doWarp = function (wi) {
    if (this.map.warps[wi] && this.map.warps[wi].to === 'SOCIAL_RETURN') { G.spawnScript(G.leaveSocialZone(), 'social-exit'); return; }
    return origWarp.call(this, wi);
  };
  const isCenter = m => /Pokecenter$/.test(m.name) || m.name === 'IndigoPlateauLobby';
  function* receptionist() {
    yield* say('Welcome to the CABLE CLUB!\fOur link now connects to the SOCIAL ZONE - the same lounge from every POKéMON CENTER.\fBattle friends, climb the BATTLE TOWER and trade POKéMON!');
    if (!G.state.party.length) { yield* say('You need a POKéMON to join the fun. Please come back once you have one!'); return; }
    if (yield* ask('Would you like to go to the SOCIAL ZONE?')) { yield* say('Please enjoy your stay!'); yield* enterZone(); }
    else yield* say('Please come again!');
  }
  // every CABLE CLUB receptionist in a POKéMON CENTER is the link (takes precedence over map scripts)
  const origTalk = G.scripts.talk;
  G.scripts.talk = function (map, a) {
    if (a.obj && a.obj.sprite === 'link_receptionist' && isCenter(map)) return receptionist();
    return origTalk.apply(this, arguments);
  };
  // a glowing SOCIAL ZONE sign above each CABLE CLUB counter
  function linkSign(actor) {
    return { draw(s, cx, cy, t) {
      if (!G.ow || !isCenter(G.ow.map)) return false;
      const x = actor.x * 16 - cx - 4, y = actor.y * 16 - cy - 26 + Math.round(Math.sin(t / 20));
      const glow = 0.25 + 0.15 * Math.sin(t / 12);
      s.ellipseBlend(x + 12, y + 5, 20, 8, hex('#58e0ff'), glow);
      s.rect(x - 4, y, 32, 11, hex('#16163a')); s.rect(x - 4, y, 32, 1, hex('#58e0ff')); s.rect(x - 4, y + 10, 32, 1, hex('#58e0ff'));
      F.drawSmall(s, 'SOCIAL', x - 1, y + 3, hex((t >> 4) % 6 ? '#b8f4ff' : '#ffffff'));
      for (let k = 0; k < 3; k++) s.pset(x + 24 + k, y + 5 + (k === 1 ? 0 : k === 0 ? -1 : 1), hex('#ff78c8'));
      return true;
    } };
  }
  const origEnter = G.scripts.onEnter;
  G.scripts.onEnter = function (map) {
    const r = origEnter.apply(this, arguments);
    if (isCenter(map)) for (const a of G.ow.actors) if (a.obj && a.obj.sprite === 'link_receptionist') G.ow.fx.push(linkSign(a));
    if (map.name === ZONE) zoneEnter();
    return r;
  };
  if (G.mapDisplayName) { const orig = G.mapDisplayName; G.mapDisplayName = m => m && m.name === ZONE ? 'SOCIAL ZONE' : orig(m); }

  // ---------------- links & codes (untrusted input: everything is validated) ----------------
  const INBOX_KEY = 'claudered_social_inbox';
  const clean = (v, n) => String(v || '').toUpperCase().replace(/[^A-Z0-9 .\-'é]/gi, '').slice(0, n || 10);
  const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(+v || 0)));
  function monOut(m, lv50) {
    const o = { s: m.species, l: lv50 ? 50 : m.level, m: m.moves.map(x => x.id), d: [m.dv.atk, m.dv.def, m.dv.spd, m.dv.spc] };
    if (m.nick) o.k = m.nick;
    if (!lv50) Object.assign(o, { x: [m.sexp.hp, m.sexp.atk, m.sexp.def, m.sexp.spd, m.sexp.spc], u: m.moves.map(x => x.ups || 0), o: m.ot, i: m.otId });
    return o;
  }
  // rebuild a Mon from link data, refusing anything a real Red save couldn't hold
  function monIn(o, otName, otId) {
    if (!o || !G.DATA.species[o.s]) return null;
    const moves = (Array.isArray(o.m) ? o.m : []).filter(id => G.DATA.moves[id] && id !== 'STRUGGLE').slice(0, 4);
    if (!moves.length) return null;
    const d = Array.isArray(o.d) ? o.d : [];
    const m = new G.Mon(o.s, int(o.l, 1, 100), { dvs: { atk: int(d[0], 0, 15), def: int(d[1], 0, 15), spd: int(d[2], 0, 15), spc: int(d[3], 0, 15) }, moves: [...new Set(moves)], ot: clean(o.o || otName, 7) || 'FRIEND', otId: int(o.i !== undefined ? o.i : otId, 0, 65535) });
    if (o.k) m.nick = clean(o.k, 10) || null;
    if (Array.isArray(o.x)) ['hp', 'atk', 'def', 'spd', 'spc'].forEach((k, i) => { m.sexp[k] = int(o.x[i], 0, 65535); });
    if (Array.isArray(o.u)) m.moves.forEach((mv, i) => { mv.ups = int(o.u[i], 0, 3); mv.max = Math.floor(G.DATA.moves[mv.id].pp * (1 + mv.ups / 5)); });
    m.recalc(true); m.healFull();
    return m;
  }
  const lookIn = l => { const o = {}; l = l || {}; for (const k of ['skin', 'hair', 'hat', 'shirt', 'bottom', 'bag']) if (/^#[0-9a-f]{6}$/i.test(l[k])) o[k] = l[k];
    if (['m', 'f'].includes(l.face)) o.face = l.face; if (['pants', 'shorts', 'dress'].includes(l.outfit)) o.outfit = l.outfit; if (G.chars.HEADS[l.head]) o.head = l.head; return o; };
  const link = (key, payload) => G.siteBase() + '?' + key + '=' + G.b64u(JSON.stringify(payload));
  function decode(str) {
    let raw = String(str || '').trim();
    const m = raw.match(/[?&](team|trade|tradeback|moment)=([A-Za-z0-9_\-+/=%]+)/);
    let kind = null;
    if (m) { kind = m[1]; raw = decodeURIComponent(m[2]); }
    let p; try { p = JSON.parse(G.unb64u(raw)); } catch (e) { return null; }
    if (!p || typeof p !== 'object') return null;
    return { kind: kind || p.k, p };
  }
  // -> { type: 'team', friend } | { type: 'offer', offer } | { type: 'reply', reply } | null
  G.socialParse = function (str) {
    const d = decode(str); if (!d) return null;
    const p = d.p, name = clean(p.n, 10) || 'FRIEND', tid = int(p.tid, 0, 65535);
    if (d.kind === 'team' || p.k === 'team') {
      const team = (Array.isArray(p.t) ? p.t : []).slice(0, 6).map(o => monIn(Object.assign({}, o, { l: 50 }), name, tid)).filter(Boolean);
      if (!team.length) return null;
      return { type: 'team', friend: { id: 'f' + int(p.id, 0, 1e9), name, look: lookIn(p.l), team: team.map(m => m.toJSON()), added: Date.now() } };
    }
    if (d.kind === 'trade' || p.k === 'offer') {
      const mon = monIn(p.mon, name, tid); if (!mon) return null;
      return { type: 'offer', offer: { id: String(p.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 16), from: name, tid, look: lookIn(p.l), mon: mon.toJSON() } };
    }
    if (d.kind === 'tradeback' || p.k === 'reply') {
      const mon = monIn(p.mon, name, tid); if (!mon) return null;
      return { type: 'reply', reply: { id: String(p.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 16), from: name, tid, mon: mon.toJSON() } };
    }
    return null;
  };
  G.teamLink = function (mons) {
    const st = G.state;
    return link('team', { v: 1, k: 'team', id: (st.trainerId || 0) * 1000 + Object.keys(st.dex.caught).length, n: st.name, tid: st.trainerId || 0, l: st.look, t: mons.map(m => monOut(m, true)) });
  };
  // links opened from the address bar land in a global inbox, picked up the next time the SOCIAL ZONE is entered
  function inbox() { try { return JSON.parse(localStorage.getItem(INBOX_KEY) || '[]'); } catch (e) { return []; } }
  function setInbox(v) { try { localStorage.setItem(INBOX_KEY, JSON.stringify(v.slice(-30))); } catch (e) {} }
  G.socialReceiveLink = function (search) {
    const r = G.socialParse(search); if (!r) return null;
    const box = inbox(); box.push(r); setInbox(box);
    return r;
  };
  function absorb(r) {
    const s = S();
    if (r.type === 'team') { s.friends = s.friends.filter(f => f.id !== r.friend.id && f.name !== r.friend.name); s.friends.push(r.friend); if (s.friends.length > 8) s.friends.shift(); return r.friend.name + "'s team joined your friends!"; }
    if (r.type === 'offer') { if (!s.offers.some(o => o.id === r.offer.id)) s.offers.push(r.offer); return r.offer.from + ' offered a trade: ' + G.speciesName(r.offer.mon.species) + '!'; }
    if (r.type === 'reply') { if (!s.replies) s.replies = []; if (!s.replies.some(o => o.id === r.reply.id)) s.replies.push(r.reply); return r.reply.from + ' answered your trade!'; }
    return null;
  }
  async function readClipboard() {
    try { if (navigator.clipboard && navigator.clipboard.readText) { const t = await navigator.clipboard.readText(); if (t) return t; } } catch (e) {}
    try { return window.prompt('Paste a SOCIAL ZONE link (team, trade offer or reply):') || ''; } catch (e) { return ''; }
  }
  async function writeClipboard(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {}
    try { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch (e) { return false; }
  }
  // run an async browser call from a script (headless: resolves to null)
  function* waitFor(promiseFn) {
    if (typeof document === 'undefined') return null;
    let done = false, val = null;
    promiseFn().then(v => { val = v; done = true; }, () => { done = true; });
    for (let i = 0; i < 1800 && !done; i++) yield;
    return val;
  }
  function* copyLink(url, what) {
    const ok = yield* waitFor(() => writeClipboard(url));
    if (ok) yield* say('Copied the ' + what + ' link!\fSend it to your friend - they can open it or paste it here.');
    else yield* say("Couldn't reach the clipboard. Here is the start of the link:\f" + url.slice(0, 60) + '...');
    return ok;
  }
  function* pasteLink() {
    const text = yield* waitFor(readClipboard);
    if (!text) { yield* say('No link found. Copy a SOCIAL ZONE link first, then try again.'); return null; }
    const r = G.socialParse(text);
    if (!r) { yield* say("That doesn't look like a SOCIAL ZONE link."); return null; }
    return r;
  }

  // ---------------- friends in the lounge ----------------
  // base NPCs plus friends' avatars (in their own looks) on the lounge chairs
  function refreshLounge() {
    if (!G.ow || G.ow.map.name !== ZONE) return;
    const s = S(), objs = G.ow.map.objs; objs.length = 0;
    BASE_OBJS.forEach(o => objs.push(Object.assign({}, o)));
    s.friends.slice(-SEATS.length).forEach((f, i) => { const [x, y, dir] = SEATS[i]; objs.push(Object.assign(obj('SOCIAL_FRIEND_' + i, x, y, friendSprite(f, i), dir), { friend: f.id })); });
    G.ow.spawnActors();
  }
  function friendSprite(f, i) {
    const key = 'social_friend_' + i;
    G.CAST[key] = Object.assign({}, G.lookDef(f.look));
    return key;
  }
  // neon signs over the desks and the lounge (animated, drawn over the room)
  function neon(s, text, cx, y, col, t, k) {
    const w = F.measure(text) + 12, x = Math.round(cx - w / 2), on = (t + k * 37) % 190 > 4;
    s.ellipseBlend(cx, y + 6, w * 0.7, 11, hex(col), on ? 0.22 : 0.08);
    s.rect(x, y, w, 13, hex('#120e2a')); s.rect(x, y, w, 1, hex(col)); s.rect(x, y + 12, w, 1, hex(col)); s.rect(x, y, 1, 13, hex(col)); s.rect(x + w - 1, y, 1, 13, hex(col));
    F.draw(s, text, x + 6, y + 2, on ? hex('#ffffff') : shade(hex(col), -0.3), on ? hex(col) : undefined);
  }
  const DECOR = { draw(s, cx, cy, t) {
    if (!G.ow || G.ow.map.name !== ZONE) return false;
    // desk centres: tower x 2-5, link x 9-12, trade x 16-19 (cells); signs hang on the back wall
    neon(s, 'BATTLE TOWER', 4 * 16 - cx, 3 - cy, '#ff78c8', t, 0);
    neon(s, 'LINK BATTLE', 11 * 16 - cx, 3 - cy, '#ffe070', t, 2);
    neon(s, 'TRADE CORNER', 18 * 16 - cx, 3 - cy, '#80f0a0', t, 3);
    return true;
  } };
  function zoneEnter() {
    if (!G.ow.fx.includes(DECOR)) G.ow.fx.push(DECOR);
    const s = S(), box = inbox();
    const notes = [];
    if (box.length) { for (const r of box) { const n = absorb(r); if (n) notes.push(n); } setInbox([]); }
    refreshLounge();
    if (notes.length) G.spawnScript((function* () { yield* G.engine.wait(24); for (const n of notes) yield* say(n); })(), 'social-inbox');
  }

  // ---------------- battles (level 50, no EXP / items / blackout; your real party is untouched) ----------------
  const lv50 = m => { const c = G.Mon.from(Object.assign({}, m.toJSON(), { level: 50 })); c.recalc(true); c.healFull(); return c; };
  function* pickTeam(n, msg) {
    const party = G.state.party;
    if (party.length <= n) return party.slice();
    const picked = [];
    while (picked.length < n) {
      const i = yield* G.partyScreen({ msg: msg + ' ' + (picked.length + 1) + '/' + n, pick: function* (m, k, ps) {
        if (picked.includes(m)) { yield* ps.say(m.name + ' is already chosen!'); return false; }
        return true;
      } });
      if (i < 0) { if (!picked.length) return null; picked.pop(); continue; }
      picked.push(party[i]);
    }
    return picked;
  }
  function* linkBattle(mine, foes, o) {
    const st = G.state, saved = st.party;
    st.party = mine.map(lv50);
    let r;
    try {
      r = yield* G.runBattle({ type: 'trainer', enemyParty: foes, trainer: { cls: o.cls, displayName: o.displayName, money: 0, winText: o.winText, loseText: o.loseText, pic: o.pic || null },
        trainerItems: [], transition: o.boss ? 'boss' : 'trainer', music: o.music || 'trainer', noBlackout: true, noExp: true, noItems: true, noBadgeBoost: true, p2Action: o.p2Action || null });
    } finally { st.party = saved; }
    return r;
  }

  // Battle Tower trainers: tiered species pools, level 50, strong movesets from level-up + TM/HM moves
  const TOWER_CLASSES = ['COOLTRAINER_M', 'COOLTRAINER_F', 'BLACKBELT', 'PSYCHIC_TR', 'SCIENTIST', 'GENTLEMAN', 'BEAUTY', 'HIKER', 'SUPER_NERD', 'BIRD_KEEPER', 'JUGGLER', 'TAMER',
    'ENGINEER', 'FISHER', 'SWIMMER', 'ROCKER', 'CHANNELER', 'BIKER', 'GAMBLER', 'POKEMANIAC', 'BURGLAR', 'CUE_BALL', 'SAILOR', 'LASS', 'JR_TRAINER_M', 'JR_TRAINER_F'];
  const NAMES = ['ALEX', 'SAM', 'JORDAN', 'RILEY', 'CASEY', 'MORGAN', 'TAYLOR', 'JAMIE', 'ROBIN', 'AVERY', 'QUINN', 'DREW', 'SKYLER', 'REESE', 'BLAKE', 'KAI', 'NOVA', 'SAGE', 'ROWAN', 'EMERY'];
  const LEGENDS = new Set(['ARTICUNO', 'ZAPDOS', 'MOLTRES', 'MEWTWO', 'MEW']);
  const UTIL = { SPORE: 95, SLEEP_POWDER: 80, LOVELY_KISS: 75, THUNDER_WAVE: 75, RECOVER: 75, SOFTBOILED: 75, AMNESIA: 70, SWORDS_DANCE: 65, HYPNOSIS: 55, STUN_SPORE: 55, TOXIC: 50,
    REST: 45, CONFUSE_RAY: 40, LEECH_SEED: 40, REFLECT: 40, AGILITY: 40, SUBSTITUTE: 35, SING: 35, GLARE: 60 };
  const WEAK = new Set(['SELFDESTRUCT', 'EXPLOSION', 'DREAM_EATER', 'SKY_ATTACK', 'SKULL_BASH', 'SOLARBEAM', 'RAZOR_WIND', 'DIG', 'FLY', 'FOCUS_ENERGY', 'RAGE', 'BIDE', 'COUNTER', 'SUPER_FANG', 'DRAGON_RAGE', 'SONICBOOM', 'NIGHT_SHADE', 'SEISMIC_TOSS', 'PSYWAVE']);
  const bst = sp => { const d = G.DATA.species[sp]; return d.hp + d.atk + d.def + d.spd + d.spc; };
  function buildMoves(sp) {
    const d = G.DATA.species[sp], M = G.DATA.moves;
    const cand = new Set(d.moves1.concat(d.learn.filter(([l]) => l <= 50).map(([, m]) => m), d.tmhm));
    const dmg = [], util = [];
    for (const id of cand) {
      const m = M[id]; if (!m) continue;
      if (m.power > 1 && !WEAK.has(id)) dmg.push({ id, type: m.type, sc: m.power * (d.types.includes(m.type) ? 1.5 : 1) * (m.acc || 100) / 100 * (id === 'HYPER_BEAM' ? 0.7 : 1) });
      else if (UTIL[id]) util.push({ id, sc: UTIL[id] });
    }
    dmg.sort((a, b) => b.sc - a.sc); util.sort((a, b) => b.sc - a.sc);
    const out = [], types = new Set();
    for (const m of dmg) { if (out.length >= 3) break; if (!types.has(m.type)) { out.push(m.id); types.add(m.type); } }
    if (util.length && (out.length < 3 || util[0].sc > 50)) out.push(util[0].id);
    for (const m of dmg) { if (out.length >= 4) break; if (!out.includes(m.id)) out.push(m.id); }
    for (const m of util) { if (out.length >= 4) break; if (!out.includes(m.id)) out.push(m.id); }
    return out.slice(0, 4);
  }
  function towerTrainer(n) {
    const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    const tier = n >= 21 ? 2 : n >= 7 ? 1 : 0;
    const band = [[300, 399], [380, 459], [440, 999]][tier];
    const pool = Object.keys(G.DATA.species).filter(sp => G.DATA.species[sp].dex >= 1 && !LEGENDS.has(sp) && bst(sp) >= band[0] && bst(sp) <= band[1]);
    const party = [];
    while (party.length < 3) {
      const sp = pool[Math.floor(Math.random() * pool.length)];
      if (party.some(m => m.species === sp)) continue;
      const lo = [4, 8, 12][tier];
      party.push(new G.Mon(sp, 50, { dvs: { atk: rnd(lo, 15), def: rnd(lo, 15), spd: rnd(lo, 15), spc: rnd(lo, 15) }, moves: buildMoves(sp), ot: 'TOWER', otId: 1 }));
    }
    const cls = TOWER_CLASSES[Math.floor(Math.random() * TOWER_CLASSES.length)], name = NAMES[Math.floor(Math.random() * NAMES.length)];
    const title = ((G.DATA.trainerClasses[cls] || {}).name || cls) + ' ' + name;
    return { cls, title, party };
  }
  G.towerTrainer = towerTrainer; G.towerMoves = buildMoves;

  function* towerDesk() {
    const s = S();
    yield* say('Welcome to the BATTLE TOWER!\fTrainers from all over wait upstairs. All POKéMON battle at LEVEL 50 - no items, no EXP.\fWin streak: ' + s.streak + '   Best: ' + s.best + '   BP: ' + s.bp);
    for (;;) {
      const r = yield* choose([s.streak ? 'CONTINUE' : 'CHALLENGE', 'RULES', 'CANCEL']);
      if (r === 1) { yield* say('Choose 3 POKéMON. They are healed and set to LEVEL 50 for every battle.\fEach win earns 1 BP, and every 7th win in a row earns 3 more.\fLose once and the streak starts over. Trade BP for prizes at the counter next door!'); continue; }
      if (r !== 0) { yield* say('We hope to see you again!'); return; }
      const team = yield* pickTeam(3, 'Choose for the BATTLE TOWER');
      if (!team) return;
      for (;;) {
        const n = s.streak + 1, foe = towerTrainer(n), boss = n % 7 === 0;
        yield* say('Battle No.' + n + (boss ? ' - a TOWER TYCOON challenge!' : '!') + '\f' + foe.title + ' wants to battle!');
        const res = yield* linkBattle(team, foe.party, { cls: foe.cls, displayName: foe.title, winText: foe.title + ': You earned that win!', loseText: foe.title + ': The TOWER is tougher than it looks!', music: boss ? 'gym_leader' : 'trainer', boss });
        if (res !== 'win') { G.track && G.track('tower', { streak: s.streak, best: s.best, team: team.map(m => m.species) }); yield* say('Your streak ended at ' + s.streak + '.\fBest streak: ' + s.best + '. Train up and come back!'); s.streak = 0; return; }
        s.streak++; s.towerWins++; s.best = Math.max(s.best, s.streak);
        const bp = 1 + (s.streak % 7 === 0 ? 3 : 0); s.bp += bp;
        G.sfx && G.sfx('get_item');
        yield* say('Congratulations! You won ' + bp + ' BP! (' + s.bp + ' BP)\fWin streak: ' + s.streak + '!');
        if ([7, 21, 49, 100].includes(s.streak)) G.achieve('tower_' + s.streak, 'tower', { n: s.streak, team: team.map(m => m.species) });
        if (!(yield* ask('Continue to battle No.' + (s.streak + 1) + '?'))) { yield* say('Your streak is saved. Come back any time!'); return; }
      }
    }
  }
  const PRIZES = [['RARE_CANDY', 5], ['PP_UP', 8], ['HP_UP', 4], ['PROTEIN', 4], ['IRON', 4], ['CARBOS', 4], ['CALCIUM', 4], ['MAX_ELIXER', 5], ['FULL_RESTORE', 3], ['MAX_REVIVE', 3], ['NUGGET', 6], ['MASTER_BALL', 60]];
  function* bpDesk() {
    const s = S();
    yield* say('BP EXCHANGE! Trade the BATTLE POINTS you win upstairs for prizes. You have ' + s.bp + ' BP.');
    for (;;) {
      const items = PRIZES.map(([id, c]) => G.itemName(id) + ' ' + c + 'BP').concat(['CANCEL']);
      const r = yield* G.choose(items, { x: 150, y: 4, w: 164 });
      if (r < 0 || r >= PRIZES.length) { yield* say('Come back soon!'); return; }
      const [id, cost] = PRIZES[r];
      if (s.bp < cost) { yield* say('You need ' + cost + ' BP for that. You have ' + s.bp + ' BP.'); continue; }
      if (!(yield* ask(G.itemName(id) + ' for ' + cost + ' BP?'))) continue;
      if (!G.bag.add(id, 1)) { yield* say('Your bag is full!'); continue; }
      s.bp -= cost; G.sfx && G.sfx('get_item');
      yield* say('Here you go! ' + G.itemName(id) + '! (' + s.bp + ' BP left)');
    }
  }

  // ---------------- local 2-player versus: PLAYER 2 picks the opponent's moves ----------------
  class P2Pick {
    constructor(b, moves, v) { this.b = b; this.moves = moves; this.v = v; this.sel = Math.max(0, moves.findIndex(x => this.ok(x))); this.phase = 0; this.t = 0; this.done = false; }
    ok(x) { return x.pp > 0 && !(this.v.disabled && this.v.disabled.move === x.id); }
    update(f) {
      this.t++; if (!f) return;
      const I = G.input.pressed, Pt = G.pointer, n = this.moves.length;
      if (this.phase === 0) { if ((I.a || I.start || (Pt && Pt.pressed)) && this.t > 12) { if (Pt) Pt.consume(); this.phase = 1; this.t = 0; G.sfx && G.sfx('select'); } return; }
      if (Pt && (Pt.moved || Pt.pressed) && Pt.inside) {
        const i = this.moves.findIndex((_, k) => Pt.in(10 + (k % 2) * 100, 142 + Math.floor(k / 2) * 15, 100, 15));
        if (i >= 0 && this.ok(this.moves[i])) this.sel = i; else if (Pt.pressed) Pt.consume();
      }
      if (I.left && this.sel % 2 === 1) this.sel--; if (I.right && this.sel % 2 === 0 && this.sel + 1 < n) this.sel++;
      if (I.up && this.sel >= 2) this.sel -= 2; if (I.down && this.sel + 2 < n) this.sel += 2;
      if (I.a && this.t > 6 && this.ok(this.moves[this.sel])) { this.result = this.moves[this.sel].id; this.done = true; G.sfx && G.sfx('select'); }
    }
    draw(s) {
      if (this.phase === 0) {
        for (let i = 0; i < s.data.length; i++) s.data[i] = mix(s.data[i], hex('#0a0814'), 0.86);
        const t1 = "PLAYER 2'S TURN", t2 = 'PLAYER 1, look away!', t3 = 'PLAYER 2: press A or tap';
        G.logoText(s, t1, 160, 58, 2, '#b8f4ff', '#58c8f0', '#1a2a5a', '#0a0e24');
        F.draw(s, t2, 160 - F.measure(t2) / 2, 96, hex('#ffe070'));
        if ((this.t >> 4) % 2) F.draw(s, t3, 160 - F.measure(t3) / 2, 116, hex('#d8d0f0'));
        return;
      }
      const m = this.b.mon(this.b.e);
      G.ui.frame(s, 3, 118, 314, 60, 'gray');
      F.draw(s, 'PLAYER 2 - ' + m.name + ':', 12, 124, hex('#3a68d8'));
      this.moves.forEach((mv, i) => {
        const cx = 20 + (i % 2) * 100, cy = 144 + Math.floor(i / 2) * 15;
        G.ui.text(s, G.moveName(mv.id), cx, cy, this.ok(mv) ? undefined : hex('#a8a8b0'));
        if (i === this.sel) G.ui.cursor(s, cx - 10, cy, this.t);
      });
      const mv = this.moves[this.sel], pp = 'PP ' + mv.pp + '/' + mv.max;
      G.ui.text(s, pp, 306 - F.measure(pp), 144);
    }
  }
  function* p2Action(b) {
    const v = b.e.v;
    if (v.recharge || v.charging || v.thrash || v.bide || (v.trapping && v.trapping.turns > 0) || v.rage || v.trapped > 0) return b.enemyAction();
    const moves = b.moveList(b.e);
    if (!moves.some(x => x.pp > 0 && !(v.disabled && v.disabled.move === x.id))) return { type: 'fight', move: 'STRUGGLE' };
    const sc = new P2Pick(b, moves, v);
    yield* G.engine.run(sc);
    return { type: 'fight', move: sc.result };
  }

  function friendMons(f) { return f.team.map(o => { const m = G.Mon.from(o); m.level = 50; m.recalc(true); m.healFull(); return m; }); }
  function friendPic(f) { G.CAST.social_battle = G.lookDef(f.look); return G.castPortrait('social_battle'); }
  function* battleFriend(f, versus) {
    const s = S();
    const team = yield* pickTeam(3, versus ? 'PLAYER 1, choose' : 'Choose to battle ' + f.name);
    if (!team) return;
    if (versus) yield* say('PLAYER 1 controls ' + playerName() + "'s team. PLAYER 2 controls " + f.name + "'s team.\fPLAYER 2 picks a move whenever PLAYER 2'S TURN appears!");
    const res = yield* linkBattle(team, friendMons(f), { cls: 'COOLTRAINER_M', displayName: versus ? 'PLAYER 2' : f.name, pic: friendPic(f), boss: true,
      winText: (versus ? 'PLAYER 2' : f.name) + ': Great battle!', loseText: (versus ? 'PLAYER 2' : f.name) + ': Ha! Better luck next time!', p2Action: versus ? p2Action : null });
    if (versus) { s.versus++; yield* say(res === 'win' ? 'PLAYER 1 wins the VERSUS battle!' : 'PLAYER 2 wins the VERSUS battle!'); return; }
    if (res === 'win') { s.pvpWins++; G.achieve('pvp_' + f.id, 'pvp', { name: f.name, team: f.team.map(m => m.species) }); yield* say('You beat ' + f.name + "'s team! Link battle wins: " + s.pvpWins); }
    else { s.pvpLosses++; yield* say(f.name + "'s team won this time. Rematch any time!"); }
  }
  function* chooseFriend(extra) {
    const s = S(), list = s.friends.slice().reverse();
    const items = list.map(f => f.name).concat(extra || [], ['CANCEL']);
    const r = yield* G.choose(items, { x: 150, y: 4, w: 164 });
    if (r < 0 || r >= items.length - 1) return null;
    return r < list.length ? list[r] : items[r];
  }
  function* linkDesk() {
    yield* say("LINK BATTLES! Share your team as a link, and battle friends' teams at LEVEL 50.");
    for (;;) {
      const r = yield* choose(['BATTLE A FRIEND', 'SHARE MY TEAM', 'ADD FROM LINK', 'CANCEL']);
      if (r === 0) {
        if (!S().friends.length) { yield* say("No friends' teams yet!\fAsk a friend for their team link, then choose ADD FROM LINK - or just open their link."); continue; }
        const f = yield* chooseFriend(); if (f) yield* battleFriend(f, false);
      } else if (r === 1) {
        const team = yield* pickTeam(Math.min(3, G.state.party.length), 'Share which POKéMON?');
        if (team) yield* copyLink(G.teamLink(team), 'team');
      } else if (r === 2) {
        const got = yield* pasteLink();
        if (got) { const n = absorb(got); yield* say(n || 'Added!'); refreshLounge(); }
      } else { yield* say('Good luck out there!'); return; }
    }
  }
  function* versusDesk() {
    yield* say("VERSUS - two players, one screen!\fPLAYER 1 battles with your team. PLAYER 2 picks the moves for a friend's team or a rental team.");
    const f = yield* chooseFriend(['RENTAL TEAM']);
    if (!f) return;
    const foe = f === 'RENTAL TEAM' ? { id: 'rental', name: 'RENTAL', look: {}, team: towerTrainer(14).party.map(m => m.toJSON()) } : f;
    yield* battleFriend(foe, true);
  }

  // ---------------- trades by link ----------------
  function* receive(m) {
    G.dexCaught && G.dexCaught(m.species);
    if (G.state.party.length < 6) G.state.party.push(m);
    else { const box = G.state.boxes[G.state.box] || (G.state.boxes[G.state.box] = []); box.push(m); yield* say(m.name + ' was sent to the PC!'); }
    const to = m.evoByTrade && m.evoByTrade();
    if (to) yield* G.evolve(m, to);
  }
  function tradeLink(key, id, m) {
    const st = G.state;
    return link(key, { v: 1, k: key === 'trade' ? 'offer' : 'reply', id, n: st.name, tid: st.trainerId || 0, l: st.look, mon: monOut(m, false) });
  }
  function* tradeDesk() {
    const s = S();
    s.replies = s.replies || [];
    yield* say('TRADE CORNER! Trade POKéMON with friends by link.\fOFFER a POKéMON and send the link. Your friend ACCEPTS it and sends a reply link back to COMPLETE the trade.');
    for (;;) {
      const opts = ['OFFER A TRADE', 'ACCEPT AN OFFER' + (s.offers.length ? ' (' + s.offers.length + ')' : ''), 'COMPLETE A TRADE' + (s.replies.length ? ' (' + s.replies.length + ')' : ''), 'MY OFFERS (' + s.outgoing.length + ')', 'CANCEL'];
      const r = yield* G.choose(opts, { x: 150, y: 4, w: 164 });
      if (r === 0) {
        if (G.state.party.length < 2) { yield* say("You can't trade away your only POKéMON!"); continue; }
        const pick = yield* pickTeam(1, 'Offer which POKéMON?'); if (!pick) continue;
        const m = pick[0];
        if (!(yield* ask('Offer ' + m.name + '? It waits here safely until the trade is completed or cancelled.'))) continue;
        const id = (Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36)).slice(-12);
        G.state.party.splice(G.state.party.indexOf(m), 1);
        s.outgoing.push({ id, mon: m.toJSON(), at: Date.now() });
        yield* copyLink(tradeLink('trade', id, m), 'trade offer');
      } else if (r === 1) {
        const items = s.offers.map(o => o.from + ': ' + G.speciesName(o.mon.species) + ' Lv' + o.mon.level).concat(['PASTE A LINK', 'CANCEL']);
        const k = yield* G.choose(items, { x: 60, y: 4, w: 254 });
        let offer = null;
        if (k >= 0 && k < s.offers.length) offer = s.offers[k];
        else if (items[k] === 'PASTE A LINK') { const got = yield* pasteLink(); if (got && got.type === 'offer') offer = got.offer; else if (got) { yield* say(absorb(got) || 'Saved.'); continue; } }
        if (!offer) continue;
        const theirs = G.Mon.from(offer.mon);
        yield* say(offer.from + ' offers ' + theirs.name + ' (' + G.speciesName(theirs.species) + ', Lv' + theirs.level + ', OT ' + theirs.ot + ').');
        if (!(yield* ask('Trade one of your POKéMON for ' + theirs.name + '?'))) continue;
        if (G.state.party.length < 2 && G.state.party.length) { /* trading your last one is fine: you receive one back */ }
        const mine = yield* pickTeam(1, 'Trade which POKéMON?'); if (!mine) continue;
        const m = mine[0];
        G.state.party.splice(G.state.party.indexOf(m), 1);
        yield* say(playerName() + ' sent ' + m.name + ' to ' + offer.from + '!');
        yield* G.tradeAnimation(m, theirs);
        s.offers = s.offers.filter(o => o !== offer && o.id !== offer.id);
        s.trades++;
        G.achieve('trade_' + offer.id, 'trade', { sp: theirs.species, from: m.species, name: offer.from });
        yield* receive(theirs);
        yield* say('Now send ' + offer.from + ' the reply link so they receive ' + m.name + '!');
        yield* copyLink(tradeLink('tradeback', offer.id, m), 'trade reply');
      } else if (r === 2) {
        const items = s.replies.map(o => o.from + ': ' + G.speciesName(o.mon.species)).concat(['PASTE A LINK', 'CANCEL']);
        const k = yield* G.choose(items, { x: 60, y: 4, w: 254 });
        let reply = null;
        if (k >= 0 && k < s.replies.length) reply = s.replies[k];
        else if (items[k] === 'PASTE A LINK') { const got = yield* pasteLink(); if (got && got.type === 'reply') reply = got.reply; else if (got) { yield* say(absorb(got) || 'Saved.'); continue; } }
        if (!reply) continue;
        const out = s.outgoing.find(o => o.id === reply.id);
        s.replies = s.replies.filter(o => o.id !== reply.id);
        if (!out) { yield* say("That reply doesn't match any of your open offers. (Was it already completed?)"); continue; }
        const mine = G.Mon.from(out.mon), theirs = G.Mon.from(reply.mon);
        yield* G.tradeAnimation(mine, theirs);
        s.outgoing = s.outgoing.filter(o => o !== out);
        s.trades++;
        G.achieve('trade_' + reply.id, 'trade', { sp: theirs.species, from: mine.species, name: reply.from });
        yield* receive(theirs);
        yield* say('Trade complete! ' + reply.from + "'s " + theirs.name + ' is now yours.');
      } else if (r === 3) {
        if (!s.outgoing.length) { yield* say('You have no open offers.'); continue; }
        const items = s.outgoing.map(o => G.speciesName(o.mon.species) + ' Lv' + o.mon.level).concat(['CANCEL']);
        const k = yield* G.choose(items, { x: 150, y: 4, w: 164 });
        if (k < 0 || k >= s.outgoing.length) continue;
        const out = s.outgoing[k], m = G.Mon.from(out.mon);
        const a = yield* G.choose(['COPY LINK AGAIN', 'TAKE BACK', 'CANCEL'], { x: 170, y: 60, w: 144 });
        if (a === 0) yield* copyLink(tradeLink('trade', out.id, m), 'trade offer');
        else if (a === 1) { s.outgoing.splice(k, 1); if (G.state.party.length < 6) G.state.party.push(m); else (G.state.boxes[G.state.box] = G.state.boxes[G.state.box] || []).push(m); yield* say(m.name + ' came back to you!'); }
      } else { yield* say('Happy trading!'); return; }
    }
  }

  // ---------------- records, photographer, regulars ----------------
  function* records() {
    const s = S(), st = G.state;
    const sc = { opaque: false, t: 0, done: false, update(f) { this.t++; if (f && this.t > 10 && (G.input.pressed.a || G.input.pressed.b || (G.pointer && G.pointer.pressed))) { if (G.pointer) G.pointer.consume(); this.done = true; } }, draw(sf) {
      G.ui.frame(sf, 30, 10, 260, 160);
      G.logoText(sf, 'RECORDS', 160, 16, 2, '#b8f4ff', '#58c8f0', '#1a2a5a', '#0a0e24');
      const rows = [['BATTLE TOWER STREAK', s.streak], ['BEST STREAK', s.best], ['TOWER WINS', s.towerWins], ['BATTLE POINTS', s.bp + ' BP'],
        ['LINK BATTLE WINS', s.pvpWins + ' - ' + s.pvpLosses], ['VERSUS BATTLES', s.versus], ['TRADES', s.trades], ['FRIENDS', s.friends.length], ['MOMENTS', (st.achievements || []).length]];
      rows.forEach(([k, v], i) => { const y = 42 + i * 13; G.ui.text(sf, k, 46, y); const t = String(v); G.ui.text(sf, t, 274 - F.measure(t), y, hex('#3a68d8')); });
    } };
    yield* G.engine.run(sc);
  }
  function* photographer() {
    yield* say("Welcome to the PHOTO SPOT! I'll snap your TRAINER CARD so you can share it.");
    if (!(yield* ask('Say cheese?'))) { yield* say('Any time!'); return; }
    G.sfx && G.sfx('select');
    for (let i = 0; i < 6; i++) { G.fadeColor = G.PAL.white; G.fadeLevel = i % 2 ? 0 : 0.8; yield; }
    G.fadeLevel = 0;
    const st = G.state;
    yield* G.shareMoment({ id: 'card_' + st.name, kind: 'card', data: {}, t: st.playTime, date: Date.now(), badges: st.badges.length, dex: Object.keys(st.dex.caught).length });
  }
  const REGULAR_LINES = {
    SOCIAL_REGULAR_1: ["Every POKéMON CENTER's CABLE CLUB leads here. It's the same lounge wherever you log in!", "I send my team link to everyone. My BLASTOISE shows up in their lounge!"],
    SOCIAL_REGULAR_2: ["BATTLE TOWER tip: every 7th battle is a TOWER TYCOON. Bring your best three!", "Trade evolutions work here! Trade a KADABRA and watch it become ALAKAZAM."],
  };
  function* friendTalk(a) {
    const s = S(), f = s.friends.find(x => x.id === a.obj.friend);
    if (!f) return;
    yield* say(f.name + ': Hey ' + playerName() + '! My team: ' + f.team.map(m => G.speciesName(m.species)).join(', ') + '.');
    const r = yield* choose(['BATTLE', 'VERSUS', 'SAY BYE', 'CANCEL']);
    if (r === 0) yield* battleFriend(f, false);
    else if (r === 1) yield* battleFriend(f, true);
    else if (r === 2 && (yield* ask('Remove ' + f.name + ' from the lounge?'))) { s.friends = s.friends.filter(x => x !== f); refreshLounge(); yield* say(f.name + ' waved goodbye.'); }
  }

  const talk = {
    SOCIAL_TOWER_CLERK: towerDesk, SOCIAL_BP_CLERK: bpDesk, SOCIAL_LINK_CLERK: linkDesk, SOCIAL_VERSUS_HOST: versusDesk,
    SOCIAL_TRADE_CLERK: tradeDesk, SOCIAL_TRADE_HELPER: function* () { yield* say('Received a trade link? Just open it - or choose ACCEPT AN OFFER and PASTE A LINK.\fTraded POKéMON gain boosted EXP. Some even evolve when traded!'); },
    SOCIAL_PHOTOGRAPHER: photographer,
    SOCIAL_QUIZ_HOST: function* () {
      yield* say("It's time for... WHO'S THAT POKéMON?!\fName the silhouette before time runs out. Everyone gets the same DAILY 10!");
      yield* G.whosThatPokemon();
      G.music && G.music(G.mapMusic(G.ow.map));
    },
  };
  for (const k in REGULAR_LINES) talk[k] = function* () { const l = REGULAR_LINES[k]; yield* say(l[Math.floor(Math.random() * l.length)]); };
  for (let i = 0; i < SEATS.length; i++) talk['SOCIAL_FRIEND_' + i] = friendTalk;
  G.defMapScript(ZONE, {
    talk,
    sign: {
      SOCIAL_RECORDS: records,
      SOCIAL_WELCOME: function* () { yield* say("SOCIAL ZONE\fBATTLE TOWER - LINK BATTLES - TRADE CORNER\fEveryone here is a real trainer: talk to anyone to battle or trade, or press SELECT for the list!"); },
      SOCIAL_PHOTO: function* () { yield* say('PHOTO SPOT: talk to the photographer to snap and share your TRAINER CARD.'); },
    },
  });
  // opening a team / trade link: save it to the inbox, show who sent what, then carry on to the title screen
  G.socialLinkLanding = function (search) {
    if (!/[?&](team|trade|tradeback)=/.test(search || '')) return false;
    const r = G.socialReceiveLink(search);
    const who = r ? (r.friend || r.offer || r.reply) : null, from = who ? (who.name || who.from) : '';
    const lines = !r ? ["That link couldn't be read.", 'Ask your friend to copy it again!'] :
      r.type === 'team' ? [from + "'S TEAM SAVED!", r.friend.team.map(m => G.speciesName(m.species)).join(', ')] :
      r.type === 'offer' ? [from + ' OFFERS A TRADE:', G.speciesName(r.offer.mon.species) + ' Lv' + r.offer.mon.level] : [from + ' ANSWERED YOUR TRADE!', 'Complete it at the TRADE CORNER.'];
    const look = r && r.offer ? r.offer.look : r && r.friend ? r.friend.look : null;
    let pic = null;
    if (look) { G.CAST.social_landing = G.lookDef(look); pic = G.castPortrait('social_landing'); }
    const sc = { opaque: true, modal: true, t: 0, update(f) {
      this.t++; if (!f || this.t < 20) return;
      if (G.input.pressed.a || G.input.pressed.start || (G.pointer && G.pointer.pressed)) {
        if (G.pointer) G.pointer.consume();
        try { history.replaceState(null, '', location.pathname); } catch (e) {}
        G.engine.pop(sc); G.titleScreen();
      }
    }, draw(s) {
      for (let y = 0; y < 180; y++) for (let x = 0; x < 320; x++) s.data[y * 320 + x] = mix(hex('#1a1640'), hex('#3a2a6a'), y / 180);
      G.logoText(s, 'SOCIAL ZONE', 160, 10, 2, '#b8f4ff', '#58c8f0', '#1a2a5a', '#0a0e24');
      if (pic) s.blitScaled(pic, 8, 44, 128, 128);
      lines.forEach((l, i) => F.drawOutlined(s, l, pic ? 140 : 160 - F.measure(l) / 2, 60 + i * 16, hex(i ? '#ffe070' : '#ffffff'), hex('#0a0814')));
      const hint = ["Enter the SOCIAL ZONE from any", "POKéMON CENTER's CABLE CLUB!"];
      hint.forEach((l, i) => F.draw(s, l, pic ? 140 : 160 - F.measure(l) / 2, 104 + i * 13, hex('#d8d0f0')));
      if ((this.t >> 4) % 2) F.draw(s, 'CONTINUE ▶', 316 - F.measure('CONTINUE ▶'), 164, hex('#ffffff'));
    } };
    G.engine.push(sc);
    return true;
  };
  G.socialAbsorb = absorb; G.refreshLounge = refreshLounge; G.socialTradeLink = tradeLink;
  G.socialInternals = { ZONE, S, choose, monOut, monIn, lookIn, pickTeam, receive, talk };
})(window.G);
