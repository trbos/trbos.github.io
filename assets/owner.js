(() => {
  'use strict';

  const SUPABASE_URL = 'https://bawybmihvidtmpfpyajg.supabase.co';
  const PUBLIC_KEY = 'sb_publishable_T-s9qOd-4eUg9xbC4YQEEg_FSkd2SL-';
  const CONTROL_URL = SUPABASE_URL + '/functions/v1/site-control';
  const RUNTIME_SUFFIX = '--wordbuilder--675vggg6lnyg.code.run';
  const RESERVED_NAMES = new Set(['p01','launch','admin','api','www','assets','internal','root']);
  const TARGETS = ['browser','polytrack'];
  const POLL_LIMIT = 90000, HEALTH_INTERVAL = 60000, CONFIRM_DELAY = 15000;
  const AUTO_COOLDOWN = 30*60*1000;
  const PENDING_KEY = 'trbos.site-owner.pending.v1';
  let host = null, fields = null, session = null, verified = false;
  let backups = null, backupsLoading = null, ownerCheck = null;
  let gameRequests = null, gameRequestsLoading = null;
  let busy = false, operation = '', epoch = 0, pending = null;
  let currentRoute = location.hash.slice(2).split('?')[0] || 'home';
  let selectedTarget = 'browser', operationTarget = 'browser', configRevision = 0;
  let wakeTimer = null, monitorRunning = false, historyTicket = 0, recoveryAt = 0, recoveryProof = null;
  const origins = {browser:null,polytrack:null}, drafts = {browser:'',polytrack:''};
  const automatic = Object.fromEntries(TARGETS.map(target => [target,{
    enabled:false,cooldownUntil:0,origin:null,failures:0,nextProbe:0,frameFailed:false,frameRetried:false
  }]));

  class RequestError extends Error {
    constructor(status = 0, code = '', retryAfter = 0) {
      super('Request failed'); this.status = status; this.code = code; this.retryAfter = retryAfter;
    }
  }

  function validName(value) {
    return typeof value === 'string' && /^[a-z](?:[a-z0-9-]{0,6}[a-z0-9])?$/.test(value) && !value.includes('--') && !RESERVED_NAMES.has(value);
  }
  function validTargetName(value,target) {return validName(value) || target === 'polytrack' && value === 'launch';}
  function runtimeOrigin(value, target = 'browser') {
    if (typeof value !== 'string') return null;
    const match = /^https:\/\/([a-z](?:[a-z0-9-]{0,6}[a-z0-9])?)--wordbuilder--675vggg6lnyg\.code\.run$/.exec(value);
    return match && (validName(match[1]) || target === 'polytrack' && match[1] === 'launch') ? value : null;
  }
  function configOrigin(data,target) {
    return runtimeOrigin(target === 'polytrack' ? data?.polytrackOrigin : data?.runtimeOrigin,target);
  }
  function freshConfig(data) {
    return TARGETS.every(target => configOrigin(data,target)) && data.runtimeOrigin !== data.polytrackOrigin &&
      Number.isSafeInteger(data.configRevision) && data.configRevision >= 1 && data.configRevision >= configRevision;
  }
  function resetFailures(target) {
    for (const name of target ? [target] : TARGETS) {
      const state = automatic[name]; state.origin = null; state.failures = 0; state.nextProbe = 0;
      state.frameFailed = false; state.frameRetried = false;
    }
  }
  function publishConfig(data) {
    if (!freshConfig(data)) return false;
    configRevision = data.configRevision;
    for (const target of TARGETS) {
      const origin = configOrigin(data,target);
      if (origins[target] !== origin) {origins[target] = origin;resetFailures(target);}
      window.dispatchEvent(new CustomEvent(target === 'polytrack' ? 'site:polytrack-config' : 'site:browser-config',{
        detail:{...(target === 'polytrack' ? {polytrackOrigin:origin} : {runtimeOrigin:origin}),configRevision}
      }));
    }
    return true;
  }
  for (const target of TARGETS) window.addEventListener(target === 'polytrack' ? 'site:polytrack-config' : 'site:browser-config',event => {
    const origin = configOrigin(event.detail,target), revision = event.detail?.configRevision;
    if (!origin || !Number.isSafeInteger(revision) || revision < 1 || revision < configRevision) return;
    configRevision = revision;
    if (origins[target] !== origin) {origins[target] = origin;resetFailures(target);}
  });

  function storePending(job) {
    try {localStorage.setItem(PENDING_KEY,JSON.stringify(job));}
    catch { /* Recovery still works in this tab when storage is unavailable. */ }
  }
  function clearPending(job) {
    try {
      const saved = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
      if (saved?.requestId === job.requestId && (saved.target || 'browser') === job.target) localStorage.removeItem(PENDING_KEY);
    } catch { /* Storage can be disabled independently of sign-in. */ }
    if (pending?.requestId === job.requestId) pending = null;
    if (recoveryProof?.requestId === job.requestId) recoveryProof = null;
  }
  function restorePending() {
    let job;
    try {job = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');} catch {return;}
    const target = job?.target === undefined ? 'browser' : job.target;
    if (!job || !validTargetName(job.name,target) || typeof job.automatic !== 'boolean' || !TARGETS.includes(target) ||
      typeof job.requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(job.requestId) ||
      job.targetOrigin !== 'https://' + job.name + RUNTIME_SUFFIX ||
      job.sourceOrigin !== undefined && !runtimeOrigin(job.sourceOrigin,target) ||
      job.fromOrigin !== undefined && !runtimeOrigin(job.fromOrigin,target)) return;
    pending = {name:job.name,requestId:job.requestId,automatic:job.automatic,target,targetOrigin:job.targetOrigin,
      ...(job.sourceOrigin ? {sourceOrigin:job.sourceOrigin} : {}),...(job.fromOrigin ? {fromOrigin:job.fromOrigin} : {})};
    selectedTarget = target; drafts[target] = job.name; fields.name.value = job.name; recoveryAt = 0;
  }
  function announceOwner(owner) {
    window.dispatchEvent(new CustomEvent('site:owner',{detail:{owner}}));
  }
  function announceSettings() {
    window.dispatchEvent(new CustomEvent('site:owner-settings',{detail:{polytrackAuto:verified && automatic.polytrack.enabled}}));
  }

  async function readJSON(response, limit) {
    if (Number(response.headers.get('content-length')) > limit) throw new RequestError();
    const reader = response.body?.getReader();
    if (!reader) throw new RequestError();
    const decoder = new TextDecoder(); let text = '', bytes = 0;
    try {
      for (;;) {
        const chunk = await reader.read(); if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > limit) throw new RequestError();
        text += decoder.decode(chunk.value,{stream:true});
      }
      return JSON.parse(text + decoder.decode());
    } finally {try {void reader.cancel().catch(() => {});} catch { /* Already closed or aborted. */ }}
  }
  async function request(url, options = {}, timeout = 12000, limit = 131072) {
    const controller = new AbortController();
    let timer;
    const deadline = new Promise((_,reject) => {timer = setTimeout(() => {
      controller.abort();reject(new RequestError());
    },Math.max(1,timeout));});
    const work = (async () => {
      const response = await fetch(url,{
        ...options,signal:controller.signal,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',redirect:'error'
      });
      let data;
      try {data = await readJSON(response,limit);} catch {throw new RequestError(response.ok ? 0 : response.status);}
      if (!response.ok) {
        const code = typeof data?.error === 'string' && /^[a-z_]{1,64}$/.test(data.error) ? data.error : '';
        const seconds = Number(data?.retryAfter ?? response.headers.get('retry-after'));
        throw new RequestError(response.status,code,Number.isFinite(seconds) ? Math.max(0,Math.min(86400,seconds)) : 0);
      }
      return data;
    })();
    try {return await Promise.race([work,deadline]);}
    catch (error) {throw error instanceof RequestError ? error : new RequestError();}
    finally {clearTimeout(timer);}
  }
  function control(action, token, values = {}, timeout) {
    return request(CONTROL_URL,{
      method:'POST',headers:{'Content-Type':'application/json',apikey:PUBLIC_KEY,Authorization:'Bearer ' + token},
      body:JSON.stringify({action,...values})
    },timeout);
  }
  async function auth(grant, values) {
    const data = await request(SUPABASE_URL + '/auth/v1/token?grant_type=' + grant,{
      method:'POST',headers:{'Content-Type':'application/json',apikey:PUBLIC_KEY},body:JSON.stringify(values)
    });
    if (typeof data.access_token !== 'string' || typeof data.refresh_token !== 'string') throw new RequestError();
    const expiresAt = Number(data.expires_at) || Math.floor(Date.now()/1000) + Number(data.expires_in || 0);
    if (!Number.isFinite(expiresAt) || expiresAt <= 0) throw new RequestError();
    return {accessToken:data.access_token,refreshToken:data.refresh_token,expiresAt};
  }
  async function refreshSession(candidate) {
    try {return await auth('refresh_token',{refresh_token:candidate.refreshToken});}
    catch (error) {if ([400,401,403].includes(error.status)) throw new RequestError(401);throw error;}
  }
  function checkOwner(candidate, version) {
    if (ownerCheck?.version === version) return ownerCheck.promise;
    const promise = (async () => {
      let next = candidate;
      if (next.expiresAt <= Date.now()/1000 + 60) next = await refreshSession(next);
      let data;
      try {data = await control('owner',next.accessToken);}
      catch (error) {
        if (error.status !== 401) throw error;
        next = await refreshSession(next);
        data = await control('owner',next.accessToken);
      }
      if (data?.owner !== true || !configOrigin(data,'browser') || !configOrigin(data,'polytrack')) throw new RequestError(403);
      if (version !== epoch) return false;
      session = next; verified = true; publishConfig(data); announceOwner(true); return true;
    })();
    ownerCheck = {version,promise};
    void promise.finally(() => {if (ownerCheck?.promise === promise) ownerCheck = null;}).catch(() => {});
    return promise;
  }
  function budget(deadline,limit) {
    const remaining = deadline-Date.now(); if (remaining <= 0) throw new RequestError(); return Math.min(limit,remaining);
  }
  async function publicConfig(deadline = Infinity) {
    const data = await request(CONTROL_URL,{},budget(deadline,5000));
    if (!freshConfig(data)) throw new RequestError(0,'stale_config');
    publishConfig(data); return data;
  }
  async function healthy(target,origin,deadline = Infinity) {
    const nonce = crypto.randomUUID();
    try {
      const data = await request(origin + '/.well-known/site-health?nonce=' + nonce,{},budget(deadline,5000),4096);
      return data?.version === 1 && data.service === 'wordbuilder' && data.target === target &&
        data.nonce === nonce && data.origin === origin && data.ready === true;
    } catch {return false;}
  }

  function status(text = '') {if (fields) fields.status.textContent = text;}
  function render() {
    if (!fields) return;
    host.hidden = currentRoute !== 'owner'; fields.login.hidden = verified; fields.controls.hidden = !verified;
    fields.history.hidden = !verified; backups?.setOwner(verified); gameRequests?.setOwner(verified);
    for (const field of [fields.username,fields.pin,fields.signin,fields.name,fields.auto]) field.disabled = busy;
    fields.name.readOnly = pending?.target === selectedTarget;
    fields.rotate.disabled = busy || !!pending;
    fields.auto.checked = automatic[selectedTarget].enabled;
    for (const button of fields.targets) {
      button.setAttribute('aria-pressed',String(button.dataset.target === selectedTarget)); button.disabled = busy;
    }
    fields.recover.hidden = !pending; fields.recover.disabled = busy;
    fields.signin.textContent = busy && operation === 'signin' ? 'Signing in…' : 'Sign in';
    fields.rotate.textContent = busy && operation === 'rotate' ? operationTarget === 'polytrack' ? 'Renaming…' : 'Rotating…' : selectedTarget === 'polytrack' ? 'Rename PolyTrack' : 'Rotate Browser';
    host.setAttribute('aria-busy',String(busy));
  }
  function forget() {
    epoch++; session = null; verified = false; pending = null; busy = false; operation = ''; ownerCheck = null; recoveryProof = null;
    selectedTarget = 'browser'; operationTarget = 'browser'; drafts.browser = ''; drafts.polytrack = '';
    for (const target of TARGETS) automatic[target].enabled = false;
    resetFailures(); clearTimeout(wakeTimer); wakeTimer = null; historyTicket++;
    if (fields) {fields.pin.value = ''; fields.name.value = ''; fields.history.replaceChildren();}
    announceOwner(false); announceSettings(); render();
  }
  function errorText(error, signin = false) {
    if (error.code === 'invalid_name') return 'Choose another name.';
    if (error.code === 'name_in_use') return 'Name unavailable.';
    if (['operation_in_progress','lease_lost','backend_pending'].includes(error.code)) return 'Rotation pending. Retry will resume it.';
    if (error.code === 'configuration_conflict') return 'Backend configuration changed. Try again later.';
    if (error.code === 'rotation_not_configured') return 'Rotation is unavailable.';
    if (['backend_unhealthy','backend_unreachable'].includes(error.code)) return 'Backend is unreachable. Use Retry.';
    if (error.code === 'fresh_health_required' || error.code === 'stale_origin') return 'Checking current backend…';
    if (error.status === 429) return 'Auto rotation paused. Use Retry.';
    if (error.status === 403) return 'Owner access required.';
    if (error.status === 401) return signin ? 'Sign in failed.' : 'Sign in again.';
    if (error.status === 400) return signin ? 'Sign in failed.' : 'Unable to use that name.';
    if (error.status === 409) return 'Name unavailable or a rotation is already running.';
    return signin ? 'Unable to sign in. Try again.' : 'Unable to connect. Try again.';
  }
  async function signin(event) {
    event.preventDefault(); if (busy) return;
    const username = fields.username.value.trim().toLowerCase(), pin = fields.pin.value;
    if (!username || !pin) {status('Enter your username and PIN.');return;}
    const version = ++epoch; fields.pin.value = ''; busy = true; operation = 'signin'; status(); render();
    try {
      const candidate = await auth('password',{email:username + '@players.jambling.invalid',password:'Jambling2:' + pin});
      if (version !== epoch) return;
      if (await checkOwner(candidate,version)) {
        for (const target of TARGETS) automatic[target].enabled = true;
        resetFailures(); restorePending(); announceSettings(); void refreshHistory(version);
      }
    } catch (error) {
      if (version !== epoch) return; forget(); status(errorText(error,true));
    } finally {if (version === epoch) {busy = false; operation = ''; render(); schedule(500);}}
  }
  async function verifyOnEntry() {
    if (!session || busy) return;
    const version = epoch; verified = false; busy = true; operation = 'verify'; status('Checking…'); render();
    try {if (await checkOwner(session,version)) {status();void refreshHistory(version);}}
    catch (error) {if (version === epoch) {if ([401,403].includes(error.status)) forget();status(errorText(error));}}
    finally {if (version === epoch) {busy = false; operation = ''; render(); schedule(500);}}
  }
  async function refreshHistory(version = epoch) {
    if (!session || !verified) return;
    const ticket = ++historyTicket, target = selectedTarget;
    try {
      const data = await control('history',session.accessToken,{target});
      if (version !== epoch || ticket !== historyTicket || !verified || !fields || selectedTarget !== target) return;
      if (!Array.isArray(data?.entries)) throw new RequestError();
      const heading = document.createElement('h2'); heading.textContent = 'Log';
      const entries = data.entries.slice(0,50).filter(entry => entry && (entry.target || 'browser') === target);
      if (!entries.length) {
        const empty = document.createElement('p'); empty.textContent = 'No automatic changes.'; fields.history.replaceChildren(heading,empty); return;
      }
      const table = document.createElement('table'), row = table.createTHead().insertRow();
      for (const label of ['Time','From','To','Status']) {const cell = document.createElement('th');cell.scope = 'col';cell.textContent = label;row.append(cell);}
      const tbody = table.createTBody();
      for (const entry of entries) {
        const row = tbody.insertRow(), date = new Date(entry.at);
        row.insertCell().textContent = Number.isFinite(date.getTime()) ? date.toLocaleString() : '—';
        for (const value of [entry.from,entry.to]) {
          const cell = row.insertCell(), origin = runtimeOrigin(value,target);
          cell.textContent = origin ? origin.slice(8,-RUNTIME_SUFFIX.length) : '—'; if (origin) cell.title = origin;
        }
        row.insertCell().textContent = typeof entry.status === 'string' && /^[a-z_ -]{1,32}$/.test(entry.status) ? entry.status.replaceAll('_',' ') : '—';
      }
      fields.history.replaceChildren(heading,table);
    } catch (error) {
      if (version !== epoch || ticket !== historyTicket || !fields) return;
      if ([401,403].includes(error.status)) {forget();status(errorText(error));return;}
      const unavailable = document.createElement('p'); unavailable.textContent = 'Log unavailable.'; fields.history.replaceChildren(unavailable);
    }
  }

  function foreground() {return document.visibilityState === 'visible' && navigator.onLine !== false;}
  function eligible() {return verified && !!session && foreground() && ['owner','browser'].includes(currentRoute);}
  function schedule(delay = HEALTH_INTERVAL) {
    clearTimeout(wakeTimer); wakeTimer = null;
    if (eligible()) wakeTimer = setTimeout(() => {wakeTimer = null;void monitor();},Math.max(100,delay));
  }
  function retryFrame(origin) {
    if (currentRoute === 'browser' && origin === origins.browser) window.dispatchEvent(new CustomEvent('site:browser-retry',{detail:{runtimeOrigin:origin}}));
  }
  function browserError(origin,message) {
    status(message); window.dispatchEvent(new CustomEvent('site:browser-error',{detail:{runtimeOrigin:origin,message}}));
  }
  function randomName() {
    const bytes = new Uint8Array(12); let name;
    do {
      name = '';
      while (name.length < 6) {
        crypto.getRandomValues(bytes);
        for (const value of bytes) {if (value < 234) name += String.fromCharCode(97+value%26);if (name.length === 6) break;}
      }
    } while (!validName(name) || TARGETS.some(target => origins[target] === 'https://' + name + RUNTIME_SUFFIX));
    return name;
  }
  function finished(job,data) {
    if (!publishConfig(data)) return false;
    clearPending(job); resetFailures(job.target);
    if (job.automatic) automatic[job.target].cooldownUntil = Date.now() + AUTO_COOLDOWN;
    status(); return true;
  }
  function jobMatches(data,job) {
    return data?.requestId === job.requestId && data.name === job.name && data.target === job.target &&
      data.automatic === job.automatic && data.targetOrigin === job.targetOrigin;
  }
  async function reconcile(job,version,deadline) {
    try {
      const data = await control('operation',session.accessToken,{requestId:job.requestId},budget(deadline,6000));
      if (version !== epoch) return {wait:3000};
      if (!jobMatches(data,job) || !['working','complete'].includes(data.state)) throw new RequestError(409,'operation_in_progress',30);
      if (data.fromOrigin != null) {
        if (!runtimeOrigin(data.fromOrigin,job.target) || job.fromOrigin && data.fromOrigin !== job.fromOrigin) throw new RequestError(409,'operation_in_progress',30);
        if (job.automatic && !job.fromOrigin) {job.fromOrigin = data.fromOrigin;storePending(job);}
      }
      publishConfig(data);
      if (data.state === 'complete') {
        if (finished(job,data)) return {done:true};
        // The server job is complete; a newer public revision may already supersede its address.
        return {done:finished(job,await publicConfig(deadline))};
      }
      const seconds = Number(data.retryAfter);
      return {wait:Number.isFinite(seconds) ? Math.max(0,Math.min(86400,seconds))*1000 : 3000};
    } catch (error) {
      if (error.status !== 404 || error.code !== 'operation_not_found') throw error;
      const data = await publicConfig(deadline);
      const current = configOrigin(data,job.target);
      if (current === job.targetOrigin || job.sourceOrigin && current !== job.sourceOrigin) return {done:finished(job,data)};
      if (job.automatic) {
        // Local pending metadata proves no failure. A server-unknown automatic job needs fresh probes after sign-in.
        if (!eligible() || !automatic[job.target].enabled) throw new RequestError(400,'fresh_health_required');
        if (job.fromOrigin && job.fromOrigin !== current) return {done:finished(job,data)};
        if (recoveryProof?.requestId === job.requestId && recoveryProof.origin === current && Date.now() < recoveryProof.at + CONFIRM_DELAY) return {wait:recoveryProof.at + CONFIRM_DELAY-Date.now()};
        if (await healthy(job.target,current,deadline)) {
          if (version !== epoch) return {wait:3000};
          clearPending(job);resetFailures(job.target);status();return {done:true};
        }
        if (version !== epoch || !eligible()) return {wait:CONFIRM_DELAY};
        let confirmed;
        try {confirmed = await publicConfig(deadline);} catch (error) {recoveryProof = null;throw error;}
        if (configOrigin(confirmed,job.target) !== current) return {done:finished(job,confirmed)};
        if (!recoveryProof || recoveryProof.requestId !== job.requestId || recoveryProof.origin !== current) {
          recoveryProof = {requestId:job.requestId,origin:current,at:Date.now()};
          if (job.target === 'browser') retryFrame(current);
          return {wait:CONFIRM_DELAY};
        }
        if (!job.fromOrigin) {job.fromOrigin = current;job.sourceOrigin = current;storePending(job);}
        recoveryProof = null;
      }
      return {wait:0};
    }
  }
  function definitive(error) {
    return error.status === 400 || ['name_in_use','request_mismatch','rotation_not_configured','backend_unhealthy','backend_unreachable','stale_origin'].includes(error.code) || error.status === 429;
  }
  async function performRotation(name, isAutomatic = false, recover = false, target = 'browser') {
    if (busy || !verified || !session || !TARGETS.includes(target) || !foreground()) return false;
    if (pending && (!recover || pending.name !== name || pending.target !== target || pending.automatic !== isAutomatic)) return false;
    const version = epoch, originalOrigin = origins[target];
    busy = true; operation = 'rotate'; operationTarget = target; status(target === 'polytrack' ? 'Renaming…' : 'Rotating…'); render();
    let job = pending;
    try {
      if (!await checkOwner(session,version) || version !== epoch || !foreground()) return false;
      if (isAutomatic && !recover && (!eligible() || !automatic[target].enabled || originalOrigin !== origins[target] || Date.now() < automatic[target].cooldownUntil)) {status();return false;}
      if (!job && origins[target] === 'https://' + name + RUNTIME_SUFFIX) {status();return true;}
      if (!job) job = {name,requestId:crypto.randomUUID(),target,targetOrigin:'https://' + name + RUNTIME_SUFFIX,sourceOrigin:origins[target],automatic:isAutomatic,...(isAutomatic ? {fromOrigin:origins[target]} : {})};
      pending = job; storePending(job); render();
      const deadline = Date.now() + POLL_LIMIT; let resumeAt = 0, first = !recover, backoff = 3000;
      while (version === epoch && verified && session && foreground() && Date.now() < deadline) {
        try {
          if (!first) {
            const result = await reconcile(job,version,deadline);
            if (version !== epoch || !foreground()) return false;
            if (result.done) return true;
            if (result.wait > 0) {
              // Never resume a lease held by another invocation, including leases longer than this poll window.
              resumeAt = Math.max(resumeAt,Date.now() + result.wait);
            }
          }
          first = false;
          if (Date.now() < resumeAt) {
            await new Promise(resolve => setTimeout(resolve,Math.min(30000,resumeAt-Date.now(),deadline-Date.now()))); continue;
          }
          if (version !== epoch || !foreground() || !verified || !session) break;
          const data = await control('rename',session.accessToken,{name:job.name,requestId:job.requestId,target:job.target,...(job.automatic ? {automatic:true,fromOrigin:job.fromOrigin} : {})},budget(deadline,12000));
          if (version !== epoch) return false;
          if (data.name !== job.name || data.target !== job.target || data.targetOrigin !== job.targetOrigin || data.status !== 'complete') throw new RequestError();
          if (finished(job,data)) return true;
          throw new RequestError(0,'stale_config');
        } catch (error) {
          if (version !== epoch) return false;
          if ([401,403].includes(error.status)) throw error;
          if (error.status === 429) automatic[job.target].cooldownUntil = Date.now() + Math.max(AUTO_COOLDOWN,error.retryAfter*1000);
          if (definitive(error)) {
            clearPending(job);resetFailures(job.target);
            if (job.automatic && ['backend_unhealthy','backend_unreachable','rotation_not_configured'].includes(error.code)) automatic[job.target].cooldownUntil = Date.now() + AUTO_COOLDOWN;
            if (error.code === 'stale_origin') {try {await publicConfig();} catch { /* A later probe requires fresh config again. */ }}
            throw error;
          }
          const wait = Math.max(backoff,error.retryAfter*1000);
          resumeAt = Date.now() + wait;
          backoff = Math.min(30000,backoff*2);
          await new Promise(resolve => setTimeout(resolve,Math.max(1,Math.min(wait,30000,deadline-Date.now()))));
        }
      }
      if (version === epoch) {status('Rotation pending. Retry will resume it.');recoveryAt = Date.now() + HEALTH_INTERVAL;}
    } catch (error) {
      if (version !== epoch) return false;
      if ([401,403].includes(error.status)) forget();
      status(errorText(error));
      if (isAutomatic && target === 'browser') browserError(origins.browser,errorText(error));
    } finally {
      if (version === epoch) {busy = false; operation = ''; render();void refreshHistory(version);schedule();}
    }
    return false;
  }
  async function monitor() {
    if (!eligible() || monitorRunning) return;
    if (busy) {schedule(5000);return;}
    monitorRunning = true; const version = epoch;
    try {
      if (!await checkOwner(session,version) || version !== epoch || !eligible() || busy) return;
      if (pending) {
        if (Date.now() >= recoveryAt) await performRotation(pending.name,pending.automatic,true,pending.target);
        return;
      }
      for (const target of TARGETS) {
        const state = automatic[target], origin = origins[target];
        if (!state.enabled || !origin || state.nextProbe > Date.now()) continue;
        if (!eligible() || busy || version !== epoch) break;
        const ok = await healthy(target,origin);
        if (!eligible() || busy || version !== epoch || origins[target] !== origin || !state.enabled) continue;
        state.nextProbe = Date.now() + HEALTH_INTERVAL;
        if (ok) {
          state.origin = origin; state.failures = 0;
          if (target === 'browser' && state.frameFailed) {
            state.frameFailed = false;
            if (!state.frameRetried) {state.frameRetried = true;retryFrame(origin);}
            else browserError(origin,'Backend is reachable. Use Retry.');
          }
          continue;
        }
        // A blocked control connection, a stale config, offline state or a hidden tab cannot authorize rotation.
        try {await publicConfig();} catch {state.failures = 0;continue;}
        if (!eligible() || busy || version !== epoch || origins[target] !== origin || !state.enabled) continue;
        if (state.origin !== origin) {state.origin = origin;state.failures = 0;}
        state.failures++;
        if (state.failures === 1) {
          state.nextProbe = Date.now() + CONFIRM_DELAY;
          if (target === 'browser') {state.frameRetried = true;state.frameFailed = false;retryFrame(origin);}
          continue;
        }
        // Recheck authorization immediately before creating the shared-service operation.
        if (state.cooldownUntil > Date.now()) {state.failures = 0;status('Auto rotation paused. Use Retry.');continue;}
        await performRotation(randomName(),true,false,target);
        break;
      }
    } catch (error) {
      if (version === epoch) {
        resetFailures(); if ([401,403].includes(error.status)) forget(); status(errorText(error));
      }
    } finally {
      monitorRunning = false;
      if (version === epoch && eligible()) {
        const next = pending ? Math.max(1000,recoveryAt-Date.now()) : Math.min(HEALTH_INTERVAL,...TARGETS.filter(target => automatic[target].enabled).map(target => Math.max(1000,automatic[target].nextProbe-Date.now())));
        schedule(next);
      }
    }
  }
  async function rotate(event) {
    event.preventDefault(); if (busy || !verified || !session || pending) return;
    const name = fields.name.value;
    if (!validTargetName(name,selectedTarget)) {
      status(RESERVED_NAMES.has(name) || name.includes('--') ? 'Choose another name.' : 'Use 1–8 lowercase letters, digits or hyphens. Start with a letter and end with a letter or digit.');
      fields.name.focus(); return;
    }
    drafts[selectedTarget] = name; await performRotation(name,false,false,selectedTarget);
  }
  function selectTarget(target) {
    if (busy || !TARGETS.includes(target)) return;
    drafts[selectedTarget] = fields.name.value; selectedTarget = target;
    fields.name.value = pending?.target === target ? pending.name : drafts[target]; status(); render();void refreshHistory();
  }
  function browserFailed(value) {
    const origin = runtimeOrigin(value);
    if (currentRoute !== 'browser' || !origin || origin !== origins.browser || !eligible() || !automatic.browser.enabled) return false;
    automatic.browser.frameFailed = true;
    if (!automatic.browser.failures) automatic.browser.nextProbe = 0;
    schedule(100); return true;
  }
  function browserReady(value) {
    const origin = runtimeOrigin(value);
    if (currentRoute === 'browser' && origin && origin === origins.browser) {
      const state = automatic.browser; state.failures = 0; state.frameFailed = false; state.frameRetried = false;
    }
  }
  function keepPolyTrackControl() {return verified && !!session && automatic.polytrack.enabled;}
  async function submitGame(values) {
    if (!verified || !session) throw new RequestError(401);
    const version = epoch;
    try {
      if (!await checkOwner(session,version) || version !== epoch) throw new RequestError(401);
      return await control('game-request-submit',session.accessToken,{requestId:values.id,name:values.name,url:values.url,clientKey:values.clientKey},12000);
    } catch(error) {if(version===epoch&&[401,403].includes(error.status))forget();throw error;}
  }

  function mount(container) {
    if (!(container instanceof HTMLElement)) throw new TypeError('Owner panel needs a container');
    if (host === container) {render();return container;}
    host = container; host.classList.add('site-owner');
    host.innerHTML = '<form class="site-owner-login" novalidate>' +
      '<label>Username<input name="username" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="64" required></label>' +
      '<label>PIN<input name="pin" type="password" inputmode="numeric" autocomplete="current-password" maxlength="128" required></label>' +
      '<button type="submit">Sign in</button></form>' +
      '<form class="site-owner-controls" novalidate hidden>' +
      '<div class="site-owner-targets" role="group" aria-label="Rename target"><button type="button" data-target="browser" aria-pressed="true">Browser</button><button type="button" data-target="polytrack" aria-pressed="false">PolyTrack</button></div>' +
      '<label class="site-owner-auto"><input name="automatic" type="checkbox">Auto rotate</label>' +
      '<label>New name<input name="name" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="8" required></label>' +
      '<button type="submit">Rotate Browser</button><button class="site-owner-recover" type="button" hidden>Retry</button><button class="site-owner-signout" type="button">Sign out</button></form>' +
      '<p class="site-owner-status" role="status" aria-live="polite"></p><section class="site-owner-log" aria-label="Automatic changes" hidden></section>';
    const login = host.querySelector('.site-owner-login'), controls = host.querySelector('.site-owner-controls');
    fields = {
      login,controls,username:login.elements.username,pin:login.elements.pin,signin:login.querySelector('button'),name:controls.elements.name,
      rotate:controls.querySelector('button[type=submit]'),auto:controls.elements.automatic,targets:[...controls.querySelectorAll('[data-target]')],
      recover:controls.querySelector('.site-owner-recover'),status:host.querySelector('.site-owner-status'),history:host.querySelector('.site-owner-log')
    };
    login.addEventListener('submit',signin); controls.addEventListener('submit',rotate);
    for (const button of fields.targets) button.addEventListener('click',() => selectTarget(button.dataset.target));
    fields.recover.addEventListener('click',() => {if (!busy && pending) {recoveryAt = 0;void performRotation(pending.name,pending.automatic,true,pending.target);}});
    fields.auto.addEventListener('change',() => {
      automatic[selectedTarget].enabled = fields.auto.checked;resetFailures(selectedTarget);announceSettings();schedule(500);
    });
    host.querySelector('.site-owner-signout').addEventListener('click',() => {forget();status();fields.username.focus();});
    render();
    if (!backupsLoading) {
      backupsLoading = new Promise((resolve,reject) => {
        const css = document.createElement('link');css.rel='stylesheet';css.href='./assets/owner-backups.css?v=1';document.head.append(css);
        const script = document.createElement('script');script.src='./assets/owner-backups.js?v=1';
        script.onload=resolve;script.onerror=reject;document.head.append(script);
      }).then(() => {
        backups=window.createSiteOwnerBackups(window,host,async body => {
          if (!verified || !session) throw new RequestError(401);
          const version=epoch;
          try {
            if (!await checkOwner(session,version)) throw new RequestError(401);
            return await request(SUPABASE_URL+'/functions/v1/polytrack-restore',{
              method:'POST',headers:{'Content-Type':'application/json',apikey:PUBLIC_KEY,Authorization:'Bearer '+session.accessToken},body:JSON.stringify(body)
            },20000);
          } catch(error) {if(version===epoch&&[401,403].includes(error.status))forget();throw error;}
        });
        backups.setOwner(verified);
      }).catch(() => {backupsLoading=null;if(verified)status('Backups unavailable. Reload.');});
    }
    if (!gameRequestsLoading) {
      gameRequestsLoading = new Promise((resolve,reject) => {
        const css = document.createElement('link');css.rel='stylesheet';css.href='./assets/owner-game-requests.css?v=1';document.head.append(css);
        const script = document.createElement('script');script.src='./assets/owner-game-requests.js?v=starting-3';
        script.onload=resolve;script.onerror=reject;document.head.append(script);
      }).then(() => {
        gameRequests=window.createSiteOwnerGameRequests(window,host,async body => {
          if (!verified || !session) throw new RequestError(401);
          const version=epoch;
          try {
            if (!await checkOwner(session,version)) throw new RequestError(401);
            return await control(body.action,session.accessToken,Object.fromEntries(Object.entries(body).filter(([key])=>key!=='action')),body.action==='game-request-delete'?30000:12000);
          } catch(error) {if(version===epoch&&[401,403].includes(error.status))forget();throw error;}
        });
        gameRequests.setOwner(verified);
      }).catch(() => {gameRequestsLoading=null;if(verified)status('Game requests unavailable. Reload.');});
    }
    return container;
  }
  function onRoute(page) {
    const next = String(page).replace(/^\//,''), entering = next === 'owner' && currentRoute !== 'owner';
    currentRoute = next; render();
    if (!['owner','browser'].includes(next)) resetFailures();
    if (entering) void verifyOnEntry(); else schedule(500);
  }
  function resume() {
    if (!foreground()) {resetFailures();recoveryProof = null;clearTimeout(wakeTimer);wakeTimer = null;return;}
    recoveryAt = 0; schedule(500);
  }
  document.addEventListener('visibilitychange',resume);
  window.addEventListener('online',resume); window.addEventListener('offline',resume);
  window.SiteOwner = Object.freeze({mount,onRoute,browserFailed,browserReady,keepPolyTrackControl,submitGame,isOwner:()=>verified&&!!session});
})();
