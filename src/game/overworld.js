// Overworld: player/NPC movement, map connections, warps, interaction and rendering.
(function (G) {
  'use strict';
  const { Surface, rgb, hash2, mix, mul } = G.gfx;
  const MR = G.mapRender;
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  // data/tilesets/warp_carpet_tile_ids.asm and the maps/tilesets ExtraWarpCheck tests them on
  const FACING_WARP_TILES = { down: [0x01, 0x12, 0x17, 0x3D, 0x04, 0x18, 0x33], up: [0x01, 0x5C], left: [0x1A, 0x4B], right: [0x0F, 0x4E] };
  const FACING_WARP_TILESETS = new Set(['Overworld', 'Ship', 'ShipPort', 'Plateau']);
  const FACING_WARP_MAPS = new Set(['RocketHideoutB1F', 'RocketHideoutB2F', 'RocketHideoutB4F', 'RockTunnel1F']);
  const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const SHADOW = rgb(120, 125, 170);

  // ---------------- game state ----------------
  G.state = G.state || null;
  function newState() {
    return {
      map: 'RedsHouse2F', x: 3, y: 6, dir: 'up', lastOutdoor: 'PalletTown', lastOutdoorPos: null,
      flags: {}, toggles: {}, name: 'RED', rival: 'BLUE', money: 3000, party: [], boxes: [[]], box: 0,
      bag: [], pc: [{ id: 'POTION', n: 1 }], dex: { seen: {}, caught: {} }, badges: [], steps: 0, playTime: 0,
      options: { textSpeed: 2, battleAnim: true, battleStyle: 'shift' }, coins: 0, lastHeal: null,
    };
  }
  G.newState = newState;
  G.flag = f => !!(G.state && G.state.flags[f]);
  G.setFlag = (f, v) => { G.state.flags[f] = v === undefined ? true : v; };
  G.clearFlag = f => { delete G.state.flags[f]; };

  // ---------------- actors ----------------
  class Actor {
    constructor(o) {
      Object.assign(this, { x: 0, y: 0, dir: 'down', moving: false, prog: 0, speed: 1, step: 0, hidden: false, jump: 0, walkAnim: 0, emote: null, emoteT: 0 }, o);
      this.setSprite(this.sprite || 'red');
    }
    setSprite(name) {
      this.sprite = name;
      const def = G.CAST[name] || G.CAST.youngster;
      this.def = def;
      this.frames = def.creature || def.object ? G.objSprites(name, this.obj) : G.chars.makeCharacter(def);
    }
    get px() { return this.x * 16 + (this.moving ? DIRS[this.mdir][0] * this.prog : 0); }
    get py() { return this.y * 16 + (this.moving ? DIRS[this.mdir][1] * this.prog : 0); }
    startMove(dir, speed, jump) {
      this.dir = dir; this.mdir = dir; this.moving = true; this.prog = 0; this.speed = speed || 1;
      this.jump = jump || 0; this.step++;
    }
    update() {
      if (this.emote) { this.emoteT++; }
      if (!this.moving) return false;
      this.prog += this.speed;
      const dist = this.jump ? 32 : 16;
      if (this.prog >= dist) {
        this.x += DIRS[this.mdir][0] * (dist / 16); this.y += DIRS[this.mdir][1] * (dist / 16);
        this.moving = false; this.prog = 0; this.jump = 0;
        return true; // arrived
      }
      return false;
    }
    frame() {
      const f = this.frames[this.dir] || this.frames.down;
      if (this.moving && !this.jump) {
        // stepping pose through the middle of the stride, feet together at either end
        const dist = 16, mid = this.speed > 1 ? this.prog >= 2 && this.prog < dist - 2 : this.prog >= 3 && this.prog < dist - 3;
        return f[mid ? (this.step % 2 ? 1 : 2) : 0];
      }
      if (this.walkInPlace) return f[(Math.floor(G.frame / 8) % 2) ? 1 : 2];
      return f[0];
    }
  }
  G.Actor = Actor;

  // ---------------- overworld scene ----------------
  class Overworld {
    constructor() {
      this.opaque = true; this.tickBehind = true; this.t = 0; this.actors = []; this.player = null; this.map = null;
      this.locks = 0; this.lockIdle = 0; this.banner = null; this.fx = []; this.camOverride = null;
      this.shake = 0;
    }
    load(name, x, y, dir) {
      const S = G.state;
      this.map = G.maps.getMap(name);
      S.map = name; S.x = x; S.y = y; S.dir = dir || S.dir;
      if (this.map.outdoor) { S.lastOutdoor = name; S.visited = S.visited || {}; if (G.FLY_SPOTS && G.FLY_SPOTS[name]) S.visited[name] = true; }
      if (this.prevMapName !== name) { const pm = this.prevMapName && G.maps.cache[this.prevMapName]; if (pm && pm.overrides && (Object.keys(pm.overrides).length || (pm.passOverride && Object.keys(pm.passOverride).length))) { pm.overrides = {}; pm.passOverride = {}; delete MR.cache[pm.name]; } this.strength = false; this.flashed = false; }
      this.prevMapName = name;
      this.autoPath = null;
      this.arrived = null; // set by doWarp: the way we came through a door or stairs, until the first step
      if (!this.player) this.player = new Actor({ sprite: 'red', isPlayer: true });
      Object.assign(this.player, { x, y, dir: dir || S.dir, moving: false, prog: 0, jump: 0 });
      this.spawnActors();
      // keep render caches for this map and its neighbours only
      const keep = new Set([name]); for (const d in this.map.conns) keep.add(this.map.conns[d].map);
      MR.evict(keep);
      this.render = MR.get(this.map);
      this.neighbors = [];
      for (const d in this.map.conns) {
        const c = this.map.conns[d];
        this.neighbors.push({ c, map: G.maps.getMap(c.map), R: null });
      }
      // entering somewhere the bike isn't allowed puts the player back on foot, as in Red
      if (this.biking && G.bikeAllowed && !G.bikeAllowed(this.map)) this.biking = false;
      if (G.music && G.mapMusic) G.music(G.mapMusic(this.map));
      if (G.scripts && G.scripts.onEnter) G.scripts.onEnter(this.map);
      this.startQueued = false;
      if (G.glitch) G.glitch.onMapLoad(this.map); // wild data RAM + a trainer script left waiting (src/game/glitches.js)
    }
    spawnActors() {
      const S = G.state;
      this.actors = [];
      this.map.objs.forEach((o, i) => {
        const key = this.map.name + ':' + (o.id || i);
        let shown = o.shown === undefined ? true : o.shown;
        if (key in S.toggles) shown = S.toggles[key];
        if (o.item && S.flags['GOT_' + key]) shown = false;
        if (!shown) return;
        let dir = 'down';
        if (['UP', 'DOWN', 'LEFT', 'RIGHT'].includes(o.dir)) dir = o.dir.toLowerCase();
        const a = new Actor({ x: o.x, y: o.y, dir, sprite: o.sprite, obj: o, key, home: [o.x, o.y], idleT: Math.floor(hash2(o.x, o.y, i) * 120) });
        if (o.trainer) a.trainer = o.trainer;
        this.actors.push(a);
      });
    }
    actorAt(x, y, except) {
      for (const a of this.actors) {
        if (a === except || a.hidden || a.ghost || a.follower) continue; // other players and the walking partner never block the way
        if (a.x === x && a.y === y) return a;
        if (a.moving) { const tx = a.x + DIRS[a.mdir][0], ty = a.y + DIRS[a.mdir][1]; if (tx === x && ty === y) return a; }
      }
      if (this.player && this.player !== except && this.player.x === x && this.player.y === y) return this.player;
      return null;
    }
    ghostAt(x, y) { return this.actors.find(a => a.ghost && !a.hidden && a.x === x && a.y === y) || null; }
    actorByKey(id) { return this.actors.find(a => a.obj && (a.obj.id === id)); }
    // can `who` step from (x,y) in dir? returns {ok, jump, water, conn}
    canMove(who, dir) {
      const [dx, dy] = DIRS[dir];
      const x = who.x, y = who.y, nx = x + dx, ny = y + dy;
      const m = this.map;
      if (!m.inside(nx, ny)) {
        if (!who.isPlayer) return { ok: false };
        const side = ny < 0 ? 'north' : ny >= m.h ? 'south' : nx < 0 ? 'west' : 'east';
        const c = m.conns[side];
        if (!c) return { ok: false };
        const tm = G.maps.getMap(c.map), tx = nx - c.ox, ty = ny - c.oy;
        if (!tm.inside(tx, ty)) return { ok: false };
        const pass = this.surfing ? tm.isWater(tx, ty) || tm.passable(tx, ty) : tm.passable(tx, ty);
        return { ok: pass, conn: c };
      }
      if (this.actorAt(nx, ny, who)) return { ok: false };
      if (who.isPlayer) {
        // ledges
        const cur = m.tile(x, y), nxt = m.tile(nx, ny);
        for (const [ldir, stand, ledge] of G.MAPDATA.ledges) {
          if (m.tsName !== 'Overworld') break;
          if (ldir === dir && stand === cur && ledge === nxt) {
            const lx = nx + dx, ly = ny + dy;
            if (m.passable(lx, ly) && !this.actorAt(lx, ly)) return { ok: true, jump: true };
            return { ok: false };
          }
        }
        if (this.surfing) {
          if (m.isWater(nx, ny)) return { ok: true };
          if (m.passable(nx, ny)) return { ok: true, land: true };
          return { ok: false };
        }
        if (this.pairBlocked(x, y, nx, ny)) return { ok: false };
      } else {
        // NPCs keep near home and avoid warps
        if (who.home && (Math.abs(nx - who.home[0]) > 3 || Math.abs(ny - who.home[1]) > 3)) return { ok: false };
        if (m.warpAt(nx, ny) >= 0) return { ok: false };
        if (m.isGrass(nx, ny) && !who.grassOk) { /* NPCs may walk in grass */ }
      }
      if (!m.passable(nx, ny)) return { ok: false };
      return { ok: true };
    }
    // Does pushing `d` while standing on warp cell (x, y) take that warp? Red's ExtraWarpCheck: most maps warp when
    // facing off the map edge; outdoor, ship, dock and plateau maps (and a few dungeons) warp when the tile ahead
    // is a door tile for that facing, e.g. a gate's side entrance. Our interiors also leave by a doormat pushed down.
    pushWarp(x, y, d) {
      const m = this.map;
      if (m.warpAt(x, y) < 0) return false;
      const [dx, dy] = DIRS[d], nx = x + dx, ny = y + dy;
      if (!m.inside(nx, ny)) return true;
      if ((FACING_WARP_MAPS.has(m.name) || FACING_WARP_TILESETS.has(m.tsName)) && FACING_WARP_TILES[d].includes(m.tile(nx, ny))) return true;
      return d === 'down' && !m.isWarpTile(x, y) && !m.passable(x, y + 1);
    }
    pairBlocked(x, y, nx, ny) { return this.map.pairBlocked(x, y, nx, ny); }

    // ---- per-frame ----
    update(focused) {
      this.t++;
      if (!focused) return; // behind a text box/menu: only the animation clock advances
      const S = G.state;
      if (S) S.playTime++;
      for (const a of this.actors) {
        if (a.ghost || a.follower) continue; // other players in the live lounge walk on the network's clock (src/game/lounge.js), the walking partner on the player's (src/game/follower.js)
        const arrived = a.update();
        if (!a.moving && a.obj && !this.locks && focused && !a.scripted) this.npcIdle(a);
      }
      const p = this.player;
      const wasJump = p.jump;
      const arrived = p.update();
      if (arrived && wasJump) this.stepFx('land', p.x, p.y);
      if (arrived) this.onPlayerStep();
      // safety net: every lock is released by a running script or an active spinner ride; a lock with neither
      // (a script that crashed mid-way, a counting bug) would freeze the player for good, so let it go
      if (this.locks > 0 && !G.scriptRunning && !p.moving && !p.spinning) {
        if (++this.lockIdle > 45) { console.warn('released a stuck movement lock', this.locks); this.locks = 0; this.spinLock = false; this.lockIdle = 0; }
      } else this.lockIdle = 0;
      if (!focused || this.locks > 0 || G.scriptRunning) { this.startQueued = false; return; } // a warp or cutscene took the step
      if (p.moving) { if (G.input.pressed.start) this.startQueued = true; return; }
      const I = G.input, Pt = G.pointer;
      const noStart = G.glitch && G.glitch.blocked(); // spotted by a trainer you escaped from: START and talking are off
      // mouse / touch: click a tile to walk there (or up to a person/sign/object and interact); right click = START
      if (Pt && Pt.rpressed) { Pt.consume(); this.autoPath = null; if (!noStart) { G.openStartMenu && G.openStartMenu(); return; } }
      if (Pt && Pt.pressed && Pt.inside) { Pt.consume(); const [cx, cy] = this.camera(); this.planWalk(Math.floor((Pt.x + cx) / 16), Math.floor((Pt.y + cy) / 16)); }
      if (I.pressed.start && !noStart) { G.openStartMenu && G.openStartMenu(); return; }
      if (I.pressed.select && G.onSelect) { G.onSelect(); return; }
      if (I.pressed.a) { this.interact(); return; }
      let d = I.dir(), auto = false;
      if (d || I.pressed.b) this.autoPath = null;
      else if (typeof this.autoPath === 'string') { // '' = already there (interact / step out)
        if (this.autoIdx >= this.autoPath.length) {
          const t = this.autoTarget; this.autoPath = null;
          if (t === 'exit') { // arrived on an exit mat: step out through it
            for (const od of ['down', 'up', 'left', 'right']) if (this.pushWarp(p.x, p.y, od)) { d = od; auto = true; break; }
          } else if (t) { p.dir = t; this.interact(); return; }
          if (!d) return;
        } else { d = { U: 'up', D: 'down', L: 'left', R: 'right' }[this.autoPath[this.autoIdx]]; auto = true; }
      }
      if (d) {
        // standing on a warp cell and pushing toward its exit (map edge, doormat, gate side door). Right after
        // arriving, carrying on the way you came never bounces you back (off the S.S. Anne gangway, the ROCKET
        // HIDEOUT stairs, out of its elevator), and other ways only count when blocked (a doormat, a map edge)
        const bounce = this.arrived && (d === this.arrived || this.canMove(p, d).ok);
        if (!bounce && this.pushWarp(p.x, p.y, d)) { p.dir = d; this.doWarp(this.map.warpAt(p.x, p.y)); return; }
        if (p.dir !== d && !this.wasMoving && !auto) { p.dir = d; this.turnDelay = 6; return; }
        if (this.turnDelay > 0) { this.turnDelay--; if (this.turnDelay > 0) return; }
        if (G.tryPushBoulder && G.tryPushBoulder(this, d)) { this.wasMoving = false; return; }
        const r = this.canMove(p, d);
        if (auto && !r.ok) { this.autoPath = null; p.dir = d; this.wasMoving = false; return; } // something stepped into the way
        if (r.ok) {
          if (auto) this.autoIdx++;
          const speed = this.biking ? 3 : (I.down.b && !this.surfing ? 2 : 1);
          p.startMove(d, r.jump ? 2 : speed, r.jump);
          if (r.jump && G.sfx) G.sfx('jump');
          this.pendingConn = r.conn || null;
          this.pendingLand = r.land || false;
          this.wasMoving = true;
          // rustle grass when entering
          const tx = p.x + DIRS[d][0], ty = p.y + DIRS[d][1];
          if (this.map.isGrass(tx, ty)) { MR.rustle(this.render, tx, ty); this.stepFx('grass', tx, ty); }
          else if (speed >= 2 && this.map.outdoor && !this.surfing) this.stepFx('dust', p.x, p.y);
        } else {
          p.walkInPlace = false;
          if (this.t % 16 === 0 && G.sfx) G.sfx('bump');
          this.wasMoving = false;
        }
      } else { this.wasMoving = false; this.turnDelay = 0; }
    }
    // click-to-walk: path to a walkable cell, or next to something to interact with (across counters too)
    planWalk(tx, ty) {
      const m = this.map, p = this.player, S = G.S;
      this.autoPath = null; this.autoTarget = null;
      const go = (path, target, dest) => { this.autoPath = path; this.autoIdx = 0; this.autoTarget = target; this.autoDest = dest; };
      if (!S || !S.findPath) return;
      if (tx === p.x && ty === p.y) { // clicking where you stand: step out if it's an exit mat
        if (['down', 'up', 'left', 'right'].some(d => this.pushWarp(tx, ty, d))) go('', 'exit', [tx, ty]);
        return;
      }
      if (!m.inside(tx, ty)) { // beyond the edge: walk to the nearest edge cell and on into the next map
        const ex = Math.max(0, Math.min(m.w - 1, tx)), ey = Math.max(0, Math.min(m.h - 1, ty));
        const out = ty < 0 ? 'U' : ty >= m.h ? 'D' : tx < 0 ? 'L' : 'R';
        const path = ex === p.x && ey === p.y ? '' : S.findPath(p, ex, ey);
        if (path !== null) go(path + out, null, [ex, ey]);
        return;
      }
      const actor = this.actorAt(tx, ty, p) || this.ghostAt(tx, ty) || (this.followerAt && this.followerAt(tx, ty));
      if (!actor && m.passable(tx, ty)) {
        const path = S.findPath(p, tx, ty);
        const edgeWarp = m.warpAt(tx, ty) >= 0 && (!m.isWarpTile(tx, ty) || ['down', 'up', 'left', 'right'].some(d => this.pushWarp(tx, ty, d)));
        if (path !== null) go(path, edgeWarp ? 'exit' : null, [tx, ty]);
        return;
      }
      // a gate's side door: walk onto the warp cell beside it and push through
      if (!actor) for (const [dx, dy, dir] of [[0, 1, 'up'], [0, -1, 'down'], [1, 0, 'left'], [-1, 0, 'right']]) {
        const sx = tx + dx, sy = ty + dy;
        if (!m.passable(sx, sy) || !this.pushWarp(sx, sy, dir)) continue;
        const path = sx === p.x && sy === p.y ? '' : S.findPath(p, sx, sy);
        if (path !== null) { go(path + dir[0].toUpperCase(), null, [sx, sy]); return; }
      }
      // a person, sign, counter or object: stand beside it (or across a counter) and face it
      let best = null;
      for (const [dx, dy, dir] of [[0, 1, 'up'], [0, -1, 'down'], [1, 0, 'left'], [-1, 0, 'right']]) {
        for (const k of [1, 2]) {
          const sx = tx + dx * k, sy = ty + dy * k;
          if (k === 2 && !m.ts.counters.includes(m.tile(tx + dx, ty + dy))) continue;
          if (!m.inside(sx, sy) || !m.passable(sx, sy) || (this.actorAt(sx, sy, p) && !(sx === p.x && sy === p.y))) continue;
          const path = sx === p.x && sy === p.y ? '' : S.findPath(p, sx, sy);
          if (path !== null && (!best || path.length < best.path.length)) best = { path, dir };
        }
      }
      if (best) go(best.path, best.dir, [tx, ty]);
    }
    npcIdle(a) {
      const o = a.obj;
      if (--a.idleT > 0) return;
      a.idleT = 60 + Math.floor(Math.random() * 140);
      if (o.move === 'WALK') {
        let dirs = ['up', 'down', 'left', 'right'];
        if (o.dir === 'UP_DOWN') dirs = ['up', 'down']; else if (o.dir === 'LEFT_RIGHT') dirs = ['left', 'right'];
        const d = dirs[Math.floor(Math.random() * dirs.length)];
        a.dir = d;
        if (this.canMove(a, d).ok && Math.random() < 0.7) a.startMove(d, 1);
      } else if (o.dir === 'NONE' && !a.trainer && !o.item && G.CAST[o.sprite] && !G.CAST[o.sprite].object) {
        a.dir = ['up', 'down', 'left', 'right'][Math.floor(Math.random() * 4)];
      }
    }
    onPlayerStep() {
      const p = this.player, S = G.state;
      this.arrived = false;
      S.steps++;
      if (G.stepHooks) for (const f of G.stepHooks) f(S);
      if (this.pendingConn) {
        const c = this.pendingConn; this.pendingConn = null;
        const nx = p.x - c.ox, ny = p.y - c.oy;
        const oldName = this.map.name;
        this.load(c.map, nx, ny, p.dir);
        this.showBanner();
        this.camJump = true;
      }
      if (this.pendingLand) { this.pendingLand = false; this.surfing = false; p.setSprite('red'); }
      S.x = p.x; S.y = p.y; S.dir = p.dir;
      if (G.afterStep && G.afterStep(this)) return;
      // poison hurts party Pokémon every 4 steps outside battle
      if (S.steps % 4 === 0 && S.party.some(m => m.status === 'PSN' && m.hp > 0)) {
        this.poisonFlash = 6;
        const fainted = [];
        for (const m of S.party) if (m.status === 'PSN' && m.hp > 0) { m.hp--; if (m.hp <= 0) { m.status = null; fainted.push(m); } }
        if (fainted.length) {
          G.spawnScript((function* () {
            for (const m of fainted) yield* G.say(m.name + ' fainted!');
            if (!S.party.some(m => m.hp > 0)) { yield* G.say(S.name + ' is out of usable POKéMON!\f' + S.name + ' blacked out!'); yield* G.blackout(); }
          })(), 'poison');
          return;
        }
      }
      // warps
      const wi = this.map.warpAt(p.x, p.y);
      if (wi >= 0 && (this.map.isWarpTile(p.x, p.y) || this.map.isDoorTile(p.x, p.y))) { this.doWarp(wi); return; }
      // scripted walks (a scene moving the player) never set off map triggers, trainers or wild encounters
      if (p.scripted) return;
      if (G.scripts && G.scripts.onStep && G.scripts.onStep(this.map, p.x, p.y)) return;
      const seen = this.trainerInSight(), queued = this.startQueued && !(G.glitch && G.glitch.blocked());
      this.startQueued = false;
      if (seen) {
        // START pressed mid-step beats the trainer's walk: the menu opens first (the Trainer-Fly glitch, src/game/glitches.js)
        if (queued && G.glitch) { G.spawnScript(G.glitch.spotted(seen.a, seen.dist), 'spotted'); return; }
        if (G.glitch) G.glitch.noteText(seen.a);
        if (G.startTrainerSighted) { G.spawnScript(G.startTrainerSighted(seen.a, seen.dist)); return; }
      }
      if (G.encounters && G.encounters.check(this.map, p.x, p.y, this.surfing)) return;
      if (queued && G.openStartMenu) G.openStartMenu();
    }
    trainerInSight() {
      const p = this.player;
      if (G.glitch && G.glitch.stuck(this.map.name)) return null; // its script is waiting on an escaped battle
      for (const a of this.actors) {
        if (!a.trainer || a.hidden || !a.obj.th) continue;
        if (G.flag(a.obj.th.flag)) continue;
        const [dx, dy] = DIRS[a.dir];
        const range = a.obj.th.range;
        for (let k = 1; k <= range; k++) {
          const x = a.x + dx * k, y = a.y + dy * k;
          if (x === p.x && y === p.y) return { a, dist: k - 1 };
          if (!this.map.passable(x, y) || this.actorAt(x, y, a)) break;
        }
      }
      return null;
    }
    interact() {
      const p = this.player, [dx, dy] = DIRS[p.dir];
      let fx = p.x + dx, fy = p.y + dy;
      let a = this.actorAt(fx, fy, p) || this.ghostAt(fx, fy) || (this.followerAt && this.followerAt(fx, fy));
      const m = this.map;
      // talk over counters
      if (!a && m.ts.counters.includes(m.tile(fx, fy))) { a = this.actorAt(fx + dx, fy + dy, p); }
      const noTalk = G.glitch && G.glitch.blocked();
      if (a && G.talkTo && !noTalk) { G.glitch && G.glitch.noteText(a); G.spawnScript(G.talkTo(a)); return; }
      const sign = m.signs.find(s => s.x === fx && s.y === fy);
      if (sign && G.readSign && !noTalk) { G.spawnScript(G.readSign(sign)); return; }
      const hid = m.hidden.find(h => h.x === fx && h.y === fy);
      if (hid && G.hiddenEvent) { const g = G.hiddenEvent(hid, p.dir); if (g) { G.spawnScript(g); return; } }
      if (G.fieldInteract) { const g = G.fieldInteract(fx, fy); if (g) { G.spawnScript(g); return; } }
    }
    doWarp(wi) {
      const w = this.map.warps[wi];
      let to = w.to;
      if (to === 'LAST_MAP') to = G.state.lastOutdoor;
      const dm = G.maps.getMap(to);
      const dw = dm.warps[w.warp] || dm.warps[0];
      const fromOutdoor = this.map.outdoor;
      G.spawnScript((function* (ow) {
        ow.locks++;
        if (G.sfx) G.sfx(fromOutdoor ? 'door' : 'exit');
        const enteringDoor = ow.map.isDoorTile(ow.player.x, ow.player.y) && ow.map.outdoor;
        if (enteringDoor) { const df = G.doorFx(ow.player.x, ow.player.y); ow.fx.unshift(df); for (let i = 0; i < 8; i++) yield; ow.player.hidden = true; for (let i = 0; i < 4; i++) yield; df.done = true; }
        yield* G.fadeOut(10);
        ow.player.hidden = false;
        ow.load(to, dw.x, dw.y, ow.player.dir);
        ow.arrived = ow.player.dir;
        ow.snapCamera();
        yield* G.fadeIn(10);
        if (dm.outdoor) ow.showBanner();
        // step out of doors onto the street
        if (dm.isDoorTile(dw.x, dw.y) || (dm.outdoor && !dm.passable(dw.x, dw.y + 1) === false && dm.isWarpTile(dw.x, dw.y))) {
          const df = dm.outdoor ? G.doorFx(dw.x, dw.y) : null; if (df) ow.fx.unshift(df);
          if (ow.canMove(ow.player, 'down').ok) { ow.player.dir = 'down'; ow.player.startMove('down', 1); while (ow.player.moving) yield; }
          if (df) { for (let i = 0; i < 6; i++) yield; df.done = true; }
        }
        ow.locks--;
      })(this), 'warp');
    }
    // small particle effects tied to footsteps
    stepFx(kind, cx, cy) {
      const P = G.PAL, parts = [];
      const bx = cx * 16 + 8, by = cy * 16 + 12;
      const n = kind === 'grass' ? 5 : kind === 'land' ? 8 : 3;
      for (let i = 0; i < n; i++) {
        const a = kind === 'land' ? (i / n) * Math.PI * 2 : -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
        const v = kind === 'grass' ? 0.8 + Math.random() : kind === 'land' ? 1 : 0.4;
        parts.push({ x: bx + (Math.random() - 0.5) * 8, y: by, vx: Math.cos(a) * v, vy: Math.sin(a) * v * (kind === 'land' ? 0.4 : 1) - (kind === 'grass' ? 0.6 : 0), life: kind === 'grass' ? 18 : 14 });
      }
      const col = kind === 'grass' ? [P.tallgrass[5], P.tallgrass[4], P.tallgrass[3]] : [P.path[5], P.path[4], P.path[6]];
      this.fx.push({ draw(s, cx0, cy0) {
        let alive = false;
        for (const q of parts) { if (q.life <= 0) continue; alive = true; q.x += q.vx; q.y += q.vy; if (kind === 'grass') q.vy += 0.08; else { q.vx *= 0.9; q.vy *= 0.9; } q.life--;
          const c = col[Math.min(2, Math.floor((1 - q.life / 18) * 3))];
          if (kind === 'grass') { s.pset(q.x - cx0, q.y - cy0, c); s.pset(q.x - cx0 + 1, q.y - cy0 - 1, c); }
          else s.pblend(q.x - cx0, q.y - cy0, c, Math.min(1, q.life / 8)); }
        return alive;
      } });
    }
    queueBuild(n) {
      if (n.queued) return; n.queued = true;
      G.engine.spawn((function* () { yield; n.R = yield* MR.buildAsync(n.map, 4); })(), 'build:' + n.map.name);
    }
    showBanner() {
      const name = G.mapDisplayName ? G.mapDisplayName(this.map) : this.map.name;
      if (this.banner && this.banner.text === name) { this.banner.t = Math.min(this.banner.t, 20); return; }
      this.banner = { text: name, t: 0 };
    }
    snapCamera() { this.cam = null; }

    // ---- rendering ----
    camera() {
      const p = this.player;
      let cx = p.px + 8 - 160, cy = p.py + 8 - 90 - (p.jump ? 0 : 0);
      if (this.camOverride) { cx = this.camOverride.x; cy = this.camOverride.y; }
      if (this.shake > 0) { cx += Math.round((Math.random() - 0.5) * this.shake); cy += Math.round((Math.random() - 0.5) * this.shake); this.shake *= 0.9; if (this.shake < 0.5) this.shake = 0; }
      return [Math.round(cx), Math.round(cy)];
    }
    draw(s) {
      const [cx, cy] = this.camera();
      const R = this.render, mx = MR.MX * 16, my = MR.MY * 16;
      if (!this.map.outdoor) s.clear(G.PAL.black);
      MR.animate(R, this.t, cx + mx, cy + my, 320, 180);
      MR.blitOpaque(s, R.s, -(cx + mx), -(cy + my));
      for (const n of this.neighbors) {
        if (!n.R) { n.R = MR.cache[n.map.name] || null; if (!n.R) { this.queueBuild(n); continue; } }
        const ox = n.c.ox * 16 - cx, oy = n.c.oy * 16 - cy;
        if (ox > 320 || oy > 180 || ox + n.map.w * 16 < 0 || oy + n.map.h * 16 < 0) continue;
        MR.animate(n.R, this.t, -ox + mx, -oy + my, 320, 180);
        blitRegion(s, n.R.s, mx, my, n.map.w * 16, n.map.h * 16, ox, oy);
      }
      for (let i = this.fx.length - 1; i >= 0; i--) { const f = this.fx[i]; if (!f.under) continue; if (f.draw(s, cx, cy, this.t) === false) this.fx.splice(i, 1); }
      // actors
      const list = this.actors.filter(a => !a.hidden).concat(this.player.hidden ? [] : [this.player]);
      list.sort((a, b) => (a.py - b.py) || (a.isPlayer ? 1 : -1)); // nearer the bottom of the screen = in front, the walking partner included
      for (const a of list) this.drawActor(s, a, cx, cy);
      // upper layers
      s.blit(R.up, -(cx + mx), -(cy + my));
      for (const n of this.neighbors) {
        if (!n.R) continue;
        const ox = n.c.ox * 16 - cx, oy = n.c.oy * 16 - cy;
        if (ox > 320 || oy > 180 || ox + n.map.w * 16 < 0 || oy + n.map.h * 16 + 16 < 0) continue;
        s.blit(n.R.up, ox, oy - 16, { sx: mx, sy: my - 16, sw: n.map.w * 16, sh: n.map.h * 16 + 16 });
      }
      if (R.interior) G.interior.drawOverlay(s, R, this.t, cx, cy, mx, my);
      for (const a of list) this.drawGrassFront(s, a, cx, cy);
      for (const a of list) if (a.emote) this.drawEmote(s, a, cx, cy);
      if (this.autoPath && this.autoDest) { // click-to-walk destination marker
        const mx0 = this.autoDest[0] * 16 - cx, my0 = this.autoDest[1] * 16 - cy, k = (this.t >> 3) & 1, c = G.gfx.hex('#fff4c0'), o = G.PAL.outline;
        for (const [ax, ay, sx, sy] of [[0, 0, 1, 1], [15, 0, -1, 1], [0, 15, 1, -1], [15, 15, -1, -1]]) for (let i = 0; i < 4; i++) {
          s.pset(mx0 + ax + sx * (i - k), my0 + ay, c); s.pset(mx0 + ax, my0 + ay + sy * (i - k), c);
          s.pset(mx0 + ax + sx * (i - k), my0 + ay + sy, o); s.pset(mx0 + ax + sx, my0 + ay + sy * (i - k), o);
        }
      }
      for (let i = this.fx.length - 1; i >= 0; i--) { const f = this.fx[i]; if (f.under) continue; if (f.draw(s, cx, cy, this.t) === false) this.fx.splice(i, 1); }
      if (G.ambient) G.ambient(s, this, cx, cy);
      MR.drawFires(s, R, -(cx + mx), -(cy + my), this.t);
      for (const n of this.neighbors) if (n.R) MR.drawFires(s, n.R, n.c.ox * 16 - cx - mx, n.c.oy * 16 - cy - my, this.t);
      if (G.ambientDark) G.ambientDark(s, this, cx, cy);
      if (this.poisonFlash > 0) { this.poisonFlash--; const d = s.data, k = this.poisonFlash % 3 === 0 ? 0.35 : 0.15; for (let i = 0; i < d.length; i++) d[i] = G.gfx.mix(d[i], 0xffb048a0, k); }
      if (this.banner) this.drawBanner(s);
    }
    drawActor(s, a, cx, cy) {
      const x = a.px - cx, y = a.py - cy;
      if (x < -24 || y < -32 || x > 340 || y > 200) return;
      let jy = 0;
      if (a.jump) { const t = a.prog / 32; jy = -Math.round(Math.sin(t * Math.PI) * 10); }
      // soft shadow
      s.ellipseMul(x + 8, y + 14, a.jump ? 4 : 5.5, 2, SHADOW);
      const fr = a.frame();
      const oy = fr.h - 16, ox = (fr.w - 16) >> 1;
      // reflection in the water below (shore cells are half land, and the sprite is taller than a cell)
      if (this.map.outdoor && !a.jump && !(a.isPlayer && this.surfing)) {
        const below = this.map.labelAt(Math.floor((a.px + 8) / 16), Math.floor(a.py / 16) + 1);
        if (below === 'water') this.reflect(s, fr, x - ox, y + 16, cx, cy);
      }
      if (G.drawRideUnder) G.drawRideUnder(s, a, x, y + jy);
      const clip = G.rideClip ? G.rideClip(a) : 0;
      if (clip) s.blit(fr, x - ox, y - oy + jy + (a.bob || 0) + Math.round(Math.sin(G.frame / 10)) + 1, { sh: 17 }); // upper body riding the mount
      else s.blit(fr, x - ox, y - oy + jy + (a.bob || 0));
      if (G.drawRideOver) G.drawRideOver(s, a, x, y + jy);
    }
    // flipped, faint and blue, drawn only onto pixels the map renderer painted as water (its animation mask), so a
    // reflection never lands on the sand or grass half of a shore cell or spills past the water's edge
    reflect(s, fr, dx, dy, cx, cy) {
      const R = this.render, M = R.wmask, ox = MR.MX * 16 + cx, oy = MR.MY * 16 + cy, d = s.data, src = fr.data, TINT = rgb(150, 190, 255);
      for (let j = 0; j < fr.h; j++) {
        const sy = dy + j, ry = sy + oy; if (sy < 0 || sy >= s.h || ry < 0 || ry >= R.H) continue;
        const row = (fr.h - 1 - j) * fr.w;
        for (let i = 0; i < fr.w; i++) {
          const c = src[row + i], sx = dx + i, rx = sx + ox;
          if (!(c >>> 24) || sx < 0 || sx >= s.w || rx < 0 || rx >= R.W || !M[ry * R.W + rx]) continue;
          const k = sy * s.w + sx; d[k] = mix(d[k], mul(c, TINT), 0.35);
        }
      }
    }
    drawGrassFront(s, a, cx, cy) {
      if (a.jump) return;
      const gx = Math.floor((a.px + 8) / 16), gy = Math.floor((a.py + 12) / 16);
      if (!this.map.isGrass(gx, gy)) return;
      const cell = this.render.gcell[gx + ',' + gy];
      if (!cell) return;
      const sp = G.terrain.tallGrassFront(cell.v, cell.rustle > 0 ? 1 : 0);
      s.blit(sp, gx * 16 - cx, gy * 16 - cy);
    }
    drawEmote(s, a, cx, cy) {
      const x = a.px - cx + 3, y = a.py - cy - 22 - Math.max(0, 6 - a.emoteT) ;
      G.drawEmote(s, a.emote, x, y);
    }
    drawBanner(s) {
      const b = this.banner; b.t++;
      const life = 150;
      if (b.t > life) { this.banner = null; return; }
      const slide = b.t < 12 ? b.t / 12 : b.t > life - 12 ? (life - b.t) / 12 : 1;
      const w = G.font.measure(b.text) + 24, h = 22;
      const y = Math.round(-h + (h + 4) * slide);
      G.ui.frame(s, 4, y, w, h, 'gray');
      G.ui.text(s, b.text, 16, y + 7);
    }
  }
  function blitRegion(dst, src, sx, sy, sw, sh, dx, dy) {
    const x0 = Math.max(0, dx), y0 = Math.max(0, dy), x1 = Math.min(dst.w, dx + sw), y1 = Math.min(dst.h, dy + sh);
    if (x1 <= x0 || y1 <= y0) return;
    for (let y = y0; y < y1; y++) {
      const so = (sy + y - dy) * src.w + (sx + x0 - dx);
      dst.data.set(src.data.subarray(so, so + (x1 - x0)), y * dst.w + x0);
    }
  }

  // Open-doorway overlay drawn under actors while entering/leaving buildings
  G.doorFx = function (cx, cy) {
    const P = G.PAL;
    return { under: true, t: 0, draw(s, camx, camy) {
      this.t++;
      const x = cx * 16 - camx, y = cy * 16 - camy, open = Math.min(1, this.t / 5);
      const w = Math.round(10 * open);
      for (let j = 3; j < 15; j++) for (let i = 0; i < w; i++) s.pset(x + 3 + i, y + j, G.gfx.mix(P.black, G.gfx.hex('#3a2a20'), (j - 3) / 16));
      return !this.done;
    } };
  };
  // ---------------- fades ----------------
  G.fadeLevel = 0; G.fadeColor = G.PAL.black;
  function* fadeOut(n, color) { G.fadeColor = color === undefined ? G.PAL.black : color; for (let i = 1; i <= n; i++) { G.fadeLevel = i / n; yield; } }
  function* fadeIn(n) { for (let i = n - 1; i >= 0; i--) { G.fadeLevel = i / n; yield; } G.fadeLevel = 0; }
  G.fadeOut = fadeOut; G.fadeIn = fadeIn;
  const prevPost = G.postDraw;
  G.postDraw = function (s) {
    if (prevPost) prevPost(s);
    if (G.fadeLevel > 0) {
      const lv = Math.round(G.fadeLevel * 6) / 6, d = s.data, c = G.fadeColor;
      if (lv >= 1) { d.fill(c); return; }
      for (let i = 0; i < d.length; i++) d[i] = G.gfx.mix(d[i], c, lv);
    }
  };

  // ---------------- script runner ----------------
  G.scriptRunning = 0;
  G.spawnScript = function (gen, name) {
    G.scriptRunning++;
    return G.engine.spawn((function* () {
      try { return yield* gen; } finally { G.scriptRunning--; G.input.clear(); }
    })(), name || 'script');
  };

  // Emote bubbles ("!", "?", "...", heart)
  G.drawEmote = function (s, kind, x, y) {
    const P = G.PAL;
    for (let j = 0; j < 11; j++) for (let i = 0; i < 11; i++) {
      const edge = (i === 0 || j === 0 || i === 10 || j === 10);
      const corner = (i === 0 || i === 10) && (j === 0 || j === 10);
      if (corner) continue;
      s.pset(x + i, y + j, edge ? P.outline : P.white);
    }
    s.pset(x + 4, y + 11, P.outline); s.pset(x + 5, y + 11, P.white); s.pset(x + 6, y + 11, P.outline); s.pset(x + 5, y + 12, P.outline);
    const red = G.gfx.hex('#e04040');
    if (kind === '!') { for (let j = 2; j < 7; j++) { s.pset(x + 5, y + j, red); s.pset(x + 4, y + j, red); } s.pset(x + 4, y + 8, red); s.pset(x + 5, y + 8, red); }
    else if (kind === '?') { const q = ['.###.', '#...#', '...#.', '..#..', '.....', '..#..']; q.forEach((r, j) => { for (let i = 0; i < 5; i++) if (r[i] === '#') s.pset(x + 3 + i, y + 2 + j, P.outline); }); }
    else if (kind === '...') { s.pset(x + 2, y + 6, P.outline); s.pset(x + 5, y + 6, P.outline); s.pset(x + 8, y + 6, P.outline); }
    else if (kind === 'heart') { const h = ['.#.#.', '#####', '#####', '.###.', '..#..']; h.forEach((r, j) => { for (let i = 0; i < 5; i++) if (r[i] === '#') s.pset(x + 3 + i, y + 3 + j, red); }); }
  };

  G.Overworld = Overworld; G.DIRS = DIRS; G.OPP = OPP; G.blitRegion = blitRegion;
})(window.G);
