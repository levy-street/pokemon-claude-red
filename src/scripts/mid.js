// Story events: mid game region (see tools/SCRIPT_GUIDE.md).
// Rock Tunnel, Lavender Town + Pokémon Tower, Routes 7/8 (+ gates, Underground Path W-E), Celadon City
// (Dept. Store, Mansion, Game Corner + slots/prizes, Rocket Hideout, Erika's gym), Saffron City (Silph Co.,
// Sabrina, Fighting Dojo, houses) and Routes 16-18 (Cycling Road gates, forced bike, Fly house).
(function (G) {
  'use strict';
  const S = G.S;
  const rnd = n => Math.floor(Math.random() * n);
  const T = label => G.fmt(G.textFor(label));
  const setBuf = s => { G.textVars.wStringBuffer = s; G.textVars.wNameBuffer = s; };

  // ======================================================================
  //  small shared helpers
  // ======================================================================
  // defMapScript that merges with definitions other region scripts may already have made for a map
  function def(name, spec) {
    const cur = G.MAPSCRIPTS[name] || {}, out = Object.assign({}, spec);
    for (const k of ['talk', 'sign', 'hidden']) if (spec[k] && cur[k]) out[k] = Object.assign({}, cur[k], spec[k]);
    if (spec.enter && cur.enter) {
      const a = cur.enter, b = spec.enter;
      out.enter = function () {
        const g1 = a.apply(this, arguments), g2 = b.apply(this, arguments);
        if (g1 && g2) return (function* () { yield* g1; yield* g2; })();
        return g1 || g2;
      };
    }
    if (spec.step && cur.step) { const a = cur.step, b = spec.step; out.step = function (x, y) { return a.call(this, x, y) || b.call(this, x, y); }; }
    G.defMapScript(name, out);
  }
  // show a line of text and keep it on screen under a choice menu (like YES/NO questions)
  function* chooseWith(label, items, opts) {
    const str = G.TEXT[label] || label;
    yield* S.say(str, { noWait: true });
    const bg = new G.ui.StaticBox(str);
    G.engine.push(bg);
    try { return yield* G.choose(items, opts); } finally { G.engine.pop(bg); }
  }
  // pokered-style GiveItem: returns false (after the NPC's own "no room" text) when the bag is full
  function* giveItem(item, recvLabel, noRoomLabel, n) {
    if (!G.bag.add(item, n || 1)) { if (noRoomLabel) yield* S.say(noRoomLabel); return false; }
    setBuf(G.itemName(item));
    G.sfx && G.sfx(/^(TM|HM)_/.test(item) ? 'get_tm' : G.bag.isKey(item) ? 'get_key' : 'get_item');
    yield* S.say(recvLabel);
    return true;
  }
  // text followed by a Pokémon cry (text_far ... text_asm PlayCry)
  const cryTalk = (label, sp) => function* () { yield* S.say(label); G.cry && G.cry(sp); };
  // NPC whose line depends on one event flag
  const flagTalk = (flag, before, after) => function* () { yield* S.say(S.flag(flag) ? after : before); };
  // facing check used by binoculars, PCs and bench guys
  const facing = d => G.ow.player.dir === d;
  // cable club receptionist (engine/link/cable_club_npc.asm, no link partner)
  function* cableClub() {
    yield* S.say('CableClubNPCWelcomeText');
    yield* S.wait(60);
    yield* S.say(S.flag('EVENT_GOT_POKEDEX') ? 'CableClubNPCAreaReservedFor2FriendsLinkedByCableText' : 'CableClubNPCMakingPreparationsText');
  }
  G.cableClubNPC = G.cableClubNPC || cableClub;
  // small overlay box (coins / money) drawn above the overworld while a menu is open
  function infoBox(lines) {
    const box = { t: 0, update() {}, draw(s) {
      const ls = typeof lines === 'function' ? lines() : lines;
      const w = Math.max(...ls.map(l => G.font.measure(l))) + 28, h = ls.length * 15 + 14;
      G.ui.frame(s, 320 - w - 4, 4, w, h);
      ls.forEach((l, i) => G.ui.text(s, l, 320 - w + 10, 11 + i * 15));
    } };
    G.engine.push(box);
    return box;
  }
  const coinStr = () => 'COIN ' + String(G.state.coins || 0).padStart(4, ' ');
  const moneyStr = () => 'MONEY $' + G.state.money;
  const addCoins = n => { G.state.coins = Math.max(0, Math.min(9999, (G.state.coins || 0) + n)); };

  // ======================================================================
  //  engine hooks (wrapped, never replaced)
  // ======================================================================
  // remember the map we came from (elevators store their exit warps from it)
  const OWP = G.Overworld.prototype;
  const origLoad = OWP.load;
  OWP.load = function (name, x, y, dir) {
    G.prevMapName = this.map ? this.map.name : null;
    return origLoad.call(this, name, x, y, dir);
  };

  // per-map hook run after the player beats a header trainer (line of sight or talk)
  const AFTER_TRAINER = {};
  const prevFlow = G.trainerBattleFlow;
  G.trainerBattleFlow = function* (a) {
    const r = yield* prevFlow(a);
    const f = r === 'win' && G.ow && AFTER_TRAINER[G.ow.map.name];
    if (f) yield* f(a);
    return r;
  };

  // Rock Tunnel 1F trainer headers are named RockTunnel1TrainerHeaderN in pokered and weren't imported
  (function patchRockTunnel1F() {
    const m = G.MAPDATA.maps.RockTunnel1F; if (!m) return;
    const H = { HIKER1: [0, 4, 'Hiker1'], HIKER2: [1, 4, 'Hiker2'], HIKER3: [2, 3, 'Hiker3'], SUPER_NERD: [3, 3, 'SuperNerd'],
      COOLTRAINER_F1: [4, 4, 'CooltrainerF1'], COOLTRAINER_F2: [5, 4, 'CooltrainerF2'], COOLTRAINER_F3: [6, 4, 'CooltrainerF3'] };
    for (const o of m.objs) {
      const k = o.id.replace('ROCKTUNNEL1F_', ''), h = H[k];
      if (!h || o.th) continue;
      const p = 'RockTunnel1F' + h[2];
      o.th = { flag: 'EVENT_BEAT_ROCK_TUNNEL_1_TRAINER_' + h[0], range: h[1], battle: p + 'BattleText', end: p + 'EndBattleText', after: p + 'AfterBattleText' };
    }
  })();

  // Underground Path entrances set wLastMap so LAST_MAP exits return to the right route
  for (const [m, r] of [['UndergroundPathRoute7', 'Route7'], ['UndergroundPathRoute8', 'Route8']]) {
    def(m, { enter() { G.state.lastOutdoor = r; return null; } });
  }

  // ----------------------------------------------------------------------
  //  Pokémon Tower ghosts: without the SILPH SCOPE every wild POKéMON is an
  //  unidentifiable GHOST (engine/battle/core.asm IsGhostBattle / PrintGhostText)
  // ----------------------------------------------------------------------
  const TOWER = /^PokemonTower[1-7]F$/;
  G.isGhostBattleMap = () => !!(G.ow && G.ow.map && TOWER.test(G.ow.map.name) && !G.bag.has('SILPH_SCOPE'));
  G.ghostPic = function () {
    if (G.ghostPic.s) return G.ghostPic.s;
    const { Surface, hex, mix } = G.gfx;
    const s = new Surface(64, 64);
    const OUT = hex('#3a2a52'), HI = hex('#f4f0ff'), MID = hex('#d8d0ec'), LO = hex('#a89cc8'), HOLE = hex('#1c1428');
    const inside = (x, y) => {
      const dx = x - 32, dy = y - 25;
      if (dx * dx + dy * dy <= 16.5 * 16.5) return true;
      if (y >= 25 && y <= 60) {
        const half = 16.5 + (y - 25) * 0.3;
        const hem = 55 + Math.round(Math.sin((x - 32) / 2.6) * 3.2);
        if (Math.abs(dx) <= half && y <= hem) return true;
      }
      // little stubby arms
      const ax = Math.abs(dx) - 19, ay = y - 36;
      return ax >= 0 && ax * ax / 36 + ay * ay / 9 <= 1;
    };
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      let c = x < 26 ? HI : x < 38 ? MID : LO;
      if (y > 50) c = mix(c, LO, 0.5);
      s.pset(x, y, edge ? OUT : c);
    }
    // eye holes and a gaping mouth
    s.ellipse(25, 24, 3.2, 5, HOLE); s.ellipse(39, 24, 3.2, 5, HOLE);
    s.pset(24, 22, hex('#e8e0ff')); s.pset(38, 22, hex('#e8e0ff'));
    s.ellipse(32, 36, 4.5, 3.5, HOLE);
    return (G.ghostPic.s = s);
  };
  const oStartWild = G.startWildBattle;
  G.startWildBattle = function* (species, level, opts) {
    opts = Object.assign({}, opts || {});
    if (!opts.restlessSoul && G.isGhostBattleMap()) opts.ghost = true;
    if (opts.restlessSoul && !G.bag.has('SILPH_SCOPE')) opts.ghost = true;
    if (!opts.ghost && !opts.restlessSoul) return yield* oStartWild(species, level, opts);
    const m = new G.Mon(species, level, { ot: 'WILD' });
    if (opts.ghost) m.nick = 'GHOST';
    opts.noCatch = true; // ghosts dodge balls; the restless soul can't be caught either
    return yield* G.runBattle(Object.assign({ type: 'wild', enemyParty: [m] }, opts));
  };
  const BP = G.Battle.prototype;
  const oDoMove = BP.doMove;
  BP.doMove = function* (side, moveId) {
    if (this.o.ghost) {
      if (side.isPlayer) {
        const m = this.mon(side);
        if (m.status !== 'SLP' && m.status !== 'FRZ') { G.textVars.wBattleMonNick = m.name; yield* this.ui.msg(T('ScaredText')); return; }
      } else { yield* this.ui.msg(T('GetOutText')); return; }
    }
    return yield* oDoMove.call(this, side, moveId);
  };
  const oTryRun = BP.tryRun;
  BP.tryRun = function* (afterFaint) {
    if (this.o.ghost) { G.sfx && G.sfx('run'); yield* this.ui.msg(G.TEXT.GotAwayText || 'Got away safely!'); return true; }
    return yield* oTryRun.call(this, afterFaint);
  };
  const BSP = G.BattleScene.prototype;
  const oSprite = BSP.sprite;
  BSP.sprite = function (k) {
    if (k === 'e' && !this.subs.e && (this.ghostShow || (this.b && this.b.o.ghost))) return G.ghostPic();
    return oSprite.call(this, k);
  };
  const oIntro = BSP.intro;
  BSP.intro = function* (b) {
    const o = b.o;
    if (!o.ghost && !o.restlessSoul) return yield* oIntro.call(this, b);
    const sc = this, oSeen = G.dexSeen;
    if (o.ghost) G.dexSeen = () => {};
    if (o.restlessSoul && !o.ghost) sc.ghostShow = true;
    sc.msg = function* (text, mo) {
      if (typeof text === 'string' && /^Wild .* appeared!$/.test(text)) {
        delete sc.msg;
        G.textVars.wEnemyMonNick = 'GHOST';
        yield* sc.msg(T('EnemyAppearedText').replace(/\f\s*/g, ' '));
        if (o.ghost) { yield* sc.msg(T('GhostCantBeIDdText')); return; }
        // SILPH SCOPE unveils the restless soul (engine/battle/ghost_marowak_anim.asm)
        yield* sc.msg(T('UnveiledGhostText'));
        for (let i = 0; i < 48; i++) { sc.ghostShow = (i < 24 ? (i >> 2) % 2 === 0 : (i >> 3) % 2 === 0) && i < 44; yield; }
        sc.ghostShow = false;
        G.cry && G.cry(b.mon(b.e).species);
        G.textVars.wEnemyMonNick = b.mon(b.e).name;
        yield* sc.msg(T('WildMonAppearedText').replace(/\f\s*/g, ' '));
        return;
      }
      return yield* G.BattleScene.prototype.msg.call(sc, text, mo);
    };
    try { yield* oIntro.call(this, b); } finally { delete sc.msg; G.dexSeen = oSeen; }
  };

  // ----------------------------------------------------------------------
  //  Silph Co. card-key doors (engine/events/card_key.asm + each floor's
  //  GateCallbackScript). The .blk data has every door open; closed doors are
  //  re-applied on entry unless their EVENT_SILPH_CO_*_UNLOCKED_DOOR* is set.
  //  [event, blockX, blockY, kind]  kind h = block $54 (top row), v = $5f (right column), b = 11F $20 (bottom row)
  // ----------------------------------------------------------------------
  const CARD_DOORS = {
    SilphCo2F: [['EVENT_SILPH_CO_2_UNLOCKED_DOOR1', 2, 2, 'h'], ['EVENT_SILPH_CO_2_UNLOCKED_DOOR2', 2, 5, 'h']],
    SilphCo3F: [['EVENT_SILPH_CO_3_UNLOCKED_DOOR1', 4, 4, 'v'], ['EVENT_SILPH_CO_3_UNLOCKED_DOOR2', 8, 4, 'v']],
    SilphCo4F: [['EVENT_SILPH_CO_4_UNLOCKED_DOOR1', 2, 6, 'h'], ['EVENT_SILPH_CO_4_UNLOCKED_DOOR2', 6, 4, 'h']],
    SilphCo5F: [['EVENT_SILPH_CO_5_UNLOCKED_DOOR1', 3, 2, 'v'], ['EVENT_SILPH_CO_5_UNLOCKED_DOOR2', 3, 6, 'v'], ['EVENT_SILPH_CO_5_UNLOCKED_DOOR3', 7, 5, 'v']],
    SilphCo6F: [['EVENT_SILPH_CO_6_UNLOCKED_DOOR', 2, 6, 'v']],
    SilphCo7F: [['EVENT_SILPH_CO_7_UNLOCKED_DOOR1', 5, 3, 'h'], ['EVENT_SILPH_CO_7_UNLOCKED_DOOR2', 10, 2, 'h'], ['EVENT_SILPH_CO_7_UNLOCKED_DOOR3', 10, 6, 'h']],
    SilphCo8F: [['EVENT_SILPH_CO_8_UNLOCKED_DOOR', 3, 4, 'v']],
    SilphCo9F: [['EVENT_SILPH_CO_9_UNLOCKED_DOOR1', 1, 4, 'v'], ['EVENT_SILPH_CO_9_UNLOCKED_DOOR2', 9, 2, 'h'], ['EVENT_SILPH_CO_9_UNLOCKED_DOOR3', 9, 5, 'h'], ['EVENT_SILPH_CO_9_UNLOCKED_DOOR4', 5, 6, 'v']],
    SilphCo10F: [['EVENT_SILPH_CO_10_UNLOCKED_DOOR', 5, 4, 'h']],
    SilphCo11F: [['EVENT_SILPH_CO_11_UNLOCKED_DOOR', 3, 6, 'b']],
  };
  G.CARD_DOORS = CARD_DOORS;
  function doorCells(d) {
    const [, bx, by, k] = d, x = bx * 2, y = by * 2;
    if (k === 'h') return [[x, y], [x + 1, y]];
    if (k === 'v') return [[x + 1, y], [x + 1, y + 1]];
    return [[x, y + 1], [x + 1, y + 1]];
  }
  // clear a script override so the cell shows its original (open) data again
  function restoreCell(x, y) {
    const m = G.ow.map, i = y * m.w + x;
    delete m.overrides[i]; if (m.passOverride) delete m.passOverride[i];
    G.ow_rerender();
  }
  function applyCardDoors(map) {
    for (const d of CARD_DOORS[map] || []) {
      if (S.flag(d[0])) continue;
      for (const [x, y] of doorCells(d)) S.setCell(x, y, 'card_door', false);
    }
  }
  function cardDoorAt(x, y) {
    const list = G.ow && CARD_DOORS[G.ow.map.name];
    if (!list) return null;
    for (const d of list) if (!S.flag(d[0]) && doorCells(d).some(c => c[0] === x && c[1] === y)) return d;
    return null;
  }
  const oFieldInteract = G.fieldInteract;
  G.fieldInteract = function (fx, fy) {
    const d = cardDoorAt(fx, fy);
    if (d) return (function* () {
      if (!G.bag.has('CARD_KEY')) { yield* S.say('CardKeyFailText'); return; }
      G.sfx && G.sfx('get_item');
      yield* S.say(T('CardKeySuccessText1') + '\f' + T('CardKeySuccessText2'));
      S.set(d[0]);
      for (const [x, y] of doorCells(d)) restoreCell(x, y);
      G.sfx && G.sfx('door');
    })();
    return oFieldInteract ? oFieldInteract(fx, fy) : null;
  };
  // painter for the closed security door (two cells, horizontal or vertical pair)
  if (G.interior && G.interior.PAINT) {
    G.interior.PAINT.card_door = function (s, up, px, py, x, y, L) {
      const H = G.gfx.hex, P = G.PAL;
      const horiz = L(x - 1, y) === 'card_door' || L(x + 1, y) === 'card_door';
      const first = horiz ? L(x + 1, y) === 'card_door' : L(x, y + 1) === 'card_door';
      const steel = [H('#5a6076'), H('#7a8098'), H('#9aa0b6'), H('#c4c8d6')];
      for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
        const u = horiz ? i : j, v = horiz ? j : i;
        let c = steel[v < 3 ? 3 : v < 7 ? 2 : v < 12 ? 1 : 0];
        if ((u + (horiz ? 0 : 1)) % 4 === 0 && v > 2 && v < 13) c = steel[0];
        if (v === 0 || v === 15) c = P.outline;
        s.pset(px + i, py + j, c);
      }
      // frame ends and the seam between both halves
      for (let k = 0; k < 16; k++) {
        const a = horiz ? [px + (first ? 0 : 15), py + k] : [px + k, py + (first ? 0 : 15)];
        s.pset(a[0], a[1], P.outline);
        const sm = horiz ? [px + (first ? 15 : 0), py + k] : [px + k, py + (first ? 15 : 0)];
        s.pset(sm[0], sm[1], H('#2a2e3e'));
      }
      // card reader light next to the seam
      if (first) {
        const lx = horiz ? px + 12 : px + 6, ly = horiz ? py + 6 : py + 12;
        s.rect(lx - 1, ly - 1, 4, 4, P.outline); s.rect(lx, ly, 2, 2, H('#f04848'));
      }
    };
  }

  // ----------------------------------------------------------------------
  //  Cycling Road: stepping onto Route 16/18 next to the gates forces the
  //  BICYCLE (data/maps/force_bike_surf.asm); Route 17 slopes downhill.
  // ----------------------------------------------------------------------
  const FORCE_BIKE = { Route16: ['17,10', '17,11'], Route18: ['33,8', '33,9'] };
  const CYCLING = new Set(['Route16', 'Route17', 'Route18']);
  // CheckForceBikeOrSurf: runs after every step and whenever a map is entered (e.g. leaving the gate)
  function checkForceBike(ow) {
    const st = G.state, n = ow.map.name, p = ow.player;
    if (st.alwaysOnBike && !CYCLING.has(n)) st.alwaysOnBike = false;
    if (!st.alwaysOnBike && FORCE_BIKE[n] && FORCE_BIKE[n].includes(p.x + ',' + p.y)) {
      st.alwaysOnBike = true;
      if (!ow.biking) { ow.surfing = false; ow.biking = true; G.music && G.music('bike'); }
    }
  }
  const oAfterStep = G.afterStep;
  G.afterStep = function (ow) { checkForceBike(ow); return oAfterStep ? oAfterStep(ow) : false; };
  const oOnEnter = G.scripts.onEnter;
  G.scripts.onEnter = function (map) { if (G.ow && G.ow.player) checkForceBike(G.ow); return oOnEnter.apply(this, arguments); };
  if (G.fieldItems && G.fieldItems.BICYCLE) {
    const oBike = G.fieldItems.BICYCLE;
    G.fieldItems.BICYCLE = function* (scr) {
      if (G.state.alwaysOnBike && G.ow.biking) { yield* scr.say(T('CannotGetOffHereText')); return; }
      return yield* oBike(scr);
    };
  }
  const oOwUpdate = OWP.update;
  OWP.update = function (focused) {
    const I = G.input, p = this.player;
    let forced = false;
    // JoypadOverworld: on Cycling Road with nothing pressed, simulate DOWN
    if (focused && this.map && this.map.name === 'Route17' && p && !p.moving && !this.locks && !G.scriptRunning &&
        !I.BTN.some(b => I.down[b])) { I.down.down = true; forced = true; }
    const wasMoving = p && p.moving;
    const r = oOwUpdate.call(this, focused);
    if (forced) I.down.down = false;
    // DoBikeSpeedup: no speed-up while pedalling uphill/sideways on Route 17
    if (p && p.moving && !wasMoving && this.biking && this.map.name === 'Route17' && p.mdir !== 'down' && !p.jump) p.speed = 1;
    return r;
  };

  // Pokémon Tower 5F purified zone: no wild battles there (BIT_NO_BATTLES)
  const PURIFIED = new Set(['10,8', '11,8', '10,9', '11,9']);
  const oEnc = G.encounters.check;
  G.encounters.check = function (map, x, y, surfing) {
    if (map.name === 'PokemonTower5F' && PURIFIED.has(x + ',' + y)) return false;
    return oEnc.call(this, map, x, y, surfing);
  };

  // ======================================================================
  //  Saffron gate guards (shared by Route 5/6/7/8 gates; one flag for all)
  //  flag: EVENT_GAVE_SAFFRON_GUARDS_DRINK (pokered BIT_GAVE_SAFFRON_GUARDS_DRINK)
  // ======================================================================
  const DRINK_FLAG = 'EVENT_GAVE_SAFFRON_GUARDS_DRINK';
  G.SAFFRON_DRINK_FLAG = DRINK_FLAG;
  // RemoveGuardDrink: takes the first drink found (FRESH WATER, SODA POP, LEMONADE)
  G.removeGuardDrink = function () {
    for (const d of ['FRESH_WATER', 'SODA_POP', 'LEMONADE']) if (G.bag.has(d)) { G.bag.remove(d, 1); return d; }
    return null;
  };
  function* guardGiveDrink() {
    yield* S.say('SaffronGateGuardImParchedText');
    G.sfx && G.sfx('get_key');
    yield* S.say('SaffronGateGuardYouCanGoOnThroughText');
    S.set(DRINK_FLAG);
  }
  // talking to the guard (SaffronGateGuardText)
  G.saffronGuardTalk = function* () {
    if (S.flag(DRINK_FLAG)) { yield* S.say('SaffronGateGuardThanksForTheDrinkText'); return; }
    if (G.removeGuardDrink()) { yield* guardGiveDrink(); return; }
    yield* S.say('SaffronGateGuardGeeImThirstyText');
  };
  // coordinate trigger: facing = direction the player turns, push = step back out
  G.saffronGuardStep = function (facingDir, push) {
    if (S.flag(DRINK_FLAG)) return null;
    return (function* () {
      S.player().dir = facingDir;
      if (G.removeGuardDrink()) { yield* guardGiveDrink(); return; }
      yield* S.say('SaffronGateGuardGeeImThirstyText');
      yield* S.movePlayer(push);
    })();
  };
  def('Route7Gate', {
    step(x, y) { return x === 3 && (y === 3 || y === 4) ? G.saffronGuardStep('up', 'L') : null; },
    talk: { ROUTE7GATE_GUARD: G.saffronGuardTalk },
  });
  def('Route8Gate', {
    step(x, y) { return x === 2 && (y === 3 || y === 4) ? G.saffronGuardStep('left', 'R') : null; },
    talk: { ROUTE8GATE_GUARD: G.saffronGuardTalk },
  });

  // ======================================================================
  //  Pokémon Center extras (link receptionists, bench guys) in this region
  // ======================================================================
  const BENCH = {
    LavenderPokecenter: () => 'LavenderPokecenterGuyText', CeladonPokecenter: () => 'CeladonCityPokecenterGuyText',
    CeladonHotel: () => 'CeladonCityHotelText', RockTunnelPokecenter: () => 'RockTunnelPokecenterGuyText',
    SaffronPokecenter: () => S.flag('EVENT_BEAT_SILPH_CO_GIOVANNI') ? 'SaffronCityPokecenterGuyText2' : 'SaffronCityPokecenterGuyText1',
  };
  for (const map in BENCH) {
    const m = G.MAPDATA.maps[map]; if (!m) continue;
    const hidden = {};
    for (const h of m.hidden) if (h.fn === 'PrintBenchGuyText') hidden[h.x + ',' + h.y] = function* () { if (facing('left')) yield* S.say(BENCH[map]()); };
    const talk = {};
    for (const o of m.objs) if (o.sprite === 'link_receptionist') talk[o.id] = cableClub;
    def(map, { hidden, talk });
  }

  // ======================================================================
  //  LAVENDER TOWN
  // ======================================================================
  def('LavenderTown', {
    talk: {
      LAVENDERTOWN_LITTLE_GIRL: function* () {
        const yes = yield* S.ask('LavenderTownLittleGirlDoYouBelieveInGhostsText');
        yield* S.say(yes ? 'LavenderTownLittleGirlSoThereAreBelieversText' : 'LavenderTownLittleGirlHaHaGuessNotText');
      },
    },
  });
  def('LavenderCuboneHouse', {
    talk: {
      LAVENDERCUBONEHOUSE_CUBONE: cryTalk('LavenderCuboneHouseCuboneText', 'CUBONE'),
      LAVENDERCUBONEHOUSE_BRUNETTE_GIRL: flagTalk('EVENT_RESCUED_MR_FUJI', 'LavenderCuboneHouseBrunetteGirlPoorCubonesMotherText', 'LavenderCuboneHouseBrunetteGirlGhostIsGoneText'),
    },
  });
  def('LavenderMart', {
    talk: { LAVENDERMART_COOLTRAINER_M: flagTalk('EVENT_RESCUED_MR_FUJI', 'LavenderMartCooltrainerMReviveText', 'LavenderMartCooltrainerMNuggetText') },
  });
  def('MrFujisHouse', {
    talk: {
      MRFUJISHOUSE_SUPER_NERD: flagTalk('EVENT_RESCUED_MR_FUJI', 'MrFujisHouseSuperNerdMrFujiIsntHereText', 'MrFujisHouseSuperNerdMrFujiHadBeenPrayingText'),
      MRFUJISHOUSE_LITTLE_GIRL: flagTalk('EVENT_RESCUED_MR_FUJI', 'MrFujisHouseLittleGirlThisIsMrFujisHouseText', 'MrFujisHouseLittleGirlPokemonAreNiceToHugText'),
      MRFUJISHOUSE_PSYDUCK: cryTalk('MrFujisHousePsyduckText', 'PSYDUCK'),
      MRFUJISHOUSE_NIDORINO: cryTalk('MrFujisHouseNidorinoText', 'NIDORINO'),
      MRFUJISHOUSE_MR_FUJI: function* () {
        if (S.flag('EVENT_GOT_POKE_FLUTE')) { yield* S.say('MrFujisHouseMrFujiHasMyFluteHelpedYouText'); return; }
        yield* S.say('MrFujisHouseMrFujiIThinkThisMayHelpYourQuestText');
        if (!G.bag.add('POKE_FLUTE', 1)) { yield* S.say('MrFujisHouseMrFujiPokeFluteNoRoomText'); return; }
        setBuf(G.itemName('POKE_FLUTE'));
        G.sfx && G.sfx('get_key');
        yield* S.say('MrFujisHouseMrFujiReceivedPokeFluteText');
        yield* S.say('MrFujisHouseMrFujiPokeFluteExplanationText');
        S.set('EVENT_GOT_POKE_FLUTE');
      },
    },
  });

  // Name Rater (scripts/NameRatersHouse.asm)
  def('NameRatersHouse', {
    talk: {
      NAMERATERSHOUSE_NAME_RATER: function* () {
        const bye = function* () { yield* S.say('NameRatersHouseNameRaterComeAnyTimeYouLikeText'); };
        if (!(yield* S.ask('NameRatersHouseNameRaterWantMeToRateText'))) return yield* bye();
        yield* S.say('NameRatersHouseNameRaterWhichPokemonText');
        const i = yield* G.partyScreen({ msg: 'Choose a POKéMON.', pick: function* () { return true; } });
        if (i < 0) return yield* bye();
        const m = G.state.party[i];
        G.textVars.wNameBuffer = m.name;
        // traded POKéMON (different OT name or ID) can't be renamed
        if (m.ot !== G.state.name || (m.otId || 0) !== (G.state.trainerId || 0)) { yield* S.say('NameRatersHouseNameRaterATrulyImpeccableNameText'); return; }
        if (!(yield* S.ask('NameRatersHouseNameRaterGiveItANiceNameText'))) return yield* bye();
        yield* S.say('NameRatersHouseNameRaterWhatShouldWeNameItText');
        const n = yield* G.nameEntry(m.sp.name + "'s nickname?", '', 10);
        if (!n) return yield* bye();
        m.nick = n === m.sp.name ? null : n;
        G.textVars.wBuffer = n;
        yield* S.say('NameRatersHouseNameRaterPokemonHasBeenRenamedText');
      },
    },
  });

  // ======================================================================
  //  POKéMON TOWER
  // ======================================================================
  // 2F: rival ambush
  def('PokemonTower2F', {
    step(x, y) {
      if (S.flag('EVENT_BEAT_POKEMON_TOWER_RIVAL')) return null;
      const onLeft = x === 15 && y === 5, below = x === 14 && y === 6;
      if (!onLeft && !below) return null;
      return (function* () {
        const p = S.player(), rival = S.actor('POKEMONTOWER2F_RIVAL');
        S.music('rival');
        p.dir = onLeft ? 'left' : 'up';
        if (rival) rival.dir = onLeft ? 'right' : 'down';
        yield* S.wait(4);
        yield* towerRivalTalk(rival, onLeft);
      })();
    },
    talk: { POKEMONTOWER2F_RIVAL: function* (a) { yield* towerRivalTalk(a, S.player().x > a.x); } },
  });
  function* towerRivalTalk(rival, onLeft) {
    if (S.flag('EVENT_BEAT_POKEMON_TOWER_RIVAL')) { yield* S.say('PokemonTower2FRivalHowsYourDexText'); return; }
    yield* S.say('PokemonTower2FRivalWhatBringsYouHereText');
    const r = yield* S.battle('RIVAL2', G.rivalParty(4), { winText: T('PokemonTower2FRivalDefeatedText'), loseText: T('PokemonTower2FRivalVictoryText') });
    if (r !== 'win') return;
    S.set('EVENT_BEAT_POKEMON_TOWER_RIVAL');
    yield* S.say('PokemonTower2FRivalHowsYourDexText');
    S.music('rival');
    yield* S.move(rival, onLeft ? 'DDRRRRDD' : 'RDDRDDRR');
    S.hide('POKEMONTOWER2F_RIVAL');
    S.music(G.mapMusic(G.ow.map));
  }

  // 5F: purified zone heals the party once per entry into the zone
  // the purified zone glows: a soft 2x2 square of light on the floor, so you can see where to stand
  const PURIFIED_FX = { under: true, draw(s, cx, cy, t) {
    if (!G.ow || G.ow.map.name !== 'PokemonTower5F') return false;
    const x0 = 10 * 16 - cx, y0 = 8 * 16 - cy, glow = 0.45 + 0.12 * Math.sin(t / 22), { hex, mix } = G.gfx;
    const edge = hex('#fbf6ff'), fill = hex('#c8b8ff'), d = s.data;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const sx = x0 + x, sy = y0 + y; if (sx < 0 || sy < 0 || sx >= s.w || sy >= s.h) continue;
      const border = x === 0 || y === 0 || x === 31 || y === 31, inner = x === 2 || y === 2 || x === 29 || y === 29;
      const k = sy * s.w + sx; d[k] = mix(d[k], border || inner ? edge : fill, border ? Math.min(1, glow + 0.4) : inner ? glow + 0.2 : glow);
    }
    for (let i = 0; i < 4; i++) { // motes rising from the square
      const ph = (t + i * 29) % 90, px = x0 + 5 + ((i * 11 + Math.floor((t + i * 29) / 90) * 7) % 22), py = y0 + 28 - Math.floor(ph / 3);
      if (px >= 0 && py >= 0 && px < s.w && py < s.h) d[py * s.w + px] = mix(d[py * s.w + px], edge, 1 - ph / 90);
    }
    return true;
  } };
  def('PokemonTower5F', {
    enter() { if (!G.ow.fx.includes(PURIFIED_FX)) G.ow.fx.push(PURIFIED_FX); return null; },
    step(x, y) {
      if (!PURIFIED.has(x + ',' + y)) { S.clear('EVENT_IN_PURIFIED_ZONE'); return null; }
      // inside the zone: always consume the step (no trainers, no encounters)
      if (S.flag('EVENT_IN_PURIFIED_ZONE')) return (function* () {})();
      return (function* () {
        S.set('EVENT_IN_PURIFIED_ZONE');
        for (const m of G.state.party) m.healFull();
        G.sfx && G.sfx('heal');
        yield* G.fadeOut(8, G.PAL.white); yield* S.wait(6); yield* G.fadeIn(8);
        yield* S.say('PokemonTower5FPurifiedZoneText');
      })();
    },
  });

  // 6F: the restless soul of CUBONE's mother blocks the stairs
  def('PokemonTower6F', {
    step(x, y) {
      if (S.flag('EVENT_BEAT_GHOST_MAROWAK') || x !== 10 || y !== 16) return null;
      return (function* () {
        yield* S.say('PokemonTower6FBeGoneText');
        const r = yield* G.startWildBattle('MAROWAK', 30, { restlessSoul: true });
        if (r === 'lose') return;
        // a POKé DOLL escape (result 'fled') counts as defeating it, like the original
        if (r === 'win' || r === 'fled') {
          S.set('EVENT_BEAT_GHOST_MAROWAK');
          yield* S.say('PokemonTower6FGhostWasCubonesMotherText');
          G.cry && G.cry('MAROWAK');
          yield* S.wait(30);
          yield* S.say('PokemonTower6FSoulWasCalmedText');
          return;
        }
        yield* S.movePlayer('R');
      })();
    },
  });

  // 7F: Team Rocket grunts leave after losing, then Mr. Fuji is rescued
  const T7_EXIT = {
    POKEMONTOWER7F_ROCKET1: { '9,12': 'RDDDDDL', '10,11': 'DRDDDD', '11,11': 'DDDDD', '12,11': 'DDDDD' },
    POKEMONTOWER7F_ROCKET2: { '12,10': 'LDDDDDD', '11,9': 'DDDLDD', '10,9': 'DDDDD', '9,9': 'DDDDD' },
    POKEMONTOWER7F_ROCKET3: { '9,8': 'RDDDDDD', '10,7': 'DDDDD', '11,7': 'DDDDD', '12,7': 'DDDDD' },
  };
  function* tower7RocketLeaves(a) {
    const id = a.obj.id, p = S.player();
    if (!T7_EXIT[id]) return;
    yield* S.say(a.obj.th.after);
    yield* S.move(a, T7_EXIT[id][p.x + ',' + p.y] || 'DDDDD');
    S.hide(id);
  }
  AFTER_TRAINER.PokemonTower7F = tower7RocketLeaves;
  def('PokemonTower7F', {
    talk: {
      POKEMONTOWER7F_MR_FUJI: function* () {
        yield* S.say('PokemonTower7FMrFujiRescueText');
        S.set('EVENT_RESCUED_MR_FUJI'); S.set('EVENT_RESCUED_MR_FUJI_2');
        S.show('MRFUJISHOUSE_MR_FUJI', 'MrFujisHouse');
        S.hide('SAFFRONCITY_ROCKET8', 'SaffronCity');
        S.show('SAFFRONCITY_ROCKET9', 'SaffronCity');
        S.hide('POKEMONTOWER7F_MR_FUJI');
        G.state.lastOutdoor = 'LavenderTown';
        const w = G.maps.getMap('MrFujisHouse').warps[1];
        yield* S.warp('MrFujisHouse', w.x, w.y, 'up');
        S.music(G.mapMusic(G.ow.map));
      },
    },
  });

  // ======================================================================
  //  CELADON CITY
  // ======================================================================
  def('CeladonCity', {
    talk: {
      CELADONCITY_GRAMPS3: function* () {
        if (S.flag('EVENT_GOT_TM41')) { yield* S.say('CeladonCityGramps3TM41ExplanationText'); return; }
        yield* S.say('CeladonCityGramps3Text');
        if (yield* giveItem('TM_SOFTBOILED', 'CeladonCityGramps3ReceivedTM41Text', 'CeladonCityGramps3TM41NoRoomText')) S.set('EVENT_GOT_TM41');
      },
      CELADONCITY_POLIWRATH: cryTalk('CeladonCityPoliwrathText', 'POLIWRATH'),
    },
  });
  def('CeladonDiner', {
    talk: {
      CELADONDINER_GYM_GUIDE: function* () {
        if (S.flag('EVENT_GOT_COIN_CASE')) { yield* S.say('CeladonDinerGymGuideWinItBackText'); return; }
        yield* S.say('CeladonDinerGymGuideImFlatOutBustedText');
        if (yield* giveItem('COIN_CASE', 'CeladonDinerGymGuideReceivedCoinCaseText', 'CeladonDinerGymGuideCoinCaseNoRoomText')) S.set('EVENT_GOT_COIN_CASE');
      },
    },
  });
  def('CeladonMansion1F', {
    talk: {
      CELADONMANSION1F_MEOWTH: cryTalk('CeladonMansion1FMeowthText', 'MEOWTH'),
      CELADONMANSION1F_CLEFAIRY: cryTalk('CeladonMansion1FClefairyText', 'CLEFAIRY'),
      CELADONMANSION1F_NIDORANF: cryTalk('CeladonMansion1FNidoranFText', 'NIDORAN_F'),
    },
  });
  // game designer: diploma once every POKéMON but MEW is owned
  G.diploma = function* () {
    const H = G.gfx.hex;
    const sc = { opaque: true, t: 0, done: false, update(f) { this.t++; if (f && this.t > 20 && (G.input.pressed.a || G.input.pressed.b)) this.done = true; }, draw(s) {
      s.clear(H('#2a2438'));
      for (let y = 8; y < 172; y++) for (let x = 20; x < 300; x++) s.pset(x, y, ((x * 7 + y * 3) % 23 === 0) ? H('#efe2c0') : H('#f8eed4'));
      G.ui.frame(s, 20, 8, 280, 164, 'red', null);
      for (let x = 32; x < 288; x += 8) { s.pset(x, 20, H('#c8a050')); s.pset(x, 160, H('#c8a050')); }
      const c = (t, y, col) => G.ui.text(s, t, 160 - G.font.measure(t) / 2, y, col);
      c('~ DIPLOMA ~', 26, H('#8a2a3a'));
      c('PLAYER  ' + G.state.name, 50);
      ['Congrats! This diploma', 'certifies that you have', 'completed your POKéDEX.'].forEach((l, i) => c(l, 76 + i * 16));
      c('GAME FREAK', 138, H('#3a4a8a'));
    } };
    G.sfx && G.sfx('get_key');
    yield* G.engine.run(sc);
  };
  def('CeladonMansion3F', {
    talk: {
      CELADONMANSION3F_GAME_DESIGNER: function* () {
        const owned = Object.keys(G.state.dex.caught).filter(sp => sp !== 'MEW').length;
        if (owned < 150) { yield* S.say('CeladonMansion3FGameDesignerText'); return; }
        yield* S.say('CeladonMansion3FGameDesignerCompletedDexText');
        yield* G.diploma();
      },
    },
  });
  // Eevee on the Mansion roof
  def('CeladonMansionRoofHouse', {
    hidden: {
      '3,0': linkCableHelp, '4,0': linkCableHelp,
      '3,4': function* () { yield* S.say('TMNotebookText'); },
    },
    talk: {
      CELADONMANSION_ROOF_HOUSE_EEVEE_POKEBALL: function* () {
        if (yield* S.giftMon('EEVEE', 25)) S.hide('CELADONMANSION_ROOF_HOUSE_EEVEE_POKEBALL');
      },
    },
  });
  // blackboard: TRAINER TIPS on the link cable (engine/events/hidden_events/school_blackboard.asm)
  function* linkCableHelp() {
    yield* S.say('LinkCableHelpText1');
    for (;;) {
      const r = yield* chooseWith('LinkCableHelpText2', ['HOW TO LINK', 'COLOSSEUM', 'TRADE CENTER', 'STOP READING'], { x: 6, y: 6 });
      if (r < 0 || r === 3) return;
      yield* S.say('LinkCableInfoText' + (r + 1));
    }
  }

  // ---------------- Celadon Dept. Store ----------------
  def('CeladonMart3F', {
    talk: {
      CELADONMART3F_CLERK: function* () {
        if (S.flag('EVENT_GOT_TM18')) { yield* S.say('CeladonMart3FClerkTM18ExplanationText'); return; }
        yield* S.say('CeladonMart3FClerkTM18PreReceiveText');
        if (yield* giveItem('TM_COUNTER', 'CeladonMart3FClerkReceivedTM18Text', 'CeladonMart3FClerkTM18NoRoomText')) S.set('EVENT_GOT_TM18');
      },
    },
  });
  // elevators: exits lead back to the floor the player came from until a floor is chosen
  function elevatorScript(map, floors, gate) {
    def(map, {
      enter() {
        const m = G.ow.map, f = floors.find(fl => fl.map === G.prevMapName);
        if (f) for (const w of m.warps) { w.to = f.map; w.warp = f.warp; }
        else if (m.warps[0].to === 'UNUSED_MAP_ED') for (const w of m.warps) { w.to = floors[0].map; w.warp = floors[0].warp; }
        return null;
      },
    });
    return function* () {
      if (gate && !(yield* gate())) return;
      yield* S.elevator(floors);
    };
  }
  const MART_FLOORS = [['1F', 'CeladonMart1F', 5], ['2F', 'CeladonMart2F', 2], ['3F', 'CeladonMart3F', 2], ['4F', 'CeladonMart4F', 2], ['5F', 'CeladonMart5F', 2]]
    .map(([label, map, warp]) => ({ label, map, warp }));
  def('CeladonMartElevator', { sign: { TEXT_CELADONMARTELEVATOR: elevatorScript('CeladonMartElevator', MART_FLOORS) } });

  // rooftop vending machines (engine/events/vending_machine.asm)
  G.vendingMachine = function* () {
    yield* S.say('VendingMachineText1');
    const box = infoBox(() => [moneyStr()]);
    const drinks = [['FRESH_WATER', 200], ['SODA_POP', 300], ['LEMONADE', 350]];
    let r;
    try { r = yield* G.choose(drinks.map(([d, p]) => G.itemName(d) + '  $' + p).concat(['CANCEL']), { x: 6, y: 40 }); }
    finally { G.engine.pop(box); }
    if (r < 0 || r === 3) { yield* S.say('VendingMachineText7'); return; }
    const [item, price] = drinks[r];
    if (G.state.money < price) { yield* S.say('VendingMachineText4'); return; }
    if (!G.bag.add(item, 1)) { yield* S.say('VendingMachineText6'); return; }
    for (let i = 0; i < 30; i++) { if (i % 4 === 0) G.sfx && G.sfx('boulder'); yield* S.wait(2); }
    setBuf(G.itemName(item));
    yield* S.say('VendingMachineText5');
    G.state.money -= price;
  };
  // the thirsty girl trades TMs for drinks
  def('CeladonMartRoof', {
    sign: {
      TEXT_CELADONMARTROOF_VENDING_MACHINE1: G.vendingMachine, TEXT_CELADONMARTROOF_VENDING_MACHINE2: G.vendingMachine,
      TEXT_CELADONMARTROOF_VENDING_MACHINE3: G.vendingMachine,
    },
    talk: {
      CELADONMARTROOF_LITTLE_GIRL: function* () {
        const drinks = ['FRESH_WATER', 'SODA_POP', 'LEMONADE'].filter(d => G.bag.has(d));
        if (!drinks.length) { yield* S.say('CeladonMartRoofLittleGirlImThirstyText'); return; }
        if (!(yield* S.ask('CeladonMartRoofLittleGirlGiveHerADrinkText'))) return;
        const r = yield* chooseWith('CeladonMartRoofLittleGirlGiveHerWhichDrinkText', drinks.map(d => G.itemName(d)), { x: 6, y: 6 });
        if (r < 0) return;
        const REWARD = { FRESH_WATER: ['EVENT_GOT_TM13', 'TM_ICE_BEAM', 'FreshWater', 'TM13'], SODA_POP: ['EVENT_GOT_TM48', 'TM_ROCK_SLIDE', 'SodaPop', 'TM48'], LEMONADE: ['EVENT_GOT_TM49', 'TM_TRI_ATTACK', 'Lemonade', 'TM49'] };
        const [ev, tm, yay, n] = REWARD[drinks[r]];
        if (S.flag(ev)) { yield* S.say('CeladonMartRoofLittleGirlImNotThirstyText'); return; }
        yield* S.say('CeladonMartRoofLittleGirlYay' + yay + 'Text');
        G.bag.remove(drinks[r], 1);
        if (!(yield* giveItem(tm, 'CeladonMartRoofLittleGirlReceived' + n + 'Text', 'CeladonMartRoofLittleGirlNoRoomText'))) return;
        yield* S.say('CeladonMartRoofLittleGirl' + n + 'ExplanationText');
        S.set(ev);
      },
    },
  });

  // ---------------- Celadon Gym (Erika) ----------------
  function* erikaReward() {
    yield* S.say('CeladonGymRainbowBadgeInfoText');
    S.set('EVENT_BEAT_ERIKA');
    if (yield* giveItem('TM_MEGA_DRAIN', 'CeladonGymReceivedTM21Text', 'CeladonGymTM21NoRoomText')) { yield* S.say('TM21ExplanationText'); S.set('EVENT_GOT_TM21'); }
  }
  def('CeladonGym', {
    talk: {
      CELADONGYM_ERIKA: function* () {
        if (S.flag('EVENT_BEAT_ERIKA')) {
          if (!S.flag('EVENT_GOT_TM21')) { yield* erikaReward(); return; }
          yield* S.say('CeladonGymErikaPostBattleAdviceText'); return;
        }
        yield* S.say('CeladonGymErikaPreBattleText');
        const r = yield* S.battle('ERIKA', 1, { winText: T('CeladonGymErikaReceivedRainbowBadgeText') });
        if (r !== 'win') return;
        yield* S.awardBadge('RAINBOWBADGE');
        yield* erikaReward();
        for (let i = 0; i <= 6; i++) S.set('EVENT_BEAT_CELADON_GYM_TRAINER_' + i);
      },
    },
  });

  // ======================================================================
  //  ROCKET GAME CORNER
  // ======================================================================
  // hidden coins (data/events/hidden_events.asm; COIN+40 pays 20 due to the original typo)
  const GC_COINS = { '0,8': 10, '1,16': 10, '3,11': 20, '3,14': 10, '4,12': 10, '9,12': 20, '9,15': 10, '16,14': 10, '10,16': 10, '11,7': 20, '15,8': 100, '12,15': 10 };
  const gcHidden = {};
  for (const k in GC_COINS) gcHidden[k] = function* (h) {
    if (!G.bag.has('COIN_CASE')) return;
    const key = 'HIDDENCOIN_GameCorner_' + h.x + '_' + h.y;
    if (S.flag(key)) return;
    if ((G.state.coins || 0) >= 9999) { yield* S.say('DroppedHiddenCoinsText'); return; }
    S.set(key); addCoins(GC_COINS[k]);
    G.textVars.hCoins = GC_COINS[k];
    G.sfx && G.sfx('get_item');
    yield* S.say('FoundHiddenCoinsText');
  };
  // slot machines: facing left/right at a machine (AbleToPlaySlotsCheck)
  (function () {
    const m = G.MAPDATA.maps.GameCorner; if (!m) return;
    m.hidden.forEach((h, idx) => {
      if (h.fn !== 'StartSlotMachine') return;
      gcHidden[h.x + ',' + h.y] = function* () {
        if (h.arg === 'SLOTS_OUTOFORDER') { yield* S.say('GameCornerOutOfOrderText'); return; }
        if (h.arg === 'SLOTS_OUTTOLUNCH') { yield* S.say('GameCornerOutToLunchText'); return; }
        if (h.arg === 'SLOTS_SOMEONESKEYS') { yield* S.say('GameCornerSomeonesKeysText'); return; }
        if (!facing('left') && !facing('right')) return;
        yield* G.slotMachine({ lucky: G.state.luckySlot === idx + 1 });
      };
    });
  })();
  function* coinsFromNpc(flag, intro, recv, full, after, n, fullAt) {
    if (S.flag(flag)) { yield* S.say(after); return; }
    yield* S.say(intro);
    if (!G.bag.has('COIN_CASE')) { yield* S.say('GameCornerOopsForgotCoinCaseText'); return; }
    if ((G.state.coins || 0) >= fullAt) { yield* S.say(full); return; }
    addCoins(n); S.set(flag);
    G.sfx && G.sfx('get_item');
    yield* S.say(recv);
  }
  def('GameCorner', {
    enter() {
      // GameCornerSelectLuckySlotMachine
      let r = rnd(256); if (r < 7) r = 8;
      G.state.luckySlot = r >> 3;
      // the hideout stairs stay hidden behind a wall until the poster switch is found
      if (!S.flag('EVENT_FOUND_ROCKET_HIDEOUT')) S.setCell(17, 4, 'wall', false);
      return null;
    },
    hidden: gcHidden,
    sign: {
      TEXT_GAMECORNER_POSTER: function* () {
        yield* S.say('GameCornerPosterSwitchBehindPosterText');
        G.sfx && G.sfx('door');
        S.set('EVENT_FOUND_ROCKET_HIDEOUT');
        restoreCell(17, 4);
      },
    },
    talk: {
      GAMECORNER_CLERK1: function* () {
        const box = infoBox(() => [moneyStr(), coinStr()]);
        try {
          if (!(yield* S.ask('GameCornerClerk1DoYouNeedSomeGameCoinsText'))) { yield* S.say('GameCornerClerk1PleaseComePlaySometimeText'); return; }
          if (!G.bag.has('COIN_CASE')) { yield* S.say('GameCornerClerk1DontHaveCoinCaseText'); return; }
          if ((G.state.coins || 0) >= 9990) { yield* S.say('GameCornerClerk1CoinCaseIsFullText'); return; }
          if (G.state.money < 1000) { yield* S.say('GameCornerClerk1CantAffordTheCoinsText'); return; }
          G.state.money -= 1000; addCoins(50);
          G.sfx && G.sfx('buy');
          yield* S.say('GameCornerClerk1ThanksHereAre50CoinsText');
        } finally { G.engine.pop(box); }
      },
      GAMECORNER_FISHING_GURU: function* () { yield* coinsFromNpc('EVENT_GOT_10_COINS', 'GameCornerFishingGuruWantToPlayText', 'GameCornerFishingGuruReceived10CoinsText', 'GameCornerFishingGuruDontNeedMyCoinsText', 'GameCornerFishingGuruWinsComeAndGoText', 10, 9990); },
      GAMECORNER_CLERK2: function* () { yield* coinsFromNpc('EVENT_GOT_20_COINS_2', 'GameCornerClerk2WantSomeCoinsText', 'GameCornerClerk2Received20CoinsText', 'GameCornerClerk2YouHaveLotsOfCoinsText', 'GameCornerClerk2INeedMoreCoinsText', 20, 9990); },
      GAMECORNER_GENTLEMAN: function* () { yield* coinsFromNpc('EVENT_GOT_20_COINS', 'GameCornerGentlemanThrowingMeOffText', 'GameCornerGentlemanReceived20CoinsText', 'GameCornerGentlemanYouGotYourOwnCoinsText', 'GameCornerGentlemanCloselyWatchTheReelsText', 20, 9990); },
      GAMECORNER_GYM_GUIDE: flagTalk('EVENT_BEAT_ERIKA', 'GameCornerGymGuideChampInMakingText', 'GameCornerGymGuideTheyOfferRarePokemonText'),
      GAMECORNER_ROCKET: function* (a) {
        yield* S.say('GameCornerRocketImGuardingThisPosterText');
        const r = yield* S.battle('ROCKET', 7, { winText: T('GameCornerRocketBattleEndText') });
        if (r !== 'win') return;
        yield* S.say('GameCornerRocketAfterBattleText');
        const p = S.player();
        yield* S.move(a, (p.y === 6 || p.x === 8) ? 'RRRRR' : 'DRRURRRR');
        S.hide('GAMECORNER_ROCKET');
      },
    },
  });

  // ---------------- slot machine minigame (engine/slots/slot_machine.asm) ----------------
  const SYM = { SEVEN: 0, BAR: 1, CHERRY: 2, FISH: 3, BIRD: 4, MOUSE: 5 };
  const SYM_NAME = ['7', 'BAR', 'CHERRY', 'FISH', 'BIRD', 'MOUSE'];
  const SYM_PAY = [300, 100, 8, 15, 15, 15];
  const WHEELS = [
    'SEVEN MOUSE FISH BAR CHERRY SEVEN FISH BIRD BAR CHERRY SEVEN MOUSE BIRD BAR CHERRY SEVEN MOUSE FISH',
    'SEVEN FISH CHERRY BIRD MOUSE BAR CHERRY FISH BIRD CHERRY BAR FISH BIRD CHERRY MOUSE SEVEN FISH CHERRY',
    'SEVEN BIRD FISH CHERRY MOUSE BIRD FISH CHERRY MOUSE BIRD FISH CHERRY MOUSE BIRD BAR SEVEN BIRD FISH',
  ].map(w => w.split(' ').map(n => SYM[n]));
  const F_WIN = 1, F_WIN7 = 2;
  // reel symbol art, drawn once into 28x24 surfaces
  function symbolSprites() {
    if (symbolSprites.c) return symbolSprites.c;
    const { Surface, hex } = G.gfx, P = G.PAL;
    const mk = fn => { const s = new Surface(28, 24); fn(s); return s; };
    const out = (s, col) => { // 1px outline around drawn pixels
      const d = s.data.slice();
      for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
        if (d[y * s.w + x]) continue;
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const X = x + dx, Y = y + dy; return X >= 0 && Y >= 0 && X < s.w && Y < s.h && d[Y * s.w + X] && d[Y * s.w + X] !== col; })) s.pset(x, y, col);
      }
    };
    const red = hex('#e03030'), red2 = hex('#a01818'), blk = hex('#202028'), yel = hex('#f8d030'), grn = hex('#38a048');
    symbolSprites.c = [
      mk(s => { s.rect(6, 3, 16, 4, red); s.poly([22, 3, 22, 7, 14, 21, 9, 21], red); s.rect(7, 4, 13, 1, hex('#ff8080')); out(s, P.outline); }),
      mk(s => { s.rect(2, 6, 24, 12, blk); s.rect(3, 7, 22, 1, hex('#606070')); G.font.draw(s, 'BAR', 5, 8, hex('#f8f8f8')); out(s, P.outline); }),
      mk(s => { s.line(9, 12, 14, 3, grn); s.line(19, 13, 14, 3, grn); s.rect(13, 2, 5, 2, grn); s.disc(8, 16, 5, red); s.disc(19, 17, 5, red2); s.disc(7, 14, 1.5, hex('#ffb0b0')); s.disc(18, 15, 1.5, hex('#ffa0a0')); out(s, P.outline); }),
      mk(s => { const o = hex('#f07830'); s.ellipse(12, 12, 9, 7, o); s.poly([20, 12, 27, 5, 27, 19], o); s.poly([8, 5, 14, 1, 16, 6], hex('#f8c040')); s.disc(8, 10, 2.5, hex('#ffffff')); s.pset(8, 10, blk); s.line(4, 14, 7, 15, hex('#ffd0a0')); out(s, P.outline); }),
      mk(s => { const b = hex('#b87840'); s.ellipse(14, 14, 9, 7, b); s.disc(9, 8, 5, b); s.ellipse(15, 16, 5, 3, hex('#f0d8a8')); s.poly([3, 8, 0, 10, 3, 11], yel); s.pset(8, 7, blk); s.poly([20, 10, 27, 6, 25, 14], hex('#8a5028')); out(s, P.outline); }),
      mk(s => { s.ellipse(14, 14, 10, 8, yel); s.poly([5, 9, 3, 0, 10, 7], yel); s.poly([23, 9, 25, 0, 18, 7], yel); s.rect(3, 0, 2, 2, blk); s.rect(24, 0, 2, 2, blk); s.pset(10, 12, blk); s.pset(18, 12, blk); s.disc(7, 16, 2, red); s.disc(21, 16, 2, red); s.pset(14, 15, blk); out(s, P.outline); }),
    ];
    return symbolSprites.c;
  }
  class SlotScene {
    constructor() {
      this.opaque = true; this.t = 0; this.done = false;
      this.reels = WHEELS.map(() => ({ pos: rnd(18), spinning: false }));
      this.bet = 0; this.payout = 0; this.flash = 0; this.lamp = 0;
    }
    update() { this.t++; }
    sym(r, row) { const w = WHEELS[r]; return w[(Math.floor(this.reels[r].pos) + row) % 18]; } // row 0 bottom, 1 middle, 2 top
    draw(s) {
      const H = G.gfx.hex, P = G.PAL, sp = symbolSprites();
      // cabinet
      for (let y = 0; y < 180; y++) { const c = y < 128 ? (y % 16 < 8 ? H('#7a1c2c') : H('#6c1826')) : H('#2a2c44'); s.rect(0, y, 320, 1, c); }
      s.rect(60, 4, 200, 122, H('#e8b838')); s.rect(62, 6, 196, 118, H('#c89020')); s.rect(64, 8, 192, 114, H('#3a2a1a'));
      // title lights
      for (let i = 0; i < 14; i++) s.disc(72 + i * 13, 12, 2.5, (i + (this.t >> 3)) % 3 === 0 ? H('#fff4a0') : H('#a07818'));
      G.font.draw(s, 'SLOTS', 160 - G.font.measure('SLOTS') / 2, 19, H('#fff4c8'), H('#6a3a10'));
      const Y0 = 30, mid = Y0 + 38, top = mid - 25, bot = mid + 25;
      // pay lines (behind the reel windows, visible in the gaps) for the current bet
      const L = (x0, y0, x1, y1, on) => { s.line(x0, y0, x1, y1, on ? H('#f84848') : H('#5a3a2a')); if (on) s.line(x0, y0 + 1, x1, y1 + 1, H('#a02020')); };
      L(84, mid, 236, mid, this.bet >= 1);
      L(84, top, 236, top, this.bet >= 2); L(84, bot, 236, bot, this.bet >= 2);
      L(84, bot + 10, 236, top - 10, this.bet >= 3); L(84, top - 10, 236, bot + 10, this.bet >= 3);
      // reels
      for (let r = 0; r < 3; r++) {
        const x0 = 94 + r * 46, y0 = Y0, reel = this.reels[r], frac = reel.pos - Math.floor(reel.pos);
        s.rect(x0 - 2, y0 - 2, 40, 80, P.outline);
        s.rect(x0, y0, 36, 76, H('#fbf8ee'));
        for (let row = 0; row <= 3; row++) {
          // row 0 bottom .. 2 top; row 3 scrolls in from above while spinning
          const ty = y0 + 2 + (2 - row) * 25 + Math.round(frac * 25);
          const img = sp[WHEELS[r][(Math.floor(reel.pos) + row) % 18]];
          for (let yy = 0; yy < 24; yy++) {
            const Y = ty + yy; if (Y < y0 || Y >= y0 + 76) continue;
            for (let xx = 0; xx < 28; xx++) { const c = img.data[yy * 28 + xx]; if (c) s.pset(x0 + 4 + xx, Y, c); }
          }
        }
        // glass shading
        for (let y = y0; y < y0 + 76; y++) { const k = Math.abs(y - (y0 + 38)) / 38; if (k > 0.6) s.rectBlend(x0, y, 36, 1, H('#7a6a50'), (k - 0.6) * 0.8); }
      }
      // bet lamps at the left end of each pay line (1 = middle, 2 = top/bottom, 3 = diagonals)
      const lamp = (x, y, r, on, n) => { s.disc(x, y, r + 1, P.outline); s.disc(x, y, r, on ? H('#ff5050') : H('#5a2020')); if (n) G.font.drawSmall(s, n, x - 1, y - 3, H('#ffffff')); };
      lamp(74, mid, 4, this.bet >= 1, '1'); lamp(74, top, 4, this.bet >= 2, '2'); lamp(74, bot, 4, this.bet >= 2, '2');
      lamp(84, top - 10, 2, this.bet >= 3); lamp(84, bot + 10, 2, this.bet >= 3);
      // credit / payout readouts
      const box = (x, label, v) => { s.rect(x, 110, 64, 13, P.outline); s.rect(x + 1, 111, 62, 11, H('#101810')); G.font.drawSmall(s, label, x + 3, 114, H('#80d080')); const t = String(v).padStart(4, '0'); G.font.draw(s, t, x + 61 - G.font.measure(t), 111, H('#a0ff90')); };
      box(66, 'CR', G.state.coins || 0); box(190, 'PAY', this.payout);
      if (this.flash > 0 && (this.flash >> 2) % 2) s.rectBlend(64, 8, 192, 112, H('#ffffff'), 0.35);
      if (this.flash > 0) this.flash--;
    }
  }
  function lineSyms(sc, rows) { return [sc.sym(0, rows[0]), sc.sym(1, rows[1]), sc.sym(2, rows[2])]; }
  const LINES = { mid: [1, 1, 1], top: [2, 2, 2], bot: [0, 0, 0], d1: [0, 1, 2], d2: [2, 1, 0] };
  function findMatch(sc) {
    const order = sc.bet === 3 ? ['d1', 'd2', 'top', 'bot', 'mid'] : sc.bet === 2 ? ['top', 'bot', 'mid'] : ['mid'];
    for (const k of order) { const [a, b, c] = lineSyms(sc, LINES[k]); if (a === b && b === c) return a; }
    return -1;
  }
  function wheel12Match(sc) { // SlotMachine_FindWheel1Wheel2Matches
    const a = r => sc.sym(0, r), b = r => sc.sym(1, r);
    for (const [x, y] of [[0, 0], [0, 1], [1, 1], [2, 1], [2, 2]]) if (a(x) === b(y)) return a(x);
    return -1;
  }
  function* spinReels(sc, st) {
    const I = G.input;
    for (const r of sc.reels) { r.spinning = true; r.stop = false; r.slip = 4; }
    const speed = 0.2;
    let frames = 0, stopping = 0;
    while (sc.reels.some(r => r.spinning)) {
      frames++;
      if (frames > 40 && I.pressed.a && stopping < 3) { sc.reels[stopping].stop = true; stopping++; G.sfx && G.sfx('select'); }
      for (let i = 0; i < 3; i++) {
        const r = sc.reels[i]; if (!r.spinning) continue;
        const before = Math.floor(r.pos);
        r.pos = (r.pos + speed) % 18;
        const centred = Math.floor(r.pos) !== before || r.pos < speed;
        if (!r.stop || !centred) continue;
        r.pos = Math.floor(r.pos);
        let keepGoing = false;
        if (i === 0 && r.slip > 0) keepGoing = (st.flags & F_WIN7) ? true : sc.sym(0, 1) === SYM.CHERRY;
        if (i === 1 && r.slip > 0) { const m = wheel12Match(sc); keepGoing = (st.flags & F_WIN7) ? !(m === SYM.SEVEN || m === SYM.BAR) : m < 0; }
        if (keepGoing) { r.slip--; continue; }
        r.spinning = false; G.sfx && G.sfx('bump');
      }
      yield;
    }
  }
  function setSlotFlags(st) { // SlotMachine_SetFlags
    if (st.flags & F_WIN7) return;
    if (st.counter > 0) { st.flags |= F_WIN; return; }
    const b = rnd(256);
    if (b === 0) { st.counter = 60; return; }
    if (st.chance < b) { st.flags |= F_WIN7; return; }
    if (210 < b) { st.flags |= F_WIN; return; }
    st.flags = 0;
  }
  function* rollWheel3(sc) { const r = sc.reels[2]; for (let i = 0; i < 5; i++) { r.pos = (r.pos + 0.2) % 18; yield; } r.pos = Math.round(r.pos) % 18; }
  function* checkMatches(sc, st) { // SlotMachine_CheckForMatches
    for (let guard = 0; guard < 300; guard++) {
      const m = findMatch(sc);
      const allowed = st.flags & (F_WIN | F_WIN7);
      if (m < 0) {
        if (!allowed || --st.reroll <= 0) return -1;
        yield* rollWheel3(sc); continue;
      }
      if (!allowed) { yield* rollWheel3(sc); continue; }
      if (!(st.flags & F_WIN7) && (m === SYM.SEVEN || m === SYM.BAR)) { yield* rollWheel3(sc); continue; }
      return m;
    }
    return -1;
  }
  G.slotMachine = function* (opt) {
    opt = opt || {};
    if (!G.bag.has('COIN_CASE')) { yield* S.say('GameCornerCoinCaseText'); return; }
    if (!(G.state.coins > 0)) { yield* S.say('GameCornerNoCoinsText'); return; }
    if (!(yield* S.ask('PlaySlotMachineText'))) return;
    const sc = new SlotScene();
    const st = { flags: 0, counter: 0, reroll: 256, chance: opt.lucky ? 250 : 253 };
    G.engine.push(sc);
    try {
      for (;;) {
        sc.payout = 0; sc.bet = 0;
        let bet;
        for (;;) {
          const r = yield* chooseWith('BetHowManySlotMachineText', ['×3', '×2', '×1'], { x: 250, y: 60, w: 64 });
          if (r < 0) return;
          bet = 3 - r;
          if ((G.state.coins || 0) < bet) { yield* S.say('NotEnoughCoinsSlotMachineText'); continue; }
          break;
        }
        addCoins(-bet); sc.bet = bet;
        setSlotFlags(st);
        st.reroll = 256;
        G.sfx && G.sfx('select');
        const go = new G.ui.StaticBox(G.TEXT.StartSlotMachineText || 'Start!');
        G.engine.push(go);
        try { yield* spinReels(sc, st); } finally { G.engine.pop(go); }
        const m = yield* checkMatches(sc, st);
        if (m < 0) yield* S.say('NotThisTimeText');
        else {
          const pay = SYM_PAY[m];
          if (pay === 300) {
            yield* S.say('YeahText');
            if (rnd(256) >= 0x80) st.flags = 0;
            st.counter = 0;
          } else if (pay === 100) st.flags = 0;
          else if (st.counter > 0) st.counter--;
          sc.flash = pay >= 100 ? 64 : 24;
          G.sfx && G.sfx(pay >= 100 ? 'get_key' : 'get_item');
          sc.payout = pay;
          G.textVars.wStringBuffer = String(pay);
          yield* S.say(SYM_NAME[m] + ' ' + T('LinedUpText'));
          while (sc.payout > 0) { const k = Math.min(sc.payout, pay > 50 ? 3 : 1); sc.payout -= k; addCoins(k); if (sc.t % 2 === 0) G.sfx && G.sfx('blip'); yield; }
        }
        if (!(G.state.coins > 0)) { yield* S.say('OutOfCoinsSlotMachineText'); yield* S.wait(60); return; }
        if (!(yield* S.ask('OneMoreGoSlotMachineText'))) return;
      }
    } finally { G.engine.pop(sc); }
  };
  G.SlotScene = SlotScene;

  // ---------------- prize exchange (engine/events/prize_menu.asm, Red prices/levels) ----------------
  const PRIZES = [
    [['ABRA', 180, 9], ['CLEFAIRY', 500, 8], ['NIDORINA', 1200, 17]],
    [['DRATINI', 2800, 18], ['SCYTHER', 5500, 25], ['PORYGON', 9999, 26]],
    [['TM_DRAGON_RAGE', 3300], ['TM_HYPER_BEAM', 5500], ['TM_SUBSTITUTE', 7700]],
  ];
  G.prizeMenu = function* (which) {
    if (!G.bag.has('COIN_CASE')) { yield* S.say('RequireCoinCaseText'); return; }
    yield* S.say('ExchangeCoinsForPrizesText');
    const list = PRIZES[which], isTM = which === 2;
    const nameOf = id => isTM ? G.itemName(id) : G.speciesName(id);
    const box = infoBox(() => [coinStr()]);
    try {
      const r = yield* chooseWith('WhichPrizeText', list.map(([id, c]) => nameOf(id).padEnd(10, ' ') + String(c).padStart(5, ' ')).concat(['NO THANKS']), { x: 6, y: 30, w: 200 });
      if (r < 0 || r === 3) return;
      const [id, cost, lv] = list[r];
      G.textVars.wNameBuffer = nameOf(id);
      if (!(yield* S.ask('SoYouWantPrizeText'))) { yield* S.say('OhFineThenText'); return; }
      if ((G.state.coins || 0) < cost) { yield* S.say('SorryNeedMoreCoinsText'); return; }
      if (isTM) {
        if (!G.bag.add(id, 1)) { yield* S.say('OopsYouDontHaveEnoughRoomText'); return; }
        G.sfx && G.sfx('get_tm');
      } else if (!(yield* S.giftMon(id, lv))) return;
      addCoins(-cost);
    } finally { G.engine.pop(box); }
  };
  def('GameCornerPrizeRoom', {
    sign: {
      TEXT_GAMECORNERPRIZEROOM_PRIZE_VENDOR_1: function* () { yield* G.prizeMenu(0); },
      TEXT_GAMECORNERPRIZEROOM_PRIZE_VENDOR_2: function* () { yield* G.prizeMenu(1); },
      TEXT_GAMECORNERPRIZEROOM_PRIZE_VENDOR_3: function* () { yield* G.prizeMenu(2); },
    },
  });

  // ======================================================================
  //  ROCKET HIDEOUT
  // ======================================================================
  // B1F: the door past the last grunt opens once he is beaten (block $54 at 12,8)
  def('RocketHideoutB1F', {
    enter() {
      if (!S.flag('EVENT_BEAT_ROCKET_HIDEOUT_1_TRAINER_4')) { S.setCell(24, 16, 'card_door', false); S.setCell(25, 16, 'card_door', false); }
      else S.set('EVENT_ENTERED_ROCKET_HIDEOUT');
      return null;
    },
  });
  AFTER_TRAINER.RocketHideoutB1F = function* (a) {
    if (a.obj.id !== 'ROCKETHIDEOUTB1F_ROCKET5') return;
    G.sfx && G.sfx('door');
    restoreCell(24, 16); restoreCell(25, 16);
  };
  // B4F: Giovanni's room is locked until both guards are beaten (block $2d at 12,5)
  function b4fDoorOpen() { return S.flag('EVENT_BEAT_ROCKET_HIDEOUT_4_TRAINER_0') && S.flag('EVENT_BEAT_ROCKET_HIDEOUT_4_TRAINER_1'); }
  AFTER_TRAINER.RocketHideoutB4F = function* (a) {
    if (!/ROCKET[12]$/.test(a.obj.id) || S.flag('EVENT_ROCKET_HIDEOUT_4_DOOR_UNLOCKED') || !b4fDoorOpen()) return;
    S.set('EVENT_ROCKET_HIDEOUT_4_DOOR_UNLOCKED');
    G.sfx && G.sfx('door');
    restoreCell(24, 11); restoreCell(25, 11);
  };
  def('RocketHideoutB4F', {
    enter() {
      if (!S.flag('EVENT_ROCKET_HIDEOUT_4_DOOR_UNLOCKED')) {
        if (b4fDoorOpen()) S.set('EVENT_ROCKET_HIDEOUT_4_DOOR_UNLOCKED');
        else { S.setCell(24, 11, 'card_door', false); S.setCell(25, 11, 'card_door', false); }
      }
      return null;
    },
    talk: {
      ROCKETHIDEOUTB4F_GIOVANNI: function* () {
        if (S.flag('EVENT_BEAT_ROCKET_HIDEOUT_GIOVANNI')) { yield* S.say('RocketHideoutB4FGiovanniHopeWeMeetAgainText'); return; }
        yield* S.say('RocketHideoutB4FGiovanniImpressedYouGotHereText');
        const r = yield* S.battle('GIOVANNI', 1, { winText: T('RocketHideoutB4FGiovanniWhatCannotBeText') });
        if (r !== 'win') return;
        S.set('EVENT_BEAT_ROCKET_HIDEOUT_GIOVANNI');
        yield* S.say('RocketHideoutB4FGiovanniHopeWeMeetAgainText');
        yield* G.fadeOut(12);
        S.hide('ROCKETHIDEOUTB4F_GIOVANNI');
        S.show('ROCKETHIDEOUTB4F_SILPH_SCOPE');
        yield* S.wait(10);
        yield* G.fadeIn(12);
      },
      // the grunt drops the LIFT KEY when talked to after his defeat
      ROCKETHIDEOUTB4F_ROCKET3: function* (a) {
        if (!S.flag(a.obj.th.flag)) { yield* G.trainerBattleFlow(a); return; }
        yield* S.say('RocketHideoutB4FRocket3AfterBattleText');
        if (!S.flag('EVENT_ROCKET_DROPPED_LIFT_KEY')) { S.set('EVENT_ROCKET_DROPPED_LIFT_KEY'); S.show('ROCKETHIDEOUTB4F_LIFT_KEY'); }
      },
    },
  });
  const HIDEOUT_FLOORS = [{ label: 'B1F', map: 'RocketHideoutB1F', warp: 4 }, { label: 'B2F', map: 'RocketHideoutB2F', warp: 4 }, { label: 'B4F', map: 'RocketHideoutB4F', warp: 2 }];
  def('RocketHideoutElevator', {
    sign: {
      TEXT_ROCKETHIDEOUTELEVATOR: elevatorScript('RocketHideoutElevator', HIDEOUT_FLOORS, function* () {
        if (G.bag.has('LIFT_KEY')) return true;
        yield* S.say('RocketHideoutElevatorAppearsToNeedKeyText');
        return false;
      }),
    },
  });

  // ======================================================================
  //  SAFFRON CITY
  // ======================================================================
  def('SaffronGym', {
    talk: {
      SAFFRONGYM_SABRINA: function* () {
        const reward = function* () {
          yield* S.say('SaffronGymSabrinaMarshBadgeInfoText');
          S.set('EVENT_BEAT_SABRINA');
          if (G.bag.add('TM_PSYWAVE', 1)) {
            setBuf(G.itemName('TM_PSYWAVE')); G.sfx && G.sfx('get_tm');
            yield* S.say('SaffronGymSabrinaReceivedTM46Text'); yield* S.say('TM46ExplanationText');
            S.set('EVENT_GOT_TM46');
          } else yield* S.say('SaffronGymSabrinaTM46NoRoomText');
        };
        if (S.flag('EVENT_BEAT_SABRINA')) {
          if (!S.flag('EVENT_GOT_TM46')) { yield* reward(); return; }
          yield* S.say('SaffronGymSabrinaPostBattleAdviceText'); return;
        }
        yield* S.say('SaffronGymSabrinaText');
        const r = yield* S.battle('SABRINA', 1, { winText: T('SaffronGymSabrinaReceivedMarshBadgeText') });
        if (r !== 'win') return;
        yield* S.awardBadge('MARSHBADGE');
        yield* reward();
        for (let i = 0; i <= 6; i++) S.set('EVENT_BEAT_SAFFRON_GYM_TRAINER_' + i);
      },
      SAFFRONGYM_GYM_GUIDE: flagTalk('EVENT_BEAT_SABRINA', 'SaffronGymGuideChampInMakingText', 'SaffronGymGuideBeatSabrinaText'),
    },
  });
  def('SaffronPidgeyHouse', { talk: { SAFFRONPIDGEYHOUSE_PIDGEY: cryTalk('SaffronPidgeyHousePidgeyText', 'PIDGEY') } });
  def('MrPsychicsHouse', {
    talk: {
      MRPSYCHICSHOUSE_MR_PSYCHIC: function* () {
        if (S.flag('EVENT_GOT_TM29')) { yield* S.say('MrPsychicsHouseMrPsychicTM29ExplanationText'); return; }
        yield* S.say('MrPsychicsHouseMrPsychicYouWantedThisText');
        if (yield* giveItem('TM_PSYCHIC_M', 'MrPsychicsHouseMrPsychicReceivedTM29Text', 'MrPsychicsHouseMrPsychicTM29NoRoomText')) S.set('EVENT_GOT_TM29');
      },
    },
  });
  def('CopycatsHouse1F', { talk: { COPYCATSHOUSE1F_CHANSEY: cryTalk('CopycatsHouse1FChanseyText', 'CHANSEY') } });
  def('CopycatsHouse2F', {
    talk: {
      COPYCATSHOUSE2F_COPYCAT: function* () {
        if (S.flag('EVENT_GOT_TM31')) { yield* S.say('CopycatsHouse2FCopycatTM31Explanation2Text'); return; }
        yield* S.say('CopycatsHouse2FCopycatDoYouLikePokemonText');
        if (!G.bag.has('POKE_DOLL')) return;
        yield* S.say('CopycatsHouse2FCopycatTM31PreReceiveText');
        if (!(yield* giveItem('TM_MIMIC', 'CopycatsHouse2FCopycatReceivedTM31Text', 'CopycatsHouse2FCopycatTM31NoRoomText'))) return;
        yield* S.say('CopycatsHouse2FCopycatTM31Explanation1Text');
        G.bag.remove('POKE_DOLL', 1);
        S.set('EVENT_GOT_TM31');
      },
    },
    sign: {
      TEXT_COPYCATSHOUSE2F_PC: function* () { yield* S.say(facing('up') ? 'CopycatsHouse2FPCMySecretsText' : 'CopycatsHouse2FPCCantSeeText'); },
    },
  });

  // Fighting Dojo: beat the Karate Master, then pick HITMONLEE or HITMONCHAN
  function* karateMaster(master) {
    if (S.flag('EVENT_DEFEATED_FIGHTING_DOJO')) { yield* S.say('FightingDojoKarateMasterStayAndTrainWithUsText'); return; }
    if (S.flag('EVENT_BEAT_KARATE_MASTER')) { yield* S.say('FightingDojoKarateMasterIWillGiveYouAPokemonText'); return; }
    yield* S.say('FightingDojoKarateMasterText');
    const r = yield* S.battle('BLACKBELT', 1, { winText: T('FightingDojoKarateMasterDefeatedText') });
    if (r !== 'win') return;
    if (master) S.faceTo(master, S.player());
    S.set('EVENT_BEAT_KARATE_MASTER');
    for (let i = 0; i <= 3; i++) S.set('EVENT_BEAT_FIGHTING_DOJO_TRAINER_' + i);
    yield* S.say('FightingDojoKarateMasterIWillGiveYouAPokemonText');
  }
  function dojoBall(sp, id, ev, label) {
    return function* () {
      if (S.flag('EVENT_GOT_HITMONLEE') || S.flag('EVENT_GOT_HITMONCHAN')) { yield* S.say('FightingDojoBetterNotGetGreedyText'); return; }
      G.dexSeen(sp);
      if (G.dexPage) yield* G.dexPage(sp);
      if (!(yield* S.ask(label))) return;
      if (!(yield* S.giftMon(sp, 30))) return;
      S.hide(id);
      S.set(ev); S.set('EVENT_DEFEATED_FIGHTING_DOJO');
    };
  }
  // would a header trainer engage the player on this step? (CheckFightingMapTrainers runs first in the dojo)
  function trainerSees() {
    const ow = G.ow, p = ow.player;
    for (const a of ow.actors) {
      if (!a.trainer || a.hidden || !a.obj.th || S.flag(a.obj.th.flag)) continue;
      const [dx, dy] = G.DIRS[a.dir];
      for (let k = 1; k <= a.obj.th.range; k++) {
        const tx = a.x + dx * k, ty = a.y + dy * k;
        if (tx === p.x && ty === p.y) return true;
        if (!ow.map.passable(tx, ty) || ow.actorAt(tx, ty, a)) break;
      }
    }
    return false;
  }
  def('FightingDojo', {
    step(x, y) {
      if (x !== 4 || y !== 3 || S.flag('EVENT_DEFEATED_FIGHTING_DOJO') || S.flag('EVENT_BEAT_KARATE_MASTER') || trainerSees()) return null;
      return (function* () {
        const m = S.actor('FIGHTINGDOJO_KARATE_MASTER');
        S.player().dir = 'right'; if (m) m.dir = 'left';
        yield* karateMaster(m);
      })();
    },
    hidden: {
      '3,9': function* () { if (facing('up')) yield* S.say('FightingDojoText'); },
      '6,9': function* () { if (facing('up')) yield* S.say('FightingDojoText'); },
      '4,0': function* () { if (facing('up')) yield* S.say('EnemiesOnEverySideText'); },
      '5,0': function* () { if (facing('up')) yield* S.say('WhatGoesAroundComesAroundText'); },
    },
    talk: {
      FIGHTINGDOJO_KARATE_MASTER: function* (a) { yield* karateMaster(a); },
      FIGHTINGDOJO_HITMONLEE_POKE_BALL: dojoBall('HITMONLEE', 'FIGHTINGDOJO_HITMONLEE_POKE_BALL', 'EVENT_GOT_HITMONLEE', 'FightingDojoHitmonleePokeBallText'),
      FIGHTINGDOJO_HITMONCHAN_POKE_BALL: dojoBall('HITMONCHAN', 'FIGHTINGDOJO_HITMONCHAN_POKE_BALL', 'EVENT_GOT_HITMONCHAN', 'FightingDojoHitmonchanPokeBallText'),
    },
  });

  // ======================================================================
  //  SILPH CO.
  // ======================================================================
  const beatGio = () => S.flag('EVENT_BEAT_SILPH_CO_GIOVANNI');
  const silphTalk = (before, after) => function* () { yield* S.say(beatGio() ? after : before); };
  function silphFloor(n, spec) {
    const map = 'SilphCo' + n + 'F';
    const prev = spec.enter;
    spec.enter = function () { applyCardDoors(map); return prev ? prev() : null; };
    def(map, spec);
  }
  silphFloor(1, {
    enter() {
      if (beatGio() && !S.flag('EVENT_SILPH_CO_RECEPTIONIST_AT_DESK')) { S.set('EVENT_SILPH_CO_RECEPTIONIST_AT_DESK'); S.show('SILPHCO1F_LINK_RECEPTIONIST'); }
      return null;
    },
  });
  silphFloor(2, {
    talk: {
      SILPHCO2F_SILPH_WORKER_F: function* () {
        if (S.flag('EVENT_GOT_TM36')) { yield* S.say('SilphCo2FSilphWorkerFTM36ExplanationText'); return; }
        yield* S.say('SilphCo2FSilphWorkerFPleaseTakeThisText');
        if (yield* giveItem('TM_SELFDESTRUCT', 'SilphCo2FSilphWorkerFReceivedTM36Text', 'SilphCo2FSilphWorkerFTM36NoRoomText')) S.set('EVENT_GOT_TM36');
      },
    },
  });
  silphFloor(3, { talk: { SILPHCO3F_SILPH_WORKER_M: silphTalk('SilphCo3FSilphWorkerMWhatShouldIDoText', 'SilphCo3FSilphWorkerMYouSavedUsText') } });
  silphFloor(4, { talk: { SILPHCO4F_SILPH_WORKER_M: silphTalk('SilphCo4FSilphWorkerMImHidingText', 'SilphCo4FSilphWorkerMTeamRocketIsGoneText') } });
  silphFloor(5, { talk: { SILPHCO5F_SILPH_WORKER_M: silphTalk('SilphCo5FSilphWorkerMThatsYouRightText', 'SilphCo5FSilphWorkerMYoureOurHeroText') } });
  silphFloor(6, {
    talk: {
      SILPHCO6F_SILPH_WORKER_M1: silphTalk('SilphCo6FSilphWorkerM1TookOverTheBuildingText', 'SilphCo6FSilphWorkerM1BackToWorkText'),
      SILPHCO6F_SILPH_WORKER_M2: silphTalk('SilphCo6FSilphWorkerMHelpMePleaseText', 'SilphCo6FSilphWorkerMWeGotEngagedText'),
      SILPHCO6F_SILPH_WORKER_F1: silphTalk('SilphCo6FSilphWorkerF1SuchACowardText', 'SilphCo6FSilphWorkerF1HaveToMarryHimText'),
      SILPHCO6F_SILPH_WORKER_F2: silphTalk('SilphCo6FSilphWorkerF2TeamRocketConquerWorldText', 'SilphCo6FSilphWorkerF2TeamRocketRanText'),
      SILPHCO6F_SILPH_WORKER_M3: silphTalk('SilphCo6FSilphWorkerM3TargetedSilphText', 'SilphCo6FSilphWorkerM3WorkForSilphText'),
    },
  });
  // 7F: LAPRAS gift and the rival ambush next to the 11F teleporter
  function* silph7Rival(lower) {
    const p = S.player(), rival = S.actor('SILPHCO7F_RIVAL');
    S.music('rival');
    p.dir = 'down';
    yield* S.say('SilphCo7FRivalText');
    yield* S.move(rival, lower ? 'UUU' : 'UUUU');
    yield* S.say('SilphCo7FRivalWaitedHereText');
    const r = yield* S.battle('RIVAL2', G.rivalParty(7), { winText: T('SilphCo7FRivalDefeatedText'), loseText: T('SilphCo7FRivalVictoryText') });
    if (r !== 'win') return;
    S.set('EVENT_BEAT_SILPH_CO_RIVAL');
    p.dir = 'down'; rival.dir = 'up';
    yield* S.say('SilphCo7FRivalGoodLuckToYouText');
    S.music('rival');
    yield* S.move(rival, lower ? 'LUURRRD' : 'RR');
    S.hide('SILPHCO7F_RIVAL');
    S.music(G.mapMusic(G.ow.map));
  }
  silphFloor(7, {
    step(x, y) {
      if (S.flag('EVENT_BEAT_SILPH_CO_RIVAL') || x !== 3 || (y !== 2 && y !== 3)) return null;
      return silph7Rival(y === 3);
    },
    talk: {
      SILPHCO7F_SILPH_WORKER_M1: function* () {
        if (!S.flag('EVENT_GOT_LAPRAS')) {
          yield* S.say('SilphCo7FSilphWorkerM1HaveThisPokemonText');
          if (!(yield* S.giftMon('LAPRAS', 15))) return;
          yield* S.say('SilphCo7FSilphWorkerM1LaprasDescriptionText');
          S.set('EVENT_GOT_LAPRAS');
          return;
        }
        yield* S.say(beatGio() ? 'SilphCo7FSilphWorkerM1SavedText' : 'SilphCo7FSilphWorkerM1IsOurPresidentOkText');
      },
      SILPHCO7F_SILPH_WORKER_M2: silphTalk('SilphCo7FSilphWorkerM2AfterTheMasterBallText', 'SilphCo7FSilphWorkerM2CancelledMasterBallText'),
      SILPHCO7F_SILPH_WORKER_M3: silphTalk('SilphCo7FSilphWorkerM3ItWouldBeBadText', 'SilphCo7FSilphWorkerM3YouChasedOffTeamRocketText'),
      SILPHCO7F_SILPH_WORKER_M4: silphTalk('SilphCo7FSilphWorkerM4ItsReallyDangerousHereText', 'SilphCo7FSilphWorkerM4SafeAtLastText'),
      SILPHCO7F_RIVAL: function* () { yield* S.say('SilphCo7FRivalText'); },
    },
  });
  silphFloor(8, { talk: { SILPHCO8F_SILPH_WORKER_M: silphTalk('SilphCo8FSilphWorkerMSilphIsFinishedText', 'SilphCo8FSilphWorkerMThanksForSavingUsText') } });
  silphFloor(9, {
    talk: {
      SILPHCO9F_NURSE: function* () {
        if (beatGio()) { yield* S.say('SilphCo9FNurseThankYouText'); return; }
        yield* S.say('SilphCo9FNurseYouLookTiredText');
        for (const m of G.state.party) m.healFull();
        G.sfx && G.sfx('heal');
        yield* G.fadeOut(8, G.PAL.white); yield* S.wait(6); yield* G.fadeIn(8);
        yield* S.say('SilphCo9FNurseDontGiveUpText');
      },
    },
  });
  silphFloor(10, { talk: { SILPHCO10F_SILPH_WORKER_F: silphTalk('SilphCo10FSilphWorkerFImScaredText', 'SilphCo10FSilphWorkerFQuietAboutMyCryingText') } });
  // 11F: Giovanni, then the president's MASTER BALL
  const ROCKETS_LEAVE = {
    hide: [['SaffronCity', ['ROCKET1', 'ROCKET2', 'ROCKET3', 'ROCKET4', 'ROCKET5', 'ROCKET6', 'ROCKET7', 'ROCKET8', 'ROCKET9']],
      ['SilphCo2F', ['SCIENTIST1', 'SCIENTIST2', 'ROCKET1', 'ROCKET2']], ['SilphCo3F', ['ROCKET', 'SCIENTIST']],
      ['SilphCo4F', ['ROCKET1', 'SCIENTIST', 'ROCKET2']], ['SilphCo5F', ['ROCKET1', 'SCIENTIST', 'ROCKER', 'ROCKET2']],
      ['SilphCo6F', ['ROCKET1', 'SCIENTIST', 'ROCKET2']], ['SilphCo7F', ['ROCKET1', 'SCIENTIST', 'ROCKET2', 'ROCKET3']],
      ['SilphCo8F', ['ROCKET1', 'SCIENTIST', 'ROCKET2']], ['SilphCo9F', ['ROCKET1', 'SCIENTIST', 'ROCKET2']],
      ['SilphCo10F', ['ROCKET', 'SCIENTIST']], ['SilphCo11F', ['GIOVANNI', 'ROCKET1', 'ROCKET2']]],
    show: [['SaffronCity', ['SCIENTIST', 'SILPH_WORKER_M', 'SILPH_WORKER_F', 'GENTLEMAN', 'PIDGEOT', 'ROCKER']]],
  };
  G.teamRocketLeavesSaffron = function () {
    for (const [map, ids] of ROCKETS_LEAVE.hide) for (const id of ids) S.hide(map.toUpperCase() + '_' + id, map);
    for (const [map, ids] of ROCKETS_LEAVE.show) for (const id of ids) S.show(map.toUpperCase() + '_' + id, map);
  };
  function* silph11Giovanni(upper) {
    const p = S.player(), gio = S.actor('SILPHCO11F_GIOVANNI');
    yield* S.say('SilphCo11FGiovanniText');
    yield* S.move(gio, 'DDD');
    // player at (7,12) stands right of Giovanni, at (6,13) right below him
    if (upper) { p.dir = 'left'; gio.dir = 'right'; } else { p.dir = 'up'; gio.dir = 'down'; }
    yield* S.wait(4);
    const r = yield* S.battle('GIOVANNI', 2, { winText: T('SilphCo11FGiovanniILostAgainText') });
    if (r !== 'win') return;
    yield* S.say('SilphCo11FGiovanniYouRuinedOurPlansText');
    yield* G.fadeOut(16);
    G.teamRocketLeavesSaffron();
    S.set('EVENT_BEAT_SILPH_CO_GIOVANNI');
    yield* S.wait(10);
    yield* G.fadeIn(16);
  }
  silphFloor(11, {
    step(x, y) {
      if (beatGio()) return null;
      if (x === 6 && y === 13) return silph11Giovanni(false);
      if (x === 7 && y === 12) return silph11Giovanni(true);
      return null;
    },
    talk: {
      SILPHCO11F_SILPH_PRESIDENT: function* () {
        if (S.flag('EVENT_GOT_MASTER_BALL')) { yield* S.say('SilphCo11FSilphPresidentMasterBallDescriptionText'); return; }
        yield* S.say('SilphCo11FSilphPresidentText');
        if (yield* giveItem('MASTER_BALL', 'SilphCo11FSilphPresidentReceivedMasterBallText', 'SilphCo11FSilphPresidentNoRoomText')) S.set('EVENT_GOT_MASTER_BALL');
      },
      SILPHCO11F_GIOVANNI: function* () { yield* S.say('SilphCo11FGiovanniText'); },
    },
  });
  const SILPH_FLOORS = [];
  for (let n = 1; n <= 11; n++) SILPH_FLOORS.push({ label: n + 'F', map: 'SilphCo' + n + 'F', warp: n === 1 ? 3 : n === 11 ? 1 : 2 });
  def('SilphCoElevator', { sign: { TEXT_SILPHCOELEVATOR_ELEVATOR: elevatorScript('SilphCoElevator', SILPH_FLOORS) } });

  // ======================================================================
  //  ROUTES 16-18: Cycling Road gates and the FLY house
  // ======================================================================
  function bikeGate(map, guardId, rows, waitLabel, noBikeLabel, bikeLabel) {
    def(map, {
      enter() { G.state.alwaysOnBike = false; return null; },
      step(x, y) {
        if (G.bag.has('BICYCLE') || x !== 4 || !rows.includes(y)) return null;
        return (function* () {
          yield* S.say(waitLabel);
          const ups = y - rows[0];
          if (ups > 0) yield* S.movePlayer('U'.repeat(ups));
          S.player().dir = 'up';
          yield* S.say(noBikeLabel);
          yield* S.movePlayer('R');
        })();
      },
      talk: { [guardId]: function* () { yield* S.say(G.bag.has('BICYCLE') ? bikeLabel : noBikeLabel); } },
    });
  }
  bikeGate('Route16Gate1F', 'ROUTE16GATE1F_GUARD', [7, 8, 9, 10], 'Route16Gate1FGuardWaitUpText', 'Route16Gate1FGuardNoPedestriansAllowedText', 'Route16Gate1FGuardCyclingRoadExplanationText');
  bikeGate('Route18Gate1F', 'ROUTE18GATE1F_GUARD', [3, 4, 5, 6], 'Route18Gate1FGuardExcuseMeText', 'Route18Gate1FGuardYouNeedABicycleText', 'Route18Gate1FGuardCyclingRoadUphillText');
  const binoculars = label => function* () { if (facing('up')) yield* S.say(label); };
  def('Route16Gate2F', {
    sign: { TEXT_ROUTE16GATE2F_LEFT_BINOCULARS: binoculars('Route16Gate2FLeftBinocularsText'), TEXT_ROUTE16GATE2F_RIGHT_BINOCULARS: binoculars('Route16Gate2FRightBinocularsText') },
  });
  def('Route18Gate2F', {
    sign: { TEXT_ROUTE18GATE2F_LEFT_BINOCULARS: binoculars('Route18Gate2FLeftBinocularsText'), TEXT_ROUTE18GATE2F_RIGHT_BINOCULARS: binoculars('Route18Gate2FRightBinocularsText') },
    talk: {
      ROUTE18GATE2F_YOUNGSTER: function* () {
        yield* S.inGameTrade(5, { ask: 'WannaTrade1Text', no: 'NoTrade1Text', wrong: 'WrongMon1Text', done: 'Thanks1Text', after: 'AfterTrade1Text' });
      },
    },
  });
  def('Route16FlyHouse', {
    talk: {
      ROUTE16FLYHOUSE_BRUNETTE_GIRL: function* () {
        if (S.flag('EVENT_GOT_HM02')) { yield* S.say('Route16FlyHouseBrunetteGirlHM02ExplanationText'); return; }
        yield* S.say('Route16FlyHouseBrunetteGirlText');
        if (!(yield* giveItem('HM_FLY', 'Route16FlyHouseBrunetteGirlReceivedHM02Text', 'Route16FlyHouseBrunetteGirlHM02NoRoomText'))) return;
        S.set('EVENT_GOT_HM02');
        yield* S.say('Route16FlyHouseBrunetteGirlHM02ExplanationText');
      },
      ROUTE16FLYHOUSE_FEAROW: cryTalk('Route16FlyHouseFearowText', 'FEAROW'),
    },
  });
})(window.G);
