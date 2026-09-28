// Procedural terrain & outdoor object pixel art.
(function (G) {
  'use strict';
  const { Surface, mix, rgb, bayer, hash2 } = G.gfx;
  const P = G.PAL, N = G.noise;
  const rnd = (x, y, s) => hash2(x, y, s || 0);
  const MAT = { grass: 1, path: 2, sand: 3, pave: 4, water: 5, rock: 6, floor: 7 };

  // ---------- sprite caches ----------
  const cache = {};
  function cached(key, fn) { return cache[key] || (cache[key] = fn()); }

  // Clump-shaded foliage blob: clumps = [{x,y,r}], drawn back-to-front with per-clump lighting.
  function foliage(s, clumps, ramp, seed, opts) {
    opts = opts || {};
    const L = [-0.55, -0.7, 0.45];
    const mask = new Uint8Array(s.w * s.h);
    clumps.sort((a, b) => a.y - b.y);
    for (const c of clumps) {
      for (let y = Math.floor(c.y - c.r - 1); y <= Math.ceil(c.y + c.r + 1); y++) for (let x = Math.floor(c.x - c.r - 1); x <= Math.ceil(c.x + c.r + 1); x++) {
        if (x < 0 || y < 0 || x >= s.w || y >= s.h) continue;
        const dx = (x + 0.5 - c.x) / c.r, dy = (y + 0.5 - c.y) / c.r;
        // leafy irregular edge
        const edge = 1 + (rnd(x, y, seed) - 0.5) * 0.28;
        const d2 = dx * dx + dy * dy;
        if (d2 > edge * edge) continue;
        const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, d2)));
        let I = dx * L[0] + dy * L[1] + nz * L[2];
        I = I * 0.9 + (c.lit || 0);
        // speckle
        I += (rnd(x * 3, y * 7, seed + 5) - 0.5) * 0.18;
        let idx;
        if (d2 > 0.78 * edge * edge && dy > -0.2) idx = 1; // rim shadow at clump bottom
        else if (I > 0.62) idx = ramp.length - 2;
        else if (I > 0.4) idx = ramp.length - 3;
        else if (I > 0.15) idx = ramp.length - 4;
        else if (I > -0.1) idx = ramp.length - 5;
        else idx = 1;
        if (opts.dark) idx = Math.max(1, idx - 1);
        s.data[y * s.w + x] = ramp[Math.max(0, Math.min(ramp.length - 1, idx))];
        mask[y * s.w + x] = 1;
      }
    }
    // highlight sparkles on top-left
    for (let y = 1; y < s.h - 1; y++) for (let x = 1; x < s.w - 1; x++) {
      const i = y * s.w + x;
      if (s.data[i] === ramp[ramp.length - 2] && rnd(x, y, seed + 9) < 0.18 && !mask[i - s.w - 1]) s.data[i] = ramp[ramp.length - 1];
    }
    s.outline(ramp[0], false);
    return s;
  }

  function treeSprite(kind, v) {
    return cached('tree_' + kind + v, () => {
      const s = new Surface(16, 26);
      const seed = v * 31 + (kind === 'tree2' ? 7 : 0);
      const ramp = kind === 'tree2' ? P.leaf2 : P.leaf;
      // trunk
      if (kind !== 'tree2') {
        for (let y = 17; y < 25; y++) for (let x = 6; x < 10; x++) {
          const c = x === 6 ? P.trunk[3] : x === 9 ? P.trunk[1] : (rnd(x, y, seed) < 0.3 ? P.trunk[1] : P.trunk[2]);
          s.pset(x, y, c);
        }
        s.pset(5, 24, P.trunk[2]); s.pset(10, 24, P.trunk[1]); s.pset(5, 25, P.trunk[1]); s.pset(10, 25, P.trunk[0]);
        for (let x = 6; x < 10; x++) s.pset(x, 25, P.trunk[1]);
      } else {
        for (let y = 20; y < 25; y++) for (let x = 6; x < 10; x++) s.pset(x, y, x < 8 ? P.trunk[2] : P.trunk[1]);
        for (let x = 6; x < 10; x++) s.pset(x, 25, P.trunk[0]);
      }
      const j = (k) => (rnd(v, k, seed) - 0.5);
      let clumps;
      if (kind === 'tree2') {
        clumps = [
          { x: 8 + j(1), y: 8 + j(2), r: 6.5 }, { x: 4 + j(3), y: 12 + j(4), r: 4.6 }, { x: 12 + j(5), y: 12 + j(6), r: 4.6 },
          { x: 8 + j(7), y: 15.5 + j(8), r: 5.4 }, { x: 5 + j(9), y: 6, r: 3.5, lit: 0.1 }, { x: 11 + j(10), y: 6.5, r: 3.4, lit: 0.08 },
        ];
      } else {
        clumps = [
          { x: 8 + j(1), y: 6 + j(2), r: 5.5 }, { x: 3.8 + j(3), y: 10 + j(4), r: 3.9 }, { x: 12.2 + j(5), y: 10 + j(6), r: 3.9 },
          { x: 8, y: 13 + j(7), r: 5 }, { x: 5.5 + j(8), y: 4 + j(9), r: 3, lit: 0.12 }, { x: 10.5 + j(10), y: 3.6 + j(11), r: 3, lit: 0.1 },
          { x: 3.6, y: 15 + j(12), r: 2.6 }, { x: 12.4, y: 15 + j(13), r: 2.6 },
        ];
      }
      foliage(s, clumps, ramp, seed);
      return s;
    });
  }
  function cutTreeSprite(v) {
    return cached('cuttree' + v, () => {
      const s = new Surface(16, 18);
      for (let y = 12; y < 17; y++) { s.pset(7, y, P.trunk[3]); s.pset(8, y, P.trunk[1]); }
      s.pset(6, 17, P.trunk[1]); s.pset(7, 17, P.trunk[2]); s.pset(8, 17, P.trunk[1]); s.pset(9, 17, P.trunk[0]);
      const ramp = [P.leaf[1], P.leaf[2], P.leaf[3], P.leaf[4], P.leaf[5], P.leaf[6], P.leaf[7]];
      foliage(s, [{ x: 8, y: 7, r: 5.2 }, { x: 4.5, y: 10, r: 3.4 }, { x: 11.5, y: 10, r: 3.4 }, { x: 6, y: 4.5, r: 2.8, lit: 0.1 }, { x: 10.5, y: 5, r: 2.5 }], ramp, 300 + v);
      return s;
    });
  }
  function shrubSprite(v) { // small decorative bush
    return cached('shrub' + v, () => {
      const s = new Surface(12, 10);
      foliage(s, [{ x: 6, y: 5, r: 4.4 }, { x: 3, y: 6.5, r: 3 }, { x: 9, y: 6.5, r: 3 }], P.leaf.slice(0), 500 + v);
      return s;
    });
  }

  // Tall grass: staggered leafy tufts with pointed tips; frame 1 sways the tips.
  const TUFT = [
    '...6....6...',
    '..65...654..',
    '..54..6544.6',
    '.6544.5443.5',
    '.5443.4433.4',
    '65433543323.',
    '54332433322.',
    '43322332221.',
    '3322122211..',
    '.21111111...',
  ];
  function tallGrassSprite(v, f) {
    return cached('tg' + v + '_' + f, () => {
      const s = new Surface(16, 16);
      const T = P.tallgrass;
      const put = (ox, oy, flip, sway) => {
        for (let y = 0; y < TUFT.length; y++) for (let x = 0; x < 12; x++) {
          const sx = flip ? 11 - x : x;
          const ch = TUFT[y][sx];
          if (ch === '.') continue;
          let xx = ox + x + (y < 3 ? sway : 0), yy = oy + y;
          xx = ((xx % 16) + 16) % 16;
          if (yy < 0 || yy > 15) continue;
          let c = +ch; if (flip && c >= 3) c = Math.max(2, c - (x < 6 ? 0 : 1));
          s.pset(xx, yy, T[c]);
        }
      };
      const j = k => Math.floor(rnd(v, k, 77) * 3) - 1;
      put(-2 + j(1), -1 + j(2), false, f);
      put(7 + j(3), 1 + j(4), true, f);
      put(2 + j(5), 6 + j(6), true, f);
      put(10 + j(7), 7 + j(8), false, f);
      return s;
    });
  }
  // front blades drawn over a character standing in tall grass (lower part)
  function tallGrassFront(v, f) {
    return cached('tgf' + v + '_' + f, () => {
      const src = tallGrassSprite(v, f);
      const s = new Surface(16, 16);
      for (let y = 7; y < 16; y++) for (let x = 0; x < 16; x++) s.data[y * 16 + x] = src.data[y * 16 + x];
      return s;
    });
  }

  function flowerSprite(color, f) {
    return cached('fl' + color + f, () => {
      const s = new Surface(16, 16);
      const C = P.flower[color];
      const spots = [[3, 4], [10, 2], [7, 9], [13, 10], [2, 12]];
      for (let k = 0; k < spots.length; k++) {
        let [x, y] = spots[k];
        const sway = (f + k) % 2 === 0 ? 0 : (k % 2 ? 1 : -1);
        // stem & leaves
        s.pset(x + 1, y + 3, P.grass[2]); s.pset(x + 1, y + 4, P.grass[2]);
        s.pset(x, y + 4, P.grass[3]); s.pset(x + 2, y + 3, P.grass[3]);
        x += sway * 0;
        // petals: plus shape 3x3 with center
        const px = x + (f % 2 && k % 2 ? 1 : 0);
        s.pset(px + 1, y, C[2]); s.pset(px, y + 1, C[2]); s.pset(px + 2, y + 1, C[1]); s.pset(px + 1, y + 2, C[1]);
        s.pset(px, y, C[3]); s.pset(px + 2, y, C[2]); s.pset(px, y + 2, C[1]); s.pset(px + 2, y + 2, C[0]);
        s.pset(px + 1, y + 1, P.flower.yellow[color === 'yellow' ? 0 : 3]);
      }
      return s;
    });
  }

  function signSprite() {
    return cached('sign', () => {
      const W = P.wood;
      const s = new Surface(16, 16);
      // post
      for (let y = 9; y < 16; y++) { s.pset(7, y, W[3]); s.pset(8, y, W[1]); }
      // board
      for (let y = 2; y < 10; y++) for (let x = 1; x < 15; x++) {
        let c = W[4];
        if (y === 2 || x === 1) c = W[5];
        if (y === 9 || x === 14) c = W[1];
        if ((y === 4 || y === 6) && x > 3 && x < 12 && rnd(x, y, 3) > 0.2) c = W[2];
        s.pset(x, y, c);
      }
      s.pset(1, 2, 0); s.pset(14, 2, 0); s.pset(1, 9, 0); s.pset(14, 9, 0);
      s.outline(P.outline);
      return s;
    });
  }

  // ---------- ground ----------
  // grid: {x0,y0,w,h (cells), kind(cx,cy)->mat, label(cx,cy)}, surf pixel origin corresponds to cell x0,y0
  function paintGround(surf, grid, wx0, wy0) { const it = paintGroundGen(surf, grid, wx0, wy0); let r; while (!(r = it.next()).done); return r.value; }
  function* paintGroundGen(surf, grid, wx0, wy0) {
    const W = surf.w, H = surf.h;
    const mat = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) { if ((y & 15) === 15) yield; for (let x = 0; x < W; x++) {
      const gx = wx0 + x, gy = wy0 + y;
      const dx = (N.warpX.at(gx, gy) - 0.5) * 7, dy = (N.warpY.at(gx, gy) - 0.5) * 7;
      mat[y * W + x] = grid.kind(Math.floor((x + dx) / 16), Math.floor((y + dy) / 16));
    } }
    const M = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : mat[y * W + x];
    // distance from each water pixel to the nearest land pixel (Chebyshev, capped at 9), for the water shading. Two
    // passes of a chessboard distance transform: the same answer as searching outward ring by ring, without the
    // hundreds of lookups per pixel that made big seas (ROUTE 20, CINNABAR, CYCLING ROAD's shore) slow to build
    const wdist = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) wdist[i] = mat[i] === MAT.water ? 9 : 0;
    for (let y = 0; y < H; y++) { if ((y & 31) === 31) yield; for (let x = 0; x < W; x++) {
      const i = y * W + x; let d = wdist[i]; if (!d) continue;
      if (x > 0 && wdist[i - 1] + 1 < d) d = wdist[i - 1] + 1;
      if (y > 0) { const j = i - W; if (wdist[j] + 1 < d) d = wdist[j] + 1; if (x > 0 && wdist[j - 1] + 1 < d) d = wdist[j - 1] + 1; if (x < W - 1 && wdist[j + 1] + 1 < d) d = wdist[j + 1] + 1; }
      wdist[i] = d;
    } }
    for (let y = H - 1; y >= 0; y--) { if ((y & 31) === 31) yield; for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x; let d = wdist[i]; if (!d) continue;
      if (x < W - 1 && wdist[i + 1] + 1 < d) d = wdist[i + 1] + 1;
      if (y < H - 1) { const j = i + W; if (wdist[j] + 1 < d) d = wdist[j] + 1; if (x > 0 && wdist[j - 1] + 1 < d) d = wdist[j - 1] + 1; if (x < W - 1 && wdist[j + 1] + 1 < d) d = wdist[j + 1] + 1; }
      wdist[i] = d;
    } }
    const D = surf.data;
    for (let y = 0; y < H; y++) { if ((y & 15) === 15) yield; for (let x = 0; x < W; x++) {
      const i = y * W + x, m = mat[i], gx = wx0 + x, gy = wy0 + y;
      let c;
      if (m === MAT.grass) {
        const patch = N.big.at(gx >> 1, gy >> 1), clump = N.mid.at(gx, gy);
        let idx = 4;
        if (patch < 0.36) idx = 3; else if (patch > 0.72 && clump > 0.5) idx = 5;
        c = P.grass[idx];
        // edge against other materials
        const up = M(x, y - 1), dn = M(x, y + 1), lf = M(x - 1, y), rt = M(x + 1, y);
        const near = (v) => v && v !== MAT.grass;
        if (near(up) || near(lf) || near(rt) || near(dn)) {
          if (near(M(x, y + 1)) && M(x, y + 1) !== MAT.water) c = P.grass[2];
          else if (near(up) && up !== MAT.water) c = P.grass[5];
          else c = P.grass[3];
        }
        if (M(x, y + 1) === MAT.water || M(x + 1, y) === MAT.water || M(x - 1, y) === MAT.water || M(x, y - 1) === MAT.water) c = P.path[1];
        else if (M(x, y + 2) === MAT.water) c = P.path[2];
      } else if (m === MAT.path || m === MAT.sand) {
        const R = m === MAT.path ? (grid.theme === 'forest' ? P.moss : P.path) : P.sand;
        const patch = N.mid.at(gx, gy), grain = N.fine.at(gx * 2, gy * 2);
        let idx = 4;
        if (patch < 0.22) idx = 3; else if (patch > 0.8) idx = 5;
        if (grain > 0.8 && bayer(gx, gy) > 0.5) idx = Math.min(R.length - 1, idx + 1);
        if (m === MAT.sand) { const rip = Math.sin(gx * 0.35 + Math.sin(gy * 0.5) * 1.5 + gy * 0.9); if (rip > 0.93) idx = 3; }
        c = R[idx];
        // shadow under grass rims (light from the top-left)
        if (M(x, y - 1) === MAT.grass || M(x - 1, y) === MAT.grass) c = R[2];
        else if (M(x, y - 2) === MAT.grass) c = R[3];
        if (M(x, y + 1) === MAT.water || M(x + 1, y) === MAT.water || M(x - 1, y) === MAT.water || M(x, y - 1) === MAT.water) c = R[1];
      } else if (m === MAT.pave) {
        const R = P.pave;
        const row = Math.floor(gy / 8), off = (row % 2) * 4;
        const lx = ((gx + off) % 8 + 8) % 8, ly = ((gy % 8) + 8) % 8;
        const stone = hash2(Math.floor((gx + off) / 8), row, 77);
        let idx = stone < 0.3 ? 4 : stone < 0.8 ? 5 : 3;
        if (lx === 0 || ly === 0) idx = 3;
        else if (lx === 1 || ly === 1) idx = Math.min(6, idx + 1);
        else if (lx === 7 || ly === 7) idx = Math.max(2, idx - 1);
        c = R[idx];
      } else if (m === MAT.rock) {
        const R = P.mtn;
        const patch = N.mid.at(gx, gy), grain = N.fine.at(gx * 3, gy * 3);
        let idx = 4;
        if (patch < 0.3) idx = 3; else if (patch > 0.78) idx = 5;
        if (grain > 0.86 && bayer(gx, gy) > 0.4) idx = Math.max(2, idx - 1);
        c = R[idx];
        if (M(x, y - 1) && M(x, y - 1) !== MAT.rock) c = R[2];
      } else if (m === MAT.water) {
        c = waterColor(gx, gy, wdist[i], 0);
      } else if (m === MAT.floor) {
        c = P.pave[4];
      } else c = P.grass[4];
      D[i] = c;
    } }
    // decorations: grass tufts, pebbles
    const tufts = [
      [[1, 0, 5], [0, 1, 3], [2, 1, 3], [4, 0, 5], [4, 1, 3]],
      [[0, 0, 5], [1, 1, 3], [3, 0, 5], [2, 1, 3], [4, 1, 3]],
      [[1, 0, 6], [1, 1, 3], [0, 1, 3], [2, 1, 3]],
    ];
    for (let by = Math.floor(wy0 / 7) - 1; by <= Math.floor((wy0 + H) / 7) + 1; by++) for (let bx = Math.floor(wx0 / 7) - 1; bx <= Math.floor((wx0 + W) / 7) + 1; bx++) {
      const r = hash2(bx, by, 101);
      const ox = bx * 7 + Math.floor(hash2(bx, by, 102) * 4) - wx0, oy = by * 7 + Math.floor(hash2(bx, by, 103) * 4) - wy0;
      const m0 = M(ox + 1, oy + 1);
      if (m0 === MAT.grass && r < 0.5) {
        const t = tufts[Math.floor(hash2(bx, by, 104) * 3)];
        let ok = true;
        for (const [tx, ty] of t) if (M(ox + tx, oy + ty) !== MAT.grass || M(ox + tx, oy + ty + 2) !== MAT.grass || M(ox + tx - 2, oy + ty) !== MAT.grass || M(ox + tx + 2, oy + ty) !== MAT.grass) ok = false;
        if (ok) for (const [tx, ty, ci] of t) surf.pset(ox + tx, oy + ty, P.grass[ci]);
      } else if ((m0 === MAT.path || m0 === MAT.sand) && r < 0.16) {
        const R = m0 === MAT.path ? (grid.theme === 'forest' ? P.moss : P.path) : P.sand;
        if (M(ox, oy) === m0 && M(ox + 2, oy + 2) === m0 && M(ox - 1, oy - 1) === m0) {
          surf.pset(ox, oy, R[2]); surf.pset(ox + 1, oy, R[2]); surf.pset(ox, oy - 1, R[5]);
          if (r < 0.06) { surf.pset(ox + 1, oy - 1, R[5]); surf.pset(ox + 2, oy, R[1]); }
        }
      } else if (m0 === MAT.rock && r < 0.45) {
        const R = P.mtn;
        if (M(ox, oy) === m0 && M(ox + 2, oy + 2) === m0) {
          surf.pset(ox, oy, R[5]); surf.pset(ox + 1, oy, R[3]); surf.pset(ox, oy + 1, R[2]); surf.pset(ox + 1, oy + 1, R[1]); surf.pset(ox + 2, oy + 1, R[2]);
        }
      }
    }
    return { mat, wdist };
  }

  function waterColor(gx, gy, d, t) {
    const R = P.water;
    let idx;
    if (d <= 1) idx = 7;
    else if (d === 2) idx = 5;
    else if (d <= 4) idx = 4;
    else idx = N.big.at(gx >> 1, gy >> 1) < 0.4 ? 2 : 3;
    // animated wave streaks
    const tt = t * 0.25;
    const w = N.water.at(gx + tt, gy * 2 + Math.sin((gx + tt) * 0.12) * 2);
    if (d > 2) {
      if (w > 0.8) idx = Math.min(6, idx + 2); else if (w > 0.7) idx = Math.min(6, idx + 1);
      else if (w < 0.14) idx = Math.max(1, idx - 1);
    }
    if (d <= 1) {
      // foam breathing
      const f = Math.sin(t * 0.06 + gx * 0.4 + gy * 0.3);
      if (f < -0.35) idx = 6;
    }
    if (d > 3 && hash2(gx, gy, Math.floor(t / 10)) < 0.0015) idx = 7;
    return R[idx];
  }

  // ---------- object painters (cell-level) ----------
  function drawShadowEllipse(s, cx, cy, rx, ry, strength) {
    const m = rgb(255 * (1 - strength * 0.55), 255 * (1 - strength * 0.5), 255 * (1 - strength * 0.35));
    s.ellipseMul(cx, cy, rx, ry, m);
  }
  const SHADOW = rgb(150, 150, 190);
  function shadowPix(s, x, y) { s.pmul(x, y, SHADOW); }

  function paintFence(s, px, py, L, cx, cy) {
    const W = [P.outline, P.cream[1], P.cream[3], P.cream[4], P.cream[5]];
    const left = L(cx - 1, cy) === 'fence', right = L(cx + 1, cy) === 'fence';
    const upF = L(cx, cy - 1) === 'fence', dnF = L(cx, cy + 1) === 'fence';
    if (!left && !right && (upF || dnF)) {
      // vertical run: rails seen from above with a post per cell
      for (let y = 0; y < 16; y++) {
        if (!upF && y < 4) continue;
        shadowPix(s, px + 10, py + y + 1); shadowPix(s, px + 11, py + y + 1);
        s.pset(px + 5, py + y, W[0]); s.pset(px + 6, py + y, W[4]); s.pset(px + 7, py + y, W[3]); s.pset(px + 8, py + y, W[2]); s.pset(px + 9, py + y, W[0]);
      }
      for (let y = 3; y < 13; y++) for (let x = 4; x < 11; x++) {
        const edge = x === 4 || x === 10 || y === 3 || y === 12;
        s.pset(px + x, py + y, edge ? W[0] : (x < 6 ? W[4] : x > 8 ? W[2] : W[3]));
      }
      s.pset(px + 5, py + 4, P.white);
      for (let x = 5; x < 12; x++) shadowPix(s, px + x, py + 13);
      return;
    }
    // shadow on ground
    for (let x = 0; x < 16; x++) { shadowPix(s, px + x + 1, py + 14); if (x % 8 > 3) shadowPix(s, px + x + 1, py + 15); }
    // rails
    const x0 = left ? 0 : 9, x1 = right ? 16 : 14;
    for (let x = x0; x < x1; x++) {
      s.pset(px + x, py + 5, W[0]); s.pset(px + x, py + 6, W[4]); s.pset(px + x, py + 7, W[2]); s.pset(px + x, py + 8, W[0]);
      s.pset(px + x, py + 10, W[0]); s.pset(px + x, py + 11, W[3]); s.pset(px + x, py + 12, W[2]); s.pset(px + x, py + 13, W[0]);
    }
    // posts (two per cell like picket fence)
    for (const ox of [2, 9]) {
      if (!left && ox === 2) continue;
      for (let y = 1; y < 15; y++) {
        s.pset(px + ox, py + y, W[0]); s.pset(px + ox + 5, py + y, W[0]);
        s.pset(px + ox + 1, py + y, W[4]); s.pset(px + ox + 2, py + y, W[3]); s.pset(px + ox + 3, py + y, W[3]); s.pset(px + ox + 4, py + y, W[2]);
      }
      s.pset(px + ox + 1, py, W[0]); s.pset(px + ox + 2, py, W[0]); s.pset(px + ox + 3, py, W[0]); s.pset(px + ox + 4, py, W[0]);
      s.pset(px + ox + 2, py + 1, W[4]);
      for (let x = ox; x < ox + 6; x++) s.pset(px + x, py + 15, W[0]);
    }
  }

  function paintSign(s, px, py) {
    drawShadowEllipse(s, px + 9, py + 15, 5, 1.5, 0.6);
    s.blit(signSprite(), px, py - 1);
  }

  function paintLedge(s, px, py, L, cx, cy, dir) {
    const G2 = P.grass, R = P.path;
    const same = (dx, dy) => L(cx + dx, cy + dy) === 'ledge_' + dir;
    if (dir === 'd') {
      const lft = same(-1, 0), rgt = same(1, 0);
      for (let x = 0; x < 16; x++) {
        const edgeL = !lft && x < 2, edgeR = !rgt && x > 13;
        const bump = Math.round(Math.sin((cx * 16 + x) * 0.45) * 0.6);
        const top = 9 + bump + (edgeL ? 2 - x : 0) + (edgeR ? x - 13 : 0);
        s.pset(px + x, py + top - 1, G2[6]);
        s.pset(px + x, py + top, G2[5]);
        s.pset(px + x, py + top + 1, G2[3]);
        for (let y = top + 2; y < 15; y++) s.pset(px + x, py + y, y === top + 2 ? R[2] : y < 14 ? R[1] : R[0]);
        s.pset(px + x, py + 15, P.outline);
        // shadow onto the cell below
        s.pmul(px + x, py + 16, SHADOW); if (x % 3) s.pmul(px + x, py + 17, SHADOW);
      }
      // little rock accents in the face
      for (let x = 2; x < 15; x += 5) { const k = Math.floor(rnd(cx * 16 + x, cy, 9) * 3); s.pset(px + x + k, py + 12, R[3]); s.pset(px + x + k + 1, py + 13, R[0]); }
    } else {
      const up = same(0, -1), dn = same(0, 1);
      const face = dir === 'l' ? [0, 1, 2, 3, 4] : [15, 14, 13, 12, 11];
      for (let y = 0; y < 16; y++) {
        if (!up && y < 2) continue; if (!dn && y > 14) continue;
        const [a, b, c, d, e] = face;
        s.pset(px + a, py + y, P.outline); s.pset(px + b, py + y, R[0]); s.pset(px + c, py + y, R[1]);
        s.pset(px + d, py + y, G2[3]); s.pset(px + e, py + y, G2[5]);
      }
    }
  }

  // Rocky boulder texture (Voronoi chunks lit from the top-left) in world pixel space
  function rockPixel(gx, gy, R, bias) {
    const CW = 7, CH = 6;
    const bx = Math.floor(gx / CW), by = Math.floor(gy / CH);
    let d1 = 1e9, d2 = 1e9, fx = 0, fy = 0, id = 0;
    for (let yy = by - 1; yy <= by + 1; yy++) for (let xx = bx - 1; xx <= bx + 1; xx++) {
      const px = (xx + 0.15 + hash2(xx, yy, 61) * 0.7) * CW, py = (yy + 0.15 + hash2(xx, yy, 62) * 0.7) * CH;
      const dx = (gx + 0.5 - px), dy = (gy + 0.5 - py) * 1.15, d = dx * dx + dy * dy;
      if (d < d1) { d2 = d1; d1 = d; fx = dx; fy = dy; id = hash2(xx, yy, 63); }
      else if (d < d2) d2 = d;
    }
    const edge = Math.sqrt(d2) - Math.sqrt(d1);
    if (edge < 1.1) return R[0 + (bias > 0 ? 1 : 0)];
    const len = Math.sqrt(d1) + 0.001;
    const lit = -(fx * 0.6 + fy * 0.8) / len * Math.min(1, len / 3.2);
    let idx = 3 + (id < 0.3 ? -1 : id > 0.75 ? 1 : 0) + bias;
    if (lit > 0.45) idx += 2; else if (lit > 0.1) idx += 1; else if (lit < -0.45) idx -= 1;
    if (edge < 2.1 && lit < 0) idx -= 1;
    return R[Math.max(1, Math.min(R.length - 1, idx))];
  }
  function paintCliff(s, px, py, L, cx, cy) {
    const R = P.rock;
    const isC = (l) => l === 'cliff' || l === 'cave_door';
    const upL = L(cx, cy - 1), dnL = L(cx, cy + 1), lfL = L(cx - 1, cy), rtL = L(cx + 1, cy);
    const topIsPlateau = upL === 'cliff_top';
    const openLeft = !isC(lfL) && lfL !== 'cliff_top', openRight = !isC(rtL) && rtL !== 'cliff_top';
    const plateauLeft = lfL === 'cliff_top', plateauRight = rtL === 'cliff_top';
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const gx = cx * 16 + x + 4096, gy = cy * 16 + y + 4096;
      let bias = 0;
      if (plateauRight && x > 11) bias = -1;
      if (openRight && x > 12) bias = -1;
      s.pset(px + x, py + y, rockPixel(gx, gy, R, bias));
    }
    if (topIsPlateau) { for (let x = 0; x < 16; x++) { s.pset(px + x, py, R[6]); s.pset(px + x, py + 1, R[5]); s.pset(px + x, py + 2, R[3]); } }
    if (plateauLeft) for (let y = 0; y < 16; y++) { s.pset(px, py + y, R[6]); s.pset(px + 1, py + y, R[5]); }
    if (plateauRight) for (let y = 0; y < 16; y++) { s.pset(px + 15, py + y, R[1]); s.pset(px + 14, py + y, R[2]); }
    if (!isC(dnL) && dnL !== 'cliff_top') {
      for (let x = 0; x < 16; x++) { s.pset(px + x, py + 15, R[0]); s.pmul(px + x, py + 16, SHADOW); s.pmul(px + x, py + 17, SHADOW); }
    }
    if (openLeft) for (let y = 0; y < 16; y++) s.pset(px, py + y, R[0]);
    if (openRight) for (let y = 0; y < 16; y++) { s.pset(px + 15, py + y, R[0]); s.pmul(px + 16, py + y, SHADOW); s.pmul(px + 17, py + y, SHADOW); }
  }

  function paintCliffTopEdges(s, px, py, L, cx, cy) {
    // rim where plateau meets lower ground
    const R = P.rock;
    if (L(cx, cy + 1) !== 'cliff_top' && L(cx, cy + 1) !== 'cliff' && L(cx, cy + 1) !== 'cave_door') {
      // front face of the plateau drops into the next cell visually: draw a rocky lip
      for (let y = 10; y < 16; y++) for (let x = 0; x < 16; x++) s.pset(px + x, py + y, rockPixel(cx * 16 + x + 4096, cy * 16 + y + 4096, R, y > 13 ? -1 : 0));
    }
    const low = l => l !== 'cliff_top' && l !== 'cliff' && l !== 'cave_door' && l !== 'tree' && l !== 'tree2';
    if (low(L(cx, cy + 1))) for (let x = 0; x < 16; x++) { s.pset(px + x, py + 13, R[6]); s.pset(px + x, py + 14, R[2]); s.pset(px + x, py + 15, R[0]); s.pmul(px + x, py + 16, SHADOW); }
    if (low(L(cx, cy - 1))) for (let x = 0; x < 16; x++) { s.pset(px + x, py, R[1]); s.pset(px + x, py + 1, R[6]); }
    if (low(L(cx - 1, cy))) for (let y = 0; y < 16; y++) { s.pset(px, py + y, R[1]); s.pset(px + 1, py + y, R[6]); }
    if (low(L(cx + 1, cy))) for (let y = 0; y < 16; y++) { s.pset(px + 15, py + y, R[0]); s.pset(px + 14, py + y, R[3]); s.pmul(px + 16, py + y, SHADOW); }
  }

  function paintCaveDoor(s, px, py, L, cx, cy) {
    paintCliff(s, px, py, L, cx, cy);
    const R = P.rock;
    for (let y = 2; y < 16; y++) for (let x = 1; x < 15; x++) {
      const dx = (x - 7.5) / 6.5, dy = (y - 16) / 13.5;
      const d = dx * dx + dy * dy;
      if (d < 1) {
        const depth = 1 - d;
        s.pset(px + x, py + y, depth > 0.45 ? P.black : depth > 0.2 ? rgb(22, 16, 26) : R[0]);
      } else if (d < 1.25) s.pset(px + x, py + y, y < 8 ? R[5] : R[4]);
    }
  }

  function paintBridge(s, px, py, L, cx, cy) {
    const W = P.wood;
    const isB = l => l === 'bridge';
    const lf = L(cx - 1, cy), rt = L(cx + 1, cy);
    const horizontalWalk = isB(lf) && isB(rt) && !isB(L(cx, cy - 1)) && !isB(L(cx, cy + 1));
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let c;
      if (!horizontalWalk) { // planks run horizontally, walk N-S
        const pl = (cy * 16 + y) % 4;
        c = pl === 3 ? W[1] : pl === 0 ? W[5] : (hash2(cx * 16 + x >> 3, (cy * 16 + y) >> 2, 5) < 0.5 ? W[4] : W[3]);
        if (pl !== 3 && ((cx * 16 + x + ((cy * 16 + y) >> 2) * 5) % 16 === 0)) c = W[2];
      } else {
        const pl = (cx * 16 + x) % 4;
        c = pl === 3 ? W[1] : pl === 0 ? W[5] : (hash2((cx * 16 + x) >> 2, (cy * 16 + y) >> 3, 5) < 0.5 ? W[4] : W[3]);
      }
      s.pset(px + x, py + y, c);
    }
    // rails where the side is not bridge
    if (!horizontalWalk) {
      if (!isB(lf) && G.GROUND[lf] === 'water' || lf === 'water') { for (let y = 0; y < 16; y++) { s.pset(px, py + y, W[0]); s.pset(px + 1, py + y, W[2]); } for (let y = 1; y < 16; y += 8) { s.pset(px + 1, py + y, W[5]); s.pset(px + 1, py + y + 1, W[4]); } }
      if (!isB(rt) && G.GROUND[rt] === 'water' || rt === 'water') { for (let y = 0; y < 16; y++) { s.pset(px + 15, py + y, W[0]); s.pset(px + 14, py + y, W[2]); s.pmul(px + 16, py + y, SHADOW); s.pmul(px + 17, py + y, SHADOW); } }
    } else {
      for (let x = 0; x < 16; x++) { s.pset(px + x, py, W[0]); s.pset(px + x, py + 1, W[2]); s.pset(px + x, py + 15, W[0]); s.pmul(px + x, py + 16, SHADOW); }
    }
  }

  function paintStairs(s, px, py) {
    const W = P.rock;
    for (let y = 0; y < 16; y++) for (let x = 1; x < 15; x++) {
      const st = y % 4;
      s.pset(px + x, py + y, st === 0 ? W[6] : st === 3 ? W[2] : W[4]);
    }
    for (let y = 0; y < 16; y++) { s.pset(px, py + y, W[1]); s.pset(px + 15, py + y, W[1]); }
  }

  function paintCurb(s, px, py, quad) {
    const S = P.stone;
    const seg = (x0, y0, x1, y1) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) s.pset(px + x, py + y, S[5]);
    };
    for (let k = 0; k < 4; k++) {
      const t = quad[k], ox = (k & 1) * 8, oy = (k >> 1) * 8;
      if (t === 0x10) { for (let y = 0; y < 8; y++) { s.pset(px + ox + 3, py + oy + y, S[6]); s.pset(px + ox + 4, py + oy + y, S[4]); s.pset(px + ox + 5, py + oy + y, S[2]); s.pmul(px + ox + 6, py + oy + y, SHADOW); } }
      else if (t === 0x20) { for (let x = 0; x < 8; x++) { s.pset(px + ox + x, py + oy + 3, S[6]); s.pset(px + ox + x, py + oy + 4, S[4]); s.pset(px + ox + x, py + oy + 5, S[2]); s.pmul(px + ox + x, py + oy + 6, SHADOW); } }
      else if (t === 0x21) {
        s.ellipse(px + ox + 4.5, py + oy + 4.5, 2.8, 2.8, S[2]);
        s.ellipse(px + ox + 4, py + oy + 4, 2.2, 2.2, S[5]);
        s.pset(px + ox + 3, py + oy + 3, S[6]);
        seg; // posts only
      }
    }
  }

  // ---- extra outdoor props ----
  function paintPillar(s, up, px, py, L, cx, cy) {
    const ST = P.stone;
    for (let y = -6; y < 16; y++) for (let x = 3; x < 13; x++) {
      const t = y < 10 ? up : s;
      let c = x < 5 ? ST[6] : x > 10 ? ST[3] : ST[5];
      if (y < -3 || (y > 11)) c = y === -6 || y === 15 ? P.outline : ST[6];
      if (x === 3 || x === 12) c = P.outline;
      (y < 0 ? up : s).pset(px + x, py + y, c);
    }
    for (let y = 2; y < 16; y++) s.pmul(px + 13, py + y, SHADOW);
  }
  // Carved-stone Pokémon: the species sprite re-lit as chiselled stone (luminance -> stone ramp, rim light, dither).
  const STONE_W = ['#2a2622', '#46403a', '#645c50', '#847b6a', '#a59c88', '#c6bea8', '#e4ddc8'].map(G.gfx.hex);
  function stoneSprite(sp, size, mossy) {
    return cached('stone:' + sp + ':' + size + ':' + (mossy ? 1 : 0), () => {
      const src = G.pokeSprite(sp, 'front', size);
      let x0 = src.w, y0 = src.h, x1 = -1, y1 = -1;
      for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) if (src.data[y * src.w + x] >>> 24) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      if (x1 < 0) return new Surface(1, 1);
      const A = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && (src.data[y * src.w + x] >>> 24) !== 0;
      const o = new Surface(x1 - x0 + 1, y1 - y0 + 1), hh = Math.max(1, y1 - y0);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (!A(x, y)) continue;
        const c = src.data[y * src.w + x];
        const lum = (0.3 * (c & 255) + 0.59 * ((c >>> 8) & 255) + 0.11 * ((c >>> 16) & 255)) / 255;
        let col;
        if (!A(x - 1, y) || !A(x + 1, y) || !A(x, y - 1) || !A(x, y + 1)) col = STONE_W[0];
        else {
          let v = 1.7 + lum * 4.1 - ((y - y0) / hh) * 0.7;
          if (!A(x - 1, y - 1) || !A(x, y - 2)) v += 0.9;
          if (!A(x + 1, y + 1) || !A(x + 2, y)) v -= 0.8;
          v += (bayer(x, y) - 0.5) * 0.8;
          col = STONE_W[Math.max(1, Math.min(6, Math.floor(v)))];
          if (mossy && (y - y0) / hh > 0.55 && rnd(x, y, 77) < 0.12) col = P.moss[(rnd(x, y, 78) * 2 | 0) + 3];
        }
        o.pset(x - x0, y - y0, col);
      }
      return o;
    });
  }
  // A statue on a pedestal occupying a vertical run of n cells starting at (px,py); pixels above py go to the overlay.
  function paintStatueAt(s, up, px, py, n, sp, opts) {
    opts = opts || {};
    const Hh = n * 16, baseH = n > 1 ? 9 : 7, by = py + Hh - baseH;
    for (let x = 2; x < 17; x++) for (let y = by + 2; y < py + Hh + 2; y++) if (x > 14 || y >= py + Hh) s.pmul(px + x, y, SHADOW);
    for (let y = 0; y < baseH; y++) for (let x = 1; x < 15; x++) {
      let c = y < 3 ? STONE_W[y === 0 ? 6 : 5] : y === 3 ? STONE_W[2] : y === baseH - 1 ? STONE_W[2] : STONE_W[4 - (x > 11 ? 1 : 0)];
      if (y > 3 && y < baseH - 1 && (x === 4 || x === 11)) c = STONE_W[3];
      if (x === 1 || x === 14 || y === baseH - 1) c = P.outline;
      s.pset(px + x, by + y, c);
    }
    // largest render that fits the statue's cells (+ overhang into the overlay when nothing sits above it)
    const limit = Hh - baseH + 2 + (opts.overhang === undefined ? 10 : opts.overhang);
    let size = opts.size || (n > 1 ? 36 : 26), spr = stoneSprite(sp, size, opts.mossy);
    while (spr.h > limit && size > 16) { size -= 2; spr = stoneSprite(sp, size, opts.mossy); }
    const dx = px + 8 - (spr.w >> 1), dy = by + 2 - spr.h;
    for (let y = 0; y < spr.h; y++) for (let x = 0; x < spr.w; x++) {
      const c = spr.data[y * spr.w + x]; if (!(c >>> 24)) continue;
      (dy + y < py ? up : s).pset(dx + x, dy + y, c);
    }
  }
  const STATUE_MONS = { SafariZone: ['RHYHORN', 'KANGASKHAN', 'TAUROS', 'NIDOKING', 'CHANSEY', 'SCYTHER'], PokemonMansion: ['MEWTWO'], LancesRoom: ['DRAGONITE'], IndigoPlateau: ['DRAGONITE', 'ARCANINE', 'LAPRAS', 'GYARADOS'] };
  function statueSpecies(mapName, wx, wy) {
    const k = Object.keys(STATUE_MONS).find(k => (mapName || '').startsWith(k));
    const list = k ? STATUE_MONS[k] : ['RHYDON', 'ARCANINE', 'DRAGONITE', 'NIDOKING'];
    return list[Math.floor(rnd(wx, wy, 5) * list.length)];
  }
  // statues are 2 cells tall (top + base); a vertical run of statue cells is split into consecutive pairs.
  // Returns the statue height in cells when (cx,cy) is a statue's top cell, else 0.
  function statueTop(L, cx, cy, lbl) {
    let top = cy; while (top > cy - 16 && L(cx, top - 1) === lbl) top--;
    if ((cy - top) % 2) return 0;
    return L(cx, cy + 1) === lbl ? 2 : 1;
  }
  function paintStatue(s, up, px, py, L, cx, cy, mapName, wx, wy) {
    const n = statueTop(L, cx, cy, 'statue'); if (!n) return;
    paintStatueAt(s, up, px, py, n, statueSpecies(mapName, (wx || 0) + cx, wy || 0), { mossy: true, overhang: L(cx, cy - 1) === 'statue' || L(cx, cy + 2) === 'statue' ? 0 : 10 });
  }
  // Indigo Plateau fire brazier on a column top; the flame itself is animated by drawFlame
  const IRON = ['#221e28', '#3a3442', '#58506a', '#7a7090', '#b0a8c4'].map(G.gfx.hex);
  function paintBrazier(s, up, px, py) {
    const ST = P.stone;
    for (let y = 8; y < 16; y++) for (let x = 3; x < 13; x++) {
      let c = x < 5 ? ST[6] : x > 10 ? ST[3] : ST[5];
      if (y === 8) c = ST[2];
      if (x === 3 || x === 12) c = P.outline;
      s.pset(px + x, py + y, c);
    }
    for (let x = 2; x < 14; x++) { s.pset(px + x, py + 7, x === 2 || x === 13 ? P.outline : ST[6]); s.pset(px + x, py + 8, P.outline); }
    // bowl: widening upward, iron with a bright rim
    for (let y = 2; y < 7; y++) {
      const hw = 3 + (6 - y) * 0.9;
      for (let x = Math.round(8 - hw); x < Math.round(8 + hw); x++) {
        const edge = x === Math.round(8 - hw) || x === Math.round(8 + hw) - 1;
        let c = edge || y === 6 ? P.outline : IRON[x < 7 ? 3 : x > 10 ? 1 : 2];
        if (y === 3 && !edge) c = IRON[4];
        if (y === 5 && !edge && (x & 1)) c = IRON[1];
        s.pset(px + x, py + y, c);
      }
    }
    // glowing coals in the rim
    for (let x = 3; x < 13; x++) { s.pset(px + x, py + 2, x === 3 || x === 12 ? P.outline : G.gfx.hex(x & 1 ? '#ffb040' : '#e06020')); if (x > 3 && x < 12) s.pset(px + x, py + 1, P.outline); }
    for (let y = 9; y < 16; y++) s.pmul(px + 13, py + y, SHADOW);
  }
  const FLAME = ['#fffbe0', '#ffe476', '#ffab34', '#f2661c', '#b8341a'].map(G.gfx.hex);
  function drawFlame(s, bx, by, t, seed) {
    const f = Math.floor(t / 5) + seed * 13;
    const Hf = 10 + ((rnd(f, seed, 31) * 3) | 0);
    for (let r = 0; r < Hf; r++) {
      const k = r / Hf;
      const w = 4.4 * Math.pow(1 - k, 0.7) + (rnd(f, r, 32) - 0.5) * 1.1;
      if (w < 0.4) continue;
      const cxo = Math.sin(f * 0.9 + r * 0.55 + seed) * k * 1.7;
      for (let x = Math.floor(cxo - w); x <= Math.ceil(cxo + w); x++) {
        const d = Math.abs(x + 0.5 - cxo) / w;
        if (d > 1) continue;
        const v = d * 0.7 + k * 0.62 + (rnd(x + f, r, 33) - 0.5) * 0.22;
        s.pset(bx + x, by - r, FLAME[Math.max(0, Math.min(4, Math.floor(v * 4)))]);
      }
    }
    if (rnd(f, seed, 34) < 0.4) s.pset(bx + ((rnd(f, seed, 35) * 7) | 0) - 3, by - Hf - 1 - ((rnd(f, seed, 36) * 4) | 0), FLAME[1]);
  }
  function paintCrate(s, px, py) {
    const W = P.wood;
    for (let y = 2; y < 16; y++) for (let x = 1; x < 15; x++) {
      let c = y < 6 ? W[5] : W[3];
      if (x === 1 || x === 14 || y === 2 || y === 15) c = P.outline; else if (y === 6) c = W[2];
      if (y > 6 && (x === 7 || x === 8)) c = W[2];
      s.pset(px + x, py + y, c);
    }
    for (let x = 2; x < 16; x++) s.pmul(px + x, py + 16, SHADOW);
  }
  function paintTruck(s, up, px, py, L, cx, cy) {
    // draw the whole truck from its top-left machine cell
    if (L(cx - 1, cy) === 'machine' || L(cx, cy - 1) === 'machine') return;
    const w = 32, h = 22, x0 = px, y0 = py - 4;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let c;
      if (x < 11) c = y < 8 ? P.glass[3] : P.roofs.blue[3]; else c = y < 3 ? P.cream[5] : P.cream[4];
      if (y === 0 || x === 0 || x === w - 1 || y === h - 5) c = P.outline;
      if (x === 11) c = P.outline;
      if (y > h - 5) c = null;
      if (c !== null) (y0 + y < py ? up : s).pset(x0 + x, y0 + y, c);
    }
    for (const wx of [6, 24]) { s.disc(x0 + wx, y0 + h - 3, 3.5, P.outline); s.disc(x0 + wx, y0 + h - 3, 2, P.stone[3]); }
    for (let x = 0; x < w; x++) s.pmul(x0 + x + 2, y0 + h, SHADOW);
  }
  function paintShip(s, up, cells, ox, oy) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of cells) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const px0 = ox + x0 * 16, py0 = oy + y0 * 16, W = (x1 - x0 + 1) * 16, Hh = (y1 - y0 + 1) * 16;
    const hullTop = py0 + Math.floor(Hh * 0.42);
    for (let y = py0; y < py0 + Hh; y++) for (let x = px0 - 6; x < px0 + W + 4; x++) {
      const ly = y - py0, lx = x - px0;
      // hull outline: pointed bow on the left, rounded stern on the right
      const bow = Math.max(0, (ly - Hh * 0.2) * 0.55);
      if (lx < -6 + bow || lx > W + 3 - Math.max(0, (ly - Hh * 0.55) * 0.6)) continue;
      let c;
      if (y < hullTop) { // deck
        c = ((x + Math.floor(y / 3) * 5) % 12 === 0) ? P.wood[3] : (y % 3 === 0 ? P.wood[4] : P.wood[5]);
        if (y === py0) c = P.outline;
      } else {
        const d = y - hullTop;
        c = d < 2 ? P.white : d < Hh * 0.3 ? P.cream[5] : d < Hh * 0.36 ? P.roofs.red[3] : P.roofs.blue[1];
        if (d === 0) c = P.outline;
        if (d > 3 && d < 7 && ((x - px0) % 12 === 4)) c = P.glass[2];
      }
      s.pset(x, y, c);
    }
    // cabins and funnels
    const cabX = px0 + Math.floor(W * 0.3), cabW = Math.floor(W * 0.45), cabY = py0 + 2;
    for (let y = cabY - 8; y < hullTop - 1; y++) for (let x = cabX; x < cabX + cabW; x++) {
      let c = y < cabY - 5 ? P.cream[4] : P.white;
      if (y === cabY - 8 || x === cabX || x === cabX + cabW - 1) c = P.outline;
      if (y > cabY - 3 && (x - cabX) % 6 === 3) c = P.glass[3];
      (y < py0 ? up : s).pset(x, y, c);
    }
    for (let k = 0; k < 2; k++) {
      const fx = cabX + 6 + k * Math.floor(cabW / 2), fy = cabY - 22;
      for (let y = fy; y < cabY - 8; y++) for (let x = fx; x < fx + 8; x++) {
        let c = y < fy + 5 ? P.outline : x < fx + 2 ? P.roofs.red[5] : P.roofs.red[3];
        if (x === fx || x === fx + 7) c = P.outline;
        (y < py0 ? up : s).pset(x, y, c);
      }
    }
    for (let x = px0 - 4; x < px0 + W + 6; x++) for (let y = py0 + Hh; y < py0 + Hh + 3; y++) s.pmul(x, y, SHADOW);
  }

  G.terrain = {
    paintPillar, paintStatue, paintStatueAt, statueTop, stoneSprite, statueSpecies, paintBrazier, drawFlame, paintCrate, paintTruck, paintShip,
    MAT, paintGround, paintGroundGen, waterColor, rockPixel, treeSprite, cutTreeSprite, shrubSprite, tallGrassSprite, tallGrassFront, flowerSprite,
    paintFence, paintSign, paintLedge, paintCliff, paintCliffTopEdges, paintCaveDoor, paintBridge, paintStairs, paintCurb,
    drawShadowEllipse, SHADOW, foliage, cached,
  };
})(window.G);
