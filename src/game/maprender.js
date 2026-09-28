// Builds pre-rendered static layers for a map and animates water / grass / flowers in place.
(function (G) {
  'use strict';
  const { Surface, hash2 } = G.gfx;
  const T = G.terrain, P = G.PAL;
  const MX = 11, MY = 7;
  const MATOF = { grass: 1, path: 2, sand: 3, pave: 4, water: 5, rock: 6, floor: 7 };
  const DEFAULT_GROUND = {
    tree: 'grass', tree2: 'grass', cut_tree: 'grass', fence: 'path', sign: 'path', ledge_d: 'grass', ledge_l: 'grass', ledge_r: 'grass',
    cliff: 'rock', cave_door: 'rock', roof_house: 'path', roof_flat: 'path', wall: 'path', window: 'path', door: 'path',
    sign_poke: 'path', sign_mart: 'path', sign_gym: 'path',
  };
  const FLOWER_COLORS = ['red', 'yellow', 'white', 'pink'];
  const cache = {};

  function build(map) { const it = buildGen(map); let r; while (!(r = it.next()).done); return r.value; }
  function* buildGen(map) {
    if (map.interior && G.interior) return G.interior.build(map);
    const cw = map.w + MX * 2, ch = map.h + MY * 2;
    const W = cw * 16, H = ch * 16;
    const s = new Surface(W, H), up = new Surface(W, H);
    const Lraw = (cx, cy) => map.labelAt(cx, cy);
    // label grid with margin (+1 ring for neighbour lookups)
    const lab = [];
    for (let y = -1; y <= ch; y++) { const row = []; for (let x = -1; x <= cw; x++) row.push(Lraw(x - MX, y - MY)); lab.push(row); }
    const L = (cx, cy) => { const r = lab[cy + MY + 1]; if (!r) return Lraw(cx, cy); const v = r[cx + MX + 1]; return v === undefined ? Lraw(cx, cy) : v; };
    // ground kind grid
    const gk = new Array((cw + 2) * (ch + 2)).fill(null);
    const GI = (x, y) => (y + 1) * (cw + 2) + (x + 1);
    for (let y = -1; y <= ch; y++) for (let x = -1; x <= cw; x++) gk[GI(x, y)] = G.GROUND[L(x - MX, y - MY)] || null;
    for (let pass = 0; pass < 3; pass++) {
      const nx = gk.slice();
      for (let y = -1; y <= ch; y++) for (let x = -1; x <= cw; x++) {
        if (gk[GI(x, y)]) continue;
        const votes = {};
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue; const xx = x + dx, yy = y + dy;
          if (xx < -1 || yy < -1 || xx > cw || yy > ch) continue;
          const k = gk[GI(xx, yy)]; if (k && k !== 'water') votes[k] = (votes[k] || 0) + (dx && dy ? 1 : 2);
        }
        let best = null, bv = 0; for (const k in votes) if (votes[k] > bv) { bv = votes[k]; best = k; }
        if (best) nx[GI(x, y)] = best;
      }
      for (let i = 0; i < gk.length; i++) gk[i] = nx[i];
    }
    for (let y = -1; y <= ch; y++) for (let x = -1; x <= cw; x++) if (!gk[GI(x, y)]) gk[GI(x, y)] = DEFAULT_GROUND[L(x - MX, y - MY)] || 'grass';
    // cells labeled with building parts sitting on grass look better on path; trees always on grass
    const kind = (x, y) => { if (x < -1 || y < -1 || x > cw || y > ch) return MATOF.grass; return MATOF[gk[GI(x, y)]] || MATOF.grass; };

    const wx0 = (map.world ? map.world.x : 0) * 16 - MX * 16, wy0 = (map.world ? map.world.y : 0) * 16 - MY * 16;
    const ground = yield* T.paintGroundGen(s, { kind, theme: map.tsFile === 'forest' && !/Safari/.test(map.name) ? 'forest' : null }, wx0, wy0);

    const anim = [];
    const saveCell = (px, py) => { const c = new Uint32Array(256); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) c[y * 16 + x] = s.data[(py + y) * W + px + x]; return c; };

    // buildings (only for cells inside this surface)
    const Lsurf = (x, y) => L(x - MX, y - MY);
    const blds = G.buildings.findBuildings(cw, ch, Lsurf).map(c => G.buildings.describe(c, Lsurf));
    const lights = [], fires = [];
    const worldX = map.world ? map.world.x : 0, worldY = map.world ? map.world.y : 0;
    for (const b of blds) {
      const opts = { wx: worldX - MX, wy: worldY - MY, isDoor: (x, y) => map.isDoorTile(x - MX, y - MY) && G.buildings.BLD.has(Lsurf(x, y)) && Lsurf(x, y + 1) !== Lsurf(x, y) };
      const ov = G.buildingStyles && G.buildingStyles(map, b, MX, MY);
      if (ov) Object.assign(opts, ov);
      G.buildings.paintBuilding(s, up, b, Lsurf, 0, 0, opts);
      yield; // a building at a time, so a background build never stalls a frame
      if (b.type !== 'terrace') for (const [bx, by] of b.cells) { const l = Lsurf(bx, by); if (l === 'window' || l === 'door' || l === 'sign_poke' || l === 'sign_mart') lights.push({ x: bx * 16 + 8, y: by * 16 + 9, k: l }); }
    }
    // ships (S.S. Anne at the dock)
    {
      const seen = new Set();
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        const l = L(x - MX, y - MY); if ((l !== 'deck' && l !== 'ship_wall') || seen.has(x + ',' + y)) continue;
        const st = [[x, y]], cells = []; seen.add(x + ',' + y);
        while (st.length) { const [a, b] = st.pop(); cells.push([a, b]); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (a + dx) + ',' + (b + dy); const l2 = L(a + dx - MX, b + dy - MY); if (!seen.has(k) && (l2 === 'deck' || l2 === 'ship_wall')) { seen.add(k); st.push([a + dx, b + dy]); } } }
        if (cells.length >= 6) T.paintShip(s, up, cells, 0, 0);
      }
    }
    // cell objects, top to bottom
    for (let y = -1; y < ch; y++) { if ((y & 3) === 3) yield; for (let x = 0; x < cw; x++) {
      const l = L(x - MX, y - MY), px = x * 16, py = y * 16;
      const LL = (cx, cy) => L(cx - MX, cy - MY);
      switch (l) {
        case 'tree': case 'tree2': {
          const v = Math.floor(hash2(x + worldX, y + worldY, 3) * 6);
          T.drawShadowEllipse(s, px + 9, py + 14, 7, 2.5, 0.8);
          const spr = T.treeSprite(l, v);
          const top = py + 16 - spr.h;
          s.blit(spr, px, top + 10 - 0, { sy: 10, sh: spr.h - 10 });
          up.blit(spr, px, top, { sh: 10 });
          break;
        }
        case 'cut_tree': {
          T.drawShadowEllipse(s, px + 9, py + 14, 6, 2, 0.7);
          const spr = T.cutTreeSprite(Math.floor(hash2(x, y, 5) * 3));
          s.blit(spr, px, py - 2, { sy: 2 }); up.blit(spr, px, py - 2, { sh: 2 });
          break;
        }
        case 'fence': T.paintFence(s, px, py, LL, x, y); break;
        case 'sign': T.paintSign(s, px, py); break;
        case 'ledge_d': T.paintLedge(s, px, py, LL, x, y, 'd'); break;
        case 'ledge_l': T.paintLedge(s, px, py, LL, x, y, 'l'); break;
        case 'ledge_r': T.paintLedge(s, px, py, LL, x, y, 'r'); break;
        case 'cliff': T.paintCliff(s, px, py, LL, x, y); break;
        case 'cliff_top': T.paintCliffTopEdges(s, px, py, LL, x, y); break;
        case 'cave_door': T.paintCaveDoor(s, px, py, LL, x, y); break;
        case 'bridge': T.paintBridge(s, px, py, LL, x, y); break;
        case 'stairs_wood': T.paintStairs(s, px, py); break;
        case 'curb': { const q = map.inside(x - MX, y - MY) ? map.quad(x - MX, y - MY) : null; if (q) T.paintCurb(s, px, py, q); break; }
        case 'flowers': if (y >= 0) anim.push({ t: 'flower', px, py, bg: saveCell(px, py), c: FLOWER_COLORS[Math.floor(hash2(x + worldX, y + worldY, 8) * 4)], ph: (x + y) % 2 }); break;
        case 'tall_grass': if (y >= 0) anim.push({ t: 'grass', px, py, bg: saveCell(px, py), v: Math.floor(hash2(x + worldX, y + worldY, 9) * 4), cx: x - MX, cy: y - MY }); break;
        case 'unknown': s.rect(px + 4, py + 4, 8, 8, G.gfx.hex('#ff00ff')); break;
        case 'pillar': T.paintPillar(s, up, px, py, LL, x, y); break;
        case 'statue':
          if (map.tsFile === 'plateau') { T.paintBrazier(s, up, px, py); if (y >= 0) { fires.push({ x: px + 8, y: py + 2, seed: x * 7 + y * 3 }); lights.push({ x: px + 8, y: py - 2, k: 'fire' }); } }
          else T.paintStatue(s, up, px, py, LL, x, y, map.name, worldX, worldY);
          break;
        case 'crate': T.paintCrate(s, px, py); break;
        case 'machine': T.paintTruck(s, up, px, py, LL, x, y); break;
      }
    } }
    elevationEdges(s, map, MX * 16, MY * 16);
    yield;
    // water mask: pixels still showing base water (a big sea is a lot of pixels: pause every 16 rows)
    const wmask = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) { if ((y & 15) === 15) yield; for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (ground.mat[i] === MATOF.water && s.data[i] === T.waterColor(wx0 + x, wy0 + y, ground.wdist[i], 0)) wmask[i] = 1;
    } }
    // first frame of animated cells
    const R = { map, s, up, W, H, mx: MX, my: MY, anim, wmask, wdist: ground.wdist, wx0, wy0, lastT: -1, gcell: {}, lights, fires };
    for (const a of anim) if (a.t === 'grass') R.gcell[a.cx + ',' + a.cy] = a;
    for (const a of anim) drawAnim(R, a, 0);
    return R;
  }

  function drawAnim(R, a, t) {
    const s = R.s;
    for (let y = 0; y < 16; y++) s.data.set(a.bg.subarray(y * 16, y * 16 + 16), (a.py + y) * R.W + a.px);
    if (a.t === 'flower') s.blit(T.flowerSprite(a.c, (Math.floor(t / 24) + a.ph) % 2), a.px, a.py);
    else if (a.t === 'grass') {
      const f = a.rustle > 0 ? 1 : (Math.floor(t / 40 + a.px * 0.013 + a.py * 0.007) % 5 === 0 ? 1 : 0);
      s.blit(T.tallGrassSprite(a.v, f), a.px, a.py, { sh: 16 });
    }
  }

  // Animate visible region; (vx,vy) = top-left of view in surface pixels
  function animate(R, t, vx, vy, vw, vh) {
    if (R.interior) { G.interior.animate(R, t, vx, vy); return; }
    // water every 4 frames
    if (t % 4 === 0) {
      const x0 = Math.max(0, vx), y0 = Math.max(0, vy), x1 = Math.min(R.W, vx + vw), y1 = Math.min(R.H, vy + vh);
      const d = R.s.data, m = R.wmask, wd = R.wdist, W = R.W;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = y * W + x; if (!m[i]) continue;
        d[i] = T.waterColor(R.wx0 + x, R.wy0 + y, wd[i], t);
      }
    }
    for (const a of R.anim) {
      if (a.px + 16 < vx || a.py + 16 < vy || a.px > vx + vw || a.py > vy + vh) continue;
      if (a.t === 'flower' && t % 24 === 0) drawAnim(R, a, t);
      if (a.t === 'grass') {
        if (a.rustle > 0) { a.rustle--; if (a.rustle === 0 || a.rustle === 11) drawAnim(R, a, t); }
        else if (t % 40 === 0) drawAnim(R, a, t);
      }
    }
  }
  function rustle(R, cx, cy) {
    const a = R.gcell[cx + ',' + cy]; if (!a) return;
    a.rustle = 12; drawAnim(R, a, 0);
  }

  // Copy an opaque surface region to the screen quickly
  function blitOpaque(dst, src, dx, dy) {
    const x0 = Math.max(0, dx), y0 = Math.max(0, dy), x1 = Math.min(dst.w, dx + src.w), y1 = Math.min(dst.h, dy + src.h);
    if (x1 <= x0) return;
    for (let y = y0; y < y1; y++) {
      const so = (y - dy) * src.w + (x0 - dx);
      dst.data.set(src.data.subarray(so, so + (x1 - x0)), y * dst.w + x0);
    }
  }

  // incremental background build with a per-frame time budget
  function* buildAsync(map, budgetMs) {
    if (cache[map.name]) return cache[map.name];
    const it = buildGen(map); let r;
    for (;;) { const t0 = performance.now(); do { r = it.next(); } while (!r.done && performance.now() - t0 < (budgetMs || 4)); if (r.done) break; yield; }
    cache[map.name] = r.value; return r.value;
  }
  function get(map) {
    if (!cache[map.name]) cache[map.name] = build(map);
    return cache[map.name];
  }
  function evict(keep) { for (const k in cache) if (!keep.has(k)) delete cache[k]; }

  // animated brazier flames, drawn after night grading so they glow
  function drawFires(s, R, ox, oy, t) {
    if (!R || !R.fires) return;
    for (const f of R.fires) {
      const x = f.x + ox, y = f.y + oy;
      if (x > -8 && y > -2 && x < 328 && y < 200) T.drawFlame(s, x, y, t, f.seed);
    }
  }
  // Edges between two walkable cells. Where the game won't let you step across (tile-pair collision: cave
  // platforms, plateau rims) draw a hard lip, so nothing blocks you that you can't see; where a height change
  // can be walked, only a soft slope.
  const HIGH = new Set(['cave_high', 'cliff_top', 'cave_ledge']);
  function elevationEdges(s, map, ox, oy) {
    const { hex, mix } = G.gfx, dark = hex('#1a1410'), light = hex('#fff4e0');
    const tint = (x, y, c, a) => { if (x >= 0 && y >= 0 && x < s.w && y < s.h) { const i = y * s.w + x; s.data[i] = mix(s.data[i], c, a); } };
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      if (!map.passable(x, y)) continue;
      const hA = HIGH.has(map.label(x, y));
      if (map.inside(x + 1, y) && map.passable(x + 1, y)) { // right neighbour
        const hB = HIGH.has(map.label(x + 1, y)), blocked = map.pairBlocked(x, y, x + 1, y);
        if (blocked || hA !== hB) {
          const ex = ox + (x + 1) * 16, hiLeft = hA && !hB;
          for (let k = 0; k < 16; k++) {
            const py = oy + y * 16 + k;
            if (blocked) { tint(hiLeft ? ex - 1 : ex, py, light, 0.45); tint(hiLeft ? ex - 2 : ex + 1, py, light, 0.15); tint(hiLeft ? ex : ex - 1, py, dark, 0.55); tint(hiLeft ? ex + 1 : ex - 2, py, dark, 0.25); }
            else if (k % 2) tint(hiLeft ? ex : ex - 1, py, dark, 0.2);
          }
        }
      }
      if (map.inside(x, y + 1) && map.passable(x, y + 1)) { // neighbour below
        const hB = HIGH.has(map.label(x, y + 1)), blocked = map.pairBlocked(x, y, x, y + 1);
        if (blocked || hA !== hB) {
          const ey = oy + (y + 1) * 16;
          for (let k = 0; k < 16; k++) {
            const px = ox + x * 16 + k;
            if (blocked && hA && !hB) { tint(px, ey - 4, light, 0.4); tint(px, ey - 3, dark, 0.35); tint(px, ey - 2, dark, 0.5); tint(px, ey - 1, dark, 0.65); tint(px, ey, dark, 0.3); } // front face
            else if (blocked) { tint(px, ey, light, 0.6); tint(px, ey + 1, light, 0.25); tint(px, ey - 1, dark, 0.7); tint(px, ey - 2, dark, 0.35); tint(px, ey - 3, dark, 0.12); } // back rim
            else if ((k + y) % 2 === 0) tint(px, hA ? ey - 1 : ey, dark, 0.18); // walkable slope
          }
        }
      }
    }
  }
  G.mapRender = { elevationEdges, build, buildGen, buildAsync, get, animate, rustle, blitOpaque, evict, drawFires, MX, MY, cache };
})(window.G);
