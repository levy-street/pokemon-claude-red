// Battle presentation: background, sprites, HP boxes, menus and the UI protocol used by G.Battle.
(function (G) {
  'use strict';
  const { Surface, hex, rgb, mix, hash2 } = G.gfx;
  const P = G.PAL, F = G.font, UI = () => G.ui;
  const INK = hex('#3a3a4c'), INK_SH = hex('#d6d4cc');
  const E_POS = { x: 236, y: 78 }, P_POS = { x: 84, y: 134 };
  const TYPE_COL = {
    NORMAL: '#a8a878', FIRE: '#f08030', WATER: '#6890f0', GRASS: '#78c850', ELECTRIC: '#f8d030', ICE: '#98d8d8', FIGHTING: '#c03028',
    POISON: '#a040a0', GROUND: '#e0c068', FLYING: '#a890f0', PSYCHIC_TYPE: '#f85888', BUG: '#a8b820', ROCK: '#b8a038', GHOST: '#705898', DRAGON: '#7038f8',
  };
  G.TYPE_COL = TYPE_COL;
  G.typeName = t => t === 'PSYCHIC_TYPE' ? 'PSYCHIC' : t;

  function hpColor(frac) { return frac > 0.5 ? [hex('#58d080'), hex('#2a9a50'), hex('#98f0b0')] : frac > 0.2 ? [hex('#f8c838'), hex('#c89010'), hex('#fff0a0')] : [hex('#f05848'), hex('#b02828'), hex('#ffa090')]; }

  class BattleScene {
    constructor(opts) {
      this.opaque = true; this.t = 0; this.opts = opts;
      this.bg = G.battleBg(opts.bg || 'grass');
      this.show = { p: false, e: false };
      this.disp = { p: 0, e: 0 }; // displayed HP
      this.offs = { p: { x: 0, y: 0 }, e: { x: 0, y: 0 } };
      this.vis = { p: 1, e: 1 }; this.hidden = { p: false, e: false };
      this.tint = { p: null, e: null };
      this.clip = { p: 1, e: 1 }; // vertical reveal fraction (faint / send out)
      this.scale = { p: 1, e: 1 };
      this.boxes = { p: false, e: false };
      this.box = null; // text box state {text, chars, wait}
      this.menu = null; this.fx = []; this.shake = 0; this.flash = 0; this.flashColor = P.white;
      this.trainerX = null; this.playerPicX = null; this.trainerPic = null;
      this.platformSlide = 1; this.expDisp = null; this.statsBox = null;
      this.overlay = null; this.subs = { p: false, e: false };
      this.transformed = { p: null, e: null };
      this.screenFx = null; // wave distortion etc.
    }
    key(side) { return side.isPlayer ? 'p' : 'e'; }
    mon(k) { return k === 'p' ? this.b.mon(this.b.p) : this.b.mon(this.b.e); }
    sprite(k) {
      const m = this.mon(k);
      const sp = this.transformed[k] || m.species;
      if (this.subs[k]) return G.substituteSprite(k === 'p' ? 'back' : 'front');
      return G.pokeSprite(sp, k === 'p' ? 'back' : 'front');
    }
    update() { this.t++; }

    // ---------------- drawing ----------------
    draw(s) {
      const sh = this.shake > 0 ? Math.round((Math.random() - 0.5) * this.shake * 2) : 0;
      if (this.shake > 0) { this.shake -= 0.5; if (this.shake < 0) this.shake = 0; }
      // background
      s.blit(this.bg.s, sh, 0);
      const slide = this.platformSlide;
      const eoff = Math.round((1 - slide) * -320), poff = Math.round((1 - slide) * 320);
      // platforms
      s.blit(this.bg.ep, E_POS.x - this.bg.ep.w / 2 + eoff + sh, E_POS.y - this.bg.ep.h / 2 + 2);
      s.blit(this.bg.pp, P_POS.x - this.bg.pp.w / 2 + poff + sh, P_POS.y - this.bg.pp.h / 2 - 2);
      // trainer sprites
      if (this.trainerPic && this.trainerX !== null) {
        const tp = this.trainerPic;
        s.blit(tp, Math.round(this.trainerX) - tp.w / 2 + sh, E_POS.y - tp.h + 6);
      }
      if (this.playerPic && this.playerPicX !== null) {
        const pp = this.playerPic;
        s.blit(pp, Math.round(this.playerPicX) - pp.w / 2 + sh, 132 - pp.h + 4);
      }
      // pokemon
      for (const k of ['e', 'p']) {
        if (!this.show[k] || this.hidden[k]) continue;
        const spr = this.sprite(k);
        const base = k === 'e' ? E_POS : P_POS;
        const o = this.offs[k];
        const bob = k === 'p' && !this.menuActive ? 0 : (k === 'e' ? 0 : Math.round(Math.sin(this.t / 14)));
        const breathe = this.idle(k);
        const x = base.x - 32 + o.x + sh + (k === 'e' ? eoff : poff);
        let y = base.y - 64 + o.y + (k === 'e' ? 10 : 12) + bob + breathe;
        const c = this.clip[k], sc = this.scale[k];
        if (this.vis[k] <= 0) continue;
        const opts = { alpha: this.vis[k] < 1 ? this.vis[k] : 1 };
        if (this.tint[k]) { opts.tint = this.tint[k][0]; opts.tintAmt = this.tint[k][1]; }
        if (sc !== 1) {
          const w = Math.round(64 * sc), h = Math.round(64 * sc);
          s.blitScaled(spr, base.x - w / 2 + o.x, y + 64 - h, w, h, opts);
        } else if (c < 1) {
          const hh = Math.round(64 * c);
          s.blit(spr, x, y + (64 - hh), Object.assign({ sy: 0, sh: hh }, opts));
        } else s.blit(spr, x, y, opts);
      }
      // effects under UI
      for (let i = this.fx.length - 1; i >= 0; i--) { const f = this.fx[i]; if (f.layer === 'ui') continue; if (f.draw(s, this) === false) this.fx.splice(i, 1); }
      if (this.screenFx) this.screenFx(s, this);
      if (this.flash > 0) { const d = s.data, c = this.flashColor, a = Math.min(1, this.flash); for (let i = 0; i < 320 * 132; i++) d[i] = mix(d[i], c, a); this.flash -= 0.12; }
      // HP boxes
      if (this.boxes.e) this.drawEnemyBox(s);
      if (this.boxes.p) this.drawPlayerBox(s);
      if (this.b && !this.b.wild) this.drawPartyBalls(s);
      // text / menus
      this.drawTextArea(s);
      for (let i = this.fx.length - 1; i >= 0; i--) { const f = this.fx[i]; if (f.layer !== 'ui') continue; if (f.draw(s, this) === false) this.fx.splice(i, 1); }
      if (this.statsBox) this.drawStatsBox(s);
      if (this.overlay) this.overlay(s, this);
    }
    idle(k) {
      if (!this.show[k] || this.b && this.mon(k).hp <= 0) return 0;
      const m = this.b ? this.mon(k) : null;
      if (m && m.status === 'SLP') return 0;
      return Math.round(Math.sin(this.t / (k === 'e' ? 22 : 26) + (k === 'e' ? 0 : 2)) * 0.8);
    }
    drawEnemyBox(s) {
      const m = this.mon('e'), x = 10, y = 12, w = 132, h = 34;
      this.hpBox(s, x, y, w, h, 'e');
      const nm = m.name;
      F.draw(s, nm, x + 10, y + 6, INK, INK_SH);
      G.font.drawSmall(s, 'Lv' + m.level, x + w - 34, y + 8, INK);
      if (m.status) this.statusBadge(s, x + 10, y + 21, m.status);
      this.hpBar(s, x + 44, y + 22, 78, this.disp.e / m.maxhp);
      if (this.b.wild && G.state.dex.caught[m.species]) {
        const bx = x + w - 12, by = y + 8; // caught indicator ball
        s.disc(bx, by + 2, 2.5, hex('#e04848')); s.pset(bx - 2, by + 2, P.outline); s.pset(bx + 2, by + 2, P.outline); s.pset(bx, by + 2, P.white);
      }
    }
    drawPlayerBox(s) {
      const m = this.mon('p'), x = 176, y = 88, w = 138, h = 42;
      this.hpBox(s, x, y, w, h, 'p');
      F.draw(s, m.name, x + 12, y + 6, INK, INK_SH);
      G.font.drawSmall(s, 'Lv' + m.level, x + w - 34, y + 8, INK);
      if (m.status) this.statusBadge(s, x + 12, y + 20, m.status);
      this.hpBar(s, x + 48, y + 21, 80, this.disp.p / m.maxhp);
      const hpTxt = Math.ceil(this.disp.p) + '/' + m.maxhp;
      G.font.drawSmall(s, hpTxt, x + w - 10 - G.font.measureSmall(hpTxt), y + 27, INK);
      // exp bar
      const lo = m.expThis(), hi = m.expToNext();
      const e = this.expDisp !== null ? this.expDisp : m.exp;
      const frac = hi > lo ? Math.max(0, Math.min(1, (e - lo) / (hi - lo))) : 1;
      const bx = x + 12, by = y + h - 7, bw = w - 24;
      s.rect(bx - 1, by - 1, bw + 2, 4, P.outline);
      s.rect(bx, by, bw, 2, hex('#50506a'));
      s.rect(bx, by, Math.round(bw * frac), 2, hex('#48b8f8'));
      s.rect(bx, by, Math.round(bw * frac), 1, hex('#a8e8ff'));
    }
    drawPartyBalls(s) {
      const mini = (x, y, st) => {
        const c = st === 'ok' ? hex('#e04848') : st === 'bad' ? hex('#e0a040') : hex('#6a6a7a');
        s.disc(x, y, 3, P.outline); s.disc(x, y, 2.2, P.white); for (let i = -2; i <= 2; i++) for (let j = -2; j < 0; j++) if (i * i + j * j <= 5) s.pset(x + i, y + j, c);
        s.hline(x - 2, x + 2, y, P.outline); s.pset(x, y, P.white);
      };
      const stat = m => m.hp <= 0 ? 'fnt' : m.status ? 'bad' : 'ok';
      const ep = this.b.e.party;
      for (let i = 0; i < 6; i++) { const x = 18 + i * 8, y = 50; if (i < ep.length) mini(x, y, stat(ep[i])); else { s.circle(x, y, 2, hex('#8a8aa0')); } }
      if (this.menuBallsP || !this.boxes.p) { const pp = G.state.party; for (let i = 0; i < 6; i++) { const x = 262 + i * 8, y = 132 - 6; if (i < pp.length) mini(x, y, stat(pp[i])); } }
    }
    hpBox(s, x, y, w, h, k) {
      // base plate with angled edge
      const dark = hex('#2e3450'), mid = hex('#f4f2e6'), light = hex('#ffffff'), edge = hex('#b8b4a0');
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const cut = k === 'e' ? (i > w - 8 && j > h - (w - i) * 2) : (i < 8 && j > h - (8 - i) * 2 && false);
        if (cut) continue;
        let c = mid;
        if (j === 0 || i === 0 || j === h - 1 || i === w - 1) c = dark;
        else if (j === 1 || i === 1) c = light;
        else if (j === h - 2 || i === w - 2) c = edge;
        s.pset(x + i, y + j, c);
      }
      // colored tab
      const tab = k === 'e' ? hex('#d05858') : hex('#5878d0');
      for (let j = 2; j < h - 2; j++) { s.pset(x + 2, y + j, tab); s.pset(x + 3, y + j, tab); }
      // drop shadow
      for (let i = 2; i < w + 2; i++) s.pmul(x + i, y + h, rgb(150, 150, 180));
      for (let j = 2; j < h; j++) s.pmul(x + w, y + j, rgb(150, 150, 180));
    }
    hpBar(s, x, y, w, frac) {
      frac = Math.max(0, Math.min(1, frac));
      s.rect(x - 16, y - 1, w + 18, 6, P.outline);
      s.rect(x - 15, y, 14, 4, hex('#e8a040'));
      G.font.drawSmall(s, 'HP', x - 14, y, hex('#fff4d8'));
      s.rect(x, y, w, 4, hex('#50506a'));
      const [c, d, l] = hpColor(frac);
      const fw = Math.round(w * frac);
      s.rect(x, y, fw, 4, c); s.rect(x, y + 3, fw, 1, d); s.rect(x, y, fw, 1, l);
    }
    statusBadge(s, x, y, st) {
      const col = { PSN: '#a040a0', BRN: '#e05030', FRZ: '#58b8e8', PAR: '#d8b020', SLP: '#8a8aa0' }[st];
      s.rect(x, y - 1, 20, 7, P.outline); s.rect(x + 1, y, 18, 5, hex(col));
      G.font.drawSmall(s, st === 'PAR' ? 'PAR' : st, x + 2, y, P.white);
    }
    drawTextArea(s) {
      // base panel
      const y = 132;
      const T = G.ui.THEMES.dark;
      s.rect(0, y, 320, 48, hex('#2a2c44'));
      for (let i = 0; i < 320; i++) { s.pset(i, y, P.outline); s.pset(i, y + 1, hex('#8a8ec8')); s.pset(i, y + 2, hex('#50548a')); }
      // message box
      const bw = this.menu && this.menu.kind === 'action' ? 180 : 314;
      G.ui.frame(s, 3, y + 4, bw, 42, 'red', hex('#3c4a78'));
      if (this.box) {
        const lines = this.box.lines; let left = this.box.chars, ly = y + 12;
        for (const ln of lines) { F.draw(s, ln.slice(0, Math.max(0, left)), 14, ly, P.white, hex('#5a5a7a')); left -= ln.length + 1; ly += 15; }
        if (this.box.waiting && Math.floor(this.t / 16) % 2 === 0) F.draw(s, '▼', bw - 12, y + 34, hex('#f8d048'));
      }
      if (this.menu) this.menu.draw(s, this);
    }
    drawStatsBox(s) {
      const b = this.statsBox, x = 206, y = 20, w = 108, h = 88;
      G.ui.frame(s, x, y, w, h);
      const names = [['maxhp', 'MAX. HP'], ['atk', 'ATTACK'], ['def', 'DEFENSE'], ['spd', 'SPEED'], ['spc', 'SPECIAL']];
      names.forEach(([k, n], i) => {
        G.ui.text(s, n, x + 10, y + 8 + i * 15);
        const v = b.phase === 0 ? '+' + (b.m[k] - b.old[k]) : String(b.m[k]);
        G.ui.text(s, v, x + w - 10 - F.measure(v), y + 8 + i * 15);
      });
    }

    // ---------------- UI protocol ----------------
    *msg(text, opts) {
      opts = opts || {};
      const pages = [];
      for (const chunk of String(G.fmt ? G.fmt(text) : text).split('\f')) {
        const lines = F.wrap(chunk, 286);
        for (let i = 0; i < lines.length; i += 2) pages.push(lines.slice(i, i + 2));
      }
      for (let pi = 0; pi < pages.length; pi++) {
        this.box = { lines: pages[pi], chars: 0, waiting: false };
        const total = pages[pi].join('\n').length;
        while (this.box.chars < total) { this.box.chars += (G.input.down.a || G.input.down.b) ? 4 : 2; yield; }
        if (opts.auto && pi === pages.length - 1) { for (let i = 0; i < (opts.auto === true ? 40 : opts.auto); i++) yield; break; }
        this.box.waiting = true;
        let t = 0;
        while (!(G.input.pressed.a || G.input.pressed.b)) { yield; t++; if (G.autoBattleText && t > 30) break; }
        if (G.sfx) G.sfx('blip');
        this.box.waiting = false;
      }
    }
    *intro(b) {
      this.b = b;
      const ow = G.ow;
      this.disp.p = b.mon(b.p).hp; this.disp.e = b.mon(b.e).hp;
      this.playerPic = G.trainerBackPic();
      if (!b.wild) this.trainerPic = b.trainer.pic || G.trainerPic(b.trainer.cls, b.trainer);
      // slide in platforms, trainer/enemy
      this.platformSlide = 0; this.playerPicX = 84 + 320; this.show.e = b.wild;
      if (!b.wild) this.trainerX = E_POS.x - 320;
      this.tint.e = b.wild ? [P.black, 0.7] : null;
      for (let i = 1; i <= 40; i++) {
        const t = 1 - Math.pow(1 - i / 40, 2);
        this.platformSlide = t; this.playerPicX = 84 + 320 * (1 - t);
        if (!b.wild) this.trainerX = E_POS.x - 320 * (1 - t);
        yield;
      }
      this.platformSlide = 1;
      if (b.wild) {
        for (let i = 10; i >= 0; i--) { this.tint.e = [P.black, i / 14]; yield; }
        this.tint.e = null;
        if (G.cry) G.cry(b.mon(b.e).species);
        yield* this.shinyBounce('e');
        this.boxes.e = true;
        G.dexSeen && G.dexSeen(b.mon(b.e).species);
        yield* this.msg('Wild ' + b.mon(b.e).name + ' appeared!');
      } else {
        yield* this.msg((b.trainer.displayName) + ' wants to fight!');
        // trainer slides off, sends out
        for (let i = 0; i < 20; i++) { this.trainerX += 7; yield; }
        this.trainerX = null;
        yield* this.msg((b.trainer.displayName) + ' sent out ' + b.mon(b.e).name + '!', { auto: 16 });
        yield* this.ballOpen('e');
        this.boxes.e = true;
        G.dexSeen && G.dexSeen(b.mon(b.e).species);
      }
      // player throws ball
      yield* this.msg('Go! ' + b.mon(b.p).name + '!', { auto: 10 });
      for (let i = 0; i < 18; i++) { this.playerPicX -= 9; yield; }
      this.playerPicX = null;
      yield* this.ballOpen('p');
      this.boxes.p = true;
    }
    *shinyBounce(k) { for (let i = 0; i < 12; i++) { this.offs[k].y = -Math.round(Math.sin(i / 12 * Math.PI) * 4); yield; } this.offs[k].y = 0; }
    *ballOpen(k) {
      const base = k === 'e' ? E_POS : P_POS;
      const tx = base.x, ty = base.y - 24;
      // ball arc
      const sx = k === 'e' ? tx + 40 : 40, sy = k === 'e' ? 20 : 120;
      if (G.sfx) G.sfx('ballthrow');
      for (let i = 0; i <= 16; i++) {
        const t = i / 16, x = sx + (tx - sx) * t, y = sy + (ty - sy) * t - Math.sin(t * Math.PI) * 26;
        this.overlay = (s) => G.drawBall(s, x, y, 'POKE_BALL', i);
        yield;
      }
      this.overlay = null;
      if (G.sfx) G.sfx('ballpop');
      G.vfx && G.vfx.burst(this, tx, ty, 'release');
      this.show[k] = true; this.scale[k] = 0.1; this.tint[k] = [P.white, 1];
      for (let i = 1; i <= 12; i++) { this.scale[k] = i / 12; this.tint[k] = [hex('#ffd0f0'), 1 - i / 14]; yield; }
      this.scale[k] = 1; this.tint[k] = null;
      if (G.cry) G.cry(this.mon(k).species);
      yield* this.shinyBounce(k);
    }
    *chooseAction(b) {
      const m = b.mon(b.p);
      const items = b.safari ? ['BALL×' + (G.state.safariBalls || 0), 'BAIT', 'ROCK', 'RUN'] : ['FIGHT', 'PKMN', 'ITEM', 'RUN'];
      for (;;) {
        this.box = { lines: F.wrap('What will ' + m.name + ' do?', 150), chars: 999, waiting: false };
        const act = yield* this.gridMenu(items, this.lastAction || 0);
        if (act < 0) continue;
        this.lastAction = act;
        if (b.safari) return { type: 'safari', what: ['ball', 'bait', 'rock', 'run'][act] };
        if (act === 0) {
          const slot = yield* this.moveMenu(b);
          if (slot < 0) continue;
          return { type: 'fight', slot };
        }
        if (act === 1) {
          const idx = yield* this.partyMenu(false);
          if (idx < 0) continue;
          return { type: 'switch', index: idx };
        }
        if (act === 2) {
          if (b.o.noItems) { yield* this.msg("Items can't be used in this battle!"); continue; }
          const r = yield* G.bagMenuBattle(this);
          if (!r) continue;
          return { type: 'item', item: r.item, target: r.target };
        }
        if (act === 3) return { type: 'run' };
      }
    }
    *gridMenu(items, sel) {
      const self = this;
      const menu = this.menu = {
        kind: 'action', sel: sel || 0, done: false, result: -1,
        draw(s) {
          const x = 186, y = 136, w = 130, h = 42;
          G.ui.frame(s, x, y, w, h);
          items.forEach((it, i) => {
            const cx = x + 18 + (i % 2) * 58, cy = y + 8 + Math.floor(i / 2) * 15;
            G.ui.text(s, it, cx, cy);
            if (i === menu.sel) G.ui.cursor(s, cx - 10, cy, self.t);
          });
        },
      };
      for (;;) {
        yield;
        const I = G.input, Pt = G.pointer;
        if (Pt && (Pt.moved || Pt.pressed) && Pt.inside) { // hover/tap a cell; the click arrives as A
          const i = items.findIndex((_, k) => Pt.in(186 + 8 + (k % 2) * 58, 136 + 6 + Math.floor(k / 2) * 15, 58, 15));
          if (i >= 0) menu.sel = i; else if (Pt.pressed) Pt.consume();
        }
        if (I.pressed.left || I.pressed.right) { menu.sel ^= 1; if (G.sfx) G.sfx('cursor'); }
        if (I.pressed.up || I.pressed.down) { menu.sel ^= 2; if (G.sfx) G.sfx('cursor'); }
        if (I.pressed.a) { if (G.sfx) G.sfx('select'); this.menu = null; return menu.sel; }
        if (I.pressed.b) { menu.sel = 3; }
      }
    }
    *moveMenu(b) {
      const moves = b.moveList(b.p);
      const self = this;
      const menu = this.menu = {
        kind: 'moves', sel: Math.min(this.lastMove || 0, moves.length - 1),
        draw(s) {
          G.ui.frame(s, 3, 136, 214, 42, 'gray');
          moves.forEach((mv, i) => {
            const cx = 20 + (i % 2) * 100, cy = 144 + Math.floor(i / 2) * 15;
            G.ui.text(s, G.moveName(mv.id), cx, cy);
            if (i === menu.swap && i !== menu.sel) F.draw(s, '▶', cx - 10, cy, hex('#9890b8')); // the move picked to swap
            if (i === menu.sel) G.ui.cursor(s, cx - 10, cy, self.t);
          });
          const mv = moves[menu.sel], md = G.DATA.moves[mv.id];
          G.ui.frame(s, 220, 136, 96, 42, 'gray');
          G.ui.text(s, 'PP', 230, 144);
          const pp = mv.pp + '/' + mv.max;
          G.ui.text(s, pp, 306 - F.measure(pp), 144, mv.pp === 0 ? hex('#d04040') : undefined);
          const tc = hex(TYPE_COL[md.type] || '#888');
          s.rect(229, 158, 78, 12, P.outline); s.rect(230, 159, 76, 10, tc);
          const tn = G.typeName(md.type);
          F.draw(s, tn, 268 - F.measure(tn) / 2, 160, P.white, G.gfx.shade(tc, -0.4));
        },
      };
      for (;;) {
        yield;
        const I = G.input, n = moves.length, Pt = G.pointer;
        if (Pt && (Pt.moved || Pt.pressed) && Pt.inside) {
          const i = moves.findIndex((_, k) => Pt.in(10 + (k % 2) * 100, 142 + Math.floor(k / 2) * 15, 100, 15));
          if (i >= 0) menu.sel = i; else if (Pt.pressed) Pt.consume();
        }
        if (I.pressed.left && menu.sel % 2 === 1) menu.sel--;
        if (I.pressed.right && menu.sel % 2 === 0 && menu.sel + 1 < n) menu.sel++;
        if (I.pressed.up && menu.sel >= 2) menu.sel -= 2;
        if (I.pressed.down && menu.sel + 2 < n) menu.sel += 2;
        // SELECT: pick a move, then SELECT another to swap their places (not in link battles, where both games keep
        // the same move order)
        if (I.pressed.select && n > 1 && !b.o.pvp) {
          if (menu.swap === undefined || menu.swap === null) menu.swap = menu.sel;
          else {
            const a = menu.swap, c = menu.sel; menu.swap = null;
            if (a !== c) {
              [moves[a], moves[c]] = [moves[c], moves[a]];
              const mim = b.p.v.mimic; if (mim) mim.slot = mim.slot === a ? c : mim.slot === c ? a : mim.slot;
            }
          }
          if (G.sfx) G.sfx('select');
        }
        if (I.pressed.a) { this.menu = null; this.lastMove = menu.sel; if (G.sfx) G.sfx('select'); return menu.sel; }
        if (I.pressed.b) { if (menu.swap !== undefined && menu.swap !== null) { menu.swap = null; continue; } this.menu = null; return -1; }
      }
    }
    *chooseMove(ids, prompt) {
      this.box = { lines: [prompt], chars: 999 };
      const r = yield* G.engine.run(new G.ui.Menu(ids.map(G.moveName), { x: 180, y: 60 }));
      return r >= 0 ? ids[r] : null;
    }
    *askYesNo(q) {
      this.box = { lines: F.wrap(q, 200), chars: 0 };
      while (this.box.chars < q.length) { this.box.chars += 2; yield; }
      const r = yield* G.engine.run(new G.ui.Menu(['YES', 'NO'], { x: 262, y: 88, w: 52 }));
      return r === 0;
    }
    *partyMenu(forced) {
      const r = yield* G.partyScreen({ battle: true, forced, activeIdx: this.b.p.idx });
      return r;
    }
    *refresh() { yield; }
    *syncHp(side) {
      const k = this.key(side), m = this.mon(k);
      const target = m.hp;
      const step = Math.max(0.25, m.maxhp / 48);
      while (Math.abs(this.disp[k] - target) > 0.01) {
        if (this.disp[k] > target) this.disp[k] = Math.max(target, this.disp[k] - step);
        else this.disp[k] = Math.min(target, this.disp[k] + step);
        yield;
      }
      this.disp[k] = target;
      if (k === 'p' && m.hp > 0 && m.hp < m.maxhp / 5 && G.sfx) G.sfx('lowhp');
    }
    *hitFlash(side, eff) {
      const k = this.key(side);
      if (G.sfx) G.sfx(eff > 1 ? 'hit_super' : eff < 1 && eff > 0 ? 'hit_weak' : 'hit');
      if (eff > 1) this.shake = 5;
      for (let i = 0; i < 16; i++) { this.vis[k] = (Math.floor(i / 2) % 2) ? 0 : 1; this.offs[k].x = (i < 8 ? (i % 2 ? 2 : -2) : 0); yield; }
      this.vis[k] = 1; this.offs[k].x = 0;
    }
    *faint(side) {
      const k = this.key(side);
      if (G.cry) G.cry(this.mon(k).species, 'faint');
      for (let i = 0; i < 20; i++) { this.clip[k] = 1 - i / 20; this.offs[k].y = i * 1.2; yield; }
      this.show[k] = false; this.clip[k] = 1; this.offs[k].y = 0;
      if (k === 'p') this.boxes.p = false; else this.boxes.e = false;
    }
    *withdraw(side) {
      const k = this.key(side);
      yield* this.msg(k === 'p' ? this.mon(k).name + ', come back!' : '', { auto: 8 });
      for (let i = 12; i >= 0; i--) { this.scale[k] = i / 12; this.tint[k] = [hex('#ff8080'), 1 - i / 12]; yield; }
      this.show[k] = false; this.scale[k] = 1; this.tint[k] = null; this.boxes[k] = false;
    }
    *sendOut(side) {
      const k = this.key(side);
      this.disp[k] = this.mon(k).hp; this.subs[k] = false; this.transformed[k] = null; this.hidden[k] = false;
      if (k === 'p') yield* this.msg('Go! ' + this.mon(k).name + '!', { auto: 10 });
      yield* this.ballOpen(k);
      this.boxes[k] = true;
    }
    *expBar(m, from, to) {
      this.expDisp = from;
      const lo = m.expThis(), hi = m.expToNext(), step = Math.max(1, (hi - lo) / 60);
      if (G.sfx) G.sfx('exp');
      while (this.expDisp < to) { this.expDisp = Math.min(to, this.expDisp + step); yield; }
      this.expDisp = null;
    }
    *levelStats(m, old) {
      this.statsBox = { m, old, phase: 0 };
      yield* this.waitA();
      this.statsBox.phase = 1;
      yield* this.waitA();
      this.statsBox = null;
      if (this.b && m === this.mon('p')) this.disp.p = m.hp;
    }
    *waitA() { yield; while (!(G.input.pressed.a || G.input.pressed.b)) yield; }
    *statusAnim(side, st) { if (G.vfx) yield* G.vfx.status(this, this.key(side), st); }
    *statAnim(side, up) { if (G.vfx) yield* G.vfx.stat(this, this.key(side), up); }
    *anim(move, side, hit) { if (G.vfx && G.state.options.battleAnim !== false) yield* G.vfx.move(this, move, this.key(side), hit || 0); else yield* G.engine.wait(8); }
    *hide(side, h) { this.hidden[this.key(side)] = h; yield; }
    *substitute(side, on) { const k = this.key(side); for (let i = 0; i < 8; i++) { this.vis[k] = 1 - i / 8; yield; } this.subs[k] = on; for (let i = 0; i < 8; i++) { this.vis[k] = i / 8; yield; } this.vis[k] = 1; }
    *transform(side, sp) { const k = this.key(side); for (let i = 0; i < 16; i++) { this.tint[k] = [P.white, i / 16]; yield; } this.transformed[k] = sp; for (let i = 16; i >= 0; i--) { this.tint[k] = [P.white, i / 16]; yield; } this.tint[k] = null; }
    *flee(side) { const k = this.key(side); for (let i = 0; i < 16; i++) { this.offs[k].x += k === 'e' ? 6 : -6; yield; } this.show[k] = false; this.offs[k].x = 0; }
    *trainerSays(text) { if (text) yield* this.msg(text); }
    *dexEntry(sp) { if (G.dexPage) yield* G.dexPage(sp, true); }
    *trainerDefeated(b) {
      if (G.music) G.music(G.victorySong ? G.victorySong(b.trainer && b.trainer.cls) : 'victory');
      this.trainerX = E_POS.x + 120;
      for (let i = 0; i < 24; i++) { this.trainerX -= 5; yield; }
      this.trainerX = E_POS.x;
      yield* this.msg(G.state.name + ' defeated ' + b.trainer.displayName + '!');
      if (b.trainer.winText) yield* this.msg(b.trainer.winText);
      const lastLv = b.e.party[b.e.party.length - 1].level;
      const money = Math.floor((b.trainer.money || 0) / 100) * lastLv; // pokered base money is per-100
      if (money > 0) { G.state.money += money; yield* this.msg(G.state.name + ' got $' + money + ' for winning!'); }
    }
    *ballThrow(item, shakes, caught) {
      const tx = E_POS.x, ty = E_POS.y - 26;
      if (G.sfx) G.sfx('ballthrow');
      for (let i = 0; i <= 18; i++) {
        const t = i / 18, x = 60 + (tx - 60) * t, y = 110 + (ty - 110) * t - Math.sin(t * Math.PI) * 50;
        this.overlay = s => G.drawBall(s, x, y, item, i);
        yield;
      }
      // suck in
      if (G.sfx) G.sfx('ballpop');
      G.vfx && G.vfx.burst(this, tx, ty + 6, 'capture');
      for (let i = 0; i <= 12; i++) { this.scale.e = 1 - i / 12; this.tint.e = [hex('#ff90d0'), i / 12]; yield; }
      this.show.e = false; this.scale.e = 1; this.tint.e = null;
      // drop to ground
      let y = ty; const gy = E_POS.y - 4;
      for (let i = 0; i < 12; i++) { y = ty + (gy - ty) * (i / 11); this.overlay = s => G.drawBall(s, tx, y, item, 0); yield; }
      for (let b = 0; b < 2; b++) { for (let i = 0; i < 8; i++) { const yy = gy - Math.sin(i / 7 * Math.PI) * (6 - b * 3); this.overlay = s => G.drawBall(s, tx, yy, item, 0); yield; } }
      yield* G.engine.wait(20);
      for (let k = 0; k < Math.min(3, shakes); k++) {
        for (let i = 0; i < 16; i++) { const a = Math.sin(i / 16 * Math.PI * 2) * 3; this.overlay = s => G.drawBall(s, tx + a, gy, item, 0, a); yield; }
        if (G.sfx) G.sfx('shake');
        yield* G.engine.wait(24);
      }
      if (caught) {
        this.overlay = s => { G.drawBall(s, tx, gy, item, 0); if (this.t % 10 < 5) G.vfx && G.vfx.sparkle(s, tx, gy - 8); };
        if (G.sfx) G.sfx('caught');
        yield* G.engine.wait(40);
        this.overlay = s => G.drawBall(s, tx, gy, item, 0);
      } else {
        this.overlay = null;
        G.vfx && G.vfx.burst(this, tx, gy - 6, 'release');
        this.show.e = true;
        for (let i = 0; i <= 10; i++) { this.scale.e = i / 10; yield; }
        this.scale.e = 1;
      }
    }
  }

  // Poké Ball sprite drawn procedurally (with spin frames)
  G.drawBall = function (s, x, y, item, frame, tilt) {
    x = Math.round(x); y = Math.round(y);
    const top = { POKE_BALL: '#e04848', GREAT_BALL: '#4878e0', ULTRA_BALL: '#383838', MASTER_BALL: '#8048c0', SAFARI_BALL: '#6a9a3a' }[item] || '#e04848';
    const tc = hex(top), tl = G.gfx.shade(tc, 0.35), td = G.gfx.shade(tc, -0.3);
    const ang = (frame || 0) * 0.6 + (tilt || 0) * 0.2;
    for (let j = -5; j <= 5; j++) for (let i = -5; i <= 5; i++) {
      const d = i * i + j * j; if (d > 26) continue;
      const rx = i * Math.cos(ang) + j * Math.sin(ang), ry = -i * Math.sin(ang) + j * Math.cos(ang);
      let c = ry < -0.5 ? (rx < -1 && ry < -2 ? tl : tc) : P.white;
      if (ry >= 0 && rx > 1.5) c = hex('#d0d0dc');
      if (ry < -0.5 && rx > 1.5) c = td;
      if (Math.abs(ry) < 0.8 || d > 20) c = P.outline;
      if (rx * rx + ry * ry < 3.2) c = rx * rx + ry * ry < 1.2 ? P.white : P.outline;
      if (item === 'ULTRA_BALL' && ry < -0.5 && Math.abs(rx) < 1.2 && ry < -2) c = hex('#f0d040');
      s.pset(x + i, y + j, c);
    }
  };

  G.BattleScene = BattleScene; G.E_POS = E_POS; G.P_POS = P_POS;
})(window.G);
