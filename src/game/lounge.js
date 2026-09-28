// SOCIAL ZONE, live. Everyone in the lounge shares the room (tools/lounge.py relays it): you see who's here and where
// they're walking, their name tags and chat bubbles, who's queuing for a battle and who's mid-battle. Talk to anyone
// (or press SELECT for the list) to offer a LINK BATTLE or a TRADE, or join the random-match queue at the LINK BATTLE
// desk. T (or the chat button on phones) opens the chat line.
//
// A link battle runs in both games at once. Each game plays its own team at the bottom and sends only its picks; the
// two games share a random seed (src/game/battle.js), so they compute the same turn. The host also sends a checksum and
// a snapshot each turn, and a guest that ever drifts takes the host's numbers.
//
// Without the site server (file://, static hosting) the lounge is simply empty and the desks offer the old links.
(function (G) {
  'use strict';
  const SI = G.socialInternals;
  const ZONE = SI.ZONE, VERSION = 1, DIRS = ['down', 'up', 'left', 'right'];
  const { hex, mix } = G.gfx, F = G.font;
  const browser = typeof document !== 'undefined' && !!document.getElementById && typeof WebSocket !== 'undefined' && typeof location !== 'undefined';
  const say = t => G.say(t);
  const inZone = () => !!(G.ow && G.ow.map && G.ow.map.name === ZONE);

  // ================================================================ connection
  const net = { state: 'offline', mode: 'ws', ws: null, id: null, key: null, room: 1, since: 0, want: false, tries: 0, wsFails: 0, outq: [], timer: null, error: null };
  function apiURL(path) {
    const base = ((document.querySelector('meta[name="subscribe-endpoint"]') || {}).content || 'api/subscribe').replace(/subscribe$/, '');
    return new URL(base + path, location.href);
  }
  function hello() {
    const st = G.state, p = G.ow && G.ow.player;
    return { t: 'hello', v: VERSION, name: st.name, look: st.look || {}, x: p ? p.x : 11, y: p ? p.y : 12, key: net.key, since: net.since };
  }
  function connect() {
    if (!browser || location.protocol === 'file:' || net.error) { net.state = 'offline'; return; }
    net.want = true; net.state = 'connecting'; clearTimeout(net.timer);
    if (net.mode === 'poll') { pollLoop(); return; }
    const u = apiURL('lounge/ws'); u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    let ws, opened = false;
    try { ws = net.ws = new WebSocket(u.href); } catch (e) { net.mode = 'poll'; pollLoop(); return; }
    ws.onopen = () => {
      opened = true; net.tries = 0; net.wsFails = 0;
      ws.send(JSON.stringify(hello()));
      if (net.key) { flush(); net.state = 'online'; } // resuming: the server replays what we missed
    };
    ws.onmessage = e => { let a; try { a = JSON.parse(e.data); } catch (_) { return; } for (const m of Array.isArray(a) ? a : [a]) receive(m); };
    ws.onclose = () => {
      if (net.ws !== ws) return;
      net.ws = null;
      if (!opened && ++net.wsFails >= 2) net.mode = 'poll'; // WebSockets blocked on this network: fall back to polling
      retry();
    };
  }
  function retry() {
    if (!net.want || net.error) { net.state = 'offline'; return; }
    net.state = 'connecting';
    const wait = Math.min(15000, 800 * Math.pow(2, net.tries++));
    net.timer = setTimeout(connect, wait);
  }
  function disconnect() {
    net.want = false; clearTimeout(net.timer);
    if (net.state === 'online') send({ t: 'bye' });
    const ws = net.ws; net.ws = null;
    if (ws) try { ws.close(); } catch (e) {}
    net.state = 'offline'; net.key = null; net.id = null; net.since = 0; net.outq.length = 0;
    clearLounge();
  }
  function send(m) {
    if (!browser) return;
    if (net.mode === 'ws' && net.ws && net.ws.readyState === 1 && net.state === 'online') { net.ws.send(JSON.stringify(m)); return; }
    if (m.t === 'pos' || m.t === 'st') return; // stale by the time we're back
    net.outq.push(m);
    if (net.mode === 'poll' && net.state === 'online') pollSend();
  }
  function flush() {
    const q = net.outq.splice(0);
    if (net.mode === 'ws' && net.ws && net.ws.readyState === 1) { if (q.length) net.ws.send(JSON.stringify(q)); }
    else if (q.length) { net.outq.push(...q); pollSend(); }
  }
  // ---- long polling, for networks that block WebSockets
  let polling = false, pollSending = false;
  async function pollLoop() {
    if (polling) return; polling = true;
    while (net.want && net.mode === 'poll' && !net.error) {
      try {
        if (!net.key) {
          const r = await fetch(apiURL('lounge/hello'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(hello()) });
          const j = await r.json();
          if (j.t === 'error') { receive(j); break; }
          net.since = 0; receive(Object.assign({ q: j.q }, j.welcome)); net.key = j.key; flush();
        }
        const r = await fetch(apiURL('lounge/poll?k=' + encodeURIComponent(net.key) + '&since=' + net.since), { cache: 'no-store' });
        if (r.status === 410) { net.key = null; continue; } // forgotten (a server restart): join again
        if (!r.ok) throw new Error(r.status);
        const list = await r.json();
        net.state = 'online'; net.tries = 0;
        for (const m of list) receive(m);
      } catch (e) {
        net.state = 'connecting';
        await new Promise(res => setTimeout(res, Math.min(15000, 800 * Math.pow(2, net.tries++))));
      }
    }
    polling = false;
  }
  function pollSend() {
    if (pollSending || !net.key) return; pollSending = true;
    setTimeout(async () => {
      const m = net.outq.splice(0);
      try { if (m.length) await fetch(apiURL('lounge/send'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ k: net.key, m }) }); }
      catch (e) { net.outq.unshift(...m); }
      pollSending = false;
      if (net.outq.length) pollSend();
    }, 40);
  }

  // ================================================================ the room
  const ghosts = new Map();   // id -> { id, name, look, s, actor, path, bubble }
  const chat = [];            // { name, text, sys, id, t }
  let queueN = 0, queuedAt = 0, myS = '', meBubble = null;
  const incoming = [];        // battle / trade offers waiting for an answer
  let outgoing = null;        // the offer we're waiting on
  let pendingBattle = null;   // a battle the server started (queue match or accepted offer)
  let link = null;            // the battle in progress
  const trades = {};          // match id and offer id -> latest trade message
  const tradeRef = {};        // match id -> offer id

  function clearLounge() {
    for (const g of ghosts.values()) removeActor(g);
    ghosts.clear(); incoming.length = 0; queueN = 0; queuedAt = 0;
    if (outgoing) outgoing.result = outgoing.result || { msg: 'The link to the SOCIAL ZONE was lost.' };
    if (link && !link.done) link.lost = true;
  }
  function addGhost(p) {
    let g = ghosts.get(p.id);
    if (g) { Object.assign(g, { name: p.name, s: p.s }); return g; }
    const key = 'lounge_' + p.id;
    G.CAST[key] = Object.assign({}, G.lookDef(SI.lookIn(p.look)));
    g = { id: p.id, name: p.name || 'TRAINER', look: p.look, s: p.s || '', path: [], bubble: null };
    g.actor = new G.Actor({ x: p.x, y: p.y, dir: DIRS[p.d] || 'down', sprite: key, ghost: g });
    ghosts.set(p.id, g);
    if (inZone() && !G.ow.actors.includes(g.actor)) G.ow.actors.push(g.actor);
    return g;
  }
  function removeActor(g) { if (G.ow) { const i = G.ow.actors.indexOf(g.actor); if (i >= 0) G.ow.actors.splice(i, 1); } delete G.CAST['lounge_' + g.id]; }
  function line(o) { chat.push(Object.assign({ t: G.frame }, o)); if (chat.length > 40) chat.shift(); }

  function receive(m) {
    if (m.q) { if (m.q <= net.since) return; net.since = m.q; }
    switch (m.t) {
      case 'welcome': {
        const fresh = m.id !== net.id;
        if (fresh && net.id !== null) clearLounge(); // the server forgot us (restart): start over
        net.id = m.id; net.key = m.key; net.room = m.room; net.state = 'online'; queueN = m.queue || 0;
        const seen = new Set(m.players.map(p => p.id));
        for (const [id, g] of ghosts) if (!seen.has(id)) { removeActor(g); ghosts.delete(id); }
        for (const p of m.players) { const g = addGhost(p); g.path = [[p.x, p.y, p.d]]; g.s = p.s; }
        if (fresh) { chat.length = 0; for (const c of m.chat || []) line(c.sys ? { sys: true, text: c.text } : { name: c.name, id: c.id, text: c.text }); }
        if (net.mode === 'ws') flush();
        break;
      }
      case 'error':
        net.error = m.why; net.want = false; net.state = 'offline';
        line({ sys: true, text: m.why === 'version' ? 'A new version of the game is out! Reload the page to join the lounge.' : 'The SOCIAL ZONE is full right now. Try again soon!' });
        break;
      case 'join': addGhost(m.p); line({ sys: true, text: m.p.name + ' came in.', dim: true }); break;
      case 'leave': { const g = ghosts.get(m.id); if (g) { removeActor(g); ghosts.delete(m.id); line({ sys: true, text: g.name + ' left.', dim: true }); } break; }
      case 'pos':
        for (const [id, x, y, d, sp] of m.l) {
          const g = ghosts.get(id); if (!g) continue;
          g.path.push([x, y, d, sp]);
          if (g.path.length > 8) { const last = g.path[g.path.length - 1]; g.path = [last]; Object.assign(g.actor, { x: last[0], y: last[1], moving: false, prog: 0 }); }
        }
        break;
      case 'st': {
        const g = ghosts.get(m.id); if (g) g.s = m.s;
        if (m.id === net.id) { if (myS === 'queue' && m.s !== 'queue') queuedAt = 0; myS = m.s; }
        break;
      }
      case 'say': {
        line({ name: m.name, id: m.id, text: m.text });
        const g = ghosts.get(m.id);
        if (g) g.bubble = { text: m.text, t: G.frame }; else if (m.id === net.id) meBubble = { text: m.text, t: G.frame };
        if (m.id !== net.id && G.sfx) G.sfx('blip');
        break;
      }
      case 'sys': line({ sys: true, text: m.text }); break;
      case 'queue': queueN = m.n; break;
      case 'offer':
        incoming.push(m); G.sfx && G.sfx('exclaim');
        line({ sys: true, text: m.name + (m.kind === 'battle' ? ' challenged you to a battle!' : ' wants to trade!'), me: true });
        break;
      case 'offered': if (outgoing && outgoing.ref === m.ref) { outgoing.id = m.id; if (outgoing.cancelled) send({ t: 'cancel', id: m.id }); } break;
      case 'declined':
        if (outgoing && (outgoing.id === m.id || outgoing.ref === m.id) && !outgoing.result) {
          const n = outgoing.name;
          outgoing.result = { msg: { no: n + ' said no this time.', busy: n + ' is busy right now.', timeout: n + " didn't answer.", gone: n + ' has left the lounge.', cancelled: 'You called it off.' }[m.why] || n + " can't right now." };
        }
        break;
      case 'cancelled': { const i = incoming.findIndex(o => o.id === m.id); if (i >= 0) incoming.splice(i, 1); trades[m.id] = { stage: 'cancel', why: m.why }; break; }
      case 'battle':
        pendingBattle = m; link = new Link(m);
        if (outgoing && !outgoing.result) outgoing.result = { battle: m };
        if (queuedAt) queuedAt = 0;
        break;
      case 'bt': if (link && link.mid === m.mid) link.inbox.push(m); break;
      case 'gone': if (link && link.mid === m.mid) link.gone = true; break;
      case 'ended': if (link && link.mid === m.mid) link.ended = m.r; break;
      case 'trade': {
        if (m.ref) tradeRef[m.mid] = m.ref;
        const ref = m.ref || tradeRef[m.mid];
        trades[m.mid] = m; if (ref) trades[ref] = m;
        if (outgoing && outgoing.kind === 'trade' && outgoing.id === m.ref && m.stage === 'confirm' && !outgoing.result) outgoing.result = { trade: m };
        break;
      }
    }
  }

  // ================================================================ walking together
  let lastPos = '', lastSt = '', stT = 0;
  function tick() {
    if (!inZone()) return;
    for (const g of ghosts.values()) stepGhost(g);
    if (net.state !== 'online') return;
    const p = G.ow.player;
    let x = p.x, y = p.y;
    if (p.moving && !p.jump) { x += G.DIRS[p.mdir][0]; y += G.DIRS[p.mdir][1]; }
    const k = x + ',' + y + ',' + p.dir;
    if (k !== lastPos) { lastPos = k; send({ t: 'pos', x, y, d: DIRS.indexOf(p.dir), s: p.moving ? p.speed : 1 }); }
    // "busy" shows a ... over your head while you're in a menu or a conversation
    const st = document.hidden ? 'away' : G.engine.top() === G.ow && !G.scriptRunning ? '' : 'menu';
    if (st !== lastSt && ++stT > 20) { lastSt = st; stT = 0; send({ t: 'st', s: st }); } else if (st === lastSt) stT = 0;
    // offers and matches wait until you're free to answer them
    if (free()) {
      if (pendingBattle && !pendingBattle.taken) G.spawnScript(pvpBattle(pendingBattle), 'lounge-battle');
      else if (incoming.length) G.spawnScript(answerOffer(incoming.shift()), 'lounge-offer');
    }
  }
  function free() { return G.engine.top() === G.ow && !G.scriptRunning && !G.ow.player.moving && !G.ow.locks && !chatOpen(); }
  function stepGhost(g) {
    const a = g.actor;
    if (a.moving) { a.update(); if (a.moving) return; }
    while (g.path.length) {
      const [x, y, d, sp] = g.path[0], dx = x - a.x, dy = y - a.y;
      if (!dx && !dy) { a.dir = DIRS[d] || a.dir; g.path.shift(); continue; }
      if (Math.abs(dx) + Math.abs(dy) > 6) { a.x = x; a.y = y; continue; }
      const m = G.ow.map, hx = dx > 0 ? 'right' : 'left', vy = dy > 0 ? 'down' : 'up';
      let dir = Math.abs(dx) >= Math.abs(dy) ? hx : vy;
      if (dx && dy) { const [ddx, ddy] = G.DIRS[dir]; if (!m.passable(a.x + ddx, a.y + ddy)) dir = dir === hx ? vy : hx; } // round the table, not through it
      a.startMove(dir, g.path.length > 3 ? 4 : g.path.length > 1 || sp >= 2 ? 2 : 1);
      return;
    }
  }

  // ================================================================ drawing: name tags, bubbles, chat, who's online
  const TAG = { queue: ['LOOKING FOR BATTLE', '#ffe070'], battle: ['IN BATTLE', '#ff8a8a'], trade: ['TRADING', '#80f0a0'], away: ['AWAY', '#9890b8'] };
  function tag(s, name, x, y, st, t) {
    const info = TAG[st], label = info ? info[0] : '', w = Math.max(F.measureSmall(name), label ? F.measureSmall(label) : 0) + 6;
    const h = label ? 15 : 9, x0 = Math.round(x - w / 2), y0 = y - h;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const px = x0 + i, py = y0 + j; if (px >= 0 && py >= 0 && px < s.w && py < s.h && !((i === 0 || i === w - 1) && (j === 0 || j === h - 1))) s.data[py * s.w + px] = mix(s.data[py * s.w + px], hex('#0c0a1c'), 0.62); }
    F.drawSmall(s, name, Math.round(x - F.measureSmall(name) / 2), y0 + 2, hex(st === 'away' ? '#9890b8' : '#ffffff'));
    if (label && ((t >> 4) % 4 || st !== 'queue')) F.drawSmall(s, label, Math.round(x - F.measureSmall(label) / 2), y0 + 8, hex(info[1]));
    return y0;
  }
  function wrapHard(text, w) {
    const out = [];
    for (let l of F.wrap(text, w)) { while (F.measure(l) > w) { let k = l.length - 1; while (k > 1 && F.measure(l.slice(0, k)) > w) k--; out.push(l.slice(0, k)); l = l.slice(k); } out.push(l); }
    return out;
  }
  function bubble(s, text, x, y) {
    const all = wrapHard(text, 116), lines = all.slice(0, 2);
    if (all.length > 2) lines[1] = lines[1].replace(/.{0,2}$/, '') + '..';
    const w = Math.max(...lines.map(l => F.measure(l))) + 8, h = lines.length * 11 + 5, x0 = Math.max(2, Math.min(318 - w, Math.round(x - w / 2))), y0 = Math.max(2, y - h - 3);
    const P = G.PAL;
    s.rect(x0 + 1, y0, w - 2, h, P.white); s.rect(x0, y0 + 1, w, h - 2, P.white);
    s.rect(x0 + 1, y0 - 1, w - 2, 1, P.outline); s.rect(x0 + 1, y0 + h, w - 2, 1, P.outline); s.rect(x0 - 1, y0 + 1, 1, h - 2, P.outline); s.rect(x0 + w, y0 + 1, 1, h - 2, P.outline);
    s.pset(x0, y0, P.outline); s.pset(x0 + w - 1, y0, P.outline); s.pset(x0, y0 + h - 1, P.outline); s.pset(x0 + w - 1, y0 + h - 1, P.outline);
    const tx = Math.round(x) - 2;
    if (y0 + h + 3 <= y) { // the tail, unless the bubble is pinned to the top edge
      s.rect(tx, y0 + h, 4, 1, P.white); s.rect(tx + 1, y0 + h + 1, 2, 1, P.white); s.pset(tx - 1, y0 + h, P.outline); s.pset(tx + 4, y0 + h, P.outline);
      s.pset(tx, y0 + h + 1, P.outline); s.pset(tx + 3, y0 + h + 1, P.outline); s.rect(tx + 1, y0 + h + 2, 2, 1, P.outline);
    }
    lines.forEach((l, i) => F.draw(s, l, x0 + 4, y0 + 3 + i * 11, hex('#282838')));
  }
  function dots(s, x, y, t) { for (let i = 0; i < 3; i++) s.rect(x - 4 + i * 3, y + ((t >> 3) % 3 === i ? -1 : 0), 2, 2, hex('#ffffff')); }
  const BUBBLE_T = 60 * 7;
  const FX = { draw(s, cx, cy, t) {
    if (!inZone()) return false;
    // tags over everyone else, bubbles over whoever spoke
    for (const g of ghosts.values()) {
      const a = g.actor, fr = a.frame(), x = a.px - cx + 8, top = a.py - cy - (fr.h - 16);
      if (x < -60 || x > 380 || top < -40 || top > 220) continue;
      const ty = tag(s, g.name, x, top - 1, g.s, t);
      if (g.s === 'menu') dots(s, x, ty - 5, t);
      if (g.bubble && G.frame - g.bubble.t < BUBBLE_T) bubble(s, g.bubble.text, x, ty - (g.s === 'menu' ? 6 : 0));
    }
    const p = G.ow.player, pfr = p.frame(), px = p.px - cx + 8, ptop = p.py - cy - (pfr.h - 16);
    let py = ptop;
    if (queuedAt) py = tag(s, 'YOU', px, ptop - 1, 'queue', t);
    if (meBubble && G.frame - meBubble.t < BUBBLE_T) bubble(s, meBubble.text, px, py);
    // the LINK BATTLE sign counts who's waiting
    if (queueN > 0) { const l = queueN + ' WAITING'; F.drawSmall(s, l, 11 * 16 - cx - Math.round(F.measureSmall(l) / 2), 17 - cy, hex((t >> 4) % 2 ? '#ffe070' : '#fff4c0'), hex('#120e2a')); }
    hud(s, t);
    return true;
  } };
  function hud(s, t) {
    // who's online, top right
    const n = ghosts.size + 1;
    const txt = net.state === 'online' ? (net.room > 1 ? 'ROOM ' + net.room + '  ' : '') + n + ' ONLINE' : net.state === 'connecting' ? 'CONNECTING' + '...'.slice(0, 1 + ((t >> 4) % 3)) : 'OFFLINE';
    const col = net.state === 'online' ? '#7cff6b' : net.state === 'connecting' ? '#ffe070' : '#ff8a8a';
    const w = F.measureSmall(txt) + 14, x = 316 - w;
    pill(s, x, 4, w, 11);
    s.rect(x + 4, 7, 3, 5, hex(col)); s.rect(x + 3, 8, 5, 3, hex(col));
    F.drawSmall(s, txt, x + 10, 7, hex('#ffffff'));
    if (queuedAt) {
      const sec = Math.floor((Date.now() - queuedAt) / 1000), q = 'IN QUEUE ' + Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
      const qw = F.measureSmall(q) + 8; pill(s, 316 - qw, 17, qw, 11); F.drawSmall(s, q, 320 - qw, 20, hex((t >> 4) % 2 ? '#ffe070' : '#fff4c0'));
    }
    // the chat log, bottom left; more of it while you're typing
    const open = chatOpen(), keep = open ? 8 : 4, rows = [];
    for (let i = chat.length - 1; i >= 0 && rows.length < keep; i--) {
      const c = chat[i]; if (!open && G.frame - c.t > 60 * 14) break;
      const head = c.sys ? '' : c.name + ': ', parts = wrapHard(head + c.text, 226);
      for (let k = parts.length - 1; k >= 0 && rows.length < keep; k--) rows.unshift({ c, text: parts[k], head: k === 0 ? head : '' });
    }
    let y = 178 - rows.length * 11 - (open && G.touchUI ? 0 : 0);
    const fade = c => open ? 1 : Math.min(1, (60 * 14 - (G.frame - c.t)) / 60);
    for (const r of rows) {
      const a = fade(r.c), w = F.measure(r.text) + 6;
      for (let j = 0; j < 11; j++) for (let i = 0; i < w; i++) { const k = (y + j) * s.w + 2 + i; s.data[k] = mix(s.data[k], hex('#0c0a1c'), 0.55 * a); }
      if (a > 0.3) {
        const base = r.c.sys ? (r.c.me ? '#ffe070' : r.c.dim ? '#9890b8' : '#b8f4ff') : '#ffffff';
        if (r.head) { F.draw(s, r.head, 5, y + 1, hex(r.c.id === net.id ? '#ffb070' : '#80d0ff')); F.draw(s, r.text.slice(r.head.length), 5 + F.measure(r.head), y + 1, hex(base)); }
        else F.draw(s, r.text, 5, y + 1, hex(base));
      }
      y += 11;
    }
    if (!open && net.state === 'online') { const h = G.touchUI ? 'SELECT PLAYERS' : 'T CHAT   SELECT PLAYERS'; F.drawSmall(s, h, 316 - F.measureSmall(h), 172, hex('#d8d0f0'), hex('#0c0a1c')); }
  }
  function pill(s, x, y, w, h) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { if ((i === 0 || i === w - 1) && (j === 0 || j === h - 1)) continue; const k = (y + j) * s.w + x + i; s.data[k] = mix(s.data[k], hex('#0c0a1c'), 0.65); }
  }

  // ================================================================ chat line (a page field over the canvas)
  let chatEl = null, chatBtn = null;
  function chatOpen() { return !!(chatEl && !chatEl.hidden); }
  function buildChat() {
    if (chatEl || !browser) return;
    chatEl = document.createElement('form'); chatEl.id = 'lounge-chat'; chatEl.setAttribute('data-chrome', ''); chatEl.hidden = true;
    chatEl.innerHTML = '<input type="text" maxlength="60" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="send" placeholder="Say something to the lounge" aria-label="Chat"><button type="submit">Send</button>';
    document.body.appendChild(chatEl);
    const input = chatEl.querySelector('input');
    chatEl.addEventListener('submit', e => {
      e.preventDefault();
      const text = input.value.trim(); input.value = '';
      if (text && net.state === 'online') send({ t: 'say', text });
      closeChat();
    });
    input.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); closeChat(); } e.stopPropagation(); });
    input.addEventListener('blur', () => setTimeout(() => { if (!input.value.trim()) closeChat(); }, 150));
    chatBtn = document.createElement('button'); chatBtn.id = 'lounge-chat-btn'; chatBtn.type = 'button'; chatBtn.setAttribute('data-chrome', ''); chatBtn.hidden = true;
    chatBtn.setAttribute('aria-label', 'Chat');
    chatBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>';
    chatBtn.addEventListener('click', e => { e.preventDefault(); openChat(); });
    document.body.appendChild(chatBtn);
    window.addEventListener('resize', place);
    window.addEventListener('keydown', e => {
      if (chatOpen() || !inZone() || net.state !== 'online' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if ((e.key === 't' || e.key === 'T' || e.key === '/') && G.engine.top() === G.ow) { e.preventDefault(); openChat(); }
    });
  }
  function place() {
    const c = document.getElementById('screen'); if (!c || !chatEl) return;
    const r = c.getBoundingClientRect(), w = Math.min(r.width - 16, 560);
    chatEl.style.width = w + 'px'; chatEl.style.left = Math.round(r.left + (r.width - w) / 2) + 'px';
    // phones: along the top of the screen, clear of the keyboard; elsewhere along the bottom like any game chat
    chatEl.style.top = Math.round(G.touchUI ? r.top + 8 : r.bottom - 52) + 'px';
    chatBtn.style.left = Math.round(r.right - 46) + 'px'; chatBtn.style.top = Math.round(r.top + r.height * 0.12 + 8) + 'px';
  }
  function openChat() { if (!chatEl) return; place(); chatEl.hidden = false; G.input.clear && G.input.clear(); const i = chatEl.querySelector('input'); i.focus(); }
  function closeChat() { if (!chatEl || chatEl.hidden) return; chatEl.hidden = true; const i = chatEl.querySelector('input'); i.blur(); }
  function showChatButton() { if (chatBtn) { const on = !!G.touchUI && inZone() && net.state === 'online'; if (chatBtn.hidden === on) { chatBtn.hidden = !on; if (on) place(); } } }

  // ================================================================ talking to people: battle / trade offers
  const desc = m => m.name + (m.nick ? ' (' + G.speciesName(m.species) + ')' : '') + ' Lv' + m.level;
  function waitScene(text, done, onCancel) {
    return { t: 0, done: false, update(f) {
      this.t++;
      const r = done(); if (r) { this.result = r; this.done = true; return; }
      if (f && onCancel && this.t > 20 && G.input.pressed.b) onCancel();
    }, draw(s) {
      G.ui.frame(s, 6, 136, 308, 40);
      G.ui.text(s, text + '...'.slice(0, 1 + ((this.t >> 4) % 3)), 18, 146);
      if (onCancel) G.ui.text(s, 'B: CANCEL', 302 - F.measure('B: CANCEL'), 160, hex('#8a83a8'));
    } };
  }
  function* offer(g, kind, payload, waitText) {
    const ref = Math.random().toString(36).slice(2, 10);
    outgoing = { ref, id: null, to: g.id, name: g.name, kind, result: null };
    send(Object.assign({ t: 'offer', to: g.id, kind, ref }, payload));
    const o = outgoing;
    const r = yield* G.engine.run(waitScene(waitText, () => o.result, () => { if (!o.cancelled) { o.cancelled = true; if (o.id) send({ t: 'cancel', id: o.id }); } }));
    if (outgoing === o) outgoing = null;
    if (r.battle && o.id && r.battle.foe.id !== o.to) send({ t: 'cancel', id: o.id });
    return r;
  }
  function* challenge(g) {
    const team = yield* SI.pickTeam(Math.min(3, G.state.party.length), 'Battle ' + g.name + ' with');
    if (!team) return;
    const r = yield* offer(g, 'battle', { team: team.map(m => SI.monOut(m, false)) }, 'Waiting for ' + g.name + ' to answer');
    if (r.battle) yield* pvpBattle(r.battle); else yield* say(r.msg);
  }
  function* tradeWith(g) {
    const pick = yield* SI.pickTeam(1, 'Offer which POKéMON?'); if (!pick) return;
    const mine = pick[0];
    const r = yield* offer(g, 'trade', { mon: SI.monOut(mine, false) }, 'Waiting for ' + g.name + ' to pick a POKéMON');
    if (r.battle) { yield* pvpBattle(r.battle); return; }
    if (!r.trade) { yield* say(r.msg); return; }
    const theirs = SI.monIn(r.trade.mon, g.name, 0), mid = r.trade.mid;
    if (!theirs) { send({ t: 'confirm', mid, ok: false }); yield* say("That POKéMON can't be traded here."); return; }
    yield* say(g.name + ' will trade ' + desc(theirs) + ' (OT ' + theirs.ot + ') for your ' + mine.name + '.');
    const ok = yield* G.ask('Trade ' + mine.name + ' for ' + theirs.name + '?');
    send({ t: 'confirm', mid, ok });
    if (!ok) { yield* say('You called off the trade.'); return; }
    const done = yield* G.engine.run(waitScene('Trading', () => trades[mid] && trades[mid].stage !== 'confirm' && trades[mid]));
    if (done.stage !== 'done') { yield* say('The trade was cancelled.'); return; }
    yield* doTrade(mine, done.mon, g.name, mid);
  }
  function* doTrade(mine, data, from, id) {
    const theirs = SI.monIn(data, from, 0), st = G.state, s = SI.S();
    if (!theirs) return;
    const i = st.party.indexOf(mine); if (i >= 0) st.party.splice(i, 1);
    yield* say(st.name + ' sent ' + mine.name + ' to ' + from + '!');
    yield* G.tradeAnimation(mine, theirs);
    s.trades++;
    G.achieve('trade_' + id, 'trade', { sp: theirs.species, from: mine.species, name: from });
    yield* SI.receive(theirs);
    yield* say('Trade complete! Take good care of ' + theirs.name + '!');
  }
  function* answerOffer(o) {
    if (o.kind === 'battle') {
      yield* say(o.name + ' challenges you to a LINK BATTLE!');
      if (!(yield* G.ask('Battle ' + o.name + '? (' + (o.n || 3) + ' POKéMON each, LEVEL 50)'))) { send({ t: 'answer', id: o.id, ok: false }); return; }
      const team = yield* SI.pickTeam(Math.min(3, G.state.party.length), 'Battle ' + o.name + ' with');
      if (!team) { send({ t: 'answer', id: o.id, ok: false }); return; }
      if (trades[o.id] && trades[o.id].stage === 'cancel') { yield* say(o.name + ' is no longer waiting.'); return; }
      send({ t: 'answer', id: o.id, ok: true, team: team.map(m => SI.monOut(m, false)) });
      const r = yield* G.engine.run(waitScene('Linking with ' + o.name, () => (pendingBattle && !pendingBattle.taken && pendingBattle.foe.id === o.from && { battle: pendingBattle }) || (trades[o.id] && trades[o.id].stage === 'cancel' && { msg: o.name + ' is no longer waiting.' })));
      if (r.battle) yield* pvpBattle(r.battle); else yield* say(r.msg);
      return;
    }
    const theirs = SI.monIn(o.mon, o.name, 0);
    if (!theirs) { send({ t: 'answer', id: o.id, ok: false }); return; }
    yield* say(o.name + ' offers ' + desc(theirs) + ' (OT ' + theirs.ot + ') for a trade!');
    if (!(yield* G.ask('Trade one of your POKéMON for ' + theirs.name + '?'))) { send({ t: 'answer', id: o.id, ok: false }); return; }
    const pick = yield* SI.pickTeam(1, 'Trade which POKéMON?');
    if (!pick) { send({ t: 'answer', id: o.id, ok: false }); return; }
    send({ t: 'answer', id: o.id, ok: true, mon: SI.monOut(pick[0], false) });
    const r = yield* G.engine.run(waitScene('Waiting for ' + o.name + ' to accept', () => { const m = trades[o.id]; return m && m.stage !== 'wait' && m; }));
    if (r.stage !== 'done') { yield* say(r.why === 'timeout' || r.why === 'gone' ? o.name + ' is no longer waiting.' : o.name + ' called off the trade.'); return; }
    yield* doTrade(pick[0], r.mon, o.name, r.mid);
  }
  function* playerMenu(g) {
    if (!ghosts.has(g.id)) { yield* say(g.name + ' has left the lounge.'); return; }
    const busy = { battle: ' is in a battle right now.', trade: ' is in the middle of a trade.', away: " isn't answering right now." }[g.s];
    if (busy) { yield* say(g.name + busy); return; }
    const intro = g.s === 'queue' ? g.name + ' is looking for a battle!' : 'What would you like to do with ' + g.name + '?';
    yield* G.say(intro, { noWait: true });
    const bg = new G.ui.StaticBox(intro); G.engine.push(bg);
    let r; try { r = yield* G.choose(['BATTLE', 'TRADE', 'CANCEL']); } finally { G.engine.pop(bg); }
    if (!ghosts.has(g.id)) { if (r === 0 || r === 1) yield* say(g.name + ' has left the lounge.'); return; }
    if (r === 0) yield* challenge(g);
    else if (r === 1) yield* tradeWith(g);
  }
  function* roster() {
    if (net.state !== 'online') { yield* say(net.error === 'version' ? 'A new version of the game is out! Reload the page to join the lounge.' : 'Connecting to the SOCIAL ZONE... try again in a moment.'); return; }
    const list = [...ghosts.values()].sort((a, b) => a.name.localeCompare(b.name));
    if (!list.length) { yield* say("Nobody else is in the lounge right now.\fSend a friend to claudered.dev and meet them here!"); return; }
    const label = g => g.name + ({ queue: '  WANTS A BATTLE', battle: '  IN BATTLE', trade: '  TRADING', away: '  AWAY', menu: '  BUSY' }[g.s] || '');
    const r = yield* G.choose(list.map(label).concat(['CANCEL']), { x: 60, y: 4, w: 254 });
    if (r >= 0 && r < list.length) yield* playerMenu(list[r]);
  }

  // ================================================================ link battles
  function seeded(seed) {
    let a = seed >>> 0;
    const f = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    f.state = () => a; f.set = v => { a = v >>> 0; };
    return f;
  }
  function stable(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => k + ':' + stable(v[k])).join(',') + '}';
  }
  function fnv(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); }
  const sideSnap = sd => ({ idx: sd.idx, f: !!sd.fainted, v: JSON.parse(JSON.stringify(sd.v)), m: sd.party.map(m => ({ hp: m.hp, st: m.status || null, sl: m.sleep || 0, mv: m.moves.map(x => [x.id, x.pp, x.max]) })) });
  class Link {
    constructor(m) {
      this.mid = m.mid; this.host = m.host; this.foe = m.foe; this.rng = seeded(m.seed); this.inbox = []; this.resyncs = 0;
      this.p2Action = this.p2Action.bind(this); this.replace = this.replace.bind(this);
    }
    order(b) { return this.host ? [b.p, b.e] : [b.e, b.p]; } // the host's side first, in both games
    hash(b) { return fnv(this.rng.state() + '|' + this.order(b).map(sd => stable(sideSnap(sd))).join('|')); }
    snap(b) { return { r: this.rng.state(), s: this.order(b).map(sideSnap) }; }
    apply(b, snap) {
      this.rng.set(snap.r);
      this.order(b).forEach((sd, i) => {
        const x = snap.s[i]; if (!x) return;
        sd.idx = x.idx; sd.fainted = x.f; sd.v = x.v;
        x.m.forEach((o, k) => { const m = sd.party[k]; if (!m) return; m.hp = o.hp; m.status = o.st; m.sleep = o.sl; o.mv.forEach(([id, pp, max], j) => { if (m.moves[j]) Object.assign(m.moves[j], { id, pp, max }); }); });
      });
      if (b.ui && b.ui.disp) { b.ui.disp.p = b.mon(b.p).hp; b.ui.disp.e = b.mon(b.e).hp; }
    }
    send(b, k, a, extra) { send(Object.assign({ t: 'bt', mid: this.mid, turn: b.turn, k, a }, extra || {})); }
    forfeit(b) { this.send(b, 'forfeit', null); }
    // wait for the other game's next message of this kind; the battle box says who we're waiting on
    *wait(b, kind) {
      const ui = b.ui, name = this.foe.name;
      for (let t = 0; ; t++) {
        const i = this.inbox.findIndex(m => m.k === kind || m.k === 'forfeit');
        if (i >= 0) { if (t > 0) ui.box = null; return this.inbox.splice(i, 1)[0]; }
        const end = this.gone ? { type: 'end', result: 'win', msg: name + ' left the battle.' }
          : this.lost ? { type: 'end', result: 'draw', msg: 'The link was lost...' }
          : this.ended ? (this.ended === 'win' ? { type: 'end', result: 'lose', msg: 'The link with ' + name + ' ended.' } : this.ended === 'draw' ? { type: 'end', result: 'draw' } : { type: 'end', result: 'win', msg: name + ' left the battle.' })
          : t > 60 * 150 ? { type: 'end', result: 'win', msg: name + ' stopped responding.' } : null;
        if (end) { ui.box = null; return end; }
        if (t === 12) ui.box = { lines: ['Waiting for ' + name + '...'], chars: 999, waiting: false };
        if (t === 60 * 45) ui.box = { lines: ['Waiting for ' + name + '...', name + ' is taking a while.'], chars: 999, waiting: false };
        yield;
      }
    }
    *p2Action(b, pAct) {
      const act = pAct.type === 'switch' ? { type: 'switch', index: pAct.index } : { type: 'fight', move: pAct.move };
      const h = this.hash(b);
      this.send(b, 'act', act, { h, snap: this.host ? this.snap(b) : undefined });
      const m = yield* this.wait(b, 'act');
      if (m.type === 'end') return m;
      if (m.k === 'forfeit') return { type: 'end', result: 'win', msg: this.foe.name + ' forfeited the battle!' };
      // the two games drifted apart: the guest takes the host's numbers
      if (!this.host && m.snap && m.h !== h) { this.apply(b, m.snap); this.resyncs++; console.warn('link battle resynced on turn', b.turn); }
      return this.sanitize(b, m.a);
    }
    sanitize(b, a) {
      const side = b.e;
      if (a && a.type === 'switch') { const i = a.index | 0, m = side.party[i]; if (m && m.hp > 0 && i !== side.idx) return { type: 'switch', index: i }; }
      if (a && a.type === 'fight' && typeof a.move === 'string' && (a.move === '_RECHARGE' || a.move === '_TRAPPED' || G.DATA.moves[a.move])) return { type: 'fight', move: a.move };
      return { type: 'fight', move: 'STRUGGLE' };
    }
    *replace(b, which) {
      if (which === 'p') { const idx = yield* b.ui.partyMenu(true); this.send(b, 'rep', idx); return idx; }
      const m = yield* this.wait(b, 'rep');
      if (m.type === 'end') return m;
      if (m.k === 'forfeit') return { type: 'end', result: 'win', msg: this.foe.name + ' forfeited the battle!' };
      const i = m.a | 0, mon = b.e.party[i];
      return mon && mon.hp > 0 ? i : b.e.party.findIndex(x => x.hp > 0);
    }
  }
  function* pvpBattle(m) {
    m.taken = true;
    if (pendingBattle === m) pendingBattle = null;
    const lk = link && link.mid === m.mid ? link : (link = new Link(m));
    const st = G.state, s = SI.S(), foe = m.foe;
    const build = (list, name) => (Array.isArray(list) ? list : []).slice(0, 6).map(o => SI.monIn(Object.assign({}, o, { l: 50 }), name, 0)).filter(Boolean);
    const mine = build(m.teams[m.host ? 0 : 1], st.name), foes = build(m.teams[m.host ? 1 : 0], foe.name);
    if (!mine.length || !foes.length) { send({ t: 'end', mid: m.mid, r: 'draw' }); yield* say('The link battle could not start.'); return; }
    G.CAST.lounge_foe = G.lookDef(SI.lookIn(foe.look));
    const pic = G.castPortrait('lounge_foe'), saved = st.party;
    let res = 'draw';
    st.party = mine;
    try {
      res = yield* G.runBattle({ type: 'trainer', enemyParty: foes, trainer: { cls: 'COOLTRAINER_M', displayName: foe.name, money: 0, pic }, trainerItems: [],
        transition: 'boss', music: 'gym_leader', noBlackout: true, noExp: true, noItems: true, noBadgeBoost: true, p2Action: lk.p2Action, pvp: lk });
    } finally { st.party = saved; lk.done = true; if (link === lk) link = null; }
    send({ t: 'end', mid: m.mid, r: res });
    if (res === 'win') { s.pvpWins++; G.achieve('pvp_live_' + foe.name, 'pvp', { name: foe.name, team: foes.map(x => x.species) }); yield* say('You won the link battle against ' + foe.name + '!\fLink battle record: ' + s.pvpWins + ' - ' + s.pvpLosses); }
    else if (res === 'lose') { s.pvpLosses++; yield* say(foe.name + ' won this time. Rematch?\fLink battle record: ' + s.pvpWins + ' - ' + s.pvpLosses); }
  }

  // ================================================================ hooking into the zone
  function enter() {
    buildChat();
    if (!G.ow.fx.includes(FX)) G.ow.fx.push(FX);
    for (const g of ghosts.values()) if (!G.ow.actors.includes(g.actor)) G.ow.actors.push(g.actor);
    if (!net.want) { net.error = net.error === 'version' ? 'version' : null; connect(); }
  }
  function leave() { closeChat(); if (net.want || net.state !== 'offline') disconnect(); showChatButton(); }
  const origEnter = G.scripts.onEnter;
  G.scripts.onEnter = function (map) {
    const r = origEnter.apply(this, arguments);
    if (map.name === ZONE) enter(); else if (net.want) leave();
    return r;
  };
  // desks, NPCs and friends are rebuilt now and then; the people in the room stay
  const OW = G.Overworld.prototype, origSpawn = OW.spawnActors;
  OW.spawnActors = function () { origSpawn.apply(this, arguments); if (this.map && this.map.name === ZONE) for (const g of ghosts.values()) this.actors.push(g.actor); };
  const origTalkTo = G.talkTo;
  G.talkTo = function (a) { return a && a.ghost ? playerMenu(a.ghost) : origTalkTo.apply(this, arguments); };
  const origSelect = G.onSelect;
  G.onSelect = function () { if (inZone()) { G.spawnScript(roster(), 'lounge-roster'); return; } if (origSelect) return origSelect.apply(this, arguments); };
  // any other battle (BATTLE TOWER, VERSUS) takes you out of the queue first
  const origRun = G.runBattle;
  G.runBattle = function (opts) { if (queuedAt && !(opts && opts.pvp)) { send({ t: 'queue', on: false }); queuedAt = 0; } return origRun.apply(this, arguments); };
  if (browser) {
    // a heartbeat, in case a proxy on the way swallows WebSocket pings; and AWAY while the tab is hidden
    setInterval(() => { if (net.state === 'online' && net.mode === 'ws') send({ t: 'hb' }); }, 20000);
    document.addEventListener('visibilitychange', () => { if (net.state === 'online') { lastSt = document.hidden ? 'away' : ''; send({ t: 'st', s: lastSt }); } });
    G.engine.spawn((function* () { for (;;) { try { tick(); showChatButton(); } catch (e) { console.error('lounge', e); } yield; } })(), 'lounge');
    window.addEventListener('pagehide', () => { if (net.state === 'online') send({ t: 'bye' }); });
  }

  // the LINK BATTLE and TRADE CORNER desks lead with the live lounge; the link codes are still there
  const talk = SI.talk, linkDesk = talk.SOCIAL_LINK_CLERK, tradeDesk = talk.SOCIAL_TRADE_CLERK;
  talk.SOCIAL_LINK_CLERK = function* () {
    if (net.state !== 'online') { yield* linkDesk(); return; }
    yield* say('LINK BATTLES! Everyone in this lounge is a real trainer.\fJoin the queue to battle the next trainer who joins - or talk to anyone here to challenge them.\fAll POKéMON battle at LEVEL 50. No items, no EXP.');
    for (;;) {
      const r = yield* SI.choose([queuedAt ? 'LEAVE QUEUE' : 'FIND A MATCH', 'LINK CODES', 'CANCEL']);
      if (r === 0 && queuedAt) { send({ t: 'queue', on: false }); queuedAt = 0; yield* say("You left the queue."); return; }
      if (r === 0) {
        const team = yield* SI.pickTeam(Math.min(3, G.state.party.length), 'Choose for the queue');
        if (!team) continue;
        if (net.state !== 'online') { yield* say('The link dropped. Try again in a moment!'); return; }
        send({ t: 'queue', on: true, team: team.map(m => SI.monOut(m, false)) }); queuedAt = Date.now();
        yield* say("You're in the queue!" + (queueN > 0 ? ' ' + queueN + (queueN === 1 ? ' trainer is' : ' trainers are') + ' waiting.' : '') + "\fFeel free to walk around. Your battle starts as soon as someone's ready.");
        return;
      }
      if (r === 1) { yield* linkDesk(); return; }
      yield* say('Good luck out there!'); return;
    }
  };
  talk.SOCIAL_TRADE_CLERK = function* () {
    if (net.state === 'online') yield* say('TRADE CORNER! To trade with someone in the lounge, just talk to them and choose TRADE.\fYou can also trade with friends anywhere by link:');
    yield* tradeDesk();
  };
  G.lounge = { net, ghosts, chat, send, receive, Link, seeded, openChat, closeChat, roster, get link() { return link; }, get queued() { return !!queuedAt; } };
})(window.G);
