(() => {
  'use strict';
  const games = Object.freeze([
    Object.freeze({"id":"hextris","name":"Hextris","url":"games/hextris/","trustedPlayer":true}),
    Object.freeze({"id":"geometry-dash","name":"Geometry Dash","url":"games/geometry-dash/","trustedPlayer":true}),
    Object.freeze({"id":"jambling","name":"Jambling","url":"https://snoozingmax.github.io/Jambling/","external":true}),
    Object.freeze({"id":"archers","name":"Ragdoll Archers","url":"games/archers/?v=gamepad-12","trustedPlayer":true}),
    Object.freeze({"id":"crossy-road","name":"Crossy Road","url":"games/crossy-road/","trustedPlayer":true}),
    Object.freeze({"id":"eaglercraft","name":"Eaglercraft","url":"games/eaglercraft/","trustedPlayer":true,"startup":"heavy"})
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

  function finish(state,failed=false) {
    if(active!==state)return;
    clearTimeout(state.timer);loading.hidden=true;error.hidden=!failed;
    player.setAttribute('aria-busy','false');
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
    error.querySelector('p').textContent='Unable to load game.';
    frame.title = game.name;
    frame.allow = 'autoplay; fullscreen; '+(game.id==='archers'?'gamepad *':'gamepad')+'; clipboard-write';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'no-referrer';
    if(game.external)frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-pointer-lock');
    else if(!game.trustedPlayer)frame.setAttribute('sandbox','allow-scripts allow-pointer-lock');
    frame.addEventListener('load',() => {
      if (active !== state) return;
      if(game.trustedPlayer){loading.hidden=true;return;}
      finish(state);
    });
    state.timer = setTimeout(() => {
      if (active !== state) return;
      loading.hidden = true; error.hidden = false;
      player.setAttribute('aria-busy','false');
    },game.startup==='heavy'?120000:60000);
    frame.src = game.url;
    frameHost.append(frame);
    return true;
  }

  document.getElementById('game-retry').addEventListener('click',() => {if (active) open(active.game.id);});
  window.addEventListener('message',event=>{
    const state=active;
    if(!state?.game.trustedPlayer||event.source!==state.frame.contentWindow||event.origin!==location.origin||event.data?.id!==state.game.id)return;
    if(event.data.type==='game:progress'){clearTimeout(state.timer);state.timer=setTimeout(()=>finish(state,true),state.game.startup==='heavy'?120000:60000);}
    else if(event.data.type==='game:ready')finish(state);
    else if(event.data.type==='game:error'){
      if(typeof event.data.reason==='string'&&event.data.reason.length<=160)error.querySelector('p').textContent=event.data.reason;
      finish(state,true);
    }
  });
  window.addEventListener('pagehide',close);
  window.SiteGames = Object.freeze({get,open,close,focus:() => {if (!active) return false;active.frame.focus();return true;}});
})();
