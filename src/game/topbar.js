// Levy St. page bar above the game: optional email signup, contact, GitHub. Plain HTML around the canvas, not part
// of the game. The engine asks G.pageBar.inset() on resize. When a full-width bar would cost the canvas an integer
// scale step (phones on their side, fullscreen 1080p), it shrinks to a floating pill over the corner instead.
(function (G) {
  'use strict';
  if (typeof document === 'undefined' || !document.getElementById) return;
  const BAR_H = 44, SUB_KEY = 'levyst_subscribed';
  const bar = document.getElementById('lsbar'); if (!bar) return;
  const form = document.getElementById('ls-form'), input = form.querySelector('input[type=email]'), msg = document.getElementById('ls-msg');
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

  // the Levy St. mark + wordmark from the same alpha masks the intro draws
  const L = G.LEVY_LOGO, cv = document.getElementById('ls-logo');
  if (L && cv && cv.getContext) {
    const mh = L.mark.length, mw = L.mark[0].length, wh = L.word.length, ww = L.word[0].length, gap = 10;
    cv.width = mw + gap + ww; cv.height = Math.max(mh, wh);
    const ctx = cv.getContext('2d'), img = ctx.createImageData(cv.width, cv.height);
    const plot = (rows, ox, oy) => rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) {
      const a = +r[x]; if (!a) continue; const i = ((oy + y) * cv.width + ox + x) * 4;
      img.data[i] = 243; img.data[i + 1] = 240; img.data[i + 2] = 233; img.data[i + 3] = Math.round(a * 255 / 9);
    } });
    plot(L.mark, 0, (cv.height - mh) >> 1); plot(L.word, mw + gap, (cv.height - wh) >> 1);
    ctx.putImageData(img, 0, 0);
  }

  // late-90s hit counter: odometer digits in the game's own pixel font, counted once per browser session
  const hitsCv = document.getElementById('ls-hits');
  function drawHits(n) {
    if (!hitsCv || !G.gfx || !G.font) return;
    const { Surface, hex } = G.gfx, F = G.font, digits = String(n).padStart(7, '0').split(''), label = 'HITS';
    const lw = F.measureSmall(label) + 5, cw = 9, s = new Surface(lw + digits.length * cw + 1, 15);
    F.drawSmall(s, label, 0, 5, hex('#8a83a8'));
    digits.forEach((d, i) => {
      const x = lw + i * cw;
      s.rect(x, 0, cw - 1, 15, hex('#000000')); s.rect(x, 0, cw - 1, 1, hex('#3a3654')); s.rect(x, 14, cw - 1, 1, hex('#3a3654'));
      s.rect(x, 7, cw - 1, 1, hex('#101010')); // the split across the middle of each odometer wheel
      F.draw(s, d, x + 1, 1, hex('#7cff6b'));
    });
    hitsCv.width = s.w; hitsCv.height = s.h;
    const ctx = hitsCv.getContext('2d'), img = ctx.createImageData(s.w, s.h);
    new Uint32Array(img.data.buffer).set(s.data); ctx.putImageData(img, 0, 0);
    if (!G.touchUI) { hitsCv.style.width = s.w * 2 + 'px'; hitsCv.style.height = s.h * 2 + 'px'; } // phones size it in the layout
    hitsCv.hidden = false;
    hitsCv.title = n.toLocaleString() + ' visits';
    if (!drawHits.sized && G.touchUI && G.relayout) { drawHits.sized = true; G.relayout(); } // phones place it by its width
  }
  let counted = false; try { counted = !!sessionStorage.getItem('levyst_hit'); sessionStorage.setItem('levyst_hit', '1'); } catch (e) {}
  const apiBase = ((document.querySelector('meta[name="subscribe-endpoint"]') || {}).content || 'api/subscribe').replace(/subscribe$/, '');
  // the wheels roll up to each new number, like the counter ticking over as someone arrives
  let shown = null, target = 0, roll = 0;
  function rollTo(n) {
    if (shown !== null && n <= target) return;
    const from = shown === null ? Math.max(0, n - 24) : shown, dur = shown === null ? 900 : 700, t0 = performance.now(), id = ++roll;
    target = n;
    (function tick(now) {
      if (id !== roll) return; // a newer number took over mid-roll
      const k = Math.min(1, (now - t0) / dur);
      shown = Math.round(from + (n - from) * (1 - Math.pow(1 - k, 3))); drawHits(shown);
      if (k < 1) requestAnimationFrame(tick);
    })(t0);
  }
  // count this visit, then keep checking while the page is open (paused in background tabs) so new visitors show up live
  const POLL_MS = 5000;
  let poller = null;
  const poll = () => fetch(apiBase + 'hits').then(r => r.json()).then(j => { if (j && j.ok) rollTo(j.hits); }).catch(() => {});
  const startPolling = () => { if (!poller && !document.hidden) poller = setInterval(poll, POLL_MS + Math.floor(Math.random() * 1000)); };
  const stopPolling = () => { clearInterval(poller); poller = null; };
  fetch(apiBase + (counted ? 'hits' : 'hit'), { method: counted ? 'GET' : 'POST' }).then(r => r.json()).then(j => {
    if (!j || !j.ok) return; // no site server here (static hosting): no counter
    rollTo(j.hits);
    startPolling();
    document.addEventListener('visibilitychange', () => { if (document.hidden) stopPolling(); else { poll(); startPolling(); } });
  }).catch(() => {});

  function done(text) { form.hidden = true; msg.textContent = text; msg.hidden = false; bar.classList.add('subbed'); }
  if (get(SUB_KEY)) done("You're on the list ✓");

  // compact layouts show a button that drops the form down under the bar
  document.getElementById('ls-toggle').addEventListener('click', () => {
    const open = !bar.classList.contains('open'); bar.classList.toggle('open', open);
    if (open && !form.hidden) input.focus();
  });
  input.addEventListener('keydown', e => { if (e.key === 'Escape') { input.blur(); bar.classList.remove('open'); } });

  // where the signup came from: ?ref= / ?utm_source= on the link, else the referring site
  const q = new URLSearchParams(location.search);
  const source = q.get('ref') || q.get('utm_source') || (document.referrer ? (() => { try { return new URL(document.referrer).hostname; } catch (e) { return ''; } })() : '') || 'direct';
  const endpoint = (document.querySelector('meta[name="subscribe-endpoint"]') || {}).content || 'api/subscribe';
  // the Levy Street newsletter (Notifuse, public list): used directly when the page is hosted without tools/serve.py
  const NEWSLETTER = { url: 'https://notifuse.mogged.email/subscribe', workspace_id: 'levystreet', list_ids: ['levystreetainewsletter'] };
  const direct = email => fetch(NEWSLETTER.url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspace_id: NEWSLETTER.workspace_id, list_ids: NEWSLETTER.list_ids, contact: { email } }) })
    .then(r => r.json().catch(() => ({})).then(j => ({ ok: r.ok, error: j.error || (r.ok ? '' : r.status) })));
  G.visitSource = source;

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const email = input.value.trim();
    if (!input.checkValidity() || !email) { input.reportValidity(); return; }
    const btn = form.querySelector('button'); btn.disabled = true; btn.textContent = '…';
    try {
      let r = null, j = {};
      try { r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source, referrer: document.referrer || '', consent: 'topbar-v1', website: form.website.value }) }); j = await r.json().catch(() => ({})); } catch (e) { r = null; }
      if (!r || r.status === 404 || r.status === 405 || r.status === 501) { if (form.website.value) j = { ok: true }; else { const d = await direct(email); j = { ok: d.ok, error: /invalid/i.test(d.error) ? 'invalid email' : d.error }; } } // no site server here
      else if (!r.ok || !j.ok) throw new Error(j.error || r.status);
      if (!j.ok) throw new Error(j.error || 'failed');
      set(SUB_KEY, '1'); input.blur(); done("You're on the list ✓");
      setTimeout(() => bar.classList.remove('open'), 1800);
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Get updates';
      msg.textContent = /invalid/.test(err.message) ? 'That email looks off. Try again?' : "Couldn't save that. Email hello@levystreet.com instead?";
      msg.hidden = false; msg.classList.add('err'); setTimeout(() => { msg.hidden = true; msg.classList.remove('err'); }, 5000);
    }
  });

  G.pageBar = {
    // height the bar takes from the game area (0 when it floats as a pill)
    inset() {
      const W = G.gfx.W, H = G.gfx.H, iw = window.innerWidth, ih = window.innerHeight;
      const fit = h => Math.max(1, Math.floor(Math.min(iw / W, h / H)));
      const pill = fit(ih - BAR_H) < fit(ih);
      bar.classList.toggle('pill', pill);
      bar.classList.toggle('compact', pill || iw < 760);
      document.body.classList.toggle('has-bar', !pill);
      return pill ? 0 : BAR_H;
    },
    // touch layouts pick the shape themselves: 'bar' (compact, across the top) or 'pill' (floating in the corner)
    touchMode(m) {
      bar.classList.toggle('pill', m === 'pill'); bar.classList.add('compact');
      document.body.classList.remove('has-bar');
      return m === 'pill' ? 0 : BAR_H;
    },
  };
})(window.G);
