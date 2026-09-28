// Battle engine (Generation I mechanics). Runs as a coroutine and drives a UI object.
(function (G) {
  'use strict';
  const D = () => G.DATA;
  // live link battles (src/game/lounge.js) swap in a seeded generator shared by both games, so the two copies of the
  // battle roll the same numbers and stay in step with only the players' picks sent between them
  let RNG = Math.random;
  const rnd = n => Math.floor(RNG() * n);
  const chance = p => RNG() < p;
  const STAGE = [25, 28, 33, 40, 50, 66, 100, 150, 200, 250, 300, 350, 400];
  const PHYSICAL = new Set(['NORMAL', 'FIGHTING', 'FLYING', 'POISON', 'GROUND', 'ROCK', 'BUG', 'GHOST', 'BIRD']);
  const HIGH_CRIT = new Set(['KARATE_CHOP', 'RAZOR_LEAF', 'CRABHAMMER', 'SLASH']);
  const STAT_NAME = { atk: 'ATTACK', def: 'DEFENSE', spd: 'SPEED', spc: 'SPECIAL', acc: 'accuracy', eva: 'evade' };
  const TYPE_NAME = t => t === 'PSYCHIC_TYPE' ? 'PSYCHIC' : t;

  function newVol() {
    return { st: { atk: 0, def: 0, spd: 0, spc: 0, acc: 0, eva: 0 }, confused: 0, flinch: false, recharge: false, charging: null, invuln: false,
      trapping: null, trapped: 0, thrash: null, bide: null, rage: false, disabled: null, seeded: false, toxic: 0, sub: 0,
      focus: false, mist: false, reflect: false, lightScreen: false, transformed: null, mimic: null, lastMove: null, lastDmg: 0, types: null, moved: false };
  }

  class Battle {
    constructor(o) {
      this.o = o;
      this.wild = o.type === 'wild';
      this.trainer = o.trainer || null;
      this.p = { party: G.state.party, idx: 0, v: newVol(), isPlayer: true };
      this.e = { party: o.enemyParty, idx: 0, v: newVol(), isPlayer: false };
      this.p.foe = this.e; this.e.foe = this.p;
      this.p.idx = Math.max(0, this.p.party.findIndex(m => m.hp > 0));
      this.participants = new Set();
      this.runAttempts = 0; this.payDay = 0; this.result = null; this.turn = 0;
      this.trainerItems = o.trainerItems ? o.trainerItems.slice() : [];
      this.safari = !!o.safari;
      this.safariBait = 0; this.safariRock = 0;
    }
    mon(side) { return side.party[side.idx]; }
    label(side) {
      const m = this.mon(side);
      if (side.isPlayer) return m.name;
      return (this.wild ? 'Wild ' : 'Enemy ') + m.name;
    }
    // effective stat including stage and status penalties
    stat(side, k) {
      const m = this.mon(side), v = side.v;
      let base = v.transformed ? v.transformed[k] : m[k];
      let val = Math.floor(base * STAGE[v.st[k] + 6] / 100);
      if (side.isPlayer && G.state && !this.o.noBadgeBoost) {
        const b = { atk: 'BOULDERBADGE', def: 'THUNDERBADGE', spd: 'SOULBADGE', spc: 'VOLCANOBADGE' }[k];
        if (b && G.state.badges.includes(b)) val = Math.floor(val * 9 / 8);
      }
      if (k === 'spd' && m.status === 'PAR') val = Math.floor(val / 4);
      if (k === 'atk' && m.status === 'BRN') val = Math.floor(val / 2);
      return Math.max(1, val);
    }
    types(side) { return side.v.types || (side.v.transformed ? side.v.transformed.types : this.mon(side).types); }
    moveList(side) { const v = side.v, m = this.mon(side); return v.transformed ? v.transformed.moves : m.moves; }

    // ---------------- main loop ----------------
    *run(ui) {
      const pvp = this.o.pvp;
      if (!pvp) return yield* this.loop(ui);
      const prev = RNG; RNG = pvp.rng;
      try { return yield* this.loop(ui); } finally { RNG = prev; }
    }
    *loop(ui) {
      this.ui = ui;
      yield* ui.intro(this);
      if (!this.wild) this.participants.add(this.mon(this.p));
      this.participants.add(this.mon(this.p));
      for (;;) {
        this.turn++;
        const pAct = yield* this.playerAction();
        if (pAct.type === 'run' && this.o.pvp) { // a link battle: RUN is giving up
          if (yield* ui.askYesNo('Forfeit this battle?')) { this.o.pvp.forfeit(this); yield* ui.msg(G.state.name + ' forfeited the battle!'); return this.finish('lose'); }
          this.turn--; continue;
        }
        if (pAct.type === 'run') {
          const r = yield* this.tryRun();
          if (r) return this.finish('run');
          const eAct = this.o.p2Action ? (yield* this.o.p2Action(this)) : this.enemyAction();
          yield* this.doMove(this.e, eAct.move);
          if (yield* this.checkFaints()) { if (this.result) return this.result; }
          continue;
        }
        if (pAct.type === 'caught') return this.finish('caught');
        if (pAct.type === 'fled') return this.finish('fled');
        // a second human player picks the opponent's move: local versus, or the other game in a link battle
        const eAct = this.o.p2Action ? (yield* this.o.p2Action(this, pAct)) : this.enemyAction();
        if (eAct.type === 'end') return yield* this.linkEnd(eAct); // the other player forfeited or the link dropped
        // switches & items first
        if (pAct.type === 'switch') yield* this.switchIn(this.p, pAct.index, true);
        if (eAct.type === 'switch') { yield* ui.msg(this.trainer.displayName + ' sent out ' + this.e.party[eAct.index].name + '!', { auto: 16 }); yield* this.switchIn(this.e, eAct.index, true); }
        if (pAct.type === 'item' || pAct.type === 'safari') { /* already resolved */ }
        if (eAct.type === 'item') yield* this.enemyUseItem(eAct.item);
        let order;
        const pMove = pAct.type === 'fight' ? pAct.move : null, eMove = eAct.type === 'fight' ? eAct.move : null;
        if (pMove && eMove) order = this.speedOrder(pMove, eMove);
        else order = pMove ? [this.p] : eMove ? [this.e] : [];
        if (eMove && !pMove) order = [this.e];
        for (const side of order) {
          const mv = side === this.p ? pMove : eMove;
          if (this.mon(side).hp <= 0 || this.mon(side.foe).hp <= 0) continue;
          yield* this.doMove(side, mv);
          if (this.result) return this.result;
          if (this.mon(side.foe).hp > 0) yield* this.afterMoveDamage(side); // a KO skips the attacker's own poison / burn / LEECH SEED, as in Red
          if (yield* this.checkFaints()) { if (this.result) return this.result; break; }
        }
        if (this.safari && this.result) return this.result;
      }
    }
    finish(r) { this.result = r; return r; }

    speedOrder(pm, em) {
      const pri = m => m === 'QUICK_ATTACK' ? 1 : m === 'COUNTER' ? -1 : 0;
      const a = pri(pm), b = pri(em);
      if (a !== b) return a > b ? [this.p, this.e] : [this.e, this.p];
      const sp = this.stat(this.p, 'spd'), se = this.stat(this.e, 'spd');
      if (sp !== se) return sp > se ? [this.p, this.e] : [this.e, this.p];
      // a link battle's tie goes by the shared roll read as "host first", the same answer in both games
      if (this.o.pvp) return chance(0.5) === this.o.pvp.host ? [this.p, this.e] : [this.e, this.p];
      return chance(0.5) ? [this.p, this.e] : [this.e, this.p];
    }

    *playerAction() {
      const v = this.p.v, m = this.mon(this.p);
      // locked-in actions
      if (v.recharge || v.charging || v.thrash || v.bide || (v.trapping && v.trapping.turns > 0) || v.rage) {
        const mv = v.charging || (v.thrash && v.thrash.move) || (v.bide && 'BIDE') || (v.trapping && v.trapping.move) || (v.rage && 'RAGE') || 'STRUGGLE';
        return { type: 'fight', move: v.recharge ? '_RECHARGE' : mv };
      }
      if (v.trapped > 0) { return { type: 'fight', move: '_TRAPPED' }; }
      for (;;) {
        const act = yield* this.ui.chooseAction(this);
        if (act.type === 'fight') {
          const moves = this.moveList(this.p);
          if (moves.every(x => x.pp <= 0 || (v.disabled && v.disabled.move === x.id))) return { type: 'fight', move: 'STRUGGLE' };
          const mv = moves[act.slot];
          if (mv.pp <= 0) { yield* this.ui.msg('No PP left for this move!'); continue; }
          if (v.disabled && v.disabled.move === mv.id) { yield* this.ui.msg(mv.id === 'x' ? '' : G.moveName(mv.id) + ' is disabled!'); continue; }
          return { type: 'fight', move: mv.id, slot: act.slot };
        }
        if (act.type === 'switch') {
          if (act.index === this.p.idx) { yield* this.ui.msg(m.name + ' is already out!'); continue; }
          return act;
        }
        if (act.type === 'item') {
          const r = yield* this.useItem(act.item, act.target);
          if (r === 'cancel') continue;
          if (r === 'caught' || r === 'fled') return { type: r };
          return { type: 'item' };
        }
        if (act.type === 'run') return act;
        if (act.type === 'safari') {
          const r = yield* this.safariAction(act.what);
          if (r) return { type: r };
          return { type: 'safari' };
        }
      }
    }

    enemyAction() {
      const side = this.e, v = side.v;
      if (this.safari) return { type: 'none' };
      if (v.recharge) return { type: 'fight', move: '_RECHARGE' };
      if (v.charging) return { type: 'fight', move: v.charging };
      if (v.thrash) return { type: 'fight', move: v.thrash.move };
      if (v.bide) return { type: 'fight', move: 'BIDE' };
      if (v.trapping && v.trapping.turns > 0) return { type: 'fight', move: v.trapping.move };
      if (v.rage) return { type: 'fight', move: 'RAGE' };
      if (v.trapped > 0) return { type: 'fight', move: '_TRAPPED' };
      // trainer items
      const m = this.mon(side);
      if (!this.wild && this.trainerItems.length && m.hp < m.maxhp / 4 && chance(0.5)) {
        const it = this.trainerItems.shift();
        return { type: 'item', item: it };
      }
      const moves = this.moveList(side).filter(x => x.pp > 0 && !(v.disabled && v.disabled.move === x.id));
      if (!moves.length) return { type: 'fight', move: 'STRUGGLE' };
      // weighted AI
      const foe = this.mon(this.p), fv = this.p.v;
      const smart = !this.wild;
      const scored = moves.map(x => {
        const md = D().moves[x.id];
        let s = 10;
        if (md.power === 0) {
          if (['SLEEP', 'POISON', 'PARALYZE', 'CONFUSION'].includes(md.effect) && (foe.status || (md.effect === 'CONFUSION' && fv.confused))) s -= 8;
          if (md.effect === 'LEECH_SEED' && (fv.seeded || foe.types.includes('GRASS'))) s -= 8;
          if (md.effect === 'HEAL' && m.hp === m.maxhp) s -= 8;
          if (smart && md.effect.includes('_UP') && v.st.atk > 2) s -= 3;
        } else {
          const eff = G.typeMult(md.type, this.types(this.p));
          if (eff === 0) s -= 9;
          else if (smart && eff > 1) s += 6;
          else if (smart && eff < 1) s -= 3;
          if (md.effect === 'DREAM_EATER' && foe.status !== 'SLP') s -= 9;
          if (md.effect === 'OHKO' && this.stat(side, 'spd') < this.stat(this.p, 'spd')) s -= 9;
        }
        return { x, s: Math.max(1, s) };
      });
      let tot = scored.reduce((a, b) => a + b.s, 0), r = Math.random() * tot;
      for (const c of scored) { r -= c.s; if (r <= 0) return { type: 'fight', move: c.x.id }; }
      return { type: 'fight', move: scored[0].x.id };
    }

    // ---------------- move execution ----------------
    *doMove(side, moveId) {
      const ui = this.ui, A = this.mon(side), v = side.v, foe = side.foe;
      const name = this.label(side);
      v.moved = true;
      if (moveId === '_RECHARGE') { v.recharge = false; yield* ui.msg(name + ' must recharge!'); return; }
      if (A.status === 'SLP') {
        A.sleep--;
        if (A.sleep > 0) { yield* ui.statusAnim(side, 'SLP'); yield* ui.msg(name + ' is fast asleep!'); return; }
        A.status = null; yield* ui.refresh(); yield* ui.msg(name + ' woke up!'); return;
      }
      if (A.status === 'FRZ') { yield* ui.statusAnim(side, 'FRZ'); yield* ui.msg(name + ' is frozen solid!'); return; }
      if (moveId === '_TRAPPED' || v.trapped > 0) {
        if (foe.v.trapping && foe.v.trapping.turns > 0 && this.mon(foe).hp > 0) { v.trapped = 0; yield* ui.msg(name + " can't move!"); return; }
        v.trapped = 0;
        if (moveId === '_TRAPPED') { return; }
      }
      if (v.flinch) { v.flinch = false; yield* ui.msg(name + ' flinched!'); return; }
      if (v.disabled) { if (--v.disabled.turns <= 0) { v.disabled = null; yield* ui.msg(name + "'s disabled no more!"); } }
      if (v.confused) {
        v.confused--;
        if (v.confused <= 0) { yield* ui.msg(name + "'s confused no more!"); }
        else {
          yield* ui.statusAnim(side, 'CONF');
          yield* ui.msg(name + ' is confused!');
          if (chance(0.5)) {
            const dmg = this.calcDamage(side, side, { power: 40, type: 'NORMAL_CONF' }, false).dmg;
            v.charging = null; v.invuln = false; v.thrash = null; v.bide = null;
            yield* ui.msg("It hurt itself in its confusion!");
            yield* this.applyDamage(side, dmg, true);
            return;
          }
        }
      }
      if (A.status === 'PAR' && chance(0.25)) {
        v.charging = null; v.invuln = false; v.thrash = null; v.bide = null;
        yield* ui.statusAnim(side, 'PAR');
        yield* ui.msg(name + "'s fully paralyzed!"); return;
      }
      let md = D().moves[moveId] || D().moves.STRUGGLE;
      // PP use (not for continuing multi-turn moves)
      const continuing = (v.charging === moveId) || (v.thrash && v.thrash.started) || (v.bide && v.bide.started) || (v.trapping && v.trapping.started) || (v.rage && moveId === 'RAGE' && v.rageStarted);
      if (!continuing && moveId !== 'STRUGGLE') {
        const slot = this.moveList(side).find(x => x.id === moveId);
        if (slot) slot.pp = Math.max(0, slot.pp - 1);
      }
      foe.v.lastMove = null; // mirror move reads side.v.lastMove of the foe
      v.lastMove = moveId;
      // Metronome / Mirror Move
      if (md.effect === 'METRONOME') {
        yield* ui.msg(name + ' used METRONOME!', { auto: 18 });
        yield* ui.anim('METRONOME', side);
        const pool = D().moveList.filter(x => x !== 'METRONOME' && x !== 'STRUGGLE');
        md = D().moves[pool[rnd(pool.length)]];
        moveId = md.id;
      } else if (md.effect === 'MIRROR_MOVE') {
        yield* ui.msg(name + ' used MIRROR MOVE!', { auto: 18 });
        const last = foe.v.lastUsed;
        if (!last || last === 'MIRROR_MOVE') { yield* ui.msg('But, it failed!'); return; }
        md = D().moves[last]; moveId = md.id;
      }
      side.v.lastUsed = moveId;
      yield* this.executeMove(side, md);
    }

    *executeMove(side, md) {
      const ui = this.ui, A = this.mon(side), v = side.v, foe = side.foe, T = this.mon(foe), tv = foe.v;
      const name = this.label(side), tname = this.label(foe);
      const eff = md.effect;
      // two-turn moves: first turn charges
      if ((eff === 'CHARGE' || eff === 'FLY') && v.charging !== md.id) {
        v.charging = md.id;
        yield* ui.msg(name + ' used ' + md.name + '!', { auto: 18 });
        const chargeMsg = { RAZOR_WIND: ' made a whirlwind!', SOLARBEAM: ' took in sunlight!', SKULL_BASH: ' lowered its head!', SKY_ATTACK: ' is glowing!', FLY: ' flew up high!', DIG: ' dug a hole!' }[md.id] || ' is charging!';
        if (md.id === 'FLY' || md.id === 'DIG') { v.invuln = true; yield* ui.anim(md.id + '_CHARGE', side); yield* ui.hide(side, true); }
        else yield* ui.anim('CHARGE', side);
        yield* ui.msg(name + chargeMsg);
        return;
      }
      if (v.charging === md.id) { v.charging = null; if (v.invuln) { v.invuln = false; yield* ui.hide(side, false); } }
      if (!(v.thrash && v.thrash.started) && !(v.bide && v.bide.started)) yield* ui.msg(name + ' used ' + md.name + '!', { auto: 18 }); // no A press: straight into the animation
      // BIDE
      if (eff === 'BIDE') {
        if (!v.bide) { v.bide = { turns: 2 + rnd(2), dmg: 0, started: true }; yield* ui.anim('BIDE', side); return; }
        v.bide.turns--;
        if (v.bide.turns > 0) { yield* ui.msg(name + ' is storing energy!'); return; }
        const dmg = v.bide.dmg * 2; v.bide = null;
        yield* ui.msg(name + ' unleashed energy!');
        if (dmg === 0 || T.hp <= 0) { yield* ui.msg(name + "'s attack missed!"); return; }
        yield* ui.anim('BIDE_HIT', side);
        yield* this.dealDamage(side, foe, dmg, md);
        return;
      }
      // status / non-damaging moves
      if (md.power === 0 && !['SPECIAL_DAMAGE', 'OHKO', 'SUPER_FANG', 'BIDE', 'COUNTER', 'TRAPPING'].includes(eff) && md.id !== 'COUNTER') {
        yield* this.statusMove(side, md);
        return;
      }
      // accuracy
      if (!(yield* this.accuracyCheck(side, md))) {
        yield* ui.msg(name + "'s attack missed!");
        if (eff === 'JUMP_KICK') { yield* ui.msg(name + ' kept going and crashed!'); yield* this.applyDamage(side, 1, true); }
        if (eff === 'EXPLODE') { A.hp = 0; yield* ui.refresh(); }
        if (v.thrash) v.thrash = null;
        return;
      }
      // counter
      if (md.id === 'COUNTER') {
        const last = D().moves[tv.lastUsed || 'SPLASH'];
        if (!tv.lastDmgDealt || !last || !['NORMAL', 'FIGHTING'].includes(last.type) || last.power === 0) { yield* ui.msg('But, it failed!'); return; }
        yield* ui.anim('COUNTER', side);
        yield* this.dealDamage(side, foe, tv.lastDmgDealt * 2, md);
        return;
      }
      const tm = G.typeMult(md.type, this.types(foe));
      if (tm === 0 && eff !== 'SPECIAL_DAMAGE' && eff !== 'SUPER_FANG') {
        yield* ui.msg("It doesn't affect " + tname + '!'); v.thrash = null; return;
      }
      if (eff === 'DREAM_EATER' && T.status !== 'SLP') { yield* ui.msg("It didn't affect " + tname + '!'); return; }
      if (eff === 'OHKO') {
        if (this.stat(side, 'spd') < this.stat(foe, 'spd')) { yield* ui.msg(name + "'s attack missed!"); return; }
        yield* ui.anim(md.id, side);
        yield* this.dealDamage(side, foe, T.hp + (tv.sub ? 0 : 0), md, true);
        yield* ui.msg("One-hit KO!");
        return;
      }
      // fixed-damage moves
      let fixed = null;
      if (eff === 'SPECIAL_DAMAGE') {
        fixed = md.id === 'SONICBOOM' ? 20 : md.id === 'DRAGON_RAGE' ? 40 : md.id === 'PSYWAVE' ? 1 + rnd(Math.floor(A.level * 1.5)) : A.level;
      }
      if (eff === 'SUPER_FANG') fixed = Math.max(1, Math.floor(T.hp / 2));
      // hits
      let hits = 1;
      if (eff === 'TWO_TO_FIVE_ATTACKS') { const r = rnd(8); hits = r < 3 ? 2 : r < 6 ? 3 : r < 7 ? 4 : 5; }
      if (eff === 'ATTACK_TWICE' || eff === 'TWINEEDLE') hits = 2;
      if (eff === 'THRASH_PETAL_DANCE' && !v.thrash) v.thrash = { move: md.id, turns: 2 + rnd(2), started: true };
      if (eff === 'TRAPPING' && !(v.trapping && v.trapping.turns > 0)) {
        const r = rnd(8); v.trapping = { move: md.id, turns: (r < 3 ? 2 : r < 6 ? 3 : r < 7 ? 4 : 5) - 1, started: true };
      } else if (eff === 'TRAPPING') v.trapping.turns--;
      if (eff === 'RAGE') { v.rage = true; v.rageStarted = true; }
      let total = 0, lastCrit = false, n = 0;
      for (let h = 0; h < hits; h++) {
        if (T.hp <= 0) break;
        yield* ui.anim(md.id, side, h);
        let dmg, crit = false;
        if (fixed !== null) dmg = fixed;
        else { const r = this.calcDamage(side, foe, md, true); dmg = r.dmg; crit = r.crit; }
        if (dmg <= 0 && fixed === null) dmg = 1;
        n++;
        yield* this.dealDamage(side, foe, dmg, md);
        total += dmg;
        if (crit) { yield* ui.msg('Critical hit!'); lastCrit = true; }
        if (eff === 'TWINEEDLE' && T.hp > 0 && chance(0.2)) yield* this.inflict(foe, 'PSN', true);
      }
      if (hits > 1) yield* ui.msg('Hit ' + n + ' times!');
      if (fixed === null && tm !== 1 && total > 0) yield* ui.msg(tm > 1 ? "It's super effective!" : "It's not very effective...");
      // after effects
      if (eff === 'TRAPPING' && T.hp > 0) tv.trapped = 1;
      if (eff === 'THRASH_PETAL_DANCE' && v.thrash) {
        v.thrash.turns--;
        if (v.thrash.turns <= 0) { v.thrash = null; v.confused = 2 + rnd(4); yield* ui.msg(name + ' became confused!'); }
      }
      if (eff === 'RECOIL' && total > 0) {
        const rec = Math.max(1, Math.floor(total / (md.id === 'STRUGGLE' ? 2 : 4)));
        yield* ui.msg(name + "'s hit with recoil!");
        yield* this.applyDamage(side, rec, true);
      }
      if (eff === 'DRAIN_HP' || eff === 'DREAM_EATER') {
        const heal = Math.max(1, Math.floor(total / 2));
        if (A.hp > 0) { A.hp = Math.min(A.maxhp, A.hp + heal); yield* ui.anim('DRAIN', side); yield* ui.syncHp(side); yield* ui.msg('Sucked health from ' + tname + '!'); }
      }
      if (eff === 'EXPLODE') { A.hp = 0; yield* ui.syncHp(side); }
      if (eff === 'HYPER_BEAM' && T.hp > 0) v.recharge = true;
      if (eff === 'PAY_DAY' && side.isPlayer) { this.payDay += 2 * A.level; yield* ui.msg('Coins scattered everywhere!'); }
      if (eff === 'SWITCH_AND_TELEPORT') { /* handled as status */ }
      if (T.hp > 0 && total > 0) yield* this.sideEffect(side, foe, md);
      if (tv.rage && T.hp > 0 && total > 0) { yield* this.statChange(foe, 'atk', 1, false, true); yield* ui.msg(this.label(foe) + "'s RAGE is building!"); }
    }

    *accuracyCheck(side, md) {
      const foe = side.foe, tv = foe.v;
      if (tv.invuln && md.effect !== 'SWIFT') return false;
      if (md.effect === 'SWIFT') return true;
      let acc = Math.floor(md.acc * 255 / 100);
      acc = Math.floor(acc * STAGE[side.v.st.acc + 6] / 100);
      acc = Math.floor(acc * STAGE[6 - tv.st.eva] / 100);
      return rnd(256) < Math.min(255, acc) || md.acc >= 100 && side.v.st.acc >= 0 && tv.st.eva <= 0;
    }

    calcDamage(side, foe, md, useCrit) {
      const A = this.mon(side), T = this.mon(foe);
      const type = md.type === 'NORMAL_CONF' ? 'NORMAL' : md.type;
      const physical = PHYSICAL.has(type);
      let crit = false;
      if (useCrit && md.type !== 'NORMAL_CONF') {
        let base = Math.floor((A.sp.spd) / 2);
        if (HIGH_CRIT.has(md.id)) base = base * 8;
        if (side.v.focus) base = base * 4;
        crit = rnd(256) < Math.min(255, base);
      }
      let L = A.level; if (crit) L *= 2;
      let atk, def;
      if (crit) {
        atk = physical ? (side.v.transformed ? side.v.transformed.atk : A.atk) : (side.v.transformed ? side.v.transformed.spc : A.spc);
        def = physical ? (foe.v.transformed ? foe.v.transformed.def : T.def) : (foe.v.transformed ? foe.v.transformed.spc : T.spc);
        if (physical && A.status === 'BRN') atk = Math.floor(atk / 2);
      } else {
        atk = this.stat(side, physical ? 'atk' : 'spc'); def = this.stat(foe, physical ? 'def' : 'spc');
        if (physical && foe.v.reflect) def *= 2;
        if (!physical && foe.v.lightScreen) def *= 2;
      }
      if (md.type === 'NORMAL_CONF') { atk = this.stat(side, 'atk'); def = this.stat(side, 'def'); }
      if (md.effect === 'EXPLODE') def = Math.max(1, Math.floor(def / 2));
      if (atk > 255 || def > 255) { atk = Math.max(1, Math.floor(atk / 4)); def = Math.max(1, Math.floor(def / 4)); }
      let dmg = Math.floor(Math.floor(Math.floor(2 * L / 5 + 2) * md.power * atk / def) / 50);
      dmg = Math.min(997, dmg) + 2;
      if (md.type !== 'NORMAL_CONF') {
        if (this.types(side).includes(type)) dmg = Math.floor(dmg * 1.5);
        dmg = Math.floor(dmg * G.typeMult(type, this.types(foe)));
        if (dmg > 1) dmg = Math.floor(dmg * (217 + rnd(39)) / 255);
      }
      return { dmg, crit };
    }

    // damage to a target (respecting substitute), updates bide/counter trackers
    *dealDamage(side, foe, dmg, md, ohko) {
      const T = this.mon(foe), tv = foe.v;
      if (tv.sub > 0 && !ohko) {
        tv.sub -= dmg;
        yield* this.ui.hitFlash(foe);
        if (tv.sub <= 0) { tv.sub = 0; yield* this.ui.substitute(foe, false); yield* this.ui.msg(this.label(foe) + "'s SUBSTITUTE broke!"); }
        else yield* this.ui.msg('The SUBSTITUTE took damage for ' + this.label(foe) + '!');
        return;
      }
      dmg = Math.min(dmg, T.hp);
      side.v.lastDmgDealt = dmg;
      if (tv.bide) tv.bide.dmg += dmg;
      yield* this.ui.hitFlash(foe, G.typeMult(md.type, this.types(foe)));
      T.hp -= dmg;
      yield* this.ui.syncHp(foe);
    }
    *applyDamage(side, dmg, self) {
      const M = this.mon(side);
      M.hp = Math.max(0, M.hp - dmg);
      yield* this.ui.hitFlash(side);
      yield* this.ui.syncHp(side);
    }

    *sideEffect(side, foe, md) {
      const e = md.effect, ui = this.ui;
      const T = this.mon(foe);
      if (foe.v.sub > 0) return;
      const tt = this.types(foe);
      switch (e) {
        case 'BURN_SIDE1': if (chance(0.1) && !tt.includes('FIRE')) yield* this.inflict(foe, 'BRN', true); break;
        case 'BURN_SIDE2': if (chance(0.3) && !tt.includes('FIRE')) yield* this.inflict(foe, 'BRN', true); break;
        case 'FREEZE_SIDE1': if (chance(0.1) && !tt.includes('ICE')) yield* this.inflict(foe, 'FRZ', true); break;
        case 'PARALYZE_SIDE1': if (chance(0.1)) yield* this.inflict(foe, 'PAR', true, md.type); break;
        case 'PARALYZE_SIDE2': if (chance(0.3) && !(md.type === 'NORMAL' && tt.includes('NORMAL'))) yield* this.inflict(foe, 'PAR', true, md.type); break;
        case 'POISON_SIDE1': if (chance(0.2) && !tt.includes('POISON')) yield* this.inflict(foe, 'PSN', true); break;
        case 'POISON_SIDE2': if (chance(0.4) && !tt.includes('POISON')) yield* this.inflict(foe, 'PSN', true); break;
        case 'FLINCH_SIDE1': if (chance(0.1)) foe.v.flinch = true; break;
        case 'FLINCH_SIDE2': if (chance(0.3)) foe.v.flinch = true; break;
        case 'CONFUSION_SIDE': if (chance(0.1) && !foe.v.confused) { foe.v.confused = 2 + rnd(4); yield* ui.statusAnim(foe, 'CONF'); yield* ui.msg(this.label(foe) + ' became confused!'); } break;
        case 'SPEED_DOWN_SIDE': if (chance(0.33)) yield* this.statChange(foe, 'spd', -1, true); break;
        case 'ATTACK_DOWN_SIDE': if (chance(0.33)) yield* this.statChange(foe, 'atk', -1, true); break;
        case 'DEFENSE_DOWN_SIDE': if (chance(0.33)) yield* this.statChange(foe, 'def', -1, true); break;
        case 'SPECIAL_DOWN_SIDE': if (chance(0.33)) yield* this.statChange(foe, 'spc', -1, true); break;
      }
      // fire thaws frozen targets
      if (md.type === 'FIRE' && T.status === 'FRZ') { T.status = null; yield* ui.refresh(); yield* ui.msg(this.label(foe) + ' was defrosted!'); }
    }

    *inflict(foe, st, fromMove, moveType) {
      const T = this.mon(foe), ui = this.ui;
      if (T.status || T.hp <= 0) return false;
      if (st === 'PAR' && moveType === 'ELECTRIC' && this.types(foe).includes('GROUND')) return false;
      T.status = st;
      if (st === 'SLP') T.sleep = 1 + rnd(7);
      if (st === 'FRZ' || st === 'SLP') { foe.v.recharge = false; }
      yield* ui.statusAnim(foe, st);
      yield* ui.refresh();
      const txt = { PSN: ' was poisoned!', BRN: ' was burned!', FRZ: ' was frozen solid!', PAR: "'s paralyzed! It may not attack!", SLP: ' fell asleep!' }[st];
      yield* ui.msg(this.label(foe) + txt);
      return true;
    }

    *statChange(side, k, delta, byFoe, quiet) {
      const v = side.v, ui = this.ui;
      if (byFoe && v.mist) { yield* ui.msg(this.label(side) + "'s protected by MIST!"); return false; }
      if (byFoe && v.sub > 0) { yield* ui.msg('But, it failed!'); return false; }
      const cur = v.st[k];
      if ((delta > 0 && cur >= 6) || (delta < 0 && cur <= -6)) { if (!quiet) yield* ui.msg('Nothing happened!'); return false; }
      v.st[k] = Math.max(-6, Math.min(6, cur + delta));
      if (quiet) return true;
      yield* ui.statAnim(side, delta > 0);
      const nm = STAT_NAME[k];
      yield* ui.msg(this.label(side) + "'s " + nm + (delta > 1 ? ' greatly rose!' : delta > 0 ? ' rose!' : delta < -1 ? ' greatly fell!' : ' fell!'));
      return true;
    }

    *statusMove(side, md) {
      const ui = this.ui, A = this.mon(side), v = side.v, foe = side.foe, T = this.mon(foe), tv = foe.v;
      const name = this.label(side), tname = this.label(foe);
      const e = md.effect;
      const selfTarget = /_UP|FOCUS_ENERGY|HEAL|LIGHT_SCREEN|REFLECT|MIST|SUBSTITUTE|CONVERSION|HAZE|SPLASH|TRANSFORM|MIMIC|SWITCH_AND_TELEPORT/.test(e) || e === 'DISABLE';
      // accuracy for targeted status moves
      if (!selfTarget || e === 'DISABLE' || e === 'MIMIC' || e === 'TRANSFORM') {
        if (!['TRANSFORM', 'HAZE'].includes(e)) {
          if (tv.invuln || !(yield* this.accuracyCheck(side, md))) { yield* ui.msg(name + "'s attack missed!"); return; }
        }
      }
      const failed = function* () { yield* ui.msg('But, it failed!'); };
      const immune = G.typeMult(md.type, this.types(foe)) === 0 && ['PARALYZE', 'POISON', 'SLEEP', 'CONFUSION'].includes(e);
      if (immune) { yield* ui.msg("It doesn't affect " + tname + '!'); return; }
      switch (e) {
        case 'ATTACK_UP1': case 'ATTACK_UP2': case 'DEFENSE_UP1': case 'DEFENSE_UP2': case 'SPEED_UP2': case 'SPECIAL_UP1': case 'SPECIAL_UP2': case 'EVASION_UP1': {
          const k = { ATTACK: 'atk', DEFENSE: 'def', SPEED: 'spd', SPECIAL: 'spc', EVASION: 'eva' }[e.split('_')[0]];
          yield* ui.anim(md.id, side);
          yield* this.statChange(side, k, e.endsWith('2') ? 2 : 1, false);
          break;
        }
        case 'ATTACK_DOWN1': case 'DEFENSE_DOWN1': case 'DEFENSE_DOWN2': case 'SPEED_DOWN1': case 'ACCURACY_DOWN1': {
          const k = { ATTACK: 'atk', DEFENSE: 'def', SPEED: 'spd', ACCURACY: 'acc' }[e.split('_')[0]];
          yield* ui.anim(md.id, side);
          yield* this.statChange(foe, k, e.endsWith('2') ? -2 : -1, true);
          break;
        }
        case 'SLEEP': if (T.status) { yield* failed(); break; } yield* ui.anim(md.id, side); yield* this.inflict(foe, 'SLP'); break;
        case 'POISON':
          if (T.status || this.types(foe).includes('POISON')) { yield* failed(); break; }
          yield* ui.anim(md.id, side);
          yield* this.inflict(foe, 'PSN');
          if (md.id === 'TOXIC') { tv.toxic = 1; }
          break;
        case 'PARALYZE':
          if (T.status) { yield* failed(); break; }
          yield* ui.anim(md.id, side); yield* this.inflict(foe, 'PAR', false, md.type); break;
        case 'CONFUSION':
          if (tv.confused || tv.sub) { yield* failed(); break; }
          yield* ui.anim(md.id, side); tv.confused = 2 + rnd(4);
          yield* ui.statusAnim(foe, 'CONF'); yield* ui.msg(tname + ' became confused!'); break;
        case 'LEECH_SEED':
          if (tv.seeded || this.types(foe).includes('GRASS')) { yield* ui.msg(tname + ' evaded the attack!'); break; }
          yield* ui.anim(md.id, side); tv.seeded = true; yield* ui.msg(tname + ' was seeded!'); break;
        case 'HEAL':
          if (A.hp >= A.maxhp) { yield* failed(); break; }
          yield* ui.anim(md.id, side);
          if (md.id === 'REST') { A.status = 'SLP'; A.sleep = 2; A.hp = A.maxhp; v.toxic = 0; yield* ui.refresh(); yield* ui.syncHp(side); yield* ui.msg(name + ' started sleeping!'); }
          else { A.hp = Math.min(A.maxhp, A.hp + Math.floor(A.maxhp / 2)); yield* ui.syncHp(side); yield* ui.msg(name + ' regained health!'); }
          break;
        case 'LIGHT_SCREEN': if (v.lightScreen) { yield* failed(); break; } yield* ui.anim(md.id, side); v.lightScreen = true; yield* ui.msg(name + "'s protected against special attacks!"); break;
        case 'REFLECT': if (v.reflect) { yield* failed(); break; } yield* ui.anim(md.id, side); v.reflect = true; yield* ui.msg(name + ' gained armor!'); break;
        case 'MIST': if (v.mist) { yield* failed(); break; } yield* ui.anim(md.id, side); v.mist = true; yield* ui.msg(name + "'s shrouded in mist!"); break;
        case 'FOCUS_ENERGY': if (v.focus) { yield* failed(); break; } yield* ui.anim(md.id, side); v.focus = true; yield* ui.msg(name + "'s getting pumped!"); break;
        case 'HAZE':
          yield* ui.anim(md.id, side);
          for (const s of [side, foe]) { s.v.st = { atk: 0, def: 0, spd: 0, spc: 0, acc: 0, eva: 0 }; s.v.confused = 0; s.v.seeded = false; s.v.focus = false; s.v.mist = false; s.v.reflect = false; s.v.lightScreen = false; s.v.disabled = null; s.v.toxic = 0; }
          if (T.status) { if (T.status === 'SLP' || T.status === 'FRZ') { } T.status = null; }
          yield* ui.refresh(); yield* ui.msg('All status changes were eliminated!'); break;
        case 'SUBSTITUTE': {
          const cost = Math.floor(A.maxhp / 4);
          if (v.sub > 0) { yield* ui.msg(name + ' has a SUBSTITUTE already!'); break; }
          if (A.hp <= cost) { yield* ui.msg('Too weak to make a SUBSTITUTE!'); break; }
          A.hp -= cost; v.sub = cost + 1; yield* ui.syncHp(side);
          yield* ui.substitute(side, true); yield* ui.msg('It created a SUBSTITUTE!'); break;
        }
        case 'DISABLE': {
          const last = tv.lastUsed;
          if (!last || tv.disabled || !this.moveList(foe).find(x => x.id === last && x.pp > 0)) { yield* failed(); break; }
          yield* ui.anim(md.id, side);
          tv.disabled = { move: last, turns: 1 + rnd(8) };
          yield* ui.msg(tname + "'s " + G.moveName(last) + ' was disabled!'); break;
        }
        case 'MIMIC': {
          const opts = this.moveList(foe).map(x => x.id);
          const pick = side.isPlayer && !this.o.pvp ? (yield* ui.chooseMove(opts, 'Mimic which move?')) : opts[rnd(opts.length)];
          if (!pick) { yield* failed(); break; }
          const list = this.moveList(side); const slot = list.findIndex(x => x.id === 'MIMIC');
          if (slot >= 0) { v.mimic = { slot, old: list[slot] }; list[slot] = { id: pick, pp: list[slot].pp, max: list[slot].max, ups: 0, mimic: true }; }
          yield* ui.anim(md.id, side);
          yield* ui.msg(name + ' learned ' + G.moveName(pick) + '!'); break;
        }
        case 'TRANSFORM': {
          if (tv.invuln) { yield* failed(); break; }
          yield* ui.anim(md.id, side);
          v.transformed = { species: T.species, types: this.types(foe).slice(), atk: T.atk, def: T.def, spd: T.spd, spc: T.spc, moves: this.moveList(foe).map(x => ({ id: x.id, pp: 5, max: 5 })) };
          v.st = Object.assign({}, tv.st);
          yield* ui.transform(side, T.species);
          yield* ui.msg(name + ' transformed into ' + T.sp.name + '!'); break;
        }
        case 'CONVERSION': yield* ui.anim(md.id, side); v.types = this.types(foe).slice(); yield* ui.msg('Converted type to ' + TYPE_NAME(v.types[0]) + '!'); break;
        case 'SPLASH': yield* ui.anim(md.id, side); yield* ui.msg('No effect!'); break;
        case 'SWITCH_AND_TELEPORT':
          if (this.wild) {
            yield* ui.anim(md.id, side);
            if (side.isPlayer) { yield* ui.msg('Got away safely!'); this.result = 'run'; }
            else { yield* ui.msg(name + ' ran away!'); this.result = 'fled'; }
            yield* ui.flee(side);
          } else yield* failed();
          break;
        default: yield* failed();
      }
    }

    // poison / burn / leech seed after the side's move
    *afterMoveDamage(side) {
      const M = this.mon(side), v = side.v, ui = this.ui;
      if (M.hp <= 0 || this.result) return;
      if (M.status === 'PSN' || M.status === 'BRN') {
        let dmg = Math.max(1, Math.floor(M.maxhp / 16));
        if (v.toxic > 0) { dmg = Math.max(1, Math.floor(M.maxhp / 16) * v.toxic); v.toxic++; }
        yield* ui.statusAnim(side, M.status);
        yield* ui.msg(this.label(side) + "'s hurt by " + (M.status === 'PSN' ? 'poison' : 'the burn') + '!');
        yield* this.applyDamage(side, dmg, true);
      }
      if (v.seeded && M.hp > 0) {
        let dmg = Math.max(1, Math.floor(M.maxhp / 16));
        if (v.toxic > 0) dmg = Math.max(1, Math.floor(M.maxhp / 16) * v.toxic);
        dmg = Math.min(dmg, M.hp);
        yield* ui.anim('LEECH_SEED_DRAIN', side);
        yield* this.applyDamage(side, dmg, true);
        const F = this.mon(side.foe);
        if (F.hp > 0) { F.hp = Math.min(F.maxhp, F.hp + dmg); yield* ui.syncHp(side.foe); }
        yield* ui.msg('LEECH SEED saps ' + this.label(side) + '!');
      }
    }

    // ---------------- fainting & switching ----------------
    *checkFaints() {
      const ui = this.ui;
      let any = false;
      const E = this.mon(this.e), Pm = this.mon(this.p);
      if (E.hp <= 0 && !this.e.fainted) {
        any = true; this.e.fainted = true;
        yield* ui.faint(this.e);
        yield* ui.msg(this.label(this.e) + ' fainted!');
        if (this.wild && G.music) G.music('victory_wild');
        yield* this.giveExp();
        if (this.wild) return this.finish('win') || true;
      }
      if (Pm.hp <= 0 && !this.p.fainted) {
        any = true; this.p.fainted = true;
        yield* ui.faint(this.p);
        yield* ui.msg(Pm.name + ' fainted!');
        this.participants.delete(Pm);
      }
      if (!any) return false;
      if (this.o.pvp) return yield* this.linkFaints();
      // player replacement
      if (this.p.fainted) {
        if (!this.p.party.some(m => m.hp > 0)) {
          yield* ui.msg(G.state.name + ' is out of usable POKéMON!');
          if (!this.wild && this.trainer && this.trainer.loseText) { yield* ui.trainerSays(this.trainer.loseText); }
          yield* ui.msg(G.state.name + ' blacked out!');
          return this.finish('lose') || true;
        }
        if (this.wild) {
          const run = yield* ui.askYesNo('Use next POKéMON?');
          if (!run) { const r = yield* this.tryRun(true); if (r) return this.finish('run') || true; }
        }
        const idx = yield* ui.partyMenu(true);
        yield* this.switchIn(this.p, idx, false);
      }
      // enemy trainer replacement
      if (this.e.fainted && !this.wild) {
        const next = this.e.party.findIndex(m => m.hp > 0);
        if (next < 0) {
          yield* ui.trainerDefeated(this);
          return this.finish('win') || true;
        }
        const nm = this.e.party[next];
        yield* ui.msg((this.trainer.displayName || 'The trainer') + ' is about to use ' + nm.name + '!');
        if (G.state.options.battleStyle === 'shift' && this.p.party.filter(m => m.hp > 0).length > 1) {
          const sw = yield* ui.askYesNo('Will ' + G.state.name + ' change POKéMON?');
          if (sw) { const idx = yield* ui.partyMenu(false); if (idx >= 0 && idx !== this.p.idx) yield* this.switchIn(this.p, idx, true); }
        }
        yield* this.switchIn(this.e, next, false);
      }
      return true;
    }

    // link battles: both games settle the same way, whichever side they show at the bottom, and each player picks
    // their own replacement (the other game waits for it)
    *linkFaints() {
      const ui = this.ui, pvp = this.o.pvp;
      const pOut = this.p.fainted && !this.p.party.some(m => m.hp > 0), eOut = this.e.fainted && !this.e.party.some(m => m.hp > 0);
      if (pOut && eOut) { yield* ui.msg('Both sides are out of usable POKéMON!'); yield* ui.msg('The battle is a draw!'); return this.finish('draw') || true; }
      if (eOut) { yield* ui.trainerDefeated(this); return this.finish('win') || true; }
      if (pOut) {
        yield* ui.msg(G.state.name + ' is out of usable POKéMON!');
        if (this.trainer.loseText) yield* ui.trainerSays(this.trainer.loseText);
        return this.finish('lose') || true;
      }
      if (this.p.fainted) { const idx = yield* pvp.replace(this, 'p'); yield* this.switchIn(this.p, idx, false); }
      if (this.e.fainted) {
        const r = yield* pvp.replace(this, 'e');
        if (typeof r === 'object') { yield* this.linkEnd(r); return true; }
        yield* ui.msg(this.trainer.displayName + ' sent out ' + this.e.party[r].name + '!', { auto: 16 });
        yield* this.switchIn(this.e, r, false);
      }
      return true;
    }

    *linkEnd(r) {
      if (r.msg) yield* this.ui.msg(r.msg);
      if (r.result === 'win') yield* this.ui.trainerDefeated(this);
      return this.finish(r.result);
    }

    *switchIn(side, idx, withdraw) {
      const ui = this.ui;
      if (withdraw && !side.fainted) yield* ui.withdraw(side);
      // clear volatile state
      if (side.v.mimic) { const list = this.mon(side).moves; list[side.v.mimic.slot] = side.v.mimic.old; }
      side.v = newVol(); side.fainted = false;
      side.foe.v.trapping = null; side.foe.v.trapped = 0;
      side.idx = idx;
      if (side.isPlayer) this.participants.add(this.mon(side));
      else { this.participants = new Set([this.mon(this.p)].filter(m => m.hp > 0)); }
      yield* ui.sendOut(side);
      if (!side.isPlayer) G.dexSeen && G.dexSeen(this.mon(side).species);
    }

    *giveExp() {
      if (this.o.noExp) return; // Battle Tower / link battles: no experience
      const ui = this.ui, E = this.mon(this.e);
      const parts = [...this.participants].filter(m => m.hp > 0);
      if (!parts.length) return;
      const expAll = G.bag && G.bag.has('EXP_ALL');
      let base = Math.floor(E.sp.baseExp * E.level / 7);
      if (!this.wild) base = Math.floor(base * 1.5);
      const share = Math.max(1, Math.floor(base / (expAll ? parts.length * 2 : parts.length)));
      const recips = expAll ? this.p.party.filter(m => m.hp > 0).map(m => [m, Math.max(1, Math.floor(base / 2 / this.p.party.filter(x => x.hp > 0).length)) + (parts.includes(m) ? share : 0)]) : parts.map(m => [m, share]);
      for (const [m, amt0] of recips) {
        let amt = amt0;
        const traded = m.otId !== (G.state.trainerId || 0) || m.ot !== G.state.name;
        if (traded) amt = Math.floor(amt * 1.5);
        for (const k of ['hp', 'atk', 'def', 'spd', 'spc']) m.sexp[k] = Math.min(65535, m.sexp[k] + E.sp[k]);
        if (m.level >= 100) continue;
        yield* ui.msg(m.name + (traded ? ' gained a boosted ' : ' gained ') + amt + ' EXP. Points!');
        const active = m === this.mon(this.p);
        let remaining = amt;
        while (remaining > 0 && m.level < 100) {
          const need = m.expToNext() - m.exp;
          const add = Math.min(need, remaining);
          const from = m.exp;
          m.exp += add; remaining -= add;
          if (active) yield* ui.expBar(m, from, m.exp);
          if (m.exp >= m.expToNext()) {
            const old = { maxhp: m.maxhp, atk: m.atk, def: m.def, spd: m.spd, spc: m.spc };
            m.level++; m.recalc();
            m.leveledInBattle = true;
            if (active) { yield* ui.refresh(); if (G.sfx) G.sfx('levelup'); }
            yield* ui.msg(m.name + ' grew to level ' + m.level + '!');
            yield* ui.levelStats(m, old);
            for (const mv of m.movesAtLevel(m.level)) yield* this.learnMove(m, mv);
          }
        }
        if (remaining > 0) m.exp += remaining;
      }
    }
    *learnMove(m, mv) {
      yield* G.learnMoveFlow(m, mv, this.ui);
    }

    *tryRun(afterFaint) {
      const ui = this.ui;
      if (!this.wild) { yield* ui.msg("No! There's no running from a trainer battle!"); return false; }
      if (this.o.noRun) { yield* ui.msg("Can't escape!"); return false; }
      this.runAttempts++;
      const ps = this.mon(this.p).spd, es = Math.floor(this.mon(this.e).spd / 4) % 256;
      let ok = true;
      if (es !== 0) { const f = Math.floor(ps * 32 / es) + 30 * this.runAttempts; ok = f > 255 || rnd(256) < f; }
      if (ok) { if (G.sfx) G.sfx('run'); yield* ui.msg('Got away safely!'); return true; }
      yield* ui.msg("Can't escape!");
      return false;
    }

    // ---------------- items ----------------
    *useItem(item, target) {
      const ui = this.ui;
      if (/BALL$/.test(item)) {
        if (!this.wild) { yield* ui.msg("The trainer blocked the BALL!"); yield* ui.msg("Don't be a thief!"); G.bag.remove(item, 1); return 'used'; }
        if (this.o.noCatch) { yield* ui.msg("It dodged the thrown BALL!\fThis POKéMON can't be caught!"); G.bag.remove(item, 1); return 'used'; }
        G.bag.remove(item, 1);
        return yield* this.throwBall(item);
      }
      const r = yield* G.useItemInBattle(item, target, this, ui);
      return r;
    }
    *throwBall(item) {
      const ui = this.ui, E = this.mon(this.e);
      yield* ui.msg(G.state.name + ' used ' + G.itemName(item) + '!');
      let caught = false, shakes = 0;
      if (item === 'MASTER_BALL') caught = true;
      else {
        const r1max = item === 'POKE_BALL' ? 256 : item === 'GREAT_BALL' ? 201 : 151;
        let r1 = rnd(r1max);
        const st = E.status === 'SLP' || E.status === 'FRZ' ? 25 : E.status ? 12 : 0;
        let rate = E.sp.catchRate;
        if (this.safari) rate = Math.max(1, Math.min(255, rate * (this.safariRock ? 2 : 1) / (this.safariBait ? 2 : 1)));
        if (r1 - st < 0) caught = true;
        else if (r1 - st > rate) caught = false;
        else {
          const f = Math.min(255, Math.floor(Math.floor(E.maxhp * 255 / (item === 'GREAT_BALL' ? 8 : 12)) / Math.max(1, Math.floor(E.hp / 4))));
          caught = f >= rnd(256);
          if (!caught) {
            const x = Math.floor(rate * 100 / (item === 'POKE_BALL' ? 255 : item === 'GREAT_BALL' ? 200 : 150));
            const z = Math.floor(x * f / 255) + (st === 25 ? 10 : st ? 5 : 0);
            shakes = z < 10 ? 0 : z < 30 ? 1 : z < 70 ? 2 : 3;
          }
        }
      }
      if (caught) shakes = 3;
      yield* ui.ballThrow(item, shakes, caught);
      if (!caught) {
        yield* ui.msg(['You missed the POKéMON!', 'Darn! The POKéMON broke free!', 'Aww! It appeared to be caught!', 'Shoot! It was so close too!'][shakes]);
        return 'used';
      }
      yield* ui.msg('All right! ' + E.sp.name + ' was caught!');
      const isNew = !G.state.dex.caught[E.species];
      G.dexCaught && G.dexCaught(E.species);
      if (isNew) { yield* ui.msg('New POKéDEX data will be added for ' + E.sp.name + '!'); yield* ui.dexEntry(E.species); }
      E.status = E.status; E.ot = G.state.name; E.otId = G.state.trainerId || 0;
      yield* G.receiveMon(E, ui);
      return 'caught';
    }
    *enemyUseItem(item) {
      const ui = this.ui, M = this.mon(this.e);
      const tn = this.trainer.displayName || 'Enemy';
      yield* ui.msg(tn + ' used ' + G.itemName(item) + '!');
      if (/POTION|FULL_RESTORE/.test(item)) {
        const heal = item === 'POTION' ? 20 : item === 'SUPER_POTION' ? 50 : item === 'HYPER_POTION' ? 200 : M.maxhp;
        M.hp = Math.min(M.maxhp, M.hp + heal); if (item === 'FULL_RESTORE') M.status = null;
        yield* ui.anim('HEAL_ITEM', this.e); yield* ui.syncHp(this.e); yield* ui.refresh();
      } else if (item === 'FULL_HEAL') { M.status = null; this.e.v.confused = 0; yield* ui.refresh(); }
      else if (item === 'X_ATTACK') yield* this.statChange(this.e, 'atk', 1);
      else if (item === 'X_DEFEND') yield* this.statChange(this.e, 'def', 1);
      else if (item === 'X_SPEED') yield* this.statChange(this.e, 'spd', 1);
      else if (item === 'X_SPECIAL') yield* this.statChange(this.e, 'spc', 1);
      else if (item === 'GUARD_SPEC') { this.e.v.mist = true; yield* ui.msg(this.label(this.e) + "'s covered by a veil!"); }
      else if (item === 'DIRE_HIT') { this.e.v.focus = true; }
    }
    *safariAction(what) {
      const ui = this.ui, E = this.mon(this.e);
      if (what === 'ball') {
        if (!G.state.safariBalls) { return 'fled'; }
        G.state.safariBalls--;
        const r = yield* this.throwBall('SAFARI_BALL');
        if (r === 'caught') return 'caught';
        if (G.state.safariBalls <= 0) { yield* ui.msg('PA: Ding-dong!\fYou are out of SAFARI BALLs!'); this.result = 'safari_out'; return 'fled'; }
      } else if (what === 'bait') { yield* ui.msg(G.state.name + ' threw some BAIT.'); this.safariBait = 1 + rnd(5); this.safariRock = 0; yield* ui.msg(this.label(this.e) + ' is eating!'); }
      else if (what === 'rock') { yield* ui.msg(G.state.name + ' threw a ROCK.'); this.safariRock = 1 + rnd(5); this.safariBait = 0; yield* ui.anim('ROCK_THROW_SAFARI', this.p); yield* ui.msg(this.label(this.e) + ' is angry!'); }
      else if (what === 'run') { yield* ui.msg('Got away safely!'); return 'fled'; }
      // does it flee?
      let fleeChance = Math.min(255, E.spd * 2) / 256;
      if (this.safariBait) { fleeChance /= 4; this.safariBait--; }
      if (this.safariRock) { fleeChance *= 2; this.safariRock--; }
      if (chance(fleeChance * 0.35)) { yield* ui.msg(this.label(this.e) + ' ran away!'); yield* ui.flee(this.e); return 'fled'; }
      if (this.safariBait) yield* ui.msg(this.label(this.e) + ' is eating!');
      else if (this.safariRock) yield* ui.msg(this.label(this.e) + ' is angry!');
      else yield* ui.msg(this.label(this.e) + ' is watching carefully!');
      return null;
    }
  }
  G.Battle = Battle; G.newVol = newVol;
})(window.G);
