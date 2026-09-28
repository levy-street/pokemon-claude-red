// Gameplay analytics: a small, anonymous event log (tools/serve.py stores it; `python3 tools/serve.py stats` reports).
// Every shareable moment (badges, the Elite Four, catches, evolutions, the Hall of Fame, Tower streaks, link battles,
// trades) is logged, plus the milestones between them: new games, first visits to towns and dungeons, blackouts,
// saves, quiz scores, glitches found, shares, and a heartbeat with where the player is.
//
// A save gets its own random id (kept in the save, so it follows cloud saves and transfers) and the browser gets
// another. Events carry the map, badge count, Pokédex count and play time. No emails, names of real people or IP
// addresses (the server keeps only the country), and nothing at all when the browser sends Do Not Track or Global
// Privacy Control. Without the site server (file://, static hosting) the first failed send turns it off.
(function (G) {
  'use strict';
  const browser = typeof document !== 'undefined' && !!document.getElementById && typeof fetch !== 'undefined' && typeof location !== 'undefined';
  const off = !browser || location.protocol === 'file:' || navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true;
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const put = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const rid = () => { let s = ''; for (let i = 0; i < 12; i++) s += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]; return s; };
  const returning = !!get('claudered_bid'), bid = get('claudered_bid') || rid(); put('claudered_bid', bid);
  const sid = rid();
  const endpoint = () => ((document.querySelector('meta[name="subscribe-endpoint"]') || {}).content || 'api/subscribe').replace(/subscribe$/, 'events');
  const queue = [];
  let dead = off, timer = null, errors = 0;

  // saves from before this existed get an id from their trainer ID and name, so every CONTINUE counts as one player
  function pidFor(S) {
    if (!S.pid) { let h = 5381; for (const c of String(S.name) + ':' + (S.trainerId || 0)) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0; S.pid = S.playTime ? 'L' + h.toString(36) : rid(); }
    return S.pid;
  }
  function where() {
    const S = G.state;
    if (!S || !S.name) return {};
    return { pid: pidFor(S), map: G.ow && G.ow.map ? G.ow.map.name : S.map, b: (S.badges || []).length, x: Object.keys((S.dex && S.dex.caught) || {}).length, pt: Math.floor((S.playTime || 0) / 60) };
  }
  G.track = function (k, d) {
    if (dead) return;
    queue.push(Object.assign({ k, d: d || null, t: Date.now() }, where()));
    if (queue.length >= 25) flush();
    else if (!timer) timer = setTimeout(flush, 8000);
  };
  function flush(leaving) {
    clearTimeout(timer); timer = null;
    if (dead || !queue.length) return;
    const body = JSON.stringify({ bid, sid, ev: queue.splice(0, 40) });
    if (leaving && navigator.sendBeacon) { try { navigator.sendBeacon(endpoint(), new Blob([body], { type: 'application/json' })); } catch (e) {} }
    else fetch(endpoint(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: body.length < 60000 })
      .then(r => { if (r.status === 404 || r.status === 405 || r.status === 501) dead = true; }).catch(() => {});
    if (queue.length) timer = setTimeout(flush, 500);
  }
  const lead = () => { const p = (G.state && G.state.party) || []; return p.length ? Math.max(...p.map(m => m.level)) : 0; };

  // ---------------- milestones and moments ----------------
  // every shareable moment (src/game/share.js), with the details that matter for the numbers
  const origAchieve = G.achieve;
  G.achieve = function (id, kind, data) {
    const a = origAchieve.apply(this, arguments);
    if (a) {
      const d = data || {}, o = { id, kind };
      for (const f of ['sp', 'lv', 'cls', 'badge', 'n', 'from', 'place']) if (d[f] !== undefined) o[f] = d[f];
      if (d.ace) o.ace = d.ace.species || d.ace;
      if (d.team) o.team = d.team.map(t => t.species || t).slice(0, 6);
      if (kind === 'hof' || kind === 'champion') o.lead = lead();
      G.track('moment', o);
    }
    return a;
  };
  const origShare = G.shareAchievement;
  G.shareAchievement = function (a, how) {
    const p = origShare.apply(this, arguments);
    Promise.resolve(p).then(m => G.track('share', { id: a.id, kind: a.kind, how, result: String(m || '').slice(0, 40) }), () => G.track('share', { id: a.id, kind: a.kind, how, result: 'failed' }));
    return p;
  };
  // first visits to every town and the big places between them: where players get to, and where they stop
  const AREAS = new Set(['OaksLab', 'ViridianForest', 'MtMoon1F', 'BillsHouse', 'SSAnne1F', 'DiglettsCave', 'RockTunnel1F', 'PokemonTower1F', 'GameCorner', 'RocketHideoutB1F',
    'CeladonMart1F', 'Route17', 'SafariZoneCenter', 'FightingDojo', 'SilphCo1F', 'PowerPlant', 'SeafoamIslands1F', 'PokemonMansion1F', 'Route22Gate', 'VictoryRoad1F',
    'IndigoPlateauLobby', 'LancesRoom', 'ChampionsRoom', 'HallOfFame', 'CeruleanCave1F', 'SocialZone']);
  const OW = G.Overworld.prototype, origLoad = OW.load;
  OW.load = function (name) {
    const r = origLoad.apply(this, arguments), S = G.state;
    if (S && S.name && ((G.FLY_SPOTS && G.FLY_SPOTS[name]) || AREAS.has(name))) {
      S.seen = S.seen || [];
      if (!S.seen.includes(name)) { S.seen.push(name); G.track('area', { lead: lead(), party: S.party.length }); }
    }
    return r;
  };
  // (blackouts are logged where they happen, in src/game/battleflow.js)
  // glitch POKéMON (MissingNo., 'M and friends) met in the wild
  const origWild = G.startWildBattle;
  G.startWildBattle = function (sp, lv) {
    if (/^(MISSINGNO|GLITCH)/.test(sp)) G.track('glitch', { what: 'missingno', sp, lv });
    return origWild.apply(this, arguments);
  };
  const origSave = G.saveGame;
  G.saveGame = function () { const ok = origSave.apply(this, arguments); G.track('save', { name: G.state.name, lead: lead(), party: G.state.party.map(m => m.species) }); return ok; };

  // ---------------- sessions ----------------
  if (!off) {
    const q = location.search;
    const land = (q.match(/[?&](moment|team|trade|tradeback|wtp|importsave)\b/) || location.hash.match(/(importsave)/) || [])[1] || null;
    G.track('open', { ref: G.visitSource || 'direct', land, returning, touch: !!G.touchUI, w: window.innerWidth, h: window.innerHeight, lang: (navigator.language || '').slice(0, 8) });
    // a heartbeat every 5 minutes the game is actually on screen, so we know where players are even if they never save
    let visible = 0;
    setInterval(() => { if (!document.hidden && G.state && G.state.name && G.ow && ++visible % 5 === 0) G.track('ping', { lead: lead() }); }, 60000);
    let away = false; // hiding the tab and closing it both land here: one 'bye' each time the player leaves
    const bye = () => { if (!away && G.state && G.state.name && G.ow) G.track('bye', { lead: lead() }); away = true; flush(true); };
    document.addEventListener('visibilitychange', () => { if (document.hidden) bye(); else away = false; });
    window.addEventListener('pagehide', bye);
    // errors, a few per session
    const origErr = G.onError;
    G.onError = function (e) { if (errors++ < 5) G.track('error', { m: String(e && (e.stack || e.message) || e).slice(0, 400) }); if (origErr) return origErr.apply(this, arguments); };
    window.addEventListener('error', e => { if (errors++ < 5) G.track('error', { m: String(e.message || '').slice(0, 200), src: String(e.filename || '').split('/').pop().split('?')[0] + ':' + e.lineno }); });
  }
})(window.G);
