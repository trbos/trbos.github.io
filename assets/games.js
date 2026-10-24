(() => {
  'use strict';
  const games = Object.freeze([
    Object.freeze({id:'geometry-dash',name:'Geometry Dash',url:'https://web-dashers.github.io/',external:true}),
    Object.freeze({id:'jambling',name:'Jambling',url:'https://snoozingmax.github.io/Jambling/',external:true})
  ]);
  const grid = document.getElementById('games');
  const player = document.getElementById('game-player');
  const frameHost = document.getElementById('game-frame-host');
  const loading = document.getElementById('game-loading');
  const error = document.getElementById('game-error');
  let active = null;

  for (const game of games) {
    const link = document.createElement('a');
    link.href = '#/games/' + game.id;
    link.className = 'game-card';
    link.textContent = game.name;
    grid.append(link);
  }

  function get(id) {return games.find(game => game.id === id) || null;}

  function close() {
    if (!active) return;
    clearTimeout(active.timer);
    active.frame.remove();
    active = null;
  }

  function open(id) {
    const game = get(id);
    if (!game) return false;
    close();
    const frame = document.createElement('iframe');
    const state = {game,frame,timer:null}; active = state;
    player.setAttribute('aria-label',game.name);
    player.setAttribute('aria-busy','true');
    loading.hidden = false; error.hidden = true;
    frame.title = game.name;
    frame.allow = 'autoplay; fullscreen; gamepad; clipboard-write';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'no-referrer';
    frame.setAttribute('sandbox',game.external ? 'allow-scripts allow-same-origin allow-forms allow-pointer-lock' : 'allow-scripts allow-pointer-lock');
    frame.addEventListener('load',() => {
      if (active !== state) return;
      clearTimeout(state.timer);
      loading.hidden = true; error.hidden = true;
      player.setAttribute('aria-busy','false');
    });
    state.timer = setTimeout(() => {
      if (active !== state) return;
      loading.hidden = true; error.hidden = false;
      player.setAttribute('aria-busy','false');
    },30000);
    frame.src = game.url;
    frameHost.append(frame);
    return true;
  }

  document.getElementById('game-retry').addEventListener('click',() => {if (active) open(active.game.id);});
  window.addEventListener('pagehide',close);
  window.SiteGames = Object.freeze({get,open,close,focus:() => {if (!active) return false;active.frame.focus();return true;}});
})();
