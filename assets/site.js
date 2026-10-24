(() => {
  'use strict';
  const CONTROL_URL = 'https://bawybmihvidtmpfpyajg.supabase.co/functions/v1/site-control';
  const POLYTRACK_URL = location.origin + '/polytrack/';
  const ORIGIN_KEY = 'siteBrowserOrigin';
  const validOrigin = (value,target = 'browser') => {
    if (typeof value !== 'string') return false;
    const match = /^https:\/\/([a-z](?:[a-z0-9-]{0,6}[a-z0-9])?)--wordbuilder--675vggg6lnyg\.code\.run$/.exec(value);
    return !!match && !match[1].includes('--') && (target === 'polytrack' && match[1] === 'launch' || !['p01','launch','admin','api','www','assets','internal','root'].includes(match[1]));
  };
  let browserOrigin = 'https://browse--wordbuilder--675vggg6lnyg.code.run';
  try { const saved = localStorage.getItem(ORIGIN_KEY); if (validOrigin(saved)) browserOrigin = saved; } catch {}
  const TOOLS = {
    kahoot:{file:'assets/bookmarklets/kahoot.txt?v=2'},
    blooket:{file:'assets/bookmarklets/blooket.txt?v=2'},
    gimkit:{file:'assets/bookmarklets/gimkit.txt?v=3'}
  };
  const content = document.getElementById('content');
  const titleBand = document.getElementById('title-band');
  const home = document.getElementById('home');
  const hx = document.getElementById('hx');
  const games = document.getElementById('games');
  const gamePlayer = document.getElementById('game-player');
  const player = document.getElementById('player');
  const frameHost = document.getElementById('frame-host');
  const loading = document.getElementById('loading');
  const timeout = document.getElementById('timeout');
  const owner = document.getElementById('owner');
  const ownerLink = document.getElementById('owner-link');
  const bookmarklets = new Map(), feedbackTimers = new WeakMap();
  let active = null, currentPage = null;
  let configRequest = null;
  let configVersion = 0;
  let configRevision = 0;
  let browserSite = readSite(new URLSearchParams(location.search).get('url'));

  function setRuntimeOrigin(value) {
    if (!validOrigin(value)) return false;
    const changed = browserOrigin !== value;
    browserOrigin = value;
    try { localStorage.setItem(ORIGIN_KEY,value); } catch {}
    return changed;
  }
  function refreshRuntime() {
    if (configRequest) return configRequest;
    const version = configVersion;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(),5000);
    configRequest = fetch(CONTROL_URL,{signal:controller.signal,credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer'})
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (version !== configVersion) return false;
        if (!validOrigin(data?.runtimeOrigin) || !validOrigin(data?.polytrackOrigin,'polytrack') || data.runtimeOrigin === data.polytrackOrigin ||
          !Number.isSafeInteger(data?.configRevision) || data.configRevision < 1 || data.configRevision < configRevision) return false;
        configRevision = data.configRevision;
        const changed = setRuntimeOrigin(data?.runtimeOrigin);
        if (validOrigin(data?.runtimeOrigin)) window.dispatchEvent(new CustomEvent('site:browser-config',{detail:{runtimeOrigin:browserOrigin,configRevision}}));
        if (typeof data?.polytrackOrigin === 'string') window.dispatchEvent(new CustomEvent('site:polytrack-config',{detail:{polytrackOrigin:data.polytrackOrigin,configRevision}}));
        if (changed && active?.frame && new URL(active.frame.src).origin !== browserOrigin) openBrowser();
        return changed;
      }).catch(() => false)
      .finally(() => {clearTimeout(timer); configRequest = null;});
    return configRequest;
  }
  void refreshRuntime();
  window.SiteOwner?.mount(owner);
  window.addEventListener('site:owner',event => { ownerLink.hidden = event.detail?.owner !== true; });
  window.addEventListener('site:browser-config',event => {
    if (!validOrigin(event.detail?.runtimeOrigin) || !Number.isSafeInteger(event.detail?.configRevision) || event.detail.configRevision < 1 || event.detail.configRevision < configRevision) return;
    configRevision = event.detail.configRevision;
    configVersion++;
    if (setRuntimeOrigin(event.detail?.runtimeOrigin) && currentPage === 'browser') openBrowser();
  });
  window.addEventListener('site:polytrack-config',event => {
    const value = event.detail?.polytrackOrigin;
    if (!validOrigin(value,'polytrack') || value === browserOrigin || !Number.isSafeInteger(event.detail?.configRevision) || event.detail.configRevision < 1 || event.detail.configRevision < configRevision) return;
    configRevision = event.detail.configRevision;
    try { localStorage.setItem('sitePolyTrackBackendOrigin',value); } catch {}
  });
  window.addEventListener('site:browser-retry',event => {
    if (currentPage === 'browser' && event.detail?.runtimeOrigin === browserOrigin) openBrowser();
  });
  window.addEventListener('site:browser-error',event => {
    if (currentPage !== 'browser' || !active || active.ready || event.detail?.runtimeOrigin !== browserOrigin) return;
    if (typeof event.detail.message === 'string') timeout.querySelector('p').textContent = event.detail.message;
    loading.hidden = true; timeout.hidden = false;
  });

  function loadBookmarklet(kind) {
    if (!bookmarklets.has(kind)) {
      const request = new AbortController(), timer = setTimeout(() => request.abort(),30000);
      const result = fetch(TOOLS[kind].file,{signal:request.signal}).then(response => {
        if (!response.ok) throw Error('Copy failed');
        return response.text();
      }).finally(() => clearTimeout(timer));
      bookmarklets.set(kind,result.then(text => {
        if (!text.trimStart().startsWith('javascript:')) throw Error('Copy failed');
        return text;
      }).catch(error => {bookmarklets.delete(kind); throw error;}));
    }
    return bookmarklets.get(kind);
  }
  function copyFallback(text) {
    const field = document.createElement('textarea');
    field.value = text; field.readOnly = true; field.style.cssText = 'position:fixed;opacity:0;inset:0;width:1px;height:1px';
    document.body.append(field); field.select(); field.setSelectionRange(0,text.length);
    try { if (!document.execCommand('copy')) throw Error('Copy failed'); }
    finally {field.remove();}
  }
  async function copyBookmarklet(button) {
    const label = button.dataset.label;
    clearTimeout(feedbackTimers.get(button));
    button.disabled = true; button.setAttribute('aria-busy','true');
    try {
      const text = loadBookmarklet(button.dataset.copy);
      // Safari keeps the original tap authorization when ClipboardItem receives
      // the pending data promise before the network request has completed.
      if (navigator.clipboard?.write && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({'text/plain':text.then(value => new Blob([value],{type:'text/plain'}))})]);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(await text);
      } else copyFallback(await text);
      button.textContent = 'Copied';
    } catch { button.textContent = 'Try again'; }
    finally {
      button.disabled = false; button.removeAttribute('aria-busy');
      feedbackTimers.set(button,setTimeout(() => {button.textContent = label;},1800));
    }
  }
  for (const button of document.querySelectorAll('[data-copy]')) {
    button.dataset.label = button.textContent;
    button.addEventListener('click',() => copyBookmarklet(button));
  }
  function readSite(value) {
    if (!value) return null;
    try {const url = new URL(value); return /^https?:$/.test(url.protocol) && url.hostname ? url.href : null;}
    catch {return null;}
  }
  function route() {
    const hash = location.hash.slice(1), split = hash.indexOf('?');
    return {path:(split < 0 ? hash : hash.slice(0,split)).replace(/\/$/,''),
      query:new URLSearchParams(split < 0 ? '' : hash.slice(split+1))};
  }
  function updateBrowserLinks() {
    const query = new URLSearchParams(); if (browserSite) query.set('url',browserSite);
    const search = query.toString();
    for (const link of document.querySelectorAll('[data-browser-link]')) link.href = '#/browser' + (search ? '?' + search : '');
  }
  function openOwnerPolyTrack(url = POLYTRACK_URL) {
    if (!window.SiteOwner?.keepPolyTrackControl?.()) return false;
    // Only this tab retains the private owner session. The game gets no opener or auth data.
    window.open(url,'_blank','noopener,noreferrer');
    location.hash = '#/owner';
    return true;
  }
  document.addEventListener('click',event => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href]');
    if (!link) return;
    const url = new URL(link.href,location.href);
    if (url.origin === location.origin && url.pathname === '/polytrack/' && openOwnerPolyTrack(url.href)) event.preventDefault();
  });
  function clearPlayer() {if (active) {clearTimeout(active.timer); active.frame?.remove(); active = null;}}
  function finishLoading(state) {
    if (active !== state) return;
    state.ready = true;
    clearTimeout(state.timer); loading.hidden = true; timeout.hidden = true; player.setAttribute('aria-busy','false');
    window.SiteOwner?.browserReady?.(state.origin);
  }
  async function openBrowser() {
    clearPlayer();
    const state = {frame:null,timer:null}; active = state;
    timeout.querySelector('p').textContent = 'This is taking longer than expected.';
    loading.hidden = false; timeout.hidden = true; player.setAttribute('aria-busy','true');
    state.timer = setTimeout(() => {
      if (active !== state) return;
      loading.hidden = true; timeout.hidden = false; player.setAttribute('aria-busy','false');
      Promise.resolve(window.SiteOwner?.browserFailed?.(state.origin)).catch(() => {});
    },45000);
    let waitTimer;
    await Promise.race([refreshRuntime(),new Promise(resolve => {waitTimer = setTimeout(resolve,1800);})]);
    clearTimeout(waitTimer);
    if (active !== state) return;
    const url = new URL(browserOrigin + '/'); if (browserSite) url.searchParams.set('url',browserSite);
    state.origin = browserOrigin;
    const frame = document.createElement('iframe'); state.frame = frame;
    frame.title = 'Browser'; frame.allow = 'autoplay; fullscreen; gamepad; clipboard-read; clipboard-write';
    frame.allowFullscreen = true; frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.src = url.href; frameHost.append(frame);
  }
  function render() {
    const current = route();
    if (current.path === '/polytrack') {if (!openOwnerPolyTrack()) location.replace(POLYTRACK_URL);return;}
    if (['/kahoot','/blooket','/gimkit'].includes(current.path)) {location.replace('#/hx'); return;}
    const game = current.path.startsWith('/games/') ? window.SiteGames?.get(current.path.slice(7)) : null;
    if (current.path.startsWith('/games/') && !game) {location.replace('#/games'); return;}
    const page = game ? 'game' : current.path === '/games' ? 'games' : current.path === '/browser' ? 'browser' : current.path === '/hx' ? 'hx' : current.path === '/owner' ? 'owner' : 'home';
    const changed = currentPage !== null && currentPage !== page;
    if (page === 'browser' && current.query.has('url')) browserSite = readSite(current.query.get('url'));
    updateBrowserLinks();
    for (const link of document.querySelectorAll('[data-nav]')) {
      if (link.dataset.nav === page || page === 'game' && link.dataset.nav === 'games') link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
    }
    document.body.dataset.page = page; content.hidden = page === 'browser' || page === 'game'; player.hidden = page !== 'browser'; gamePlayer.hidden = page !== 'game';
    titleBand.hidden = page !== 'hx' && page !== 'games'; home.hidden = page !== 'home'; hx.hidden = page !== 'hx'; games.hidden = page !== 'games';
    document.getElementById('page-title').textContent = page === 'games' ? 'Games' : 'Hx';
    window.SiteOwner?.onRoute(page);
    document.title = game ? game.name + ' · trbos' : page === 'games' ? 'Games · trbos' : page === 'home' ? 'trbos' : page === 'hx' ? 'Hx · trbos' : 'Browser · trbos'; currentPage = page;
    if (game) {clearPlayer(); window.SiteGames.open(game.id); return;}
    window.SiteGames?.close();
    if (page === 'browser') {openBrowser(); return;}
    clearPlayer(); if (changed) {window.scrollTo(0,0); content.focus({preventScroll:true});}
  }
  window.addEventListener('message',event => {
    if (!active?.frame || event.source !== active.frame.contentWindow || event.origin !== browserOrigin) return;
    if (event.data?.type === 'browser:ready') finishLoading(active);
    if (event.data?.type === 'browser:launcher') location.hash = '#/';
  });
  document.querySelector('.skip-link').addEventListener('click',event => {event.preventDefault(); if (active) active.frame.focus(); else if (!window.SiteGames?.focus()) content.focus();});
  document.getElementById('retry').addEventListener('click',() => {if (active) openBrowser();});
  window.addEventListener('hashchange',render);
  window.addEventListener('pagehide',clearPlayer);
  window.addEventListener('pageshow',event => {if (event.persisted) render();});
  const checkConfig = () => {if (currentPage === 'browser' && document.visibilityState === 'visible') void refreshRuntime();};
  document.addEventListener('visibilitychange',checkConfig);
  window.addEventListener('online',checkConfig);
  setInterval(checkConfig,60000);
  render();
})();
