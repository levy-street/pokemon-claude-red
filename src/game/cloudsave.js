// Accounts + cloud saves. Browsers inside Instagram, TikTok, X and friends can wipe localStorage, so SAVE offers a
// free account (email + password) and keeps a copy of the save on the server. CLOUD SAVE on the title screen logs in
// on any device and loads it. A save made elsewhere is never overwritten without asking: uploads carry the version
// this browser last synced, and the server refuses a stale one (409). Server side: tools/serve.py.
(function (G) {
  'use strict';
  if (typeof document === 'undefined' || !document.getElementById || window.HEADLESS) return;
  const SAVE_KEY = 'pkmn_pixel_red_save', WTP_KEY = 'claudered_wtp', ACCT_KEY = 'claudered_account', SKIP_KEY = 'claudered_acct_skip';
  const box = document.getElementById('acct'); if (!box) return;
  const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }, del: k => { try { localStorage.removeItem(k); } catch (e) {} } };
  const ss = { get: k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} } };
  const base = ((document.querySelector('meta[name="subscribe-endpoint"]') || {}).content || 'api/subscribe').replace(/subscribe$/, '');
  let acct = null; try { acct = JSON.parse(ls.get(ACCT_KEY) || 'null'); } catch (e) {}
  const keep = () => acct ? ls.set(ACCT_KEY, JSON.stringify(acct)) : ls.del(ACCT_KEY);

  async function api(path, method, body) {
    try {
      const r = await fetch(base + path, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, acct ? { Authorization: 'Bearer ' + acct.token } : {}), body: body ? JSON.stringify(body) : undefined });
      const j = await r.json().catch(() => ({ ok: false, error: 'server' }));
      if (r.status === 401 && acct && !/^account\//.test(path)) { acct = null; keep(); } // the session ran out
      return Object.assign({ status: r.status }, j);
    } catch (e) { return { ok: false, status: 0, error: 'network' }; }
  }
  function upload(force) {
    const raw = ls.get(SAVE_KEY); if (!raw || !acct) return Promise.resolve({ ok: false, error: 'nothing' });
    const w = ls.get(WTP_KEY);
    return api('save', 'PUT', { save: JSON.parse(raw), wtp: w ? JSON.parse(w) : null, base: acct.synced || null, force: !!force })
      .then(r => { if (r.ok) { acct.synced = r.updatedAt; keep(); } return r; });
  }
  // a game script waits on a promise frame by frame (the account box can take a while to fill in)
  function* waitFor(fn) { let done = false, val = null; fn().then(v => { val = v; done = true; }, () => { done = true; }); while (!done) yield; return val; }
  function toast(text) {
    const t = document.getElementById('cloud-toast'); if (!t) return;
    t.textContent = text; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2600);
  }
  G.cloud = { email: () => acct && acct.email };

  // ---------------- the account box (HTML, so phones get their real keyboard and password managers work) ----------------
  const form = document.getElementById('acct-form'), err = document.getElementById('acct-err'), go = document.getElementById('acct-go');
  const q = id => document.getElementById(id);
  let mode = 'signup', settle = null;
  function setMode(m) {
    mode = m;
    q('acct-title').textContent = m === 'signup' ? 'Keep your save safe' : 'Log in';
    go.textContent = m === 'signup' ? 'Create free account' : 'Log in';
    q('acct-switch-q').textContent = m === 'signup' ? 'Have an account?' : 'New here?';
    q('acct-switch').textContent = m === 'signup' ? 'Log in' : 'Create one';
    q('acct-opt').hidden = m !== 'signup';
    form.password.autocomplete = m === 'signup' ? 'new-password' : 'current-password';
    form.password.placeholder = m === 'signup' ? 'At least 8 characters' : '';
    err.hidden = true;
  }
  function close(result) { box.hidden = true; form.password.value = ''; if (document.activeElement) document.activeElement.blur(); const s = settle; settle = null; if (s) s(result); if (G.relayout) G.relayout(); }
  G.accountBox = function (m, lede) {
    if (settle) close('skip');
    setMode(m);
    q('acct-lede').textContent = lede || (m === 'signup' ? 'Browsers inside social apps can wipe game saves. Make a free account and your save follows you to any device.' : 'Log in to load your save on this device.');
    box.hidden = false; go.disabled = false;
    // it opens under a thumb that may still be mashing A through the "saved!" text: ignore taps for a moment
    box.classList.add('arming'); clearTimeout(G.accountBox.arm); G.accountBox.arm = setTimeout(() => box.classList.remove('arming'), 900);
    if (!G.touchUI) setTimeout(() => form.email.focus(), 30);
    return new Promise(res => { settle = res; });
  };
  q('acct-switch').addEventListener('click', () => setMode(mode === 'signup' ? 'login' : 'signup'));
  q('acct-skip').addEventListener('click', () => close('skip'));
  q('acct-show').addEventListener('click', () => { const p = form.password; p.type = p.type === 'password' ? 'text' : 'password'; q('acct-show').textContent = p.type === 'password' ? 'Show' : 'Hide'; });
  box.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') close('skip'); }); // typing here never reaches the game
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const email = form.email.value.trim(), password = form.password.value;
    const fail = t => { err.textContent = t; err.hidden = false; go.disabled = false; };
    if (!form.email.checkValidity() || !email) return fail('That email looks off.');
    if (mode === 'signup' && password.length < 8) return fail('Use at least 8 characters for the password.');
    go.disabled = true; err.hidden = true;
    const r = await api('account/' + mode, 'POST', { email, password, updates: mode === 'signup' && form.updates.checked, source: G.visitSource || '', referrer: document.referrer || '', website: form.website.value });
    if (!r.ok) {
      if (r.error === 'exists') { setMode('login'); return fail('There’s already an account with that email. Log in instead.'); }
      return fail(r.error === 'wrong' ? 'Wrong email or password.' : r.error === 'weak password' ? 'Use at least 8 characters for the password.' : r.status === 429 ? 'Too many tries. Give it a few minutes.' : r.error === 'invalid email' ? 'That email looks off.' : 'Couldn’t reach the server. Try again in a moment.');
    }
    acct = { token: r.token, email: r.email, synced: null, cloudAt: r.saveAt || null }; keep();
    G.track && G.track('account', { mode });
    close('in');
  });

  // ---------------- after SAVE in the start menu ----------------
  function describe(s) { // "RED, 8 BADGES, CINNABAR ISLAND"
    const b = (s.badges || []).length, where = G.mapDisplayName && G.maps ? G.mapDisplayName(G.maps.getMap(s.map)) : s.map;
    return s.name + ', ' + b + ' BADGE' + (b === 1 ? '' : 'S') + ', ' + where;
  }
  G.cloudAfterSave = function* () {
    let fresh = false;
    if (!acct) {
      if (ss.get(SKIP_KEY)) return;
      const res = yield* waitFor(() => G.accountBox('signup'));
      if (res !== 'in') { ss.set(SKIP_KEY, '1'); yield* G.say('No problem! Your game is saved on this device. You can make an account next time you SAVE.'); return; }
      fresh = true;
    }
    let r = yield* waitFor(() => upload(false));
    if (r && r.status === 409 && r.save && r.save.save) { // the account holds a different save (another device)
      if (yield* G.ask('Your account already has another save: ' + describe(r.save.save) + '. Replace it with this game?')) r = yield* waitFor(() => upload(true));
      else { yield* G.say('Your account keeps that save. This game is saved on this device.'); return; }
    }
    if (r && r.ok) {
      if (fresh) yield* G.say('Your save is in the cloud! To play on another device, choose CLOUD SAVE on the title screen and log in.');
      else toast('☁ Saved to ' + acct.email);
    } else if (acct) yield* G.say("Saved on this device, but your account couldn't be reached. It'll sync the next time you SAVE.");
  };

  // ---------------- title screen: CLOUD SAVE ----------------
  function* loadCloud() {
    const r = yield* waitFor(() => api('save', 'GET'));
    if (!r || !r.ok) { yield* G.say(r && r.status === 401 ? 'Please log in again.' : "Couldn't reach your account. Try again in a moment."); return; }
    if (!r.save || !r.save.save) { yield* G.say('Your account has no save yet. Play and choose SAVE to put one there.'); return; }
    const p = { v: 1, save: r.save.save, wtp: r.save.wtp };
    const T = G.saveTransfer;
    if (!T || !T.validSave(p.save)) { yield* G.say("The save in your account couldn't be read."); return; }
    const local = ls.get(SAVE_KEY);
    if (local && local === JSON.stringify(p.save)) { acct.synced = r.updatedAt; keep(); yield* G.say('Your cloud save is already on this device. Choose CONTINUE!'); return; }
    if (yield* T.confirmImport(p, { title: 'CLOUD SAVE', ask: 'Load your cloud save?', replace: 'Replace the save on this device with your cloud save?', done: 'Cloud save loaded! Choose CONTINUE to pick up where you left off.' })) { acct.synced = r.updatedAt; keep(); }
  }
  G.cloudMenu = function* () {
    if (!acct) {
      const r = yield* G.choose(['LOG IN', 'CREATE ACCOUNT', 'CANCEL'], { x: 6, y: 6, w: 150 });
      if (r !== 0 && r !== 1) return;
      if ((yield* waitFor(() => G.accountBox(r === 0 ? 'login' : 'signup'))) !== 'in') return;
      if (acct.cloudAt) { yield* loadCloud(); return; }
      yield* G.say('You’re in as ' + acct.email + '! Your account has no save yet. SAVE in-game to put one there.');
      return;
    }
    const r = yield* G.choose(['LOAD CLOUD SAVE', 'LOG OUT', 'CANCEL'], { x: 6, y: 6, w: 170 });
    if (r === 0) yield* loadCloud();
    else if (r === 1) {
      const who = acct.email; yield* waitFor(() => api('account/logout', 'POST')); acct = null; keep();
      yield* G.say('Logged out of ' + who + '. The save on this device is still here.');
    }
  };

  // a browser that lost its save but still has the session (or a fresh login elsewhere) gets it back on its own
  if (acct && !ls.get(SAVE_KEY)) api('save', 'GET').then(r => {
    if (!r.ok || !r.save || !r.save.save || ls.get(SAVE_KEY) || !(G.saveTransfer && G.saveTransfer.validSave(r.save.save))) return;
    ls.set(SAVE_KEY, JSON.stringify(r.save.save)); if (r.save.wtp) ls.set(WTP_KEY, JSON.stringify(r.save.wtp));
    acct.synced = r.updatedAt; keep(); toast('☁ Loaded your cloud save');
  });
})(window.G);
