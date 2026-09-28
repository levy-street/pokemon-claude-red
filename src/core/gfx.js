// Raw pixel graphics core. Every visual in the game is produced by writing
// packed 32-bit pixels (0xAABBGGRR, little-endian RGBA) into Surfaces.
(function (G) {
  'use strict';
  const W = 320, H = 180;

  function rgb(r, g, b, a) {
    if (a === undefined) a = 255;
    return ((a << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0;
  }
  function hex(s) {
    if (typeof s === 'number') return s;
    s = s.replace('#', '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    const n = parseInt(s, 16);
    return rgb((n >> 16) & 255, (n >> 8) & 255, n & 255);
  }
  const cr = c => c & 255, cg = c => (c >>> 8) & 255, cb = c => (c >>> 16) & 255, ca = c => c >>> 24;
  function mix(a, b, t) {
    if (t <= 0) return a; if (t >= 1) return b;
    return rgb(cr(a) + (cr(b) - cr(a)) * t, cg(a) + (cg(b) - cg(a)) * t, cb(a) + (cb(b) - cb(a)) * t, ca(a));
  }
  function mul(a, m) { // multiply by color m (shadow tint)
    return rgb(cr(a) * cr(m) / 255, cg(a) * cg(m) / 255, cb(a) * cb(m) / 255, ca(a));
  }
  function scale(a, f) {
    return rgb(Math.min(255, cr(a) * f), Math.min(255, cg(a) * f), Math.min(255, cb(a) * f), ca(a));
  }
  function add(a, b, t) {
    return rgb(Math.min(255, cr(a) + cr(b) * t), Math.min(255, cg(a) + cg(b) * t), Math.min(255, cb(a) + cb(b) * t), ca(a));
  }
  function screenBlend(a, b, t) {
    const s = (x, y) => 255 - (255 - x) * (255 - y) / 255;
    return mix(a, rgb(s(cr(a), cr(b)), s(cg(a), cg(b)), s(cb(a), cb(b))), t);
  }
  function lum(c) { return (cr(c) * 0.299 + cg(c) * 0.587 + cb(c) * 0.114) / 255; }
  function hsl(h, s, l) { // h in degrees
    h = ((h % 360) + 360) % 360 / 360;
    const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
    if (s === 0) { const v = l * 255; return rgb(v, v, v); }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return rgb(f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255);
  }
  function toHsl(c) {
    const r = cr(c) / 255, g = cg(c) / 255, b = cb(c) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
    if (mx !== mn) {
      const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0); else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }
  // Hue-shifted shading: darker shades drift toward blue/purple, lighter toward warm yellow.
  function shade(c, amt) {
    const [h, s, l] = toHsl(c);
    if (amt < 0) {
      const target = 250; // cool shadow hue
      let dh = ((target - h + 540) % 360) - 180;
      return hsl(h + dh * Math.min(1, -amt) * 0.35, Math.min(1, s * (1 - amt * 0.15)), Math.max(0, l + amt * 0.5));
    } else {
      const target = 55;
      let dh = ((target - h + 540) % 360) - 180;
      return hsl(h + dh * Math.min(1, amt) * 0.3, Math.max(0, s * (1 - amt * 0.1)), Math.min(1, l + amt * 0.5));
    }
  }
  function ramp(c, n, lo, hi) { // build a shading ramp around a base color
    const out = [];
    for (let i = 0; i < n; i++) out.push(shade(c, lo + (hi - lo) * i / (n - 1)));
    return out;
  }

  // Ordered-dither threshold matrix (Bayer 4x4) normalized to (0,1)
  const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
  const bayer = (x, y) => BAYER4[(y & 3) * 4 + (x & 3)];
  const BAYER8 = (() => {
    const m = [[0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26], [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22], [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25], [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21]];
    const o = new Float32Array(64); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) o[y * 8 + x] = (m[y][x] + 0.5) / 64; return o;
  })();
  const bayer8 = (x, y) => BAYER8[(y & 7) * 8 + (x & 7)];

  // Deterministic hashing for procedural variation
  function hash2(x, y, s) {
    let h = (x | 0) * 374761393 + (y | 0) * 668265263 + ((s | 0) * 2147483647 | 0);
    h = (h ^ (h >>> 13)) * 1274126177; h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, y, s) { // smooth value noise
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, s, oct) {
    let t = 0, amp = 0.5, f = 1; oct = oct || 3;
    for (let i = 0; i < oct; i++) { t += vnoise(x * f, y * f, s + i * 17) * amp; f *= 2; amp *= 0.5; }
    return t / (1 - Math.pow(0.5, oct));
  }

  class Surface {
    constructor(w, h) { this.w = w | 0; this.h = h | 0; this.data = new Uint32Array(this.w * this.h); }
    clear(c) { this.data.fill(c || 0); return this; }
    clone() { const s = new Surface(this.w, this.h); s.data.set(this.data); return s; }
    pset(x, y, c) { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.data[y * this.w + x] = c; }
    pget(x, y) { x |= 0; y |= 0; return (x >= 0 && y >= 0 && x < this.w && y < this.h) ? this.data[y * this.w + x] : 0; }
    // blend c over pixel with opacity t
    pblend(x, y, c, t) {
      x |= 0; y |= 0; if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
      const i = y * this.w + x, d = this.data[i];
      if (ca(d) === 0) { if (t >= 0.5) this.data[i] = c; return; }
      this.data[i] = mix(d, c, t);
    }
    pmul(x, y, m) {
      x |= 0; y |= 0; if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
      const i = y * this.w + x; this.data[i] = mul(this.data[i], m);
    }
    rect(x, y, w, h, c) {
      x |= 0; y |= 0; w |= 0; h |= 0;
      let x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(this.w, x + w), y1 = Math.min(this.h, y + h);
      // nothing on screen: stop here. TypedArray.fill counts a negative end from the END of the buffer, so a rect off
      // the left edge on row 0 used to flood the whole screen (the Social Zone's neon signs as the camera scrolled)
      if (x1 <= x0 || y1 <= y0) return;
      for (let yy = y0; yy < y1; yy++) this.data.fill(c, yy * this.w + x0, yy * this.w + x1);
    }
    rectBlend(x, y, w, h, c, t) {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.pblend(xx, yy, c, t);
    }
    rectMul(x, y, w, h, m) {
      x |= 0; y |= 0;
      let x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(this.w, x + w), y1 = Math.min(this.h, y + h);
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = yy * this.w + xx; this.data[i] = mul(this.data[i], m); }
    }
    // dithered fill: fills pixels where bayer < t
    rectDither(x, y, w, h, c, t) {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (bayer(xx, yy) < t) this.pset(xx, yy, c);
    }
    hline(x0, x1, y, c) { if (x1 < x0) { const t = x0; x0 = x1; x1 = t; } this.rect(x0, y, x1 - x0 + 1, 1, c); }
    vline(x, y0, y1, c) { if (y1 < y0) { const t = y0; y0 = y1; y1 = t; } this.rect(x, y0, 1, y1 - y0 + 1, c); }
    line(x0, y0, x1, y1, c) {
      x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
      const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        this.pset(x0, y0, c);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    }
    lineBlend(x0, y0, x1, y1, c, t) {
      x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
      const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        this.pblend(x0, y0, c, t);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    }
    // filled ellipse centered at (cx,cy) with radii rx, ry
    ellipse(cx, cy, rx, ry, c) {
      if (rx <= 0 || ry <= 0) return;
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
        const dy = (y + 0.5 - cy) / ry; if (Math.abs(dy) > 1) continue;
        const hw = rx * Math.sqrt(1 - dy * dy);
        const x0 = Math.round(cx - hw), x1 = Math.round(cx + hw);
        if (x1 > x0) this.rect(x0, y, x1 - x0, 1, c);
      }
    }
    ellipseBlend(cx, cy, rx, ry, c, t) {
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
        const dy = (y + 0.5 - cy) / ry; if (Math.abs(dy) > 1) continue;
        const hw = rx * Math.sqrt(1 - dy * dy);
        for (let x = Math.round(cx - hw); x < Math.round(cx + hw); x++) this.pblend(x, y, c, t);
      }
    }
    ellipseMul(cx, cy, rx, ry, m) {
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
        const dy = (y + 0.5 - cy) / ry; if (Math.abs(dy) > 1) continue;
        const hw = rx * Math.sqrt(1 - dy * dy);
        for (let x = Math.round(cx - hw); x < Math.round(cx + hw); x++) this.pmul(x, y, m);
      }
    }
    // ring (outline circle) using midpoint
    circle(cx, cy, r, c) {
      cx |= 0; cy |= 0; r |= 0;
      let x = r, y = 0, err = 1 - r;
      while (x >= y) {
        this.pset(cx + x, cy + y, c); this.pset(cx + y, cy + x, c); this.pset(cx - y, cy + x, c); this.pset(cx - x, cy + y, c);
        this.pset(cx - x, cy - y, c); this.pset(cx - y, cy - x, c); this.pset(cx + y, cy - x, c); this.pset(cx + x, cy - y, c);
        y++; if (err < 0) err += 2 * y + 1; else { x--; err += 2 * (y - x) + 1; }
      }
    }
    disc(cx, cy, r, c) { this.ellipse(cx, cy, r, r, c); }
    // filled polygon (even-odd), pts = [x0,y0,x1,y1,...]
    poly(pts, c) {
      let miny = Infinity, maxy = -Infinity; const n = pts.length / 2;
      for (let i = 0; i < n; i++) { miny = Math.min(miny, pts[i * 2 + 1]); maxy = Math.max(maxy, pts[i * 2 + 1]); }
      for (let y = Math.floor(miny); y <= Math.ceil(maxy); y++) {
        const sy = y + 0.5, xs = [];
        for (let i = 0; i < n; i++) {
          const x0 = pts[i * 2], y0 = pts[i * 2 + 1], x1 = pts[((i + 1) % n) * 2], y1 = pts[((i + 1) % n) * 2 + 1];
          if ((y0 <= sy && y1 > sy) || (y1 <= sy && y0 > sy)) xs.push(x0 + (sy - y0) / (y1 - y0) * (x1 - x0));
        }
        xs.sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2) { const a = Math.round(xs[k]), b = Math.round(xs[k + 1]); if (b > a) this.rect(a, y, b - a, 1, c); }
      }
    }
    // draw src onto this surface. opts: flipX, flipY, alpha(0..1), tint(color), tintAmt, sil(color), sx,sy,sw,sh
    blit(src, dx, dy, o) {
      o = o || NONE;
      const sx = o.sx | 0, sy = o.sy | 0, sw = o.sw === undefined ? src.w : o.sw, sh = o.sh === undefined ? src.h : o.sh;
      dx = Math.round(dx); dy = Math.round(dy);
      const fx = !!o.flipX, fy = !!o.flipY;
      const alpha = o.alpha === undefined ? 1 : o.alpha;
      const tint = o.tint, tintAmt = o.tintAmt || 0, sil = o.sil, mulc = o.mul;
      const x0 = Math.max(0, dx), y0 = Math.max(0, dy), x1 = Math.min(this.w, dx + sw), y1 = Math.min(this.h, dy + sh);
      const sd = src.data, dd = this.data, dw = this.w;
      const simple = alpha >= 1 && tint === undefined && sil === undefined && mulc === undefined;
      const ditherAlpha = !!o.dither;
      for (let y = y0; y < y1; y++) {
        const syy = fy ? sy + sh - 1 - (y - dy) : sy + (y - dy);
        const srow = syy * src.w;
        for (let x = x0; x < x1; x++) {
          const sxx = fx ? sx + sw - 1 - (x - dx) : sx + (x - dx);
          let c = sd[srow + sxx];
          if ((c >>> 24) === 0) continue;
          if (simple) { dd[y * dw + x] = c; continue; }
          if (sil !== undefined) c = sil;
          if (tint !== undefined) c = mix(c, tint, tintAmt);
          if (mulc !== undefined) c = mul(c, mulc);
          if (alpha < 1) {
            if (ditherAlpha) { if (bayer(x, y) < alpha) dd[y * dw + x] = c; }
            else dd[y * dw + x] = mix(dd[y * dw + x], c, alpha);
          } else dd[y * dw + x] = c;
        }
      }
    }
    // nearest-neighbour scaled blit; (dx,dy) is top-left of destination rect of size dw x dh
    blitScaled(src, dx, dy, dwid, dhei, o) {
      o = o || NONE;
      dwid = Math.round(dwid); dhei = Math.round(dhei); dx = Math.round(dx); dy = Math.round(dy);
      if (dwid <= 0 || dhei <= 0) return;
      const fx = !!o.flipX, alpha = o.alpha === undefined ? 1 : o.alpha, tint = o.tint, tintAmt = o.tintAmt || 0, sil = o.sil;
      for (let y = Math.max(0, dy); y < Math.min(this.h, dy + dhei); y++) {
        const sy = Math.floor((y - dy) * src.h / dhei);
        for (let x = Math.max(0, dx); x < Math.min(this.w, dx + dwid); x++) {
          let sxx = Math.floor((x - dx) * src.w / dwid); if (fx) sxx = src.w - 1 - sxx;
          let c = src.data[sy * src.w + sxx];
          if ((c >>> 24) === 0) continue;
          if (sil !== undefined) c = sil;
          if (tint !== undefined) c = mix(c, tint, tintAmt);
          const i = y * this.w + x;
          this.data[i] = alpha < 1 ? mix(this.data[i], c, alpha) : c;
        }
      }
    }
    // copy a rectangle of raw pixels including transparent ones
    copyFrom(src, sx, sy, sw, sh, dx, dy) {
      for (let y = 0; y < sh; y++) {
        const ty = dy + y, fy = sy + y; if (ty < 0 || ty >= this.h || fy < 0 || fy >= src.h) continue;
        for (let x = 0; x < sw; x++) {
          const tx = dx + x, fx = sx + x; if (tx < 0 || tx >= this.w || fx < 0 || fx >= src.w) continue;
          this.data[ty * this.w + tx] = src.data[fy * src.w + fx];
        }
      }
    }
    // add a 1px outline of color c around opaque pixels (on transparent neighbors)
    outline(c, diag) {
      const w = this.w, h = this.h, d = this.data, src = d.slice();
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if ((src[y * w + x] >>> 24) !== 0) continue;
        let hit = false;
        for (let k = 0; k < (diag ? 8 : 4) && !hit; k++) {
          const nx = x + NB8[k * 2], ny = y + NB8[k * 2 + 1];
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && (src[ny * w + nx] >>> 24) !== 0) hit = true;
        }
        if (hit) d[y * w + x] = c;
      }
      return this;
    }
    flipped() { const s = new Surface(this.w, this.h); for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) s.data[y * this.w + x] = this.data[y * this.w + this.w - 1 - x]; return s; }
    sub(x, y, w, h) { const s = new Surface(w, h); s.copyFrom(this, x, y, w, h, 0, 0); return s; }
    // map every opaque pixel through fn(c,x,y)
    map(fn) { const d = this.data; for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) { const i = y * this.w + x; if ((d[i] >>> 24) !== 0) d[i] = fn(d[i], x, y); } return this; }
  }
  const NB8 = [1, 0, -1, 0, 0, 1, 0, -1, 1, 1, -1, 1, 1, -1, -1, -1];
  const NONE = {};

  // Build a sprite from ASCII rows and a palette map { char: color }; '.' or ' ' = transparent
  function fromRows(rows, pal) {
    const h = rows.length, w = Math.max.apply(null, rows.map(r => r.length));
    const s = new Surface(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch === '.' || ch === ' ') continue;
      const c = pal[ch]; if (c === undefined) continue;
      s.data[y * w + x] = typeof c === 'string' ? hex(c) : c;
    }
    return s;
  }

  const screenSurf = new Surface(W, H);

  G.gfx = {
    W, H, rgb, hex, mix, mul, scale, add, screenBlend, lum, hsl, toHsl, shade, ramp, cr, cg, cb, ca,
    bayer, bayer8, hash2, vnoise, fbm, Surface, fromRows, screen: screenSurf,
    TRANSPARENT: 0,
  };
})(window.G = window.G || {});
