// Pokémon Center healing, PC storage systems and Poké Mart.
(function (G) {
  'use strict';
  const { hex } = G.gfx;
  const P = G.PAL, F = G.font;
  const T = (label, fallback) => (G.TEXT[label] ? G.TEXT[label] : fallback);

  // ---------------- Pokémon Center ----------------
  G.nurseHeal = function* (nurse) {
    const ow = G.ow;
    yield* G.say(T('PokemonCenterWelcomeText', 'Welcome to our POKéMON CENTER!\fWe restore your tired POKéMON to full health.'));
    if (!(yield* G.ask(T('ShallWeHealYourPokemonText', 'Shall we heal your POKéMON?')))) {
      yield* G.say(T('PokemonCenterFarewellText', 'We hope to see you again!')); return;
    }
    yield* G.say(T('NeedYourPokemonText', "OK. We'll need your POKéMON."), { noWait: true });
    // machine animation: balls placed one by one, then a glow pulse
    const n = G.state.party.length;
    const mx = (nurse.x - 1) * 16, my = (nurse.y - 1) * 16 + 4;
    const fx = { t: 0, placed: 0, draw(s, cx, cy) {
      this.t++;
      for (let i = 0; i < this.placed; i++) {
        const bx = mx - cx + 5 + (i % 2) * 7, by = my - cy + 3 + Math.floor(i / 2) * 5;
        const glow = this.glow && Math.floor(this.t / 6) % 2;
        G.drawBall(s, bx, by, 'POKE_BALL', 0);
        if (glow) s.ellipseBlend(bx, by, 5, 5, hex('#fff0f8'), 0.7);
      }
      return !this.done;
    } };
    ow.fx.push(fx);
    nurse.dir = 'left';
    for (let i = 0; i < n; i++) { fx.placed = i + 1; G.sfx && G.sfx('ballplace'); yield* G.engine.wait(18); }
    fx.glow = true; G.music && G.music('heal', true);
    yield* G.engine.wait(110);
    fx.done = true;
    for (const m of G.state.party) m.healFull();
    G.state.lastHeal = { map: ow.map.name, x: ow.player.x, y: ow.player.y };
    const town = G.state.lastOutdoor, spot = G.BLACKOUT_SPOTS && G.BLACKOUT_SPOTS[town]; if (spot) G.state.lastHealTown = { map: town, x: spot[0], y: spot[1] };
    nurse.dir = 'down';
    G.music && G.music(G.mapMusic ? G.mapMusic(ow.map) : null);
    yield* G.say(T('PokemonFightingFitText', "Thank you!\fYour POKéMON are fighting fit!"));
    nurse.emote = null;
    yield* G.say(T('PokemonCenterFarewellText', 'We hope to see you again!'));
  };
  G.healNurseLine = function* () { yield* G.say(T('PokemonFightingFitText', 'Your POKéMON are fighting fit!')); };

  // ---------------- PC ----------------
  G.usePC = function* () {
    G.sfx && G.sfx('pc_on');
    yield* G.say(G.state.name + ' turned on the PC.');
    for (;;) {
      const opts = [G.flag('EVENT_MET_BILL') ? "BILL's PC" : "SOMEONE's PC", G.state.name + "'s PC"];
      if (G.flag('EVENT_GOT_POKEDEX')) opts.push("PROF.OAK's PC");
      if (G.flag('EVENT_BEAT_CHAMPION')) opts.push('<PKMN LEAGUE>');
      opts.push('LOG OFF');
      const r = yield* G.choose(opts, { x: 150, y: 20, w: 164 });
      if (r < 0 || opts[r] === 'LOG OFF') { G.sfx && G.sfx('pc_off'); return; }
      if (r === 0) yield* billsPC();
      else if (r === 1) yield* playersPC();
      else if (opts[r] === "PROF.OAK's PC") yield* G.oakRating(true);
      else if (G.viewHallOfFame) yield* G.viewHallOfFame();
      else yield* G.say('The HALL OF FAME records are stored here.');
    }
  };
  function* billsPC() {
    G.sfx && G.sfx('pc_access');
    yield* G.say('Accessed ' + (G.flag('EVENT_MET_BILL') ? "BILL's" : "someone's") + ' PC.\fAccessed POKéMON Storage System.');
    const S = G.state;
    for (;;) {
      const box = G.currentBox();
      const r = yield* G.choose(['WITHDRAW PKMN', 'DEPOSIT PKMN', 'RELEASE PKMN', 'CHANGE BOX', 'SEE YA!'], { x: 150, y: 20, w: 164 });
      if (r < 0 || r === 4) return;
      if (r === 0) {
        if (!box.length) { yield* G.say("What? There are no POKéMON here!"); continue; }
        if (S.party.length >= 6) { yield* G.say("You can't take any more POKéMON.\fDeposit POKéMON first."); continue; }
        const i = yield* G.choose(box.map(m => m.name + '  Lv' + m.level), { x: 100, y: 4, w: 214 });
        if (i < 0) continue;
        const m = box.splice(i, 1)[0]; S.party.push(m);
        yield* G.say(m.name + ' is taken out.\fGot ' + m.name + '.');
      } else if (r === 1) {
        if (S.party.length <= 1) { yield* G.say("You can't deposit the last POKéMON!"); continue; }
        if (box.length >= 20) { yield* G.say("Oops! This box is full of POKéMON."); continue; }
        const i = yield* G.partyScreen({ msg: 'Deposit which POKéMON?', pick: function* () { return true; } });
        if (i < 0) continue;
        const m = S.party.splice(i, 1)[0]; box.push(m);
        yield* G.say(m.name + ' was stored in Box ' + (S.box + 1) + '.');
      } else if (r === 2) {
        if (!box.length) { yield* G.say("What? There are no POKéMON here!"); continue; }
        const i = yield* G.choose(box.map(m => m.name + '  Lv' + m.level), { x: 100, y: 4, w: 214 });
        if (i < 0) continue;
        if (yield* G.ask('Once released, ' + box[i].name + ' is gone forever. OK?')) { const m = box.splice(i, 1)[0]; yield* G.say(m.name + ' was released outside.\fBye ' + m.name + '!'); }
      } else if (r === 3) {
        const i = yield* G.choose(Array.from({ length: 12 }, (_, k) => 'BOX ' + (k + 1) + ((S.boxes[k] || []).length ? ' (' + S.boxes[k].length + ')' : '')), { x: 180, y: 2, w: 134 });
        if (i >= 0) { S.box = i; yield* G.say('Switched to BOX ' + (i + 1) + '.'); }
      }
    }
  }
  function* playersPC() {
    G.sfx && G.sfx('pc_access');
    yield* G.say("Accessed my PC.\fAccessed Item Storage System.");
    const S = G.state;
    for (;;) {
      const r = yield* G.choose(['WITHDRAW ITEM', 'DEPOSIT ITEM', 'TOSS ITEM', 'LOG OFF'], { x: 150, y: 20, w: 164 });
      if (r < 0 || r === 3) return;
      if (r === 0) {
        if (!S.pc.length) { yield* G.say('There is nothing stored.'); continue; }
        const i = yield* G.choose(S.pc.map(e => G.itemName(e.id) + ' ×' + e.n), { x: 110, y: 4, w: 204 });
        if (i < 0) continue;
        const e = S.pc[i];
        const q = yield* quantity(e.n);
        if (!q) continue;
        if (!G.bag.add(e.id, q)) { yield* G.say("You can't carry any more items."); continue; }
        e.n -= q; if (e.n <= 0) S.pc.splice(i, 1);
        yield* G.say('Withdrew ' + G.itemName(e.id) + '.');
      } else if (r === 1) {
        if (!S.bag.length) { yield* G.say('You have nothing to deposit.'); continue; }
        const i = yield* G.choose(S.bag.map(e => G.itemName(e.id) + ' ×' + e.n), { x: 110, y: 4, w: 204 });
        if (i < 0) continue;
        const e = S.bag[i];
        const q = yield* quantity(e.n); if (!q) continue;
        const pe = S.pc.find(x => x.id === e.id); if (pe) pe.n += q; else S.pc.push({ id: e.id, n: q });
        G.bag.remove(e.id, q);
        yield* G.say(G.itemName(e.id) + ' was stored via PC.');
      } else if (r === 2) {
        if (!S.pc.length) { yield* G.say('There is nothing stored.'); continue; }
        const i = yield* G.choose(S.pc.map(e => G.itemName(e.id) + ' ×' + e.n), { x: 110, y: 4, w: 204 });
        if (i < 0) continue;
        if (G.bag.isKey(S.pc[i].id)) { yield* G.say("That's too important to toss!"); continue; }
        if (yield* G.ask('Is it OK to toss ' + G.itemName(S.pc[i].id) + '?')) S.pc.splice(i, 1);
      }
    }
  }
  function* quantity(max, price) {
    let q = 1;
    const scene = { t: 0, done: false, result: 0, update(f) {
      if (!f) return; const I = G.input;
      if (I.repeat('up')) q = q >= max ? 1 : q + 1; if (I.repeat('down')) q = q <= 1 ? max : q - 1;
      if (I.repeat('right')) q = Math.min(max, q + 10); if (I.repeat('left')) q = Math.max(1, q - 10);
      if (I.pressed.a) { this.result = q; this.done = true; } if (I.pressed.b) { this.result = 0; this.done = true; }
    }, draw(s) {
      const w = price ? 130 : 60; G.ui.frame(s, 314 - w, 104, w, 22);
      G.ui.text(s, '×' + String(q).padStart(2, '0'), 324 - w, 111);
      if (price) { const t = '$' + q * price; G.ui.text(s, t, 306 - F.measure(t), 111); }
    } };
    return yield* G.engine.run(scene);
  }
  G.quantity = quantity;

  G.oakRating = function* (viaPC) {
    const seen = Object.keys(G.state.dex.seen).length, own = Object.keys(G.state.dex.caught).length;
    yield* G.say('POKéDEX comp' + 'letion is:\f' + seen + ' POKéMON seen\f' + own + ' POKéMON owned\fPROF.OAK\'s rating:');
    const tiers = [[10, 'OakRating0'], [20, 'OakRating1'], [30, 'OakRating2'], [40, 'OakRating3'], [50, 'OakRating4'], [60, 'OakRating5'], [70, 'OakRating6'], [80, 'OakRating7'], [90, 'OakRating8'], [100, 'OakRating9'], [110, 'OakRating10'], [120, 'OakRating11'], [130, 'OakRating12'], [140, 'OakRating13'], [150, 'OakRating14'], [999, 'OakRating15']];
    const fallback = ['You still have lots to do. Look for POKéMON in grassy areas!', 'You\'re on the right track! Get a FLASH HM from my AIDE!', 'You still need more POKéMON! Try to catch other species!', 'Good, you\'re trying hard! Get an ITEMFINDER from my AIDE!', 'Looking good! Go find my AIDE when you get 50!', 'You finally got at least 50 species! Be sure to get EXP.ALL from my AIDE!', 'Ho! This is getting even better!', 'Very good! Go fish for some marine POKéMON!', 'Wonderful! Do you like to collect things?', 'I\'m impressed! It must have been difficult to do!', 'You finally got at least 100 species! I can\'t believe how good you are!', 'You even have the evolved forms of POKéMON! Super!', 'Excellent! Trade with friends to get some more!', 'Outstanding! You\'ve become a real pro at this!', 'I have nothing left to say! You\'re the authority now!', 'Your POKéDEX is entirely complete! Congratulations!'];
    let i = tiers.findIndex(t => own < t[0]); if (i < 0) i = 15;
    const lbl = ['DexRatingText_0to9'][0];
    yield* G.say(G.TEXT[tiers[i][1]] || fallback[i]);
  };

  // ---------------- Poké Mart ----------------
  G.mart = function* (items) {
    yield* G.say(T('PokemartGreetingText', 'Hi there!\fMay I help you?'), { noWait: true });
    for (;;) {
      const r = yield* G.choose(['BUY', 'SELL', 'QUIT'], { x: 6, y: 6, w: 80 });
      if (r < 0 || r === 2) { yield* G.say(T('PokemartThankYouText', 'Thank you!')); return; }
      if (r === 0) {
        for (;;) {
          const names = items.map(id => G.itemName(id).padEnd(12, ' ') + ' $' + G.DATA.items[id].price);
          const i = yield* G.choose(items.map(id => G.itemName(id)), { x: 110, y: 4, w: 204, onMove: null });
          if (i < 0) break;
          const id = items[i], price = G.DATA.items[id].price;
          const max = Math.min(99, Math.floor(G.state.money / price));
          if (max < 1) { yield* G.say(T('PokemartNotEnoughMoneyText', "You don't have enough money.")); continue; }
          const q = yield* quantity(max, price);
          if (!q) continue;
          if (yield* G.ask(G.itemName(id) + '? That will be $' + q * price + '. OK?')) {
            if (!G.bag.add(id, q)) { yield* G.say(T('PokemartItemBagFullText', "You can't carry any more items.")); continue; }
            G.state.money -= q * price; G.sfx && G.sfx('buy');
            yield* G.say(T('PokemartBoughtItemText', 'Here you are!\fThank you!'));
          }
        }
      } else {
        for (;;) {
          const bag = G.state.bag;
          if (!bag.length) { yield* G.say('You have nothing to sell.'); break; }
          const i = yield* G.choose(bag.map(e => G.itemName(e.id) + ' ×' + e.n), { x: 110, y: 4, w: 204 });
          if (i < 0) break;
          const e = bag[i], price = Math.floor((G.DATA.items[e.id] || { price: 0 }).price / 2);
          if (G.bag.isKey(e.id) || price <= 0) { yield* G.say(T('PokemartUnsellableItemText', "I can't put a price on that.")); continue; }
          const q = yield* quantity(e.n, price); if (!q) continue;
          if (yield* G.ask('I can pay $' + q * price + ' for that.')) { G.bag.remove(e.id, q); G.state.money += q * price; G.sfx && G.sfx('buy'); }
        }
      }
    }
  };
})(window.G);

