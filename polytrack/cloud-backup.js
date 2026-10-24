(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else if (root.document && ['https://p01--wordbuilder--675vggg6lnyg.code.run', 'https://trbos.github.io'].includes(root.location.origin)) {
    const initialEntries = root.polytrackCloudBackupInitialEntries;
    delete root.polytrackCloudBackupInitialEntries;
    root.PolyTrackCloudBackup = factory(root, { initialEntries });
    void root.PolyTrackCloudBackup.start();
  }
})(globalThis, function createPolyTrackCloudBackup(env, options) {
  'use strict';
  options = options || {};
  const ENDPOINT = 'https://bawybmihvidtmpfpyajg.supabase.co/functions/v1/polytrack-backup';
  const IDENTITY = 'polytrackCloudBackupIdentity';
  const MAX_BYTES = 8 * 1024 * 1024;
  const EXTRA_KEYS = new Set(['polyMods', 'car_colors', 'MyCar', 'carSound', 'polyprocessing_settings',
    'polyprocessing_settings_v2', 'polyprocessing_windows_state_v1']);
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const HEX = /^[0-9a-f]{64}$/;
  const encoder = new env.TextEncoder();
  const setTimer = options.setTimeout || env.setTimeout.bind(env);
  const clearTimer = options.clearTimeout || env.clearTimeout.bind(env);
  const debounceMs = options.debounceMs ?? 1800;
  const periodMs = options.periodMs ?? 30000;
  let storage, identity, pending, dbPromise, running, timer, period, controller, startPromise;
  let started = false, stopped = false, blocked = false, checked = false, changed = true;
  let retries = 0, status = { state: 'starting', deviceId: null, revision: 0, updatedAt: null };
  let originalSet, originalRemove, wrappedSet, wrappedRemove;
  const listeners = [];

  const allowed = key => typeof key === 'string' && (/^polytrack_/.test(key) || EXTRA_KEYS.has(key));
  const validIdentity = value => value && value.version === 1 && UUID.test(value.deviceId) &&
    HEX.test(value.secret) && Number.isSafeInteger(value.revision) && value.revision >= 0 &&
    (value.digest === undefined || HEX.test(value.digest));
  function update(state, metadata = {}) {
    status = { ...status, state, ...metadata };
    try { env.dispatchEvent(new env.CustomEvent('polytrack:backup', { detail: { ...status } })); } catch {}
  }
  function getLocalIdentity() {
    try { const value = JSON.parse(storage.getItem(IDENTITY)); return validIdentity(value) ? value : null; } catch { return null; }
  }
  function database() {
    if (!dbPromise) dbPromise = new Promise(resolve => {
      let finished = false;
      const timeout = setTimer(() => finish(null), 5000);
      function finish(value) {
        if (finished) { value?.close(); return; }
        finished = true; clearTimer(timeout); resolve(value);
      }
      try {
        const request = env.indexedDB.open('PolyTrackCloudBackup', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('state');
        request.onsuccess = () => {
          request.result.onversionchange = () => request.result.close();
          finish(request.result);
        };
        request.onerror = request.onblocked = () => finish(null);
      } catch { finish(null); }
    });
    return dbPromise;
  }
  async function stored(key, value) {
    const db = await database();
    if (!db) return undefined;
    return new Promise(resolve => {
      let finished = false;
      let transaction;
      const timeout = setTimer(() => { try { transaction?.abort(); } catch {} finish(undefined); }, 5000);
      function finish(value) {
        if (finished) return;
        finished = true; clearTimer(timeout); resolve(value);
      }
      try {
        transaction = db.transaction('state', value === undefined ? 'readonly' : 'readwrite');
        const store = transaction.objectStore('state');
        const request = value === undefined ? store.get(key) : value === null ? store.delete(key) : store.put(value, key);
        let result;
        request.onsuccess = () => { result = request.result; };
        transaction.oncomplete = () => finish(result);
        transaction.onerror = transaction.onabort = () => finish(undefined);
      } catch { finish(undefined); }
    });
  }
  async function persistIdentity(value) {
    // Only this small, separate identity key is ever written to localStorage.
    storage.setItem(IDENTITY, JSON.stringify(value));
    await stored('identity', value);
  }
  function newIdentity() {
    const bytes = new Uint8Array(32);
    env.crypto.getRandomValues(bytes);
    let deviceId;
    if (typeof env.crypto.randomUUID === 'function') deviceId = env.crypto.randomUUID();
    else {
      const uuid = new Uint8Array(16); env.crypto.getRandomValues(uuid);
      uuid[6] = (uuid[6] & 15) | 64; uuid[8] = (uuid[8] & 63) | 128;
      const hex = Array.from(uuid, byte => byte.toString(16).padStart(2, '0')).join('');
      deviceId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
    return { version: 1, deviceId, secret: Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join(''), revision: 0 };
  }
  function normalize(entries) {
    if (!Array.isArray(entries)) throw new Error('storage');
    const seen = new Set();
    const copy = entries.map(entry => {
      if (!Array.isArray(entry) || entry.length !== 2 || !allowed(entry[0]) || typeof entry[1] !== 'string' || seen.has(entry[0])) throw new Error('storage');
      seen.add(entry[0]); return [entry[0], entry[1]];
    }).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
    const serialized = JSON.stringify(copy);
    if (encoder.encode(serialized).byteLength > MAX_BYTES) throw new Error('too-large');
    return { entries: copy, serialized };
  }
  function snapshot() {
    const entries = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (allowed(key)) { const value = storage.getItem(key); if (typeof value === 'string') entries.push([key, value]); }
    }
    return normalize(entries);
  }
  async function digest(serialized) {
    const bytes = await env.crypto.subtle.digest('SHA-256', encoder.encode(serialized));
    return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  async function withLock(callback) {
    if (env.navigator.locks?.request) return env.navigator.locks.request('polytrack-cloud-backup-v1', callback);
    return callback();
  }
  function schedule(delay = debounceMs) {
    if (stopped || blocked) return;
    clearTimer(timer);
    timer = setTimer(() => { timer = null; void flush(); }, delay);
  }
  function markChanged() { changed = true; schedule(); }
  function listen(target, name, callback) {
    target.addEventListener(name, callback);
    listeners.push(() => target.removeEventListener(name, callback));
  }
  function installObservers() {
    const proto = env.Storage?.prototype;
    if (proto) {
      originalSet = proto.setItem; originalRemove = proto.removeItem;
      wrappedSet = function (key, value) {
        const result = Reflect.apply(originalSet, this, arguments);
        if (this === storage && allowed(key)) markChanged();
        return result;
      };
      wrappedRemove = function (key) {
        const result = Reflect.apply(originalRemove, this, arguments);
        if (this === storage && allowed(key)) markChanged();
        return result;
      };
      try { proto.setItem = wrappedSet; proto.removeItem = wrappedRemove; } catch {}
    }
    listen(env, 'storage', event => { if (event.storageArea === storage && (event.key === null || allowed(event.key))) markChanged(); });
    listen(env, 'online', () => schedule(0));
    listen(env, 'pagehide', () => { void flush({ keepalive: true }); });
    listen(env.document, 'visibilitychange', () => { if (env.document.visibilityState === 'hidden') void flush({ keepalive: true }); });
    const poll = () => {
      if (stopped) return;
      if (env.document.visibilityState !== 'hidden') { changed = true; void flush(); }
      period = setTimer(poll, periodMs);
    };
    period = setTimer(poll, periodMs);
  }
  async function request(body, keepalive) {
    if (stopped) throw new Error('stopped');
    controller = new env.AbortController();
    const timeout = setTimer(() => controller?.abort(), 20000);
    try {
      const serialized = JSON.stringify(body);
      const response = await env.fetch(ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${identity.secret}` },
        body: serialized, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
        keepalive: Boolean(keepalive && encoder.encode(serialized).byteLength <= 60000), signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) { const error = new Error(response.status === 409 ? 'conflict' : response.status === 429 || response.status >= 500 ? 'offline' : 'unavailable'); error.result = result; throw error; }
      if (result.deviceId !== identity.deviceId || !Number.isSafeInteger(result.revision) || result.revision < 0 ||
          typeof result.exists !== 'boolean' || !(result.updatedAt === null || typeof result.updatedAt === 'string') ||
          (result.digest !== undefined && result.digest !== null && !HEX.test(result.digest))) throw new Error('offline');
      return result;
    } finally { clearTimer(timeout); controller = null; }
  }
  async function flushInner(keepalive) {
    if (stopped || blocked) return;
    const latest = getLocalIdentity();
    if (latest && (latest.deviceId !== identity.deviceId || latest.secret !== identity.secret)) { blocked = true; update('conflict'); return; }
    if (latest && latest.revision > identity.revision) {
      if (pending && latest.revision === pending.expectedRevision + 1 && latest.digest === pending.digest) pending = null;
      identity = latest; checked = false;
    }
    if (!pending) {
      if (!changed) return;
      const current = snapshot();
      const hash = await digest(current.serialized);
      if (hash === identity.digest) { changed = false; update('saved'); return; }
      pending = { deviceId: identity.deviceId, expectedRevision: identity.revision, digest: hash, entries: current.entries };
      await stored('pending', pending);
    }
    if (!checked) {
      const remote = await request({ action: 'status', deviceId: identity.deviceId }, keepalive);
      if (remote.revision !== pending.expectedRevision) {
        if (remote.revision === pending.expectedRevision + 1 && remote.digest === pending.digest) return acknowledge(remote);
        throw new Error('conflict');
      }
      checked = true;
    }
    if (stopped) return;
    // A lost response retries the same revision and exact bytes; it never adopts a 409 revision.
    let result;
    try {
      result = await request({ action: 'save', deviceId: identity.deviceId, expectedRevision: pending.expectedRevision, entries: pending.entries }, keepalive);
    } catch (error) {
      if (error.message !== 'conflict') throw error;
      const remote = await request({ action: 'status', deviceId: identity.deviceId }, keepalive);
      if (remote.revision !== pending.expectedRevision + 1 || remote.digest !== pending.digest) throw error;
      result = remote;
    }
    if (result.revision !== pending.expectedRevision + 1 || !result.exists) throw new Error('offline');
    await acknowledge(result);
  }
  async function acknowledge(result) {
    const latest = getLocalIdentity();
    if (latest && (latest.deviceId !== identity.deviceId || latest.secret !== identity.secret)) throw new Error('conflict');
    identity = { ...identity, revision: result.revision, digest: pending.digest };
    await persistIdentity(identity);
    pending = null; await stored('pending', null);
    retries = 0; update('saved', { revision: identity.revision, updatedAt: result.updatedAt });
    const current = snapshot();
    changed = await digest(current.serialized) !== identity.digest;
    if (changed) schedule();
  }
  function flush({ keepalive = false } = {}) {
    if (running) return running;
    if (!started || stopped || blocked) return Promise.resolve({ ...status });
    clearTimer(timer); timer = null;
    running = withLock(() => flushInner(keepalive)).catch(error => {
      if (stopped) return;
      const state = ['conflict', 'too-large', 'unavailable'].includes(error.message) ? error.message : 'offline';
      if (state === 'conflict' || state === 'unavailable') blocked = true;
      update(state);
      if (!blocked && state !== 'too-large') schedule(Math.min(60000, 1000 * 2 ** Math.min(retries++, 6)));
    }).finally(() => { running = null; });
    return running;
  }
  function start() {
    if (!startPromise) startPromise = startInner();
    return startPromise;
  }
  async function startInner() {
    if (started || stopped) return { ...status };
    started = true;
    try {
      storage = env.localStorage;
      await withLock(async () => {
        identity = getLocalIdentity();
        if (!identity) {
          const redundant = await stored('identity');
          identity = validIdentity(redundant) ? redundant : newIdentity();
          await persistIdentity(identity);
        }
        const saved = await stored('pending');
        if (saved?.deviceId === identity.deviceId && saved.expectedRevision === identity.revision && HEX.test(saved.digest)) {
          const value = normalize(saved.entries);
          if (await digest(value.serialized) === saved.digest) pending = { ...saved, entries: value.entries };
        }
        if (!pending && options.initialEntries !== undefined && options.initialEntries !== null && identity.revision === 0) {
          const value = normalize(options.initialEntries);
          pending = { deviceId: identity.deviceId, expectedRevision: 0, digest: await digest(value.serialized), entries: value.entries };
          await stored('pending', pending);
        }
      });
      if (stopped) return { ...status };
      update('pending', { deviceId: identity.deviceId, revision: identity.revision });
      installObservers();
      await flush();
    } catch (error) { if (!stopped) update(error.message === 'too-large' ? 'too-large' : 'unavailable'); }
    return { ...status };
  }
  function stop() {
    stopped = true; clearTimer(timer); clearTimer(period); controller?.abort();
    for (const remove of listeners.splice(0)) remove();
    const proto = env.Storage?.prototype;
    if (proto?.setItem === wrappedSet) proto.setItem = originalSet;
    if (proto?.removeItem === wrappedRemove) proto.removeItem = originalRemove;
    void dbPromise?.then(db => db?.close());
    update('stopped');
  }
  return Object.freeze({ start, flush, stop, getStatus: () => ({ ...status }),
    getBackupId: () => identity?.deviceId || null,
    getRecoveryKey: () => identity?.secret || null });
});
