// Story events: early game region (see tools/SCRIPT_GUIDE.md).
// Viridian Forest, Route 2, Pewter City, Route 3, Mt. Moon, Route 4, Cerulean City, Routes 24/25 + Bill,
// Routes 5/6 + gates + Underground Path, Vermilion City + gym + dock, S.S. Anne, Diglett's Cave houses,
// Route 11 (+ gate), Route 9, Route 10 / Rock Tunnel Pokécenter.
(function (G) {
  'use strict';
  const S = G.S;

  // ======================================================================
  // helpers
  // ======================================================================
  const rnd = n => Math.floor(Math.random() * n);
  const txt = l => (G.TEXT[l] !== undefined ? G.TEXT[l] : l);
  const join = (...ls) => ls.map(txt).join('\f');
  const fmt = (...ls) => G.fmt(join(...ls));
  const cry = sp => { G.cry && G.cry(sp); };
  const sfx = n => { G.sfx && G.sfx(n); };
  const mapMusic = () => S.music(G.mapMusic(G.ow.map));
  const D4 = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
  const DIRC = { U: 'up', D: 'down', L: 'left', R: 'right' };

  // Give an item silently (no generic "received" line); plays the right jingle and prints `label` on success.
  function* got(item, n, label) {
    if (!G.bag.add(item, n || 1)) return false;
    G.textVars.wStringBuffer = G.itemName(item);
    sfx(/^(TM|HM)_/.test(item) ? 'get_tm' : G.bag.isKey(item) ? 'get_key' : 'get_item');
    if (label) yield* S.say(label);
    return true;
  }
  // Money window in the top-right corner (as in the museum / Magikarp / bike shop dialogues)
  function moneyBox() {
    const box = { done: false, draw(s) {
      const t = '$' + G.state.money, w = Math.max(90, G.font.measure(t) + 30);
      G.ui.frame(s, 316 - w, 4, w, 38, 'gray');
      G.ui.text(s, 'MONEY', 328 - w, 11);
      G.ui.text(s, t, 304 - G.font.measure(t), 25);
      return !this.done;
    } };
    G.ow.fx.push(box);
    return box;
  }
  // Question left on screen while a custom menu is open
  function* menuWithText(label, items, opts) {
    yield* S.say(label, { noWait: true });
    const bg = new G.ui.StaticBox(G.fmt(txt(label)));
    G.engine.push(bg);
    const r = yield* G.choose(items, opts);
    G.engine.pop(bg);
    return r;
  }
  // Wait for a door/warp transition to finish before a scripted sequence starts
  function* waitWarp() {
    yield;
    while (G.fadeLevel > 0 || G.engine.tasks.some(t => t.name === 'warp' && !t.done)) yield;
  }
  // Walkable for scripted player moves: passable, no actors, no warps
  function freeCell(x, y) {
    const ow = G.ow, m = ow.map;
    if (!m.passable(x, y) || m.warpAt(x, y) >= 0) return false;
    return !ow.actorAt(x, y, ow.player);
  }
  // Shortest path (as 'UDLR' string) for the player to (tx,ty)
  function bfs(tx, ty) {
    const p = G.ow.player, key = (x, y) => x + ',' + y;
    const prev = new Map([[key(p.x, p.y), null]]), q = [[p.x, p.y]];
    while (q.length) {
      const [x, y] = q.shift();
      if (x === tx && y === ty) {
        let s = '', k = key(x, y);
        while (prev.get(k)) { const [d, pk] = prev.get(k); s = d + s; k = pk; }
        return s;
      }
      for (const d of 'UDLR') {
        const nx = x + D4[d][0], ny = y + D4[d][1], k = key(nx, ny);
        if (prev.has(k) || !freeCell(nx, ny) || G.ow.pairBlocked(x, y, nx, ny)) continue;
        prev.set(k, [d, key(x, y)]); q.push([nx, ny]);
      }
    }
    return null;
  }
  // An NPC walks `path` and the player follows one step behind (Pewter City guides)
  function* lead(guy, path) {
    const p = G.ow.player;
    const T = [[guy.x, guy.y]];
    for (const c of path) { const [x, y] = T[T.length - 1]; T.push([x + D4[c][0], y + D4[c][1]]); }
    const onT = (x, y, n) => T.slice(0, n).some(t => t[0] === x && t[1] === y);
    G.ow.locks++;
    try {
      // step out of the guide's way if standing on the first tiles of his route
      if (onT(p.x, p.y, 3)) {
        for (const d of 'LRDU') {
          const nx = p.x + D4[d][0], ny = p.y + D4[d][1];
          if (freeCell(nx, ny) && !onT(nx, ny, 3)) { yield* S.movePlayer(d); break; }
        }
      }
      yield* S.move(guy, path[0]);
      const pre = bfs(T[0][0], T[0][1]);
      if (pre) yield* S.movePlayer(pre);
      else { p.x = T[0][0]; p.y = T[0][1]; }
      for (let i = 1; i < path.length; i++) yield* S.moveTogether([[guy, path[i]], [p, path[i - 1]]]);
      p.dir = DIRC[path[path.length - 2] || path[0]];
      G.state.x = p.x; G.state.y = p.y;
    } finally { G.ow.locks--; }
  }
  function* sayCry(label, sp) { cry(sp); yield* S.say(label); }
  const caughtCount = () => Object.keys(G.state.dex.caught).length;

  // ---- Prof. Oak's aides (engine/events/oaks_aide.asm) ----
  function* oaksAide(req, item, flag, explain) {
    if (!S.flag(flag)) {
      G.textVars.wOaksAideRewardItemName = G.itemName(item);
      G.textVars.hOaksAideRequirement = req;
      if (!(yield* S.ask('OaksAideHiText'))) { yield* S.say('OaksAideComeBackText'); return; }
      const own = caughtCount();
      G.textVars.hOaksAideNumMonsOwned = own;
      if (own < req) { yield* S.say('OaksAideUhOhText'); return; }
      yield* S.say('OaksAideHereYouGoText');
      if (!G.bag.add(item, 1)) { yield* S.say('OaksAideNoRoomText'); return; }
      sfx(/^HM_/.test(item) ? 'get_tm' : 'get_item');
      yield* S.say('OaksAideGotItemText');
      S.set(flag);
    }
    yield* S.say(explain);
  }

  // ---- In-game trades (engine/events/in_game_trades.asm) ----
  const TRADE_SET = { TRADE_DIALOGSET_CASUAL: 1, TRADE_DIALOGSET_EVOLUTION: 2, TRADE_DIALOGSET_HAPPY: 3 };
  function tradeScene(give, get) {
    const P = G.PAL;
    return { opaque: true, t: 0, done: false, update() { if (++this.t > 150) this.done = true; }, draw(s) {
      G.menuBg(s, '#3a5aa8', '#2e4a90', this.t);
      const t = this.t;
      if (t < 70) s.blit(G.pokeSprite(give, 'front'), 128 - Math.max(0, t - 30) * 6, 40);
      else s.blit(G.pokeSprite(get, 'front'), 128 + Math.max(0, 110 - t) * 6, 40);
      // the cable
      for (let x = 0; x < 320; x += 4) s.pset(x, 128 + Math.round(Math.sin((x + t * 4) / 12) * 2), P.white);
      if (t === 110) cry(get);
    } };
  }
  function* trade(idx) {
    const tr = G.DATA.trades[idx], set = TRADE_SET[tr.dialog] || 1, key = 'TRADED_' + idx;
    G.textVars.wInGameTradeGiveMonName = G.speciesName(tr.give);
    G.textVars.wInGameTradeReceiveMonName = G.speciesName(tr.get);
    if (S.flag(key)) { yield* S.say('AfterTrade' + set + 'Text'); return; }
    if (!(yield* S.ask('WannaTrade' + set + 'Text'))) { yield* S.say('NoTrade' + set + 'Text'); return; }
    const i = yield* G.partyScreen({ msg: 'Trade which POKéMON?', pick: function* () { return true; } });
    if (i < 0) { yield* S.say('NoTrade' + set + 'Text'); return; }
    const m = G.state.party[i];
    if (m.species !== tr.give) { yield* S.say('WrongMon' + set + 'Text'); return; }
    S.set(key);
    yield* S.say('ConnectCableText');
    yield* G.fadeOut(10);
    const sc = tradeScene(tr.give, tr.get);
    G.engine.push(sc); yield* G.fadeIn(10);
    while (!sc.done) yield;
    yield* G.fadeOut(10); G.engine.pop(sc); yield* G.fadeIn(10);
    // the traded mon leaves the party; the new one is appended at the end
    const nm = new G.Mon(tr.get, m.level, { nick: tr.nick, ot: 'TRAINER', otId: 10000 + rnd(50000) });
    G.state.party.splice(i, 1);
    G.state.party.push(nm);
    G.dexCaught(tr.get);
    sfx('get_key');
    yield* S.say('TradedForText');
    yield* S.say('Thanks' + set + 'Text');
  }

  // ---- Gym leaders ----
  // o: { cls, flag, tmFlag, tm, badge, before, win:[labels], info, tmText:[labels], noRoom, after, trainers:[flags], onWin }
  function* leaderReward(o) {
    yield* S.say(o.info);
    S.set(o.flag);
    if (yield* got(o.tm, 1)) { yield* S.say(join(...o.tmText)); S.set(o.tmFlag); }
    else yield* S.say(o.noRoom);
    if (!S.hasBadge(o.badge)) G.state.badges.push(o.badge);
    for (const f of o.trainers) S.set(f);
    if (o.onWin) o.onWin();
  }
  function* leaderTalk(o) {
    if (S.flag(o.flag)) {
      if (!S.flag(o.tmFlag)) { yield* leaderReward(o); return; }
      yield* S.say(o.after); return;
    }
    yield* S.say(o.before);
    const r = yield* S.battle(o.cls, 1, { winText: fmt(...o.win) });
    if (r !== 'win') return;
    sfx('get_badge');
    yield* leaderReward(o);
  }

  // ---- Pokécenter bench guys (engine/events/hidden_events/bench_guys.asm) ----
  const benchGuy = label => function* () { if (S.player().dir === 'left') yield* S.say(label); };

  // ---- Fossil / Pokédex pop-ups ----
  function* monPopup(sp, label, fossil) {
    const pic = { done: false, draw(s) {
      G.ui.frame(s, 104, 16, 112, 100);
      s.blit(G.pokeSprite(sp, 'front'), 128, 30, fossil ? { tint: G.gfx.hex('#b8a888'), tintAmt: 0.75 } : undefined);
      return !this.done;
    } };
    G.ow.fx.push(pic);
    if (!fossil) cry(sp);
    yield* S.say(label);
    pic.done = true;
  }

  // ======================================================================
  // data fix-up: Route 9 trainer headers (the importer missed `jr Route9TalkToTrainer`)
  // ======================================================================
  (function patchRoute9() {
    const m = G.MAPDATA && G.MAPDATA.maps.Route9; if (!m) return;
    const H = [['COOLTRAINER_F1', 0, 3, 'CooltrainerF1'], ['COOLTRAINER_M1', 1, 2, 'CooltrainerM1'], ['COOLTRAINER_M2', 2, 4, 'CooltrainerM2'],
      ['COOLTRAINER_F2', 3, 2, 'CooltrainerF2'], ['HIKER1', 4, 2, 'Hiker1'], ['HIKER2', 5, 3, 'Hiker2'], ['YOUNGSTER1', 6, 4, 'Youngster1'],
      ['HIKER3', 7, 2, 'Hiker3'], ['YOUNGSTER2', 8, 2, 'Youngster2']];
    for (const [id, n, range, t] of H) {
      const o = m.objs.find(x => x.id === 'ROUTE9_' + id);
      if (o && o.trainer && !o.th) o.th = { flag: 'EVENT_BEAT_ROUTE_9_TRAINER_' + n, range, battle: 'Route9' + t + 'BattleText', end: 'Route9' + t + 'EndBattleText', after: 'Route9' + t + 'AfterBattleText' };
    }
  })();

  // Mt. Moon B2F: no wild battles in the fossil area once the Super Nerd is beaten (BIT_NO_BATTLES)
  if (G.encounters && !G.encounters._earlyWrapped) {
    const orig = G.encounters.check;
    G.encounters.check = function (map, x, y, surfing) {
      if (map.name === 'MtMoonB2F' && G.flag('EVENT_BEAT_MT_MOON_EXIT_SUPER_NERD') && x >= 11 && x <= 14 && y >= 5 && y <= 8) return false;
      return orig.call(this, map, x, y, surfing);
    };
    G.encounters._earlyWrapped = true;
  }

  // ======================================================================
  // Route 2
  // ======================================================================
  G.defMapScript('Route2Gate', {
    talk: { ROUTE2GATE_OAKS_AIDE: function* () { yield* oaksAide(10, 'HM_FLASH', 'EVENT_GOT_HM05', 'Route2GateOaksAideFlashExplanationText'); } },
  });
  G.defMapScript('Route2TradeHouse', {
    talk: { ROUTE2TRADEHOUSE_GAMEBOY_KID: function* () { yield* trade(1); } }, // ABRA -> MR.MIME "MARCEL"
  });
  G.defMapScript('DiglettsCaveRoute2', { enter() { G.state.lastOutdoor = 'Route2'; return null; } });
  G.defMapScript('DiglettsCaveRoute11', { enter() { G.state.lastOutdoor = 'Route11'; return null; } });

  // ======================================================================
  // Pewter City
  // ======================================================================
  const GYM_GUY_PATH = 'DD' + 'L'.repeat(15) + 'UUUUU' + 'L'.repeat(11) + 'DDDDD' + 'RRR';
  const MUSEUM_GUY_PATH = 'UUUUUU' + 'L'.repeat(13) + 'UUU' + 'L';
  function* pewterGymGuy() {
    const g = S.actor('PEWTERCITY_YOUNGSTER'); if (!g) return;
    yield* S.say('PewterCityYoungsterYoureATrainerFollowMeText');
    yield* lead(g, GYM_GUY_PATH);
    g.dir = 'left';
    yield* S.say('PewterCityYoungsterGoTakeOnBrockText');
    yield* S.move(g, 'RRRRR');
    S.hide('PEWTERCITY_YOUNGSTER');
    S.show('PEWTERCITY_YOUNGSTER'); // back at his post
  }
  function* pewterMuseumGuy() {
    const g = S.actor('PEWTERCITY_SUPER_NERD1'); if (!g) return;
    yield* lead(g, MUSEUM_GUY_PATH);
    g.dir = 'up';
    yield* S.say('PewterCitySuperNerd1ItsRightHereText');
    yield* S.move(g, 'DDDD');
    S.hide('PEWTERCITY_SUPER_NERD1');
    S.show('PEWTERCITY_SUPER_NERD1');
  }
  G.defMapScript('PewterCity', {
    enter() { S.clear('EVENT_BOUGHT_MUSEUM_TICKET'); return null; },
    step(x, y) {
      if (G.scriptRunning || S.flag('EVENT_BEAT_BROCK') || !S.actor('PEWTERCITY_YOUNGSTER')) return null;
      if ((y === 17 && (x === 35 || x === 36)) || (x === 37 && (y === 18 || y === 19))) return pewterGymGuy();
      return null;
    },
    talk: {
      PEWTERCITY_YOUNGSTER: function* () { yield* pewterGymGuy(); },
      PEWTERCITY_SUPER_NERD1: function* () {
        if (yield* S.ask('PewterCitySuperNerd1DidYouCheckOutMuseumText')) { yield* S.say('PewterCitySuperNerd1WerentThoseFossilsAmazingText'); return; }
        yield* S.say('PewterCitySuperNerd1YouHaveToGoText');
        yield* pewterMuseumGuy();
      },
      PEWTERCITY_SUPER_NERD2: function* () {
        if (yield* S.ask('PewterCitySuperNerd2DoYouKnowWhatImDoingText')) yield* S.say('PewterCitySuperNerd2ThatsRightText');
        else yield* S.say('PewterCitySuperNerd2ImSprayingRepelText');
      },
    },
  });

  // ---------------- Pewter Museum ----------------
  function* museumScientist(fromStep) {
    const p = S.player();
    if ((p.y === 4 && p.x === 13) || (p.y === 3 && p.x === 12)) { // behind the counter
      if (yield* S.ask('Museum1FScientist1DoYouKnowWhatAmberIsText')) yield* S.say('Museum1FScientist1TheresALabSomewhereText');
      else yield* S.say('Museum1FScientist1AmberIsFossilizedTreeSapText');
      return;
    }
    if (S.flag('EVENT_BOUGHT_MUSEUM_TICKET')) { yield* S.say('Museum1FScientist1TakePlentyOfTimeText'); return; }
    if (p.y !== 4) { yield* S.say('Museum1FScientist1GoToOtherSideText'); return; }
    const box = moneyBox();
    try {
      if (yield* S.ask('Museum1FScientist1WouldYouLikeToComeInText')) {
        if (G.state.money >= 50) {
          yield* S.say('Museum1FScientist1ThankYouText');
          S.set('EVENT_BOUGHT_MUSEUM_TICKET');
          G.state.money -= 50;
          sfx('buy');
          yield* S.wait(20);
          return;
        }
        yield* S.say('Museum1FScientist1DontHaveEnoughMoneyText');
      }
      yield* S.say('Museum1FScientist1ComeAgainText');
    } finally { box.done = true; }
    yield* S.movePlayer('D');
  }
  G.defMapScript('Museum1F', {
    step(x, y) {
      if (G.scriptRunning || S.flag('EVENT_BOUGHT_MUSEUM_TICKET') || y !== 4 || (x !== 9 && x !== 10)) return null;
      return museumScientist(true);
    },
    talk: {
      MUSEUM1F_SCIENTIST1: function* () { yield* museumScientist(false); },
      MUSEUM1F_SCIENTIST2: function* () {
        if (S.flag('EVENT_GOT_OLD_AMBER')) { yield* S.say('Museum1FScientist2GetTheOldAmberCheckText'); return; }
        yield* S.say('Museum1FScientist2TakeThisToAPokemonLabText');
        if (!G.bag.add('OLD_AMBER', 1)) { yield* S.say('Museum1FScientist2YouDontHaveSpaceText'); return; }
        S.set('EVENT_GOT_OLD_AMBER');
        S.hide('MUSEUM1F_OLD_AMBER');
        sfx('get_item');
        yield* S.say('Museum1FScientist2ReceivedOldAmberText');
      },
    },
    hidden: {
      '2,3': function* () { yield* monPopup('AERODACTYL', 'AerodactylFossilText', true); },
      '2,6': function* () { yield* monPopup('KABUTOPS', 'KabutopsFossilText', true); },
    },
  });

  // ---------------- Pewter Gym ----------------
  const BROCK = {
    cls: 'BROCK', flag: 'EVENT_BEAT_BROCK', tmFlag: 'EVENT_GOT_TM34', tm: 'TM_BIDE', badge: 'BOULDERBADGE',
    before: 'PewterGymBrockPreBattleText', win: ['PewterGymBrockReceivedBoulderBadgeText', 'PewterGymBrockBoulderBadgeInfoText'],
    info: 'PewterGymBrockWaitTakeThisText', tmText: ['PewterGymReceivedTM34Text', 'TM34ExplanationText'], noRoom: 'PewterGymTM34NoRoomText',
    after: 'PewterGymBrockPostBattleAdviceText', trainers: ['EVENT_BEAT_PEWTER_GYM_TRAINER_0'],
    onWin() {
      S.hide('PEWTERCITY_YOUNGSTER', 'PewterCity');       // TOGGLE_GYM_GUY
      S.hide('ROUTE22_RIVAL1', 'Route22');
      S.clear('EVENT_1ST_ROUTE22_RIVAL_BATTLE'); S.clear('EVENT_ROUTE22_RIVAL_WANTS_BATTLE');
    },
  };
  G.defMapScript('PewterGym', {
    talk: {
      PEWTERGYM_BROCK: function* () { yield* leaderTalk(BROCK); },
      PEWTERGYM_GYM_GUIDE: function* () {
        if (S.hasBadge('BOULDERBADGE')) { yield* S.say('PewterGymGuidePostBattleText'); return; }
        if (yield* S.ask('PewterGymGuidePreAdviceText')) yield* S.say('PewterGymGuideBeginAdviceText');
        else yield* S.say('PewterGymGuideFreeServiceText');
        yield* S.say('PewterGymGuideAdviceText');
      },
    },
  });

  G.defMapScript('PewterPokecenter', {
    talk: {
      PEWTERPOKECENTER_JIGGLYPUFF: function* (a) {
        const t = G.fmt(txt('PewterPokecenterJigglypuffText'));
        yield* S.say(t, { noWait: true });
        const bg = new G.ui.StaticBox(t); G.engine.push(bg);
        if (G.music) G.music('jigglypuff', true); else cry('JIGGLYPUFF');
        const dirs = ['down', 'left', 'up', 'right'];
        let k = Math.max(0, dirs.indexOf(a.dir));
        for (let i = 0; i < 16; i++) { a.dir = dirs[k++ % 4]; yield* S.wait(24); }
        yield* S.wait(48);
        G.engine.pop(bg);
        mapMusic();
      },
    },
    hidden: { '0,4': benchGuy('PewterCityPokecenterGuyText') },
  });
  G.defMapScript('PewterNidoranHouse', { talk: { PEWTERNIDORANHOUSE_NIDORAN: function* () { yield* sayCry('PewterNidoranHouseNidoranText', 'NIDORAN_M'); } } });

  // ======================================================================
  // Mt. Moon
  // ======================================================================
  G.defMapScript('MtMoonPokecenter', {
    talk: {
      MTMOONPOKECENTER_MAGIKARP_SALESMAN: function* () {
        if (S.flag('EVENT_BOUGHT_MAGIKARP')) { yield* S.say('MtMoonPokecenterMagikarpSalesmanNoRefundsText'); return; }
        const box = moneyBox();
        try {
          if (!(yield* S.ask('MtMoonPokecenterMagikarpSalesmanIGotADealText'))) { yield* S.say('MtMoonPokecenterMagikarpSalesmanNoText'); return; }
          if (G.state.money < 500) { yield* S.say('MtMoonPokecenterMagikarpSalesmanNoMoneyText'); return; }
          if (!(yield* S.giftMon('MAGIKARP', 5))) return;
          G.state.money -= 500;
          S.set('EVENT_BOUGHT_MAGIKARP');
        } finally { box.done = true; }
      },
    },
    hidden: { '0,4': benchGuy('MtMoonPokecenterBenchGuyText') },
  });

  const MOON_ROCKETS = ['MTMOONB2F_ROCKET1', 'MTMOONB2F_ROCKET2', 'MTMOONB2F_ROCKET3', 'MTMOONB2F_ROCKET4'];
  const gotFossil = () => S.flag('EVENT_GOT_DOME_FOSSIL') || S.flag('EVENT_GOT_HELIX_FOSSIL');
  // once a fossil is taken the map script stops calling CheckFightingMapTrainers (rockets no longer spot you)
  function moonRocketsSight() { if (!gotFossil()) return; for (const id of MOON_ROCKETS) { const a = S.actor(id); if (a) a.trainer = null; } }
  const inList = (x, y, l) => l.some(c => c[0] === x && c[1] === y);
  const NEAR_DOME = [[12, 7], [11, 6], [12, 5]], NEAR_HELIX = [[13, 7], [14, 6], [14, 5]];
  function* moonNerdTakesOther() {
    const p = S.player(), n = S.actor('MTMOONB2F_SUPER_NERD');
    let path = null;
    if (inList(p.x, p.y, NEAR_DOME)) path = 'RU'; else if (inList(p.x, p.y, NEAR_HELIX)) path = 'U';
    if (!path) { S.set('MTMOONB2F_NERD_WAITING'); return; }
    S.clear('MTMOONB2F_NERD_WAITING');
    if (n) yield* S.move(n, path);
    sfx('get_key');
    yield* S.say('MtMoonB2FSuperNerdThenThisIsMineText');
    S.hide(S.flag('EVENT_GOT_DOME_FOSSIL') ? 'MTMOONB2F_HELIX_FOSSIL' : 'MTMOONB2F_DOME_FOSSIL');
  }
  function* moonFossil(item, obj, flag, ask) {
    if (!(yield* S.ask(ask))) return;
    if (!(yield* got(item, 1))) { yield* S.say('MtMoonB2FYouHaveNoRoomText'); return; }
    yield* S.say('MtMoonB2FReceivedFossilText');
    S.hide(obj);
    S.set(flag);
    moonRocketsSight();
    yield* moonNerdTakesOther();
  }
  function* moonNerd() {
    if (S.flag('EVENT_BEAT_MT_MOON_EXIT_SUPER_NERD')) {
      yield* S.say(gotFossil() ? 'MtMoonB2FSuperNerdTheresAPokemonLabText' : 'MtMoonB2fSuperNerdEachTakeOneText');
      return;
    }
    const n = S.actor('MTMOONB2F_SUPER_NERD');
    if (n) S.facePlayer(n);
    yield* S.say('MtMoonB2FSuperNerdTheyreBothMineText');
    const r = yield* S.battle('SUPER_NERD', 2, { winText: fmt('MtMoonB2FSuperNerdOkIllShareText'), loseText: fmt('MtMoonB2FSuperNerdOkIllShareText') });
    if (r === 'win') S.set('EVENT_BEAT_MT_MOON_EXIT_SUPER_NERD');
  }
  const moonRocketTalk = function* (a) { yield* G.trainerTalk(a); };
  G.defMapScript('MtMoonB2F', {
    enter() { moonRocketsSight(); return null; },
    step(x, y) {
      if (G.scriptRunning) return null;
      if (!S.flag('EVENT_BEAT_MT_MOON_EXIT_SUPER_NERD') && x === 13 && y === 8) return moonNerd();
      if (S.flag('MTMOONB2F_NERD_WAITING') && (inList(x, y, NEAR_DOME) || inList(x, y, NEAR_HELIX))) return moonNerdTakesOther();
      return null;
    },
    talk: {
      MTMOONB2F_SUPER_NERD: function* () { yield* moonNerd(); },
      MTMOONB2F_DOME_FOSSIL: function* () { yield* moonFossil('DOME_FOSSIL', 'MTMOONB2F_DOME_FOSSIL', 'EVENT_GOT_DOME_FOSSIL', 'MtMoonB2FDomeFossilYouWantText'); },
      MTMOONB2F_HELIX_FOSSIL: function* () { yield* moonFossil('HELIX_FOSSIL', 'MTMOONB2F_HELIX_FOSSIL', 'EVENT_GOT_HELIX_FOSSIL', 'MtMoonB2FHelixFossilYouWantText'); },
      MTMOONB2F_ROCKET1: moonRocketTalk, MTMOONB2F_ROCKET2: moonRocketTalk, MTMOONB2F_ROCKET3: moonRocketTalk, MTMOONB2F_ROCKET4: moonRocketTalk,
    },
  });

  // ======================================================================
  // Cerulean City
  // ======================================================================
  function* ceruleanRocket(r) {
    if (!S.flag('EVENT_BEAT_CERULEAN_ROCKET_THIEF')) {
      yield* S.say('CeruleanCityRocketText');
      const res = yield* S.battle('ROCKET', r.obj.trainer.n, { winText: fmt('CeruleanCityRocketIGiveUpText'), loseText: fmt('CeruleanCityRocketIGiveUpText') });
      if (res !== 'win') return;
      S.set('EVENT_BEAT_CERULEAN_ROCKET_THIEF');
    }
    yield* S.say('CeruleanCityRocketIllReturnTheTMText');
    if (!(yield* got('TM_DIG', 1))) { yield* S.say('CeruleanCityRocketTM28NoRoomText'); return; }
    yield* S.say(join('CeruleanCityRocketReceivedTM28Text', 'CeruleanCityRocketIBetterGetMovingText'));
    // CeruleanHideRocket
    yield* G.fadeOut(12);
    S.show('CERULEANCITY_GUARD1'); S.hide('CERULEANCITY_GUARD2'); S.hide('CERULEANCITY_ROCKET');
    yield* G.fadeIn(12);
  }
  function* ceruleanRival(x) {
    S.music('rival');
    const rival = S.show('CERULEANCITY_RIVAL');
    rival.x = x; rival.y = 2; rival.dir = 'down';
    yield* S.move(rival, 'DDD');
    S.player().dir = 'up'; rival.dir = 'down';
    yield* S.say('CeruleanCityRivalPreBattleText');
    const r = yield* S.battle('RIVAL1', G.rivalParty(7), { winText: fmt('CeruleanCityRivalDefeatedText'), loseText: fmt('CeruleanCityRivalVictoryText') });
    if (r !== 'win') { S.hide('CERULEANCITY_RIVAL', 'CeruleanCity'); return; }
    S.set('EVENT_BEAT_CERULEAN_RIVAL');
    rival.dir = 'down';
    yield* S.say('CeruleanCityRivalIWentToBillsText');
    S.music('rival');
    yield* S.move(rival, (x === 20 ? 'R' : 'L') + 'DDDDDD');
    S.hide('CERULEANCITY_RIVAL');
    mapMusic();
  }
  G.defMapScript('CeruleanCity', {
    enter() {
      // TOGGLE_CERULEAN_CAVE_GUY is hidden by the Hall of Fame script
      if (S.flag('EVENT_BEAT_CHAMPION_RIVAL') || S.flag('EVENT_BEAT_CHAMPION') || S.flag('EVENT_HALL_OF_FAME_DEX_RATING')) S.hide('CERULEANCITY_SUPER_NERD3');
      return null;
    },
    step(x, y) {
      if (G.scriptRunning) return null;
      if (!S.flag('EVENT_BEAT_CERULEAN_ROCKET_THIEF') && x === 30 && (y === 7 || y === 9) && S.actor('CERULEANCITY_ROCKET')) {
        return (function* () {
          const r = S.actor('CERULEANCITY_ROCKET'), p = S.player();
          if (y === 9) { p.dir = 'up'; r.dir = 'down'; } else { p.dir = 'down'; r.dir = 'up'; }
          yield* S.wait(3);
          yield* ceruleanRocket(r);
        })();
      }
      if (!S.flag('EVENT_BEAT_CERULEAN_RIVAL') && y === 6 && (x === 20 || x === 21)) return ceruleanRival(x);
      return null;
    },
    talk: {
      CERULEANCITY_RIVAL: function* () { yield* S.say(S.flag('EVENT_BEAT_CERULEAN_RIVAL') ? 'CeruleanCityRivalIWentToBillsText' : 'CeruleanCityRivalPreBattleText'); },
      CERULEANCITY_ROCKET: function* (a) { yield* ceruleanRocket(a); },
      CERULEANCITY_COOLTRAINER_F1: function* () {
        const r = rnd(256);
        yield* S.say(r >= 180 ? 'CeruleanCityCooltrainerF1SlowbroUseSonicboomText' : r >= 100 ? 'CeruleanCityCooltrainerF1SlowbroPunchText' : 'CeruleanCityCooltrainerF1SlowbroWithdrawText');
      },
      CERULEANCITY_SLOWBRO: function* () {
        const r = rnd(256);
        yield* S.say(r >= 180 ? 'CeruleanCitySlowbroTookASnoozeText' : r >= 120 ? 'CeruleanCitySlowbroIsLoafingAroundText' : r >= 60 ? 'CeruleanCitySlowbroTurnedAwayText' : 'CeruleanCitySlowbroIgnoredOrdersText');
      },
    },
  });
  G.defMapScript('CeruleanTrashedHouse', {
    talk: {
      CERULEANTRASHEDHOUSE_FISHING_GURU: function* () {
        yield* S.say(G.bag.has('TM_DIG') ? 'CeruleanTrashedHouseFishingGuruWhatsLostIsLostText' : 'CeruleanTrashedHouseFishingGuruTheyStoleATMText');
      },
    },
  });
  G.defMapScript('CeruleanTradeHouse', { talk: { CERULEANTRADEHOUSE_GAMBLER: function* () { yield* trade(6); } } }); // POLIWHIRL -> JYNX "LOLA"
  const BADGES = ['BOULDERBADGE', 'CASCADEBADGE', 'THUNDERBADGE', 'RAINBOWBADGE', 'SOULBADGE', 'MARSHBADGE', 'VOLCANOBADGE', 'EARTHBADGE'];
  G.defMapScript('CeruleanBadgeHouse', {
    talk: {
      CERULEANBADGEHOUSE_MIDDLE_AGED_MAN: function* () {
        yield* S.say('CeruleanBadgeHouseMiddleAgedManText');
        for (;;) {
          const r = yield* menuWithText('CeruleanBadgeHouseMiddleAgedManWhichBadgeText', BADGES, { x: 184, y: -4, w: 130 }); // B = CANCEL
          if (r < 0 || r >= BADGES.length) break;
          const n = BADGES[r].replace('BADGE', '');
          yield* S.say('CeruleanBadgeHouse' + n[0] + n.slice(1).toLowerCase() + 'BadgeText');
        }
        yield* S.say('CeruleanBadgeHouseMiddleAgedManVisitAnyTimeText');
      },
    },
  });
  G.defMapScript('BikeShop', {
    talk: {
      BIKESHOP_CLERK: function* () {
        if (S.flag('EVENT_GOT_BICYCLE')) { yield* S.say('BikeShopClerkHowDoYouLikeYourBicycleText'); return; }
        if (G.bag.has('BIKE_VOUCHER')) {
          yield* S.say('BikeShopClerkOhThatsAVoucherText');
          if (!G.bag.add('BICYCLE', 1)) { yield* S.say('BikeShopBagFullText'); return; }
          G.bag.remove('BIKE_VOUCHER', 1);
          S.set('EVENT_GOT_BICYCLE');
          sfx('get_key');
          yield* S.say('BikeShopExchangedVoucherText');
          return;
        }
        yield* S.say('BikeShopClerkWelcomeText');
        const box = moneyBox();
        const r = yield* menuWithText('BikeShopClerkDoYouLikeItText', ['BICYCLE  $1000000', 'CANCEL'], { x: 6, y: 6 });
        box.done = true;
        if (r === 0) yield* S.say('BikeShopCantAffordText');
        yield* S.say('BikeShopComeAgainText');
      },
      BIKESHOP_YOUNGSTER: function* () { yield* S.say(S.flag('EVENT_GOT_BICYCLE') ? 'BikeShopYoungsterCoolBikeText' : 'BikeShopYoungsterTheseBikesAreExpensiveText'); },
    },
    hidden: (() => { const h = {}; for (const c of ['1,0', '2,1', '1,2', '3,2', '0,4', '1,5']) h[c] = function* () { yield* S.say('NewBicycleText'); }; return h; })(),
  });
  const MISTY = {
    cls: 'MISTY', flag: 'EVENT_BEAT_MISTY', tmFlag: 'EVENT_GOT_TM11', tm: 'TM_BUBBLEBEAM', badge: 'CASCADEBADGE',
    before: 'CeruleanGymMistyPreBattleText', win: ['CeruleanGymMistyReceivedCascadeBadgeText'],
    info: 'CeruleanGymMistyCascadeBadgeInfoText', tmText: ['CeruleanGymMistyReceivedTM11Text'], noRoom: 'CeruleanGymMistyTM11NoRoomText',
    after: 'CeruleanGymMistyTM11ExplanationText', trainers: ['EVENT_BEAT_CERULEAN_GYM_TRAINER_0', 'EVENT_BEAT_CERULEAN_GYM_TRAINER_1'],
  };
  G.defMapScript('CeruleanGym', {
    talk: {
      CERULEANGYM_MISTY: function* () { yield* leaderTalk(MISTY); },
      CERULEANGYM_GYM_GUIDE: function* () { yield* S.say(S.flag('EVENT_BEAT_MISTY') ? 'CeruleanGymGymGuideBeatMistyText' : 'CeruleanGymGymGuideChampInMakingText'); },
    },
  });
  G.defMapScript('CeruleanPokecenter', { hidden: { '0,4': benchGuy('CeruleanPokecenterGuyText') } });

  // ======================================================================
  // Route 24 (Nugget Bridge) / Route 25 / Bill's house
  // ======================================================================
  function* nuggetRocket(a, fromStep) {
    S.clear('EVENT_NUGGET_REWARD_AVAILABLE');
    if (S.flag('EVENT_GOT_NUGGET')) { yield* S.say('Route24CooltrainerM1YouCouldBecomeATopLeaderText'); return; }
    yield* S.say(join('Route24CooltrainerM1YouBeatOurContestText', 'Route24CooltrainerM1YouJustEarnedAPrizeText'));
    if (!(yield* got('NUGGET', 1, 'Route24CooltrainerM1ReceivedNuggetText'))) {
      yield* S.say('Route24CooltrainerM1NoRoomText');
      S.set('EVENT_NUGGET_REWARD_AVAILABLE');
      if (fromStep) { S.clear('EVENT_NUGGET_REWARD_AVAILABLE'); yield* S.movePlayer('D'); }
      return;
    }
    S.set('EVENT_GOT_NUGGET');
    yield* S.say('Route24CooltrainerM1JoinTeamRocketText');
    const r = yield* S.battle('ROCKET', a.obj.trainer.n, { winText: fmt('Route24CooltrainerM1DefeatedText'), loseText: fmt('Route24CooltrainerM1DefeatedText') });
    if (r !== 'win') return;
    S.set('EVENT_BEAT_ROUTE24_ROCKET');
    yield* S.say('Route24CooltrainerM1YouCouldBecomeATopLeaderText');
  }
  G.defMapScript('Route24', {
    step(x, y) {
      if (G.scriptRunning || S.flag('EVENT_GOT_NUGGET') || x !== 10 || y !== 15) return null;
      const a = S.actor('ROUTE24_COOLTRAINER_M1'); if (!a) return null;
      return (function* () { a.dir = 'left'; yield* nuggetRocket(a, true); })();
    },
    talk: { ROUTE24_COOLTRAINER_M1: function* (a) { yield* nuggetRocket(a, false); } },
  });
  G.defMapScript('Route25', {
    enter() { // Route25ToggleBillsScript
      if (S.flag('EVENT_LEFT_BILLS_HOUSE_AFTER_HELPING')) return null;
      if (!S.flag('EVENT_MET_BILL_2')) {
        S.clear('EVENT_BILL_SAID_USE_CELL_SEPARATOR');
        S.show('BILLSHOUSE_BILL_POKEMON', 'BillsHouse');
        return null;
      }
      if (!S.flag('EVENT_GOT_SS_TICKET')) return null;
      S.set('EVENT_LEFT_BILLS_HOUSE_AFTER_HELPING');
      S.hide('ROUTE24_COOLTRAINER_M1', 'Route24');   // TOGGLE_NUGGET_BRIDGE_GUY
      S.hide('BILLSHOUSE_BILL1', 'BillsHouse');
      S.show('BILLSHOUSE_BILL2', 'BillsHouse');
      return null;
    },
  });
  const BILLS_FAVORITES = ['EEVEE', 'FLAREON', 'JOLTEON', 'VAPOREON'];
  function* billsCellSeparator() {
    yield* S.say('BillsHouseInitiatedText');
    yield* S.wait(16); sfx('select'); yield* S.wait(60);
    yield* S.wait(32); sfx('blip'); yield* S.wait(80);
    sfx('shrink'); yield* S.wait(48);
    sfx('blip'); yield* S.wait(32);
    sfx('get_item'); yield* S.wait(40);
    mapMusic();
    S.set('EVENT_USED_CELL_SEPARATOR_ON_BILL');
    // BillsHouseBillExitsMachineScript
    const bill = S.show('BILLSHOUSE_BILL1');
    bill.x = 1; bill.y = 2; bill.dir = 'down';
    yield* S.wait(8);
    yield* S.move(bill, 'DRRRD');
    S.set('EVENT_MET_BILL_2'); S.set('EVENT_MET_BILL');
  }
  G.defMapScript('BillsHouse', {
    talk: {
      BILLSHOUSE_BILL_POKEMON: function* (a) {
        if (!(yield* S.ask('BillsHouseBillImNotAPokemonText'))) yield* S.say('BillsHouseBillNoYouGottaHelpText');
        yield* S.say('BillsHouseBillUseSeparationSystemText');
        yield* S.move(a, S.player().dir === 'down' ? 'RUULU' : 'UUU');
        S.hide('BILLSHOUSE_BILL_POKEMON');
        S.set('EVENT_BILL_SAID_USE_CELL_SEPARATOR');
      },
      BILLSHOUSE_BILL1: function* () {
        if (!S.flag('EVENT_GOT_SS_TICKET')) {
          yield* S.say('BillsHouseBillThankYouText');
          if (!(yield* got('S_S_TICKET', 1, 'SSTicketReceivedText'))) { yield* S.say('SSTicketNoRoomText'); return; }
          S.set('EVENT_GOT_SS_TICKET');
          S.show('CERULEANCITY_GUARD1', 'CeruleanCity'); S.hide('CERULEANCITY_GUARD2', 'CeruleanCity');
        }
        yield* S.say('BillsHouseBillWhyDontYouGoInsteadOfMeText');
      },
      BILLSHOUSE_BILL2: function* () { yield* S.say('BillsHouseBillCheckOutMyRarePokemonText'); },
    },
    hidden: {
      '1,4': function* () { // BillsHousePC
        if (S.player().dir !== 'up') return;
        if (S.flag('EVENT_LEFT_BILLS_HOUSE_AFTER_HELPING')) {
          yield* S.say('BillsHousePokemonListText1');
          for (;;) {
            const r = yield* menuWithText('BillsHousePokemonListText2', BILLS_FAVORITES.map(G.speciesName).concat(['CANCEL']), { x: 6, y: 4, w: 120 });
            if (r < 0 || r >= BILLS_FAVORITES.length) return;
            yield* G.dexPage(BILLS_FAVORITES[r]);
            G.dexSeen(BILLS_FAVORITES[r]);
          }
        }
        if (S.flag('EVENT_USED_CELL_SEPARATOR_ON_BILL') || !S.flag('EVENT_BILL_SAID_USE_CELL_SEPARATOR')) { yield* S.say('BillsHouseMonitorText'); return; }
        yield* billsCellSeparator();
      },
    },
  });

  // ======================================================================
  // Routes 5 / 6: Saffron gate guards and the Underground Path entrances
  // ======================================================================
  const DRINK_FLAGS = ['EVENT_GAVE_SAFFRON_GUARDS_DRINK', 'GAVE_SAFFRON_GUARDS_DRINK', 'BIT_GAVE_SAFFRON_GUARDS_DRINK'];
  const drinkGiven = () => DRINK_FLAGS.some(f => S.flag(f));
  function takeGuardDrink() { for (const d of ['FRESH_WATER', 'SODA_POP', 'LEMONADE']) if (G.bag.has(d)) { G.bag.remove(d, 1); return d; } return null; }
  function* saffronGuard(push, face) {
    if (face) S.player().dir = face;
    if (takeGuardDrink()) {
      DRINK_FLAGS.forEach(f => S.set(f));
      yield* S.say('SaffronGateGuardImParchedText');
      sfx('get_key');
      yield* S.say('SaffronGateGuardYouCanGoOnThroughText');
      return;
    }
    yield* S.say('SaffronGateGuardGeeImThirstyText');
    yield* S.movePlayer(push);
  }
  function saffronGate(guardId, push, face, ys) {
    return {
      step(x, y) {
        if (G.scriptRunning || drinkGiven() || y !== ys || (x !== 3 && x !== 4)) return null;
        return saffronGuard(push, face);
      },
      talk: { [guardId]: function* () { if (drinkGiven()) yield* S.say('SaffronGateGuardThanksForTheDrinkText'); else yield* saffronGuard(push); } },
    };
  }
  G.defMapScript('Route5Gate', saffronGate('ROUTE5GATE_GUARD', 'U', 'left', 3));
  G.defMapScript('Route6Gate', saffronGate('ROUTE6GATE_GUARD', 'D', 'right', 2));
  G.defMapScript('UndergroundPathRoute5', {
    enter() { G.state.lastOutdoor = 'Route5'; return null; },
    talk: { UNDERGROUNDPATHROUTE5_LITTLE_GIRL: function* () { yield* trade(9); } }, // NIDORAN♂ -> NIDORAN♀ "SPOT"
  });
  G.defMapScript('UndergroundPathRoute6', { enter() { G.state.lastOutdoor = 'Route6'; return null; } });

  // ======================================================================
  // Vermilion City
  // ======================================================================
  function* vermilionSailor(fromStep) {
    if (S.flag('EVENT_SS_ANNE_LEFT')) {
      yield* S.say('VermilionCitySailor1ShipSetSailText');
      if (fromStep) yield* S.movePlayer('U');
      return;
    }
    const p = S.player();
    if (!fromStep && (p.dir === 'right' || (p.x === 19 && (p.y === 29 || p.y === 31)))) { yield* S.say('VermilionCitySailor1WelcomeToSSAnneText'); return; }
    yield* S.say('VermilionCitySailor1DoYouHaveATicketText');
    if (G.bag.has('S_S_TICKET')) { yield* S.say('VermilionCitySailor1FlashedTicketText'); return; }
    yield* S.say('VermilionCitySailor1YouNeedATicketText');
    if (fromStep) yield* S.movePlayer('U');
  }
  G.defMapScript('VermilionCity', {
    enter() {
      // new first trash-can lock every time the city loads (wFirstLockTrashCanIndex)
      const st = G.state.vermilionTrash || (G.state.vermilionTrash = { first: 0, second: 0 });
      st.first = rnd(256) & 0xe;
      if (S.flag('EVENT_SS_ANNE_LEFT') && !S.flag('EVENT_WALKED_PAST_GUARD_AFTER_SS_ANNE_LEFT')) {
        S.set('EVENT_WALKED_PAST_GUARD_AFTER_SS_ANNE_LEFT');
        return (function* () { yield* waitWarp(); G.ow.locks++; try { yield* S.movePlayer('UU'); } finally { G.ow.locks--; } })();
      }
      return null;
    },
    step(x, y) {
      if (G.scriptRunning || x !== 18 || y !== 30 || S.player().dir !== 'down') return null;
      return vermilionSailor(true);
    },
    talk: {
      VERMILIONCITY_SAILOR1: function* () { yield* vermilionSailor(false); },
      VERMILIONCITY_GAMBLER1: function* () { yield* S.say(S.flag('EVENT_SS_ANNE_LEFT') ? 'VermilionCityGambler1SSAnneDepartedText' : 'VermilionCityGambler1DidYouSeeText'); },
      VERMILIONCITY_MACHOP: function* () { yield* sayCry('VermilionCityMachopText', 'MACHOP'); yield* S.say('VermilionCityMachopStompingTheLandFlatText'); },
    },
  });

  // ---------------- Vermilion Gym: trash-can switch puzzle ----------------
  // the 15 cans are numbered down each column (5 columns of 3). The second switch is always in a can next to the
  // first one, as the puzzle was designed. Red/Blue had a bug (engine/events/hidden_events/vermilion_gym_trash.asm:
  // a random AND mask that can come out 0) that put it in the top-left can instead about 40% of the time, which is
  // what made the puzzle feel impossible; we don't reproduce that one
  const trashNeighbours = i => { const c = Math.floor(i / 3), r = i % 3, out = [];
    if (r > 0) out.push(i - 1); if (r < 2) out.push(i + 1); if (c > 0) out.push(i - 3); if (c < 4) out.push(i + 3); return out; };
  const GYM_DOOR = [[4, 4], [5, 4], [4, 5], [5, 5]];
  function vermilionGymDoor(open) {
    const m = G.ow.map;
    if (m.name !== 'VermilionGym') return;
    for (const [x, y] of GYM_DOOR) {
      const i = y * m.w + x;
      if (open) { delete m.overrides[i]; if (m.passOverride) delete m.passOverride[i]; }
      else { m.overrides[i] = 'barrier'; m.passOverride = m.passOverride || {}; m.passOverride[i] = false; }
    }
    G.ow_rerender();
  }
  G.vermilionTrash = function (h) {
    return (function* () {
      const idx = +h.arg;
      const st = G.state.vermilionTrash || (G.state.vermilionTrash = { first: rnd(256) & 0xe, second: 0 });
      if (S.flag('EVENT_2ND_LOCK_OPENED')) { yield* S.say('VermilionGymTrashText'); return; }
      if (!S.flag('EVENT_1ST_LOCK_OPENED')) {
        if (idx !== st.first) { yield* S.say('VermilionGymTrashText'); return; }
        S.set('EVENT_1ST_LOCK_OPENED');
        const near = trashNeighbours(idx);
        st.second = near[rnd(near.length)];
        yield* S.say('VermilionGymTrashSuccessText1');
        sfx('select');
        return;
      }
      if (idx === st.second) {
        S.set('EVENT_2ND_LOCK_OPENED');
        yield* S.say('VermilionGymTrashSuccessText3');
        sfx('door');
        vermilionGymDoor(true);
        return;
      }
      S.clear('EVENT_1ST_LOCK_OPENED');
      st.first = rnd(256) & 0xe;
      yield* S.say('VermilionGymTrashFailText');
      sfx('bump');
    })();
  };
  const SURGE = {
    cls: 'LT_SURGE', flag: 'EVENT_BEAT_LT_SURGE', tmFlag: 'EVENT_GOT_TM24', tm: 'TM_THUNDERBOLT', badge: 'THUNDERBADGE',
    before: 'VermilionGymLTSurgePreBattleText', win: ['VermilionGymLTSurgeReceivedThunderBadgeText'],
    info: 'VermilionGymLTSurgeThunderBadgeInfoText', tmText: ['VermilionGymLTSurgeReceivedTM24Text', 'TM24ExplanationText'], noRoom: 'VermilionGymLTSurgeTM24NoRoomText',
    after: 'VermilionGymLTSurgePostBattleAdviceText', trainers: ['EVENT_BEAT_VERMILION_GYM_TRAINER_0', 'EVENT_BEAT_VERMILION_GYM_TRAINER_1', 'EVENT_BEAT_VERMILION_GYM_TRAINER_2'],
  };
  const trashText = function* () { yield* S.say('VermilionGymTrashText'); };
  G.defMapScript('VermilionGym', {
    enter() { if (!S.flag('EVENT_2ND_LOCK_OPENED')) vermilionGymDoor(false); return null; },
    talk: {
      VERMILIONGYM_LT_SURGE: function* () { yield* leaderTalk(SURGE); },
      VERMILIONGYM_GYM_GUIDE: function* () { yield* S.say(S.hasBadge('THUNDERBADGE') ? 'VermilionGymGymGuideBeatLTSurgeText' : 'VermilionGymGymGuideChampInMakingText'); },
    },
    hidden: { '6,1': trashText },
  });
  G.defMapScript('VermilionOldRodHouse', {
    talk: {
      VERMILIONOLDRODHOUSE_FISHING_GURU: function* () {
        if (S.flag('EVENT_GOT_OLD_ROD')) { yield* S.say('VermilionOldRodHouseFishingGuruHowAreTheFishBitingText'); return; }
        if (!(yield* S.ask('VermilionOldRodHouseFishingGuruDoYouLikeToFishText'))) { yield* S.say('VermilionOldRodHouseFishingGuruThatsSoDisappointingText'); return; }
        if (!(yield* got('OLD_ROD', 1))) { yield* S.say('VermilionOldRodHouseFishingGuruNoRoomText'); return; }
        S.set('EVENT_GOT_OLD_ROD');
        yield* S.say(join('VermilionOldRodHouseFishingGuruTakeThisText', 'VermilionOldRodHouseFishingGuruFishingIsAWayOfLifeText'));
      },
    },
  });
  G.defMapScript('VermilionPidgeyHouse', { talk: { VERMILIONPIDGEYHOUSE_PIDGEY: function* () { yield* sayCry('VermilionPidgeyHousePidgeyText', 'PIDGEY'); } } });
  G.defMapScript('VermilionTradeHouse', { talk: { VERMILIONTRADEHOUSE_LITTLE_GIRL: function* () { yield* trade(4); } } }); // SPEAROW -> FARFETCH'D "DUX"
  G.defMapScript('VermilionPokecenter', { hidden: { '0,4': benchGuy('VermilionPokecenterGuyText') } });
  G.defMapScript('PokemonFanClub', {
    talk: {
      POKEMONFANCLUB_PIKACHU_FAN: function* () {
        if (S.flag('EVENT_PIKACHU_FAN_BOAST')) { yield* S.say('PokemonFanClubPikachuFanBetterText'); S.clear('EVENT_PIKACHU_FAN_BOAST'); }
        else { yield* S.say('PokemonFanClubPikachuFanNormalText'); S.set('EVENT_SEEL_FAN_BOAST'); }
      },
      POKEMONFANCLUB_SEEL_FAN: function* () {
        if (S.flag('EVENT_SEEL_FAN_BOAST')) { yield* S.say('PokemonFanClubSeelFanBetterText'); S.clear('EVENT_SEEL_FAN_BOAST'); }
        else { yield* S.say('PokemonFanClubSeelFanNormalText'); S.set('EVENT_PIKACHU_FAN_BOAST'); }
      },
      POKEMONFANCLUB_PIKACHU: function* () { yield* sayCry('PokemonFanClubPikachuText', 'PIKACHU'); },
      POKEMONFANCLUB_SEEL: function* () { yield* sayCry('PokemonFanClubSeelText', 'SEEL'); },
      POKEMONFANCLUB_CHAIRMAN: function* () {
        if (S.flag('EVENT_GOT_BIKE_VOUCHER') || G.bag.has('BICYCLE') || G.bag.has('BIKE_VOUCHER')) { yield* S.say('PokemonFanClubChairFinalText'); return; }
        if (!(yield* S.ask('PokemonFanClubChairmanIntroText'))) { yield* S.say('PokemonFanClubNoStoryText'); return; }
        yield* S.say('PokemonFanClubChairmanStoryText');
        if (!(yield* got('BIKE_VOUCHER', 1))) { yield* S.say('PokemonFanClubBagFullText'); return; }
        yield* S.say(join('PokemonFanClubReceivedBikeVoucherText', 'PokemonFanClubExplainBikeVoucherText'));
        S.set('EVENT_GOT_BIKE_VOUCHER');
      },
    },
  });

  // ---------------- Vermilion Dock: the S.S. Anne departs ----------------
  function shipCells(m) {
    const out = [];
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) { const l = m.labels[y * m.w + x]; if (l === 'deck' || l === 'ship_wall') out.push([x, y]); }
    return out;
  }
  function removeShip(m) {
    m.passOverride = m.passOverride || {};
    for (const [x, y] of shipCells(m)) { const i = y * m.w + x; m.overrides[i] = 'water'; m.passOverride[i] = false; }
    const g = m.warps.find(w => w.to === 'SSAnne1F'); // the gangway no longer leads anywhere
    if (g) m.passOverride[g.y * m.w + g.x] = false;
  }
  function* shipLeaves() {
    yield* waitWarp();
    const ow = G.ow, m = ow.map, MR = G.mapRender;
    ow.locks++;
    try {
      S.set('EVENT_SS_ANNE_LEFT');
      S.music('surf');
      yield* S.wait(60);
      // capture the ship graphics by diffing the map rendered with and without it
      const cells = shipCells(m);
      const x0 = Math.min(...cells.map(c => c[0])), x1 = Math.max(...cells.map(c => c[0])) + 1;
      const y0 = Math.min(...cells.map(c => c[1])) - 1, y1 = Math.max(...cells.map(c => c[1])) + 2;
      const comp = R => { const c = R.s.clone(); c.blit(R.up, 0, 0); return c; };
      const A = comp(MR.build(m));
      removeShip(m);
      const B = comp(MR.build(m));
      const pw = (x1 - x0) * 16, ph = (y1 - y0) * 16, ox = (x0 + MR.MX) * 16, oy = (y0 + MR.MY) * 16;
      const ship = new G.gfx.Surface(pw, ph);
      for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
        const i = (oy + y) * A.w + ox + x;
        if (A.data[i] !== B.data[i]) ship.data[y * pw + x] = A.data[i];
      }
      G.ow_rerender();
      const P = G.PAL, smoke = [];
      const fx = { dx: 0, t: 0, done: false, draw(s, cx, cy) {
        const sx = x0 * 16 - cx + Math.round(this.dx), sy = y0 * 16 - cy;
        s.blit(ship, sx, sy);
        for (const p of smoke) { const r = 3 + p.age / 12; s.disc(p.x - cx, p.y - cy, r, G.gfx.mix(P.white, G.gfx.hex('#a8a8b0'), Math.min(1, p.age / 90))); }
        return !this.done;
      } };
      ow.fx.push(fx);
      for (let t = 0; t < 320; t++) {
        fx.dx += 0.8;
        if (t % 36 === 0) smoke.push({ x: (x0 + 3) * 16 + fx.dx, y: y0 * 16 + 14, age: 0 });
        for (const p of smoke) { p.age++; p.x += 0.6; p.y -= 0.25; }
        yield;
      }
      fx.done = true;
      yield* S.wait(60);
      mapMusic();
      S.set('EVENT_STARTED_WALKING_OUT_OF_DOCK');
    } finally { ow.locks--; }
    yield* S.movePlayer('UU'); // onto the exit mat, then out of the dock
    S.set('EVENT_WALKED_OUT_OF_DOCK');
    const p = S.player(), wi = G.ow.map.warpAt(p.x, p.y);
    if (wi >= 0) { p.dir = 'up'; G.ow.doWarp(wi); }
  }
  G.defMapScript('VermilionDock', {
    enter() {
      const p = S.player(), m = G.ow.map;
      if (S.flag('EVENT_SS_ANNE_LEFT')) { removeShip(m); G.ow_rerender(); return null; }
      const g = m.warps.find(w => w.to === 'SSAnne1F');
      if (S.flag('EVENT_GOT_HM01') && g && p.x === g.x && p.y === g.y) return shipLeaves();
      return null;
    },
  });

  // ======================================================================
  // S.S. Anne
  // ======================================================================
  function* ssAnneRival(x) {
    S.music('rival');
    const rival = S.show('SSANNE2F_RIVAL');
    rival.x = 36; rival.y = 4; rival.dir = 'down';
    const face = () => { const p = S.player(); if (x === 37) { p.dir = 'left'; rival.dir = 'right'; } else { p.dir = 'up'; rival.dir = 'down'; } };
    yield* S.move(rival, x === 37 ? 'DDDD' : 'DDD');
    face();
    yield* S.say('SSAnne2FRivalText');
    const r = yield* S.battle('RIVAL2', G.rivalParty(1), { winText: fmt('SSAnne2FRivalDefeatedText'), loseText: fmt('SSAnne2FRivalVictoryText') });
    if (r !== 'win') { S.hide('SSANNE2F_RIVAL', 'SSAnne2F'); return; }
    face();
    yield* S.say('SSAnne2FRivalCutMasterText');
    S.music('rival');
    yield* S.move(rival, x === 37 ? 'DDDD' : 'RDDDDD');
    S.hide('SSANNE2F_RIVAL');
    S.set('EVENT_BEAT_SS_ANNE_RIVAL');
    mapMusic();
  }
  G.defMapScript('SSAnne2F', {
    step(x, y) {
      if (G.scriptRunning || S.flag('EVENT_BEAT_SS_ANNE_RIVAL') || y !== 8 || (x !== 36 && x !== 37)) return null;
      return ssAnneRival(x);
    },
    talk: { SSANNE2F_RIVAL: function* () { yield* S.say('SSAnne2FRivalText'); } },
  });
  G.defMapScript('SSAnneCaptainsRoom', {
    talk: {
      SSANNECAPTAINSROOM_CAPTAIN: function* (a) {
        if (!S.flag('EVENT_RUBBED_CAPTAINS_BACK')) a.dir = 'up'; // too seasick to turn around
        if (S.flag('EVENT_GOT_HM01')) { yield* S.say('SSAnneCaptainsRoomCaptainNotSickAnymoreText'); return; }
        yield* S.say('SSAnneCaptainsRoomRubCaptainsBackText');
        G.music && G.music('heal', true);
        yield* S.wait(150);
        mapMusic();
        S.set('EVENT_RUBBED_CAPTAINS_BACK');
        yield* S.say('SSAnneCaptainsRoomCaptainIFeelMuchBetterText');
        if (yield* got('HM_CUT', 1, 'SSAnneCaptainsRoomCaptainReceivedHM01Text')) S.set('EVENT_GOT_HM01');
        else { yield* S.say('SSAnneCaptainsRoomCaptainHM01NoRoomText'); a.dir = 'up'; }
      },
    },
  });
  G.defMapScript('SSAnne1FRooms', { talk: { SSANNE1FROOMS_WIGGLYTUFF: function* () { yield* sayCry('SSAnne1FRoomsWigglytuffText', 'WIGGLYTUFF'); } } });
  G.defMapScript('SSAnneB1FRooms', { talk: { SSANNEB1FROOMS_MACHOKE: function* () { yield* sayCry('SSAnneB1FRoomsMachokeText', 'MACHOKE'); } } });
  G.defMapScript('SSAnne2FRooms', {
    talk: {
      SSANNE2FROOMS_GENTLEMAN3: function* () {
        yield* S.say('SSAnne2FRoomsGentleman3Text');
        yield* G.dexPage('SNORLAX');
        G.dexSeen('SNORLAX');
      },
    },
  });
  G.defMapScript('SSAnneKitchen', {
    talk: {
      SSANNEKITCHEN_COOK7: function* () {
        yield* S.say('SSAnneKitchenCook7MainCourseIsText');
        const r = rnd(256);
        yield* S.say(r & 0x80 ? 'SSAnneKitchenCook7SalmonDuSaladText' : r & 0x10 ? 'SSAnneKitchenCook7EelsAuBarbecueText' : 'SSAnneKitchenCook7PrimeBeefSteakText');
      },
    },
    hidden: { '13,5': trashText, '13,7': trashText },
  });

  // ======================================================================
  // Route 11 gate, Rock Tunnel Pokécenter
  // ======================================================================
  G.defMapScript('Route11Gate2F', {
    talk: {
      ROUTE11GATE2F_OAKS_AIDE: function* () { yield* oaksAide(30, 'ITEMFINDER', 'EVENT_GOT_ITEMFINDER', 'Route11Gate2FOaksAideItemfinderDescriptionText'); },
      ROUTE11GATE2F_YOUNGSTER: function* () { yield* trade(0); }, // NIDORINO -> NIDORINA "TERRY"
    },
    sign: {
      TEXT_ROUTE11GATE2F_LEFT_BINOCULARS: function* () {
        if (S.player().dir !== 'up') return;
        yield* S.say(S.flag('EVENT_BEAT_ROUTE12_SNORLAX') ? 'Route11Gate2FLeftBinocularsNoSnorlaxText' : 'Route11Gate2FLeftBinocularsSnorlaxText');
      },
      TEXT_ROUTE11GATE2F_RIGHT_BINOCULARS: function* () { if (S.player().dir === 'up') yield* S.say('Route11Gate2FRightBinocularsText'); },
    },
  });
  G.defMapScript('RockTunnelPokecenter', { hidden: { '0,4': benchGuy('RockTunnelPokecenterGuyText') } });
})(window.G);
