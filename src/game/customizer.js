// Character customizer (new game): the player's look is stored in G.state.look and drives G.CAST.red, so the
// overworld sprite, battle back view, trainer card, title screen, Hall of Fame and share cards all follow it.
(function (G) {
  'use strict';
  const { hex, mix, shade } = G.gfx;
  const F = G.font;

  const SKIN = ['#fbe0c4', '#f0b88a', '#e2a172', '#c98a5c', '#a56a42', '#7c4c30', '#5c3624'];
  const HAIR = ['#3a2a26', '#6a4430', '#9a6a3a', '#d8a850', '#f4dc98', '#c8603a', '#e8e8f0', '#6a6a78', '#2c3c8c', '#d85a9a', '#48a060'];
  const HAT = ['#d8383a', '#3a68d8', '#3aa860', '#f0c030', '#8a4ad8', '#2a2a34', '#f4f4f4', '#e87a30', '#e85aa0'];
  const SHIRT = ['#d64a3a', '#4a78c8', '#48a868', '#e8c040', '#9a58c8', '#2e2e38', '#f0f0f0', '#e87a30', '#e060a0', '#40b0c0'];
  const BOTTOM = ['#34508a', '#2a2a34', '#6a4a30', '#5a6a3a', '#8a8a98', '#c8b890', '#a03a4a', '#2a6a8a'];
  const BAG = ['#e0b048', '#c83a3a', '#3a68d8', '#48a868', '#8a58c8', '#2a2a34', '#f0f0f0'];
  const HEADS = ['cap', 'spiky', 'short', 'long', 'pony', 'bun', 'beanie', 'hat', 'bald'];
  const HATTED = new Set(['cap', 'beanie', 'hat']);
  const DEFAULT = { face: 'm', head: 'cap', skin: '#f0b88a', hair: '#3a2a26', hat: '#d8383a', shirt: '#d64a3a', outfit: 'pants', bottom: '#34508a', bag: '#e0b048' };
  // RED's own cast entry, restored before each look is applied
  const BASE = Object.assign({}, G.CAST.red);

  // look -> cast definition fields (shared by chars.js and portraitpx.js)
  function lookDef(look) {
    const l = Object.assign({}, DEFAULT, look || {});
    const d = { head: l.head, skin: l.skin, hair: l.hair, hat: l.hat, hatK: l.hat === '#f4f4f4' ? '#d8383a' : '#f4f4f4', shirt: l.shirt, accent: '#f8f8f8',
      pants: l.bottom, shoes: HATTED.has(l.head) && l.hat !== '#f4f4f4' ? l.hat : '#4a3a3a', backpack: l.bag, bag: l.bag };
    if (l.face === 'f') d.face = 'f';
    if (l.outfit === 'dress') d.body = 'dress';
    else if (l.outfit === 'shorts') { d.body = 'shorts'; d.shorts = true; }
    return d;
  }
  G.applyLook = function (look) {
    const red = G.CAST.red;
    for (const k of Object.keys(red)) delete red[k];
    Object.assign(red, BASE, lookDef(look));
    if (G.ow && G.ow.player) G.ow.player.setSprite('red');
  };
  G.DEFAULT_LOOK = DEFAULT;
  G.lookDef = lookDef;


  function rows(look) {
    return [
      { key: 'face', label: 'LOOK', vals: ['m', 'f'], names: ['BOY', 'GIRL'] },
      { key: 'head', label: 'HAIR', vals: HEADS, names: HEADS.map(h => h.toUpperCase()) },
      { key: 'skin', label: 'SKIN', vals: SKIN },
      { key: 'hair', label: 'HAIR COLOR', vals: HAIR, off: look.head === 'bald' },
      { key: 'hat', label: 'HAT', vals: HAT, off: !HATTED.has(look.head) },
      { key: 'shirt', label: look.outfit === 'dress' ? 'DRESS' : 'SHIRT', vals: SHIRT },
      { key: 'outfit', label: 'OUTFIT', vals: ['pants', 'shorts', 'dress'], names: ['PANTS', 'SHORTS', 'DRESS'] },
      { key: 'bottom', label: look.outfit === 'shorts' ? 'SHORTS' : 'PANTS', vals: BOTTOM, off: look.outfit === 'dress' },
      { key: 'bag', label: 'BAG', vals: BAG },
      { key: 'random', label: 'RANDOM', action: true },
      { key: 'done', label: 'DONE', action: true },
    ];
  }
  const pick = a => a[Math.floor(Math.random() * a.length)];
  // the face alone barely shows at sprite size, so LOOK also swaps the default silhouette: GIRL trades the cap,
  // short hair and pants for long hair and a dress, BOY trades them back. Anything already customised stays.
  function applyFace(look) {
    if (look.face === 'f') { if (['cap', 'spiky', 'short', 'bald'].includes(look.head)) look.head = 'long'; if (look.outfit === 'pants') look.outfit = 'dress'; }
    else { if (['long', 'pony', 'bun'].includes(look.head)) look.head = 'cap'; if (look.outfit === 'dress') look.outfit = 'pants'; }
  }
  function randomLook() {
    const face = pick(['m', 'f']);
    return { face, head: pick(face === 'f' ? ['long', 'pony', 'bun', 'cap', 'short', 'beanie', 'hat'] : HEADS), skin: pick(SKIN), hair: pick(HAIR), hat: pick(HAT),
      shirt: pick(SHIRT), outfit: face === 'f' ? pick(['pants', 'shorts', 'dress']) : pick(['pants', 'pants', 'shorts']), bottom: pick(BOTTOM), bag: pick(BAG) };
  }

  class Customizer {
    constructor(look) { this.opaque = true; this.t = 0; this.row = 0; this.look = Object.assign({}, DEFAULT, look || {}); this.done = false; G.applyLook(this.look); }
    move(d) {
      const R = rows(this.look);
      for (let k = 0; k < R.length; k++) { this.row = (this.row + d + R.length) % R.length; if (!R[this.row].off) break; }
      G.sfx && G.sfx('cursor');
    }
    update(f) {
      this.t++;
      if (!f) return;
      const I = Object.assign({}, G.input.pressed), R = rows(this.look), Pt = G.pointer;
      if (Pt && (Pt.moved || Pt.pressed) && Pt.inside) { // hover a row; click the arrows / value / RANDOM / DONE
        const i = R.findIndex((_, k) => Pt.in(160, 26 + k * 13, 148, 13));
        if (i >= 0 && !R[i].off) this.row = i;
        if (Pt.pressed) {
          Pt.consume();
          if (i >= 0 && !R[i].off) {
            if (R[i].vals) { if (Pt.x < 252) I.left = true; else I.right = true; }
            else I.a = true;
          }
        }
      }
      const r = R[this.row];
      if (I.up) this.move(-1);
      else if (I.down) this.move(1);
      else if ((I.left || I.right) && r.vals && !r.off) {
        const i = Math.max(0, r.vals.indexOf(this.look[r.key])), n = r.vals.length;
        this.look[r.key] = r.vals[(i + (I.right ? 1 : -1) + n) % n];
        if (r.key === 'face') applyFace(this.look);
        G.applyLook(this.look); this.bump = 6;
        G.sfx && G.sfx('blip');
      } else if (I.a) {
        if (r.key === 'random') { this.look = randomLook(); G.applyLook(this.look); this.bump = 10; G.sfx && G.sfx('select'); }
        else if (r.key === 'done') { this.result = this.look; this.done = true; G.sfx && G.sfx('select'); }
        else this.move(1);
      } else if (I.start) { this.row = R.length - 1; this.result = this.look; this.done = true; G.sfx && G.sfx('select'); }
      else if (I.b) { this.row = R.length - 1; }
      if (this.bump > 0) this.bump--;
    }
    draw(s) {
      // dressing-room backdrop: soft light and a tiled floor
      for (let y = 0; y < 180; y++) for (let x = 0; x < 320; x++) {
        let c = mix(hex('#f6f0e4'), hex('#c6d6ea'), Math.min(1, Math.hypot(x - 78, (y - 80) * 1.3) / 190));
        s.data[y * 320 + x] = c;
      }
      F.drawOutlined(s, 'LET ME GET A LOOK AT YOU!', 160 - F.measure('LET ME GET A LOOK AT YOU!') / 2, 4, hex('#fff8e0'), hex('#3a2a4a'));
      G.ui.frame(s, 6, 20, 144, 154);
      // mirror: portrait x2 with a floor ellipse, walking sprite alongside
      for (let y = 26; y < 168; y++) for (let x = 12; x < 144; x++) s.pset(x, y, mix(hex('#e8f0fa'), hex('#bccde4'), (y - 26) / 142));
      s.ellipse(74, 160, 50, 7, hex('#a8b8d0')); s.ellipse(74, 159, 46, 5, hex('#c0cee2'));
      const pic = G.castPortrait('red'), hop = this.bump > 0 ? -Math.round(Math.sin(this.bump / 6 * Math.PI) * 3) : 0;
      s.blitScaled(pic, 10, 36 + hop, 128, 128);
      const fr = G.chars.makeCharacter(G.CAST.red), dirs = ['down', 'left', 'up', 'right'], dir = dirs[Math.floor(this.t / 80) % 4];
      const step = [0, 1, 0, 2][Math.floor(this.t / 10) % 4];
      s.ellipse(126, 164, 11, 3, hex('#9aabc6'));
      s.blitScaled(fr[dir][step], 110, 118, 32, 48);
      // options
      const R = rows(this.look);
      G.ui.frame(s, 154, 20, 160, 154);
      R.forEach((r, i) => {
        const y = 28 + i * 13, sel = i === this.row, ink = r.off ? hex('#a8a8b0') : G.ui.INK;
        if (sel) { s.rect(160, y - 2, 148, 12, hex('#f8e8c0')); G.ui.cursor ? G.ui.cursor(s, 162, y + 1) : F.draw(s, '>', 162, y, ink); }
        F.draw(s, r.label, 172, y, ink);
        if (!r.vals) return;
        const cur = this.look[r.key];
        const tri = (x, dirn) => { for (let k = 0; k < 4; k++) for (let j = -k; j <= k; j++) s.pset(x + (dirn > 0 ? 3 - k : k), y + 4 + j, sel && !r.off ? hex('#d83a3a') : hex('#b0a8a0')); };
        tri(244, -1); tri(300, 1);
        if (r.names) { const nm = r.names[Math.max(0, r.vals.indexOf(cur))]; F.draw(s, nm, 274 - F.measure(nm) / 2, y, ink); }
        else {
          s.rect(258, y + 1, 34, 8, G.ui.INK); s.rect(259, y + 2, 32, 6, r.off ? hex('#d0d0d8') : hex(cur));
          if (!r.off) s.hline(260, 289, y + 2, shade(hex(cur), 0.25));
        }
      });
      F.drawSmall(s, 'CLICK OR USE THE ARROWS  -  START: DONE', 160 - F.measureSmall('CLICK OR USE THE ARROWS  -  START: DONE') / 2, 175, hex('#6a6a80'));
    }
  }
  G.customizeLook = function* (look) {
    const sc = new Customizer(look);
    const res = yield* G.engine.run(sc);
    G.applyLook(res);
    return res;
  };
})(window.G);