// Trade animation: your Pokémon leaves in a ball along the link cable, the new one arrives.
(function (G) {
  'use strict';
  const { hex, mix } = G.gfx;
  G.tradeAnimation = function* (give, get) {
    const P = G.PAL;
    const sc = { opaque: true, t: 0, phase: 0, update() { this.t++; }, draw(s) {
      for (let y = 0; y < 180; y++) for (let x = 0; x < 320; x++) s.data[y * 320 + x] = mix(hex('#1e2a50'), hex('#3a5a9a'), y / 180);
      // link cable
      for (let x = 0; x < 320; x++) { const y = 120 + Math.round(Math.sin(x * 0.05) * 3); s.pset(x, y, hex('#8a8aa8')); s.pset(x, y + 1, hex('#5a5a78')); }
      const t = this.t;
      if (this.phase === 0) { s.blit(G.pokeSprite(give.species, 'front'), 128, 40 + Math.round(Math.sin(t / 10) * 2)); G.ui.text(s, give.name, 160 - G.font.measure(give.name) / 2, 110, P.white, hex('#101830')); }
      if (this.phase === 1) { const x = (t - this.t1) * 4 - 10; G.drawBall(s, x, 121 + Math.round(Math.sin(x * 0.05) * 3) - 3, 'POKE_BALL', t); for (let k = 1; k < 6; k++) s.pblend(x - k * 5, 118, hex('#ffffff'), 0.5 - k * 0.08); }
      if (this.phase === 2) { const x = 330 - (t - this.t2) * 4; G.drawBall(s, x, 121 + Math.round(Math.sin(x * 0.05) * 3) - 3, 'POKE_BALL', -t); }
      if (this.phase === 3) { s.blit(G.pokeSprite(get.species, 'front'), 128, 40 + Math.round(Math.sin(t / 10) * 2)); G.ui.text(s, get.name, 160 - G.font.measure(get.name) / 2, 110, P.white, hex('#101830')); }
    } };
    G.engine.push(sc);
    yield* G.engine.wait(70);
    sc.phase = 1; sc.t1 = sc.t; yield* G.engine.wait(90);
    sc.phase = 2; sc.t2 = sc.t; yield* G.engine.wait(90);
    sc.phase = 3; G.cry && G.cry(get.species); yield* G.engine.wait(80);
    G.engine.pop(sc);
  };
})(window.G);
