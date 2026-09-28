// Save transfer between sites/browsers: saves live in localStorage per web address, so moving hosts loses them.
// EXPORT copies an import link (<site>#importsave=...) and downloads a .json backup; IMPORT reads a .json file.
// Opening an import link shows what it contains and asks before replacing anything. The #fragment never reaches
// the server. Imported data is validated (known species/moves/maps, sane numbers) before it is stored.
(function (G) {
  'use strict';
  const { hex, mix } = G.gfx;
  const F = G.font;
  const SAVE_KEY = 'pkmn_pixel_red_save', WTP_KEY = 'claudered_wtp';
  const b64u = s => G.b64u(s), unb64u = s => G.unb64u(s);
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };

  // accept only what a real save looks like
  function validSave(s) {
    if (!s || typeof s !== 'object' || typeof s.name !== 'string' || s.name.length > 12) return false;
    if (!G.MAPDATA.maps[s.map]) return false;
    const lvOk = m => G.DATA.species[m.species].glitch ? m.level >= 0 && m.level <= 255 : m.level >= 1 && m.level <= 100; // MISSINGNO. can be Lv0 or Lv132
    const monOk = m => m && G.DATA.species[m.species] && lvOk(m) && Array.isArray(m.moves) && m.moves.length >= 1 && m.moves.length <= 4 && m.moves.every(x => x && G.DATA.moves[x.id]);
    if (!Array.isArray(s.party) || s.party.length > 6 || !s.party.every(monOk)) return false;
    if (s.boxes && (!Array.isArray(s.boxes) || !s.boxes.every(b => b === null || (Array.isArray(b) && b.every(monOk))))) return false; // null: an empty box gap, repaired on load
    if (s.badges && (!Array.isArray(s.badges) || !s.badges.every(b => G.BADGES.includes(b)))) return false;
    return true;
  }
  // lines for the confirm screen; the party wraps over up to two lines of width w
  function summary(s, w) {
    const mons = s.party.map(m => (m.nick || G.speciesName(m.species)) + ' Lv' + m.level), party = [];
    let line = '';
    for (let i = 0; i < mons.length; i++) {
      const t = line ? line + ', ' + mons[i] : mons[i];
      if (F.measure(t + ' +9') <= w || !line) { line = t; continue; }
      if (party.length) { line += ' +' + (mons.length - i); break; }
      party.push(line + ','); line = mons[i];
    }
    if (line) party.push(line);
    return [s.name + (s.badges && s.badges.length ? '  ' + s.badges.length + ' BADGE' + (s.badges.length > 1 ? 'S' : '') : '')]
      .concat(party, [G.mapDisplayName ? G.mapDisplayName(G.maps.getMap(s.map)) : s.map]);
  }
  function payload() {
    const raw = get(SAVE_KEY); if (!raw) return null;
    const p = { v: 1, save: JSON.parse(raw) }, w = get(WTP_KEY);
    if (w) p.wtp = JSON.parse(w);
    return p;
  }
  G.saveTransferLink = () => { const p = payload(); return p ? G.siteBase() + '#importsave=' + b64u(JSON.stringify(p)) : null; };
  function parse(text) {
    let p;
    try { const t = String(text).trim(), m = t.match(/importsave=([A-Za-z0-9_\-]+)/); p = JSON.parse(m ? unb64u(m[1]) : t); } catch (e) { return null; }
    if (p && p.save) { /* export format */ } else if (p && p.party) p = { v: 1, save: p }; else return null;
    return validSave(p.save) ? p : null;
  }

  // backdrop for the import messages; stays up until the last message closes so nothing stale shows through
  function backdrop(draw, title) {
    return { opaque: true, t: 0, done: false, draw(sf) {
      for (let y = 0; y < 180; y++) for (let x = 0; x < 320; x++) sf.data[y * 320 + x] = mix(hex('#1a2448'), hex('#2e3e78'), y / 180);
      G.logoText(sf, title || 'IMPORT SAVE', 160, 8, 2, '#fff27a', '#f5b822', '#2a50c8', '#0a1a60');
      if (draw) draw(sf);
    }, update() { this.t++; } };
  }
  // a confirm screen: shows the save and asks before replacing anything
  function* confirmImport(p, opt) {
    opt = opt || {};
    const cur = get(SAVE_KEY), s = p.save;
    let look = null;
    if (s.look && G.lookDef) { G.CAST.import_preview = G.lookDef(s.look); look = G.castPortrait('import_preview'); }
    const tx = look ? 138 : 20, lines = summary(s, 314 - tx), warn = 'This replaces the save already in this browser.';
    const sc = G.engine.push(backdrop(sf => {
      if (look) sf.blitScaled(look, 6, 40, 128, 128);
      // party lines sit closer together; the map line stays left of the YES/NO box
      let y = 46;
      lines.forEach((l, i) => {
        if (i === 1 || i === lines.length - 1) y += 4;
        F.drawOutlined(sf, l, tx, y, hex(i ? '#d8e4ff' : '#ffe070'), hex('#0a0e24')); y += 12;
      });
      if (cur) F.drawOutlined(sf, warn, 160 - (F.measure(warn) >> 1), 30, hex('#ff9a8a'), hex('#0a0e24'));
    }, opt.title));
    const ok = yield* G.ask(cur ? (opt.replace || 'Replace your current save with this one?') : (opt.ask || 'Import this save?'));
    if (ok) {
      set(SAVE_KEY, JSON.stringify(p.save));
      if (p.wtp) set(WTP_KEY, JSON.stringify(p.wtp));
      G.sfx && G.sfx('save');
      yield* G.say(opt.done || 'Save imported! Choose CONTINUE to pick up where you left off.');
    }
    G.engine.pop(sc);
    return ok;
  }
  G.saveTransfer = { validSave, confirmImport };
  // boot: #importsave=... link
  G.saveImportLanding = function () {
    const h = String((typeof location !== 'undefined' && location.hash) || '');
    if (!/importsave=/.test(h)) return false;
    const p = parse(h);
    G.spawnScript((function* () {
      if (p) yield* confirmImport(p);
      else { const sc = G.engine.push(backdrop()); yield* G.say("That save link couldn't be read. Ask for a fresh one!"); G.engine.pop(sc); }
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
      G.titleScreen();
    })(), 'import');
    return true;
  };
  // title menu: SAVE TRANSFER
  function pickFile() {
    return new Promise(res => {
      try {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
        inp.onchange = () => { const f = inp.files && inp.files[0]; if (!f) return res(null); const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => res(null); r.readAsText(f); };
        inp.click();
      } catch (e) { res(null); }
    });
  }
  function* wait(promiseFn) {
    if (typeof document === 'undefined') return null;
    let done = false, val = null;
    promiseFn().then(v => { val = v; done = true; }, () => { done = true; });
    for (let i = 0; i < 3600 && !done; i++) yield;
    return val;
  }
  G.saveTransferMenu = function* () {
    const r = yield* G.choose(['COPY SAVE LINK', 'DOWNLOAD BACKUP', 'LOAD BACKUP FILE', 'CANCEL'], { x: 6, y: 6, w: 170 });
    if (r === 0 || r === 1) {
      const p = payload();
      if (!p) { yield* G.say('There is no save in this browser yet.'); return; }
      if (r === 0) {
        const ok = yield* wait(async () => { try { await navigator.clipboard.writeText(G.saveTransferLink()); return true; } catch (e) { return false; } });
        yield* G.say(ok ? 'Save link copied! Open it on the new site to bring your save along.' : "Couldn't reach the clipboard - try DOWNLOAD BACKUP instead.");
      } else {
        const blob = new Blob([JSON.stringify(p)], { type: 'application/json' }), u = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = u; a.download = 'claude-red-save-' + p.save.name.toLowerCase() + '.json'; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(u), 4000);
        yield* G.say('Backup downloaded. Use LOAD BACKUP FILE on any site to restore it.');
      }
    } else if (r === 2) {
      const text = yield* wait(pickFile);
      const p = text && parse(text);
      if (!p) { yield* G.say(text ? "That file isn't a valid save." : 'No file chosen.'); return; }
      yield* confirmImport(p);
    }
  };
})(window.G);
