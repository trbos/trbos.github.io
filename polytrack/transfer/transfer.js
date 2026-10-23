(() => {
  'use strict';
  const SOURCE = 'https://p01--wordbuilder--675vggg6lnyg.code.run';
  const TARGET = 'https://launch--wordbuilder--675vggg6lnyg.code.run';
  const GITHUB = 'https://trbos.github.io';
  const GITHUB_ENTRY = '/polytrack/transfer/';
  const ENTRY = '/polytrack-save-transfer/';
  const githubFlow = location.origin === GITHUB || new URLSearchParams(location.search).get('destination') === 'github';
  const GAME = githubFlow ? GITHUB + '/polytrack/' : TARGET + '/polytrack/play/';
  const MARKER = githubFlow ? 'github:polytrack:import:v1' : 'launch:polytrack:p01-import:v1';
  const status = document.getElementById('status');
  const actions = document.getElementById('actions');
  const merge = window.PolyTrackSaveMerge;
  let pending = null;

  function button(label, run, primary = false) {
    const element = document.createElement('button');
    element.type = 'button'; element.textContent = label;
    if (primary) element.className = 'primary';
    element.addEventListener('click', run); actions.append(element);
    return element;
  }
  function snapshot() {
    const entries = [];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (merge.isPolyTrackKey(key)) entries.push([key, localStorage.getItem(key)]);
    }
    return entries;
  }
  async function post(path, body) {
    const response = await fetch(path, {
      method: 'POST', headers: {'content-type': 'application/json'},
      body: JSON.stringify(body), credentials: 'omit', cache: 'no-store',
      signal: AbortSignal.timeout(30000), referrerPolicy: 'no-referrer'
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.message || 'Saved progress could not be transferred.');
    return result;
  }
  function githubRecord(key, update) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('PolyTrackSaveTransferBackups', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('backups');
      request.onerror = request.onblocked = () => reject(Error('The save backup could not be stored.'));
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('backups', update ? 'readwrite' : 'readonly');
        const store = tx.objectStore('backups'), read = store.get(key);
        let result;
        read.onsuccess = () => {
          try {
            result = update ? update(read.result) : read.result;
            if (update) { if (result === null) store.delete(key); else store.put(result, key); }
          } catch { tx.abort(); }
        };
        tx.oncomplete = () => { db.close(); resolve(result); };
        tx.onerror = tx.onabort = () => { db.close(); reject(Error('The save backup could not be stored.')); };
      };
    });
  }
  function sourceVisit(source) {
    location.replace((source === 'launch' ? TARGET : SOURCE) + ENTRY + '?destination=github');
  }
  function continueWithoutImport() {
    if (location.origin !== GITHUB) { location.replace(GITHUB + GITHUB_ENTRY + '?skip=1'); return; }
    try { localStorage.setItem(MARKER, 'skipped'); } catch {}
    location.replace(GAME + '?import=later');
  }
  async function beginGithub() {
    if ([SOURCE, TARGET].includes(location.origin)) {
      const result = await post('/polytrack-transfer/v1/create', { entries: snapshot(), destination: 'github' });
      if (!/^[a-f0-9]{64}$/.test(result.token)) throw Error('The save transfer could not start.');
      location.replace(GITHUB + GITHUB_ENTRY + '#' + result.token);
      return;
    }
    if (location.origin !== GITHUB) throw Error('Open PolyTrack from the launcher.');
    const token = location.hash.slice(1);
    const skip = new URLSearchParams(location.search).get('skip') === '1';
    history.replaceState(null, '', GITHUB_ENTRY);
    if (skip) { continueWithoutImport(); return; }
    if (!token) {
      await githubRecord('github-import-v1:pending', () => null);
      sourceVisit('launch');
      return;
    }
    if (!/^[a-f0-9]{64}$/.test(token)) throw Error('The save transfer token is invalid.');
    const result = await post(TARGET + '/polytrack-transfer/v1/consume', { token });
    if (!['launch', 'p01'].includes(result.source) || !Array.isArray(result.entries)) throw Error('The save transfer response is invalid.');
    const stage = await githubRecord('github-import-v1:pending', previous => {
      const value = previous && Date.now() - previous.createdAt < 30 * 60 * 1000 ? previous :
        { createdAt: Date.now(), targetEntries: snapshot(), sources: {} };
      value.sources[result.source] = merge.mergePolyTrackSaves(result.entries, []).snapshots.source;
      return value;
    });
    if (!stage.sources.launch) { sourceVisit('launch'); return; }
    if (!stage.sources.p01) { sourceVisit('p01'); return; }
    const targetEntries = snapshot();
    const latest = merge.mergePolyTrackSaves(stage.sources.launch, targetEntries);
    const original = merge.mergePolyTrackSaves(stage.sources.p01, latest.entries);
    pending = { sourceEntries: stage.sources.p01, launchEntries: stage.sources.launch, targetEntries,
      originalTargetEntries: stage.targetEntries, conflicts: [...latest.conflicts, ...original.conflicts] };
    await githubRecord('github-import-v1', previous => ({ ...pending,
      originalTargetEntries: previous?.originalTargetEntries || stage.targetEntries, createdAt: previous?.createdAt || stage.createdAt,
      updatedAt: Date.now() }));
    if (!pending.conflicts.length) { write(original.entries); return; }
    status.textContent = 'Some saves differ. Choose which values to keep.';
    actions.replaceChildren();
    button('Merge saves', () => { try { write(original.entries); } catch (error) { fail(error); } }, true);
    // Source choices overwrite only their own keys. Target-only saves and all
    // three original snapshots remain available; storage is never cleared.
    for (const [label, incoming, slotMap] of [['Use launch saves', stage.sources.launch, latest.slotMap], ['Use original saves', stage.sources.p01, original.slotMap]]) {
      button(label, () => {
        try { write(merge.preferPolyTrackValues(incoming, original.entries, slotMap)); }
        catch (error) { fail(error); }
      });
    }
    button('Download backup', download);
  }
  async function backup(sourceEntries, targetEntries) {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('PolyTrackSaveTransferBackups', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('backups');
      request.onerror = () => reject(Error('The save backup could not be stored.'));
      request.onblocked = () => reject(Error('Close other PolyTrack tabs and retry.'));
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction('backups', 'readwrite');
        const store = transaction.objectStore('backups');
        const read = store.get('p01-import-v1');
        read.onsuccess = () => store.put({
          sourceEntries,
          targetEntries: read.result?.targetEntries || targetEntries,
          createdAt: read.result?.createdAt || Date.now(), updatedAt: Date.now()
        }, 'p01-import-v1');
        transaction.oncomplete = () => {database.close(); resolve();};
        transaction.onerror = transaction.onabort = () => {database.close(); reject(Error('The save backup could not be stored.'));};
      };
    });
  }
  function write(entries) {
    if (githubFlow) entries = merge.rebaseGitHubAssets(entries);
    const previous = snapshot();
    const before = new Map(previous), changed = [];
    const previousMarker = localStorage.getItem(MARKER);
    try {
      for (const [key, value] of entries) if (merge.isPolyTrackKey(key)) {
        changed.push(key); localStorage.setItem(key, value);
      }
      localStorage.setItem(MARKER, 'done');
    } catch {
      try {
        for (const key of changed.reverse()) {
          if (before.has(key)) localStorage.setItem(key, before.get(key));
          else localStorage.removeItem(key);
        }
        if (previousMarker === null) localStorage.removeItem(MARKER);
        else localStorage.setItem(MARKER, previousMarker);
      } catch {}
      throw Error('Saved progress could not be stored. The backup is kept.');
    }
    location.replace(GAME);
  }
  function download() {
    if (!pending) return;
    const blob = new Blob([JSON.stringify(pending, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'polytrack-saves-backup.json';
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  function fail(error) {
    status.textContent = error.message || 'Saved progress could not be transferred.';
    actions.replaceChildren();
    button('Retry', () => location.replace(githubFlow ? GITHUB + GITHUB_ENTRY : SOURCE + ENTRY), true);
    if (pending) button('Download backup', download);
    if (githubFlow) button('Continue without import', continueWithoutImport);
  }
  async function begin() {
    if (!merge) throw Error('The save transfer could not load.');
    if (window.top !== window.self) {
      status.textContent = 'Open PolyTrack to transfer saved progress.';
      const link = document.createElement('a');
      link.href = githubFlow ? GITHUB + GITHUB_ENTRY : SOURCE + ENTRY; link.target = '_top'; link.textContent = 'Open PolyTrack'; actions.append(link);
      return;
    }
    if (githubFlow) { await beginGithub(); return; }
    if (location.origin === SOURCE) {
      const result = await post('/polytrack-transfer/v1/create', {entries: snapshot()});
      if (!/^[a-f0-9]{64}$/.test(result.token)) throw Error('The save transfer could not start.');
      location.replace(TARGET + ENTRY + '#' + result.token);
      return;
    }
    if (location.origin !== TARGET) throw Error('Open PolyTrack from the launcher.');
    const token = location.hash.slice(1);
    history.replaceState(null, '', ENTRY);
    if (!/^[a-f0-9]{64}$/.test(token)) {
      if (localStorage.getItem(MARKER) === 'done') location.replace(GAME);
      else location.replace(SOURCE + ENTRY);
      return;
    }
    const result = await post('/polytrack-transfer/v1/consume', {token});
    const targetEntries = snapshot();
    const merged = merge.mergePolyTrackSaves(result.entries, targetEntries);
    pending = {sourceEntries: merged.snapshots.source, targetEntries: merged.snapshots.target};
    await backup(pending.sourceEntries, pending.targetEntries);
    if (!merged.conflicts.length) {write(merged.entries); return;}
    status.textContent = 'Saves differ at both addresses.';
    actions.replaceChildren();
    button('Use old saves', () => {try {write(merge.preferPolyTrackValues(pending.sourceEntries, merged.entries, merged.slotMap));} catch(error) {fail(error);}}, true);
    button('Keep current saves', () => {try {write(merged.entries);} catch(error) {fail(error);}});
    button('Download backup', download);
  }
  begin().catch(fail);
})();
