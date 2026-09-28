// Synthesized audio: the original Red music (pokered note data) re-voiced through Web Audio, procedural SFX and cries.
(function (G) {
  'use strict';
  const hasAudio = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext) && !window.HEADLESS;
  let ctx = null, master = null, musicGain = null, sfxGain = null, muted = false;
  function init() {
    if (!hasAudio || ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.32; musicGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 1.5; sfxGain.connect(master);
    const waves = {};
    for (const d of [0.125, 0.25, 0.5]) {
      const n = 32, re = new Float32Array(n), im = new Float32Array(n);
      for (let k = 1; k < n; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * d);
      waves[d] = ctx.createPeriodicWave(re, im);
    }
    ctx._pulse = waves;
    const len = ctx.sampleRate; const nb = ctx.createBuffer(1, len, ctx.sampleRate); const ch = nb.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    ctx._noise = nb;
  }
  if (hasAudio && typeof document !== 'undefined') {
    // Phones only let audio start inside a user gesture, and for touch it's the finger lifting (touchend / pointerup /
    // click) that counts, not pointerdown. So try on every kind of gesture until the context is actually running.
    // iOS also mutes Web Audio with the ring/silent switch unless the page asks for playback.
    const iOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    let keepAlive = null;
    const unlock = () => {
      init(); if (!ctx) return;
      if (navigator.audioSession && navigator.audioSession.type !== 'playback') try { navigator.audioSession.type = 'playback'; } catch (e) {} // iOS 16.4+
      if (ctx.state !== 'running') {
        try { const pr = ctx.resume(); if (pr && pr.catch) pr.catch(() => {}); } catch (e) {} // rejects outside a gesture on some browsers
        // older iOS unlocks on a sound started inside the gesture, even a silent one
        try { const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, 22050); s.connect(ctx.destination); s.start(0); } catch (e) {}
        // before iOS 16.4: a silent looping <audio> moves the page to the playback category, past the silent switch
        if (iOS && !navigator.audioSession && !keepAlive) try {
          const n = 800, b = new DataView(new ArrayBuffer(44 + n)), w = (o, t) => [...t].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
          w(0, 'RIFF'); b.setUint32(4, 36 + n, true); w(8, 'WAVEfmt '); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
          b.setUint32(24, 8000, true); b.setUint32(28, 8000, true); b.setUint16(32, 1, true); b.setUint16(34, 8, true); w(36, 'data'); b.setUint32(40, n, true);
          for (let i = 0; i < n; i++) b.setUint8(44 + i, 128);
          keepAlive = new Audio(URL.createObjectURL(new Blob([b.buffer], { type: 'audio/wav' }))); keepAlive.loop = true; keepAlive.volume = 0;
          const pr = keepAlive.play(); if (pr && pr.catch) pr.catch(() => { keepAlive = null; });
        } catch (e) { keepAlive = null; }
      }
      if (pendingTrack && !seq) startSong(pendingTrack);
    };
    for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown', 'mousedown']) document.addEventListener(ev, unlock, true);
    // Hidden tab or backgrounded app: pause all sound, just like the game loop pauses. Notes are queued a moment ahead
    // by a timer the browser throttles in the background, and iOS keeps "playback" audio alive there, so letting the
    // context run on came out as stuttering music. Coming back resumes it (or the next tap does, if iOS insists).
    const quiet = p => { if (p && p.catch) p.catch(() => {}); };
    const sleep = () => {
      if (ctx && ctx.state === 'running') try { quiet(ctx.suspend()); } catch (e) {}
      if (keepAlive) try { keepAlive.pause(); } catch (e) {}
    };
    const wake = () => {
      if (document.hidden) return;
      if (ctx && ctx.state !== 'running') try { quiet(ctx.resume()); } catch (e) {}
      if (keepAlive) try { quiet(keepAlive.play()); } catch (e) {}
    };
    document.addEventListener('visibilitychange', () => (document.hidden ? sleep() : wake()));
    window.addEventListener('pagehide', sleep); window.addEventListener('pageshow', wake);
    document.addEventListener('freeze', sleep); document.addEventListener('resume', wake);
  }
  const midiHz = m => 440 * Math.pow(2, (m - 69) / 12);

  // --- voices ---
  function tone(t, hz, dur, o) {
    o = o || {};
    const osc = ctx.createOscillator(), g = ctx.createGain();
    if (o.wave === 'tri') osc.type = 'triangle'; else if (o.wave === 'sine') osc.type = 'sine'; else if (o.wave === 'saw') osc.type = 'sawtooth'; else osc.setPeriodicWave(ctx._pulse[o.duty || 0.5]);
    osc.frequency.setValueAtTime(hz, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, hz * o.slide), t + dur);
    if (o.vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = o.vib; lg.gain.value = hz * 0.012; l.connect(lg); lg.connect(osc.frequency); l.start(t + 0.08); l.stop(t + dur + 0.05); }
    const v = o.vol === undefined ? 0.3 : o.vol, a = o.a || 0.005, rel = o.rel || 0.04;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + a);
    g.gain.setValueAtTime(v * (o.sus === undefined ? 0.75 : o.sus), t + Math.max(a, dur * 0.3));
    g.gain.linearRampToValueAtTime(0, t + dur + rel);
    osc.connect(g); g.connect(o.dest || musicGain);
    osc.start(t); osc.stop(t + dur + rel + 0.02);
  }
  function noise(t, dur, o) {
    o = o || {};
    const src = ctx.createBufferSource(); src.buffer = ctx._noise;
    const f = ctx.createBiquadFilter(); f.type = o.type || 'highpass'; f.frequency.value = o.freq || 4000;
    const g = ctx.createGain(); const v = o.vol === undefined ? 0.2 : o.vol;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(o.dest || musicGain);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }


  // ---------------- music: the original Red themes (pokered note data in G.MUSIC), re-voiced ----------------
  // The sequencer reproduces the Game Boy engine's timing exactly (frame counters, tempo, fractional delays,
  // loops/calls); the voices are reworked: chorused pulse leads, the GB wave samples with a sub layer for bass,
  // LFSR noise drums with added body, all through a compressor and a small reverb.
  const FPS = 59.7275;
  const PERIOD0 = [0xF82C, 0xF89D, 0xF907, 0xF96B, 0xF9CA, 0xFA23, 0xFA77, 0xFAC7, 0xFB12, 0xFB58, 0xFB9B, 0xFBDA].map(v => 0x10000 - v);
  const periodOf = (p, oct) => Math.ceil(PERIOD0[p] / Math.pow(2, oct - 1)); // arithmetic shift of the negated period
  let bus = null;
  function impulse(sec, decay) {
    const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate), pre = ctx.sampleRate * 0.015;
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay) * Math.min(1, i / pre); }
    return b;
  }
  function initBus() {
    if (bus) return bus;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.18;
    const makeup = ctx.createGain(); makeup.gain.value = 3.2; comp.connect(makeup); makeup.connect(musicGain);
    const rev = ctx.createConvolver(); rev.buffer = impulse(2.2, 3);
    const revOut = ctx.createGain(); revOut.gain.value = 0.9; rev.connect(revOut); revOut.connect(musicGain);
    const chan = (pan, lp, send, lvl) => {
      const g = ctx.createGain(); g.gain.value = lvl;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; f.Q.value = 0.4;
      g.connect(f);
      if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; f.connect(p); p.connect(comp); } else f.connect(comp);
      const s = ctx.createGain(); s.gain.value = send; f.connect(s); s.connect(rev);
      return g;
    };
    bus = { ch: [chan(-0.3, 7000, 0.5, 1), chan(0.3, 7000, 0.5, 1), chan(0, 3800, 0.2, 1), chan(0.12, 10500, 0.3, 1)], waves: {}, noise: {} };
    return bus;
  }
  // GB channel-3 instrument → PeriodicWave (harmonics from the 32-step sample, top end softened)
  function gbWave(idx) {
    if (bus.waves[idx]) return bus.waves[idx];
    const W = G.MUSIC.waves, smp = (W[idx] || W[0]).map(v => (v - 7.5) / 7.5), N = smp.length, H = 16;
    const re = new Float32Array(H + 1), im = new Float32Array(H + 1);
    for (let k = 1; k <= H; k++) {
      let a = 0, b = 0; for (let n = 0; n < N; n++) { const ph = 2 * Math.PI * k * (n + 0.5) / N; a += smp[n] * Math.cos(ph); b += smp[n] * Math.sin(ph); }
      const soft = k > 8 ? 0.55 : 1; re[k] = a * 2 / N * soft; im[k] = b * 2 / N * soft;
    }
    return (bus.waves[idx] = ctx.createPeriodicWave(re, im));
  }
  // GB noise channel: LFSR clocked from the NR43 byte (shift, 7-bit width, divisor)
  function gbNoise(nr43) {
    if (bus.noise[nr43]) return bus.noise[nr43];
    const sh = nr43 >> 4, w7 = (nr43 >> 3) & 1, r = nr43 & 7;
    const clk = 524288 / (r || 0.5) / Math.pow(2, sh + 1), sr = ctx.sampleRate, n = Math.floor(sr * 0.7);
    const buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0), step = clk / sr;
    let lfsr = 0x7fff, acc = 0, out = 1;
    for (let i = 0; i < n; i++) {
      acc += step;
      while (acc >= 1) { acc -= 1; const bit = (lfsr ^ (lfsr >> 1)) & 1; lfsr = (lfsr >> 1) | (bit << 14); if (w7) lfsr = (lfsr & ~0x40) | (bit << 6); out = lfsr & 1 ? -1 : 1; }
      d[i] = out;
    }
    return (bus.noise[nr43] = buf);
  }
  // GB volume envelope (0-15, fade n = one step every n/64 s; negative fades rise) on a gain param
  function envelope(gp, t, dur, v, fade, peak) {
    const g0 = peak * v / 15;
    gp.setValueAtTime(0, t); gp.linearRampToValueAtTime(g0, t + 0.004);
    if (fade > 0 && v > 0) {
      const T = v * fade / 64;
      if (T < dur) { gp.linearRampToValueAtTime(0, t + T); gp.setValueAtTime(0, t + dur); } else gp.linearRampToValueAtTime(g0 * (1 - dur / T), t + dur);
    } else if (fade < 0) {
      const T = Math.max(0.001, (15 - v) * -fade / 64);
      if (T < dur) { gp.linearRampToValueAtTime(peak, t + T); gp.setValueAtTime(peak, t + dur); } else gp.linearRampToValueAtTime(g0 + (peak - g0) * dur / T, t + dur);
    } else gp.setValueAtTime(g0, t + dur);
    gp.linearRampToValueAtTime(0, t + dur + 0.015);
  }
  const DUTY = [0.125, 0.25, 0.5, 0.25];
  function pulseVoice(out, t, dur, hz, per, v, fade, duty, vib, slideHz) {
    const g = ctx.createGain(); g.connect(out);
    envelope(g.gain, t, dur, v, fade, 0.2);
    const oscs = [];
    for (const [det, lvl] of [[0, 1], [7, 0.45]]) {
      const o = ctx.createOscillator(); o.setPeriodicWave(ctx._pulse[DUTY[duty & 3]]);
      o.frequency.setValueAtTime(hz, t); if (slideHz) o.frequency.exponentialRampToValueAtTime(slideHz, t + dur);
      o.detune.value = det;
      const og = ctx.createGain(); og.gain.value = lvl; o.connect(og); og.connect(g);
      o.start(t); o.stop(t + dur + 0.03); oscs.push(o);
    }
    if (vib && vib[1] > 0 && dur > vib[0] / FPS + 0.03) {
      const l = ctx.createOscillator(); l.type = 'triangle'; l.frequency.value = FPS / (2 * ((vib[2] & 15) + 1));
      const lg = ctx.createGain(), cents = 1200 * Math.log2(per / Math.max(1, per - vib[1] / 2));
      lg.gain.setValueAtTime(0, t); lg.gain.setValueAtTime(cents, t + vib[0] / FPS);
      l.connect(lg); for (const o of oscs) lg.connect(o.detune);
      l.start(t); l.stop(t + dur + 0.03);
    }
  }
  const WAVE_VOL = [0, 0.34, 0.17, 0.085];
  function waveVoice(out, t, dur, hz, vol, wave, slideHz) {
    const lvl = WAVE_VOL[vol & 3]; if (!lvl) return;
    const g = ctx.createGain(); g.connect(out);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(lvl, t + 0.004);
    g.gain.linearRampToValueAtTime(lvl * 0.82, t + Math.max(0.005, dur)); g.gain.linearRampToValueAtTime(0, t + dur + 0.015);
    const o = ctx.createOscillator(); o.setPeriodicWave(gbWave(wave));
    o.frequency.setValueAtTime(hz, t); if (slideHz) o.frequency.exponentialRampToValueAtTime(slideHz, t + dur);
    o.connect(g); o.start(t); o.stop(t + dur + 0.03);
    if (hz < 220) { // warm sub layer under bass lines
      const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.setValueAtTime(hz / 2, t);
      const sg = ctx.createGain(); sg.gain.value = 0.55; sub.connect(sg); sg.connect(g); sub.start(t); sub.stop(t + dur + 0.03);
    }
  }
  // drum kit: pokered noise instruments (sequences of [length, volume, fade, NR43]) plus a tonal body for snares/toms
  const DRUM_BODY = { 1: 190, 2: 190, 3: 190, 4: 190, 9: 150, 10: 170, 11: 180, 5: -1 };
  function drumVoice(s, c, out, t, segs, inst) {
    if (c.last) { try { c.last.gain.cancelScheduledValues(t); c.last.gain.setValueAtTime(c.last.gain.value, t); c.last.gain.linearRampToValueAtTime(0, t + 0.004); } catch (e) {} }
    const g = ctx.createGain(); g.connect(out); c.last = g;
    g.gain.setValueAtTime(0, t);
    let tt = t;
    segs.forEach(([len, v, fade, nr43], i) => {
      const src = ctx.createBufferSource(); src.buffer = gbNoise(nr43);
      const sg = ctx.createGain(); const segDur = i < segs.length - 1 ? (len + 1) / FPS : Math.max((len + 1) / FPS, v * Math.max(1, fade) / 64);
      envelope(sg.gain, tt, segDur, v, fade, 0.3);
      src.connect(sg); sg.connect(g); src.start(tt, Math.random() * 0.3); src.stop(tt + segDur + 0.03);
      tt += (len + 1) / FPS;
    });
    g.gain.setValueAtTime(1, t + 0.001);
    const body = DRUM_BODY[inst];
    if (body) {
      const o = ctx.createOscillator(); o.type = 'sine';
      const f0 = body > 0 ? body : 170, f1 = body > 0 ? body * 0.7 : 80, d = body > 0 ? 0.09 : tt - t + 0.08;
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + d);
      const og = ctx.createGain(); og.gain.setValueAtTime(0.16, t); og.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(og); og.connect(g); o.start(t); o.stop(t + d + 0.02);
    }
  }

  let seq = null, jseq = null, seqTimer = null, pendingTrack = null;
  // 'Song@tempo' plays a song at a fixed tempo, like pokered's alternate-tempo channel pointers (the slow CITIES1)
  function newSeq(id) {
    const M = G.MUSIC, [base, alt] = String(id).split('@'), sd = M && M.songs[base]; if (!sd) return null;
    initBus();
    const out = bus.ch.map(b => { const g = ctx.createGain(); g.connect(b); return g; });
    return { id, prog: M.progs[sd.f], tempo: 256, fixedTempo: +alt || 0, frame: 0, t0: ctx.currentTime + 0.05, out, tower: /Tower/.test(id),
      chans: sd.ch.map((pc, i) => ({ n: sd.n[i], pc, stack: [], loops: {}, oct: 4, speed: 12, vol: 12, fade: 0, duty: 2, vib: null, pp: false, delay: 1, frac: 0, done: false, wave: 0, slide: null, last: null })) };
  }
  function releaseSeq(s, at) {
    for (const g of s.out) { g.gain.cancelScheduledValues(at); g.gain.setValueAtTime(g.gain.value, at); g.gain.linearRampToValueAtTime(0, at + 0.06); }
    setTimeout(() => { for (const g of s.out) g.disconnect(); }, 1200);
  }
  function duck(s, at, v) { for (const g of s.out) { g.gain.cancelScheduledValues(at); g.gain.setValueAtTime(g.gain.value, at); g.gain.linearRampToValueAtTime(v, at + 0.05); } }
  function noteFrames(s, c, len) { const tot = ((len * c.speed) & 0xff) * s.tempo + c.frac; c.frac = tot & 0xff; return Math.max(1, tot >> 8); }
  function step(s, c) {
    const P = s.prog, t = s.t0 + s.frame / FPS, out = s.out[c.n];
    for (let guard = 0; guard < 500; guard++) {
      const op = P[c.pc++];
      if (!op) { c.done = true; return; }
      switch (op[0]) {
        case 0: { // note
          const fr = noteFrames(s, c, op[2]); c.delay = fr;
          const per = Math.max(1, periodOf(op[1], c.oct) - (c.pp ? 1 : 0)), dur = fr / FPS;
          const sl = c.slide ? periodOf(c.slide[2], c.slide[1]) : 0;
          if (c.n === 2) waveVoice(out, t, dur, 65536 / per, c.vol, s.tower && c.wave === 5 ? 6 : c.wave, sl ? 65536 / sl : 0);
          else if (c.n < 2) pulseVoice(out, t, dur, 131072 / per, per, c.vol, c.fade, c.duty, c.vib, sl ? 131072 / sl : 0);
          c.slide = null; return;
        }
        case 1: c.delay = noteFrames(s, c, op[1]); c.slide = null; return; // rest
        case 2: c.oct = op[1]; break;
        case 3: c.speed = op[1]; c.vol = op[2]; c.fade = op[3]; if (c.n === 2) c.wave = op[3]; break;
        case 4: c.speed = op[1]; break; // drum_speed shares the note-speed register
        case 5: { const fr = noteFrames(s, c, op[2]); c.delay = fr; const segs = G.MUSIC.drums[op[1]]; if (segs) drumVoice(s, c, out, t, segs, op[1]); return; }
        case 6: s.tempo = s.fixedTempo || op[1]; for (const k of s.chans) k.frac = 0; break;
        case 7: c.duty = op[1]; break;
        case 8: c.vib = [op[1], op[2], op[3]]; break;
        case 9: c.slide = [op[1], op[2], op[3]]; break;
        case 10: c.pp = !c.pp; break;
        case 11: c.stack.push(c.pc); c.pc = op[1]; break;
        case 12: if (c.stack.length) c.pc = c.stack.pop(); else { c.done = true; return; } break;
        case 13: { // sound_loop count (0 = forever), target
          if (op[1] === 0) { c.pc = op[2]; break; }
          const key = c.pc - 1, n = c.loops[key] === undefined ? op[1] : c.loops[key];
          if (n <= 1) delete c.loops[key]; else { c.loops[key] = n - 1; c.pc = op[2]; }
          break;
        }
        case 16: c.duty = (op[1] >> 6) & 3; break;
        case 17: { // raw square note: length, volume, fade, frequency register
          const fr = op[1] + 1; c.delay = fr; const per = 2048 - op[4];
          if (op[2] > 0 && per > 0) pulseVoice(out, t, fr / FPS, 131072 / per, per, op[2], op[3], c.duty, null, 0);
          return;
        }
        case 18: { const fr = op[1] + 1; c.delay = fr; drumVoice(s, c, out, t, [[op[1], op[2], op[3], op[4]]], 0); return; }
        default: break; // master volume, panning, pitch sweep: handled by the mix
      }
    }
    c.done = true;
  }
  function advance(s, until) {
    while (s.t0 + s.frame / FPS < until) {
      let alive = false;
      for (const c of s.chans) { if (c.done) continue; alive = true; if (c.delay > 1) { c.delay--; continue; } step(s, c); }
      if (!alive) return false;
      s.frame++;
    }
    return true;
  }
  function pump() {
    if (!ctx) return;
    const until = ctx.currentTime + 0.3;
    if (seq) advance(seq, until);
    if (jseq && !advance(jseq, until)) {
      const end = jseq.t0 + jseq.frame / FPS;
      releaseSeq(jseq, end + 0.4); jseq = null;
      if (seq) duck(seq, end + 0.05, 1);
    }
  }
  function startSong(id) {
    if (!ctx) { pendingTrack = id; return; }
    const s = newSeq(id); if (!s) return;
    if (seq) releaseSeq(seq, ctx.currentTime);
    seq = s;
    if (jseq) duck(seq, ctx.currentTime, 0);
    if (!seqTimer) seqTimer = setInterval(pump, 40);
    pump();
  }
  function playJingle(id) {
    if (!ctx || muted) return;
    const s = newSeq(id); if (!s) return;
    if (jseq) releaseSeq(jseq, ctx.currentTime);
    jseq = s;
    if (seq) duck(seq, ctx.currentTime, 0);
    if (!seqTimer) seqTimer = setInterval(pump, 40);
    pump();
  }
  function stopMusic() { if (seq) releaseSeq(seq, ctx.currentTime); seq = null; }

  // --- SFX ---
  const SFX = {
    blip: t => tone(t, 1760, 0.03, { duty: 0.25, vol: 0.12, dest: sfxGain }),
    cursor: t => tone(t, 1320, 0.025, { duty: 0.25, vol: 0.1, dest: sfxGain }),
    select: t => { tone(t, 1046, 0.04, { duty: 0.5, vol: 0.14, dest: sfxGain }); tone(t + 0.04, 1568, 0.05, { duty: 0.5, vol: 0.14, dest: sfxGain }); },
    menu: t => tone(t, 880, 0.05, { duty: 0.25, vol: 0.12, slide: 1.5, dest: sfxGain }),
    bump: t => tone(t, 90, 0.08, { duty: 0.5, vol: 0.2, dest: sfxGain }),
    door: t => { noise(t, 0.12, { freq: 900, type: 'lowpass', vol: 0.3, dest: sfxGain }); tone(t, 220, 0.1, { duty: 0.25, vol: 0.1, slide: 0.6, dest: sfxGain }); },
    exit: t => { tone(t, 330, 0.06, { duty: 0.25, vol: 0.12, dest: sfxGain }); tone(t + 0.06, 220, 0.08, { duty: 0.25, vol: 0.12, dest: sfxGain }); },
    jump: t => tone(t, 300, 0.18, { duty: 0.25, vol: 0.16, slide: 2.2, dest: sfxGain }),
    exclaim: t => { tone(t, 1175, 0.06, { duty: 0.5, vol: 0.18, dest: sfxGain }); tone(t + 0.07, 1568, 0.12, { duty: 0.5, vol: 0.18, dest: sfxGain }); },
    hit: t => { noise(t, 0.12, { freq: 800, type: 'lowpass', vol: 0.5, dest: sfxGain }); tone(t, 180, 0.08, { duty: 0.5, vol: 0.2, slide: 0.5, dest: sfxGain }); },
    hit_super: t => { noise(t, 0.2, { freq: 1200, type: 'lowpass', vol: 0.6, dest: sfxGain }); tone(t, 260, 0.14, { duty: 0.5, vol: 0.25, slide: 0.4, dest: sfxGain }); },
    hit_weak: t => noise(t, 0.08, { freq: 500, type: 'lowpass', vol: 0.35, dest: sfxGain }),
    ballthrow: t => tone(t, 400, 0.25, { duty: 0.125, vol: 0.12, slide: 2, dest: sfxGain }),
    ballpop: t => { noise(t, 0.15, { freq: 3000, vol: 0.25, dest: sfxGain }); tone(t, 900, 0.12, { duty: 0.25, vol: 0.12, slide: 0.5, dest: sfxGain }); },
    shake: t => { tone(t, 220, 0.05, { duty: 0.5, vol: 0.15, dest: sfxGain }); noise(t, 0.05, { freq: 600, type: 'lowpass', vol: 0.2, dest: sfxGain }); },
    caught: t => playJingle('SFX_Caught_Mon'),
    run: t => { for (let i = 0; i < 3; i++) noise(t + i * 0.06, 0.05, { freq: 1500, vol: 0.12, dest: sfxGain }); },
    exp: t => { for (let i = 0; i < 10; i++) tone(t + i * 0.04, 880 + i * 60, 0.03, { duty: 0.125, vol: 0.06, dest: sfxGain }); },
    levelup: t => playJingle('SFX_Level_Up'),
    lowhp: t => { tone(t, 1480, 0.06, { duty: 0.5, vol: 0.08, dest: sfxGain }); tone(t + 0.12, 1480, 0.06, { duty: 0.5, vol: 0.08, dest: sfxGain }); },
    heal: t => { tone(t, 880, 0.08, { duty: 0.25, vol: 0.12, dest: sfxGain }); tone(t + 0.08, 1320, 0.14, { duty: 0.25, vol: 0.12, dest: sfxGain }); },
    get_item: t => playJingle('SFX_Get_Item1_1'), get_key: t => playJingle('SFX_Get_Key_Item_1'), get_tm: t => playJingle('SFX_Get_Item1_1'), get_mon: t => playJingle('SFX_Get_Item1_1'), get_badge: t => playJingle('SFX_Get_Item1_1'),
    hidden_item: t => playJingle('SFX_Get_Item2_1'), dex: t => playJingle('SFX_Dex_Page_Added'),
    save: t => playJingle('SFX_Save_1'), learn: t => playJingle('SFX_Level_Up'), buy: t => { tone(t, 1568, 0.05, { duty: 0.5, vol: 0.14, dest: sfxGain }); tone(t + 0.06, 2093, 0.08, { duty: 0.5, vol: 0.14, dest: sfxGain }); },
    pc_on: t => { tone(t, 660, 0.05, { duty: 0.25, vol: 0.1, dest: sfxGain }); tone(t + 0.05, 990, 0.08, { duty: 0.25, vol: 0.1, dest: sfxGain }); },
    pc_off: t => { tone(t, 990, 0.05, { duty: 0.25, vol: 0.1, dest: sfxGain }); tone(t + 0.05, 660, 0.08, { duty: 0.25, vol: 0.1, dest: sfxGain }); },
    pc_access: t => tone(t, 1175, 0.08, { duty: 0.25, vol: 0.1, dest: sfxGain }),
    ballplace: t => tone(t, 1320, 0.05, { duty: 0.25, vol: 0.12, dest: sfxGain }),
    battle_start: t => { for (let i = 0; i < 8; i++) tone(t + i * 0.05, 440 + (i % 2) * 220, 0.04, { duty: 0.5, vol: 0.12, dest: sfxGain }); },
    cut: t => noise(t, 0.2, { freq: 2500, vol: 0.3, dest: sfxGain }),
    boulder: t => noise(t, 0.25, { freq: 300, type: 'lowpass', vol: 0.5, dest: sfxGain }),
    fly: t => { for (let i = 0; i < 6; i++) noise(t + i * 0.08, 0.06, { freq: 900 + i * 200, vol: 0.2, dest: sfxGain }); },
    teleport: t => { for (let i = 0; i < 8; i++) tone(t + i * 0.04, 400 + i * 150, 0.04, { duty: 0.25, vol: 0.1, dest: sfxGain }); },
    elevator: t => tone(t, 110, 1.0, { duty: 0.5, vol: 0.08, dest: sfxGain }), ding: t => tone(t, 1760, 0.4, { wave: 'sine', vol: 0.2, dest: sfxGain }),
    victory: t => {}, shrink: t => tone(t, 880, 0.5, { duty: 0.25, vol: 0.12, slide: 0.25, dest: sfxGain }),
  };
  const SFX_ALIAS = { item: 'get_item', ding: 'ding', horn: 'elevator' };
  G.sfx = function (name) { if (!ctx || muted) return; const f = SFX[name] || SFX[SFX_ALIAS[name]]; if (f) f(ctx.currentTime + 0.005); };
  // game track names → pokered songs
  const NAME = { title: 'TitleScreen', oak_intro: 'Routes2', pallet: 'PalletTown', oak: 'MeetProfOak', oak_lab: 'OaksLab', rival: 'MeetRival', rival_leave: 'MeetRival',
    surf: 'Surfing', bike: 'BikeRiding', evolution: 'SafariZone', hall_of_fame: 'HallOfFame', credits: 'Credits', wild: 'WildBattle', legendary: 'WildBattle',
    trainer: 'TrainerBattle', gym_leader: 'GymLeaderBattle', final_battle: 'FinalBattle', champion: 'FinalBattle', elite_four: 'TrainerBattle',
    victory: 'DefeatedTrainer', victory_wild: 'DefeatedWildMon', victory_leader: 'DefeatedGymLeader', center: 'Pokecenter', gym: 'Gym', cave: 'Dungeon2',
    forest: 'Dungeon2', tower: 'PokemonTower', lavender: 'Lavender', ss_anne: 'SSAnne', game_corner: 'GameCorner', silph: 'SilphCo', hideout: 'Dungeon1',
    mansion: 'CinnabarMansion', safari: 'SafariZone', indigo: 'IndigoPlateau', city: 'Cities1', route: 'Routes1', jigglypuff: 'JigglypuffSong', museum: 'MuseumGuy' };
  const JINGLE = { heal: 'PkmnHealed', item: 'SFX_Get_Item1_1', badge: 'SFX_Get_Item1_1', key: 'SFX_Get_Key_Item_1', mon: 'SFX_Get_Item1_1', levelup: 'SFX_Level_Up', caught: 'SFX_Caught_Mon', jigglypuff: 'JigglypuffSong' };
  function encounterSong(cls) {
    const E = (G.MUSIC && G.MUSIC.encounter) || { evil: [], female: [] };
    return E.evil.includes(cls) ? 'MeetEvilTrainer' : E.female.includes(cls) ? 'MeetFemaleTrainer' : 'MeetMaleTrainer';
  }
  const resolveSong = n => (G.MUSIC && G.MUSIC.songs[n]) ? n : NAME[n] ? NAME[n] : /^encounter_/.test(n) ? encounterSong(n.slice(10)) : n;
  G.music = function (name, isJingle) {
    if (!name) return;
    if (isJingle) { const j = JINGLE[name] || resolveSong(name); playJingle(j); return; }
    const id = resolveSong(name);
    if (seq && seq.id === id) return;
    if (!ctx) { pendingTrack = id; return; }
    startSong(id);
  };
  G.stopMusic = () => { if (ctx) stopMusic(); };
  // procedural Pokémon cries: unique per species
  G.cry = function (sp, mode) {
    if (!ctx || muted) return;
    const d = G.DATA.species[sp]; const n = d ? d.dex : 1;
    const h = k => G.gfx.hash2(n, k, 91);
    const t = ctx.currentTime + 0.01, base = 200 + h(1) * 600, len = 0.25 + h(2) * 0.35;
    const slow = mode === 'faint' ? 0.6 : 1;
    tone(t, base * slow, len * 0.5 / slow, { duty: [0.125, 0.25, 0.5][Math.floor(h(3) * 3)], vol: 0.18, slide: 0.6 + h(4) * 1.2, dest: sfxGain });
    tone(t + len * 0.45 / slow, base * (0.7 + h(5)) * slow, len * 0.55 / slow, { duty: 0.25, vol: 0.14, slide: mode === 'faint' ? 0.4 : 0.8 + h(6), vib: 8 + h(7) * 10, dest: sfxGain });
    if (h(8) > 0.5) noise(t, len * 0.4, { freq: 1500 + h(9) * 3000, vol: 0.08, dest: sfxGain });
  };
  G.audio = { setMute(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.55; }, init, current: () => seq && seq.id, _dbg: () => ({ ctx, master }) };
  // map → song, from pokered's per-map table (surfing / cycling override it)
  G.mapMusic = function (map) {
    if (G.ow && G.ow.surfing) return 'Surfing';
    if (G.ow && G.ow.biking) return 'BikeRiding';
    const M = G.MUSIC, md = G.MAPDATA && G.MAPDATA.maps[map.name];
    return (M && md && M.mapSongs[md.cnst]) || 'PalletTown';
  };
})(window.G);
