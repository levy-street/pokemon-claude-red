// Encounters, trainer battles, transitions, evolution and other battle-adjacent flows.
(function (G) {
  'use strict';
  const { hex, mix, bayer } = G.gfx;
  const P = G.PAL;
  const rnd = n => Math.floor(Math.random() * n);

  G.fmt = function (s) {
    if (!G.state) return s;
    return String(s).replace(/\{PLAYER\}/g, G.state.name).replace(/\{RIVAL\}/g, G.state.rival).replace(/\{PROMPT\}/g, '')
      .replace(/\{(\w+)\}/g, (m, k) => (G.textVars && G.textVars[k] !== undefined) ? G.textVars[k] : m)
      .replace(/ +\f/g, '\f').replace(/\f +/g, '\f').replace(/ +([!?,]|\.(?!\.))/g, '$1').replace(/ {2,}/g, ' ');
  };
  G.textVars = {};
  G.dexSeen = sp => { if (G.state) G.state.dex.seen[sp] = true; };
  G.dexCaught = sp => { if (G.state) { G.state.dex.seen[sp] = true; G.state.dex.caught[sp] = true; } };

  // ---------------- naming ----------------
  G.nameEntry = function* (prompt, def, max) { return G.namingScreen ? (yield* G.namingScreen(prompt, def, max || 10)) : def; };

  G.receiveMon = function* (m, ui) {
    const say = t => ui && ui.msg ? ui.msg(t) : G.say(t);
    const q = 'Do you want to give a nickname to ' + m.sp.name + '?';
    let nick = false;
    if (ui && ui.askYesNo) nick = yield* ui.askYesNo(q); else nick = yield* G.ask(q);
    if (nick) { const n = yield* G.nameEntry(m.sp.name + "'s nickname?", m.sp.name, 10); if (n && n !== m.sp.name) m.nick = n; }
    if (G.state.party.length < 6) { G.state.party.push(m); return 'party'; }
    const box = G.currentBox();
    if (box.length >= 20) { yield* say('The POKéMON BOX is full! It can\'t accept any more POKéMON!'); return 'full'; }
    box.push(m);
    yield* say(m.name + ' was transferred to ' + (G.flag('EVENT_MET_BILL') ? "BILL's PC" : "someone's PC") + '!');
    return 'box';
  };

  // ---------------- move learning ----------------
  G.learnMoveFlow = function* (m, mv, ui) {
    const say = t => ui && ui.msg ? ui.msg(t) : G.say(t);
    const ask = q => ui && ui.askYesNo ? ui.askYesNo(q) : G.ask(q);
    if (m.moves.find(x => x.id === mv)) return false;
    const mn = G.moveName(mv);
    if (m.moves.length < 4) { m.addMove(mv); G.sfx && G.sfx('learn'); yield* say(m.name + ' learned ' + mn + '!'); return true; }
    for (;;) {
      yield* say(m.name + ' is trying to learn ' + mn + '!\fBut, ' + m.name + " can't learn more than 4 moves!");
      if (yield* ask('Delete an older move to make room for ' + mn + '?')) {
        yield* say('Which move should be forgotten?');
        const r = yield* G.choose(m.moves.map(x => G.moveName(x.id)), { x: 180, y: 40 });
        if (r >= 0) {
          const hm = G.DATA.hmMoves.includes(m.moves[r].id);
          if (hm) { yield* say('HM techniques can\'t be deleted!'); continue; }
          const old = G.moveName(m.moves[r].id);
          m.replaceMove(r, mv);
          yield* say('1, 2 and... Poof!\f' + m.name + ' forgot ' + old + '!\fAnd...');
          G.sfx && G.sfx('learn');
          yield* say(m.name + ' learned ' + mn + '!');
          return true;
        }
      }
      if (yield* ask('Abandon learning ' + mn + '?')) { yield* say(m.name + ' did not learn ' + mn + '!'); return false; }
    }
  };

  // ---------------- evolution ----------------
  class EvoScene {
    constructor(m, to) { this.m = m; this.from = m.species; this.to = to; this.opaque = true; this.t = 0; this.show = 'from'; this.sil = 0; this.box = null; this.parts = []; this.flash = 0; }
    update() { this.t++; }
    draw(s) {
      for (let y = 0; y < 180; y++) for (let x = 0; x < 320; x++) {
        const r = Math.hypot(x - 160, y - 70);
        const k = Math.floor(r / 10 - this.t / 6) % 2;
        s.data[y * 320 + x] = k ? hex('#283060') : hex('#1c2248');
      }
      const spr = G.pokeSprite(this.show === 'from' ? this.from : this.to, 'front');
      const o = this.sil > 0 ? { sil: mix(P.white, hex('#c8e0ff'), 0.2) } : {};
      s.blit(spr, 128, 30, o);
      for (const p of this.parts) { p.x += p.vx; p.y += p.vy; p.life--; if (p.life > 0) s.pset(p.x, p.y, p.c); }
      this.parts = this.parts.filter(p => p.life > 0);
      if (this.flash > 0) { const d = s.data; for (let i = 0; i < d.length; i++) d[i] = mix(d[i], P.white, this.flash); this.flash -= 0.04; }
      G.ui.frame(s, 6, 128, 308, 48);
      if (this.box) { const lines = G.font.wrap(this.box, 284); lines.slice(0, 2).forEach((l, i) => G.ui.text(s, l, 18, 138 + i * 15)); }
    }
  }
  G.evolve = function* (m, to, noCancel) {
    const sc = new EvoScene(m, to);
    G.engine.push(sc);
    const say = function* (t) { sc.box = G.fmt(t); yield; while (!G.input.pressed.a && !G.input.pressed.b) yield; sc.box = null; };
    G.music && G.music('evolution');
    yield* say('What? ' + m.name + ' is evolving!');
    let cancelled = false;
    sc.sil = 1;
    let period = 50;
    for (let k = 0; k < 22; k++) {
      sc.show = k % 2 ? 'to' : 'from';
      for (let i = 0; i < period; i++) {
        if (!noCancel && G.input.pressed.b) { cancelled = true; break; }
        if (i % 3 === 0) sc.parts.push({ x: 160 + (Math.random() - 0.5) * 120, y: 170, vx: 0, vy: -1 - Math.random() * 2, life: 60, c: hex('#e8f0ff') });
        yield;
      }
      if (cancelled) break;
      period = Math.max(3, Math.floor(period * 0.8));
    }
    if (cancelled) {
      sc.show = 'from'; sc.sil = 0;
      yield* say('Huh? ' + m.name + ' stopped evolving!');
      G.engine.pop(sc); return false;
    }
    sc.show = 'to'; sc.flash = 1; sc.sil = 0;
    for (let i = 0; i < 30; i++) { for (let j = 0; j < 4; j++) { const a = Math.random() * Math.PI * 2; sc.parts.push({ x: 160, y: 62, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, life: 40, c: hex('#fff8c0') }); } yield; }
    G.cry && G.cry(to);
    const oldName = m.name;
    m.evolveTo(to);
    G.dexCaught(to);
    yield* say('Congratulations! Your ' + oldName + ' evolved into ' + G.speciesName(to) + '!');
    for (const mv of m.movesAtLevel(m.level)) yield* G.learnMoveFlow(m, mv, { msg: say, askYesNo: q => G.ask(q) });
    G.engine.pop(sc);
    return true;
  };

  // ---------------- transitions ----------------
  function* transition(kind) {
    const snap = G.gfx.screen.clone();
    let t = 0;
    const overlay = { draw(s) {
      s.data.set(snap.data);
      if (kind === 'wild') {
        if (t < 24) { if (Math.floor(t / 4) % 2 === 0) for (let i = 0; i < s.data.length; i++) s.data[i] = mix(s.data[i], P.white, 0.7); }
        else {
          const k = (t - 24) / 36;
          for (let y = 0; y < 180; y++) for (let x = 0; x < 320; x++) {
            const a = Math.atan2(y - 90, x - 160) / (Math.PI * 2) + 0.5, r = Math.hypot(x - 160, y - 90) / 184;
            if (((a + r * 0.6) % 1) < k * 1.4 || bayer(x >> 2, y >> 2) < k * k) s.data[y * 320 + x] = P.black;
          }
        }
      } else if (kind === 'trainer') {
        const k = Math.max(0, t - 8) / 40;
        for (let y = 0; y < 180; y++) {
          const band = Math.floor(y / 12), dir = band % 2 ? 1 : -1;
          const cover = Math.min(1, k * 1.3 - band * 0.012) * 320;
          for (let x = 0; x < 320; x++) { const xx = dir > 0 ? x : 319 - x; if (xx < cover) s.data[y * 320 + x] = P.black; }
        }
        if (t < 8 && t % 4 < 2) for (let i = 0; i < s.data.length; i++) s.data[i] = mix(s.data[i], P.white, 0.6);
      } else { // boss: a spinning Poké Ball grows from the centre until it fills the screen
        const k = Math.min(1, t / 44), R = 6 + k * k * 200, ang = t * 0.18;
        if (t < 10 && t % 4 < 2) for (let i = 0; i < s.data.length; i++) s.data[i] = mix(s.data[i], P.white, 0.6);
        const ca = Math.cos(ang), sa = Math.sin(ang);
        for (let y = 0; y < 180; y++) for (let x = 0; x < 320; x++) {
          const dx = x - 160, dy = y - 90, d = Math.hypot(dx, dy);
          if (d > R) continue;
          const ry = -dx * sa + dy * ca, rx = dx * ca + dy * sa;
          let c = ry < 0 ? hex('#e03838') : hex('#f4f4f4');
          if (ry < 0 && rx < -R * 0.3 && ry < -R * 0.4) c = hex('#f87070');
          if (Math.abs(ry) < R * 0.08 || d > R * 0.94) c = hex('#1b1a2e');
          const cd = Math.hypot(rx, ry);
          if (cd < R * 0.22) c = cd < R * 0.15 ? hex('#f4f4f4') : hex('#1b1a2e');
          s.data[y * 320 + x] = c;
        }
      }
    } };
    G.engine.push(overlay);
    G.sfx && G.sfx('battle_start');
    const len = kind === 'wild' ? 62 : 52;
    for (t = 0; t < len; t++) yield;
    G.engine.pop(overlay);
  }
  G.battleTransition = transition;

  // ---------------- battle environment ----------------
  G.ELITE_BG = { LoreleisRoom: '#5a90d8', BrunosRoom: '#9a7050', AgathasRoom: '#7a4a9a', LancesRoom: '#b84848', ChampionsRoom: '#c8a040', HallOfFame: '#c8a040' };
  const GYM_BG = { PewterGym: '#a08868', CeruleanGym: '#4a90d8', VermilionGym: '#d8b030', CeladonGym: '#58a058', FuchsiaGym: '#8a58a8', SaffronGym: '#d060a0', CinnabarGym: '#d05030', ViridianGym: '#8a7a50', FightingDojo: '#b87848' };
  G.battleBgFor = function (map, surfing) {
    const n = map.name;
    if (GYM_BG[n]) return 'elite:' + GYM_BG[n];
    if (G.ELITE_BG && G.ELITE_BG[n]) return 'elite:' + G.ELITE_BG[n];
    const ts = map.tsFile;
    if (surfing) return /^Seafoam/.test(n) ? 'cavewater:ice' : ts === 'cavern' ? 'cavewater' : 'water';
    if (/^Seafoam/.test(n)) return 'ice';
    if (/^PowerPlant/.test(n)) return 'power';
    if (/^PokemonMansion/.test(n)) return 'mansion';
    if (ts === 'cavern' || ts === 'underground') return 'cave';
    if (ts === 'forest') return n.startsWith('SafariZone') ? 'grass' : 'forest';
    if (ts === 'cemetery') return 'tower';
    if (ts === 'gym' || ts === 'dojo') return 'gym';
    if (ts === 'overworld') { if (/Route(19|20|21)|Cinnabar/.test(n)) return 'beach'; if (/Route(3|4|22|23)$/.test(n)) return 'mountain'; return 'grass'; }
    if (ts === 'plateau') return 'mountain';
    return 'indoor';
  };

  // ---------------- battles ----------------
  function* runBattle(opts) {
    const ow = G.ow;
    ow.locks++;
    G.music && G.music(opts.music || (opts.type === 'wild' ? 'wild' : 'trainer'));
    yield* transition(opts.transition || (opts.type === 'wild' ? 'wild' : 'trainer'));
    const b = new G.Battle(opts);
    const sc = new G.BattleScene({ bg: opts.bg || G.battleBgFor(ow.map, ow.surfing) });
    G.engine.push(sc);
    for (let i = 0; i < 10; i++) { G.fadeLevel = 1 - i / 10; yield; } G.fadeLevel = 0;
    let result;
    try { result = yield* b.run(sc); }
    catch (e) { console.error(e); result = 'win'; }
    if (G.glitch) G.glitch.afterBattle(b, opts); // the last enemy's stats stay in RAM (src/game/glitches.js)
    // pay day
    if (b.payDay && (result === 'win' || result === 'caught')) { G.state.money += b.payDay; yield* sc.msg(G.state.name + ' picked up $' + b.payDay + '!'); }
    yield* G.fadeOut(12);
    G.engine.pop(sc);
    // reset battle-only state
    for (const m of G.state.party) { if (m.moves) m.moves.forEach(x => { if (x.mimic) delete x.mimic; }); }
    G.music && G.music(G.mapMusic ? G.mapMusic(ow.map) : null);
    yield* G.fadeIn(12);
    // evolutions
    for (const m of G.state.party) {
      if (m.leveledInBattle && m.hp > 0) {
        m.leveledInBattle = false;
        const evo = m.evoByLevel();
        if (evo) { yield* G.fadeOut(8); yield* G.fadeIn(1); yield* G.evolve(m, evo); }
      }
      m.leveledInBattle = false;
    }
    ow.locks--;
    if (result === 'lose') {
      if (opts.noBlackout) return result;
      const foe = opts.enemyParty || [], lead = Math.max(0, ...G.state.party.map(m => m.level)); // analytics: who beat the player, and where
      G.track && G.track('blackout', { at: ow.map.name, foe: opts.trainer ? opts.trainer.cls : foe[0] && foe[0].species, foeLv: Math.max(0, ...foe.map(m => m.level)), my: lead, wild: opts.type === 'wild' });
      yield* blackout();
    }
    return result;
  }
  G.runBattle = runBattle;

  // Red's blackout is an "escape warp": back outside the POKéMON CENTER of the last town healed in
  // (wLastBlackoutMap, Pallet Town before any heal), money halved, party restored.
  function* blackout() {
    yield* G.fadeOut(20);
    G.state.money = Math.floor(G.state.money / 2);
    for (const m of G.state.party) m.healFull();
    const h = G.state.lastHealTown || { map: 'PalletTown', x: 5, y: 6 };
    G.ow.surfing = false; G.ow.biking = false; G.ow.player.setSprite('red');
    G.ow.load(h.map, h.x, h.y, 'down');
    G.ow.snapCamera();
    yield* G.fadeIn(20);
  }
  G.blackout = blackout;

  G.startWildBattle = function* (species, level, opts) {
    const m = new G.Mon(species, level, { ot: 'WILD' });
    return yield* runBattle(Object.assign({ type: 'wild', enemyParty: [m] }, opts || {}));
  };

  const LEADERS = { BROCK: 'BROCK', MISTY: 'MISTY', LT_SURGE: 'LT.SURGE', ERIKA: 'ERIKA', KOGA: 'KOGA', SABRINA: 'SABRINA', BLAINE: 'BLAINE', GIOVANNI: 'GIOVANNI', LORELEI: 'LORELEI', BRUNO: 'BRUNO', AGATHA: 'AGATHA', LANCE: 'LANCE' };
  const LONE_IDX = { BROCK: 1, MISTY: 2, LT_SURGE: 3, ERIKA: 4, KOGA: 5, BLAINE: 7, SABRINA: 6, GIOVANNI: 8 };
  const TRAINER_ITEMS = { MISTY: ['X_DEFEND'], LT_SURGE: ['X_SPEED'], ERIKA: ['SUPER_POTION'], KOGA: ['X_ATTACK'], SABRINA: ['HYPER_POTION'], BLAINE: ['SUPER_POTION'], GIOVANNI: ['GUARD_SPEC'],
    LORELEI: ['SUPER_POTION'], BRUNO: ['X_DEFEND'], AGATHA: ['SUPER_POTION'], LANCE: ['HYPER_POTION'], RIVAL2: ['POTION'], RIVAL3: ['FULL_RESTORE'] };
  G.makeTrainerParty = function (cls, n) {
    const parties = G.DATA.parties[cls] || [];
    const party = (parties[n - 1] || parties[0] || [[5, 'RATTATA']]).map(([lv, sp]) => new G.Mon(sp, lv, { ot: cls, otId: 1, dvs: { atk: 9, def: 8, spd: 8, spc: 8 } })); // Gen 1 trainer DVs
    // special moves
    if (LONE_IDX[cls]) { for (const [idx, mv] of G.DATA.loneMoves) if (idx === LONE_IDX[cls] || (idx === Math.ceil(LONE_IDX[cls] / 2) && false)) {} }
    const lone = { BROCK: 'BIDE', MISTY: 'BUBBLEBEAM', LT_SURGE: 'THUNDERBOLT', ERIKA: 'MEGA_DRAIN', KOGA: 'TOXIC', SABRINA: 'PSYWAVE', BLAINE: 'FIRE_BLAST', GIOVANNI: 'FISSURE' }[cls];
    if (lone) { const m = party[party.length - 1]; if (!m.moves.find(x => x.id === lone)) { if (m.moves.length >= 4) m.replaceMove(3, lone); else m.addMove(lone); } }
    for (const [tc, mv] of G.DATA.teamMoves) if (tc === cls) for (const m of party) { if (!m.moves.find(x => x.id === mv)) { if (m.moves.length >= 4) m.replaceMove(3, mv); else m.addMove(mv); } }
    return party;
  };
  // Red's battle music rules: gym leaders in their gym and LANCE get the leader theme, RIVAL3 the final battle;
  // everyone else (rivals, LORELEI/BRUNO/AGATHA, Giovanni outside the gym) the trainer theme.
  const GYM_LEADERS = { BROCK: 'PewterGym', MISTY: 'CeruleanGym', LT_SURGE: 'VermilionGym', ERIKA: 'CeladonGym', KOGA: 'FuchsiaGym', SABRINA: 'SaffronGym', BLAINE: 'CinnabarGym', GIOVANNI: 'ViridianGym' };
  const isGymLeaderBattle = cls => !!GYM_LEADERS[cls] && G.ow && G.ow.map && G.ow.map.name === GYM_LEADERS[cls];
  G.battleSong = cls => cls === 'RIVAL3' ? 'final_battle' : (cls === 'LANCE' || isGymLeaderBattle(cls)) ? 'gym_leader' : 'trainer';
  G.victorySong = cls => (cls === 'RIVAL3' || isGymLeaderBattle(cls)) ? 'victory_leader' : 'victory';
  G.startTrainerBattle = function* (cls, n, opts) {
    opts = opts || {};
    const tc = G.DATA.trainerClasses[cls] || { name: cls, money: 1000 };
    const isRival = /^RIVAL/.test(cls);
    const displayName = opts.displayName || (isRival ? G.state.rival : LEADERS[cls] || tc.name);
    const party = G.makeTrainerParty(cls, n);
    const boss = !!LEADERS[cls] || isRival || cls === 'GIOVANNI';
    return yield* runBattle(Object.assign({
      type: 'trainer', enemyParty: party, trainer: { cls, n, displayName, money: tc.money, winText: opts.winText, loseText: opts.loseText },
      trainerItems: (TRAINER_ITEMS[cls] || []).slice(), transition: boss ? 'boss' : 'trainer', music: G.battleSong(cls),
    }, opts));
  };

  // ---------------- wild encounters ----------------
  G.encounters = {
    check(map, x, y, surfing) {
      const w = G.DATA.wild[map.d.cnst];
      if (!w) return false;
      const S = G.state;
      if (S.repel > 0) { S.repel--; if (S.repel === 0) { G.spawnScript(G.say('REPEL\'s effect wore off.')); return true; } }
      let table = null;
      const onWater = map.isWater(x, y);
      if (onWater && surfing) table = w.water;
      else if (!onWater) {
        const noGrassTile = !(map.ts.grass >= 0);
        if (noGrassTile || map.isGrass(x, y)) table = w.grass;
      }
      if (!table || !table.rate || !table.mons.length) return false;
      if (G.noEncounters) return false;
      if (rnd(256) >= table.rate) return false;
      let r = rnd(256), slot = 0;
      for (let i = 0; i < G.DATA.slotChances.length; i++) { r -= G.DATA.slotChances[i]; if (r < 0) { slot = i; break; } }
      const [lv, sp] = table.mons[slot];
      if (S.repel > 0) { const lead = S.party.find(m => m.hp > 0); if (lead && lv < lead.level) return false; }
      const safari = /^SafariZone/.test(map.name) && S.safariBalls !== undefined && S.safariSteps !== undefined;
      G.spawnScript(G.startWildBattle(sp, lv, { safari }), 'wild');
      return true;
    },
  };

  // ---------------- trainer interactions ----------------
  G.startTrainerSighted = function* (a, dist) {
    const ow = G.ow, p = ow.player;
    ow.locks++;
    G.music && G.music('encounter_' + (a.obj && a.obj.trainer ? a.obj.trainer.cls : ''));
    a.emote = '!'; a.emoteT = 0;
    G.sfx && G.sfx('exclaim');
    yield* G.engine.wait(40);
    a.emote = null;
    // walk to the player
    for (let i = 0; i < dist; i++) { a.startMove(a.dir, 1); while (a.moving) { a.update(); yield; } }
    if (G.glitch) G.glitch.npcWalked(); // the scripted-NPC-movement bit an escaped trainer script waits on
    p.dir = G.OPP[a.dir];
    ow.locks--;
    yield* G.trainerBattleFlow(a);
  };
  G.trainerTalk = function* (a) {
    const th = a.obj.th;
    if (G.flag(th.flag)) { yield* G.say(G.textFor(th.after)); return; }
    yield* G.trainerBattleFlow(a);
  };
  G.trainerBattleFlow = function* (a) {
    const th = a.obj.th, tr = a.obj.trainer;
    yield* G.say(G.textFor(th.battle));
    const r = yield* G.startTrainerBattle(tr.cls, tr.n, { winText: G.fmt(G.textFor(th.end)) });
    if (r === 'win') { G.setFlag(th.flag); }
    return r;
  };
})(window.G);
