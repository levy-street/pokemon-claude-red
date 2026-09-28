// Story scripting runtime: helpers used by per-map event scripts (src/scripts/*.js).
//
// Map scripts register with G.defMapScript(mapName, {
//   enter()            generator run after the map loads (optional)
//   step(x, y)         generator or null, checked after each player step (coordinate triggers)
//   talk: { OBJ_ID: function*(actor){} }   custom NPC interactions (object ids from the map data)
//   sign: { TEXT_CONST: function*(sign){} } custom sign interactions
//   hidden: { 'x,y': function*(){} }        custom hidden-event interactions
// })
(function (G) {
  'use strict';
  const MS = G.MAPSCRIPTS = {};
  G.mapMusic = G.mapMusic || (() => null);
  G.defMapScript = (name, def) => { MS[name] = Object.assign(MS[name] || {}, def); };

  const S = G.S = {};
  S.t = label => G.textFor(label);
  S.say = function* (x, opts) { yield* G.say(G.TEXT[x] ? G.TEXT[x] : x, opts); };
  S.ask = function* (x) { return yield* G.ask(G.TEXT[x] ? G.TEXT[x] : x); };
  S.flag = f => G.flag(f);
  S.set = (f, v) => G.setFlag(f, v);
  S.clear = f => G.clearFlag(f);
  S.wait = n => G.engine.wait(n);
  S.ow = () => G.ow;
  S.player = () => G.ow.player;
  S.map = () => G.ow.map;
  S.actor = id => G.ow.actors.find(a => a.obj && a.obj.id === id);
  S.key = (map, id) => map + ':' + id;
  // Persistently hide/show an object (by object id) on a map (defaults to the current map)
  S.hide = function (id, map) {
    map = map || G.ow.map.name;
    G.state.toggles[S.key(map, id)] = false;
    if (map === G.ow.map.name) { const a = S.actor(id); if (a) G.ow.actors.splice(G.ow.actors.indexOf(a), 1); }
  };
  S.show = function (id, map, pos) {
    map = map || G.ow.map.name;
    G.state.toggles[S.key(map, id)] = true;
    if (map === G.ow.map.name && !S.actor(id)) {
      const m = G.ow.map, i = m.objs.findIndex(o => o.id === id);
      if (i < 0) return null;
      const o = m.objs[i];
      let dir = ['UP', 'DOWN', 'LEFT', 'RIGHT'].includes(o.dir) ? o.dir.toLowerCase() : 'down';
      const a = new G.Actor({ x: pos ? pos[0] : o.x, y: pos ? pos[1] : o.y, dir, sprite: o.sprite, obj: o, key: S.key(map, id), home: [o.x, o.y], idleT: 60 });
      if (o.trainer) a.trainer = o.trainer;
      G.ow.actors.push(a);
      return a;
    }
    return S.actor(id);
  };
  S.isShown = (id, map) => { map = map || G.ow.map.name; const k = S.key(map, id); if (k in G.state.toggles) return G.state.toggles[k]; const o = G.maps.getMap(map).objs.find(x => x.id === id); return o ? (o.shown === undefined ? true : o.shown) : false; };
  const DIRC = { U: 'up', D: 'down', L: 'left', R: 'right' };
  // walk an actor along a path: 'UULLD' or ['up','up',...]; speed 1 walk, 2 run
  // Keep a hand-written route only while it stays walkable (no buildings, water, ledges or other actors on the
  // way); otherwise reach the same end point by a walkable route. The last cell may be a door, machine etc.
  function safeRoute(a, steps) {
    const ow = G.ow, m = ow.map; let x = a.x, y = a.y, ok = true;
    for (let i = 0; i < steps.length; i++) {
      const v = G.DIRS[steps[i]]; if (!v) return steps;
      const nx = x + v[0], ny = y + v[1];
      if (m.inside(nx, ny) && i < steps.length - 1) {
        const other = ow.actors.concat([ow.player]).find(o => o !== a && !o.hidden && !o.follower && !o.ghost && o.x === nx && o.y === ny); // the walking partner and other players never block a cutscene
        if (other || !(m.passable(nx, ny) || m.warpAt(nx, ny) >= 0) || ow.pairBlocked(x, y, nx, ny)) ok = false;
      }
      x = nx; y = ny;
    }
    if (ok || !m.inside(x, y)) return steps;
    const p = S.findPath(a, x, y, { blockedGoal: true });
    return p === null ? steps : p.split('').map(c => DIRC[c]);
  }
  const toSteps = path => typeof path === 'string' ? path.split('').map(c => DIRC[c]).filter(Boolean) : path;
  S.move = function* (a, path, speed) {
    if (typeof a === 'string') a = S.actor(a);
    if (!a) return;
    if (a.isPlayer) { yield* S.movePlayer(path, speed); return; }
    a.scripted = true;
    for (const d of safeRoute(a, toSteps(path))) {
      a.startMove(d, speed || 1);
      while (a.moving) { a.update(); yield; }
    }
    a.scripted = false;
  };
  // the player walks like a held d-pad: ledges are hopped, walls re-routed around
  S.movePlayer = function* (path, speed) {
    const p = G.ow.player; p.scripted = true;
    for (const d of safeRoute(p, toSteps(path))) {
      const r = G.ow.canMove(p, d), [dx, dy] = G.DIRS[d], m = G.ow.map;
      // a blocked press just turns the player (walls, NPCs), except into warps which scripts walk through on purpose
      if (!r.ok && m.inside(p.x + dx, p.y + dy) && m.warpAt(p.x + dx, p.y + dy) < 0) { p.dir = d; continue; }
      if (r.jump) p.startMove(d, 2, true); else p.startMove(d, speed || 1);
      while (p.moving) yield;
    }
    G.state.x = p.x; G.state.y = p.y; G.state.dir = p.dir;
    p.scripted = false;
  };
  // move both together (e.g. following), paths of equal length
  S.moveTogether = function* (pairs) {
    const n = Math.max(...pairs.map(([, p]) => p.length));
    const act = a0 => typeof a0 === 'string' ? S.actor(a0) : a0;
    for (const [a0] of pairs) { const a = act(a0); if (a) a.scripted = true; }
    for (let i = 0; i < n; i++) {
      for (const [a, p] of pairs) { const d = DIRC[p[i]]; if (d) act(a).startMove(d, 1); }
      let busy = true;
      while (busy) { busy = false; for (const [a0] of pairs) { const a = act(a0); if (a && a.moving) { busy = true; if (!a.isPlayer) a.update(); } } if (busy) yield; }
    }
    for (const [a0] of pairs) { const a = act(a0); if (a) a.scripted = false; }
    const p = G.ow.player; G.state.x = p.x; G.state.y = p.y;
  };
  S.face = (a, dir) => { if (typeof a === 'string') a = S.actor(a); if (a) a.dir = dir; };
  S.facePlayer = a => { if (typeof a === 'string') a = S.actor(a); const p = G.ow.player; if (!a) return; const dx = p.x - a.x, dy = p.y - a.y; a.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'); };
  S.faceTo = (a, b) => { if (typeof a === 'string') a = S.actor(a); if (typeof b === 'string') b = S.actor(b); const dx = b.x - a.x, dy = b.y - a.y; a.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'); };
  S.emote = function* (a, kind, n) { if (typeof a === 'string') a = S.actor(a); if (!a) return; a.emote = kind || '!'; a.emoteT = 0; G.sfx && G.sfx(kind === '!' ? 'exclaim' : 'blip'); yield* G.engine.wait(n || 40); a.emote = null; };
  // Shortest walkable route for scripted walks (never through buildings, water, ledges or other actors);
  // among equally short routes it prefers the fewest turns so escorts walk in clean L-shapes.
  // Returns 'UDLR…', or null when the goal can't be reached.
  S.findPath = function (a, tx, ty, opts) {
    opts = opts || {};
    const ow = G.ow, m = ow.map;
    if (a.x === tx && a.y === ty) return '';
    const skip = new Set([a].concat(opts.ignore || []));
    const occ = new Set();
    for (const o of ow.actors.concat([ow.player])) if (!skip.has(o) && !o.hidden && !o.follower && !o.ghost) occ.add(o.x + ',' + o.y);
    const goal = (x, y) => x === tx && y === ty;
    const walk = (x, y) => m.inside(x, y) && !occ.has(x + ',' + y) &&
      (m.passable(x, y) || (goal(x, y) && (opts.blockedGoal || m.warpAt(x, y) >= 0)));
    const D = [['U', 0, -1], ['D', 0, 1], ['L', -1, 0], ['R', 1, 0]];
    const W = m.w, key = (x, y, d) => (y * W + x) * 4 + d;
    const cost = new Map(), prev = new Map(), open = [];
    const push = (c, x, y, d, pk) => { const k = key(x, y, d); if (cost.has(k) && cost.get(k) <= c) return; cost.set(k, c); prev.set(k, pk); open.push([c, x, y, d]); };
    for (let d = 0; d < 4; d++) { const [, dx, dy] = D[d], nx = a.x + dx, ny = a.y + dy; if (walk(nx, ny) && !ow.pairBlocked(a.x, a.y, nx, ny)) push(100, nx, ny, d, -1); }
    let end = -1;
    for (let guard = 0; open.length && guard < 20000; guard++) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const [c, x, y, d] = open.splice(bi, 1)[0], k = key(x, y, d);
      if (cost.get(k) < c) continue;
      if (goal(x, y)) { end = k; break; }
      for (let nd = 0; nd < 4; nd++) {
        const [, dx, dy] = D[nd], nx = x + dx, ny = y + dy;
        if (!walk(nx, ny) || ow.pairBlocked(x, y, nx, ny) || (m.warpAt(nx, ny) >= 0 && !goal(nx, ny))) continue;
        push(c + 100 + (nd === d ? 0 : 1), nx, ny, nd, k);
      }
    }
    if (end < 0) return null;
    let out = '';
    for (let k = end; k !== -1; k = prev.get(k)) out = D[k % 4][0] + out;
    return out;
  };
  // route from actor to (tx,ty): walkable path when one exists, else straight lines (x first)
  S.pathTo = function (a, tx, ty, opts) {
    const p = S.findPath(a, tx, ty, opts);
    if (p !== null) return p;
    let s = '';
    const dx = tx - a.x, dy = ty - a.y;
    if (dy < 0) s += 'U'.repeat(-dy);
    s += (dx > 0 ? 'R' : 'L').repeat(Math.abs(dx));
    if (dy > 0) s += 'D'.repeat(dy);
    return s;
  };
  S.give = function* (item, n, msg) {
    n = n || 1;
    if (!G.bag.add(item, n)) { yield* G.say('No more room for items!'); return false; }
    G.sfx && G.sfx(/^(TM|HM)_/.test(item) ? 'get_tm' : G.bag.isKey(item) ? 'get_key' : 'get_item');
    // "received a {wStringBuffer}!" texts name the item through this buffer: fill it before formatting the message,
    // or it still holds whatever was last put there (the starter's name from Oak's lab, for the Town Map)
    G.textVars.wStringBuffer = G.textVars.wNameBuffer = G.itemName(item);
    yield* G.say(msg ? G.fmt(msg) : (G.state.name + ' received ' + (n > 1 ? n + ' ' : '') + G.itemName(item) + '!'));
    return true;
  };
  S.giveMon = function* (sp, lv, opts) {
    const m = new G.Mon(sp, lv, opts);
    G.sfx && G.sfx('get_mon');
    yield* G.say(G.state.name + ' got ' + m.sp.name + '!');
    G.dexCaught(sp);
    return yield* G.receiveMon(m, null);
  };
  S.battle = function* (cls, n, opts) { return yield* G.startTrainerBattle(cls, n, opts); };
  S.warp = function* (map, x, y, dir, noFade) {
    if (!noFade) yield* G.fadeOut(10);
    G.ow.load(map, x, y, dir || G.ow.player.dir);
    if (!noFade) yield* G.fadeIn(10);
  };
  S.music = name => { G.music && G.music(name); };
  S.shake = n => { G.ow.shake = n || 6; };
  S.hasBadge = b => G.state.badges.includes(b);
  S.badgeCount = () => G.state.badges.length;
  S.partyHas = sp => G.state.party.some(m => m.species === sp);

  // ---------------- dispatch hooks used by the overworld ----------------
  G.scripts = {
    onEnter(map) {
      const ms = MS[map.name];
      if (ms && ms.enter) { const g = ms.enter(); if (g && g.next) G.spawnScript(g, 'enter:' + map.name); }
    },
    onStep(map, x, y) {
      const ms = MS[map.name];
      if (ms && ms.step) { const g = ms.step(x, y); if (g && g.next) { G.spawnScript(g, 'step:' + map.name); return true; } }
      return false;
    },
    talk(map, a) {
      const ms = MS[map.name];
      if (ms && ms.talk && a.obj && ms.talk[a.obj.id]) return ms.talk[a.obj.id](a);
      // generic data-driven behaviours
      if (a.obj && a.obj.sprite === 'nurse') return G.nurseHeal(a);
      if (a.obj && a.obj.sprite === 'link_receptionist' && /Pokecenter|Lobby/.test(map.name)) return (function* () {
        yield* G.say(G.TEXT.CableClubNPCWelcomeText || 'Welcome to the Cable Club!');
        yield* G.say(G.TEXT.CableClubNPCAreaReservedFor2FriendsLinkedByCableText || 'This area is reserved for 2 friends linked by cable.');
        yield* G.say(G.TEXT.CableClubNPCPleaseComeAgainText || 'Please come again!');
      })();
      if (a.obj && a.obj.mon) return G.staticEncounter(a);
      if (a.obj && a.obj.sprite === 'clerk' && G.martFor(map, a)) return G.mart(G.martFor(map, a));
      return null;
    },
    sign(map, sign) {
      const ms = MS[map.name];
      if (ms && ms.sign && ms.sign[sign.text]) return ms.sign[sign.text](sign);
      return null;
    },
  };

  // Marts: clerk text labels map onto mart inventories
  G.martFor = function (map, a) {
    const lbl = a.obj.textLabel;
    const inv = G.DATA.marts[lbl];
    return inv || null;
  };

  // Static Pokémon (Snorlax, Voltorb items, legendaries) placed as map objects
  G.staticEncounter = function* (a) {
    const { species, level } = a.obj.mon;
    const ms = MS[G.ow.map.name];
    if (ms && ms.beforeStatic) { const ok = yield* ms.beforeStatic(a); if (ok === false) return; }
    G.cry && G.cry(species);
    yield* G.say(G.textFor(a.obj.textLabel) === '...' ? G.speciesName(species) + '!' : G.textFor(a.obj.textLabel));
    const r = yield* G.startWildBattle(species, level, { noRun: false, music: 'legendary' });
    if (r === 'win' || r === 'caught') S.hide(a.obj.id);
    return r;
  };

  // ---------------- hidden events ----------------
  G.hiddenEvent = function (h, dir) {
    const ms = MS[G.ow.map.name];
    if (ms && ms.hidden && ms.hidden[h.x + ',' + h.y]) return ms.hidden[h.x + ',' + h.y](h);
    switch (h.fn) {
      case 'OpenPokemonCenterPC': case 'OpenRedsPC': case 'BillsHousePC': return dir === 'up' ? G.usePC() : null;
      case 'HiddenItems': return (function* () {
        const key = 'HIDDEN_' + G.ow.map.name + '_' + h.x + '_' + h.y;
        if (G.flag(key)) return;
        const found = G.state.name + ' found ' + G.itemName(h.arg) + '!';
        // bag full: leave it hidden there for later
        if (!G.bag.canAdd(h.arg, 1)) { yield* G.say(found + '\f' + G.fmt(G.textFor('HiddenItemBagFullText'))); return; }
        G.setFlag(key);
        yield* S.give(h.arg, 1, found);
      })();
      case 'HiddenCoins': return (function* () {
        const key = 'HIDDENCOIN_' + G.ow.map.name + '_' + h.x + '_' + h.y;
        if (G.flag(key) || !G.bag.has('COIN_CASE')) return;
        G.setFlag(key); const n = +String(h.arg).replace(/\D/g, '') || 10;
        G.state.coins = Math.min(9999, (G.state.coins || 0) + n);
        yield* G.say(G.state.name + ' found ' + n + ' coins!');
      })();
      case 'PrintBenchGuyText': return null;
      case 'PrintBookcaseText': return G.say(G.textFor('BookcaseText') !== '...' ? G.textFor('BookcaseText') : 'Crammed full of POKéMON books!');
      case 'PrintMagazinesText': return G.say(G.textFor('MagazinesText') !== '...' ? G.textFor('MagazinesText') : 'POKéMON magazines! POKéMON notebooks! POKéMON graphs!');
      case 'PrintTrashText': return G.say(G.textFor('TrashText') !== '...' ? G.textFor('TrashText') : 'Nothing here but trash.');
      case 'PrintRedSNESText': return G.say(G.textFor('RedBedroomSNESText') !== '...' ? G.textFor('RedBedroomSNESText') : G.state.name + ' is playing the SNES!\f...Okay! It\'s time to go!');
      case 'GymStatues': return dir === 'up' ? G.gymStatue() : null;
      case 'StartSlotMachine': return dir === 'up' && G.slotMachine ? G.slotMachine() : null;
      case 'GymTrashScript': return G.vermilionTrash ? G.vermilionTrash(h) : null;
      case 'PrintCinnabarQuiz': return G.cinnabarQuiz ? G.cinnabarQuiz(h) : null;
      default: {
        const lbl = h.arg && G.TEXT[h.arg] ? h.arg : null;
        if (lbl) return G.say(G.TEXT[lbl]);
        return null;
      }
    }
  };
  G.gymStatue = function* () {
    const gym = G.ow.map.name.replace('Gym', '').toUpperCase();
    const leaderFlag = { PEWTER: 'EVENT_BEAT_BROCK', CERULEAN: 'EVENT_BEAT_MISTY', VERMILION: 'EVENT_BEAT_LT_SURGE', CELADON: 'EVENT_BEAT_ERIKA', FUCHSIA: 'EVENT_BEAT_KOGA', SAFFRON: 'EVENT_BEAT_SABRINA', CINNABAR: 'EVENT_BEAT_BLAINE', VIRIDIAN: 'EVENT_BEAT_VIRIDIAN_GYM_GIOVANNI' }[gym];
    const town = G.ow.map.name.replace('Gym', '').toUpperCase();
    yield* G.say(town + ' POKéMON GYM\fLEADER: ' + ({ PEWTER: 'BROCK', CERULEAN: 'MISTY', VERMILION: 'LT.SURGE', CELADON: 'ERIKA', FUCHSIA: 'KOGA', SAFFRON: 'SABRINA', CINNABAR: 'BLAINE', VIRIDIAN: '?' }[gym] || '?') +
      '\fWINNING TRAINERS: ' + (G.flag(leaderFlag) ? G.state.rival + '\f' + G.state.name : G.state.rival));
  };
  // bookshelves / posters etc. from tile ids
  G.fieldInteract = function (fx, fy) {
    const m = G.ow.map;
    const q = m.quad(fx, fy); if (!q) return null;
    const tsName = m.tsName.replace(/([a-z])([A-Z0-9])/g, '$1_$2').toUpperCase();
    for (const [ts, tile, txt] of G.MAPDATA.bookshelves) {
      if ((ts === tsName || (ts === 'REDS_HOUSE_1' && m.tsFile === 'reds_house')) && q.includes(tile)) {
        const fallback = { BookOrSculptureText: 'Crammed full of POKéMON books!', TownMapText: 'A TOWN MAP.', PokemonStuffText: 'Wow! Tons of POKéMON stuff!', ElevatorText: 'This is an elevator.', IndigoPlateauStatues: 'INDIGO PLATEAU\fThe ultimate goal of trainers! POKéMON LEAGUE HQ' }[txt];
        if (txt === 'TownMapText' && G.showTownMap) return G.showTownMap();
        return G.say(G.TEXT[txt] || fallback || '...');
      }
    }
    if (G.fieldMoveInteract) return G.fieldMoveInteract(fx, fy);
    return null;
  };
})(window.G);

// ---------------- reusable story helpers ----------------
(function (G) {
  'use strict';
  const S = G.S;
  // Award a badge with fanfare. Also marks all trainers of the current gym as beaten if trainerFlags given.
  S.awardBadge = function* (badge, text) {
    if (!G.state.badges.includes(badge)) G.state.badges.push(badge);
    G.sfx && G.sfx('get_badge');
    G.music && G.music('badge', true);
    yield* G.say(text || (G.state.name + ' received the ' + badge + '!'));
    G.music && G.music(G.mapMusic(G.ow.map));
  };
  // Standard gym-leader encounter.
  // o = { cls, n, flag, badge, before:'Label', win:'Label (end-of-battle line)', after:'Label (post-win talk)', badgeText:'Label', badgeInfo:'Label', tm:'TM_X', tmText:'Label', tmInfo:'Label', gymTrainerFlags:[...] }
  S.gymLeader = function* (o) {
    if (G.flag(o.flag)) {
      if (o.tm && !G.flag(o.flag + '_TM')) { if (o.tmText) yield* S.say(o.tmText); if (yield* S.give(o.tm)) { G.setFlag(o.flag + '_TM'); if (o.tmInfo) yield* S.say(o.tmInfo); } return; }
      yield* S.say(o.after); return;
    }
    yield* S.say(o.before);
    const r = yield* S.battle(o.cls, o.n || 1, { winText: G.fmt(G.textFor(o.win)) });
    if (r !== 'win') return;
    G.setFlag(o.flag);
    for (const f of o.gymTrainerFlags || []) G.setFlag(f);
    if (o.badgeText) yield* S.say(o.badgeText);
    yield* S.awardBadge(o.badge);
    if (o.badgeInfo) yield* S.say(o.badgeInfo);
    if (o.tm) {
      if (o.tmText) yield* S.say(o.tmText);
      if (yield* S.give(o.tm)) { G.setFlag(o.flag + '_TM'); if (o.tmInfo) yield* S.say(o.tmInfo); }
    }
  };
  // In-game trade by index into G.DATA.trades. texts: {ask, wrong, no, done, after} labels or strings.
  S.inGameTrade = function* (idx, texts) {
    const tr = G.DATA.trades[idx], key = 'TRADED_' + idx;
    const give = G.speciesName(tr.give), get = G.speciesName(tr.get);
    G.textVars.wInGameTradeGiveMonName = give; G.textVars.wInGameTradeReceiveMonName = get;
    if (G.flag(key)) { yield* S.say(texts.after || 'How is my old ' + get + '?'); return; }
    if (!(yield* S.ask(texts.ask || ("I'm looking for " + give + "! Wanna trade one for " + get + '?')))) { yield* S.say(texts.no || 'Well, if you don\'t want to...'); return; }
    const i = yield* G.partyScreen({ msg: 'Trade which POKéMON?', pick: function* () { return true; } });
    if (i < 0) { yield* S.say(texts.no || 'Well, if you don\'t want to...'); return; }
    const m = G.state.party[i];
    if (m.species !== tr.give) { yield* S.say(texts.wrong || ('Hmmm? This isn\'t ' + give + '.')); return; }
    const nm = new G.Mon(tr.get, m.level, { nick: tr.nick, ot: 'TRAINER', otId: 12345 });
    G.state.party[i] = nm;
    G.dexCaught(tr.get);
    G.setFlag(key);
    if (G.tradeAnimation) yield* G.tradeAnimation(m, nm);
    yield* G.say(G.state.name + ' traded ' + m.name + ' for ' + tr.nick + '!');
    yield* S.say(texts.done || 'Thanks!');
    const evo = nm.evoByTrade && nm.evoByTrade(); if (evo) yield* G.evolve(nm, evo, true);
  };
  // Gift Pokémon (Eevee, Lapras, Hitmonlee/chan, fossil revivals, Magikarp purchase...)
  S.giftMon = function* (sp, lv, flag) {
    if (flag && G.flag(flag)) return false;
    if (G.state.party.length >= 6 && (G.state.boxes[G.state.box] || []).length >= 20) { yield* G.say("There's no more room for POKéMON!"); return false; }
    yield* S.giveMon(sp, lv);
    if (flag) G.setFlag(flag);
    return true;
  };
  // Human-friendly map names for banners and menus
  const SPECIAL = { MtMoon: 'MT.MOON', SSAnne: 'S.S.ANNE', CeruleanCave: 'CERULEAN CAVE', SeafoamIslands: 'SEAFOAM ISLANDS', PokemonTower: 'POKéMON TOWER', PokemonMansion: 'POKéMON MANSION', SilphCo: 'SILPH CO.', SafariZone: 'SAFARI ZONE', RockTunnel: 'ROCK TUNNEL', VictoryRoad: 'VICTORY ROAD', DiglettsCave: "DIGLETT's CAVE", PowerPlant: 'POWER PLANT', ViridianForest: 'VIRIDIAN FOREST', IndigoPlateau: 'INDIGO PLATEAU', UndergroundPath: 'UNDERGROUND PATH', RocketHideout: 'ROCKET HIDEOUT' };
  G.mapDisplayName = function (m) {
    const n = m.name;
    for (const k in SPECIAL) if (n.startsWith(k)) return SPECIAL[k];
    const r = n.match(/^Route(\d+)/); if (r) return 'ROUTE ' + r[1];
    return n.replace(/([a-z])([A-Z0-9])/g, '$1 $2').toUpperCase();
  };
})(window.G);
