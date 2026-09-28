// Social: achievements with share prompts and pixel-art share cards.
// Big moments (badges, the ELITE FOUR, rivals, new Pokémon, evolutions, POKéDEX milestones, the HALL OF FAME)
// are recorded in G.state.achievements and pop a toast; SELECT while it shows (or START > SHARE later) opens a
// share screen with a 320x180 card that is exported at 4x (Web Share API, else PNG download + copied text).
(function (G) {
  'use strict';
  const { Surface, hex, mix, shade, bayer, hash2 } = G.gfx;
  const F = G.font;
  const HOME = 'https://github.com/levy-street/pokemon-claude-red', GAME = 'Pokemon Claude Red';
  const hosted = typeof location !== 'undefined' && /^https?:$/.test(location.protocol) && !/^(localhost|127\.|\[::1\])/.test(location.hostname);
  const host = hosted ? location.host.replace(/^www\./, '') : '';
  const URL_TEXT = host && host.length <= 16 ? host : 'levystreet.com'; // the card footer fits ~16 characters

  const GYMS = { BROCK: ['PewterGym', 0], MISTY: ['CeruleanGym', 1], LT_SURGE: ['VermilionGym', 2], ERIKA: ['CeladonGym', 3], KOGA: ['FuchsiaGym', 4], SABRINA: ['SaffronGym', 5], BLAINE: ['CinnabarGym', 6], GIOVANNI: ['ViridianGym', 7] };
  const GYM_TYPE = ['ROCK', 'WATER', 'ELECTRIC', 'GRASS', 'POISON', 'PSYCHIC_TYPE', 'FIRE', 'GROUND'];
  const small = t => String(t).toUpperCase().replace(/[éÉ]/g, 'E').replace(/·/g, '-');
  const ELITE = { LORELEI: '#5a90d8', BRUNO: '#9a7050', AGATHA: '#7a4a9a', LANCE: '#b84848' };
  const LEGENDARY = new Set(['ARTICUNO', 'ZAPDOS', 'MOLTRES', 'MEWTWO', 'MEW']);
  const DEX_MILESTONES = [10, 25, 50, 75, 100, 125, 150, 151];
  const trainerName = cls => ({ LT_SURGE: 'LT.SURGE', RIVAL1: G.state.rival, RIVAL2: G.state.rival, RIVAL3: G.state.rival })[cls] || cls.replace(/_/g, ' ');
  const monName = sp => G.speciesName ? G.speciesName(sp) : sp;
  const playTime = t => { const m = Math.floor((t || 0) / 3600); return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0'); };
  const place = () => { try { return G.mapDisplayName ? G.mapDisplayName(G.ow.map) : ''; } catch (e) { return ''; } };

  // ---------------- recording ----------------
  const toasts = [];
  let toast = null;
  G.achieve = function (id, kind, data) {
    const S = G.state; if (!S || !S.name) return null;
    S.achievements = S.achievements || [];
    if (S.achievements.some(a => a.id === id)) return null;
    // a gym win is recorded just before the badge is handed over: count the badge it celebrates
    const badges = S.badges.length + (kind === 'leader' && data && !S.badges.includes(data.badge) ? 1 : 0);
    const a = { id, kind, data: data || {}, t: S.playTime || 0, date: Date.now(), badges, dex: Object.keys(S.dex.caught).length };
    S.achievements.push(a);
    toasts.push(a);
    return a;
  };
  G.achievementTitle = function (a) {
    const d = a.data, n = G.state.name;
    switch (a.kind) {
      case 'leader': return [n + ' DEFEATED', trainerName(d.cls) + '!', 'EARNED THE ' + d.badge];
      case 'elite': return [n + ' DEFEATED', trainerName(d.cls) + '!', 'ELITE FOUR · ' + (d.place || 'POKéMON LEAGUE')];
      case 'champion': return [n + ' IS THE', 'CHAMPION!', 'DEFEATED ' + trainerName('RIVAL3') + ' AT THE POKéMON LEAGUE'];
      case 'rival': return [n + ' DEFEATED', trainerName(d.cls) + '!', d.place || ''];
      case 'giovanni': return [n + ' DEFEATED', 'GIOVANNI!', 'TEAM ROCKET BOSS · ' + (d.place || '')];
      case 'starter': return [n + ' CHOSE', monName(d.sp) + '!', 'THE ADVENTURE BEGINS IN PALLET TOWN'];
      case 'caught': return [n + ' CAUGHT' + (LEGENDARY.has(d.sp) ? ' THE LEGENDARY' : ''), monName(d.sp) + '!', 'LV' + d.lv + ' · No.' + String(d.dex).padStart(3, '0') + (d.place ? ' · ' + d.place : '')];
      case 'got': return [n + ' RECEIVED', monName(d.sp) + '!', 'LV' + d.lv + ' · No.' + String(d.dex).padStart(3, '0')];
      case 'evolved': return [monName(d.from) + ' EVOLVED INTO', monName(d.sp) + '!', n + "'S TEAM GETS STRONGER"];
      case 'dex': return [n + ' HAS CAUGHT', d.n + ' POKéMON!', d.n >= 151 ? 'THE POKéDEX IS COMPLETE!' : 'POKéDEX ' + d.n + '/151'];
      case 'hof': return [n + ' ENTERED THE', 'HALL OF FAME!', 'WITH ' + d.team.map(t => monName(t.species)).slice(0, 3).join(', ') + (d.team.length > 3 ? '...' : '')];
      case 'card': return [n + "'S", 'ADVENTURE', a.badges + ' BADGES · ' + a.dex + ' CAUGHT'];
      case 'tower': return [n + ' WON', d.n + ' IN A ROW!', 'BATTLE TOWER STREAK · SOCIAL ZONE'];
      case 'pvp': return [n + ' DEFEATED', d.name + '!', 'LINK BATTLE · SOCIAL ZONE'];
      case 'trade': return [n + ' TRADED FOR', monName(d.sp) + '!', 'WITH ' + d.name + ' · SOCIAL ZONE'];
    }
    return [n, a.id, ''];
  };
  G.shareText = function (a) {
    const d = a.data, n = G.state.name, S = G.state;
    const line = {
      leader: () => `${n} defeated ${trainerName(d.cls)} and earned the ${d.badge}!`,
      elite: () => `${n} defeated ${trainerName(d.cls)} of the Elite Four!`,
      champion: () => `${n} became the Pokémon League Champion!`,
      rival: () => `${n} defeated rival ${trainerName(d.cls)}${d.place ? ' at ' + d.place : ''}!`,
      giovanni: () => `${n} defeated Team Rocket boss GIOVANNI${d.place ? ' at ' + d.place : ''}!`,
      starter: () => `${n} chose ${monName(d.sp)} as their first partner!`,
      caught: () => `${n} caught ${LEGENDARY.has(d.sp) ? 'the legendary ' : ''}${monName(d.sp)}! (Lv${d.lv})`,
      got: () => `${n} received ${monName(d.sp)}!`,
      evolved: () => `${n}'s ${monName(d.from)} evolved into ${monName(d.sp)}!`,
      dex: () => `${n} has caught ${d.n} Pokémon!`,
      hof: () => `${n} entered the Hall of Fame!`,
      card: () => `${n}'s adventure so far: ${a.badges} badges, ${a.dex} Pokémon caught!`,
      tower: () => `${n} won ${d.n} Battle Tower battles in a row!`,
      pvp: () => `${n} beat ${d.name}'s team in a link battle!`,
      trade: () => `${n} traded ${monName(d.from)} to ${d.name} for ${monName(d.sp)}!`,
    }[a.kind];
    return (line ? line() : n) + ` ⏱ ${playTime(a.t)} — ${GAME} · ${URL_TEXT}`;
  };

  // hooks: trainer wins, new Pokémon, evolutions, the Hall of Fame
  const origTrainer = G.startTrainerBattle;
  G.startTrainerBattle = function* (cls, n, opts) {
    const r = yield* origTrainer.call(this, cls, n, opts);
    if (r !== 'win') return r;
    const map = G.ow && G.ow.map ? G.ow.map.name : '';
    let ace = null; try { const p = G.makeTrainerParty(cls, n); ace = p[p.length - 1].species; } catch (e) {}
    if (GYMS[cls] && GYMS[cls][0] === map) G.achieve('leader_' + cls, 'leader', { cls, badge: G.BADGES[GYMS[cls][1]], gym: GYMS[cls][1], ace });
    else if (ELITE[cls]) G.achieve('elite_' + cls, 'elite', { cls, ace });
    else if (cls === 'RIVAL3') G.achieve('champion', 'champion', { cls, ace });
    else if (cls === 'RIVAL1' || cls === 'RIVAL2') G.achieve('rival_' + map, 'rival', { cls, ace, place: place() });
    else if (cls === 'GIOVANNI') G.achieve('giovanni_' + map, 'giovanni', { cls, ace, place: place() });
    return r;
  };
  let evolving = null;
  const origEvolve = G.evolve;
  G.evolve = function* (m, to, noCancel) {
    const from = m.species; evolving = { from, to };
    try { return yield* origEvolve.call(this, m, to, noCancel); }
    finally { evolving = null; if (m.species === to) G.achieve('evolved_' + to, 'evolved', { from, sp: to, lv: m.level }); }
  };
  const origCaught = G.dexCaught;
  G.dexCaught = function (sp) {
    const S = G.state, isNew = S && !S.dex.caught[sp];
    origCaught(sp);
    if (!isNew || evolving) return;
    const d = G.DATA.species[sp] || {}, mon = S.party.concat(...S.boxes.filter(Array.isArray)).filter(m => m && m.species === sp).pop();
    const inBattle = G.engine.scenes.some(s => s.constructor && s.constructor.name === 'BattleScene');
    const data = { sp, lv: mon ? mon.level : 5, dex: d.dex || 0, place: place() };
    const first = Object.keys(S.dex.caught).length === 1 && !(S.achievements || []).some(a => a.kind === 'starter');
    if (first) G.achieve('starter', 'starter', data);
    else G.achieve('mon_' + sp, inBattle ? 'caught' : 'got', data);
    const n = Object.keys(S.dex.caught).length;
    if (DEX_MILESTONES.includes(n)) G.achieve('dex_' + n, 'dex', { n, recent: Object.keys(S.dex.caught).slice(-6) });
  };
  if (G.hallOfFame) {
    const origHof = G.hallOfFame;
    G.hallOfFame = function* () {
      G.achieve('hof_' + ((G.state.hallOfFame || []).length + 1), 'hof', { team: G.state.party.map(m => ({ species: m.species, level: m.level })) });
      return yield* origHof.apply(this, arguments);
    };
  }

  // ---------------- toast ----------------
  const TOAST_T = 330;
  G.preStep = function () {
    if (!toast && toasts.length && G.state && G.fadeLevel < 0.5) toast = { a: toasts.shift(), t: 0 };
    if (!toast) return;
    if (G.fadeLevel < 0.5) toast.t++;
    if (toast.t > TOAST_T) { toast = null; return; }
    const Pt = G.pointer, clicked = Pt && Pt.pressed && toast.rect && Pt.in(...toast.rect);
    if (clicked) Pt.consume();
    if (G.input.pressed.select || clicked) {
      G.input.pressed.select = false;
      const a = toast.a; toast = null;
      G.engine.push(new ShareScene(a));
    }
  };
  function trophy(s, x, y) {
    const R = ['.######.', '########', '#.####.#', '#.####.#', '.######.', '..####..', '...##...', '..####..', '.######.'];
    R.forEach((r, j) => { for (let i = 0; i < 8; i++) if (r[i] === '#') s.pset(x + i, y + j, j < 2 ? hex('#fff0a0') : i < 3 ? hex('#f8d048') : hex('#d8a020')); });
  }
  const prevPost = G.postDraw;
  G.postDraw = function (s) {
    if (toast) {
      const k = Math.min(1, toast.t / 10, (TOAST_T - toast.t) / 10), y = Math.round(-30 + 34 * k);
      const [l1, l2] = G.achievementTitle(toast.a), line = (l1 + ' ' + l2).replace(/\s+/g, ' ');
      const w = Math.min(308, Math.max(150, F.measure(line) + 34)), x = 160 - (w >> 1);
      G.ui.frame(s, x, y, w, 28); toast.rect = [x, y, w, 28];
      trophy(s, x + 9, y + 6);
      F.draw(s, line, x + 22, y + 5, G.ui.INK);
      const hint = G.pointer && G.pointer.touch ? 'TAP TO SHARE' : 'SELECT / CLICK: SHARE';
      if (Math.floor(toast.t / 20) % 4 !== 3) F.drawSmall(s, hint, x + w - 8 - F.measureSmall(hint), y + 19, hex('#c83a3a'));
    }
    if (prevPost) prevPost(s);
  };

  // ---------------- share card ----------------
  function themeOf(a) {
    const d = a.data;
    if (a.kind === 'leader') return G.TYPE_COL[GYM_TYPE[d.gym]] || '#b8a038';
    if (a.kind === 'elite') return ELITE[d.cls];
    if (a.kind === 'champion' || a.kind === 'hof') return '#e8b030';
    if (a.kind === 'rival') return '#6a58c8';
    if (a.kind === 'giovanni') return '#c83a4a';
    if (a.kind === 'dex') return '#48a868';
    if (a.kind === 'card') return '#d64a3a';
    if (a.kind === 'tower') return '#d858b8';
    if (a.kind === 'pvp') return '#3aa8d8';
    if (a.kind === 'trade') return '#48b878';
    const t = ((G.DATA.species[d.sp] || {}).types || ['NORMAL'])[0];
    return (G.TYPE_COL && G.TYPE_COL[t]) || '#a8a878';
  }
  function bigText(s, str, x, y, scale, top, bot) {
    const w = F.measure(str) * scale;
    G.logoText(s, str, x + w / 2, y, scale, top || '#fffbe8', bot || '#ffe070', '#3a2a4a', '#150e24');
  }
  function outlined(s, str, x, y, c) { F.drawOutlined(s, str, x, y, hex(c || '#fff8e8'), hex('#1a1428')); }
  // the gym badge as a medal on a ribbon
  function medal(s, gym, cx, cy, base) {
    const rib = hex('#d8383a'), ribL = hex('#f4f4f4');
    for (const side of [-1, 1]) for (let j = 0; j < 30; j++) for (let i = 0; i < 9; i++) {
      const x = cx + side * (4 + i) + side * Math.floor(j / 3), y = cy + 8 + j;
      if (j > 25 && ((side > 0 ? i : 8 - i) < (j - 25) * 2 || (side > 0 ? 8 - i : i) < (j - 25) * 2)) continue;
      s.pset(x, y, i === 0 || i === 8 ? hex('#1a1428') : i >= 3 && i <= 5 ? ribL : rib);
    }
    const tmp = new Surface(19, 19); G.drawBadge(tmp, gym, 2, 2, true);
    const big = new Surface(38, 38); big.blitScaled(tmp, 0, 0, 38, 38);
    const o = big.clone(); o.outline(hex('#1a1428'), true);
    for (let j = 0; j < 44; j++) for (let i = 0; i < 44; i++) { const dd = Math.hypot(i - 21.5, j - 21.5); if (dd < 23) s.pset(cx - 22 + i, cy - 22 + j, dd > 21 ? hex('#1a1428') : dd > 19 ? hex('#f8d870') : mix(shade(base, -0.45), shade(base, -0.2), j / 44)); }
    s.blit(o, cx - 19, cy - 19); s.blit(big, cx - 19, cy - 19);
  }
  function pokeBall(s, x, y) {
    for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) {
      const d = Math.hypot(i - 5.5, j - 5.5); if (d > 6) continue;
      let c = d > 5 ? hex('#1a1428') : j < 5 ? (i < 4 && j < 3 ? hex('#ff9a8a') : hex('#e83a3a')) : j < 7 ? hex('#1a1428') : hex('#f4f4f8');
      if (Math.hypot(i - 5.5, j - 5.5) < 2.2) c = Math.hypot(i - 5.5, j - 5.5) < 1.3 ? hex('#ffffff') : hex('#1a1428');
      s.pset(x + i, y + j, c);
    }
  }
  function sprite(s, sp, size, cx, bottom) {
    const img = G.pokeSprite(sp, 'front', size);
    s.ellipse(cx, bottom - 2, size * 0.36, size * 0.07, hex('#1a1428'));
    s.blit(img, Math.round(cx - img.w / 2), bottom - img.h);
  }
  G.shareCard = function (a) {
    const s = new Surface(320, 180), base = hex(themeOf(a)), dark = shade(base, -0.72), mid = shade(base, -0.35);
    const seed = [...a.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) & 0xffff, 7);
    // backdrop: dithered gradient, sunburst behind the subject, soft vignette, sparkles
    const bx = 238, by = 104;
    for (let y = 0; y < 180; y++) for (let x = 0; x < 320; x++) {
      const t = Math.floor((y / 180) * 7 + bayer(x, y)) / 7;
      let c = mix(dark, mid, t);
      const ang = Math.atan2(y - by, x - bx), ray = Math.floor((ang + Math.PI) / (Math.PI / 10)) % 2;
      const r = Math.hypot(x - bx, (y - by) * 1.2);
      if (ray && r > 20) c = mix(c, base, Math.max(0, 0.34 - r / 700));
      if (r < 70) c = mix(c, shade(base, 0.25), (1 - r / 70) * 0.45 * (bayer(x, y) < 0.8 ? 1 : 0.6));
      const v = Math.max(Math.abs(x - 160) / 160, Math.abs(y - 90) / 90);
      if (v > 0.82) c = mix(c, hex('#0a0814'), (v - 0.82) * 1.6);
      s.data[y * 320 + x] = c;
    }
    for (let k = 0; k < 26; k++) {
      const x = Math.floor(hash2(k, seed, 1) * 316) + 2, y = Math.floor(hash2(k, seed, 2) * 150) + 26, big = hash2(k, seed, 3) > 0.7;
      const c = hex(k % 3 ? '#fff6c8' : '#ffffff');
      s.pset(x, y, c); if (big) { s.pset(x - 1, y, c); s.pset(x + 1, y, c); s.pset(x, y - 1, c); s.pset(x, y + 1, c); }
    }
    // header: game logo and play time
    s.rect(0, 0, 320, 26, hex('#120c22'));
    for (let x = 0; x < 320; x++) s.pset(x, 26, base);
    const L = G.titleLogo();
    s.blitScaled(L.big, 4, 1, Math.round(L.big.w * 0.75), Math.round(L.big.h * 0.75));
    s.blit(L.red, 8 + Math.round(L.big.w * 0.75), 4);
    const when = new Date(a.date || Date.now()), ds = when.getFullYear() + '-' + String(when.getMonth() + 1).padStart(2, '0') + '-' + String(when.getDate()).padStart(2, '0');
    F.drawSmall(s, 'TIME ' + playTime(a.t), 316 - F.measureSmall('TIME ' + playTime(a.t)), 6, hex('#fff0b0'));
    F.drawSmall(s, ds, 316 - F.measureSmall(ds), 15, hex('#b8b0d0'));
    // the player, big, on the left
    const me = G.castPortrait('red');
    s.ellipse(70, 174, 46, 5, hex('#0e0a1a'));
    s.blitScaled(me, 6, 50, 128, 128);
    // headline
    const [l1, l2, l3] = G.achievementTitle(a);
    outlined(s, l1, 140, 32);
    const sc = F.measure(l2) * 2 <= 176 ? 2 : 1;
    if (sc === 2) bigText(s, l2, 140, 44, 2); else outlined(s, l2, 140, 46, '#ffe070');
    if (l3) F.drawSmall(s, small(l3), 141, 70, hex('#fff0c8'), hex('#1a1428'));
    // subject art
    const d = a.data;
    if (a.kind === 'leader' || a.kind === 'elite' || a.kind === 'champion' || a.kind === 'rival' || a.kind === 'giovanni') {
      const opp = G.trainerPic(d.cls);
      s.blit(opp, 150, 90, { tint: hex('#1a1428'), tintAmt: 0.15 });
      if (a.kind === 'leader') medal(s, d.gym, 262, 116, base);
      else if (d.ace) sprite(s, d.ace, 64, 268, 156);
      F.drawSmall(s, 'DEFEATED', 158, 150, hex('#ff8a78'), hex('#1a1428'));
    } else if (a.kind === 'caught' || a.kind === 'got' || a.kind === 'starter') {
      if (a.kind === 'caught') pokeBall(s, 176, 150);
      sprite(s, d.sp, 96, 238, 172);
    } else if (a.kind === 'evolved') {
      sprite(s, d.from, 48, 166, 150);
      for (let i = 0; i < 3; i++) for (let k = 0; k < 5; k++) for (let j = -k; j <= k; j++) s.pset(188 + i * 6 + (4 - k), 124 + j, hex('#fff0a0'));
      sprite(s, d.sp, 96, 256, 172);
    } else if (a.kind === 'dex') {
      (d.recent || []).forEach((sp, i) => sprite(s, sp, 40, 162 + (i % 3) * 52, 124 + Math.floor(i / 3) * 44));
    } else if (a.kind === 'hof') {
      (d.team || []).forEach((m, i) => sprite(s, m.species, 48, 164 + (i % 3) * 50, 128 + Math.floor(i / 3) * 44));
    } else if (a.kind === 'tower' || a.kind === 'pvp') {
      (d.team || []).slice(0, 3).forEach((sp, i) => sprite(s, sp, 48, 166 + i * 50, 150));
      if (a.kind === 'tower') { trophy(s, 272, 84); trophy(s, 284, 84); }
    } else if (a.kind === 'trade') {
      if (d.from) sprite(s, d.from, 48, 166, 150);
      for (let i = 0; i < 3; i++) for (let k = 0; k < 5; k++) for (let j = -k; j <= k; j++) { s.pset(188 + i * 6 + (4 - k), 118 + j, hex('#b8f0c8')); s.pset(206 - i * 6 - (4 - k), 132 + j, hex('#b8f0c8')); }
      sprite(s, d.sp, 96, 256, 172);
    } else if (a.kind === 'card') {
      G.BADGES.forEach((b, i) => { const tmp = new Surface(16, 16); G.drawBadge(tmp, i, 0, 0, G.state.badges.includes(b)); s.blitScaled(tmp, 150 + (i % 4) * 40, 90 + Math.floor(i / 4) * 36, 30, 30); });
    }
    // footer: progress and the site
    s.rect(138, 166, 182, 14, hex('#120c22'));
    for (let x = 138; x < 320; x++) s.pset(x, 166, base);
    F.drawSmall(s, 'BADGES ' + a.badges + '/8  POKEDEX ' + a.dex, 144, 171, hex('#d8d0f0'));
    F.draw(s, URL_TEXT, 316 - F.measure(URL_TEXT), 168, hex('#ffe070'));
    return s;
  };

  // ---------------- moment links ----------------
  // The link carries the moment itself (name, look, badges, achievement) so the card renders for whoever opens it.
  // UTF-8 + base64url, self-contained (URL-safe, no padding)
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function utf8(str) {
    const o = [];
    for (const ch of str) {
      const c = ch.codePointAt(0);
      if (c < 0x80) o.push(c); else if (c < 0x800) o.push(0xc0 | c >> 6, 0x80 | c & 63);
      else if (c < 0x10000) o.push(0xe0 | c >> 12, 0x80 | c >> 6 & 63, 0x80 | c & 63);
      else o.push(0xf0 | c >> 18, 0x80 | c >> 12 & 63, 0x80 | c >> 6 & 63, 0x80 | c & 63);
    }
    return o;
  }
  function fromUtf8(b) {
    let s = '', i = 0;
    while (i < b.length) {
      const c = b[i++];
      if (c < 0x80) s += String.fromCharCode(c);
      else if (c < 0xe0) s += String.fromCharCode((c & 31) << 6 | b[i++] & 63);
      else if (c < 0xf0) s += String.fromCharCode((c & 15) << 12 | (b[i++] & 63) << 6 | b[i++] & 63);
      else s += String.fromCodePoint((c & 7) << 18 | (b[i++] & 63) << 12 | (b[i++] & 63) << 6 | b[i++] & 63);
    }
    return s;
  }
  const b64u = str => {
    const b = utf8(str); let o = '';
    for (let i = 0; i < b.length; i += 3) {
      const n = b[i] << 16 | (b[i + 1] || 0) << 8 | (b[i + 2] || 0);
      o += B64[n >> 18 & 63] + B64[n >> 12 & 63] + (i + 1 < b.length ? B64[n >> 6 & 63] : '') + (i + 2 < b.length ? B64[n & 63] : '');
    }
    return o;
  };
  const unb64u = str => {
    const t = String(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/[^A-Za-z0-9\-_]/g, ''), b = [];
    for (let i = 0; i < t.length; i += 4) {
      const v = k => (t[i + k] ? B64.indexOf(t[i + k]) : 0), n = v(0) << 18 | v(1) << 12 | v(2) << 6 | v(3);
      b.push(n >> 16 & 255); if (t[i + 2]) b.push(n >> 8 & 255); if (t[i + 3]) b.push(n & 255);
    }
    return fromUtf8(b);
  };
  const siteBase = () => (typeof location !== 'undefined' && /^https?:$/.test(location.protocol)) ? location.origin + location.pathname : HOME + '/'; // opened from a file: links point at the repo
  G.b64u = b64u; G.unb64u = unb64u; G.siteBase = siteBase;
  G.momentLink = function (a) {
    const S = G.state, keep = { id: a.id, kind: a.kind, data: a.data, t: a.t, date: a.date, badges: a.badges, dex: a.dex };
    return siteBase() + '?moment=' + b64u(JSON.stringify({ v: 1, n: S.name, r: S.rival, l: S.look, b: S.badges, a: keep }));
  };
  // decode + validate a shared moment (untrusted input: only known kinds, species, classes and plain values survive)
  const KINDS = new Set(['leader', 'elite', 'champion', 'rival', 'giovanni', 'starter', 'caught', 'got', 'evolved', 'dex', 'hof', 'card', 'tower', 'pvp', 'trade']);
  const CLASSES = new Set(Object.keys(GYMS).concat(Object.keys(ELITE), ['RIVAL1', 'RIVAL2', 'RIVAL3']));
  const nameOk = v => String(v || '').toUpperCase().replace(/[^A-Z0-9 .\-']/g, '').slice(0, 10) || 'RED';
  const spOk = v => (G.DATA.species[v] && v) || null, numOk = (v, max) => Math.max(0, Math.min(max, Math.floor(+v || 0)));
  const colOk = v => /^#[0-9a-f]{6}$/i.test(v) ? v : undefined;
  G.decodeMoment = function (enc) {
    let p; try { p = JSON.parse(unb64u(enc)); } catch (e) { return null; }
    if (!p || !p.a || !KINDS.has(p.a.kind)) return null;
    const a = p.a, d = a.data || {}, data = {};
    if (d.cls && CLASSES.has(d.cls)) data.cls = d.cls;
    for (const k of ['sp', 'from', 'ace']) if (spOk(d[k])) data[k] = d[k];
    if (G.BADGES.includes(d.badge)) data.badge = d.badge;
    if (d.gym !== undefined) data.gym = numOk(d.gym, 7);
    for (const k of ['lv', 'dex', 'n']) if (d[k] !== undefined) data[k] = numOk(d[k], k === 'n' ? 151 : 255);
    if (d.place) data.place = String(d.place).toUpperCase().replace(/[^A-Z0-9 .\-'É]/g, '').slice(0, 24);
    if (Array.isArray(d.recent)) data.recent = d.recent.filter(spOk).slice(0, 6);
    if (Array.isArray(d.team)) data.team = a.kind === 'hof' ? d.team.filter(m => m && spOk(m.species)).slice(0, 6).map(m => ({ species: m.species, level: numOk(m.level, 100) })) : d.team.filter(spOk).slice(0, 6);
    if (d.name) data.name = nameOk(d.name);
    if (a.kind === 'tower' && d.n !== undefined) data.n = numOk(d.n, 9999);
    const need = { leader: ['cls', 'badge'], elite: ['cls'], champion: [], rival: ['cls'], giovanni: [], starter: ['sp'], caught: ['sp'], got: ['sp'], evolved: ['sp', 'from'], dex: ['n'], hof: ['team'], card: [], tower: ['n'], pvp: ['name'], trade: ['sp', 'name'] }[a.kind];
    if (need.some(k => data[k] === undefined)) return null;
    const look = {}, L = p.l || {};
    for (const k of ['skin', 'hair', 'hat', 'shirt', 'bottom', 'bag']) if (colOk(L[k])) look[k] = L[k];
    if (['m', 'f'].includes(L.face)) look.face = L.face;
    if (['pants', 'shorts', 'dress'].includes(L.outfit)) look.outfit = L.outfit;
    if (G.chars && G.chars.HEADS[L.head]) look.head = L.head;
    return { name: nameOk(p.n), rival: nameOk(p.r || 'BLUE'), look, badges: (Array.isArray(p.b) ? p.b : []).filter(b => G.BADGES.includes(b)),
      a: { id: /^[A-Za-z0-9_]{1,40}$/.test(a.id) ? a.id : a.kind, kind: a.kind, data, t: numOk(a.t, 1e9), date: numOk(a.date, 4e12) || Date.now(), badges: numOk(a.badges, 8), dex: numOk(a.dex, 151) } };
  };

  // ---------------- export ----------------
  function toBlob(card) {
    return new Promise(res => {
      const k = 4, c = document.createElement('canvas'), small = document.createElement('canvas');
      small.width = card.w; small.height = card.h;
      const sc = small.getContext('2d'), img = sc.createImageData(card.w, card.h);
      new Uint32Array(img.data.buffer).set(card.data); sc.putImageData(img, 0, 0);
      c.width = card.w * k; c.height = card.h * k;
      const cx = c.getContext('2d'); cx.imageSmoothingEnabled = false; cx.drawImage(small, 0, 0, c.width, c.height);
      c.toBlob(b => res(b), 'image/png');
    });
  }
  function download(blob, name) {
    const u = URL.createObjectURL(blob), el = document.createElement('a');
    el.href = u; el.download = name; document.body.appendChild(el); el.click(); el.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {}
    try { // older fallback when the async clipboard is blocked
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
    } catch (e) { return false; }
  }
  G._cardBlob = a => toBlob(G.shareCard(a));
  // share any pixel surface: 'share' (system sheet, else PNG download + copied text), 'save', 'copy' (text), 'link'
  G.shareImage = async function (surface, text, filename, how, url) {
    if (typeof document === 'undefined') return 'unsupported';
    if (how === 'copy') return (await copy(text)) ? 'COPIED THE TEXT!' : "COULDN'T COPY";
    if (how === 'link') return (await copy(url || text)) ? 'LINK COPIED!' : "COULDN'T COPY THE LINK";
    const blob = await toBlob(surface);
    if (how === 'save') { download(blob, filename); return 'SAVED ' + filename.toUpperCase(); }
    const file = typeof File !== 'undefined' ? new File([blob], filename, { type: 'image/png' }) : null;
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share(Object.assign({ files: [file], title: GAME, text }, url ? { url } : {})); return 'SHARED!'; } catch (e) { if (e && e.name === 'AbortError') return 'SHARE CANCELLED'; }
    }
    download(blob, filename); const ok = await copy(text);
    return ok ? 'IMAGE SAVED, TEXT COPIED!' : 'IMAGE SAVED!';
  };
  G.shareAchievement = function (a, how) {
    const name = 'claude-red-' + a.id.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.png';
    return G.shareImage(typeof document === 'undefined' ? null : G.shareCard(a), G.shareText(a), name, how, G.momentLink(a));
  };

  // ---------------- share screen ----------------
  const OPTS = ['SHARE', 'COPY LINK', 'SAVE PNG', 'COPY TEXT', 'CLOSE'], HOW = ['share', 'link', 'save', 'copy'];
  class ShareScene {
    constructor(a) { this.opaque = true; this.modal = true; this.a = a; this.card = G.shareCard(a); this.sel = 0; this.msg = ''; this.msgT = 0; this.t = 0; G.sfx && G.sfx('select'); }
    update(f) {
      this.t++; if (this.msgT > 0) this.msgT--;
      if (!f) return;
      const I = G.input.pressed, Pt = G.pointer;
      let click = false;
      if (Pt && (Pt.moved || Pt.pressed) && this.btns) { // hover/click the buttons
        const i = this.btns.findIndex(b => Pt.in(...b));
        if (i >= 0 && i !== this.sel) { this.sel = i; if (!Pt.pressed) G.sfx && G.sfx('cursor'); }
        if (Pt.pressed) { Pt.consume(); click = i >= 0; }
      }
      if (click) I.a = true;
      if (I.left || I.up) { this.sel = (this.sel + OPTS.length - 1) % OPTS.length; G.sfx && G.sfx('cursor'); }
      else if (I.right || I.down) { this.sel = (this.sel + 1) % OPTS.length; G.sfx && G.sfx('cursor'); }
      else if (I.b || (I.a && OPTS[this.sel] === 'CLOSE')) { G.engine.pop(this); G.input.clear && G.input.clear(); }
      else if (I.a) {
        const how = HOW[this.sel];
        this.msg = 'WORKING...'; this.msgT = 600;
        G.shareAchievement(this.a, how).then(m => { this.msg = m; this.msgT = 150; }, () => { this.msg = 'SHARE FAILED'; this.msgT = 150; });
      }
    }
    draw(s) {
      s.blit(this.card, 0, 0);
      // action bar (not part of the exported image)
      const y = 180 - 16;
      s.rect(0, y, 320, 16, hex('#0a0814')); s.hline(0, 319, y, hex('#3a3058'));
      let x = 5; this.btns = [];
      OPTS.forEach((o, i) => {
        const w = F.measure(o) + 12, on = i === this.sel;
        s.rect(x, y + 2, w, 12, on ? hex('#ffe070') : hex('#2a2440'));
        F.draw(s, o, x + 6, y + 3, on ? hex('#1a1428') : hex('#d8d0f0'));
        this.btns.push([x, y, w, 16]); x += w + 3;
      });
      if (this.msgT > 0) { // status bubble above the bar
        const w = F.measureSmall(this.msg) + 10;
        s.rect(316 - w, y - 12, w, 10, hex('#0a0814')); F.drawSmall(s, this.msg, 311 - w + 5, y - 10, hex('#b8f0a0'));
      }
    }
  }
  G.ShareScene = ShareScene;
  G.shareMoment = function* (a) { const sc = new ShareScene(a); G.engine.push(sc); while (G.engine.scenes.includes(sc)) yield; };

  // Opening a shared link (?moment=...): show that card with PLAY / SAVE PNG
  G.showMoment = function (enc) {
    const m = G.decodeMoment(enc); if (!m) return false;
    G.state = G.newState();
    Object.assign(G.state, { name: m.name, rival: m.rival, badges: m.badges, look: m.look });
    G.applyLook(m.look);
    const card = G.shareCard(m.a), btns = ['PLAY POKéMON CLAUDE RED', 'SAVE PNG'];
    const scene = { opaque: true, modal: true, sel: 0, t: 0, msg: '', msgT: 0, rects: [], update(f) {
      this.t++; if (this.msgT > 0) this.msgT--; if (!f) return;
      const I = G.input.pressed, Pt = G.pointer;
      let click = false;
      if (Pt && (Pt.moved || Pt.pressed)) { const i = this.rects.findIndex(r => Pt.in(...r)); if (i >= 0) this.sel = i; if (Pt.pressed) { Pt.consume(); click = i >= 0; } }
      if (I.left || I.right || I.up || I.down) { this.sel ^= 1; G.sfx && G.sfx('cursor'); }
      if (!(I.a || I.start || click)) return;
      if (this.sel === 1) { G.shareAchievement(m.a, 'save').then(t => { this.msg = t; this.msgT = 150; }); return; }
      try { history.replaceState(null, '', location.pathname); } catch (e) {}
      G.engine.pop(scene); G.state = null; G.titleScreen();
    }, draw(s) {
      s.blit(card, 0, 0);
      const y = 164; s.rect(0, y, 320, 16, hex('#0a0814')); s.hline(0, 319, y, hex('#3a3058'));
      let x = 5; this.rects = [];
      btns.forEach((b, i) => { const w = F.measure(b) + 12, on = i === this.sel; s.rect(x, y + 2, w, 12, on ? hex('#ffe070') : hex('#2a2440')); F.draw(s, b, x + 6, y + 3, on ? hex('#1a1428') : hex('#d8d0f0')); this.rects.push([x, y, w, 16]); x += w + 3; });
      if (this.msgT > 0) { const w = F.measureSmall(this.msg) + 10; s.rect(316 - w, y - 12, w, 10, hex('#0a0814')); F.drawSmall(s, this.msg, 311 - w + 5, y - 10, hex('#b8f0a0')); }
    } };
    G.engine.push(scene);
    return true;
  };

  // START > SHARE: every recorded moment, newest first, plus a trainer card
  G.shareMenu = function* () {
    const list = [{ id: 'card_' + G.state.name, kind: 'card', data: {}, t: G.state.playTime, date: Date.now(), badges: G.state.badges.length, dex: Object.keys(G.state.dex.caught).length }]
      .concat((G.state.achievements || []).slice().reverse());
    let sel = 0, top = 0;
    const scene = { opaque: false, done: false, update(f) {
      if (!f) return;
      const I = G.input.pressed;
      const Pt = G.pointer;
      if (Pt && (Pt.moved || Pt.pressed) && Pt.inside) { // hover/tap rows (the click arrives as A), wheel scrolls
        let hit = -1;
        for (let i = 0; i < 8 && top + i < list.length; i++) if (Pt.in(14, 30 + i * 17, 292, 17)) hit = top + i;
        if (hit >= 0) sel = hit; else if (Pt.pressed) Pt.consume();
      }
      if (I.up) sel = (sel + list.length - 1) % list.length; else if (I.down) sel = (sel + 1) % list.length;
      if (I.up || I.down) G.sfx && G.sfx('cursor');
      if (I.b) this.done = true;
      if (I.a) this.pick = list[sel];
      top = Math.max(0, Math.min(sel - 3, list.length - 8));
    }, draw(s) {
      G.ui.frame(s, 8, 8, 304, 164);
      F.draw(s, 'SHARE A MOMENT', 20, 14, G.ui.INK);
      list.slice(top, top + 8).forEach((a, i) => {
        const k = top + i, y = 32 + i * 17, [l1, l2] = G.achievementTitle(a);
        if (k === sel) { s.rect(14, y - 2, 292, 15, hex('#f8e8c0')); G.ui.cursor(s, 16, y); }
        F.draw(s, (l1 + ' ' + l2).replace(/\s+/g, ' '), 30, y, G.ui.INK);
        F.drawSmall(s, a.kind === 'card' ? 'NOW' : playTime(a.t), 300 - F.measureSmall(a.kind === 'card' ? 'NOW' : playTime(a.t)), y + 3, hex('#8a8098'));
      });
    } };
    G.engine.push(scene);
    for (;;) {
      yield;
      if (scene.done) break;
      if (scene.pick) { const a = scene.pick; scene.pick = null; yield* G.shareMoment(a); }
    }
    G.engine.pop(scene);
  };
})(window.G);
