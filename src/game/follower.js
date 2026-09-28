// Walking partner, as in HeartGold/SoulSilver: the lead POKéMON follows one step behind the player. Its overworld
// sprite comes from the same shape definition as its battle sprite (front walking down, back walking up, front
// facing or mirrored sideways), rasterised small so the outline stays crisp.
//
// It steps into whatever tile the player just left, so it only ever stands where the player could, hops ledges
// behind them, and comes back out after doors. It never blocks anything: the player, NPCs, trainers' line of sight or
// boulders all ignore it. It's drawn by depth like everyone else: in front of you when it's nearer the camera
// (walking north), behind you when it's further away (walking south). It goes back in its ball while surfing or cycling, or if the lead has fainted; OPTION >
// FOLLOWER turns it off. Talk to it (turn round and press A) to see how it's doing.
(function (G) {
  'use strict';
  const { Surface } = G.gfx;
  const OW = G.Overworld.prototype;
  const cache = {};

  // sized by the POKéDEX height, as in HGSS: DIGLETT and EEVEE come up to your knees, ONIX towers over you
  function sizeFor(sp) {
    const d = G.DATA.species[sp], ht = d && Array.isArray(d.ht) ? d.ht[0] + d.ht[1] / 12 : 0;
    return ht > 0 ? Math.max(16, Math.min(42, Math.round(10 + 9 * Math.sqrt(ht)))) : 28;
  }
  // [still, bob] for each direction
  function frames(sp) {
    if (cache[sp]) return cache[sp];
    const SIZE = sizeFor(sp);
    const f = G.pokeSprite(sp, 'front', SIZE), b = G.pokeSprite(sp, 'back', Math.round(SIZE / 1.18)); // the back view renders 1.18x larger
    const mk = (src, dy, flip) => { const s = new Surface(SIZE, SIZE); s.blit(src, Math.round((SIZE - src.w) / 2), SIZE - src.h + dy, { flipX: !!flip }); return s; };
    return (cache[sp] = { down: [mk(f, 0), mk(f, -1)], left: [mk(f, 0), mk(f, -1)], right: [mk(f, 0, true), mk(f, -1, true)], up: [mk(b, 0), mk(b, -1)] });
  }
  const lead = () => { const S = G.state, m = S && S.party && S.party[0]; return m && m.hp > 0 ? m : null; };
  const enabled = () => !(G.state && G.state.options && G.state.options.follower === false);

  let actor = null;
  function make() {
    const a = new G.Actor({ x: 0, y: 0, dir: 'down', sprite: 'red', follower: true, hidden: true });
    a.frame = function () {
      const f = frames(this.species)[this.dir] || frames(this.species).down;
      if (this.moving) return f[(this.prog >> 2) & 1]; // two bobs per tile
      return f[(G.frame % 48) < 24 ? 0 : 1];         // and a slow breath standing still
    };
    return a;
  }
  // after a warp, a load or a teleport: one step behind the player if that tile is free ground, else tucked under them
  function place(ow) {
    const p = ow.player, m = ow.map; if (!p || !m) return;
    actor = actor || make();
    const [dx, dy] = G.DIRS[p.dir] || [0, 1], bx = p.x - dx, by = p.y - dy;
    const ok = m.inside(bx, by) && m.passable(bx, by) && m.warpAt(bx, by) < 0 && !ow.actorAt(bx, by, p) && !(m.isWater && m.isWater(bx, by));
    Object.assign(actor, { x: ok ? bx : p.x, y: ok ? by : p.y, dir: p.dir, moving: false, prog: 0, jump: 0, species: (lead() || {}).species || actor.species || 'PIKACHU' });
    actor.seen = p.step;
    if (!ow.actors.includes(actor)) ow.actors.push(actor);
  }
  function visible(ow) {
    const m = lead(), p = ow.player, a = actor;
    if (!m || !enabled() || ow.surfing || ow.biking || p.hidden) return false;
    if (!a.moving && a.x === p.x && a.y === p.y) return false; // tucked under the player
    const map = ow.map;
    return !(map.isWater && map.isWater(a.x, a.y) && !a.moving);
  }
  function tick(ow) {
    const p = ow.player; if (!p || !ow.map) return;
    if (!actor || !ow.actors.includes(actor)) place(ow);
    const a = actor, m = lead();
    a.species = m ? m.species : a.species || 'PIKACHU';
    if (a.moving) a.update();
    if (p.step !== a.seen) { // the player just set off from (p.x, p.y): walk into that tile behind them
      a.seen = p.step;
      if (a.moving) { const [dx, dy] = G.DIRS[a.mdir], k = a.jump ? 2 : 1; a.x += dx * k; a.y += dy * k; a.moving = false; a.prog = 0; a.jump = 0; }
      const dx = p.x - a.x, dy = p.y - a.y, far = Math.abs(dx) + Math.abs(dy);
      const dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      if (far === 0) a.dir = p.mdir || p.dir;                              // it was tucked under: stays and comes into view
      else if (far === 1) a.startMove(dir, Math.min(p.speed || 1, 4));
      else if (far === 2 && (!dx || !dy)) a.startMove(dir, 2, true);        // hop the ledge the player just jumped
      else { a.x = p.x; a.y = p.y; }                                        // a jump cut: catch up out of sight
    } else if (!a.moving && !p.moving && Math.abs(p.x - a.x) + Math.abs(p.y - a.y) > 2) place(ow); // the player was moved by a script
    a.hidden = !visible(ow);
  }

  // ---------------- hooks ----------------
  const origUpdate = OW.update;
  OW.update = function (focused) { const r = origUpdate.apply(this, arguments); if (focused && G.state) tick(this); return r; };
  const origLoad = OW.load;
  OW.load = function () { const r = origLoad.apply(this, arguments); place(this); if (actor) actor.hidden = !visible(this); return r; };
  const origSpawn = OW.spawnActors;
  OW.spawnActors = function () { origSpawn.apply(this, arguments); if (actor && this.player) this.actors.push(actor); };
  OW.followerAt = function (x, y) { return actor && !actor.hidden && !actor.moving && actor.x === x && actor.y === y && this.actors.includes(actor) ? actor : null; };
  G.follower = { get actor() { return actor; }, frames, sizeFor, place: () => G.ow && place(G.ow) };

  // ---------------- talking to it ----------------
  const pick = a => a[Math.floor(Math.random() * a.length)];
  function mood(m, ow) {
    const n = m.name, map = ow.map, name = map.name, types = m.types || [], hp = m.hp / m.maxhp;
    const lines = [];
    const st = { PSN: [n + ' is shivering from the poison!', '...'], BRN: [n + ' is hurting from its burn.', '...'], PAR: [n + " is paralyzed. It can barely move!", '...'], SLP: [n + ' is fast asleep... zzz', '...'], FRZ: [n + ' is frozen solid!', '...'] }[m.status];
    if (st) return st;
    if (hp < 0.25) return [n + ' looks exhausted. Maybe rest at a POKéMON CENTER?', '...'];
    if (/Pokecenter/.test(name)) lines.push([n + ' looks relaxed here.', 'heart']);
    if (/Gym$/.test(name)) lines.push([n + ' is fired up for a GYM battle!', '!']);
    if (/^PokemonTower/.test(name)) lines.push([n + ' is trembling... it senses something.', '...']);
    if (/^(MtMoon|RockTunnel|DiglettsCave|SeafoamIslands|CeruleanCave|VictoryRoad)/.test(name)) lines.push([n + ' is sticking close to you in the dark.', '...']);
    if (/^SafariZone/.test(name)) lines.push([n + ' is excited by all the wild POKéMON!', '!']);
    if (name === 'SocialZone') lines.push([n + ' wants to show off to the other trainers!', '!']);
    if (name === 'PalletTown') lines.push([n + ' seems to like PALLET TOWN.', 'heart']);
    if (map.isGrass && map.isGrass(ow.player.x, ow.player.y)) lines.push([n + ' is rustling around in the tall grass!', '!']);
    const type = { FIRE: n + ' is giving off a gentle warmth.', WATER: n + ' wants to go for a swim!', ELECTRIC: n + "'s cheeks are crackling with electricity!", GRASS: n + ' is soaking up the sunshine.',
      GHOST: n + ' is floating around mischievously.', PSYCHIC_TYPE: n + ' is staring into the distance...', ICE: n + ' is chilling the air around it.', DRAGON: n + ' looks proud and powerful.',
      FIGHTING: n + ' is throwing punches at the air!', BUG: n + ' is chasing a butterfly.', FLYING: n + ' is watching the birds overhead.', POISON: n + ' is sniffing the air.', ROCK: n + ' is sitting as still as a stone.', GROUND: n + ' is digging at the ground.' };
    for (const t of types) if (type[t]) lines.push([type[t], '...']);
    lines.push([n + ' is happy to be walking with you!', 'heart'], [n + ' is looking around curiously.', '?'], [n + ' seems to be enjoying the walk!', 'heart'], [n + ' is keeping a close eye on you.', '...']);
    if (m.level >= 50) lines.push([n + ' looks strong and confident!', '!']);
    return pick(lines);
  }
  function* talk(a) {
    const ow = G.ow, m = lead(); if (!m) return;
    a.dir = G.OPP[ow.player.dir];
    G.cry && G.cry(m.species);
    const [text, emote] = mood(m, ow);
    a.emote = emote; a.emoteT = 0;
    try { yield* G.engine.wait(20); yield* G.say(text); } finally { a.emote = null; }
  }
  const origTalkTo = G.talkTo;
  G.talkTo = function (a) { return a && a.follower ? talk(a) : origTalkTo.apply(this, arguments); };
})(window.G);
