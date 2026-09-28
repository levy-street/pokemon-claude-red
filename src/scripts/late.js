// Story events: late game region (see tools/SCRIPT_GUIDE.md).
// Routes 12-16 (Snorlax, gates, Super Rod house), Fuchsia City (Koga, Safari Zone, Warden, Good Rod),
// Routes 19-21, Seafoam Islands (boulders/currents, Articuno), Cinnabar Island (Mansion switches, Blaine's
// quiz gym, Lab fossils/trades), Power Plant (Zapdos), Viridian Gym (Giovanni), Route 22 gate, Route 23 badge
// guards, Victory Road (boulder switches, Moltres), Indigo Plateau (Elite Four, Champion, Hall of Fame,
// credits) and Cerulean Cave (Mewtwo).
(function (G) {
  'use strict';
  const S = G.S;
  const MS = G.MAPSCRIPTS;

  // ---------------------------------------------------------------- helpers
  const tx = (...ls) => { for (const l of ls) if (l && G.TEXT[l]) return l; return ls[ls.length - 1]; };
  const say = (...ls) => S.say(tx(...ls));
  const ask = (...ls) => S.ask(tx(...ls));
  const P = () => G.ow.player;
  const sfx = n => { if (G.sfx) G.sfx(n); };
  const setVar = (k, v) => { G.textVars[k] = v; };
  const posIn = list => { const p = P(); return list.findIndex(([x, y]) => p.x === x && p.y === y); };
  const shown = (id, map) => S.isShown(id, map);
  let busy = 0; // >0 while one of our scripted sequences is moving the player (suppresses step triggers)

  // Merge a map-script definition with one that another region file may already have registered.
  function def(name, d) {
    const cur = MS[name];
    if (!cur) { G.defMapScript(name, d); return; }
    for (const k of ['talk', 'sign', 'hidden']) if (d[k]) cur[k] = Object.assign(cur[k] || {}, d[k]);
    if (d.enter) {
      const prev = cur.enter;
      cur.enter = prev ? function () { const a = prev.apply(this, arguments), b = d.enter.apply(this, arguments); if (!a) return b; if (!b) return a; return (function* () { yield* a; yield* b; })(); } : d.enter;
    }
    if (d.step) {
      const prev = cur.step;
      cur.step = prev ? function () { return prev.apply(this, arguments) || d.step.apply(this, arguments); } : d.step;
    }
    if (d.beforeStatic) cur.beforeStatic = d.beforeStatic;
  }

  // Run a generator as one of our "busy" sequences.
  function* guarded(gen) { busy++; try { return yield* gen; } finally { busy--; } }

  // Wait until a warp/fade that brought us into the map has finished.
  function* settleIn() { for (let i = 0; i < 120 && (G.ow.locks > 0 || G.fadeLevel > 0 || warping()); i++) yield; }
  const warping = () => G.engine.tasks.some(t => t.name === 'warp' && !t.done);

  // Walk the player along a path; returns false if a warp fired on the way (the script should stop).
  function* walk(path, speed) {
    for (const c of path) {
      yield* S.movePlayer(c, speed);
      yield;
      if (warping()) { while (warping()) yield; return false; }
    }
    return true;
  }
  // Take the warp the player is standing on (edge warps need an outward push in the engine).
  function* takeWarp() {
    const ow = G.ow, p = ow.player, wi = ow.map.warpAt(p.x, p.y);
    if (wi < 0) return false;
    if (!warping()) ow.doWarp(wi);
    yield;
    while (warping()) yield;
    return true;
  }

  // Red-style item gift: "received" text uses {wStringBuffer}; prints the no-room text when the bag is full.
  function* giveItem(item, recv, noRoom, n) {
    if (!G.bag.add(item, n || 1)) { if (noRoom) yield* say(noRoom); else yield* G.say('No more room for items!'); return false; }
    setVar('wStringBuffer', G.itemName(item)); setVar('wNameBuffer', G.itemName(item));
    sfx(/^(TM|HM)_/.test(item) || G.bag.isKey(item) ? 'get_key' : 'get_item');
    if (recv) yield* say(recv); else yield* G.say(G.state.name + ' received ' + G.itemName(item) + '!');
    return true;
  }

  // Batched cell overrides (like pokered's ReplaceTileBlock). cells: [[x, y, label|null, passable]]; null label = original.
  function setCells(cells, mapName) {
    const m = mapName ? G.maps.getMap(mapName) : G.ow.map;
    m.passOverride = m.passOverride || {};
    for (const [x, y, label, pass] of cells) { const i = y * m.w + x; m.overrides[i] = label || m.labels[i]; m.passOverride[i] = pass; }
    if (G.ow && m === G.ow.map && G.ow_rerender) G.ow_rerender();
  }
  // A 32x32 block = 2x2 cells. mask = [tl, tr, bl, br] with 'X' = blocked.
  const BLOCK = { O: 'PPPP', H: 'PPXX', T: 'XXPP', V: 'PXPX' }; // open, $2d (bottom), $54 (top), $5f (right)
  function blockCells(bx, by, shape, xLabel, pLabel) {
    const mask = BLOCK[shape] || shape, out = [];
    [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([dx, dy], k) => out.push([bx * 2 + dx, by * 2 + dy, mask[k] === 'X' ? (xLabel || 'barrier') : (pLabel || null), mask[k] !== 'X']));
    return out;
  }

  // Static Pokémon handled the Red way (trainer header with sight 0): any finished battle removes it, a loss keeps it.
  function* staticMon(a, sp, lv, flag, text, music) {
    const mapName = G.ow.map.name, id = a.obj.id;
    yield* say(text);
    if (G.cry) G.cry(sp);
    const r = yield* G.startWildBattle(sp, lv, { music: music || 'legendary' });
    if (r === 'lose') return r;
    S.set(flag); S.hide(id, mapName);
    return r;
  }

  // Gym leader in Red's order: before text -> battle (badge line is the end-of-battle text) -> badge info -> TM.
  function* gymLeader(a, o) {
    if (S.flag(o.beat)) {
      if (!S.flag(o.gotTM)) { yield* leaderReward(o); return; }
      yield* say(o.after);
      if (o.afterTalk) yield* o.afterTalk(a);
      return;
    }
    yield* say(o.before);
    const r = yield* S.battle(o.cls, o.n || 1, { winText: G.fmt(S.t(o.win)) });
    if (r !== 'win') return;
    sfx('get_badge');
    yield* leaderReward(o);
  }
  function* leaderReward(o) {
    yield* say(o.info);
    S.set(o.beat);
    if (yield* giveItem(o.tm, o.recv, o.noRoom)) { if (o.explain) yield* say(o.explain); S.set(o.gotTM); }
    if (!G.state.badges.includes(o.badge)) G.state.badges.push(o.badge);
    for (const f of o.trainers || []) S.set(f);
    if (o.onVictory) o.onVictory();
  }

  // Oak's aides (OaksAideScript).
  function* oaksAide(need, item, flag, explain) {
    if (!S.flag(flag)) {
      const own = Object.keys(G.state.dex.caught).length;
      setVar('wOaksAideRewardItemName', G.itemName(item)); setVar('hOaksAideRequirement', need); setVar('hOaksAideNumMonsOwned', own);
      if (!(yield* ask('OaksAideHiText'))) { yield* say('OaksAideComeBackText'); return; }
      if (own < need) { yield* say('OaksAideUhOhText'); return; }
      yield* say('OaksAideHereYouGoText');
      if (!G.bag.add(item, 1)) { yield* say('OaksAideNoRoomText'); return; }
      sfx('get_key');
      yield* say('OaksAideGotItemText');
      S.set(flag);
    }
    yield* say(explain);
  }

  // In-game trades using the original dialogue sets (TRADE_DIALOGSET_CASUAL/EVOLUTION/HAPPY -> 1/2/3).
  function trade(idx) {
    const set = { TRADE_DIALOGSET_CASUAL: 1, TRADE_DIALOGSET_EVOLUTION: 2, TRADE_DIALOGSET_HAPPY: 3 }[G.DATA.trades[idx].dialog] || 1;
    return function* () {
      yield* S.inGameTrade(idx, { ask: G.TEXT['WannaTrade' + set + 'Text'], no: G.TEXT['NoTrade' + set + 'Text'], wrong: G.TEXT['WrongMon' + set + 'Text'], done: G.TEXT['Thanks' + set + 'Text'], after: G.TEXT['AfterTrade' + set + 'Text'] });
    };
  }

  // Binoculars etc. that only work when facing up.
  const facingUp = label => function* () { if (P().dir === 'up') yield* say(label); };
  // Bench guys (PrintBenchGuyText) facing left.
  const benchGuy = label => function* () { if (P().dir === 'left') yield* say(label); };
  // Cable Club receptionist without a link partner.
  function* cableClub() {
    if (!S.flag('EVENT_GOT_POKEDEX')) { yield* say('CableClubNPCAreaReservedFor2FriendsLinkedByCableText'); return; }
    yield* say('CableClubNPCWelcomeText');
    yield* say('CableClubNPCLinkClosedBecauseOfInactivityText');
  }

  // Pokédex page from signs (DisplayPokedex marks the species as seen).
  function* showDex(sp) { if (G.dexSeen) G.dexSeen(sp); if (G.dexPage) yield* G.dexPage(sp); }

  // ================================================================= ROUTE 12 / ROUTE 16: SNORLAX + POKé FLUTE
  const SNORLAX = {
    Route12: { id: 'ROUTE12_SNORLAX', beat: 'EVENT_BEAT_ROUTE12_SNORLAX', fight: 'EVENT_FIGHT_ROUTE12_SNORLAX', coords: [[9, 62], [10, 61], [10, 63], [11, 62]], talk: 'Route12SnorlaxText', woke: 'Route12SnorlaxWokeUpText', calm: 'Route12SnorlaxCalmedDownText' },
    Route16: { id: 'ROUTE16_SNORLAX', beat: 'EVENT_BEAT_ROUTE16_SNORLAX', fight: 'EVENT_FIGHT_ROUTE16_SNORLAX', coords: [[27, 10], [25, 10]], talk: 'Route16Text7', woke: 'Route16SnorlaxWokeUpText', calm: 'Route16SnorlaxReturnedToMountainsText' },
  };
  function* snorlaxBattle(cfg) {
    S.clear(cfg.fight);
    yield* say(cfg.woke);
    S.hide(cfg.id); // Red hides Snorlax before the battle (it is gone even if you lose)
    const r = yield* G.startWildBattle('SNORLAX', 30);
    if (r === 'lose') return;
    if (r !== 'caught') yield* say(cfg.calm);
    S.set(cfg.beat);
  }
  // Using the POKé FLUTE from the bag (ItemUsePokeFlute): wakes Snorlax when standing next to it.
  G.pokeFluteField = function* () {
    for (let i = 0; i < 30 && G.engine.top() !== G.ow; i++) yield; // let the menus close
    const cfg = SNORLAX[G.ow.map.name];
    if (cfg && !S.flag(cfg.beat) && shown(cfg.id) && posIn(cfg.coords) >= 0) {
      yield* say('PlayedFluteHadEffectText');
      S.set(cfg.fight);
      yield* snorlaxBattle(cfg);
      return true;
    }
    yield* say('PlayedFluteNoEffectText');
    return true;
  };
  def('Route12', { talk: { ROUTE12_SNORLAX: function* () { yield* say(SNORLAX.Route12.talk); } } });
  def('Route16', { talk: { ROUTE16_SNORLAX: function* () { yield* say(SNORLAX.Route16.talk); } } });

  // ---------------- Route 12 gate (upstairs: TM39 girl + binoculars) and Super Rod house
  def('Route12Gate2F', {
    talk: {
      ROUTE12GATE2F_BRUNETTE_GIRL: function* () {
        if (S.flag('EVENT_GOT_TM39')) { yield* say('Route12Gate2FBrunetteGirlTM39ExplanationText'); return; }
        yield* say('Route12Gate2FBrunetteGirlYouCanHaveThisText');
        if (yield* giveItem('TM_SWIFT', 'Route12Gate2FBrunetteGirlReceivedTM39Text', 'Route12Gate2FBrunetteGirlTM39NoRoomText')) S.set('EVENT_GOT_TM39');
      },
    },
    sign: { TEXT_ROUTE12GATE2F_LEFT_BINOCULARS: facingUp('Route12Gate2FLeftBinocularsText'), TEXT_ROUTE12GATE2F_RIGHT_BINOCULARS: facingUp('Route12Gate2FRightBinocularsText') },
  });
  def('Route12SuperRodHouse', {
    talk: {
      ROUTE12SUPERRODHOUSE_FISHING_GURU: function* () {
        if (S.flag('EVENT_GOT_SUPER_ROD')) { yield* say('Route12SuperRodHouseFishingGuruTryFishingText'); return; }
        if (!(yield* ask('Route12SuperRodHouseFishingGuruDoYouLikeToFishText'))) { yield* say('Route12SuperRodHouseFishingGuruThatsDisappointingText'); return; }
        if (yield* giveItem('SUPER_ROD', 'Route12SuperRodHouseFishingGuruReceivedSuperRodText', 'Route12SuperRodHouseFishingGuruNoRoomText')) {
          S.set('EVENT_GOT_SUPER_ROD');
          yield* say('Route12SuperRodHouseFishingGuruFishingWayOfLifeText');
        }
      },
    },
  });

  // ---------------- Route 15: the importer missed these trainer headers (jr Route15TalkToTrainer pattern)
  (function patchRoute15() {
    const m = G.MAPDATA && G.MAPDATA.maps.Route15; if (!m) return;
    const names = ['CooltrainerF1', 'CooltrainerF2', 'CooltrainerM1', 'CooltrainerM2', 'Beauty1', 'Beauty2', 'Biker1', 'Biker2', 'CooltrainerF3', 'CooltrainerF4'];
    const range = [2, 3, 3, 3, 2, 3, 3, 3, 3, 3];
    m.objs.filter(o => o.trainer).forEach((o, i) => {
      if (o.th || !names[i]) return;
      o.th = { flag: 'EVENT_BEAT_ROUTE_15_TRAINER_' + i, range: range[i], battle: 'Route15' + names[i] + 'BattleText', end: 'Route15' + names[i] + 'EndBattleText', after: 'Route15' + names[i] + 'AfterBattleText' };
    });
  })();
  def('Route15Gate2F', {
    talk: { ROUTE15GATE2F_OAKS_AIDE: function* () { yield* oaksAide(50, 'EXP_ALL', 'EVENT_GOT_EXP_ALL', 'Route15Gate2FOaksAideExpAllText'); } },
    sign: { TEXT_ROUTE15GATE2F_BINOCULARS: facingUp('Route15Gate2FBinocularsText') },
    hidden: {
      '1,2': function* () { // Route15GateLeftBinoculars: shows ARTICUNO
        if (P().dir !== 'up') return;
        yield* say('Route15UpstairsBinocularsText');
        if (G.cry) G.cry('ARTICUNO');
        yield* monBox('ARTICUNO');
      },
    },
  });
  // DisplayMonFrontSpriteInBox
  function* monBox(sp) {
    const box = { t: 0, done: false, update() { this.t++; if (this.t > 10 && (G.input.pressed.a || G.input.pressed.b)) this.done = true; }, draw(s) { G.ui.frame(s, 110, 24, 100, 96); s.blit(G.pokeSprite(sp, 'front'), 128, 40); } };
    yield* G.engine.run(box);
  }

  // ================================================================= FUCHSIA CITY
  def('FuchsiaCity', {
    sign: {
      TEXT_FUCHSIACITY_CHANSEY_SIGN: function* () { yield* say('FuchsiaCityChanseySignText'); yield* showDex('CHANSEY'); },
      TEXT_FUCHSIACITY_VOLTORB_SIGN: function* () { yield* say('FuchsiaCityVoltorbSignText'); yield* showDex('VOLTORB'); },
      TEXT_FUCHSIACITY_KANGASKHAN_SIGN: function* () { yield* say('FuchsiaCityKangaskhanSignText'); yield* showDex('KANGASKHAN'); },
      TEXT_FUCHSIACITY_SLOWPOKE_SIGN: function* () { yield* say('FuchsiaCitySlowpokeSignText'); yield* showDex('SLOWPOKE'); },
      TEXT_FUCHSIACITY_LAPRAS_SIGN: function* () { yield* say('FuchsiaCityLaprasSignText'); yield* showDex('LAPRAS'); },
      TEXT_FUCHSIACITY_FOSSIL_SIGN: function* () {
        // the display shows the fossil Pokémon you did NOT pick at Mt.Moon
        if (S.flag('EVENT_GOT_DOME_FOSSIL')) { yield* say('FuchsiaCityFossilSignOmanyteText'); yield* showDex('OMANYTE'); }
        else if (S.flag('EVENT_GOT_HELIX_FOSSIL')) { yield* say('FuchsiaCityFossilSignKabutoText'); yield* showDex('KABUTO'); }
        else yield* say('FuchsiaCityFossilSignUndeterminedText');
      },
    },
  });

  // ---------------- Fuchsia Gym (Koga). The invisible walls are part of the map collision.
  const FUCHSIA_TRAINERS = [0, 1, 2, 3, 4, 5].map(i => 'EVENT_BEAT_FUCHSIA_GYM_TRAINER_' + i);
  def('FuchsiaGym', {
    talk: {
      FUCHSIAGYM_KOGA: function* (a) {
        yield* gymLeader(a, {
          cls: 'KOGA', beat: 'EVENT_BEAT_KOGA', gotTM: 'EVENT_GOT_TM06', tm: 'TM_TOXIC', badge: 'SOULBADGE', trainers: FUCHSIA_TRAINERS,
          before: 'FuchsiaGymKogaBeforeBattleText', win: 'FuchsiaGymKogaReceivedSoulBadgeText', info: 'FuchsiaGymKogaSoulBadgeInfoText',
          recv: 'FuchsiaGymKogaReceivedTM06Text', explain: 'FuchsiaGymKogaTM06ExplanationText', noRoom: 'FuchsiaGymKogaTM06NoRoomText', after: 'FuchsiaGymKogaPostBattleAdviceText',
        });
      },
      FUCHSIAGYM_GYM_GUIDE: function* () { yield* say(S.flag('EVENT_BEAT_KOGA') ? 'FuchsiaGymGymGuideBeatKogaText' : 'FuchsiaGymGymGuideChampInMakingText'); },
    },
  });

  // ---------------- Fuchsia houses
  def('FuchsiaGoodRodHouse', {
    talk: {
      FUCHSIAGOODRODHOUSE_FISHING_GURU: function* () {
        if (S.flag('EVENT_GOT_GOOD_ROD')) { yield* say('FuchsiaGoodRodHouseFishingGuruHowAreTheFishText'); return; }
        if (!(yield* ask('FuchsiaGoodRodHouseFishingGuruText'))) { yield* say('FuchsiaGoodRodHouseFishingGuruThatsSoDisappointingText'); return; }
        if (yield* giveItem('GOOD_ROD', 'FuchsiaGoodRodHouseFishingGuruReceivedGoodRodText', 'FuchsiaGoodRodHouseFishingGuruNoRoomText')) S.set('EVENT_GOT_GOOD_ROD');
      },
    },
  });
  def('WardensHouse', {
    talk: {
      WARDENSHOUSE_WARDEN: function* () {
        if (S.flag('EVENT_GOT_HM04')) { yield* say('WardensHouseWardenHM04ExplanationText'); return; }
        if (G.bag.has('GOLD_TEETH')) {
          sfx('get_item');
          yield* say('WardensHouseWardenGaveTheGoldTeethText');
          G.bag.remove('GOLD_TEETH', 1);
          S.set('EVENT_GAVE_GOLD_TEETH');
        } else if (!S.flag('EVENT_GAVE_GOLD_TEETH')) {
          const yes = yield* ask('WardensHouseWardenGibberish1Text');
          yield* say(yes ? 'WardensHouseWardenGibberish2Text' : 'WardensHouseWardenGibberish3Text');
          return;
        }
        yield* say('WardensHouseWardenThanksText');
        if (yield* giveItem('HM_STRENGTH', 'WardensHouseWardenReceivedHM04Text', 'WardensHouseWardenHM04NoRoomText')) S.set('EVENT_GOT_HM04');
      },
    },
    sign: {
      TEXT_WARDENSHOUSE_DISPLAY_LEFT: function* () { yield* say('WardensHouseDisplayPhotosAndFossilsText'); },
      TEXT_WARDENSHOUSE_DISPLAY_RIGHT: function* () { yield* say('WardensHouseDisplayMerchandiseText'); },
    },
  });
  def('FuchsiaPokecenter', { talk: { FUCHSIAPOKECENTER_LINK_RECEPTIONIST: cableClub }, hidden: { '0,4': benchGuy('FuchsiaCityPokecenterGuyText') } });

  // ================================================================= SAFARI ZONE
  const SAFARI_MAPS = /^SafariZone/;
  const inSafari = () => S.flag('EVENT_IN_SAFARI_ZONE') && G.state.safariSteps !== undefined;
  function endSafariState() { S.clear('EVENT_IN_SAFARI_ZONE'); S.clear('EVENT_SAFARI_GAME_OVER'); delete G.state.safariBalls; delete G.state.safariSteps; }
  // PA announcement, then back to the gate (SafariZoneGameOver)
  function* safariGameOver() {
    if (G.state.safariBalls > 0) yield* say('TimesUpText');
    yield* say('GameOverText');
    S.set('EVENT_SAFARI_GAME_OVER');
    G.ow.surfing = false; G.ow.biking = false;
    yield* S.warp('SafariZoneGate', 4, 0, 'down');
  }
  // Counts a step inside the Safari Zone (SafariZoneCheckSteps); returns a game-over script when time is up.
  function safariStep() {
    if (!inSafari() || S.flag('EVENT_SAFARI_GAME_OVER')) return null;
    if (G.state.safariSteps <= 0) return guarded(safariGameOver());
    G.state.safariSteps--;
    return null;
  }
  // Out of SAFARI BALLs after a battle (SafariZoneCheck).
  const origWild = G.startWildBattle;
  G.startWildBattle = function* (sp, lv, opts) {
    const r = yield* origWild(sp, lv, opts);
    if (opts && opts.safari && inSafari() && !(G.state.safariBalls > 0) && !S.flag('EVENT_SAFARI_GAME_OVER') && SAFARI_MAPS.test(G.ow.map.name)) yield* guarded(safariGameOver());
    return r;
  };
  // Leaving the Safari by other means (ESCAPE ROPE, DIG, blackout) ends the game like Red.
  const origOnEnter = G.scripts.onEnter;
  G.scripts.onEnter = function (map) {
    if (S.flag('EVENT_IN_SAFARI_ZONE') && !SAFARI_MAPS.test(map.name)) endSafariState();
    return origOnEnter.apply(this, arguments);
  };
  // Steps/balls box shown next to the START menu while in the Safari (like Red).
  function safariHud() {
    if (G.ow.fx.some(f => f.safariHud)) return;
    G.ow.fx.push({ safariHud: true, draw(s) {
      if (!inSafari() || !SAFARI_MAPS.test(G.ow.map.name)) return false;
      const top = G.engine.top();
      if (!(top && top.items && top.items.includes('OPTION') && top.items.includes('SAVE'))) return true;
      G.ui.frame(s, 4, 4, 112, 40);
      G.ui.text(s, String(G.state.safariSteps).padStart(3, ' ') + '/500', 14, 11);
      G.ui.text(s, 'BALL×' + String(G.state.safariBalls).padStart(2, ' '), 14, 25);
      return true;
    } });
  }
  function moneyBoxScene() { return { draw(s) { const t = '$' + G.state.money; G.ui.frame(s, 214, 4, 100, 38); G.ui.text(s, 'MONEY', 224, 11, G.gfx.hex('#8a7a60')); G.ui.text(s, t, 304 - G.font.measure(t), 24); } }; }

  function* safariEntry(x) {
    yield* say('SafariZoneGateSafariZoneWorker1Text');
    P().dir = 'right';
    if (x === 3) { yield* walk('R'); P().dir = 'right'; }
    const box = moneyBoxScene(); G.engine.push(box);
    let yes;
    try { yes = yield* ask('SafariZoneGateSafariZoneWorker1WouldYouLikeToJoinText'); } finally { G.engine.pop(box); }
    if (!yes) { yield* say('SafariZoneGateSafariZoneWorker1PleaseComeAgainText'); yield* walk('D'); return; }
    if (G.state.money < 500) { yield* say('SafariZoneGateSafariZoneWorker1NotEnoughMoneyText'); yield* walk('D'); return; }
    G.state.money -= 500;
    sfx('get_item');
    G.engine.push(box);
    try { yield* say('SafariZoneGateSafariZoneWorker1ThatllBe500PleaseText'); } finally { G.engine.pop(box); }
    yield* say('SafariZoneGateSafariZoneWorker1CallYouOnThePAText');
    G.state.safariBalls = 30; G.state.safariSteps = 502;
    S.set('EVENT_IN_SAFARI_ZONE'); S.clear('EVENT_SAFARI_GAME_OVER');
    if (yield* walk('UU')) { G.state.safariSteps -= 2; yield* takeWarp(); }
    else G.state.safariSteps -= 2;
  }
  // Coming back into the gate from the Safari (SafariZoneGateLeavingSafariScript)
  function* safariLeaving() {
    yield* settleIn();
    P().dir = 'down';
    if (S.flag('EVENT_SAFARI_GAME_OVER')) {
      yield* say('SafariZoneGateSafariZoneWorker1GoodHaulComeAgainText');
      endSafariState();
      yield* walk('DDD');
      return;
    }
    if (yield* ask('SafariZoneGateSafariZoneWorker1LeavingEarlyText')) {
      yield* say('SafariZoneGateSafariZoneWorker1ReturnSafariBallsText');
      endSafariState();
      yield* walk('DDD');
    } else {
      yield* say('SafariZoneGateSafariZoneWorker1GoodLuckText');
      P().dir = 'up';
      yield* takeWarp(); // back into the Safari
    }
  }
  def('SafariZoneGate', {
    enter() { if (S.flag('EVENT_IN_SAFARI_ZONE') && P().y <= 1) return guarded(safariLeaving()); return null; },
    step(x, y) {
      if (busy) return null;
      if (!S.flag('EVENT_IN_SAFARI_ZONE') && y === 2 && (x === 3 || x === 4)) return guarded(safariEntry(x));
      return null;
    },
    talk: {
      SAFARIZONEGATE_SAFARI_ZONE_WORKER1: function* () { yield* say('SafariZoneGateSafariZoneWorker1Text'); },
      SAFARIZONEGATE_SAFARI_ZONE_WORKER2: function* () {
        const first = yield* ask('SafariZoneGateSafariZoneWorker2FirstTimeHereText');
        yield* say(first ? 'SafariZoneGateSafariZoneWorker2SafariZoneExplanationText' : 'SafariZoneGateSafariZoneWorker2YoureARegularHereText');
      },
    },
  });
  for (const m of ['SafariZoneCenter', 'SafariZoneEast', 'SafariZoneNorth', 'SafariZoneWest', 'SafariZoneCenterRestHouse', 'SafariZoneEastRestHouse', 'SafariZoneNorthRestHouse', 'SafariZoneWestRestHouse', 'SafariZoneSecretHouse']) {
    def(m, { enter() { safariHud(); return null; }, step() { return safariStep(); } });
  }
  def('SafariZoneSecretHouse', {
    talk: {
      SAFARIZONESECRETHOUSE_FISHING_GURU: function* () {
        if (S.flag('EVENT_GOT_HM03')) { yield* say('SafariZoneSecretHouseFishingGuruHM03ExplanationText'); return; }
        yield* say('SafariZoneSecretHouseFishingGuruYouHaveWonText');
        if (yield* giveItem('HM_SURF', 'SafariZoneSecretHouseFishingGuruReceivedHM03Text', 'SafariZoneSecretHouseFishingGuruHM03NoRoomText')) S.set('EVENT_GOT_HM03');
      },
    },
  });

  // ================================================================= SEAFOAM ISLANDS
  const both = (a, b) => S.flag(a) && S.flag(b);
  // holes: boulder pushed in -> event + boulder appears below; player steps in -> falls to `land`
  const SEAFOAM = {
    SeafoamIslands1F: { below: 'SeafoamIslandsB1F', holes: [[17, 6], [24, 6]], land: [[18, 7], [23, 7]], ev: ['EVENT_SEAFOAM1_BOULDER1_DOWN_HOLE', 'EVENT_SEAFOAM1_BOULDER2_DOWN_HOLE'], show: ['SEAFOAMISLANDSB1F_BOULDER1', 'SEAFOAMISLANDSB1F_BOULDER2'] },
    SeafoamIslandsB1F: { below: 'SeafoamIslandsB2F', holes: [[18, 6], [23, 6]], land: [[19, 7], [22, 7]], ev: ['EVENT_SEAFOAM2_BOULDER1_DOWN_HOLE', 'EVENT_SEAFOAM2_BOULDER2_DOWN_HOLE'], show: ['SEAFOAMISLANDSB2F_BOULDER1', 'SEAFOAMISLANDSB2F_BOULDER2'] },
    SeafoamIslandsB2F: { below: 'SeafoamIslandsB3F', holes: [[19, 6], [22, 6]], land: [[18, 7], [19, 7]], ev: ['EVENT_SEAFOAM3_BOULDER1_DOWN_HOLE', 'EVENT_SEAFOAM3_BOULDER2_DOWN_HOLE'], show: ['SEAFOAMISLANDSB3F_BOULDER5', 'SEAFOAMISLANDSB3F_BOULDER6'] },
    SeafoamIslandsB3F: { below: 'SeafoamIslandsB4F', holes: [[3, 16], [6, 16]], land: [[4, 14], [5, 14]], ev: ['EVENT_SEAFOAM4_BOULDER1_DOWN_HOLE', 'EVENT_SEAFOAM4_BOULDER2_DOWN_HOLE'], show: ['SEAFOAMISLANDSB4F_BOULDER1', 'SEAFOAMISLANDSB4F_BOULDER2'] },
  };
  const currentsB3F = () => !both('EVENT_SEAFOAM3_BOULDER1_DOWN_HOLE', 'EVENT_SEAFOAM3_BOULDER2_DOWN_HOLE');
  const currentsB4F = () => !both('EVENT_SEAFOAM4_BOULDER1_DOWN_HOLE', 'EVENT_SEAFOAM4_BOULDER2_DOWN_HOLE');

  // Forced surfing along a strong current; drops off the water when it reaches land.
  function* current(path) {
    const ow = G.ow;
    ow.surfing = true;
    for (const c of path) {
      yield* S.movePlayer(c, 2);
      yield;
      if (warping()) { while (warping()) yield; return; }
      const p = ow.player;
      if (!ow.map.isWater(p.x, p.y) && ow.map.passable(p.x, p.y)) ow.surfing = false;
    }
    yield* takeWarp();
  }
  // Fall through a hole to the floor below (dungeon warp).
  function* fallThrough(map, x, y) {
    sfx('jump');
    yield* G.fadeOut(10);
    G.ow.load(map, x, y, 'down');
    if (G.ow.map.isWater(x, y)) G.ow.surfing = true;
    yield* G.fadeIn(10);
  }
  function seafoamStep(name) {
    const cfg = SEAFOAM[name];
    return function (x, y) {
      if (busy) return null;
      const i = cfg.holes.findIndex(([hx, hy]) => hx === x && hy === y);
      if (i >= 0) return guarded(fallThrough(cfg.below, cfg.land[i][0], cfg.land[i][1]));
      if (name === 'SeafoamIslandsB3F' && x === 15 && y === 8 && currentsB3F()) return guarded(current('DDDRRRRRDDDDDD'));
      return null;
    };
  }
  def('SeafoamIslands1F', { enter() { S.set('EVENT_IN_SEAFOAM_ISLANDS'); return null; }, step: seafoamStep('SeafoamIslands1F') });
  def('SeafoamIslandsB1F', { step: seafoamStep('SeafoamIslandsB1F') });
  def('SeafoamIslandsB2F', { step: seafoamStep('SeafoamIslandsB2F') });
  def('SeafoamIslandsB3F', {
    enter() {
      // landed from the B2F holes: the current sweeps the player down to B4F unless the boulders block it
      const i = posIn([[18, 7], [19, 7]]);
      if (i < 0) return null;
      G.ow.surfing = true;
      if (!currentsB3F()) return null;
      return guarded((function* () { yield* settleIn(); yield* current(i === 0 ? 'DDDDRRDDDDDD' : 'LDDDDRRDDDDDD'); })());
    },
    step: seafoamStep('SeafoamIslandsB3F'),
  });
  def('SeafoamIslandsB4F', {
    enter() {
      const p = P();
      // arriving on the waterfall from B3F: pushed up by the current
      const w = posIn([[20, 17], [21, 17], [20, 16], [21, 16]]);
      if (w >= 0 && currentsB3F()) return guarded((function* () { yield* settleIn(); yield* current(w < 2 ? 'UU' : 'U'); })());
      // landed from the B3F holes
      const i = posIn([[4, 14], [5, 14]]);
      if (i >= 0) {
        G.ow.surfing = true;
        if (!currentsB4F()) return null;
        return guarded((function* () { yield* settleIn(); yield* current(i === 0 ? 'URRRUUU' : 'URRUUU'); G.ow.surfing = false; })());
      }
      if (G.ow.map.isWater(p.x, p.y)) G.ow.surfing = true;
      return null;
    },
    talk: { SEAFOAMISLANDSB4F_ARTICUNO: function* (a) { yield* staticMon(a, 'ARTICUNO', 50, 'EVENT_BEAT_ARTICUNO', 'SeafoamIslandsB4FArticunoBattleText'); } },
  });
  // Leaving Seafoam resets unfinished boulder puzzles (Route20BoulderScript)
  def('Route20', {
    enter() {
      if (!S.flag('EVENT_IN_SEAFOAM_ISLANDS')) return null;
      S.clear('EVENT_IN_SEAFOAM_ISLANDS');
      if (!both('EVENT_SEAFOAM3_BOULDER1_DOWN_HOLE', 'EVENT_SEAFOAM3_BOULDER2_DOWN_HOLE')) {
        S.show('SEAFOAMISLANDS1F_BOULDER1', 'SeafoamIslands1F'); S.show('SEAFOAMISLANDS1F_BOULDER2', 'SeafoamIslands1F');
        for (const [m, id] of [['SeafoamIslandsB1F', 'SEAFOAMISLANDSB1F_BOULDER1'], ['SeafoamIslandsB1F', 'SEAFOAMISLANDSB1F_BOULDER2'], ['SeafoamIslandsB2F', 'SEAFOAMISLANDSB2F_BOULDER1'], ['SeafoamIslandsB2F', 'SEAFOAMISLANDSB2F_BOULDER2'], ['SeafoamIslandsB3F', 'SEAFOAMISLANDSB3F_BOULDER5'], ['SeafoamIslandsB3F', 'SEAFOAMISLANDSB3F_BOULDER6']]) S.hide(id, m);
      }
      if (!both('EVENT_SEAFOAM4_BOULDER1_DOWN_HOLE', 'EVENT_SEAFOAM4_BOULDER2_DOWN_HOLE')) {
        S.show('SEAFOAMISLANDSB3F_BOULDER2', 'SeafoamIslandsB3F'); S.show('SEAFOAMISLANDSB3F_BOULDER3', 'SeafoamIslandsB3F');
        S.hide('SEAFOAMISLANDSB4F_BOULDER1', 'SeafoamIslandsB4F'); S.hide('SEAFOAMISLANDSB4F_BOULDER2', 'SeafoamIslandsB4F');
      }
      return null;
    },
  });

  // ================================================================= VICTORY ROAD (boulder switches)
  const VR_SWITCH = {
    VictoryRoad1F: [{ at: [17, 13], ev: 'EVENT_VICTORY_ROAD_1_BOULDER_ON_SWITCH', cells: [[9, 12, 'cave_high', true]] }],
    VictoryRoad2F: [{ at: [1, 16], ev: 'EVENT_VICTORY_ROAD_2_BOULDER_ON_SWITCH1', cells: [[7, 8, 'cave_high', true], [7, 9, 'cave_high', true]] },
      { at: [9, 16], ev: 'EVENT_VICTORY_ROAD_2_BOULDER_ON_SWITCH2', cells: [[23, 14, 'cave_high', true]] }],
    VictoryRoad3F: [{ at: [3, 5], ev: 'EVENT_VICTORY_ROAD_3_BOULDER_ON_SWITCH1', cells: [[7, 10, 'cave_high', true]] }],
  };
  function vrApply(name) {
    const cells = [];
    for (const sw of VR_SWITCH[name]) if (S.flag(sw.ev)) cells.push(...sw.cells);
    if (cells.length) setCells(cells);
  }
  def('VictoryRoad1F', { enter() { vrApply('VictoryRoad1F'); return null; } });
  def('VictoryRoad2F', {
    enter() { S.clear('EVENT_VICTORY_ROAD_1_BOULDER_ON_SWITCH'); vrApply('VictoryRoad2F'); return null; },
    talk: { VICTORYROAD2F_MOLTRES: function* (a) { yield* staticMon(a, 'MOLTRES', 50, 'EVENT_BEAT_MOLTRES', 'VictoryRoad2FMoltresBattleText'); } },
  });
  def('VictoryRoad3F', {
    enter() { vrApply('VictoryRoad3F'); return null; },
    step(x, y) { if (!busy && x === 23 && y === 15) return guarded(fallThrough('VictoryRoad2F', 22, 16)); return null; },
  });

  // Boulders: switches (Victory Road) and holes (Seafoam, Victory Road 3F)
  const prevBoulder = G.onBoulderMoved;
  G.onBoulderMoved = function (map, b) {
    const name = map.name;
    const sf = SEAFOAM[name];
    if (sf) {
      const i = sf.holes.findIndex(([x, y]) => x === b.x && y === b.y);
      if (i >= 0) return (function* () {
        S.set(sf.ev[i]);
        yield* S.wait(6);
        sfx('boulder');
        if (b.obj) S.hide(b.obj.id);
        S.show(sf.show[i], sf.below);
      })();
      return null;
    }
    if (name === 'VictoryRoad3F' && b.x === 23 && b.y === 15) return (function* () {
      if (S.flag('EVENT_VICTORY_ROAD_3_BOULDER_ON_SWITCH2')) return;
      S.set('EVENT_VICTORY_ROAD_3_BOULDER_ON_SWITCH2');
      yield* S.wait(6);
      if (b.obj) S.hide(b.obj.id);
      S.show('VICTORYROAD2F_BOULDER3', 'VictoryRoad2F');
    })();
    const sws = VR_SWITCH[name];
    if (sws) {
      const sw = sws.find(s => s.at[0] === b.x && s.at[1] === b.y);
      if (sw && !S.flag(sw.ev)) return (function* () { S.set(sw.ev); sfx('door'); vrApply(name); yield* S.wait(4); })();
    }
    return prevBoulder ? prevBoulder(map, b) : null;
  };

  // ================================================================= ROUTE 22 GATE / ROUTE 23 (badge checks)
  (function () {
    const other = !!MS.Route22Gate; // another region file already scripts the BOULDERBADGE guard
    let passed = false;
    const fixLastMap = () => { G.state.lastOutdoor = P().y < 4 ? 'Route23' : 'Route22'; };
    function* guard() {
      if (S.hasBadge('BOULDERBADGE')) { sfx('get_item'); yield* say('Route22GateGuardGoRightAheadText'); passed = true; return; }
      yield* say('Route22GateGuardNoBoulderbadgeText');
      yield* say('Route22GateGuardICantLetYouPassText');
      P().dir = 'down';
      yield* walk('D');
    }
    def('Route22Gate', {
      enter() { passed = false; fixLastMap(); return null; },
      step(x, y) {
        fixLastMap();
        if (other || busy || passed) return null;
        if (y === 2 && (x === 4 || x === 5)) return guarded(guard());
        return null;
      },
      talk: other ? {} : { ROUTE22GATE_GUARD: function* () { yield* guarded(guard()); } },
    });
  })();
  const R23 = [ // row, badge, guard object
    [35, 'EARTHBADGE', 'ROUTE23_GUARD1'], [56, 'VOLCANOBADGE', 'ROUTE23_GUARD2'], [85, 'MARSHBADGE', 'ROUTE23_SWIMMER1'], [96, 'SOULBADGE', 'ROUTE23_SWIMMER2'],
    [105, 'RAINBOWBADGE', 'ROUTE23_GUARD3'], [119, 'THUNDERBADGE', 'ROUTE23_GUARD4'], [136, 'CASCADEBADGE', 'ROUTE23_GUARD5'],
  ];
  function* route23Check(badge, fromStep) {
    setVar('wNameBuffer', badge);
    if (S.hasBadge(badge)) {
      sfx('get_item');
      yield* say('Route23OhThatIsTheBadgeText');
      yield* say('Route23GoRightAheadText');
      S.set('EVENT_PASSED_' + badge + '_CHECK');
      return;
    }
    yield* say('Route23YouDontHaveTheBadgeYetText');
    P().dir = 'down';
    yield* walk('D');
  }
  const r23talk = {};
  for (const [, badge, id] of R23) r23talk[id] = function* () { yield* guarded(route23Check(badge)); };
  def('Route23', {
    enter() {
      // Route23SetVictoryRoadBoulders
      S.clear('EVENT_VICTORY_ROAD_2_BOULDER_ON_SWITCH1'); S.clear('EVENT_VICTORY_ROAD_2_BOULDER_ON_SWITCH2');
      S.clear('EVENT_VICTORY_ROAD_3_BOULDER_ON_SWITCH1'); S.clear('EVENT_VICTORY_ROAD_3_BOULDER_ON_SWITCH2');
      S.show('VICTORYROAD3F_BOULDER4', 'VictoryRoad3F');
      S.hide('VICTORYROAD2F_BOULDER3', 'VictoryRoad2F');
      return null;
    },
    step(x, y) {
      if (busy) return null;
      const g = R23.find(r => r[0] === y);
      if (!g || (y === 35 && x >= 14)) return null;
      if (S.flag('EVENT_PASSED_' + g[1] + '_CHECK')) return null;
      return guarded(route23Check(g[1], true));
    },
    talk: r23talk,
  });

  // ================================================================= CINNABAR ISLAND
  def('CinnabarIsland', {
    enter() { S.clear('EVENT_MANSION_SWITCH_ON'); S.clear('EVENT_LAB_STILL_REVIVING_FOSSIL'); return null; },
    step(x, y) {
      if (busy || x !== 18 || y !== 4 || G.bag.has('SECRET_KEY')) return null;
      return guarded((function* () { P().dir = 'up'; yield* say('CinnabarIslandDoorIsLockedText'); yield* walk('D'); })());
    },
  });
  def('CinnabarPokecenter', { talk: { CINNABARPOKECENTER_LINK_RECEPTIONIST: cableClub }, hidden: { '0,4': benchGuy('CinnabarPokecenterGuyText') } });

  // ---------------- Pokémon Mansion: statue switches swap the gates on every floor
  const MANSION = {
    PokemonMansion1F: { off: [[12, 6, 'O'], [8, 3, 'H'], [10, 8, 'H'], [13, 13, 'H']], on: [[12, 6, 'H'], [8, 3, 'O'], [10, 8, 'O'], [13, 13, 'O']], switches: ['2,5'], text: 'PokemonMansion1F' },
    PokemonMansion2F: { off: [[4, 2, 'O'], [9, 4, 'T'], [3, 11, 'V']], on: [[4, 2, 'V'], [9, 4, 'O'], [3, 11, 'O']], switches: ['2,11'], text: 'PokemonMansion2F' },
    PokemonMansion3F: { off: [[7, 2, 'O'], [7, 5, 'V']], on: [[7, 2, 'V'], [7, 5, 'O']], switches: ['10,5'], text: 'PokemonMansion2F' },
    PokemonMansionB1F: { off: [[13, 8, 'O'], [6, 11, 'O'], [4, 3, 'V'], [8, 8, 'T']], on: [[13, 8, 'H'], [6, 11, 'V'], [4, 3, 'O'], [8, 8, 'O']], switches: ['20,3', '18,25'], text: 'PokemonMansion2F' },
  };
  function mansionGates(name) {
    const cfg = MANSION[name], cells = [];
    for (const [bx, by, sh] of (S.flag('EVENT_MANSION_SWITCH_ON') ? cfg.on : cfg.off)) cells.push(...blockCells(bx, by, sh));
    setCells(cells);
  }
  function mansionSwitch(name) {
    const cfg = MANSION[name];
    return function* () {
      if (P().dir !== 'up') return;
      if (yield* ask(cfg.text + 'SwitchText')) {
        yield* say(cfg.text + 'SwitchPressedText');
        sfx('door');
        if (S.flag('EVENT_MANSION_SWITCH_ON')) S.clear('EVENT_MANSION_SWITCH_ON'); else S.set('EVENT_MANSION_SWITCH_ON');
        mansionGates(name);
      } else yield* say(cfg.text + 'SwitchNotPressedText');
    };
  }
  for (const name in MANSION) {
    const hidden = {};
    for (const k of MANSION[name].switches) hidden[k] = mansionSwitch(name);
    def(name, { enter() { mansionGates(name); return null; }, hidden });
  }
  // 3F floor holes drop you to 1F/2F
  def('PokemonMansion3F', {
    step(x, y) {
      if (busy || y !== 14) return null;
      if (x === 16 || x === 17) return guarded(fallThrough('PokemonMansion1F', 16, 14));
      if (x === 19) return guarded(fallThrough('PokemonMansion2F', 18, 14));
      return null;
    },
  });

  // ---------------- Cinnabar Gym: quiz machines, gates, trainers and BLAINE
  const CG_GATES = [null, [9, 3, 'T'], [6, 3, 'T'], [6, 6, 'T'], [3, 8, 'V'], [2, 6, 'T'], [2, 3, 'T']]; // gate 1..6 (x, y, shape)
  const CG_QUIZ = { '15,7': [1, true], '10,1': [2, false], '9,7': [3, false], '9,13': [4, false], '1,13': [5, true], '1,7': [6, false] }; // gate, correct answer is YES
  const CG_NERDS = ['CINNABARGYM_SUPER_NERD1', 'CINNABARGYM_SUPER_NERD2', 'CINNABARGYM_SUPER_NERD3', 'CINNABARGYM_SUPER_NERD4', 'CINNABARGYM_SUPER_NERD5', 'CINNABARGYM_SUPER_NERD6', 'CINNABARGYM_SUPER_NERD7'];
  const cgBeat = i => 'EVENT_BEAT_CINNABAR_GYM_TRAINER_' + i;
  const cgGate = i => 'EVENT_CINNABAR_GYM_GATE' + i + '_UNLOCKED';
  function cinnabarGates() {
    const cells = [];
    for (let i = 1; i <= 6; i++) { const [bx, by, sh] = CG_GATES[i]; cells.push(...blockCells(bx, by, S.flag(cgGate(i)) ? 'O' : sh)); }
    setCells(cells);
  }
  function* unlockGate(i) {
    if (!S.flag(cgGate(i))) sfx('door');
    S.set(cgGate(i));
    cinnabarGates();
    yield* S.wait(4);
  }
  // Talking to (or being challenged by) super nerd N (0-based): battle, then its gate (N) opens.
  function* cinnabarTrainer(n) {
    const a = S.actor(CG_NERDS[n]); if (!a) return;
    const lbl = 'CinnabarGymSuperNerd' + (n + 1);
    if (S.flag(cgBeat(n))) { yield* say(lbl + 'AfterBattleText'); return; }
    yield* say(lbl + 'BattleText');
    const tr = a.obj.trainer;
    const r = yield* S.battle(tr.cls, tr.n, { winText: G.fmt(S.t(lbl + 'EndBattleText')) });
    if (r !== 'win') return;
    S.set(cgBeat(n));
    if (n >= 1) yield* unlockGate(n);
  }
  G.cinnabarQuiz = function (h) {
    if (P().dir !== 'up') return null;
    const q = CG_QUIZ[h.x + ',' + h.y];
    if (!q) return null;
    const [gate, yesIsRight] = q;
    return guarded((function* () {
      yield* say('CinnabarGymQuizIntroText');
      const yes = yield* ask('CinnabarQuizQuestionsText' + gate);
      if (yes === yesIsRight) {
        sfx('get_item');
        yield* say('CinnabarGymQuizCorrectText');
        yield* unlockGate(gate);
        return;
      }
      sfx('bump');
      yield* say('CinnabarGymQuizIncorrectText');
      const n = gate; // trainer index for this gate (super nerd n+1)
      if (S.flag(cgBeat(n))) return;
      const a = S.actor(CG_NERDS[n]);
      if (!a) return;
      yield* S.move(a, n === 2 ? 'LU' : 'L');
      S.faceTo(a, P()); S.faceTo(P(), a);
      yield* cinnabarTrainer(n);
    })());
  };
  const cgTalk = {};
  CG_NERDS.forEach((id, n) => { cgTalk[id] = function* () { yield* cinnabarTrainer(n); }; });
  cgTalk.CINNABARGYM_BLAINE = function* (a) {
    yield* gymLeader(a, {
      cls: 'BLAINE', beat: 'EVENT_BEAT_BLAINE', gotTM: 'EVENT_GOT_TM38', tm: 'TM_FIRE_BLAST', badge: 'VOLCANOBADGE', trainers: [0, 1, 2, 3, 4, 5, 6].map(cgBeat),
      before: 'CinnabarGymBlainePreBattleText', win: 'CinnabarGymBlaineReceivedVolcanoBadgeText', info: 'CinnabarGymBlaineVolcanoBadgeInfoText',
      recv: 'CinnabarGymBlaineReceivedTM38Text', explain: 'CinnabarGymBlaineTM38ExplanationText', noRoom: 'CinnabarGymBlaineTM38NoRoomText', after: 'CinnabarGymBlainePostBattleAdviceText',
    });
  };
  cgTalk.CINNABARGYM_GYM_GUIDE = function* () { yield* say(S.flag('EVENT_BEAT_BLAINE') ? 'CinnabarGymGymGuideBeatBlaineText' : 'CinnabarGymGymGuideChampInMakingText'); };
  def('CinnabarGym', { enter() { cinnabarGates(); return null; }, talk: cgTalk });

  // ---------------- Cinnabar Lab: fossil revival, trades, TM35
  const FOSSILS = [['DOME_FOSSIL', 'KABUTO'], ['HELIX_FOSSIL', 'OMANYTE'], ['OLD_AMBER', 'AERODACTYL']];
  function fossilNames() {
    const item = S.flag('LAB_FOSSIL_ITEM') ? G.state.flags.LAB_FOSSIL_ITEM : null, mon = G.state.flags.LAB_FOSSIL_MON;
    if (mon) setVar('wStringBuffer', G.speciesName(mon));
    if (item) setVar('wNameBuffer', G.itemName(item));
  }
  def('CinnabarLabFossilRoom', {
    talk: {
      CINNABARLABFOSSILROOM_SCIENTIST1: function* () {
        if (!S.flag('EVENT_GAVE_FOSSIL_TO_LAB')) {
          yield* say('CinnabarLabFossilRoomScientist1Text');
          const have = FOSSILS.filter(([it]) => G.bag.has(it));
          if (!have.length) { yield* say('CinnabarLabFossilRoomScientist1NoFossilsText'); return; }
          const r = yield* G.choose(have.map(([it]) => G.itemName(it)), { x: 6, y: 6 });
          if (r < 0) { yield* say('CinnabarLabFossilRoomScientist1ComeAgainText'); return; }
          const [item, mon] = have[r];
          G.state.flags.LAB_FOSSIL_ITEM = item; G.state.flags.LAB_FOSSIL_MON = mon;
          fossilNames();
          if (!(yield* ask('CinnabarLabFossilRoomScientist1SeesFossilText'))) { yield* say('CinnabarLabFossilRoomScientist1ComeAgainText'); return; }
          yield* say('CinnabarLabFossilRoomScientist1TakesFossilText');
          G.bag.remove(item, 1);
          yield* say('CinnabarLabFossilRoomScientist1GoForAWalkText2');
          S.set('EVENT_GAVE_FOSSIL_TO_LAB'); S.set('EVENT_LAB_STILL_REVIVING_FOSSIL');
          return;
        }
        if (S.flag('EVENT_LAB_STILL_REVIVING_FOSSIL')) { yield* say('CinnabarLabFossilRoomScientist1GoForAWalkText'); return; }
        fossilNames();
        yield* say('CinnabarLabFossilRoomScientist1FossilIsBackToLifeText');
        S.set('EVENT_LAB_HANDING_OVER_FOSSIL_MON');
        if (yield* S.giftMon(G.state.flags.LAB_FOSSIL_MON, 30)) {
          for (const f of ['EVENT_GAVE_FOSSIL_TO_LAB', 'EVENT_LAB_STILL_REVIVING_FOSSIL', 'EVENT_LAB_HANDING_OVER_FOSSIL_MON', 'LAB_FOSSIL_ITEM', 'LAB_FOSSIL_MON']) S.clear(f);
        }
      },
      CINNABARLABFOSSILROOM_SCIENTIST2: trade(3), // PONYTA -> SEEL "SAILOR"
    },
  });
  def('CinnabarLabTradeRoom', { talk: { CINNABARLABTRADEROOM_GRAMPS: trade(7), CINNABARLABTRADEROOM_BEAUTY: trade(8) } });
  def('CinnabarLabMetronomeRoom', {
    talk: {
      CINNABARLABMETRONOMEROOM_SCIENTIST1: function* () {
        if (S.flag('EVENT_GOT_TM35')) { yield* say('CinnabarLabMetronomeRoomScientist1TM35ExplanationText'); return; }
        yield* say('CinnabarLabMetronomeRoomScientist1Text');
        if (yield* giveItem('TM_METRONOME', 'CinnabarLabMetronomeRoomScientist1ReceivedTM35Text', 'CinnabarLabMetronomeRoomScientist1TM35NoRoomText')) S.set('EVENT_GOT_TM35');
      },
    },
  });

  // ================================================================= POWER PLANT / CERULEAN CAVE statics
  const PP = { POWERPLANT_VOLTORB1: 0, POWERPLANT_VOLTORB2: 1, POWERPLANT_VOLTORB3: 2, POWERPLANT_ELECTRODE1: 3, POWERPLANT_VOLTORB4: 4, POWERPLANT_VOLTORB5: 5, POWERPLANT_ELECTRODE2: 6, POWERPLANT_VOLTORB6: 7 };
  const ppTalk = {};
  for (const id in PP) ppTalk[id] = function* (a) { yield* staticMon(a, a.obj.mon.species, a.obj.mon.level, 'EVENT_BEAT_POWER_PLANT_VOLTORB_' + PP[id], 'PowerPlantVoltorbBattleText', 'wild'); };
  ppTalk.POWERPLANT_ZAPDOS = function* (a) { yield* staticMon(a, 'ZAPDOS', 50, 'EVENT_BEAT_ZAPDOS', 'PowerPlantZapdosBattleText'); };
  def('PowerPlant', { talk: ppTalk });
  def('CeruleanCaveB1F', { talk: { CERULEANCAVEB1F_MEWTWO: function* (a) { yield* staticMon(a, 'MEWTWO', 70, 'EVENT_BEAT_MEWTWO', 'MewtwoBattleText'); } } });

  // ================================================================= VIRIDIAN GYM (GIOVANNI)
  def('ViridianGym', {
    talk: {
      VIRIDIANGYM_GIOVANNI: function* (a) {
        yield* gymLeader(a, {
          cls: 'GIOVANNI', n: 3, beat: 'EVENT_BEAT_VIRIDIAN_GYM_GIOVANNI', gotTM: 'EVENT_GOT_TM27', tm: 'TM_FISSURE', badge: 'EARTHBADGE',
          trainers: [0, 1, 2, 3, 4, 5, 6, 7].map(i => 'EVENT_BEAT_VIRIDIAN_GYM_TRAINER_' + i),
          before: 'ViridianGymGiovanniPreBattleText', win: 'ViridianGymGiovanniReceivedEarthBadgeText', info: 'ViridianGymGiovanniEarthBadgeInfoText',
          recv: 'ViridianGymGiovanniReceivedTM27Text', explain: 'ViridianGymGiovanniTM27ExplanationText', noRoom: 'ViridianGymGiovanniTM27NoRoomText', after: 'ViridianGymGiovanniPostBattleAdviceText',
          onVictory() {
            // the rival now waits on Route 22 (second battle, scripted in pallet.js)
            S.show('ROUTE22_RIVAL2', 'Route22');
            S.set('EVENT_2ND_ROUTE22_RIVAL_BATTLE'); S.set('EVENT_ROUTE22_RIVAL_WANTS_BATTLE');
          },
          afterTalk: function* () { yield* G.fadeOut(12); S.hide('VIRIDIANGYM_GIOVANNI'); yield* S.wait(4); yield* G.fadeIn(12); },
        });
      },
      VIRIDIANGYM_GYM_GUIDE: function* () { yield* say(S.flag('EVENT_BEAT_VIRIDIAN_GYM_GIOVANNI') ? 'ViridianGymGuidePostBattleText' : 'ViridianGymGuidePreBattleText'); },
    },
  });

  // ================================================================= INDIGO PLATEAU / ELITE FOUR
  const E4_EVENTS = ['EVENT_BEAT_LORELEIS_ROOM_TRAINER_0', 'EVENT_AUTOWALKED_INTO_LORELEIS_ROOM', 'EVENT_BEAT_BRUNOS_ROOM_TRAINER_0', 'EVENT_AUTOWALKED_INTO_BRUNOS_ROOM',
    'EVENT_BEAT_AGATHAS_ROOM_TRAINER_0', 'EVENT_AUTOWALKED_INTO_AGATHAS_ROOM', 'EVENT_BEAT_LANCES_ROOM_TRAINER_0', 'EVENT_BEAT_LANCE', 'EVENT_LANCES_ROOM_LOCK_DOOR', 'EVENT_BEAT_CHAMPION_RIVAL'];
  const resetE4 = () => { for (const f of E4_EVENTS) S.clear(f); S.clear('E4_STARTED'); };
  def('IndigoPlateau', { hidden: { '8,13': facingUp('IndigoPlateauHQText'), '11,13': facingUp('IndigoPlateauHQText') } });
  def('IndigoPlateauLobby', {
    enter() {
      S.clear('EVENT_VICTORY_ROAD_1_BOULDER_ON_SWITCH');
      if (S.flag('E4_STARTED')) resetE4(); // lost (or left) during the Elite Four: start over
      return null;
    },
    talk: { INDIGOPLATEAULOBBY_LINK_RECEPTIONIST: cableClub },
  });
  const E4 = {
    LoreleisRoom: { id: 'LORELEISROOM_LORELEI', cls: 'LORELEI', beat: 'EVENT_BEAT_LORELEIS_ROOM_TRAINER_0', auto: 'EVENT_AUTOWALKED_INTO_LORELEIS_ROOM', run: 'LoreleisRoomLoreleiDontRunAwayText', floor: 'floor_stone' },
    BrunosRoom: { id: 'BRUNOSROOM_BRUNO', cls: 'BRUNO', beat: 'EVENT_BEAT_BRUNOS_ROOM_TRAINER_0', auto: 'EVENT_AUTOWALKED_INTO_BRUNOS_ROOM', run: 'BrunosRoomBrunoDontRunAwayText', floor: 'floor_stone' },
    AgathasRoom: { id: 'AGATHASROOM_AGATHA', cls: 'AGATHA', beat: 'EVENT_BEAT_AGATHAS_ROOM_TRAINER_0', auto: 'EVENT_AUTOWALKED_INTO_AGATHAS_ROOM', run: 'AgathasRoomAgathaDontRunAwayText', floor: 'floor_tower' },
  };
  function e4Door(name) {
    const c = E4[name], open = S.flag(c.beat);
    setCells([[4, 0, open ? c.floor : 'door', open], [5, 0, open ? c.floor : 'door', open]]);
  }
  function* dontRunAway(c) { yield* say(c.run); P().dir = 'up'; yield* walk('U'); }
  for (const name in E4) {
    const c = E4[name];
    def(name, {
      enter() {
        S.set('E4_STARTED');
        e4Door(name);
        if (P().y < 11) return null;
        return guarded((function* () {
          yield* settleIn();
          if (!S.flag(c.auto)) { S.set(c.auto); P().dir = 'up'; yield* walk('UUUUUU'); }
          else yield* dontRunAway(c);
        })());
      },
      step(x, y) {
        if (busy || y !== 10 || (x !== 4 && x !== 5)) return null;
        return guarded(dontRunAway(c));
      },
      talk: {
        [c.id]: function* (a) {
          const th = a.obj.th;
          if (S.flag(c.beat)) { yield* say(th.after); return; }
          yield* say(th.battle);
          const r = yield* S.battle(c.cls, 1, { winText: G.fmt(S.t(th.end)) });
          if (r !== 'win') return;
          S.set(c.beat);
          yield* say(th.after);
          sfx('door');
          e4Door(name);
        },
      },
    });
  }
  // ---------------- Lance
  function lanceDoor() {
    const locked = S.flag('EVENT_LANCES_ROOM_LOCK_DOOR');
    setCells([[5, 12, locked ? 'door' : 'floor_stone', !locked], [6, 12, locked ? 'door' : 'floor_stone', !locked]]);
  }
  function* lanceBattle(a) {
    a = a || S.actor('LANCESROOM_LANCE');
    const th = a.obj.th;
    if (S.flag('EVENT_BEAT_LANCES_ROOM_TRAINER_0')) { yield* say(th.after); S.set('EVENT_BEAT_LANCE'); return; }
    S.faceTo(a, P()); S.faceTo(P(), a);
    yield* say(th.battle);
    const r = yield* S.battle('LANCE', 1, { winText: G.fmt(S.t(th.end)) });
    if (r !== 'win') return;
    S.set('EVENT_BEAT_LANCES_ROOM_TRAINER_0');
    yield* say(th.after);
    S.set('EVENT_BEAT_LANCE');
  }
  def('LancesRoom', {
    enter() {
      S.set('E4_STARTED');
      lanceDoor();
      if (S.flag('EVENT_BEAT_LANCE') || !(P().x === 24 && P().y === 16)) return null;
      return guarded((function* () { yield* settleIn(); yield* walk('LLLLLLDDDDDDDLLLLLLLLLLLLUUUUUUUUUUUU'); yield* lockLance(); })());
    },
    step(x, y) {
      if (busy || S.flag('EVENT_BEAT_LANCE')) return null;
      const i = posIn([[5, 1], [6, 2], [5, 11], [6, 11]]);
      if (i < 0) return null;
      if (i < 2) return guarded(lanceBattle());
      if (!S.flag('EVENT_LANCES_ROOM_LOCK_DOOR')) return guarded(lockLance());
      return null;
    },
    talk: { LANCESROOM_LANCE: function* (a) { yield* guarded(lanceBattle(a)); } },
  });
  function* lockLance() {
    if (S.flag('EVENT_LANCES_ROOM_LOCK_DOOR')) return;
    S.set('EVENT_LANCES_ROOM_LOCK_DOOR');
    sfx('door');
    lanceDoor();
    yield* S.wait(4);
  }

  // ---------------- Champion (RIVAL3) and PROF.OAK
  def('ChampionsRoom', {
    enter() {
      if (S.flag('EVENT_BEAT_CHAMPION_RIVAL')) return null;
      return guarded((function* () {
        yield* settleIn();
        yield* walk('UUURU');
        const p = P(), rival = S.actor('CHAMPIONSROOM_RIVAL');
        p.dir = 'up'; if (rival) rival.dir = 'down';
        S.music('rival');
        yield* say('ChampionsRoomRivalIntroText');
        const r = yield* S.battle('RIVAL3', G.rivalParty(1), { winText: G.fmt(S.t('RivalDefeatedText')), loseText: G.fmt(S.t('RivalVictoryText')) });
        if (r !== 'win') return;
        S.set('EVENT_BEAT_CHAMPION_RIVAL');
        yield* say('ChampionsRoomRivalAfterBattleText');
        // PROF.OAK arrives to a slowed-down CITIES1 (ChampionsRoomOakArrivesScript: Music_Cities1AlternateTempo)
        G.stopMusic && G.stopMusic(); yield* S.wait(60);
        S.music('Cities1@232');
        yield* say('ChampionsRoomOakText');
        const oak = S.show('CHAMPIONSROOM_OAK', null, [3, 7]);
        yield* S.move(oak, 'UUUUU');
        p.dir = 'left'; if (rival) rival.dir = 'left'; oak.dir = 'down';
        yield* S.wait(6);
        setVar('wNameBuffer', G.speciesName(G.state.starter || 'CHARMANDER'));
        yield* say('ChampionsRoomOakCongratulatesPlayerText');
        oak.dir = 'right'; yield* S.wait(6);
        yield* say('ChampionsRoomOakDisappointedWithRivalText');
        oak.dir = 'down'; yield* S.wait(6);
        yield* say('ChampionsRoomOakComeWithMeText');
        yield* S.move(oak, 'UU');
        S.hide('CHAMPIONSROOM_OAK');
        if (yield* walk('LUUU')) { P().dir = 'up'; yield* takeWarp(); }
      })());
    },
    talk: { CHAMPIONSROOM_RIVAL: function* () { yield* say(S.flag('EVENT_BEAT_CHAMPION_RIVAL') ? 'ChampionsRoomRivalAfterBattleText' : 'ChampionsRoomRivalIntroText'); } },
  });

  // ---------------- Hall of Fame
  def('HallOfFame', {
    enter() {
      if (!S.flag('EVENT_BEAT_CHAMPION_RIVAL')) return null;
      return guarded((function* () {
        yield* settleIn();
        yield* walk('UUUUU');
        const p = P(), oak = S.actor('HALLOFFAME_OAK');
        p.dir = 'right'; if (oak) oak.dir = 'left';
        yield* S.wait(6);
        yield* say('HallOfFameOakText');
        S.hide('CERULEANCITY_SUPER_NERD3', 'CeruleanCity'); // the guard at CERULEAN CAVE steps aside
        yield* G.hallOfFame();
      })());
    },
  });

  // Hall of Fame + credits screens (AnimateHallOfFame, Credits), then save and restart at PALLET TOWN.
  const CREDITS = [
    ['POKéMON', 'RED VERSION STAFF', 'M'], ['DIRECTOR', 'SATOSHI TAJIRI', 'M'], ['PROGRAMMERS', 'TAKENORI OOTA', 'SHIGEKI MORIMOTO', 'F'],
    ['PROGRAMMERS', 'TETSUYA WATANABE', 'JUNICHI MASUDA', 'SOUSUKE TAMADA', 'M'], ['CHARACTER DESIGN', 'KEN SUGIMORI', 'ATSUKO NISHIDA', 'M'],
    ['MUSIC', 'JUNICHI MASUDA', 'F'], ['SOUND EFFECTS', 'JUNICHI MASUDA', 'M'], ['GAME DESIGN', 'SATOSHI TAJIRI', 'M'],
    ['MONSTER DESIGN', 'KEN SUGIMORI', 'ATSUKO NISHIDA', 'MOTOFUMI FUZIWARA', 'F'], ['MONSTER DESIGN', 'SHIGEKI MORIMOTO', 'SATOSHI OOTA', 'RENA YOSHIKAWA', 'M'],
    ['GAME SCENARIO', 'SATOSHI TAJIRI', 'F'], ['GAME SCENARIO', 'RYOHSUKE TANIGUCHI', 'FUMIHIRO NONOMURA', 'HIROYUKI ZINNAI', 'M'],
    ['PARAMETRIC DESIGN', 'KOHJI NISINO', 'TAKEO NAKAMURA', 'M'], ['MAP DESIGN', 'SATOSHI TAJIRI', 'KOHJI NISINO', 'F'],
    ['MAP DESIGN', 'KENJI MATSUSIMA', 'FUMIHIRO NONOMURA', 'RYOHSUKE TANIGUCHI', 'M'], ['PRODUCT TESTING', 'AKIYOSHI KAKEI', 'KAZUKI TSUCHIYA', 'F'],
    ['PRODUCT TESTING', 'TAKEO NAKAMURA', 'MASAMITSU YUDA', 'M'], ['SPECIAL THANKS', 'TATSUYA HISHIDA', 'YASUHIRO SAKAI', 'F'],
    ['SPECIAL THANKS', 'WATARU YAMAGUCHI', 'KAZUYUKI YAMAMOTO', 'T'], ['SPECIAL THANKS', 'AKIHITO TOMISAWA', 'HIROSHI KAWAMOTO', 'TOMOMICHI OOTA', 'M'],
    ['PRODUCERS', 'SHIGERU MIYAMOTO', 'F'], ['PRODUCERS', 'TAKASHI KAWAGUCHI', 'T'], ['PRODUCERS', 'TSUNEKAZU ISHIHARA', 'M'],
    ['US VERSION STAFF', 'F'], ['US COORDINATION', 'GAIL TILDEN', 'F'], ['US COORDINATION', 'NAOKO KAWAKAMI', 'HIRO NAKAMURA', 'T'],
    ['US COORDINATION', 'WILLIAM GIESE', 'SARA OSBORNE', 'T'], ['TEXT TRANSLATION', 'NOB OGASAWARA', 'F'], ['PROGRAMMERS', 'TERUKI MURAKAWA', 'KOHTA FUKUI', 'F'],
    ['SPECIAL THANKS', 'SATORU IWATA', 'F'], ['SPECIAL THANKS', 'TAKAHIRO HARADA', 'T'], ['PRODUCT TESTING', 'PAAD TESTING', 'NCL SUPER MARIO CLUB', 'F'],
    ['PRODUCER', 'TAKEHIRO IZUSHI', 'F'], ['EXECUTIVE PRODUCER', 'HIROSHI YAMAUCHI', 'M'], ['(C)1995-1999 NINTENDO', '(C)1995-1999 CREATURES', '(C)1995-1999 GAME FREAK', 'M'],
  ];
  const CREDITS_MONS = ['VENUSAUR', 'ARBOK', 'RHYHORN', 'FEAROW', 'ABRA', 'GRAVELER', 'HITMONLEE', 'TANGELA', 'STARMIE', 'GYARADOS', 'DITTO', 'OMASTAR', 'VILEPLUME', 'NIDOKING', 'PARASECT'];

  class HoFScene {
    constructor() { this.opaque = true; this.t = 0; this.mode = 'black'; this.mon = null; this.monX = 0; this.lines = []; this.alpha = 1; this.info = []; }
    update() { this.t++; }
    draw(s) {
      const { hex, mix } = G.gfx, P2 = G.PAL;
      if (this.mode === 'black') { s.clear(P2.black); return; }
      if (this.mode === 'hof' || this.mode === 'player') {
        for (let y = 0; y < 180; y++) { const c = mix(hex('#20305a'), hex('#6a3a78'), y / 180); for (let x = 0; x < 320; x++) s.data[y * 320 + x] = c; }
        for (let i = 0; i < 36; i++) { const x = (i * 83 + this.t) % 320, y = (i * 47) % 110; if ((this.t + i * 9) % 60 < 40) s.pset(x, y, hex('#fff6c8')); }
        s.ellipse(160 + this.monX, 110, 60, 10, hex('#3a2a60'));
        if (G.logoText) G.logoText(s, 'HALL OF FAME', 160, 6, 2, '#fff068', '#f8b020', '#2848a8', '#101a48');
        if (this.pic) s.blit(this.pic, 128 + this.monX, 40);
        if (this.info.length) {
          G.ui.frame(s, 6, 124, 308, 52);
          this.info.slice(0, 2).forEach((l, i) => G.ui.text(s, l, 18, 133 + i * 15));
        }
        return;
      }
      if (this.mode === 'credits') {
        s.clear(P2.black);
        s.rect(0, 32, 320, 116, hex('#f8f8f0'));
        if (this.pic) s.blit(this.pic, this.monX, 58);
        const ink = mix(hex('#202028'), hex('#f8f8f0'), 1 - this.alpha);
        this.lines.forEach((l, i) => { const w = G.font.measure(l); G.font.draw(s, l, 160 - (w >> 1), 60 + i * 16 + (i ? 8 : 0), i === 0 ? mix(hex('#304890'), hex('#f8f8f0'), 1 - this.alpha) : ink); });
        return;
      }
      if (this.mode === 'end') {
        s.clear(P2.black);
        if (G.logoText) G.logoText(s, 'THE END', 160, 70, 3, '#ffffff', '#c8d0f0', '#303060', '#101020');
      }
    }
  }
  function* waitOrA(n) { for (let i = 0; i < n; i++) { if (i > 20 && G.input.pressed.a) return; yield; } }
  G.hallOfFame = function* () {
    const sc = new HoFScene();
    yield* G.fadeOut(20);
    G.engine.push(sc);
    yield* G.fadeIn(1);
    yield* S.wait(60);
    S.music('hall_of_fame');
    const team = [];
    sc.mode = 'hof';
    for (const m of G.state.party) {
      team.push({ species: m.species, level: m.level, name: m.name });
      sc.pic = G.pokeSprite(m.species, 'front'); sc.info = [];
      for (let i = 30; i >= 0; i--) { sc.monX = i * 6; yield; }
      if (G.cry) G.cry(m.species);
      const types = (G.DATA.species[m.species] || {}).types || [];
      sc.info = [m.name + '   Lv' + m.level, G.speciesName(m.species) + '   ' + types.map(t => G.typeName ? G.typeName(t) : t).join('/')];
      yield* waitOrA(150);
      sc.info = [];
      for (let i = 0; i <= 20; i++) { sc.monX = -i * 10; yield; }
    }
    // the trainer
    sc.mode = 'player'; sc.monX = 0;
    sc.pic = G.castPortrait ? G.castPortrait('red') : G.scale3x ? G.scale3x(G.chars.makeCharacter(G.CAST.red).down[0]) : null;
    const pt = G.state.playTime || 0;
    sc.info = [G.state.name + '   PLAY TIME ' + Math.floor(pt / 216000) + ':' + String(Math.floor(pt / 3600) % 60).padStart(2, '0'), 'MONEY $' + G.state.money + '   OWN ' + Object.keys(G.state.dex.caught).length];
    yield* waitOrA(200);
    G.state.hallOfFame = (G.state.hallOfFame || []).concat([{ team, time: pt }]).slice(-50);
    // credits
    yield* G.fadeOut(20);
    sc.mode = 'credits'; sc.pic = null; sc.lines = [];
    yield* G.fadeIn(20);
    S.music('credits');
    let mi = 0;
    for (const g of CREDITS) {
      const cmd = g[g.length - 1], lines = g.slice(0, -1);
      if (cmd === 'M' && mi < CREDITS_MONS.length) {
        // a Pokémon runs across the screen before the next names
        sc.lines = []; sc.pic = G.pokeSprite(CREDITS_MONS[mi++], 'front');
        for (let x = 330; x > -80; x -= 5) { sc.monX = x; yield; }
        sc.pic = null;
      }
      sc.lines = lines; sc.alpha = 0;
      for (let i = 0; i <= 12; i++) { sc.alpha = i / 12; yield; }
      yield* waitOrA(110);
      if (cmd === 'F' || cmd === 'M') for (let i = 12; i >= 0; i--) { sc.alpha = i / 12; yield; }
    }
    sc.lines = [];
    yield* G.fadeOut(20);
    sc.mode = 'end';
    yield* G.fadeIn(20);
    for (let i = 0; i < 600 && !(i > 60 && (G.input.pressed.a || G.input.pressed.start)); i++) yield;
    // HallOfFameResetEventsAndSaveScript
    resetE4();
    S.set('EVENT_BEAT_CHAMPION');
    Object.assign(G.state, { map: 'PalletTown', x: 5, y: 6, dir: 'down' }); // continuing after the HALL OF FAME starts in PALLET TOWN
    G.state.lastOutdoor = 'PalletTown';
    G.state.lastHeal = null; G.state.lastHealTown = { map: 'PalletTown', x: 5, y: 6 };
    G.ow.surfing = false; G.ow.biking = false;
    if (G.saveGame) G.saveGame();
    yield* G.fadeOut(30);
    // restart (jp Init): back to the title screen
    while (G.engine.scenes.length) G.engine.pop();
    G.fadeLevel = 0;
    if (G.titleScreen) G.titleScreen();
    else G.startGame(G.loadSave ? G.loadSave() : G.state);
  };
  // <PKMN LEAGUE> on the PC: browse the recorded HALL OF FAME teams (A = next, B = quit)
  G.viewHallOfFame = function* () {
    const recs = G.hofView ? G.hofView(G.state.hallOfFame || []) : (G.state.hallOfFame || []); // src/game/glitches.js
    yield* G.say("Accessed POKéMON LEAGUE's site.\fAccessed the HALL OF FAME List.");
    if (!recs.length) return;
    const sc = new HoFScene();
    yield* G.fadeOut(12);
    G.engine.push(sc); sc.mode = 'hof';
    yield* G.fadeIn(12);
    let quit = false;
    for (let r = 0; r < recs.length && !quit; r++) for (const m of recs[r].team) {
      sc.pic = G.pokeSprite(m.species, 'front'); sc.info = [];
      for (let i = 16; i >= 0; i--) { sc.monX = i * 8; yield; }
      sc.info = ['HALL OF FAME No ' + (r + 1), m.name + '   Lv' + m.level + '   ' + G.speciesName(m.species)];
      let i = 0;
      for (; i < 400; i++) { if (G.input.pressed.b) { quit = true; break; } if (i > 8 && G.input.pressed.a) break; yield; }
      if (quit) break;
    }
    yield* G.fadeOut(12);
    G.engine.pop(sc);
    yield* G.fadeIn(12);
  };
})(window.G);
