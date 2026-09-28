// Boot
(function (G) {
  'use strict';
  function param(k) { const m = String((window.location && window.location.search) || '').match(new RegExp('[?&]' + k + '=([^&]+)')); return m ? decodeURIComponent(m[1]) : null; }
  G.param = param;
  G.startGame = function (st) {
    G.state = G.fixBoxes(st || G.newState());
    if (G.applyLook) G.applyLook(G.state.look); // every new or loaded game wears its own look
    const ow = G.ow = new G.Overworld();
    G.engine.push(ow);
    ow.load(G.state.map, G.state.x, G.state.y, G.state.dir);
    const S = G.state; // analytics (src/game/analytics.js): a fresh adventure, or a save picked up again
    if (G.track && !param('map')) G.track(S.party.length || S.playTime ? 'continue' : 'new_game', { name: S.name, rival: S.rival, face: (S.look && S.look.face) || 'm', hof: (S.hallOfFame || []).length });
    return ow;
  };
  G.boot = function () {
    G.maps.layoutWorld();
    const st = G.newState();
    const m = param('map');
    if (m) { st.map = m; st.x = +(param('x') || 5); st.y = +(param('y') || 6); st.dir = 'down'; }
    if (G.saveImportLanding && !window.HEADLESS && G.saveImportLanding()) return; // #importsave=... transfer link
    if (param('moment') && G.showMoment && G.showMoment(param('moment'))) return; // a shared moment link
    if (G.socialLinkLanding && !window.HEADLESS && G.socialLinkLanding(window.location.search)) return; // team / trade links
    const wtp = String(window.location.search || '').match(/[?&]wtp(?:=(daily|endless))?(?:&|$)/);
    if (wtp && G.whosThatPokemon && !window.HEADLESS) { // ?wtp=daily / ?wtp=endless: straight into the quiz, then the title
      G.spawnScript((function* () {
        yield* G.whosThatPokemon(wtp[1] || null);
        try { history.replaceState(null, '', location.pathname); } catch (e) {}
        G.titleScreen();
      })(), 'wtp');
      return;
    }
    if (G.titleScreen && !m && !window.HEADLESS) { (G.playIntro || G.titleScreen)(); return; }
    G.startGame(st);
    // dev helpers: ?battle=SPECIES&lv=N starts a wild battle with a sample party; ?hour=H forces time of day
    if (param('hour')) G.forceHour = +param('hour');
    if (param('battle')) {
      G.state.party.push(new G.Mon(param('mon') || 'CHARMANDER', +(param('plv') || 12)));
      G.bag.add('POKE_BALL', 5);
      G.spawnScript(G.startWildBattle(param('battle'), +(param('lv') || 5)));
    }
  };
  if (!window.HEADLESS) {
    window.addEventListener('load', () => { G.boot(); G.engine.startBrowser(document.getElementById('screen')); });
  }
})(window.G);
