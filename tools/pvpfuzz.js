// Link battle lockstep check: two separate copies of the game battle each other, each playing its own team at the
// bottom and passing only picks (the way src/game/lounge.js does over the network). Random species, movesets and
// inputs, including switches. Both games must agree on every turn: the host's checksum has to match the guest's, the
// final HP of all six POKéMON has to match, and the results must be opposite.
//   node tools/pvpfuzz.js [battles]
const H = require('./headless.js');
const N = +(process.argv[2] || 40);
const load = () => { const G = H.loadGame({ search: '?map=Route1&x=10&y=20' }).G; G.boot(); G.noEncounters = true; G.autoBattleText = true; G.state.options.battleAnim = false; return G; };
const A = load(), B = load();
const species = Object.keys(A.DATA.species).filter(s => A.DATA.species[s].dex >= 1), moves = A.DATA.moveList.filter(m => m !== 'STRUGGLE');
const pick = a => a[Math.floor(Math.random() * a.length)];
const errs = []; const origErr = console.error; console.error = (...a) => errs.push(a.join(' ').slice(0, 300));
const origWarn = console.warn; let warns = 0; console.warn = (...a) => { if (/resynced/.test(a[0])) warns++; else origWarn(...a); };

function team() {
  return [0, 1, 2].map(() => {
    const m = new A.Mon(pick(species), 50, { dvs: { atk: Math.random() * 16 | 0, def: Math.random() * 16 | 0, spd: Math.random() * 16 | 0, spc: Math.random() * 16 | 0 } });
    m.moves = []; while (m.moves.length < 4) m.addMove(pick(moves));
    for (const k in m.sexp) m.sexp[k] = Math.random() * 65536 | 0;
    return A.socialInternals.monOut(m, false);
  });
}
function start(G, m, other) {
  const SI = G.socialInternals, lk = new G.lounge.Link(m);
  lk.send = (b, k, a, extra) => other.link.inbox.push(JSON.parse(JSON.stringify(Object.assign({ t: 'bt', mid: m.mid, turn: b.turn, k, a }, extra || {}))));
  const mine = m.teams[m.host ? 0 : 1].map(o => SI.monIn(Object.assign({}, o, { l: 50 }), 'ME', 0));
  const foes = m.teams[m.host ? 1 : 0].map(o => SI.monIn(Object.assign({}, o, { l: 50 }), 'FOE', 0));
  G.state.party = mine;
  const task = G.spawnScript(G.runBattle({ type: 'trainer', enemyParty: foes, trainer: { cls: 'COOLTRAINER_M', displayName: 'FOE', money: 0 }, trainerItems: [],
    transition: 'boss', noBlackout: true, noExp: true, noItems: true, noBadgeBoost: true, p2Action: lk.p2Action, pvp: lk }));
  return { G, link: lk, task, mine, foes };
}
function drive(G, f) {
  const top = G.engine.scenes[G.engine.scenes.length - 1], I = G.input.injected;
  I.a = f % 3 === 0; I.b = false; I.down = false; I.right = false;
  if (top && top.constructor.name === 'PartyScreen') I.down = f % 6 === 0;
  if (top && top.menu && top.menu.kind === 'action' && f % 3 === 0) top.menu.sel = Math.random() < 0.12 ? 1 : 0; // now and then, switch
  if (top && top.menu && top.menu.kind === 'moves' && top.b) {
    const ml = top.b.moveList(top.b.p), v = top.b.p.v;
    const ok = ml.map((x, i) => i).filter(i => ml[i].pp > 0 && !(v.disabled && v.disabled.move === ml[i].id));
    if (ok.length && f % 3 === 0) top.menu.sel = pick(ok);
  }
  G.engine.step();
}
let bad = 0, results = {}, turns = 0;
for (let n = 0; n < N; n++) {
  const seed = Math.random() * 2 ** 32 >>> 0, teams = [team(), team()];
  const a = {}, b = {};
  Object.assign(a, start(A, { mid: 'm' + n, seed, host: true, teams, foe: { id: 2, name: 'GUEST' } }, b));
  Object.assign(b, start(B, { mid: 'm' + n, seed, host: false, teams, foe: { id: 1, name: 'HOST' } }, a));
  // the guest checks the host's checksum every turn: count mismatches instead of silently fixing them
  let mismatch = 0;
  b.link.apply = function () { mismatch++; };
  let f = 0;
  for (; f < 120000 && !(a.task.done && b.task.done); f++) { if (!a.task.done) drive(A, f); if (!b.task.done) drive(B, f + 1); }
  const hp = side => side.map(m => m.hp).join(',');
  const same = hp(a.mine) === hp(b.foes) && hp(a.foes) === hp(b.mine);
  const ra = a.task.value, rb = b.task.value, opposite = (ra === 'win' && rb === 'lose') || (ra === 'lose' && rb === 'win') || (ra === 'draw' && rb === 'draw');
  results[ra + '/' + rb] = (results[ra + '/' + rb] || 0) + 1;
  if (!same || !opposite || mismatch || !a.task.done || !b.task.done) {
    bad++;
    console.log('battle', n, 'seed', seed, 'results', ra, rb, 'hp host', hp(a.mine), hp(a.foes), 'guest', hp(b.foes), hp(b.mine), 'checksum mismatches', mismatch, 'frames', f,
      '\n  host team', teams[0].map(o => o.s + '[' + o.m.join(' ') + ']').join(', '), '\n  guest team', teams[1].map(o => o.s + '[' + o.m.join(' ') + ']').join(', '));
  }
  for (const G of [A, B]) { G.engine.scenes.length = 1; G.engine.tasks.length = 0; G.scriptRunning = 0; G.ow.locks = 0; G.fadeLevel = 0; }
}
console.error = origErr;
console.log('link battles', N, 'results', JSON.stringify(results), 'out of step', bad);
if (errs.length) console.log('errors:\n' + [...new Set(errs)].slice(0, 10).join('\n'));
process.exit(bad || errs.length ? 1 : 0);
