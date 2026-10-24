(() => {
  'use strict';

  const SUPABASE_URL = 'https://bawybmihvidtmpfpyajg.supabase.co';
  const PUBLIC_KEY = 'sb_publishable_T-s9qOd-4eUg9xbC4YQEEg_FSkd2SL-';
  const CONTROL_URL = SUPABASE_URL + '/functions/v1/site-control';
  const RUNTIME_SUFFIX = '--wordbuilder--675vggg6lnyg.code.run';
  const RESERVED_NAMES = new Set(['p01','launch','admin','api','www','assets','internal','root']);
  const POLL_LIMIT = 90000;
  const AUTO_COOLDOWN = 30*60*1000;
  const PENDING_KEY = 'trbos.site-owner.pending.v1';
  let host = null, fields = null, session = null, verified = false;
  let busy = false, operation = '', epoch = 0, pending = null, automaticPending = null;
  let currentRoute = location.hash.slice(2).split('?')[0] || 'home', currentOrigin = null;
  let autoEnabled = false, autoCooldownUntil = 0, failureOrigin = null, failureCount = 0, historyTicket = 0;

  class RequestError extends Error {
    constructor(status = 0, code = '') { super('Request failed'); this.status = status; this.code = code; }
  }

  function runtimeOrigin(value) {
    if (typeof value !== 'string') return null;
    const match = /^https:\/\/([a-z](?:[a-z0-9-]{0,6}[a-z0-9])?)--wordbuilder--675vggg6lnyg\.code\.run$/.exec(value);
    return match && validName(match[1]) ? value : null;
  }

  function publishOrigin(value) {
    const origin = runtimeOrigin(value);
    if (!origin) throw new RequestError();
    window.dispatchEvent(new CustomEvent('site:browser-config',{detail:{runtimeOrigin:origin}}));
  }

  function resetFailures() { failureOrigin = null; failureCount = 0; }

  function storePending(job) {
    try {localStorage.setItem(PENDING_KEY,JSON.stringify({requestId:job.requestId,name:job.name,automatic:job.automatic,targetOrigin:job.targetOrigin}));}
    catch { /* Recovery still works in this tab when storage is unavailable. */ }
  }

  function clearPending(job) {
    try {
      const saved = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
      if (saved?.requestId === job.requestId) localStorage.removeItem(PENDING_KEY);
    } catch { /* Storage can be disabled independently of sign-in. */ }
  }

  function restorePending() {
    let job;
    try {job = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');} catch {return;}
    if (!job || !validName(job.name) || typeof job.automatic !== 'boolean' ||
      typeof job.requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(job.requestId) ||
      job.targetOrigin !== 'https://' + job.name + RUNTIME_SUFFIX) return;
    const safe = {name:job.name,requestId:job.requestId,automatic:job.automatic,targetOrigin:job.targetOrigin};
    if (currentOrigin === safe.targetOrigin) {clearPending(safe);return;}
    if (safe.automatic) automaticPending = safe;
    else {pending = safe;if (fields) fields.name.value = safe.name;}
  }

  window.addEventListener('site:browser-config',event => {
    const origin = runtimeOrigin(event.detail?.runtimeOrigin);
    if (!origin || origin === currentOrigin) return;
    currentOrigin = origin;
    resetFailures();
    if (automaticPending && origin === automaticPending.targetOrigin) {clearPending(automaticPending);automaticPending = null;}
    if (pending && origin === pending.targetOrigin) {clearPending(pending);pending = null;}
  });

  function announceOwner(owner) {
    window.dispatchEvent(new CustomEvent('site:owner',{detail:{owner}}));
  }

  async function request(url, options = {}, timeout = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(),Math.max(1,timeout));
    try {
      const response = await fetch(url,{
        ...options, signal:controller.signal, credentials:'omit', cache:'no-store',
        referrerPolicy:'no-referrer', redirect:'error'
      });
      let data;
      try { data = await response.json(); } catch { throw new RequestError(response.ok ? 0 : response.status); }
      if (!response.ok) {
        const code = typeof data?.error === 'string' && /^[a-z_]{1,64}$/.test(data.error) ? data.error : '';
        throw new RequestError(response.status,code);
      }
      return data;
    } catch (error) {
      throw error instanceof RequestError ? error : new RequestError();
    } finally { clearTimeout(timer); }
  }

  function control(action, token, values = {}, timeout) {
    return request(CONTROL_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json',apikey:PUBLIC_KEY,Authorization:'Bearer ' + token},
      body:JSON.stringify({action,...values})
    },timeout);
  }

  async function auth(grant, values) {
    const data = await request(SUPABASE_URL + '/auth/v1/token?grant_type=' + grant,{
      method:'POST', headers:{'Content-Type':'application/json',apikey:PUBLIC_KEY},
      body:JSON.stringify(values)
    });
    if (typeof data.access_token !== 'string' || typeof data.refresh_token !== 'string') throw new RequestError();
    const expiresAt = Number(data.expires_at) || Math.floor(Date.now()/1000) + Number(data.expires_in || 0);
    if (!Number.isFinite(expiresAt) || expiresAt <= 0) throw new RequestError();
    return {accessToken:data.access_token,refreshToken:data.refresh_token,expiresAt};
  }

  function status(text = '') { if (fields) fields.status.textContent = text; }

  function render() {
    if (!fields) return;
    host.hidden = currentRoute !== 'owner';
    fields.login.hidden = verified;
    fields.controls.hidden = !verified;
    fields.history.hidden = !verified;
    fields.username.disabled = busy;
    fields.pin.disabled = busy;
    fields.signin.disabled = busy;
    fields.name.disabled = busy;
    fields.name.readOnly = !!pending;
    fields.rotate.disabled = busy;
    fields.auto.checked = autoEnabled;
    fields.auto.disabled = busy;
    fields.recover.hidden = !automaticPending;
    fields.recover.disabled = busy;
    fields.signin.textContent = busy && operation === 'signin' ? 'Signing in…' : 'Sign in';
    fields.rotate.textContent = busy && operation === 'rotate' ? 'Rotating…' : 'Rotate Browser';
    host.setAttribute('aria-busy',String(busy));
  }

  function forget() {
    epoch++;
    session = null; verified = false; pending = null; automaticPending = null; busy = false; operation = ''; autoEnabled = false;
    resetFailures();
    historyTicket++;
    if (fields) { fields.pin.value = ''; fields.name.value = ''; }
    if (fields) fields.history.replaceChildren();
    announceOwner(false);
    render();
  }

  async function checkOwner(candidate, version) {
    let next = candidate;
    if (next.expiresAt <= Date.now()/1000 + 60) next = await auth('refresh_token',{refresh_token:next.refreshToken});
    let data;
    try { data = await control('owner',next.accessToken); }
    catch (error) {
      if (error.status !== 401) throw error;
      next = await auth('refresh_token',{refresh_token:next.refreshToken});
      data = await control('owner',next.accessToken);
    }
    if (data?.owner !== true || !runtimeOrigin(data.runtimeOrigin)) throw new RequestError(403);
    if (version !== epoch) return false;
    session = next; verified = true;
    publishOrigin(data.runtimeOrigin);
    announceOwner(true);
    void refreshHistory(version);
    return true;
  }

  function errorText(error, signin = false) {
    if (error.code === 'invalid_name') return 'Choose another name.';
    if (error.code === 'name_in_use') return 'Name unavailable.';
    if (error.code === 'operation_in_progress' || error.code === 'lease_lost') return 'A rotation is already running. Try again.';
    if (error.code === 'configuration_conflict') return 'Browser configuration changed. Try again later.';
    if (error.code === 'rotation_not_configured') return 'Rotation is unavailable.';
    if (error.code === 'backend_unhealthy') return 'Browser backend is unavailable. Use Retry.';
    if (['cooldown','automatic_cooldown','auto_cooldown','automatic_rate_limit','automatic_daily_limit'].includes(error.code)) return 'Auto rotation paused. Use Retry.';
    if (error.status === 403) return 'Owner access required.';
    if (error.status === 401) return signin ? 'Sign in failed.' : 'Sign in again.';
    if (error.status === 400) return signin ? 'Sign in failed.' : 'Unable to use that name.';
    if (error.status === 429) return 'Try again later.';
    if (error.status === 409) return 'Name unavailable or a rotation is already running.';
    return signin ? 'Unable to sign in. Try again.' : 'Unable to connect. Try again.';
  }

  async function signin(event) {
    event.preventDefault();
    if (busy) return;
    const username = fields.username.value.trim().toLowerCase(), pin = fields.pin.value;
    if (!username || !pin) { status('Enter your username and PIN.'); return; }
    const version = ++epoch;
    fields.pin.value = '';
    busy = true; operation = 'signin'; status(); render();
    try {
      const candidate = await auth('password',{email:username + '@players.jambling.invalid',password:'Jambling2:' + pin});
      if (version !== epoch) return;
      if (await checkOwner(candidate,version)) { autoEnabled = true; resetFailures(); restorePending(); }
    } catch (error) {
      if (version !== epoch) return;
      forget();
      status(errorText(error,true));
    } finally {
      if (version === epoch) { busy = false; operation = ''; render(); }
    }
  }

  async function verifyOnEntry() {
    if (!session || busy) return;
    const version = epoch;
    verified = false; busy = true; operation = 'verify'; status('Checking…'); render();
    try {
      if (await checkOwner(session,version)) status();
    } catch (error) {
      if (version !== epoch) return;
      if ([400,401,403].includes(error.status)) forget();
      status(errorText(error));
    } finally {
      if (version === epoch) { busy = false; operation = ''; render(); }
    }
  }

  function validName(value) {
    return typeof value === 'string' && /^[a-z](?:[a-z0-9-]{0,6}[a-z0-9])?$/.test(value) && !value.includes('--') && !RESERVED_NAMES.has(value);
  }

  async function refreshHistory(version = epoch) {
    if (!session || !verified) return;
    const ticket = ++historyTicket, token = session.accessToken;
    try {
      const data = await control('history',token);
      if (version !== epoch || ticket !== historyTicket || !verified || !fields) return;
      if (!Array.isArray(data?.entries)) throw new RequestError();
      const heading = document.createElement('h2'); heading.textContent = 'Log';
      const entries = data.entries.slice(0,50);
      if (!entries.length) {
        const empty = document.createElement('p'); empty.textContent = 'No automatic changes.';
        fields.history.replaceChildren(heading,empty); return;
      }
      const table = document.createElement('table'), thead = table.createTHead(), row = thead.insertRow();
      for (const label of ['Time','From','To','Status']) {
        const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = label; row.append(cell);
      }
      const tbody = table.createTBody();
      for (const entry of entries) {
        if (!entry || typeof entry !== 'object') continue;
        const row = tbody.insertRow(), date = new Date(entry.at);
        row.insertCell().textContent = Number.isFinite(date.getTime()) ? date.toLocaleString() : '—';
        for (const value of [entry.from,entry.to]) {
          const cell = row.insertCell(), origin = runtimeOrigin(value);
          cell.textContent = origin ? origin.slice(8,-RUNTIME_SUFFIX.length) : '—';
          if (origin) cell.title = origin;
        }
        row.insertCell().textContent = typeof entry.status === 'string' && /^[a-z_ -]{1,32}$/.test(entry.status) ? entry.status.replaceAll('_',' ') : '—';
      }
      fields.history.replaceChildren(heading,table);
    } catch (error) {
      if (version !== epoch || ticket !== historyTicket || !fields) return;
      if ([401,403].includes(error.status)) {forget();status(errorText(error));return;}
      const unavailable = document.createElement('p'); unavailable.textContent = 'Log unavailable.';
      fields.history.replaceChildren(unavailable);
    }
  }

  async function pollRotation(job, version, deadline) {
    while (version === epoch && Date.now() < deadline) {
      try {
        const data = await request(CONTROL_URL,{headers:{apikey:PUBLIC_KEY}},Math.min(10000,deadline-Date.now()));
        if (runtimeOrigin(data?.runtimeOrigin) === job.targetOrigin) {
          if (version !== epoch) return false;
          publishOrigin(data.runtimeOrigin);
          return true;
        }
      } catch { /* A service rollout may briefly interrupt config requests. */ }
      const remaining = deadline - Date.now();
      if (remaining > 0) await new Promise(resolve => setTimeout(resolve,Math.min(1500,remaining)));
    }
    return false;
  }

  async function performRotation(name, automatic = false, recover = false) {
    if (busy || !verified || !session) return false;
    const version = epoch;
    busy = true; operation = 'rotate'; status(); render();
    try {
      const originalOrigin = currentOrigin;
      if (!await checkOwner(session,version)) return false;
      if (version !== epoch || !verified || !session) return false;
      if (automatic && !recover && (currentRoute !== 'browser' || !autoEnabled || originalOrigin !== currentOrigin)) return false;
      if (currentOrigin === 'https://' + name + RUNTIME_SUFFIX) {status();return true;}
      let job = automatic ? automaticPending : pending;
      if (!job) job = {name,requestId:crypto.randomUUID(),targetOrigin:'https://' + name + RUNTIME_SUFFIX,automatic};
      if (automatic) automaticPending = job; else pending = job;
      storePending(job);
      if (job.name !== name) throw new RequestError(409);
      render();
      const deadline = Date.now() + POLL_LIMIT;
      let uncertain = false;
      try {
        if (version !== epoch || !verified || !session) return false;
        if (automatic) autoCooldownUntil = Date.now() + AUTO_COOLDOWN;
        const data = await control('rename',session.accessToken,{name:job.name,requestId:job.requestId,...(automatic ? {automatic:true} : {})});
        if (runtimeOrigin(data?.runtimeOrigin) !== job.targetOrigin || data.name !== job.name) throw new RequestError();
      } catch (error) {
        if (version !== epoch) return;
        if (error.status >= 400 && error.status < 500) {
          if (error.status !== 409 || ['name_in_use','request_mismatch'].includes(error.code)) {
            clearPending(job);
            if (automatic) automaticPending = null; else pending = null;
          }
          throw error;
        }
        if (['rotation_not_configured','backend_unhealthy'].includes(error.code)) {
          clearPending(job);
          if (automatic) automaticPending = null; else pending = null;
          throw error;
        }
        uncertain = true;
      }
      if (version !== epoch) return;
      status('Rotating…');
      if (await pollRotation(job,version,deadline)) {
        clearPending(job);
        if (automatic) automaticPending = null; else {pending = null; automaticPending = null;}
        status(); return true;
      } else if (version === epoch) {
        const message = uncertain ? 'Rotation could not be confirmed. Try again.' : 'Rotation is still pending. Try again.';
        status(message);
        if (automatic) browserError(currentOrigin,message);
      }
    } catch (error) {
      if (version !== epoch) return;
      if ([401,403].includes(error.status)) forget();
      const message = automatic && error.status === 429 ? 'Auto rotation paused. Use Retry.' : errorText(error);
      status(message);
      if (automatic) browserError(currentOrigin,message);
    } finally {
      if (version === epoch) { busy = false; operation = ''; render(); void refreshHistory(version); }
    }
    return false;
  }

  async function rotate(event) {
    event.preventDefault();
    if (busy || !verified || !session) return;
    if (automaticPending) {status('Finish the pending rotation with Retry.');return;}
    const name = fields.name.value;
    if (!validName(name)) {
      status(RESERVED_NAMES.has(name) || name.includes('--') ? 'Choose another name.' : 'Use 1–8 lowercase letters, digits or hyphens. Start with a letter and end with a letter or digit.');
      fields.name.focus(); return;
    }
    await performRotation(name);
  }

  function browserError(origin,message) {
    status(message);
    window.dispatchEvent(new CustomEvent('site:browser-error',{detail:{runtimeOrigin:origin,message}}));
  }

  function randomName() {
    const bytes = new Uint8Array(12);
    let name = '';
    do {
      name = '';
      while (name.length < 6) {
        crypto.getRandomValues(bytes);
        for (const value of bytes) {
          if (value < 234) name += String.fromCharCode(97+value%26);
          if (name.length === 6) break;
        }
      }
    } while (!validName(name) || 'https://' + name + RUNTIME_SUFFIX === currentOrigin);
    return name;
  }

  async function browserFailed(value) {
    const origin = runtimeOrigin(value);
    if (currentRoute !== 'browser' || !origin || origin !== currentOrigin || !verified || !session || !autoEnabled || busy) return false;
    if (failureOrigin !== origin) {failureOrigin = origin; failureCount = 0;}
    if (pending || failureCount >= 2) {browserError(origin,'Automatic recovery paused. Use Retry.');return false;}
    failureCount++;
    if (failureCount === 2) {
      if (Date.now() < autoCooldownUntil) {browserError(origin,'Auto rotation paused. Use Retry.');return false;}
      return performRotation(automaticPending?.name || randomName(),true);
    }
    const version = epoch;
    busy = true; operation = 'verify'; render();
    try {
      if (!await checkOwner(session,version)) return false;
      if (currentRoute !== 'browser' || currentOrigin !== origin || !autoEnabled) return false;
      window.dispatchEvent(new CustomEvent('site:browser-retry',{detail:{runtimeOrigin:origin}}));
      return true;
    } catch (error) {
      if (version !== epoch) return false;
      if ([401,403].includes(error.status)) forget();
      browserError(origin,errorText(error));
      return false;
    } finally {
      if (version === epoch) {busy = false; operation = ''; render();}
    }
  }

  function browserReady(value) {
    const origin = runtimeOrigin(value);
    if (currentRoute === 'browser' && origin && origin === currentOrigin) resetFailures();
  }

  function mount(container) {
    if (!(container instanceof HTMLElement)) throw new TypeError('Owner panel needs a container');
    if (host === container) { render(); return container; }
    host = container;
    host.classList.add('site-owner');
    host.innerHTML = '<form class="site-owner-login" novalidate>' +
      '<label>Username<input name="username" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="64" required></label>' +
      '<label>PIN<input name="pin" type="password" inputmode="numeric" autocomplete="current-password" maxlength="128" required></label>' +
      '<button type="submit">Sign in</button></form>' +
      '<form class="site-owner-controls" novalidate hidden>' +
      '<label class="site-owner-auto"><input name="automatic" type="checkbox">Auto rotate</label>' +
      '<label>New name<input name="name" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="8" required></label>' +
      '<button type="submit">Rotate Browser</button><button class="site-owner-recover" type="button" hidden>Retry</button><button class="site-owner-signout" type="button">Sign out</button></form>' +
      '<p class="site-owner-status" role="status" aria-live="polite"></p><section class="site-owner-log" aria-label="Automatic changes" hidden></section>';
    const login = host.querySelector('.site-owner-login'), controls = host.querySelector('.site-owner-controls');
    fields = {
      login, controls, username:login.elements.username, pin:login.elements.pin,
      signin:login.querySelector('button'), name:controls.elements.name,
      rotate:controls.querySelector('button[type=submit]'), auto:controls.elements.automatic,
      recover:controls.querySelector('.site-owner-recover'),
      status:host.querySelector('.site-owner-status'), history:host.querySelector('.site-owner-log')
    };
    login.addEventListener('submit',signin);
    controls.addEventListener('submit',rotate);
    fields.recover.addEventListener('click',() => {if (!busy && automaticPending) void performRotation(automaticPending.name,true,true);});
    fields.auto.addEventListener('change',() => {autoEnabled = fields.auto.checked; resetFailures();});
    host.querySelector('.site-owner-signout').addEventListener('click',() => {forget(); status(); fields.username.focus();});
    render();
    return container;
  }

  function onRoute(page) {
    const next = String(page).replace(/^\//,'');
    const entering = next === 'owner' && currentRoute !== 'owner';
    if (currentRoute !== next && next !== 'browser') resetFailures();
    currentRoute = next;
    render();
    if (entering) void verifyOnEntry();
  }

  window.SiteOwner = Object.freeze({mount,onRoute,browserFailed,browserReady});
})();
