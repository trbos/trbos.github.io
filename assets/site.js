(() => {
  'use strict';
  const BROWSER_ORIGIN = 'https://browse--wordbuilder--675vggg6lnyg.code.run';
  const POLYTRACK_URL = new URL('polytrack/', location.href).href;
  const content = document.getElementById('content');
  const titleBand = document.getElementById('title-band');
  const home = document.getElementById('home');
  const hx = document.getElementById('hx');
  const player = document.getElementById('player');
  const frameHost = document.getElementById('frame-host');
  const loading = document.getElementById('loading');
  const timeout = document.getElementById('timeout');
  const copy = document.getElementById('copy-bookmarklet');
  const show = document.getElementById('show-code');
  const codePanel = document.getElementById('code-panel');
  const code = document.getElementById('bookmarklet-code');
  const status = document.getElementById('copy-status');
  const retryBookmarklet = document.getElementById('retry-bookmarklet');
  let active = null, currentPage = null, bookmarklet, bookmarkletTask;
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
  function openPlayer() {
    clearPlayer();
    const url = new URL(BROWSER_ORIGIN + '/');
    if (browserSite) url.searchParams.set('url',browserSite);
    const frame = document.createElement('iframe'), state = {frame,timer:null};
    active = state; frame.title = 'Browser';
    frame.allow = 'autoplay; fullscreen; gamepad; clipboard-read; clipboard-write';
    frame.allowFullscreen = true; frame.referrerPolicy = 'strict-origin-when-cross-origin';
    loading.hidden = false; timeout.hidden = true; player.setAttribute('aria-busy','true');
    state.timer = setTimeout(() => {
      if (active !== state) return;
      loading.hidden = true; timeout.hidden = false; player.setAttribute('aria-busy','false');
    },45000);
    frame.src = url.href; frameHost.append(frame);
  }
  function note(message) { status.textContent = message; status.hidden = !message; }
  function loadBookmarklet() {
    if (bookmarklet !== undefined) return Promise.resolve(bookmarklet);
    if (bookmarkletTask) return bookmarkletTask;
    copy.disabled = true; show.disabled = true; retryBookmarklet.hidden = true;
    note('Loading bookmarklet…');
    bookmarkletTask = fetch('assets/hx.txt?v=ec09d146cfb8',{credentials:'omit',signal:AbortSignal.timeout(15000)})
      .then(response => {if (!response.ok) throw Error('Unavailable'); return response.text();})
      .then(text => {
        // The supplied file remains passive text. Only a user copy action uses it.
        bookmarklet = text; code.value = text; copy.disabled = false; show.disabled = false; note('');
        return text;
      }).catch(() => {
        bookmarkletTask = null; note('Could not load the bookmarklet. Retry.'); retryBookmarklet.hidden = false;
        return undefined;
      });
    return bookmarkletTask;
  }
  function revealCode(select) {
    codePanel.hidden = false; show.setAttribute('aria-expanded','true'); show.textContent = 'Hide code';
    if (select) { code.focus(); code.select(); code.setSelectionRange(0,code.value.length); }
  }
  copy.addEventListener('click',async () => {
    if (bookmarklet === undefined) return;
    try {
      if (!navigator.clipboard?.writeText) throw Error('Clipboard unavailable');
      await navigator.clipboard.writeText(bookmarklet); note('Copied');
    } catch { revealCode(true); note('Select all, then copy.'); }
  });
  show.addEventListener('click',() => {
    if (bookmarklet === undefined) return;
    if (codePanel.hidden) revealCode(false);
    else { codePanel.hidden = true; show.setAttribute('aria-expanded','false'); show.textContent = 'Show code'; }
  });
  retryBookmarklet.addEventListener('click',loadBookmarklet);

  function render() {
    const current = route();
    if (current.path === '/polytrack') { location.replace(POLYTRACK_URL); return; }
    const page = current.path === '/browser' ? 'browser' : current.path === '/hx' ? 'hx' : 'home';
    const changed = currentPage !== null && currentPage !== page;
    if (page === 'browser' && current.query.has('url')) browserSite = readSite(current.query.get('url'));
    updateBrowserLinks();
    for (const link of document.querySelectorAll('[data-nav]')) {
      if (link.dataset.nav === page) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
    }
    document.body.dataset.page = page;
    content.hidden = page === 'browser'; titleBand.hidden = page !== 'hx'; player.hidden = page !== 'browser';
    home.hidden = page !== 'home'; hx.hidden = page !== 'hx';
    document.title = page === 'home' ? 'trbos' : page === 'hx' ? 'Hx · trbos' : 'Browser';
    currentPage = page;
    if (page === 'browser') { openPlayer(); return; }
    clearPlayer();
    if (page === 'hx') loadBookmarklet();
    if (changed) { window.scrollTo(0,0); content.focus({preventScroll:true}); }
  }
  window.addEventListener('message',event => {
    if (!active || event.source !== active.frame.contentWindow || event.origin !== BROWSER_ORIGIN) return;
    if (event.data?.type === 'browser:ready') finishLoading(active);
    if (event.data?.type === 'browser:launcher') location.hash = '#/';
  });
  document.querySelector('.skip-link').addEventListener('click',event => {
    event.preventDefault();
    if (active) active.frame.focus(); else content.focus();
  });
  document.getElementById('retry').addEventListener('click',() => {if (active) openPlayer();});
  window.addEventListener('hashchange',render);
  window.addEventListener('pagehide',clearPlayer);
  window.addEventListener('pageshow',event => {if (event.persisted) render();});
  render();
})();
