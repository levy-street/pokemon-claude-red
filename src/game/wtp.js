// WHO'S THAT POKéMON? — quiz minigame in the style of the anime's eyecatch: name the silhouette before time runs out,
// then the flash reveal. DAILY (the same 10 for everyone each day, Wordle-style share) and ENDLESS (streak) modes.
// Playable from the title screen, the SOCIAL ZONE quiz host, or a link: ?wtp=daily / ?wtp=endless.
(function (G) {
  'use strict';
  const { Surface, hex, mix, shade, bayer } = G.gfx;
  const F = G.font;
  const STORE = 'claudered_wtp', ROUNDS = 10, TIME = 600, EPOCH = new Date(2026, 8, 25);
  const load = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch (e) { return {}; } };
  const save = v => { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch (e) {} };
  const all = () => Object.keys(G.DATA.species).filter(sp => G.DATA.species[sp].dex >= 1 && G.DATA.species[sp].dex <= 151);
  const nameOf = sp => G.speciesName(sp);
  const dayNumber = d => Math.floor((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - EPOCH) / 86400000) + 1;
  function rng(seed) { let x = (seed >>> 0) || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
  function pickDistinct(r, list, n, avoid) {
    const out = [];
    while (out.length < n) { const sp = list[Math.floor(r() * list.length)]; if (!out.includes(sp) && !(avoid || []).includes(sp)) out.push(sp); }
    return out;
  }
  // three wrong answers, half of them sharing a type with the answer so it isn't too easy
  function choicesFor(sp, r) {
    const pool = all().filter(x => x !== sp), t = G.DATA.species[sp].types;
    const kin = pool.filter(x => G.DATA.species[x].types.some(y => t.includes(y)));
    const wrong = [];
    while (wrong.length < 3) {
      const src = kin.length > 3 && r() < 0.5 ? kin : pool, x = src[Math.floor(r() * src.length)];
      if (!wrong.includes(x)) wrong.push(x);
    }
    const opts = wrong.concat([sp]);
    for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
    return opts;
  }

  // ---------------- art ----------------
  const RAY_A = hex('#3a7ef0'), RAY_B = hex('#2a5ed0'), GLOW = hex('#9ad8ff');
  function burst(s, cx, cy, t, x0, x1) {
    const rot = t * 0.004;
    for (let y = 0; y < 180; y++) for (let x = x0 || 0; x < (x1 || 320); x++) {
      const a = Math.atan2(y - cy, x - cx) + rot, r = Math.hypot(x - cx, (y - cy) * 1.1);
      let c = (Math.floor((a + Math.PI * 4) / (Math.PI / 9)) % 2) ? RAY_A : RAY_B;
      if (r < 78) c = mix(c, GLOW, Math.floor((1 - r / 78) * 4 + bayer(x, y)) / 5);
      const v = Math.max(Math.abs(x - 160) / 160, Math.abs(y - 90) / 90);
      if (v > 0.8) c = mix(c, hex('#0c1a50'), Math.floor((v - 0.8) * 5 * 3 + bayer(x, y)) / 4);
      s.data[y * 320 + x] = c;
    }
  }
  const silCache = {};
  function silhouette(sp) {
    if (silCache[sp]) return silCache[sp];
    const src = G.pokeSprite(sp, 'front', 128), o = new Surface(src.w + 2, src.h + 2);
    const on = (x, y) => x >= 0 && y >= 0 && x < src.w && y < src.h && (src.data[y * src.w + x] >>> 24);
    for (let y = -1; y <= src.h; y++) for (let x = -1; x <= src.w; x++) {
      if (on(x, y)) o.pset(x + 1, y + 1, hex(y < src.h * 0.25 ? '#1c2658' : '#141c44'));
      else if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) o.pset(x + 1, y + 1, hex('#d8f0ff'));
    }
    return (silCache[sp] = o);
  }
  function title(s, cx, y, scale) {
    G.logoText(s, "WHO'S THAT", cx, y, scale, '#fff27a', '#f5b822', '#2a50c8', '#0a1a60');
    G.logoText(s, 'POKéMON?', cx, y + 11 * scale + 4, scale, '#fff27a', '#f5b822', '#2a50c8', '#0a1a60');
  }
  function button(s, x, y, w, h, label, state) { // state: 0 idle, 1 hover, 2 right, 3 wrong, 4 dim
    const fill = ['#f8f8f0', '#ffe070', '#78e090', '#f07070', '#9aa8d8'][state], edge = state === 1 ? '#c86018' : '#1a2a78';
    s.rect(x + 1, y, w - 2, h, hex(edge)); s.rect(x, y + 1, w, h - 2, hex(edge));
    s.rect(x + 1, y + 1, w - 2, h - 2, hex(fill)); s.rect(x + 2, y + 1, w - 4, 1, shade(hex(fill), 0.3));
    s.rect(x + 1, y + h - 3, w - 2, 1, shade(hex(fill), -0.15));
    F.draw(s, label, x + (w >> 1) - (F.measure(label) >> 1), y + (h >> 1) - 6, hex('#1a1a38'));
  }
  // pixel squares for the result row (green right / red wrong / grey to come)
  function squares(s, x, y, res, total, size) {
    for (let i = 0; i < total; i++) {
      const c = res[i] === undefined ? '#6a7098' : res[i] ? '#58c870' : '#e05858', xx = x + i * (size + 2);
      s.rect(xx, y, size, size, hex('#10183a')); s.rect(xx + 1, y + 1, size - 2, size - 2, hex(c)); s.rect(xx + 1, y + 1, size - 2, 1, shade(hex(c), 0.35));
    }
  }

  // ---------------- the quiz ----------------
  class Quiz {
    constructor(mode) {
      this.opaque = true; this.mode = mode; this.t = 0; this.done = false; this.store = load();
      this.day = dayNumber(new Date());
      const seed = mode === 'daily' ? this.day * 7919 + 17 : (Date.now() & 0x7fffffff);
      this.r = rng(seed);
      this.list = mode === 'daily' ? pickDistinct(this.r, all(), ROUNDS) : [];
      this.results = []; this.streak = 0; this.i = 0; this.btns = []; this.hover = -1;
      this.next();
    }
    next() {
      this.sp = this.mode === 'daily' ? this.list[this.i] : pickDistinct(this.r, all(), 1, this.recent || [])[0];
      this.recent = (this.recent || []).concat([this.sp]).slice(-40);
      this.opts = choicesFor(this.sp, this.r);
      this.phase = 'intro'; this.pt = 0; this.pick = -1; this.sel = -1;
      G.music && G.music(this.mode === 'daily' ? 'GameCorner' : 'MeetRival');
    }
    answer(k) {
      if (this.phase !== 'question') return;
      this.pick = k; const right = k >= 0 && this.opts[k] === this.sp;
      this.results.push(right); if (right) this.streak++;
      this.phase = 'flash'; this.pt = 0;
      G.sfx && G.sfx(right ? 'get_item' : 'bump');
    }
    update(f) {
      this.t++; this.pt++;
      if (!f) return;
      const I = G.input.pressed, Pt = G.pointer;
      let clicked = -1;
      if (Pt && (Pt.moved || Pt.pressed) && Pt.inside) {
        this.hover = this.btns.findIndex(b => Pt.in(...b));
        if (Pt.pressed) { Pt.consume(); clicked = this.hover; if (clicked < 0) clicked = -2; }
      }
      if (I.b && this.phase !== 'results') { this.exit(); return; }
      if (this.phase === 'intro') { if (this.pt > 24) { this.phase = 'question'; this.pt = 0; this.sel = 0; } return; }
      if (this.phase === 'question') {
        if (this.hover >= 0) this.sel = this.hover;
        if (I.up) this.sel = (this.sel + 3) % 4; if (I.down) this.sel = (this.sel + 1) % 4;
        if (I.left || I.right) this.sel ^= 1;
        if (clicked >= 0) this.answer(clicked); else if (I.a || I.start) this.answer(this.sel);
        else if (this.pt >= TIME) this.answer(-1);
        return;
      }
      if (this.phase === 'flash') { if (this.pt > 10) { this.phase = 'reveal'; this.pt = 0; G.cry && G.cry(this.sp); } return; }
      if (this.phase === 'reveal') {
        if (this.pt > 150 || (this.pt > 24 && (I.a || I.start || clicked !== -1))) {
          const lost = this.mode === 'endless' && !this.results[this.results.length - 1];
          this.i++;
          if (lost || (this.mode === 'daily' && this.i >= ROUNDS)) this.finish(); else this.next();
        }
        return;
      }
      if (this.phase === 'results') {
        if (this.hover >= 0) this.sel = this.hover;
        if (I.left || I.up) this.sel = (this.sel + this.menu.length - 1) % this.menu.length;
        if (I.right || I.down) this.sel = (this.sel + 1) % this.menu.length;
        if (I.b) { this.exit(); return; }
        const k = clicked >= 0 ? clicked : (I.a || I.start) ? this.sel : -1;
        if (k >= 0) this.act(this.menu[k]);
      }
    }
    finish() {
      const st = this.store;
      st.played = (st.played || 0) + 1;
      if (this.mode === 'daily') { st.daily = st.daily || {}; if (!st.daily[this.day]) st.daily[this.day] = this.results.map(Number).join(''); }
      else { this.best = st.best || 0; st.best = Math.max(st.best || 0, this.streak); this.newBest = this.streak > this.best && this.streak > 0; }
      save(st);
      this.phase = 'results'; this.pt = 0; this.sel = 0; this.msg = ''; this.msgT = 0;
      G.track && G.track('quiz', { mode: this.mode, score: this.score(), day: this.day || null });
      this.menu = ['SHARE', 'COPY LINK', 'SAVE PNG', this.mode === 'daily' ? 'ENDLESS' : 'AGAIN', 'EXIT'];
      this.card = this.shareCard();
      G.music && G.music(this.score() >= (this.mode === 'daily' ? 7 : 10) ? 'DefeatedGymLeader' : 'DefeatedTrainer');
    }
    score() { return this.mode === 'daily' ? this.results.filter(Boolean).length : this.streak; }
    link() { return G.siteBase() + '?wtp=' + this.mode; }
    shareText() {
      if (this.mode === 'daily') return "Who's That Pokémon? #" + this.day + ' — ' + this.score() + '/' + ROUNDS + '\n' + this.results.map(x => x ? '🟩' : '🟥').join('') + '\nPlay: ' + this.link();
      const n = this.streak;
      const brag = n === 0 ? "I couldn't name a single Pokémon from its silhouette. Can you?" : n === 1 ? 'I named 1 Pokémon from its silhouette before slipping up. Can you beat it?' : 'I named ' + n + ' Pokémon in a row from their silhouettes! Can you beat it?';
      return "Who's That Pokémon? " + brag + '\n' + this.link();
    }
    act(what) {
      if (what === 'EXIT') { this.exit(); return; }
      if (what === 'ENDLESS' || what === 'AGAIN') { this.replace = 'endless'; this.exit(); return; }
      const how = { SHARE: 'share', 'COPY LINK': 'link', 'SAVE PNG': 'save' }[what];
      this.msg = 'WORKING...'; this.msgT = 600;
      const name = 'whos-that-pokemon-' + (this.mode === 'daily' ? 'daily-' + this.day : 'streak-' + this.streak) + '.png';
      const text = how === 'link' ? this.link() : this.shareText();
      G.shareImage(this.card, text, name, how, this.link()).then(m => { this.msg = m === 'unsupported' ? 'NOT AVAILABLE HERE' : m; this.msgT = 150; }, () => { this.msg = 'SHARE FAILED'; this.msgT = 150; });
    }
    exit() { this.done = true; }
    // the share card: split silhouette / reveal, score and result squares
    shareCard() {
      const s = new Surface(320, 180);
      burst(s, 96, 90, 40);
      const sp = this.sp, sil = silhouette(sp), col = G.pokeSprite(sp, 'front', 128);
      const x0 = 96 - (col.w >> 1), y0 = 150 - col.h;
      s.ellipse(96, 152, 44, 7, hex('#1a3a98'));
      s.blit(sil, x0 - 1, y0 - 1);
      for (let y = 0; y < col.h; y++) for (let x = col.w >> 1; x < col.w; x++) { const c = col.data[y * col.w + x]; if (c >>> 24) s.pset(x0 + x, y0 + y, c); }
      for (let y = y0 - 6; y < 158; y++) if ((y >> 1) % 2) s.pset(96, y, hex('#ffffff'));
      title(s, 240, 8, 2);
      const big = this.mode === 'daily' ? this.score() + '/' + ROUNDS : this.streak + ' IN A ROW';
      const sub = this.mode === 'daily' ? 'DAILY #' + this.day : 'ENDLESS MODE';
      F.drawOutlined(s, sub, 240 - F.measure(sub) / 2, 64, hex('#ffffff'), hex('#0a1a60'));
      G.logoText(s, big, 240, 78, 2, '#ffffff', '#c8e8ff', '#2a50c8', '#0a1a60');
      if (this.mode === 'daily') squares(s, 240 - (ROUNDS * 12 - 2) / 2, 110, this.results, ROUNDS, 10);
      else F.drawOutlined(s, "IT'S " + nameOf(sp) + '!', 240 - F.measure("IT'S " + nameOf(sp) + '!') / 2, 112, hex('#fff27a'), hex('#0a1a60'));
      const ask = 'CAN YOU NAME THEM ALL?';
      F.drawOutlined(s, ask, 240 - F.measure(ask) / 2, 132, hex('#ffffff'), hex('#0a1a60'));
      s.rect(0, 164, 320, 16, hex('#0a1440'));
      F.drawSmall(s, 'POKEMON - CLAUDE RED', 6, 170, hex('#9ab8f0'));
      const url = (G.siteBase().replace(/^https?:\/\//, '').replace(/\/(index\.html)?$/, '') || 'levystreet.com');
      F.draw(s, url.slice(0, 34), 314 - F.measure(url.slice(0, 34)), 166, hex('#ffe070'));
      return s;
    }
    draw(s) {
      const sp = this.sp, ph = this.phase, t = this.t;
      if (ph === 'results') return this.drawResults(s);
      burst(s, 96, 92, t);
      // HUD
      const hud = this.mode === 'daily' ? 'DAILY #' + this.day + '   ' + Math.min(this.i + 1, ROUNDS) + '/' + ROUNDS : 'STREAK ' + this.streak + '   BEST ' + (this.store.best || 0);
      if (!G.hideHints) F.drawOutlined(s, hud, 6, 4, hex('#ffffff'), hex('#0a1a60'));
      if (this.mode === 'daily') squares(s, 6, 17, this.results, ROUNDS, 6);
      // the POKéMON: slides in, bobs; silhouette until the flash
      const img = ph === 'reveal' ? G.pokeSprite(sp, 'front', 128) : silhouette(sp);
      const slide = ph === 'intro' ? Math.round((1 - this.pt / 24) * -160) : 0;
      const bob = Math.round(Math.sin(t / 18) * 2), x = 96 - (img.w >> 1) + slide, y = 154 - img.h + bob;
      s.ellipse(96 + slide, 156, 46, 7, hex('#1a3a98'));
      s.blit(img, x, y);
      if (ph === 'reveal' && this.pt < 16) for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2, r = 20 + this.pt * 4; s.pset(96 + Math.cos(a) * r, 92 + Math.sin(a) * r * 0.8, hex('#ffffff')); }
      // right column: title, choices, timer / the answer
      title(s, 240, 6, 2);
      this.btns = [];
      if (ph === 'question' || ph === 'intro' || ph === 'flash') {
        const left = ph === 'question' ? 1 - this.pt / TIME : 1;
        s.rect(174, 60, 132, 5, hex('#0a1a60'));
        s.rect(175, 61, Math.round(130 * left), 3, hex(left > 0.5 ? '#78e090' : left > 0.25 ? '#ffd048' : '#f06050'));
        this.opts.forEach((o, k) => {
          const bx = 172, by = 70 + k * 23, st = ph === 'flash' ? (this.opts[k] === sp ? 2 : k === this.pick ? 3 : 4) : k === this.sel ? 1 : 0;
          button(s, bx, by, 136, 20, nameOf(o), st);
          this.btns.push([bx, by, 136, 20]);
        });
      } else if (ph === 'reveal') {
        const right = this.results[this.results.length - 1];
        F.drawOutlined(s, right ? 'CORRECT!' : this.pick < 0 ? "TIME'S UP!" : 'NOPE!', 240 - F.measure(right ? 'CORRECT!' : this.pick < 0 ? "TIME'S UP!" : 'NOPE!') / 2, 64, hex(right ? '#90f0a0' : '#ff9080'), hex('#0a1a60'));
        F.drawOutlined(s, "IT'S", 240 - F.measure("IT'S") / 2, 84, hex('#ffffff'), hex('#0a1a60'));
        const nm = nameOf(sp) + '!', sc = F.measure(nm) * 2 <= 150 ? 2 : 1;
        G.logoText(s, nm, 240, 98, sc, '#fff27a', '#f5b822', '#2a50c8', '#0a1a60');
        if (this.pt > 24 && (t >> 4) % 2) { const h = G.pointer && G.pointer.touch ? 'TAP TO CONTINUE' : 'A / CLICK TO CONTINUE'; F.drawSmall(s, h, 240 - F.measureSmall(h) / 2, 150, hex('#d8f0ff')); }
      }
      if (ph === 'flash') for (let i = 0; i < s.data.length; i++) s.data[i] = mix(s.data[i], 0xffffffff, Math.max(0, 1 - this.pt / 10));
      if (!G.hideHints) F.drawSmall(s, 'B: QUIT', 6, 172, hex('#c8e0ff'));
    }
    drawResults(s) {
      s.blit(this.card, 0, 0);
      const y = 164; s.rect(0, y, 320, 16, hex('#0a0814')); s.hline(0, 319, y, hex('#2a50c8'));
      let x = 4; this.btns = [];
      this.menu.forEach((o, i) => { const w = F.measure(o) + 10, on = i === this.sel; s.rect(x, y + 2, w, 12, on ? hex('#ffe070') : hex('#1a2a60')); F.draw(s, o, x + 5, y + 3, on ? hex('#1a1428') : hex('#d8e0ff')); this.btns.push([x, y, w, 16]); x += w + 3; });
      if (this.newBest) F.drawOutlined(s, 'NEW BEST!', 240 - F.measure('NEW BEST!') / 2, 146, hex('#90f0a0'), hex('#0a1a60'));
      if (this.msgT > 0) { this.msgT--; const w = F.measureSmall(this.msg) + 10; s.rect(316 - w, y - 12, w, 10, hex('#0a0814')); F.drawSmall(s, this.msg, 311 - w + 5, y - 10, hex('#b8f0a0')); }
    }
  }

  // mode menu (title screen / social zone), then the quiz; ENDLESS/AGAIN chain into another round
  G.whosThatPokemon = function* (mode) {
    let m = mode;
    for (;;) {
      if (!m) {
        const st = load(), today = dayNumber(new Date()), done = st.daily && st.daily[today];
        const items = [done ? 'DAILY #' + today + ' (' + done.split('').filter(c => c === '1').length + '/10)' : 'DAILY #' + today, 'ENDLESS (BEST ' + (st.best || 0) + ')', 'BACK'];
        const r = yield* G.choose(items, { x: 6, y: 6, w: 170 });
        if (r < 0 || r === 2) return;
        m = r === 0 ? 'daily' : 'endless';
      }
      const q = new Quiz(m);
      yield* G.engine.run(q);
      if (!q.replace) return;
      m = q.replace;
    }
  };
  G.WTPQuiz = Quiz;
})(window.G);
