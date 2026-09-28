// Start menu, Pokédex, trainer card, options, save/load and the naming keyboard.
(function (G) {
  'use strict';
  const { hex, shade, mix } = G.gfx;
  const P = G.PAL, F = G.font;
  const INK = hex('#3a3a4c');

  // ---------------- save / load ----------------
  const SAVE_KEY = 'pkmn_pixel_red_save';
  // the PC's boxes as a list with no gaps: CHANGE BOX used to jump straight to, say, BOX 5, leaving empty slots that
  // crashed every new POKéMON registration and saved as nulls the game couldn't load back (repaired here on load too)
  G.fixBoxes = function (S) {
    S.box = Math.max(0, Math.min(11, S.box | 0));
    const old = Array.isArray(S.boxes) ? S.boxes : [];
    S.boxes = Array.from({ length: Math.max(old.length, S.box + 1) }, (_, i) => Array.isArray(old[i]) ? old[i].filter(Boolean) : []);
    S.party = (S.party || []).filter(Boolean);
    return S;
  };
  G.currentBox = () => G.fixBoxes(G.state).boxes[G.state.box];
  G.saveGame = function () {
    const S = G.fixBoxes(G.state);
    const data = Object.assign({}, S, { party: S.party.map(m => m.toJSON()), boxes: S.boxes.map(b => b.map(m => m.toJSON())), savedAt: Date.now() });
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
  };
  G.loadSave = function () {
    try {
      const raw = localStorage.getItem(SAVE_KEY); if (!raw) return null;
      const d = JSON.parse(raw);
      d.party = (d.party || []).filter(Boolean).map(G.Mon.from); d.boxes = (d.boxes || [[]]).map(b => (b || []).filter(Boolean).map(G.Mon.from));
      return G.fixBoxes(Object.assign(G.newState(), d));
    } catch (e) { return null; }
  };
  G.hasSave = () => { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } };

  // ---------------- start menu ----------------
  G.openStartMenu = function () { G.spawnScript(G.startMenu(), 'startmenu'); };
  G.startMenu = function* () {
    {
      if (G.glitch) G.glitch.noteText(null); // the START menu is text box 0
      G.sfx && G.sfx('menu');
      let sel = 0;
      for (;;) {
        const items = [];
        if (G.flag('EVENT_GOT_POKEDEX')) items.push('POKéDEX');
        if (G.state.party.length) items.push('POKéMON');
        items.push('ITEM', G.state.name, 'SHARE', 'SAVE', 'OPTION', 'EXIT');
        const r = yield* G.choose(items, { x: 222, y: 6, w: 92, sel: Math.min(sel, items.length - 1) });
        if (r < 0 || items[r] === 'EXIT') return;
        sel = r;
        const it = items[r];
        if (it === 'POKéDEX') yield* G.pokedex();
        else if (it === 'POKéMON') { const res = yield* G.partyScreen({}); if (res === -2) return; }
        else if (it === 'ITEM') { yield* G.bagScreen(); if (G.closeMenus) { G.closeMenus = false; return; } }
        else if (it === G.state.name) yield* G.trainerCard();
        else if (it === 'SHARE') yield* G.shareMenu();
        else if (it === 'SAVE') {
          if (yield* G.ask('Would you like to SAVE the game?')) {
            G.saveGame(); G.sfx && G.sfx('save');
            yield* G.say(G.state.name + ' saved the game!');
            if (G.cloudAfterSave) yield* G.cloudAfterSave(); // cloud copy: offers a free account, or syncs to it (src/game/cloudsave.js)
          }
        }
        else if (it === 'OPTION') yield* G.optionsMenu();
      }
    }
  };

  // ---------------- trainer card ----------------
  const BADGES = ['BOULDERBADGE', 'CASCADEBADGE', 'THUNDERBADGE', 'RAINBOWBADGE', 'SOULBADGE', 'MARSHBADGE', 'VOLCANOBADGE', 'EARTHBADGE'];
  const LEADERS = ['BROCK', 'MISTY', 'LT.SURGE', 'ERIKA', 'KOGA', 'SABRINA', 'BLAINE', 'GIOVANNI'];
  G.BADGES = BADGES;
  function drawBadge(s, i, x, y, has) {
    const shapes = [
      ['..#..', '.###.', '#####', '#####', '.###.'], ['..#..', '.###.', '#####', '.###.', '..#..'], ['#.#.#', '.###.', '##.##', '.###.', '#.#.#'],
      ['.#.#.', '#####', '#####', '.###.', '..#..'], ['.###.', '#...#', '#.#.#', '#...#', '.###.'], ['#####', '#...#', '#.#.#', '#...#', '#####'],
      ['..#..', '.#.#.', '#.#.#', '.#.#.', '..#..'], ['.###.', '#####', '##.##', '#####', '.###.'],
    ];
    const cols = ['#a0a0a8', '#58a8f0', '#f8b830', '#78d078', '#e060a8', '#e8c848', '#f06038', '#58c098'];
    const c = has ? hex(cols[i]) : hex('#6a6a7a');
    shapes[i].forEach((r, j) => { for (let k = 0; k < 5; k++) if (r[k] === '#') { s.rect(x + k * 3, y + j * 3, 3, 3, c); if (has && j < 2) s.pset(x + k * 3, y + j * 3, shade(c, 0.4)); } });
  }
  G.drawBadge = drawBadge;
  G.trainerCard = function* () {
    const scene = { opaque: true, t: 0, done: false, update(f) { this.t++; if (f && (G.input.pressed.a || G.input.pressed.b)) this.done = true; }, draw(s) {
      G.menuBg(s, '#d8b060', '#cca050', this.t);
      G.ui.frame(s, 12, 8, 296, 164, 'red', hex('#fff8e8'));
      const S = G.state;
      G.ui.text(s, 'TRAINER CARD', 26, 18, hex('#c04040'));
      const rows = [['NAME', S.name], ['ID No.', String(S.trainerId || 0).padStart(5, '0')], ['MONEY', '$' + S.money], ['POKéDEX', Object.keys(S.dex.caught).length + ''], ['TIME', Math.floor(S.playTime / 216000) + ':' + String(Math.floor(S.playTime / 3600) % 60).padStart(2, '0')]];
      rows.forEach(([a, b], i) => { G.ui.text(s, a, 26, 38 + i * 15, hex('#8a7a60')); G.ui.text(s, b, 180 - F.measure(b), 38 + i * 15); });
      const pic = G.castPortrait ? G.castPortrait('red') : G.trainerPicPx ? G.trainerPicPx(G.CAST.red) : G.scale3x(G.chars.makeCharacter(G.CAST.red).down[0]);
      s.blit(pic, 238 - (pic.w >> 1), 104 - pic.h);
      G.ui.frame(s, 20, 118, 280, 48, 'gray');
      BADGES.forEach((b, i) => { const x = 34 + i * 33; drawBadge(s, i, x, 130, S.badges.includes(b)); F.drawSmall(s, String(i + 1), x + 6, 150, INK); });
    } };
    yield* G.engine.run(scene);
  };

  // ---------------- options ----------------
  G.optionsMenu = function* () {
    const O = G.state.options;
    for (;;) {
      const items = ['TEXT SPEED: ' + ['SLOW', 'MID', 'FAST'][O.textSpeed - 1 < 0 ? 1 : O.textSpeed - 1], 'BATTLE ANIM: ' + (O.battleAnim ? 'ON' : 'OFF'), 'BATTLE STYLE: ' + (O.battleStyle === 'shift' ? 'SHIFT' : 'SET'), 'SOUND: ' + (O.mute ? 'OFF' : 'ON'), 'DAY/NIGHT: ' + (O.dayNight === false ? 'OFF' : 'ON'), 'CANCEL'];
      const r = yield* G.choose(items, { x: 120, y: 30, w: 190 });
      if (r < 0 || r === 5) return;
      if (r === 4) O.dayNight = O.dayNight === false;
      if (r === 0) { O.textSpeed = O.textSpeed % 3 + 1; G.textSpeed = O.textSpeed; }
      if (r === 1) O.battleAnim = !O.battleAnim;
      if (r === 2) O.battleStyle = O.battleStyle === 'shift' ? 'set' : 'shift';
      if (r === 3) { O.mute = !O.mute; if (G.audio) G.audio.setMute(O.mute); }
    }
  };

  // ---------------- naming screen ----------------
  G.namingScreen = function* (prompt, def, max) {
    const rows = ['ABCDEFGHI', 'JKLMNOPQR', 'STUVWXYZ ', 'abcdefghi', 'jklmnopqr', 'stuvwxyz ', '0123456789'.slice(0, 9)];
    const extra = ['DEL', 'END'];
    let name = '', cx = 0, cy = 0;
    const nb = G.nameBuffer ? G.nameBuffer() : null; // the same bytes the Game Boy's buffer would hold (src/game/glitches.js)
    const del = () => { if (!name) return; name = name.slice(0, -1); if (nb) nb.del(name.length); };
    const scene = { opaque: true, t: 0, done: false, update(f) {
      this.t++; if (!f) return;
      const I = G.input, Pt = G.pointer;
      if (Pt && (Pt.moved || Pt.pressed) && Pt.inside) { // hover/tap a letter, DEL or END; the click arrives as A
        let hit = false;
        rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (Pt.in(44 + i * 28 - 12, 54 + j * 15 - 2, 28, 15)) { cx = i; cy = j; hit = true; } });
        const y = 54 + rows.length * 15;
        if (Pt.in(46, y - 2, 60, 15)) { cy = rows.length; cx = 0; hit = true; } else if (Pt.in(186, y - 2, 60, 15)) { cy = rows.length; cx = 5; hit = true; }
        if (!hit && Pt.pressed) Pt.consume();
      }
      if (I.repeat('left')) cx = (cx + 8) % 9; if (I.repeat('right')) cx = (cx + 1) % 9;
      if (I.repeat('up')) cy = (cy + rows.length) % (rows.length + 1); if (I.repeat('down')) cy = (cy + 1) % (rows.length + 1);
      // letters typed on a keyboard go straight in (the grid still works with arrows, taps and a pad)
      for (const ch of (I.takeTyped ? I.takeTyped() : [])) {
        if (ch === '\b') del();
        else if (name.length < max) { if (nb) nb.add(name.length, ch); name += ch; if (name.length >= max) { cy = rows.length; cx = 5; } }
      }
      if (I.pressed.b) del();
      if (I.pressed.start) { this.done = true; }
      if (I.pressed.a) {
        if (cy === rows.length) { if (cx < 4) del(); else this.done = true; }
        else { const ch = rows[cy][cx]; if (ch && name.length < max) { if (nb) nb.add(name.length, ch); name += ch; } if (name.length >= max) { cy = rows.length; cx = 5; } }
      }
    }, draw(s) {
      G.menuBg(s, '#6a9ae0', '#5a88d0', this.t);
      G.ui.frame(s, 20, 6, 280, 36);
      G.ui.text(s, prompt, 32, 12);
      G.ui.text(s, name + (Math.floor(this.t / 20) % 2 ? '_' : ''), 32, 26, hex('#c04040'));
      G.ui.frame(s, 20, 44, 280, 132);
      rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const x = 44 + i * 28, y = 54 + j * 15; F.draw(s, r[i], x, y, INK, hex('#d6d4cc')); if (i === cx && j === cy) G.ui.cursor(s, x - 10, y, this.t); } });
      const y = 54 + rows.length * 15;
      G.ui.text(s, 'DEL', 60, y); G.ui.text(s, 'END', 200, y);
      if (cy === rows.length) G.ui.cursor(s, cx < 4 ? 50 : 190, y, this.t);
    } };
    if (G.input.setTextMode) G.input.setTextMode(true);
    try { yield* G.engine.run(scene); } finally { if (G.input.setTextMode) G.input.setTextMode(false); }
    G.lastNameBuf = nb ? nb.bytes() : null;
    return name.trim() || def;
  };

  // ---------------- Pokédex ----------------
  G.pokedex = function* () {
    const D = G.DATA, S = G.state;
    let sel = 0, top = 0;
    const scene = { opaque: true, t: 0, done: false, update(f) {
      this.t++; if (!f) return;
      const I = G.input, Pt = G.pointer;
      if (Pt && (Pt.moved || Pt.pressed) && Pt.inside) { // hover/tap an entry (click opens it as A); the wheel scrolls
        let hit = -1;
        for (let i = 0; i < 8 && top + i < 151; i++) if (Pt.in(9, 9 + i * 20, 170, 20)) hit = top + i;
        if (hit >= 0) sel = hit; else if (Pt.pressed) Pt.consume();
      }
      if (I.repeat('up')) sel = Math.max(0, sel - 1); if (I.repeat('down')) sel = Math.min(150, sel + 1);
      if (I.repeat('left')) sel = Math.max(0, sel - 7); if (I.repeat('right')) sel = Math.min(150, sel + 7);
      if (sel < top) top = sel; if (sel > top + 7) top = sel - 7;
      if (I.pressed.b) this.done = true;
      if (I.pressed.a) { const sp = D.dexOrder[sel + 1]; if (S.dex.seen[sp]) { this.open = sp; } }
    }, draw(s) {
      G.menuBg(s, '#d84848', '#c83838', 0);
      G.ui.frame(s, 4, 4, 180, 172, 'red');
      for (let i = 0; i < 8; i++) {
        const n = top + i + 1; if (n > 151) break;
        const sp = D.dexOrder[n], seen = S.dex.seen[sp], caught = S.dex.caught[sp], y = 12 + i * 20;
        if (n - 1 === sel) s.rect(9, y - 3, 170, 18, hex('#f8e0c0'));
        F.drawSmall(s, String(n).padStart(3, '0'), 24, y + 3, INK);
        if (caught) G.drawBall(s, 46, y + 5, 'POKE_BALL', 0);
        G.ui.text(s, seen ? D.species[sp].name : '----------', 56, y);
      }
      const sp = D.dexOrder[sel + 1];
      G.ui.frame(s, 188, 4, 128, 110);
      if (S.dex.seen[sp]) s.blit(G.pokeSprite(sp, 'front'), 220, 20 + Math.round(Math.sin(this.t / 20))); else G.ui.text(s, '?', 250, 50);
      G.ui.frame(s, 188, 116, 128, 60);
      G.ui.text(s, 'SEEN  ' + Object.keys(S.dex.seen).length, 200, 126);
      G.ui.text(s, 'OWN   ' + Object.keys(S.dex.caught).length, 200, 144);
    } };
    G.engine.push(scene);
    while (!scene.done) {
      if (scene.open) { const sp = scene.open; scene.open = null; yield* G.dexPage(sp); }
      yield;
    }
    G.engine.pop(scene);
  };
  G.dexPage = function* (sp, fromCatch) {
    const d = G.DATA.species[sp], caught = G.state.dex.caught[sp];
    const scene = { opaque: true, t: 0, done: false, update(f) { this.t++; if (f && this.t > 10 && (G.input.pressed.a || G.input.pressed.b)) this.done = true; }, draw(s) {
      G.menuBg(s, '#e8e0c8', '#dcd2b8', this.t);
      G.ui.frame(s, 4, 4, 312, 100, 'red');
      s.blit(G.pokeSprite(sp, 'front'), 16, 22);
      G.ui.text(s, 'No.' + String(d.dex).padStart(3, '0') + '  ' + d.name, 100, 16);
      G.ui.text(s, (d.cat || '???') + ' POKéMON', 100, 34);
      if (caught) {
        G.ui.text(s, 'HT  ' + d.ht[0] + "'" + String(d.ht[1]).padStart(2, '0') + '"', 100, 54);
        G.ui.text(s, 'WT  ' + (d.wt / 10).toFixed(1) + ' lb', 100, 70);
      }
      d.types.forEach((t, i) => { const c = hex(G.TYPE_COL[t]); s.rect(220 + i * 46, 54, 42, 12, P.outline); s.rect(221 + i * 46, 55, 40, 10, c); F.draw(s, G.typeName(t), 223 + i * 46, 56, P.white, shade(c, -0.4)); });
      G.ui.frame(s, 4, 106, 312, 70);
      const txt = caught ? ((G.DEX_TEXT && G.DEX_TEXT[sp]) || '') : 'No further data. Catch this POKéMON to learn more.';
      F.wrap(txt, 290).slice(0, 4).forEach((l, i) => G.ui.text(s, l, 14, 114 + i * 14));
    } };
    yield* G.engine.run(scene);
  };
})(window.G);
