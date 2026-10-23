(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PolyTrackSaveMerge = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const PREFIX = 'polytrack_v5_prod_';
  const PROFILE = /^polytrack_v5_prod_user_([0-2])$/;
  const RECORD = /^polytrack_v5_prod_record_([0-2])_(default|undeterministic)_(.+)$/;
  const LEGACY = new Set(['polyMods', 'car_colors', 'MyCar', 'carSound', 'polyprocessing_settings', 'polyprocessing_settings_v2', 'polyprocessing_windows_state_v1']);

  function isPolyTrackKey(key) {
    return typeof key === 'string' && (key.startsWith('polytrack_') || LEGACY.has(key));
  }

  function entriesMap(entries) {
    const result = new Map();
    if (!Array.isArray(entries)) return result;
    for (const entry of entries) {
      if (Array.isArray(entry) && entry.length === 2 && isPolyTrackKey(entry[0]) && typeof entry[1] === 'string') result.set(entry[0], entry[1]);
    }
    return result;
  }

  function parse(value) {
    try { return JSON.parse(value); } catch (_) { return null; }
  }

  function object(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (object(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
    return JSON.stringify(value);
  }

  function equivalent(a, b) {
    if (a === b) return true;
    const left = parse(a), right = parse(b);
    return left !== null && right !== null && canonical(left) === canonical(right);
  }

  function validProfile(value) {
    const profile = parse(value);
    return object(profile) && typeof profile.token === 'string' && profile.token.length > 0 ? profile : null;
  }

  function validRecord(value) {
    const record = parse(value);
    return object(record) && typeof record.tokenHash === 'string' && record.tokenHash.length > 0 && Number.isSafeInteger(record.frames) && record.frames > 0 && typeof record.recording === 'string' && (record.uploadId === null || Number.isSafeInteger(record.uploadId)) ? record : null;
  }

  function union(target, source) {
    const result = target.slice();
    const seen = new Set(result.map(canonical));
    for (const value of source) {
      const id = canonical(value);
      if (!seen.has(id)) { result.push(value); seen.add(id); }
    }
    return result;
  }

  function mergeUnlocks(targetValue, sourceValue) {
    const target = parse(targetValue), source = parse(sourceValue);
    if (Array.isArray(target) && Array.isArray(source)) return JSON.stringify(union(target, source));
    const names = ['patterns', 'rims', 'exhausts'];
    if (!object(target) || !object(source) || !names.every(name => Array.isArray(target[name]) && Array.isArray(source[name]))) return null;
    const result = Object.create(null);
    for (const key of Object.keys(target)) result[key] = target[key];
    for (const key of Object.keys(source)) {
      if (!Object.prototype.hasOwnProperty.call(result, key)) result[key] = source[key];
      else if (!names.includes(key) && canonical(result[key]) !== canonical(source[key])) return null;
    }
    for (const name of names) result[name] = union(target[name], source[name]);
    return JSON.stringify(result);
  }

  function mergeSettings(targetValue, sourceValue) {
    const target = parse(targetValue), source = parse(sourceValue);
    const pairs = value => Array.isArray(value) && value.every(pair => Array.isArray(pair) && pair.length === 2 && typeof pair[0] === 'string');
    if (!pairs(target) || !pairs(source)) return null;
    const result = target.slice(), seen = new Map(target.map(pair => [pair[0], canonical(pair[1])]));
    let conflict = false;
    for (const pair of source) {
      if (!seen.has(pair[0])) { result.push(pair); seen.set(pair[0], canonical(pair[1])); }
      else if (seen.get(pair[0]) !== canonical(pair[1])) conflict = true;
    }
    return { value: JSON.stringify(result), conflict };
  }

  /**
   * Pure source -> target merge. Apply entries with setItem; never clear storage.
   * Both snapshots and every skipped conflict retain the original strings.
   * A conflict's key is its destination; sourceKey is its original source key.
   */
  function mergePolyTrackSaves(sourceEntries, targetEntries) {
    const source = entriesMap(sourceEntries), target = entriesMap(targetEntries);
    const result = new Map(target), conflicts = [], slotMap = {};
    const snapshots = { source: Array.from(source, entry => entry.slice()), target: Array.from(target, entry => entry.slice()) };
    const conflict = (type, reason, sourceKey, key, extra) => {
      conflicts.push(Object.assign({ type, reason, key, sourceKey, sourceValue: source.get(sourceKey), incomingValue: source.get(sourceKey), targetValue: result.has(key) ? result.get(key) : null }, extra));
    };

    // Existing keys, even malformed profiles, occupy their slots until the user chooses.
    for (let slot = 0; slot < 3; slot++) {
      const sourceKey = PREFIX + 'user_' + slot;
      if (!source.has(sourceKey)) continue;
      const profile = validProfile(source.get(sourceKey));
      if (!profile) { conflict('profile', 'invalid-source-profile', sourceKey, sourceKey, { sourceSlot: slot, targetSlot: null }); continue; }
      let destination = -1;
      for (let candidate = 0; candidate < 3; candidate++) {
        if (validProfile(result.get(PREFIX + 'user_' + candidate))?.token === profile.token) { destination = candidate; break; }
      }
      if (destination < 0 && !result.has(sourceKey)) destination = slot;
      if (destination < 0) destination = [0, 1, 2].find(candidate => !result.has(PREFIX + 'user_' + candidate)) ?? -1;
      if (destination < 0) { conflict('profile', 'profile-slots-full', sourceKey, sourceKey, { sourceSlot: slot, targetSlot: null }); continue; }
      slotMap[slot] = destination;
      const key = PREFIX + 'user_' + destination;
      if (!result.has(key)) result.set(key, source.get(sourceKey));
      else if (!equivalent(result.get(key), source.get(sourceKey))) conflict('profile', 'profile-details-differ', sourceKey, key, { sourceSlot: slot, targetSlot: destination });
    }

    for (const [sourceKey, sourceValue] of source) {
      if (PROFILE.test(sourceKey)) continue;
      const recordMatch = RECORD.exec(sourceKey);
      if (recordMatch) {
        const sourceSlot = Number(recordMatch[1]);
        if (!Object.prototype.hasOwnProperty.call(slotMap, sourceSlot)) {
          conflict('record', 'source-profile-not-imported', sourceKey, sourceKey, { sourceSlot, targetSlot: null });
          continue;
        }
        const targetSlot = slotMap[sourceSlot];
        const key = PREFIX + 'record_' + targetSlot + '_' + recordMatch[2] + '_' + recordMatch[3];
        if (!result.has(key)) { result.set(key, sourceValue); continue; }
        if (equivalent(result.get(key), sourceValue)) continue;
        const oldRecord = validRecord(sourceValue), currentRecord = validRecord(result.get(key));
        if (!oldRecord || !currentRecord) conflict('record', 'invalid-record', sourceKey, key, { sourceSlot, targetSlot });
        else if (oldRecord.tokenHash !== currentRecord.tokenHash) conflict('record', 'token-hash-mismatch', sourceKey, key, { sourceSlot, targetSlot });
        else if (oldRecord.frames < currentRecord.frames) result.set(key, sourceValue);
        // Equal/slower runs need no choice: the current replay remains the best.
        continue;
      }

      let key = sourceKey, value = sourceValue;
      if (key === PREFIX + 'user_slot') {
        const selected = Number(sourceValue);
        if (Number.isInteger(selected) && selected >= 0 && selected < 3 && Object.prototype.hasOwnProperty.call(slotMap, selected)) value = String(slotMap[selected]);
        else { conflict('profile', 'selected-profile-not-imported', sourceKey, key); continue; }
      }
      if (!result.has(key)) { result.set(key, value); continue; }
      if (equivalent(result.get(key), value)) continue;
      if (key.endsWith('_unlocked_car_styles')) {
        const merged = mergeUnlocks(result.get(key), value);
        if (merged !== null) { result.set(key, merged); continue; }
      }
      if (key === PREFIX + 'settings' || key === PREFIX + 'key_bindings') {
        const merged = mergeSettings(result.get(key), value);
        if (merged !== null) {
          if (merged.conflict) conflict('settings', 'different-settings', sourceKey, key);
          result.set(key, merged.value);
          continue;
        }
      }
      const track = /^polytrack_v\d+_(?:prod_|dev_)?track_/.test(key) || key.startsWith('polytrack_custom_track_');
      conflict(track ? 'track' : 'value', track ? 'different-track' : 'different-values', sourceKey, key, { incomingValue: value });
    }
    return { entries: Array.from(result, entry => entry.slice()), conflicts, snapshots, slotMap };
  }

  function preferPolyTrackValues(sourceEntries, mergedEntries, slotMap) {
    const result = entriesMap(mergedEntries);
    for (const [sourceKey, sourceValue] of entriesMap(sourceEntries)) {
      const profile = PROFILE.exec(sourceKey), record = RECORD.exec(sourceKey);
      let key = sourceKey, value = sourceValue;
      if (profile) key = PREFIX + 'user_' + (slotMap[profile[1]] ?? profile[1]);
      else if (record) key = PREFIX + 'record_' + (slotMap[record[1]] ?? record[1]) + '_' + record[2] + '_' + record[3];
      else if (key === PREFIX + 'user_slot' && Object.hasOwn(slotMap, Number(value))) value = String(slotMap[Number(value)]);
      result.set(key, value);
    }
    return Array.from(result);
  }

  function rebaseGitHubAssets(entries) {
    const asset = value => typeof value === 'string' ? value.replace(
      /^https:\/\/(?:p01|launch)--wordbuilder--675vggg6lnyg\.code\.run\/polytrack\/(?:play\/)?(mods\/library\/)/,
      'https://trbos.github.io/polytrack/$1') : value;
    return Array.from(entriesMap(entries), ([key, original]) => {
      if (['polytrack_selected_car', 'MyCar', 'carSound'].includes(key)) return [key, asset(original)];
      if (key !== 'polyMods') return [key, original];
      try {
        let changed = false;
        const walk = (value, depth = 0) => {
          if (depth > 12) throw Error('Mod preference is too deep');
          if (typeof value === 'string') { const updated = asset(value); changed ||= updated !== value; return updated; }
          if (Array.isArray(value)) return value.map(child => walk(child, depth + 1));
          if (object(value)) return Object.fromEntries(Object.entries(value).map(([name, child]) => [name, walk(child, depth + 1)]));
          return value;
        };
        const updated = walk(JSON.parse(original));
        return [key, changed ? JSON.stringify(updated) : original];
      } catch { return [key, original]; }
    });
  }

  return Object.freeze({ isPolyTrackKey, mergePolyTrackSaves, preferPolyTrackValues, rebaseGitHubAssets });
});
