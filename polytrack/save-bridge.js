(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else {
    root.PolyTrackSaveHandoff = factory(root);
    if (root.location.origin === root.PolyTrackSaveHandoff.oldOrigin) void root.PolyTrackSaveHandoff.source();
  }
})(globalThis, function createSaveHandoff(env, options) {
  'use strict';
  options = options || {};
  const OLD = 'https://p01--wordbuilder--675vggg6lnyg.code.run';
  const NEW = 'https://trbos.github.io';
  const GAME = NEW + '/polytrack/';
  const BRIDGE = OLD + '/polytrack/save-bridge.html';
  const API = 'https://bawybmihvidtmpfpyajg.supabase.co/functions/v1/polytrack-backup';
  const PENDING = 'polytrack:handoff:pending:v1';
  const PREVIOUS = 'polytrackPreviousBackupIdentity';
  const IDENTITY = 'polytrackCloudBackupIdentity';
  const ATTEMPTED = 'polytrackSaveHandoffAttemptedV1';
  const MAX = 8 * 1024 * 1024;
  const NONCE = /^[a-f0-9]{64}$/;
  const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
  const EXTRA = new Set(['polyMods', 'car_colors', 'MyCar', 'carSound', 'polyprocessing_settings', 'polyprocessing_settings_v2', 'polyprocessing_windows_state_v1']);
  const encoder = new env.TextEncoder();
  const later = options.setTimeout || env.setTimeout.bind(env);
  const cancel = options.clearTimeout || env.clearTimeout.bind(env);
  const limit = (promise, ms, fallback) => new Promise(resolve => {
    let done = false;
    const timer = later(() => finish(fallback), ms);
    function finish(value) { if (done) return; done = true; cancel(timer); resolve(value); }
    Promise.resolve(promise).then(finish, () => finish(fallback));
  });
  function validIdentity(value) {
    return value && value.version === 1 && ID.test(value.deviceId) && NONCE.test(value.secret) &&
      Number.isSafeInteger(value.revision) && value.revision >= 0;
  }
  const allowed = key => typeof key === 'string' && (key.startsWith('polytrack_') || EXTRA.has(key));
  function entries(value) {
    if (!Array.isArray(value) || value.length > 20000) throw Error('snapshot');
    const seen = new Set();
    const result = value.map(pair => {
      if (!Array.isArray(pair) || pair.length !== 2 || !allowed(pair[0]) || typeof pair[1] !== 'string' || seen.has(pair[0])) throw Error('snapshot');
      seen.add(pair[0]); return pair.slice();
    }).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    if (encoder.encode(JSON.stringify(result)).length > MAX) throw Error('snapshot');
    return result;
  }
  function snapshot() {
    const result = [], storage = env.localStorage;
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (allowed(key)) { const value = storage.getItem(key); if (value !== null) result.push([key, value]); }
    }
    return entries(result);
  }
  function randomHex() { return Array.from(env.crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join(''); }
  function encode(value) {
    const bytes = value instanceof Uint8Array ? value : encoder.encode(JSON.stringify(value));
    let text = ''; for (const byte of bytes) text += String.fromCharCode(byte);
    return env.btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decode(value) {
    if (typeof value !== 'string' || value.length > 12000 || !/^[A-Za-z0-9_-]+$/.test(value)) throw Error('payload');
    const raw = env.atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, character => character.charCodeAt(0));
  }
  function parse(value) { return JSON.parse(new env.TextDecoder('utf-8', { fatal: true }).decode(decode(value))); }
  const validPublic = key => key && key.kty === 'EC' && key.crv === 'P-256' && typeof key.x === 'string' && typeof key.y === 'string' && !Object.hasOwn(key, 'd');
  async function aes(privateKey, publicJwk) {
    if (!validPublic(publicJwk)) throw Error('public-key');
    const publicKey = await env.crypto.subtle.importKey('jwk', publicJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    return env.crypto.subtle.deriveKey({ name: 'ECDH', public: publicKey }, privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function seal(value, publicJwk, nonce) {
    if (!NONCE.test(nonce)) throw Error('nonce');
    const pair = await env.crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
    const iv = env.crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await env.crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(nonce) },
      await aes(pair.privateKey, publicJwk), encoder.encode(JSON.stringify(value)));
    return { nonce, publicKey: await env.crypto.subtle.exportKey('jwk', pair.publicKey), iv: encode(iv), data: encode(new Uint8Array(ciphertext)) };
  }
  async function unseal(payload, state) {
    if (!payload || !state || !NONCE.test(state.nonce) || payload.nonce !== state.nonce || !validPublic(payload.publicKey) ||
        !Number.isFinite(state.createdAt) || Date.now() - state.createdAt > 120000 || state.createdAt > Date.now() + 10000) throw Error('handoff');
    const key = await env.crypto.subtle.importKey('jwk', state.privateKey, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']);
    const bytes = await env.crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(payload.iv), additionalData: encoder.encode(state.nonce) },
      await aes(key, payload.publicKey), decode(payload.data));
    const result = JSON.parse(new env.TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!result || !validIdentity(result.identity)) throw Error('identity');
    return result;
  }
  async function remote(identity) {
    if (!validIdentity(identity)) return null;
    const controller = new env.AbortController();
    const timer = later(() => controller.abort(), options.readMs ?? 3500);
    try {
      const response = await env.fetch(API, { method: 'POST', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + identity.secret }, body: JSON.stringify({ action: 'read', deviceId: identity.deviceId }) });
      if (!response.ok) return null;
      const value = await response.json();
      if (value.deviceId !== identity.deviceId || value.exists !== true || !Number.isSafeInteger(value.revision) || value.revision < identity.revision) return null;
      return { entries: entries(value.entries), revision: value.revision };
    } catch { return null; } finally { cancel(timer); }
  }
  function upgrade(db) {
    for (const name of ['snapshots', 'state']) if (!db.objectStoreNames?.contains(name)) db.createObjectStore(name);
  }
  async function attemptedRecord(value) {
    return limit(new Promise(resolve => {
      let request;
      try { request = env.indexedDB.open('PolyTrackSaveHandoff', 2); } catch { resolve(null); return; }
      request.onupgradeneeded = () => upgrade(request.result);
      request.onerror = request.onblocked = () => resolve(null);
      request.onsuccess = () => {
        const db = request.result;
        try {
          const transaction = db.transaction('state', value === undefined ? 'readonly' : 'readwrite');
          const store = transaction.objectStore('state');
          const operation = value === undefined ? store.get('attempted-v1') : store.put(value, 'attempted-v1');
          let result;
          operation.onsuccess = () => { result = operation.result; };
          transaction.oncomplete = () => { db.close(); resolve(value === undefined ? result : value); };
          transaction.onerror = transaction.onabort = () => { db.close(); resolve(null); };
        } catch { db.close(); resolve(null); }
      };
    }), 750, null);
  }
  async function attempted() {
    try { if (env.localStorage.getItem(ATTEMPTED) === '1') return true; } catch {}
    return await attemptedRecord() === true;
  }
  async function rememberAttempt() {
    try { env.localStorage.setItem(ATTEMPTED, '1'); } catch {}
    await attemptedRecord(true);
  }
  // Each distinct import is journaled before any destination game key is touched.
  // The journal also keeps original strings for unknown/conflicting schemas.
  async function journal(sourceEntries, before, result) {
    const bytes = await env.crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify([sourceEntries, before])));
    const key = Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
    return limit(new Promise(resolve => {
      let request;
      try { request = env.indexedDB.open('PolyTrackSaveHandoff', 2); } catch { resolve(false); return; }
      request.onupgradeneeded = () => upgrade(request.result);
      request.onerror = request.onblocked = () => resolve(false);
      request.onsuccess = () => {
        const db = request.result;
        try {
          const transaction = db.transaction('snapshots', 'readwrite');
          transaction.objectStore('snapshots').put({ version: 1, createdAt: Date.now(), before, incoming: sourceEntries, conflicts: result.conflicts }, key);
          transaction.oncomplete = () => { db.close(); resolve(true); };
          transaction.onerror = transaction.onabort = () => { db.close(); resolve(false); };
        } catch { db.close(); resolve(false); }
      };
    }), options.journalMs ?? 1500, false);
  }
  async function apply(sourceEntries) {
    sourceEntries = entries(sourceEntries);
    const run = async () => {
      const before = snapshot();
      const merger = env.PolyTrackSaveMerge?.mergePolyTrackSaves;
      if (typeof merger !== 'function') return false;
      const result = merger(sourceEntries, before);
      if (!await journal(sourceEntries, before, result)) return false;
      if (JSON.stringify(snapshot()) !== JSON.stringify(before)) return false;
      const old = new Map(before), changes = result.entries.filter(([key, value]) => old.get(key) !== value), written = [];
      try {
        for (const [key, value] of changes) { env.localStorage.setItem(key, value); written.push(key); }
      } catch {
        for (const key of written.reverse()) {
          try { if (old.has(key)) env.localStorage.setItem(key, old.get(key)); else env.localStorage.removeItem(key); } catch {}
        }
        return false;
      }
      return true;
    };
    return env.navigator.locks?.request ? env.navigator.locks.request('polytrack-save-handoff-v1', run) : run();
  }
  function probe() {
    const nonce = randomHex();
    return new Promise(resolve => {
      const frame = env.document.createElement('iframe');
      frame.hidden = true; frame.setAttribute('aria-hidden', 'true'); frame.referrerPolicy = 'no-referrer';
      let settled = false;
      const timer = later(() => finish(false), options.probeMs ?? 1200);
      function finish(value) {
        if (settled) return; settled = true; cancel(timer);
        env.removeEventListener('message', receive); frame.remove(); resolve(value);
      }
      function receive(event) {
        if (event.origin === OLD && event.source === frame.contentWindow && event.data?.type === 'polytrack:source-ready' && event.data.nonce === nonce) finish(true);
      }
      env.addEventListener('message', receive);
      frame.src = BRIDGE + '#ptprobe=' + nonce;
      (env.document.body || env.document.documentElement).append(frame);
    });
  }
  async function destination() {
    if (env.location.origin !== NEW) return true;
    const returning = env.location.hash.startsWith('#ptreturn=');
    if (returning) {
      let state;
      try { state = JSON.parse(env.sessionStorage.getItem(PENDING)); } catch {}
      const fragment = env.location.hash.slice('#ptreturn='.length);
      // Remove credentials' ciphertext before loading any other script or remote asset.
      env.history.replaceState(null, '', env.location.pathname + (state?.search || '') + (state?.hash || ''));
      try {
        const value = await unseal(parse(fragment), state);
        env.localStorage.setItem(PREVIOUS, JSON.stringify(value.identity));
        const saved = await remote(value.identity);
        if (saved) await apply(saved.entries);
      } catch {} finally {
        try { env.sessionStorage.removeItem(PENDING); } catch {}
        await rememberAttempt();
      }
      return true;
    }
    const search = new URLSearchParams(env.location.search);
    const retry = search.get('recover') === 'old';
    if (retry) {
      search.delete('recover');
      env.history.replaceState(null, '', env.location.pathname + (search.size ? '?' + search.toString() : '') + env.location.hash);
    }
    // The GitHub origin is permanent. Ordinary repeat launches only use its own
    // local data/cloud backup; an intentional old-link visit can retry recovery.
    if (!retry && await attempted()) return true;
    await rememberAttempt();
    try { env.sessionStorage.removeItem(PENDING); } catch {}
    if (!await probe()) {
      try {
        const previous = JSON.parse(env.localStorage.getItem(PREVIOUS));
        if (validIdentity(previous) && snapshot().length === 0) {
          const saved = await remote(previous);
          if (saved) await apply(saved.entries);
        }
      } catch {}
      return true;
    }
    try {
      const pair = await env.crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
      const state = { nonce: randomHex(), createdAt: Date.now(), privateKey: await env.crypto.subtle.exportKey('jwk', pair.privateKey), search: search.size ? '?' + search.toString() : '', hash: env.location.hash };
      const exported = { nonce: state.nonce, publicKey: await env.crypto.subtle.exportKey('jwk', pair.publicKey), createdAt: state.createdAt };
      env.sessionStorage.setItem(PENDING, JSON.stringify(state));
      if (JSON.parse(env.sessionStorage.getItem(PENDING))?.nonce !== state.nonce) return true;
      env.location.replace(BRIDGE + '#ptexport=' + encode(exported));
      return false;
    } catch { return true; }
  }
  async function source() {
    if (env.location.origin !== OLD) return;
    const hash = env.location.hash;
    if (hash.startsWith('#ptprobe=')) {
      const nonce = hash.slice('#ptprobe='.length);
      if (NONCE.test(nonce) && env.parent !== env) env.parent.postMessage({ type: 'polytrack:source-ready', nonce }, NEW);
      return;
    }
    if (!hash.startsWith('#ptexport=') || env.parent !== env) return;
    let request;
    try {
      request = parse(hash.slice('#ptexport='.length));
      if (!NONCE.test(request.nonce) || !validPublic(request.publicKey) || !Number.isFinite(request.createdAt) ||
          Date.now() - request.createdAt > 120000 || request.createdAt > Date.now() + 10000) throw Error('request');
    } catch { env.location.replace(GAME + '#ptreturn=failed'); return; }
    env.history.replaceState(null, '', env.location.pathname);
    let returned = false;
    const leave = payload => {
      if (returned) return; returned = true;
      env.location.replace(GAME + '#ptreturn=' + (payload ? encode(payload) : 'failed'));
    };
    // A reachable old page cannot trap the game behind an unavailable backup service.
    const deadline = later(() => leave(null), options.sourceMs ?? 6500);
    try {
      env.polytrackCloudBackupInitialEntries = snapshot();
      await limit(new Promise((resolve, reject) => {
        const script = env.document.createElement('script'); script.src = './cloud-backup.js?v=2';
        script.onload = resolve; script.onerror = reject; env.document.head.append(script);
      }), 1500, null);
      if (env.PolyTrackCloudBackup) {
        await limit(env.PolyTrackCloudBackup.start(), options.flushMs ?? 3500, null);
        await limit(env.PolyTrackCloudBackup.flush(), 750, null);
      }
      const identity = JSON.parse(env.localStorage.getItem(IDENTITY));
      if (!validIdentity(identity)) { leave(null); return; }
      const payload = await seal({ identity }, request.publicKey, request.nonce);
      leave(payload);
    } catch { leave(null); } finally { cancel(deadline); }
  }
  return Object.freeze({ oldOrigin: OLD, destination, source, snapshot, apply, validIdentity, entries, seal, unseal, probe, encode, parse, remote });
});
