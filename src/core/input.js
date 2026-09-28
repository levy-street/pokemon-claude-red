// Keyboard / gamepad input mapped onto Game Boy style buttons.
(function (G) {
  'use strict';
  const BTN = ['up', 'down', 'left', 'right', 'a', 'b', 'start', 'select'];
  const KEYMAP = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
    KeyZ: 'a', KeyJ: 'a', Space: 'a', KeyX: 'b', KeyK: 'b', Backspace: 'b', Escape: 'b',
    Enter: 'start', ShiftRight: 'select', ShiftLeft: 'select', KeyC: 'select',
  };
  const raw = {}, down = {}, pressed = {}, released = {}, held = {};
  BTN.forEach(b => { raw[b] = false; down[b] = false; pressed[b] = false; released[b] = false; held[b] = 0; });
  const injected = {}; // for headless / scripted input
  const pulse = {};    // one-frame synthetic presses (unclaimed clicks -> A, right click -> B, wheel -> up/down)
  const touch = {};    // on-screen controller (src/game/touchpad.js); a press also pulses so a quick tap never falls between frames

  // ---- mouse / touch: position in game pixels; press flags latched once per frame ----
  // Scenes hit-test with G.pointer.in(x, y, w, h) and claim a click with consume(); unclaimed clicks become buttons.
  const pointer = { x: -1, y: -1, inside: false, down: false, pressed: false, rpressed: false, moved: false, wheel: 0, used: false, touch: false,
    in(x, y, w, h) { return this.inside && this.x >= x && this.y >= y && this.x < x + w && this.y < y + h; },
    consume() { this.used = true; },
  };
  const pend = { press: false, rpress: false, moved: false, wheel: 0, down: false };
  let canvasEl = null;
  function toGame(e) {
    const c = canvasEl || (canvasEl = document.getElementById('screen')); if (!c) return false;
    const r = c.getBoundingClientRect(); if (!r.width) return false;
    pointer.x = Math.floor((e.clientX - r.left) * G.gfx.W / r.width); pointer.y = Math.floor((e.clientY - r.top) * G.gfx.H / r.height);
    pointer.inside = pointer.x >= 0 && pointer.y >= 0 && pointer.x < G.gfx.W && pointer.y < G.gfx.H;
    return pointer.inside;
  }

  // typing in the page's own fields (the email signup) must not walk the player or get swallowed
  const typing = e => { const t = e.target; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); };
  const onChrome = e => !!(e.target && e.target.closest && e.target.closest('[data-chrome]'));
  // naming screens: printable keys type into a queue instead of acting as buttons (W is a W, not "up")
  let textMode = false; const typedQ = [];
  function onKey(e, v) {
    if (textMode && v && !typing(e) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key && e.key.length === 1 && /[A-Za-z0-9 ]/.test(e.key)) { typedQ.push(e.key); e.preventDefault(); return; }
      if (e.key === 'Backspace') { typedQ.push('\b'); e.preventDefault(); return; }
    }
    const b = KEYMAP[e.code];
    if (!b || (v && typing(e))) return;
    raw[b] = v;
    e.preventDefault();
  }
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('keydown', e => onKey(e, true));
    document.addEventListener('keyup', e => onKey(e, false));
    window.addEventListener('blur', () => BTN.forEach(b => raw[b] = false));
    document.addEventListener('pointermove', e => { toGame(e); pend.moved = true; pointer.touch = e.pointerType === 'touch'; });
    document.addEventListener('pointerdown', e => {
      if (onChrome(e) || !toGame(e)) return;
      pointer.touch = e.pointerType === 'touch';
      if (e.button === 2) pend.rpress = true; else { pend.press = true; pend.down = true; }
      e.preventDefault();
    });
    document.addEventListener('pointerup', () => { pend.down = false; });
    document.addEventListener('contextmenu', e => { if (e.target && e.target.id === 'screen') e.preventDefault(); });
    document.addEventListener('wheel', e => { if (onChrome(e) || !toGame(e)) return; pend.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  }

  function pollPad() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    const pads = navigator.getGamepads(); if (!pads) return null;
    for (const p of pads) {
      if (!p) continue;
      const bt = i => p.buttons[i] && p.buttons[i].pressed;
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      return {
        up: bt(12) || ay < -0.5, down: bt(13) || ay > 0.5, left: bt(14) || ax < -0.5, right: bt(15) || ax > 0.5,
        a: bt(0), b: bt(1) || bt(2), start: bt(9), select: bt(8),
      };
    }
    return null;
  }

  function update() {
    const pad = pollPad();
    for (const b of BTN) {
      const v = raw[b] || !!injected[b] || !!(pad && pad[b]) || !!pulse[b] || !!touch[b];
      pressed[b] = v && !down[b];
      released[b] = !v && down[b];
      down[b] = v;
      held[b] = v ? held[b] + 1 : 0;
    }
    for (const b in pulse) delete pulse[b];
    // pointer: latch this frame's edges (injected.pointer = {x, y, click, right} drives it headlessly)
    const ip = injected.pointer;
    if (ip) { pointer.x = ip.x; pointer.y = ip.y; pointer.inside = true; if (ip.click) pend.press = true; if (ip.right) pend.rpress = true; if (ip.wheel) pend.wheel += ip.wheel; pend.moved = true; injected.pointer = null; }
    pointer.pressed = pend.press; pointer.rpressed = pend.rpress; pointer.moved = pend.moved; pointer.wheel = pend.wheel; pointer.down = pend.down;
    pend.press = pend.rpress = pend.moved = false; pend.wheel = 0; pointer.used = false;
  }
  // after the scenes ran: clicks nobody claimed act like A, right clicks like B, the wheel like up/down
  function pointerFallback() {
    if (pointer.used) return;
    if (pointer.pressed) pulse.a = true;
    if (pointer.rpressed) pulse.b = true;
    if (pointer.wheel > 0) pulse.down = true; else if (pointer.wheel < 0) pulse.up = true;
  }
  // true on press, then repeats while held (menu navigation)
  function repeat(b, delay, rate) {
    delay = delay || 18; rate = rate || 5;
    if (pressed[b]) return true;
    const h = held[b];
    return h > delay && (h - delay) % rate === 0;
  }
  // Direction currently held (last pressed priority is approximated by fixed order)
  function dir() {
    if (down.up) return 'up'; if (down.down) return 'down'; if (down.left) return 'left'; if (down.right) return 'right';
    return null;
  }
  function clear() { BTN.forEach(b => { pressed[b] = false; }); }

  function touchSet(b, on) { touch[b] = on; if (on) pulse[b] = true; }
  function setTextMode(on) { textMode = !!on; typedQ.length = 0; }
  function takeTyped() { return typedQ.splice(0); }
  G.input = { down, pressed, released, held, update, repeat, dir, clear, injected, BTN, pointerFallback, touchSet, setTextMode, takeTyped };
  G.pointer = pointer;
})(window.G);
