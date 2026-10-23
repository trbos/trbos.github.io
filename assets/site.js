(() => {
  'use strict';
  const BROWSER_ORIGIN = 'https://browse--wordbuilder--675vggg6lnyg.code.run';
  const CLIENTS = {
    browser:{name:'Browser',url:BROWSER_ORIGIN + '/'},
    kahoot:{name:'Kahoot',url:BROWSER_ORIGIN + '/clients/kahoot/'},
    blooket:{name:'Blooket',url:BROWSER_ORIGIN + '/clients/blooket/'},
    gimkit:{name:'Gimkit',url:BROWSER_ORIGIN + '/clients/gimkit/'}
  };
  const POLYTRACK_URL = new URL('polytrack/',location.href).href;
  const content = document.getElementById('content');
  const titleBand = document.getElementById('title-band');
  const home = document.getElementById('home');
  const hx = document.getElementById('hx');
  const player = document.getElementById('player');
  const frameHost = document.getElementById('frame-host');
  const loading = document.getElementById('loading');
  const timeout = document.getElementById('timeout');
  const clientTools = document.getElementById('client-tools');
  let active = null, currentPage = null;
  let browserSite = readSite(new URLSearchParams(location.search).get('url'));

  function readSite(value) {
    if (!value) return null;
    try { const url = new URL(value); return /^https?:$/.test(url.protocol) && url.hostname ? url.href : null; }
    catch { return null; }
  }
  function route() {
    const hash = location.hash.slice(1), split = hash.indexOf('?');
    return {path:(split < 0 ? hash : hash.slice(0,split)).replace(/\/$/,''),
      query:new URLSearchParams(split < 0 ? '' : hash.slice(split+1))};
  }
  function updateBrowserLinks() {
    const query = new URLSearchParams();
    if (browserSite) query.set('url',browserSite);
    const search = query.toString();
    for (const link of document.querySelectorAll('[data-browser-link]')) link.href = '#/browser' + (search ? '?' + search : '');
  }
  function clearPlayer() {
    if (!active) return;
    clearTimeout(active.timer); active.frame.remove(); active = null;
  }
  function finishLoading(state) {
    if (active !== state) return;
    clearTimeout(state.timer); loading.hidden = true; timeout.hidden = true;
    player.setAttribute('aria-busy','false');
  }
  function openPlayer(kind) {
    clearPlayer();
    const client = CLIENTS[kind], url = new URL(client.url);
    player.setAttribute('aria-label',client.name);
    clientTools.hidden = kind === 'browser';
    if (kind === 'browser' && browserSite) url.searchParams.set('url',browserSite);
    const frame = document.createElement('iframe'), state = {frame,timer:null,kind};
    active = state; frame.title = client.name;
    loading.querySelector('p').textContent = 'Loading ' + client.name + '…';
    frame.allow = kind === 'browser' ? 'autoplay; fullscreen; gamepad; clipboard-read; clipboard-write' : 'autoplay; fullscreen';
    frame.allowFullscreen = true; frame.referrerPolicy = 'strict-origin-when-cross-origin';
    loading.hidden = false; timeout.hidden = true; player.setAttribute('aria-busy','true');
    timeout.querySelector('p').textContent = 'This is taking longer than expected.';
    state.timer = setTimeout(() => {
      if (active !== state) return;
      loading.hidden = true; timeout.hidden = false; player.setAttribute('aria-busy','false');
    },45000);
    // Game sessions and automatic menus stay in the isolated runtime. The
    // GitHub launcher only receives readiness from its own selected frame.
    if (kind !== 'browser') frame.addEventListener('load',() => {
      if (active === state) frame.contentWindow.postMessage({type:'game-client:connect',game:kind},BROWSER_ORIGIN);
    });
    frame.src = url.href; frameHost.append(frame);
  }
  function render() {
    const current = route();
    if (current.path === '/polytrack') { location.replace(POLYTRACK_URL); return; }
    const kind = current.path.slice(1);
    const page = Object.hasOwn(CLIENTS,kind) ? kind : current.path === '/hx' ? 'hx' : 'home';
    const changed = currentPage !== null && currentPage !== page;
    const embedded = Object.hasOwn(CLIENTS,page);
    if (page === 'browser' && current.query.has('url')) browserSite = readSite(current.query.get('url'));
    updateBrowserLinks();
    const selectedNav = embedded && page !== 'browser' ? 'hx' : page;
    for (const link of document.querySelectorAll('[data-nav]')) {
      if (link.dataset.nav === selectedNav) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
    }
    document.body.dataset.page = page;
    content.hidden = embedded; titleBand.hidden = page !== 'hx'; player.hidden = !embedded;
    home.hidden = page !== 'home'; hx.hidden = page !== 'hx';
    if (!embedded) clientTools.hidden = true;
    document.title = page === 'home' ? 'trbos' : page === 'hx' ? 'Hx · trbos' : CLIENTS[page].name + ' · trbos';
    currentPage = page;
    if (embedded) { openPlayer(page); return; }
    clearPlayer();
    if (changed) { window.scrollTo(0,0); content.focus({preventScroll:true}); }
  }
  window.addEventListener('message',event => {
    if (!active || event.source !== active.frame.contentWindow || event.origin !== BROWSER_ORIGIN) return;
    if (active.kind === 'browser') {
      if (event.data?.type === 'browser:ready') finishLoading(active);
      if (event.data?.type === 'browser:launcher') location.hash = '#/';
    } else if (event.data?.game === active.kind) {
      if (event.data.type === 'game-client:ready') finishLoading(active);
      if (event.data.type === 'game-client:error') {
        clearTimeout(active.timer); loading.hidden = true; timeout.hidden = false;
        timeout.querySelector('p').textContent = 'Unable to open ' + CLIENTS[active.kind].name + '.';
        player.setAttribute('aria-busy','false');
      }
    }
  });
  document.querySelector('.skip-link').addEventListener('click',event => {
    event.preventDefault();
    if (active) active.frame.focus(); else content.focus();
  });
  document.getElementById('retry').addEventListener('click',() => {if (active) openPlayer(active.kind);});
  document.getElementById('reload-client').addEventListener('click',() => {if (active) openPlayer(active.kind);});
  window.addEventListener('hashchange',render);
  window.addEventListener('pagehide',clearPlayer);
  window.addEventListener('pageshow',event => {if (event.persisted) render();});
  render();
})();
