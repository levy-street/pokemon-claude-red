// Pallet Town, Oak's Lab, Route 1, Viridian City and Route 22 story events.
(function (G) {
  'use strict';
  const S = G.S;
  const STARTERS = { OAKSLAB_CHARMANDER_POKE_BALL: 'CHARMANDER', OAKSLAB_SQUIRTLE_POKE_BALL: 'SQUIRTLE', OAKSLAB_BULBASAUR_POKE_BALL: 'BULBASAUR' };
  // rival picks the starter that beats yours; value = [rival ball object, rival species, party offset]
  const RIVAL_PICK = { CHARMANDER: ['OAKSLAB_SQUIRTLE_POKE_BALL', 'SQUIRTLE', 1], SQUIRTLE: ['OAKSLAB_BULBASAUR_POKE_BALL', 'BULBASAUR', 2], BULBASAUR: ['OAKSLAB_CHARMANDER_POKE_BALL', 'CHARMANDER', 3] };
  G.rivalParty = base => base + (RIVAL_PICK[G.state.starter] ? RIVAL_PICK[G.state.starter][2] : 1) - 1;

  // ---------------- Red's house ----------------
  G.defMapScript('RedsHouse1F', {
    talk: {
      REDSHOUSE1F_MOM: function* (a) {
        if (!G.state.party.length) { yield* S.say('RedsHouse1FMomWakeUpText'); return; }
        yield* S.say('RedsHouse1FMomYouShouldRestText');
        yield* G.fadeOut(12); G.music && G.music('heal', true);
        for (const m of G.state.party) m.healFull();
        yield* S.wait(60); yield* G.fadeIn(12);
        G.music && G.music(G.mapMusic(G.ow.map));
        yield* S.say('RedsHouse1FMomLookingGreatText');
      },
    },
    sign: {
      TEXT_REDSHOUSE1F_TV: function* () {
        if (S.player().dir === 'up') yield* S.say('RedsHouse1FTVStandByMeMovieText');
        else yield* S.say('RedsHouse1FTVWrongSideText');
      },
    },
  });

  // ---------------- Pallet Town ----------------
  G.defMapScript('PalletTown', {
    step(x, y) {
      if (y !== 1 || S.flag('EVENT_FOLLOWED_OAK_INTO_LAB')) return null;
      return (function* () {
        S.music('oak');
        S.player().dir = 'down';
        yield* S.say('PalletTownOakHeyWaitDontGoOutText');
        yield* S.emote(S.player(), '!', 30);
        const oak = S.show('PALLETTOWN_OAK');
        // Oak walks to just below the player
        const p = S.player();
        yield* S.move(oak, S.pathTo(oak, p.x, p.y + 1));
        oak.dir = 'up'; p.dir = 'down';
        yield* S.say('PalletTownOakItsUnsafeText');
        // follow Oak to the lab: Oak walks round to the lab door, the player one step behind him
        const door = { x: 12, y: 11 };
        const route = S.pathTo(oak, door.x, door.y + 1);
        const ppath = 'D' + route.slice(0, -1);
        for (let i = 0; i < route.length; i++) yield* S.moveTogether([[oak, route[i]], [p, ppath[i]]]);
        // Oak goes in first, then the player steps up to the door behind him
        yield* S.move(oak, 'U');
        S.hide('PALLETTOWN_OAK');
        S.set('EVENT_FOLLOWED_OAK_INTO_LAB');
        yield* S.movePlayer(S.pathTo(p, door.x, door.y + 1) + 'U');
        S.set('EVENT_OAK_WALKING_INTO_LAB');
        yield* S.warp('OaksLab', 5, 11, 'up');
      })();
    },
    talk: {
      PALLETTOWN_OAK: function* () { yield* S.say('PalletTownOakItsUnsafeText'); },
    },
  });

  // ---------------- Blue's house ----------------
  G.defMapScript('BluesHouse', {
    enter() { if (S.flag('EVENT_GOT_TOWN_MAP')) S.hide('BLUESHOUSE_TOWN_MAP'); if (S.flag('EVENT_GOT_TOWN_MAP') && S.flag('EVENT_GOT_POKEBALLS_FROM_OAK')) { S.hide('BLUESHOUSE_DAISY1'); S.show('BLUESHOUSE_DAISY2'); } return null; },
    talk: {
      BLUESHOUSE_DAISY1: function* () {
        if (!S.flag('EVENT_GOT_POKEDEX')) { yield* S.say('BluesHouseDaisyRivalAtLabText'); return; }
        if (!S.flag('EVENT_GOT_TOWN_MAP')) {
          yield* S.say('BluesHouseDaisyOfferMapText');
          if (yield* S.give('TOWN_MAP', 1, S.t('GotMapText') !== '...' ? S.t('GotMapText') : undefined)) { S.set('EVENT_GOT_TOWN_MAP'); S.hide('BLUESHOUSE_TOWN_MAP'); }
          return;
        }
        yield* S.say('BluesHouseDaisyUseMapText');
      },
      BLUESHOUSE_DAISY2: function* () { yield* S.say('BluesHouseDaisyWalkingText'); },
      BLUESHOUSE_TOWN_MAP: function* () { yield* S.say('BluesHouseTownMapText'); },
    },
  });

  // ---------------- Oak's Lab ----------------
  function* rivalLeaves(rival) {
    const p = S.player();
    const path = rival.x === p.x ? (rival.x < 5 ? 'R' : 'L') + 'DDDDDD' : 'DDDDDD';
    yield* S.move(rival, path.slice(0, 1) === 'D' ? 'DDDDDDD' : path);
    S.hide('OAKSLAB_RIVAL');
  }
  G.defMapScript('OaksLab', {
    enter() {
      // a starter pick that crashed part-way (the old empty-box bug) hid its ball without handing the POKéMON over:
      // put the balls back so the player can choose again instead of being stuck in the lab
      if (S.flag('EVENT_OAK_ASKED_TO_CHOOSE_MON') && !S.flag('EVENT_GOT_STARTER') && !G.state.party.length) for (const id in STARTERS) S.show(id);
      if (S.flag('EVENT_OAK_WALKING_INTO_LAB')) {
        return (function* () {
          S.clear('EVENT_OAK_WALKING_INTO_LAB');
          // Oak walks from the door up to his desk, the player follows him in
          const oak = S.show('OAKSLAB_OAK2', null, [5, 10]);
          yield* S.move(oak, 'UUUUUUUU');
          S.hide('OAKSLAB_OAK2'); S.show('OAKSLAB_OAK1');
          yield* S.movePlayer('UUUUUUU');
          S.set('EVENT_FOLLOWED_OAK_INTO_LAB_2');
          yield* S.say('OaksLabRivalFedUpWithWaitingText');
          yield* S.say('OaksLabOakChooseMonText');
          yield* S.say('OaksLabRivalWhatAboutMeText');
          yield* S.say('OaksLabOakBePatientText');
          S.set('EVENT_OAK_ASKED_TO_CHOOSE_MON');
          S.music('oak_lab');
        })();
      }
      if (!S.flag('EVENT_FOLLOWED_OAK_INTO_LAB_2')) return null;
      // Oak's position: at the desk once he's back in the lab
      if (S.isShown('OAKSLAB_OAK1') === false && S.flag('EVENT_FOLLOWED_OAK_INTO_LAB_2')) S.show('OAKSLAB_OAK1');
      if (S.flag('EVENT_GOT_POKEDEX')) { S.hide('OAKSLAB_POKEDEX1'); S.hide('OAKSLAB_POKEDEX2'); }
      return null;
    },
    step(x, y) {
      // Don't leave before choosing
      if (S.flag('EVENT_OAK_ASKED_TO_CHOOSE_MON') && !S.flag('EVENT_GOT_STARTER') && y === 6) {
        return (function* () {
          const oak = S.actor('OAKSLAB_OAK1'); if (oak) oak.dir = 'down';
          yield* S.say('OaksLabOakDontGoAwayYetText');
          yield* S.movePlayer('U');
        })();
      }
      // Rival challenges after the starters are chosen
      if (S.flag('EVENT_GOT_STARTER') && !S.flag('EVENT_BATTLED_RIVAL_IN_OAKS_LAB') && y === 6) {
        return (function* () {
          const rival = S.actor('OAKSLAB_RIVAL'), p = S.player();
          S.music('rival');
          yield* S.say('OaksLabRivalIllTakeYouOnText');
          yield* S.move(rival, S.pathTo(rival, p.x, p.y - 1));
          rival.dir = 'down'; p.dir = 'up';
          const r = yield* S.battle('RIVAL1', RIVAL_PICK[G.state.starter][2], { noBlackout: true, winText: G.fmt(S.t('OaksLabRivalIPickedTheWrongPokemonText')), loseText: G.fmt(S.t('OaksLabRivalAmIGreatOrWhatText')) });
          for (const m of G.state.party) m.healFull();
          S.set('EVENT_BATTLED_RIVAL_IN_OAKS_LAB');
          S.music('rival');
          yield* S.say('OaksLabRivalSmellYouLaterText');
          yield* rivalLeaves(rival);
          S.music('oak_lab');
        })();
      }
      return null;
    },
    talk: {
      OAKSLAB_CHARMANDER_POKE_BALL: pickBall, OAKSLAB_SQUIRTLE_POKE_BALL: pickBall, OAKSLAB_BULBASAUR_POKE_BALL: pickBall,
      OAKSLAB_OAK1: function* (a) {
        const S0 = G.state;
        if (G.bag.has('OAKS_PARCEL')) {
          yield* S.say('OaksLabOak1DeliverParcelText');
          G.bag.remove('OAKS_PARCEL', 1);
          yield* S.say('OaksLabOak1ParcelThanksText');
          S.set('EVENT_OAK_GOT_PARCEL');
          // rival arrives
          const rival = S.show('OAKSLAB_RIVAL', null, [4, 11]);
          S.music('rival');
          yield* S.say('OaksLabRivalGrampsText');
          yield* S.move(rival, 'UUUUUUUU');
          rival.dir = 'up';
          yield* S.say('OaksLabRivalWhatDidYouCallMeForText');
          yield* S.say('OaksLabOakIHaveARequestText');
          yield* S.say('OaksLabOakMyInventionPokedexText');
          S.hide('OAKSLAB_POKEDEX1'); S.hide('OAKSLAB_POKEDEX2');
          G.sfx && G.sfx('get_key');
          yield* S.say('OaksLabOakGotPokedexText');
          S.set('EVENT_GOT_POKEDEX');
          yield* S.say('OaksLabOakThatWasMyDreamText');
          yield* S.say('OaksLabRivalLeaveItAllToMeText');
          yield* S.move(rival, 'DDDDDDDD');
          S.hide('OAKSLAB_RIVAL');
          S.set('EVENT_1ST_ROUTE22_RIVAL_BATTLE'); S.set('EVENT_ROUTE22_RIVAL_WANTS_BATTLE');
          S.show('ROUTE22_RIVAL1', 'Route22');
          S.music('oak_lab');
          return;
        }
        if (S.flag('EVENT_GOT_POKEDEX')) {
          if (!S.flag('EVENT_GOT_POKEBALLS_FROM_OAK') && !G.bag.has('POKE_BALL') && S.flag('EVENT_BEAT_ROUTE22_RIVAL_1ST_BATTLE')) {
            yield* S.say('OaksLabOak1PokemonAroundTheWorldText');
            S.set('EVENT_GOT_POKEBALLS_FROM_OAK');
            yield* S.give('POKE_BALL', 5, S.t('OaksLabOak1ReceivedPokeballsText'));
            yield* S.say('OaksLabGivePokeballsExplanationText');
            return;
          }
          yield* S.say(Math.random() < 0.5 ? 'OaksLabOak1ComeSeeMeSometimesText' : 'OaksLabOak1HowIsYourPokedexComingText');
          if (G.oakRating) yield* G.oakRating(false);
          return;
        }
        if (!S.flag('EVENT_GOT_STARTER')) { yield* S.say('OaksLabOak1WhichPokemonDoYouWantText'); return; }
        yield* S.say(S.flag('EVENT_BATTLED_RIVAL_IN_OAKS_LAB') ? 'OaksLabOak1RaiseYourYoungPokemonText' : 'OaksLabOak1YourPokemonCanFightText');
      },
      OAKSLAB_RIVAL: function* () {
        if (!S.flag('EVENT_FOLLOWED_OAK_INTO_LAB_2')) { yield* S.say('OaksLabRivalGrampsIsntAroundText'); return; }
        if (!S.flag('EVENT_GOT_STARTER')) { yield* S.say('OaksLabRivalGoAheadAndChooseText'); return; }
        yield* S.say('OaksLabRivalMyPokemonLooksStrongerText');
      },
      OAKSLAB_POKEDEX1: function* () { yield* S.say('OaksLabPokedexText'); },
      OAKSLAB_POKEDEX2: function* () { yield* S.say('OaksLabPokedexText'); },
    },
  });
  function* pickBall(ball) {
    const id = ball.obj.id, sp = STARTERS[id];
    if (!S.flag('EVENT_OAK_ASKED_TO_CHOOSE_MON')) { yield* S.say('OaksLabThoseArePokeBallsText'); return; }
    if (S.flag('EVENT_GOT_STARTER')) { yield* S.say('OaksLabLastMonText'); return; }
    // show the Pokémon inside
    const pic = { t: 0, draw(s) { this.t++; G.ui.frame(s, 110, 20, 100, 90); s.blit(G.pokeSprite(sp, 'front'), 128, 32); return !this.done; } };
    G.ow.fx.push({ draw: (s) => pic.draw(s) });
    G.cry && G.cry(sp);
    const q = { CHARMANDER: 'OaksLabYouWantCharmanderText', SQUIRTLE: 'OaksLabYouWantSquirtleText', BULBASAUR: 'OaksLabYouWantBulbasaurText' }[sp];
    const yes = yield* S.ask(q);
    pic.done = true;
    if (!yes) return;
    S.hide(id);
    G.state.starter = sp;
    yield* S.say('OaksLabMonEnergeticText');
    const m = new G.Mon(sp, 5);
    G.sfx && G.sfx('get_mon');
    G.textVars.wcd6d = sp; G.textVars.wStringBuffer = G.speciesName(sp);
    yield* S.say(G.state.name + ' received a ' + G.speciesName(sp) + '!');
    G.dexCaught(sp);
    yield* G.receiveMon(m, null);
    S.set('EVENT_GOT_STARTER');
    // rival takes his
    const [rb, rsp] = RIVAL_PICK[sp];
    const rival = S.actor('OAKSLAB_RIVAL'), ballA = S.actor(rb);
    yield* S.move(rival, S.pathTo(rival, ballA.x, ballA.y + 1));
    rival.dir = 'up';
    yield* S.say('OaksLabRivalIllTakeThisOneText');
    S.hide(rb);
    G.textVars.wRivalStarter = G.speciesName(rsp);
    G.sfx && G.sfx('get_mon');
    yield* S.say(G.fmt(S.t('OaksLabRivalReceivedMonText')).replace(/\{\w+\}/g, G.speciesName(rsp)) || (G.state.rival + ' received a ' + G.speciesName(rsp) + '!'));
  }

  // ---------------- Route 1 ----------------
  G.defMapScript('Route1', {
    talk: {
      ROUTE1_YOUNGSTER1: function* () {
        if (S.flag('EVENT_GOT_POTION_SAMPLE')) { yield* S.say('Route1Youngster1AlsoGotPokeballsText'); return; }
        yield* S.say('Route1Youngster1MartSampleText');
        if (yield* S.give('POTION', 1, S.t('Route1Youngster1GotPotionText'))) { S.set('EVENT_GOT_POTION_SAMPLE'); yield* S.say('Route1Youngster1AlsoGotPokeballsText'); }
        else yield* S.say('Route1Youngster1NoRoomText');
      },
    },
  });

  // ---------------- Viridian City ----------------
  G.defMapScript('ViridianCity', {
    enter() { if (S.flag('EVENT_GOT_POKEDEX')) { S.hide('VIRIDIANCITY_OLD_MAN_SLEEPY'); S.show('VIRIDIANCITY_OLD_MAN'); } return null; },
    step(x, y) {
      if (!S.flag('EVENT_GOT_POKEDEX') && x === 19 && y === 9) return (function* () { yield* S.say('ViridianCityOldManSleepyPrivatePropertyText'); yield* S.movePlayer('D'); })();
      if (G.state.badges.length < 7 && x === 32 && y === 8) return (function* () { yield* S.say('ViridianCityGymLockedText'); yield* S.movePlayer('D'); })();
      return null;
    },
    talk: {
      VIRIDIANCITY_GAMBLER1: function* () { yield* S.say(G.state.badges.length >= 7 ? 'ViridianCityGambler1GymLeaderReturnedText' : 'ViridianCityGambler1GymAlwaysClosedText'); },
      VIRIDIANCITY_YOUNGSTER2: function* () {
        if (yield* S.ask('ViridianCityYoungster2YouWantToKnowAboutText')) yield* S.say('ViridianCityYoungster2CaterpieAndWeedleDescriptionText');
        else yield* S.say('ViridianCityYoungster2OkThenText');
      },
      VIRIDIANCITY_GIRL: function* () { yield* S.say(S.flag('EVENT_GOT_POKEDEX') ? 'ViridianCityGirlWhenIGoShopText' : 'ViridianCityGirlHasntHadHisCoffeeYetText'); },
      VIRIDIANCITY_OLD_MAN_SLEEPY: function* () { yield* S.say('ViridianCityOldManSleepyPrivatePropertyText'); },
      VIRIDIANCITY_FISHER: function* () {
        if (S.flag('EVENT_GOT_TM42')) { yield* S.say('ViridianCityFisherTM42ExplanationText'); return; }
        yield* S.say('ViridianCityFisherYouCanHaveThisText');
        if (yield* S.give('TM_DREAM_EATER', 1, S.t('ViridianCityFisherReceivedTM42Text'))) S.set('EVENT_GOT_TM42');
        else yield* S.say('ViridianCityFisherTM42NoRoomText');
      },
      VIRIDIANCITY_OLD_MAN: function* () {
        yield* S.say('ViridianCityOldManHadMyCoffeeNowText');
        const hurry = yield* S.ask('ViridianCityOldManKnowHowToCatchPokemonText');
        if (hurry) { yield* S.say('ViridianCityOldManTimeIsMoneyText'); return; }
        // catching demonstration
        yield* G.catchDemo();
        yield* S.say('ViridianCityOldManYouNeedToWeakenTheTargetText');
      },
    },
    sign: { TEXT_VIRIDIANCITY_GYM_SIGN: function* () { yield* S.say('ViridianCityGymSignText'); } },
  });
  // Old man's catching tutorial: a scripted battle
  G.catchDemo = function* () {
    const saved = { party: G.state.party, name: G.state.name, bag: G.state.bag };
    G.state.party = [new G.Mon('WEEDLE', 5)]; // placeholder "player" mon is never shown
    G.state.name = 'OLD MAN';
    G.state.bag = [{ id: 'POKE_BALL', n: 50 }];
    const b = new G.Battle({ type: 'wild', enemyParty: [new G.Mon('WEEDLE', 5, { ot: 'WILD' })] });
    const sc = new G.BattleScene({ bg: 'grass' });
    sc.demo = true;
    yield* G.battleTransition('wild');
    G.engine.push(sc);
    b.ui = sc; sc.b = b; sc.disp.e = b.mon(b.e).hp; sc.disp.p = 1;
    sc.playerPic = G.oldManBackPic ? G.oldManBackPic() : G.trainerBackPic(); sc.playerPicX = 84; sc.show.e = true; sc.boxes.e = true; sc.platformSlide = 1;
    yield* sc.msg('Wild WEEDLE appeared!');
    yield* sc.msg('OLD MAN used POKé BALL!');
    yield* sc.ballThrow('POKE_BALL', 3, true);
    yield* sc.msg('All right! WEEDLE was caught!');
    yield* G.fadeOut(12);
    G.engine.pop(sc);
    Object.assign(G.state, saved);
    if (G.glitch) G.glitch.oldManBackup(); // his name backup lands on wGrassMons: the MissingNo. setup (src/game/glitches.js)
    yield* G.fadeIn(12);
  };

  G.defMapScript('ViridianMart', {
    enter() {
      if (S.flag('EVENT_OAK_GOT_PARCEL') || G.bag.has('OAKS_PARCEL')) return null;
      return (function* () {
        yield* S.wait(10);
        yield* S.say('ViridianMartClerkYouCameFromPalletTownText');
        yield* S.movePlayer('UUL');
        S.player().dir = 'left';
        yield* S.say('ViridianMartClerkParcelQuestText');
        G.bag.add('OAKS_PARCEL', 1);
        S.set('EVENT_GOT_OAKS_PARCEL');
      })();
    },
    talk: {
      VIRIDIANMART_CLERK: function* (a) {
        if (!S.flag('EVENT_OAK_GOT_PARCEL')) { yield* S.say('ViridianMartClerkSayHiToOakText'); return; }
        yield* G.mart(G.DATA.marts.ViridianMartClerkText);
      },
    },
  });

  // ---------------- Route 22 rival ----------------
  G.defMapScript('Route22', {
    step(x, y) {
      if (x !== 29 || (y !== 4 && y !== 5)) return null;
      // the first battle only while EVENT_1ST_ROUTE22_RIVAL_BATTLE is set: the BOULDERBADGE clears it, so a player who
      // skipped him and comes back with 8 badges meets only the second rival (Route22DefaultScript checks it the same way)
      const first = S.flag('EVENT_1ST_ROUTE22_RIVAL_BATTLE') && S.flag('EVENT_ROUTE22_RIVAL_WANTS_BATTLE') && !S.flag('EVENT_BEAT_ROUTE22_RIVAL_1ST_BATTLE');
      const second = S.flag('EVENT_2ND_ROUTE22_RIVAL_BATTLE') && !S.flag('EVENT_BEAT_ROUTE22_RIVAL_2ND_BATTLE');
      if (!first && !second) return null;
      return (function* () {
        const id = first ? 'ROUTE22_RIVAL1' : 'ROUTE22_RIVAL2';
        const rival = S.show(id);
        const p = S.player();
        S.music('rival');
        yield* S.emote(p, '!', 30);
        yield* S.move(rival, S.pathTo(rival, p.x - 1, p.y));
        rival.dir = 'right'; p.dir = 'left';
        yield* S.say(first ? 'Route22RivalBeforeBattleText1' : 'Route22RivalBeforeBattleText2');
        // only the Oak's Lab battle spares the player a blackout; losing here blacks out and the rival waits again
        const r = yield* S.battle(first ? 'RIVAL1' : 'RIVAL2', first ? G.rivalParty(4) : G.rivalParty(10), { winText: G.fmt(S.t(first ? 'Route22Rival1DefeatedText' : 'Route22Rival2DefeatedText')), loseText: G.fmt(S.t(first ? 'Route22Rival1VictoryText' : 'Route22Rival2VictoryText')) });
        if (r === 'lose') { S.hide(id, 'Route22'); return; }
        yield* S.say(first ? 'Route22RivalAfterBattleText1' : 'Route22RivalAfterBattleText2');
        // RIVAL1 heads past the player into the open ground to the south-east; RIVAL2 walks back west (Red's exits)
        yield* S.move(rival, first ? S.pathTo(rival, 30, 10) : 'LLLLLLLL');
        S.hide(id);
        S.set(first ? 'EVENT_BEAT_ROUTE22_RIVAL_1ST_BATTLE' : 'EVENT_BEAT_ROUTE22_RIVAL_2ND_BATTLE');
        S.music(G.mapMusic(G.ow.map));
      })();
    },
  });
})(window.G);
