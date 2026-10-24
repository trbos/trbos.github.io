(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else if (!root.polytrackOldEntryRedirecting) { root.PolyTrackBackend = factory(root); root.PolyTrackBackendReady = root.PolyTrackBackend.start(); }
})(globalThis, function createPolyTrackBackend(env, options) {
  'use strict';
  options = options || {};
  const CONTROL = 'https://bawybmihvidtmpfpyajg.supabase.co/functions/v1/site-control';
  const DEFAULT = 'https://launch--wordbuilder--675vggg6lnyg.code.run';
  const CACHE = 'sitePolyTrackBackendOrigin', REVISION = 'sitePolyTrackBackendRevision';
  const PREFIX = '/polytrack/polytrack-api/';
  const SUFFIX = '--wordbuilder--675vggg6lnyg.code.run';
  const later = options.setTimeout || env.setTimeout.bind(env);
  const cancel = options.clearTimeout || env.clearTimeout.bind(env);
  const rawFetch = env.fetch.bind(env);
  const browsers = new Set(['https://browse' + SUFFIX, 'https://browser' + SUFFIX]);
  const known = new Set([DEFAULT]);
  let promise, state, revision = -1, generation = 0, active, refreshTimer, stopped = false, installed = false, channel;
  let legacyApplied = false, lastEvent = -Infinity, confirmedBrowser;
  const cleanups = [];
  const family = value => typeof value === 'string' && /^https:\/\/[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?--wordbuilder--675vggg6lnyg\.code\.run$/.test(value);
  function validOrigin(value) {
    if (!family(value) || browsers.has(value)) return false;
    return !['p01', 'browse', 'browser'].includes(value.slice(8, -SUFFIX.length));
  }
  try { const browser = env.localStorage.getItem('siteBrowserOrigin'); if (family(browser)) browsers.add(browser); } catch {}
  function cached() {
    try {
      try {
        const saved = JSON.parse(env.localStorage.getItem(REVISION));
        if (validOrigin(saved?.origin) && Number.isSafeInteger(saved.revision) && saved.revision >= 0) { revision = saved.revision; return saved.origin; }
      } catch {}
      const value = env.localStorage.getItem(CACHE);
      if (!validOrigin(value)) return null;
      return value;
    } catch { return null; }
  }
  function remap(value, websocket = false) {
    if (!state) return value;
    try {
      const url = new URL(value, env.location.href);
      if (url.username || url.password || url.protocol !== (websocket ? 'wss:' : 'https:') || !url.pathname.startsWith(PREFIX)) return value;
      const origin = websocket ? url.origin.replace(/^wss:/, 'https:') : url.origin;
      if (!known.has(origin) || browsers.has(origin)) return value;
      return state.origin.replace(/^https:/, websocket ? 'wss:' : 'https:') + url.pathname + url.search + url.hash;
    } catch { return value; }
  }
  function apply(origin, source) {
    known.add(origin);
    env.polytrackApiBaseUrl = origin + PREFIX;
    env.polytrackWsBaseUrl = origin.replace(/^https:/, 'wss:') + PREFIX;
    env.polytrackApiAssetUrl = value => {
      let url;
      try { url = new URL(value, env.location.href); } catch { return value; }
      if (url.origin !== 'https://vps.kodub.com') return remap(value);
      return new URL(url.pathname.replace(/^\/+/, '') + url.search + url.hash, env.polytrackApiBaseUrl).href;
    };
    const changed = state && state.origin !== origin;
    state = { origin, source };
    if (changed && env.CustomEvent && env.dispatchEvent) env.dispatchEvent(new env.CustomEvent('polytrack:backend-changed', { detail: { origin } }));
    return { ...state };
  }
  function accept(value) {
    if (!value || typeof value !== 'object') return;
    const nextRevision = value.configRevision;
    const versioned = Number.isSafeInteger(nextRevision) && nextRevision >= 0;
    if (versioned ? nextRevision < revision : revision >= 0 || legacyApplied) return;
    if (versioned && nextRevision === revision && state && value.polytrackOrigin !== state.origin) return;
    if (!family(value.runtimeOrigin) && value.runtimeOrigin !== undefined) return;
    if (versioned && nextRevision === revision && confirmedBrowser !== undefined && value.runtimeOrigin !== confirmedBrowser) return;
    const candidate = value.polytrackOrigin;
    if (!family(candidate) || ['p01', 'browse', 'browser'].includes(candidate.slice(8, -SUFFIX.length)) || candidate === value.runtimeOrigin ||
      (value.runtimeOrigin === undefined && browsers.has(candidate))) return;
    if (family(value.runtimeOrigin)) {
      browsers.clear(); browsers.add('https://browse' + SUFFIX); browsers.add('https://browser' + SUFFIX); browsers.add(value.runtimeOrigin);
      confirmedBrowser = value.runtimeOrigin;
    }
    if (versioned) revision = nextRevision; else legacyApplied = true;
    apply(value.polytrackOrigin, 'network');
    try {
      if (versioned) env.localStorage.setItem(REVISION, JSON.stringify({ origin: value.polytrackOrigin, revision }));
      env.localStorage.setItem(CACHE, value.polytrackOrigin);
    } catch {}
  }
  function lookup() {
    if (stopped) return Promise.resolve({ ...state });
    const version = ++generation;
    active?.finish(null);
    const controller = new env.AbortController();
    return new Promise(resolve => {
      let settled = false, timer;
      const finish = value => {
        if (settled) return;
        settled = true; cancel(timer);
        if (version === generation && !controller.signal.aborted) accept(value);
        controller.abort();
        if (active?.version === version) active = null;
        resolve({ ...state });
      };
      active = { version, finish };
      timer = later(() => finish(null), options.timeoutMs ?? 1000);
      try {
        Promise.resolve(rawFetch(CONTROL, { method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal }))
          .then(response => response.ok ? response.json() : null).then(finish, () => finish(null));
      } catch { finish(null); }
    });
  }
  const foreground = () => env.document?.visibilityState !== 'hidden' && env.navigator?.onLine !== false;
  function schedule() {
    cancel(refreshTimer);
    if (!stopped) refreshTimer = later(() => { if (foreground()) void lookup(); schedule(); }, options.refreshMs ?? 60000);
  }
  function trigger() {
    if (stopped || active || !foreground()) return;
    const now = options.now ? options.now() : Date.now();
    if (now - lastEvent < 5000) return;
    lastEvent = now; void lookup();
  }
  function install() {
    if (installed) return;
    installed = true;
    const previousFetch = env.fetch;
    env.fetch = function (input, init) {
      if (typeof input === 'string' || input instanceof URL) return rawFetch(remap(input), init);
      if (env.Request && input instanceof env.Request) {
        const url = remap(input.url);
        if (url !== input.url) return rawFetch(new env.Request(url, input), init);
      }
      return rawFetch(input, init);
    };
    cleanups.push(() => { env.fetch = previousFetch; });
    if (env.XMLHttpRequest?.prototype?.open) {
      const original = env.XMLHttpRequest.prototype.open;
      env.XMLHttpRequest.prototype.open = function (method, url, ...rest) { return original.call(this, method, remap(url), ...rest); };
      cleanups.push(() => { env.XMLHttpRequest.prototype.open = original; });
    }
    if (env.WebSocket) {
      const Original = env.WebSocket;
      env.WebSocket = class extends Original { constructor(url, ...rest) { super(remap(url, true), ...rest); } };
      cleanups.push(() => { env.WebSocket = Original; });
    }
    if (!env.addEventListener) return;
    for (const event of ['online', 'focus', 'polytrack:backend-config-change']) {
      env.addEventListener(event, trigger); cleanups.push(() => env.removeEventListener(event, trigger));
    }
    if (env.document?.addEventListener) {
      env.document.addEventListener('visibilitychange', trigger);
      cleanups.push(() => env.document.removeEventListener('visibilitychange', trigger));
    }
    const show = () => { schedule(); trigger(); };
    const hide = () => { cancel(refreshTimer); generation++; active?.finish(null); };
    env.addEventListener('pageshow', show); env.addEventListener('pagehide', hide);
    cleanups.push(() => { env.removeEventListener('pageshow', show); env.removeEventListener('pagehide', hide); });
    if (env.BroadcastChannel) {
      try { channel = new env.BroadcastChannel('polytrack-backend-config'); channel.onmessage = event => { if (event.data?.type === 'refresh') trigger(); }; } catch {}
    }
    schedule();
  }
  function start() {
    if (promise) return promise;
    const saved = cached();
    apply(saved || DEFAULT, saved ? 'cache' : 'default'); install();
    promise = lookup(); return promise;
  }
  function stop() {
    stopped = true; generation++; cancel(refreshTimer); active?.finish(null); channel?.close();
    while (cleanups.length) cleanups.pop()();
  }
  return Object.freeze({ start, refresh: () => promise ? lookup() : start(), stop, validOrigin, remap,
    getState: () => state && { ...state }, getRevision: () => revision });
});
