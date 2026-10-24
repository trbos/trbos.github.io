(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.PolyTrackBackendReady = factory(root).start();
})(globalThis, function createPolyTrackBackend(env, options) {
  'use strict';
  options = options || {};
  const CONTROL = 'https://bawybmihvidtmpfpyajg.supabase.co/functions/v1/site-control';
  const DEFAULT = 'https://launch--wordbuilder--675vggg6lnyg.code.run';
  const CACHE = 'sitePolyTrackBackendOrigin';
  const SUFFIX = '--wordbuilder--675vggg6lnyg.code.run';
  const later = options.setTimeout || env.setTimeout.bind(env);
  const cancel = options.clearTimeout || env.clearTimeout.bind(env);
  let promise, state;

  function validOrigin(value) {
    if (typeof value !== 'string' || !/^https:\/\/[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?--wordbuilder--675vggg6lnyg\.code\.run$/.test(value)) return false;
    const name = value.slice('https://'.length, -SUFFIX.length);
    return !['p01', 'browse', 'browser'].includes(name);
  }
  function cached() {
    try { const value = env.localStorage.getItem(CACHE); return validOrigin(value) ? value : null; } catch { return null; }
  }
  function apply(origin, source) {
    env.polytrackApiBaseUrl = origin + '/polytrack/polytrack-api/';
    env.polytrackWsBaseUrl = origin.replace(/^https:/, 'wss:') + '/polytrack/polytrack-api/';
    env.polytrackApiAssetUrl = value => {
      const url = new URL(value, env.location.href);
      if (url.origin !== 'https://vps.kodub.com') return value;
      return new URL(url.pathname.replace(/^\/+/, '') + url.search + url.hash, env.polytrackApiBaseUrl).href;
    };
    state = { origin, source };
    return { ...state };
  }
  function start() {
    if (promise) return promise;
    const saved = cached();
    apply(saved || DEFAULT, saved ? 'cache' : 'default');
    const controller = new env.AbortController();
    promise = new Promise(resolve => {
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true; cancel(timer);
        if (value && validOrigin(value.polytrackOrigin) && value.polytrackOrigin !== value.runtimeOrigin) {
          apply(value.polytrackOrigin, 'network');
          try { env.localStorage.setItem(CACHE, value.polytrackOrigin); } catch {}
        }
        resolve({ ...state });
      };
      const timer = later(() => { controller.abort(); finish(null); }, options.timeoutMs ?? 1000);
      try {
        Promise.resolve(env.fetch(CONTROL, { method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error',
          referrerPolicy: 'no-referrer', signal: controller.signal }))
          .then(response => response.ok ? response.json() : null).then(finish, () => finish(null));
      } catch { finish(null); }
    });
    return promise;
  }
  return Object.freeze({ start, validOrigin, getState: () => state && { ...state } });
});
