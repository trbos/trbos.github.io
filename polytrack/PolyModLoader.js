var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var _PolyDBImpl_instances, _PolyDBImpl_db, _PolyDBImpl_getDb, _PolyModLoaderImpl_instances, _PolyModLoaderImpl_polyVersion, _PolyModLoaderImpl_allMods, _PolyModLoaderImpl_simWorkerMixins, _PolyModLoaderImpl_physicsMixins, _PolyModLoaderImpl_chunkMixins, _PolyModLoaderImpl_settings, _PolyModLoaderImpl_settingConstructor, _PolyModLoaderImpl_defaultSettings, _PolyModLoaderImpl_latestSetting, _PolyModLoaderImpl_keybindings, _PolyModLoaderImpl_defaultBinds, _PolyModLoaderImpl_bindConstructor, _PolyModLoaderImpl_latestBinding, _PolyModLoaderImpl_pmlVersion, _PolyModLoaderImpl_polyModUrls, _PolyModLoaderImpl_applyManifestToMod, _PolyModLoaderImpl_applySettings, _PolyModLoaderImpl_applyKeybinds, _PolyModLoaderImpl_preInitPML, _PolyModLoaderImpl_prePreInitPML;
// @ts-ignore
import _semver from "./lib/semver.js";
import { MixinType, SettingType } from "./PolyTypes.js";
const PML_LOCAL_MOD_BASE = "./mods/library";
const PML_LOCAL_CORE_BASE = `${PML_LOCAL_MOD_BASE}/pmlcore`;
const PML_UPSTREAM_MOD_BASES = new Map([
    ["https://cdn.polymodloader.com/cb/polytrackmods/polymodloader/pmlcore", PML_LOCAL_CORE_BASE],
    ["https://cdn.polymodloader.com/cb/crjakob/polyprocessing/main", `${PML_LOCAL_MOD_BASE}/polyprocessing`],
    ["https://cdn.polymodloader.com/cb/crjakob/xenon/main", `${PML_LOCAL_MOD_BASE}/xenon`],
    ["https://cdn.polymodloader.com/gh/0rangy/orangyspolymods/main/husplits", `${PML_LOCAL_MOD_BASE}/husplits`],
    ["https://cdn.polymodloader.com/cb/crjakob/jakobspolymods/main/inputoverlay", `${PML_LOCAL_MOD_BASE}/inputoverlay`],
    ["https://cdn.polymodloader.com/gh/0rangy/orangyspolymods/main/noitalics", `${PML_LOCAL_MOD_BASE}/noitalics`],
    ["https://cdn.polymodloader.com/gh/0rangy/orangyspolymods/main/ghosttoggle", `${PML_LOCAL_MOD_BASE}/ghosttoggle`],
    ["https://cdn.polymodloader.com/gh/0rangy/orangyspolymods/main/carswitcher", `${PML_LOCAL_MOD_BASE}/carswitcher`],
    ["https://cdn.polymodloader.com/gh/crjakob/jakobspolymods/main/coolcars", `${PML_LOCAL_MOD_BASE}/coolcars`],
    ["https://cdn.polymodloader.com/gh/crjakob/jakobspolymods/main/goofycars", `${PML_LOCAL_MOD_BASE}/goofycars`],
    ["https://cdn.polymodloader.com/gh/herohunteriguess/polycinema/main", `${PML_LOCAL_MOD_BASE}/cinema`],
    ["https://cdn.polymodloader.com/gh/gamebuilder202/polydebug/main", `${PML_LOCAL_MOD_BASE}/polydebug`],
    ["https://cdn.polymodloader.com/gh/polytrackmods/polydip--/main", `${PML_LOCAL_MOD_BASE}/pdip`],
    ["https://cdn.polymodloader.com/gh/polytrackmods/pml-api/main", `${PML_LOCAL_MOD_BASE}/pmlapi`],
]);
const PML_REMOVED_MOD_BASES = new Set([
    `${PML_LOCAL_MOD_BASE}/polyproxy`,
    `${PML_LOCAL_MOD_BASE}/pbl`,
    "https://cdn.polymodloader.com/gh/0rangy/orangyspolymods/main/polyproxy",
    "https://cdn.polymodloader.com/gh/0rangy/orangyspolymods/main/pbl",
].map(normalizePmlBaseUrl));
const PML_REMOVED_MOD_IDS = new Set(["polyproxy", "pbl"]);
function normalizePmlBaseUrl(base) {
    return String(base || "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "").toLowerCase();
}
function isRemovedPmlModBase(base) {
    const normalized = normalizePmlBaseUrl(base);
    const baseParts = normalized.split("/").filter(Boolean);
    const baseId = baseParts[baseParts.length - 1];
    if (PML_REMOVED_MOD_IDS.has(baseId))
        return true;
    for (const removedBase of PML_REMOVED_MOD_BASES) {
        if (normalized === removedBase || normalized.startsWith(`${removedBase}/`))
            return true;
    }
    return false;
}
function defaultPolyMods() {
    return [
        {
            "base": PML_LOCAL_CORE_BASE,
            "version": "latest",
            "loaded": true
        }
    ];
}
function isLocalPmlLibraryBase(base) {
    return normalizePmlBaseUrl(base).startsWith(normalizePmlBaseUrl(PML_LOCAL_MOD_BASE));
}
const PML_LOCAL_IMPORT_NONCE = Date.now().toString(36);
function getPmlModMainImportUrl(polyModUrl, mainFile, base) {
    const url = `${polyModUrl}/${mainFile}`;
    if (!isLocalPmlLibraryBase(base))
        return url;
    return `${url}${url.includes("?") ? "&" : "?"}pml_local=${PML_LOCAL_IMPORT_NONCE}`;
}
function normalizeLegacyMixinArg(mixinArg, legacyArg1, legacyArg2, legacyArg3) {
    if (typeof mixinArg !== "number")
        return mixinArg;
    switch (mixinArg) {
        case MixinType.INSERT:
            return { type: mixinArg, token: legacyArg1, func: legacyArg2 };
        case MixinType.REPLACEBETWEEN:
        case MixinType.REMOVEBETWEEN:
            return { type: mixinArg, tokenStart: legacyArg1, tokenEnd: legacyArg2, func: legacyArg3 };
        case MixinType.HEAD:
            return { type: MixinType.INSERT, token: "{", func: legacyArg1 };
        case MixinType.OVERRIDE:
            return {
                type: mixinArg,
                accessors: Array.isArray(legacyArg1) ? legacyArg1 : [],
                func: Array.isArray(legacyArg1) ? legacyArg2 : legacyArg1
            };
        default:
            return { type: mixinArg, token: legacyArg1, func: legacyArg2 };
    }
}
function migratePolyModsToLocalLibrary(polyMods) {
    let migrated = false;
    const seenBases = new Set();
    const mods = [];
    for (const mod of Array.isArray(polyMods) ? polyMods : []) {
        if (!mod || typeof mod !== "object")
            continue;
        const savedMod = { ...mod };
        const normalizedIncomingBase = normalizePmlBaseUrl(savedMod.base);
        if (isRemovedPmlModBase(normalizedIncomingBase)) {
            migrated = true;
            continue;
        }
        let localBase = PML_UPSTREAM_MOD_BASES.get(normalizedIncomingBase);
        if (normalizedIncomingBase === normalizePmlBaseUrl(PML_LOCAL_CORE_BASE) ||
            normalizedIncomingBase.startsWith(`${normalizePmlBaseUrl(PML_LOCAL_CORE_BASE)}/`)) {
            localBase = PML_LOCAL_CORE_BASE;
        }
        if (localBase) {
            if (savedMod.base !== localBase)
                migrated = true;
            savedMod.base = localBase;
            if (localBase === PML_LOCAL_CORE_BASE) {
                if (savedMod.version !== "latest" || savedMod.loaded !== true)
                    migrated = true;
                savedMod.version = "latest";
                savedMod.loaded = true;
            }
        }
        if (isRemovedPmlModBase(savedMod.base)) {
            migrated = true;
            continue;
        }
        const normalizedBase = normalizePmlBaseUrl(savedMod.base);
        if (!normalizedBase || seenBases.has(normalizedBase))
            continue;
        seenBases.add(normalizedBase);
        mods.push(savedMod);
    }
    if (!seenBases.has(normalizePmlBaseUrl(PML_LOCAL_CORE_BASE))) {
        mods.unshift(defaultPolyMods()[0]);
        migrated = true;
    }
    return { mods, migrated };
}
const semver = {
    valid: (v) => {
        return _semver.valid(v);
    },
    satisfies: (version, range) => {
        if (String(version || "") === String(range || ""))
            return true;
        return _semver.satisfies(version, range);
    }
};
const PML_BUNDLED_VERSION = "v0.6.0-8";
const PML_VERSION_FETCH_TIMEOUT_MS = 3000;
async function fetchPmlVersion() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PML_VERSION_FETCH_TIMEOUT_MS);
    try {
        const response = await fetch("https://codeberg.org/api/v1/repos/polytrackmods/PolyModLoader/tags", { signal: controller.signal });
        if (!response.ok)
            throw new Error(`Failed to fetch tags: ${response.status}`);
        const tags = await response.json();
        return tags[0]?.name ?? PML_BUNDLED_VERSION;
    }
    catch (error) {
        console.warn("[PML] Failed to fetch latest PolyModLoader version; using bundled version.", error);
        return PML_BUNDLED_VERSION;
    }
    finally {
        clearTimeout(timeout);
    }
}
const pmlversion = await fetchPmlVersion();
// @ts-ignore
Object.defineProperty(window, "pmlversion", {
    get() {
        return pmlversion;
    },
    set(value) {
        console.warn("Attempted to overwrite window.pmlversion with", value, "- ignored.");
    },
    configurable: true,
    enumerable: true
});
// Detect Electron runtime
function isElectron() {
    // Renderer process (BrowserWindow)
    if (typeof window !== "undefined") {
        const win = window;
        if (typeof win.process === "object" && win.process?.type === "renderer") {
            return true;
        }
    }
    // Main process or preload
    const g = globalThis;
    if (g?.process?.versions?.electron) {
        return true;
    }
    // User agent check (nodeIntegration disabled or sandboxed renderer)
    if (typeof navigator === "object" && /electron/i.test(navigator.userAgent)) {
        return true;
    }
    return false;
}
// Detect Cordova Android app
function isAndroidApp() {
    const win = window;
    // 1️⃣ Cordova presence
    if (typeof win.cordova !== "undefined") {
        // Cordova Device plugin check (safe optional chain)
        const platform = win.device?.platform?.toLowerCase?.();
        if (platform === "android")
            return true;
        // Fallback: user agent heuristic
        if (/android/i.test(navigator.userAgent))
            return true;
    }
    // 2️⃣ Fallback: Cordova/Capacitor WebView URL pattern
    const url = document.URL || "";
    if (url.startsWith("file:///android_asset/"))
        return true;
    // 3️⃣ Future-proof: Capacitor-based apps (optional)
    if ((win.Capacitor?.getPlatform?.() || "").toLowerCase() === "android")
        return true;
    return false;
}
// General app detection
export function isApp() {
    return isElectron() || isAndroidApp();
}
// Full update checker
export async function checkForUpdate() {
    const pmlversion = window.pmlversion;
    if (!pmlversion) {
        console.error("pmlversion is missing or empty");
        return true;
    }
    const versionRegex = /^v(\d+)\.(\d+)\.(\d+)-(\d+)$/;
    const match = pmlversion.match(versionRegex);
    if (!match) {
        console.error("Invalid pmlversion format:", pmlversion);
        return true;
    }
    const [, w, x, y, build] = match.map(Number);
    const currentGameVersion = [w, x, y];
    const currentBuild = build;
    console.log("Current game version:", currentGameVersion.join("."));
    console.log("Current build:", currentBuild);
    try {
        const response = await fetch("https://codeberg.org/api/v1/repos/polytrackmods/PolyModLoader/tags");
        if (!response.ok)
            throw new Error("Failed to fetch tags");
        const tags = await response.json();
        const parsedTags = tags
            .map((tag) => {
            const m = tag.name.match(/^v(\d+)\.(\d+)\.(\d+)-(\d+)$/);
            if (!m)
                return null;
            const [, W, X, Y, build] = m.map(Number);
            return { raw: tag.name, gameVersion: [W, X, Y], build };
        })
            .filter(Boolean);
        if (parsedTags.length === 0) {
            console.warn("No valid version tags found.");
            return false;
        }
        // @ts-ignore
        parsedTags.sort((a, b) => {
            for (let i = 0; i < 3; i++) {
                if (a.gameVersion[i] !== b.gameVersion[i])
                    return a.gameVersion[i] - b.gameVersion[i];
            }
            return a.build - b.build;
        });
        const newest = parsedTags[parsedTags.length - 1];
        console.log("Newest available version:", newest.raw);
        for (let i = 0; i < 3; i++) {
            if (currentGameVersion[i] < newest.gameVersion[i])
                return true;
            if (currentGameVersion[i] > newest.gameVersion[i])
                return false;
        }
        return currentBuild < newest.build;
    }
    catch (error) {
        console.error("Error checking for updates:", error);
        return false;
    }
}
var Variables;
(function (Variables) {
    Variables["SettingsClass"] = "Mf";
    Variables["SettingEnum"] = "P.A";
    Variables["KeybindEnum"] = "ge.A";
    Variables["SettingUIFunction"] = "po";
})(Variables || (Variables = {}));
class PolyDBImpl {
    constructor(pml) {
        _PolyDBImpl_instances.add(this);
        _PolyDBImpl_db.set(this, void 0);
        this.cacheMods = true;
        this.dbUpgrading = false;
        let settingList = JSON.parse(pml.localStorage?.getItem("polytrack_v5_prod_settings") || "[]");
        for (let setting of settingList) {
            if (setting[0] === "pmlCacheMods") {
                console.log(setting[0], setting[1]);
                this.cacheMods = setting[1] == "true";
            }
            if (setting[0] === "debugmode") {
                if (setting[1] === "true") {
                    console.log("Debug mode is ON");
                    window.localStorage.setItem("debug", "true");
                }
                else if (setting[1] === "false") {
                    console.log("Debug mode is OFF");
                    window.localStorage.setItem("debug", "false");
                }
            }
            if (setting[0] === "clearmods") {
                if (setting[1] === "true") {
                    console.log("Clearing polyMods");
                    window.localStorage.removeItem("polyMods");
                    window.localStorage.removeItem("polytrack_v5_beta_settings");
                    location.reload();
                }
            }
        }
    }
    async syncMods(modList, pmlModList) {
        let localDb = await __classPrivateFieldGet(this, _PolyDBImpl_instances, "m", _PolyDBImpl_getDb).call(this);
        await new Promise((resolve, reject) => {
            try {
                const transaction = localDb.transaction("mods", "readwrite");
                const store = transaction?.objectStore("mods");
                const request = store?.clear();
                if (!request) {
                    return reject(null);
                }
                ;
                request.onsuccess = () => resolve(request?.result || null);
                request.onerror = () => reject(request?.result || null);
            }
            catch (err) {
                reject(err);
            }
        });
        for (let index = 0; index < modList.length; index++) {
            const modSerialized = modList[index];
            const mod = pmlModList[index];
            try {
                this.saveMod(modSerialized.base, mod.modVersion || "", mod.manifest);
            }
            catch {
                console.warn("Couldn't save mod to DB:", modSerialized.base);
            }
        }
    }
    async getMod(baseUrl) {
        let localDb = await __classPrivateFieldGet(this, _PolyDBImpl_instances, "m", _PolyDBImpl_getDb).call(this);
        return await new Promise((resolve, reject) => {
            if (!localDb) {
                console.error("Database not initialized.");
                return false;
            }
            const transaction = localDb.transaction("mods", "readonly");
            const store = transaction?.objectStore("mods");
            const request = store?.get(baseUrl);
            if (!request) {
                return null;
            }
            ;
            request.onsuccess = () => resolve(request?.result || null);
            request.onerror = () => reject(null);
        });
    }
    async saveMod(baseUrl, version, manifest) {
        const localDb = await __classPrivateFieldGet(this, _PolyDBImpl_instances, "m", _PolyDBImpl_getDb).call(this);
        if (!localDb) {
            console.error("Database not initialized.");
            return false;
        }
        const response = await fetch(`${baseUrl}/${version}/${manifest?.main}`);
        const codeStr = await response.text();
        return new Promise((resolve, reject) => {
            const tx = localDb.transaction("mods", "readwrite");
            const store = tx.objectStore("mods");
            const request = store.put({ baseUrl, version, manifest, codeStr });
            request.onsuccess = () => {
                resolve(true);
            };
            request.onerror = () => {
                console.error("Error saving mod:", request.error);
                reject(request.error);
            };
        });
    }
}
_PolyDBImpl_db = new WeakMap(), _PolyDBImpl_instances = new WeakSet(), _PolyDBImpl_getDb = async function _PolyDBImpl_getDb() {
    return new Promise((resolve, reject) => {
        if (__classPrivateFieldGet(this, _PolyDBImpl_db, "f")) {
            return resolve(__classPrivateFieldGet(this, _PolyDBImpl_db, "f"));
        }
        const DBOpenRequest = window.indexedDB.open("PMLMods", 1); // always set a version
        DBOpenRequest.onerror = () => {
            console.error("Error initializing database.");
            reject(new Error("DB init failed"));
        };
        DBOpenRequest.onsuccess = () => {
            console.log("Database initialized.");
            __classPrivateFieldSet(this, _PolyDBImpl_db, DBOpenRequest.result, "f");
            resolve(__classPrivateFieldGet(this, _PolyDBImpl_db, "f"));
        };
        DBOpenRequest.onupgradeneeded = (event) => {
            console.log("Upgrading...");
            // @ts-ignore
            __classPrivateFieldSet(this, _PolyDBImpl_db, event.target.result, "f");
            if (!__classPrivateFieldGet(this, _PolyDBImpl_db, "f")) {
                return reject(new Error("Upgrade DB is null"));
            }
            __classPrivateFieldGet(this, _PolyDBImpl_db, "f").onerror = () => {
                console.error("Error during DB upgrade.");
            };
            if (!__classPrivateFieldGet(this, _PolyDBImpl_db, "f").objectStoreNames.contains("mods")) {
                __classPrivateFieldGet(this, _PolyDBImpl_db, "f").createObjectStore("mods", { keyPath: "baseUrl" });
                console.log("Object store created.");
            }
            // @ts-ignore
            event.target.transaction.oncomplete = () => {
                console.log("Upgrade finished.");
                resolve(__classPrivateFieldGet(this, _PolyDBImpl_db, "f"));
            };
        };
    });
};
/**
 * Find the nth occurrence of a substring in a string
 * @param str string to search in
 * @param subStr string to search for
 * @param n nth occurrence of the string to find
 * @returns
 */
function findNthOccurrence(str, subStr, n) {
    let count = 0;
    let startIndex = 0;
    let index;
    while (count < n && (index = str.indexOf(subStr, startIndex)) !== -1) {
        count++;
        if (count === n) {
            return index;
        }
        // Start the next search from the position immediately after the current match
        startIndex = index + subStr.length;
    }
    // If the nth occurrence is not found, return -1
    return -1;
}
class PolyModLoaderImpl {
    constructor(polyVersion, pmlVersion) {
        _PolyModLoaderImpl_instances.add(this);
        _PolyModLoaderImpl_polyVersion.set(this, void 0);
        _PolyModLoaderImpl_allMods.set(this, void 0);
        _PolyModLoaderImpl_simWorkerMixins.set(this, void 0);
        _PolyModLoaderImpl_physicsMixins.set(this, void 0);
        _PolyModLoaderImpl_chunkMixins.set(this, void 0);
        _PolyModLoaderImpl_settings.set(this, void 0);
        _PolyModLoaderImpl_settingConstructor.set(this, void 0);
        _PolyModLoaderImpl_defaultSettings.set(this, void 0);
        _PolyModLoaderImpl_latestSetting.set(this, void 0);
        _PolyModLoaderImpl_keybindings.set(this, void 0);
        _PolyModLoaderImpl_defaultBinds.set(this, void 0);
        _PolyModLoaderImpl_bindConstructor.set(this, void 0);
        _PolyModLoaderImpl_latestBinding.set(this, void 0);
        _PolyModLoaderImpl_pmlVersion.set(this, void 0);
        _PolyModLoaderImpl_polyModUrls.set(this, void 0);
        _PolyModLoaderImpl_applyManifestToMod.set(this, (mod, manifest) => {
            mod.modName = manifest.name;
            mod.modID = manifest.id;
            mod.modAuthor = manifest.author;
            const version = semver.valid(manifest.version);
            if (version === undefined || version === null) {
                console.warn(`Mod ${manifest.name} has invalid version string: ${manifest.version}`);
                alert(`Mod ${manifest.name} has invalid version string: ${manifest.version}. This mod will not be imported. Please contact the mod author to fix this issue.`);
                return false;
            }
            mod.modVersion = version;
            mod.polyVersion = manifest.targets;
            mod.assetFolder = "assets";
            mod.modDependencies = Array.isArray(manifest.dependencies) ? manifest.dependencies : [];
            for (let dependency of mod.modDependencies) {
                if (!semver.valid(dependency.version)) {
                    console.warn(`Mod ${manifest.name} has invalid dependency version string: ${dependency.version} for dependency ${dependency.id}`);
                    alert(`Mod ${manifest.name} has invalid dependency version string: ${dependency.version} for dependency ${dependency.id}. This may cause issues with mod loading and compatibility. Please contact the mod author to fix this issue.`);
                }
            }
            return true;
        });
        this.gameLoadCalled = false;
        this.getFromPolyTrack = (path) => { };
        this.getFromPolyTrackGlobal = (path) => { };
        __classPrivateFieldSet(this, _PolyModLoaderImpl_pmlVersion, pmlVersion, "f");
        /** @type {string} */
        __classPrivateFieldSet(this, _PolyModLoaderImpl_polyVersion, polyVersion, "f");
        /** @type {PolyMod[]} */
        __classPrivateFieldSet(this, _PolyModLoaderImpl_allMods, [], "f");
        console.log("[PML] PolyModLoader initialized, version:", pmlVersion);
        // 🔹 Run environment detection + update check
        setTimeout(() => {
            console.log("[PML] Running environment detection...");
            const electron = isElectron();
            const android = isAndroidApp();
            const app = isApp();
            if (electron)
                console.log("Running Electron app!");
            if (android)
                console.log("Running Android app!");
            if (!app)
                console.log("Running in web browser.");
            if (app) {
                console.log("[PML] App environment detected — checking for updates...");
                checkForUpdate()
                    .then((needsUpdate) => {
                    console.log("[PML] Update check complete:", needsUpdate);
                    if (needsUpdate) {
                        alert("You are playing on an outdated version of PolyModLoader.\n" +
                            "Please update your game by downloading the latest version from:\n" +
                            "https://codeberg.org/polytrackmods/PolyModLoader/releases");
                        // Create dialog
                        /*               const dialog = document.createElement('dialog');
                        
                                      const message = document.createElement('p');
                                      message.textContent = "You are playing on an outdated version of PolyModLoader.\n" + "Click \"ignore update\" to stay on this version or \"update\" to automatically update PML.";
                        
                                      const btnCancel = document.createElement('button');
                                      btnCancel.textContent = 'update';
                        
                                      const btnConfirm = document.createElement('button');
                                      btnConfirm.textContent = 'ignore update';
                        
                                      dialog.appendChild(message);
                                      dialog.appendChild(btnCancel);
                                      dialog.appendChild(btnConfirm);
                                      document.body.appendChild(dialog);
                        
                                      // Callbacks
                                      btnConfirm.addEventListener('click', async () => {
                                        dialog.close();
                                        try {
                                          const res = await fetch('https://example.com/api', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ confirmed: true }),
                                          });
                                          const data = await res.json();
                                          console.log(data);
                                        } catch (err) {
                                          console.error('Request failed:', err);
                                        }
                                      });
                        
                                      btnCancel.addEventListener('click', () => {
                                        dialog.close();
                                        console.log('cancelled');
                                      });
                        
                                      dialog.showModal(); */
                    }
                })
                    .catch((err) => {
                    console.error("[PML] Update check failed:", err);
                });
            }
        }, 0);
        __classPrivateFieldSet(this, _PolyModLoaderImpl_simWorkerMixins, [], "f");
        __classPrivateFieldSet(this, _PolyModLoaderImpl_physicsMixins, [], "f");
        __classPrivateFieldSet(this, _PolyModLoaderImpl_chunkMixins, [], "f");
        __classPrivateFieldSet(this, _PolyModLoaderImpl_settings, [], "f");
        __classPrivateFieldSet(this, _PolyModLoaderImpl_settingConstructor, [], "f");
        __classPrivateFieldSet(this, _PolyModLoaderImpl_defaultSettings, [], "f");
        __classPrivateFieldSet(this, _PolyModLoaderImpl_latestSetting, 23, "f");
        __classPrivateFieldSet(this, _PolyModLoaderImpl_keybindings, [], "f");
        __classPrivateFieldSet(this, _PolyModLoaderImpl_defaultBinds, [], "f");
        __classPrivateFieldSet(this, _PolyModLoaderImpl_bindConstructor, [], "f");
        __classPrivateFieldSet(this, _PolyModLoaderImpl_latestBinding, 32, "f");
    }
    get polyVersion() {
        return __classPrivateFieldGet(this, _PolyModLoaderImpl_polyVersion, "f"); // Why is this even private lmfao
    }
    initStorage(localStorage) {
        this.localStorage = localStorage;
        this.polyDb = new PolyDBImpl(this);
        __classPrivateFieldSet(this, _PolyModLoaderImpl_polyModUrls, this.getPolyModsStorage(), "f");
    }
    async importMods() {
        // Mod loading UI
        const ui = document.getElementById("ui");
        const loadingDiv = document.createElement("div");
        loadingDiv.style.display = "flex";
        loadingDiv.style.flexDirection = "column";
        loadingDiv.style.position = "absolute";
        loadingDiv.style.left = "0";
        loadingDiv.style.top = "0";
        loadingDiv.style.width = "100%";
        loadingDiv.style.height = "100%";
        loadingDiv.style.textAlign = "center";
        loadingDiv.style.backgroundColor = "#192042";
        loadingDiv.style.transition = "background-color 1s ease-out";
        loadingDiv.style.overflow = "hidden";
        loadingDiv.innerHTML = `<img src="images/pmllogo.svg" style="width: calc(100vw * (1000 / 1300)); height: 200px; margin: 30px auto 0 auto" />`;
        const loadingUI = document.createElement("div");
        loadingUI.style.margin = "20px 0 0 0";
        loadingUI.style.padding = "0";
        const loadingText = document.createElement("p");
        loadingText.innerText = "[PML] Loading Mods...";
        loadingText.style.margin = "5px";
        loadingText.style.padding = "0";
        loadingText.style.color = "#ffffff";
        loadingText.style.fontSize = "32px";
        loadingText.style.fontStyle = "italic";
        loadingText.style.fontFamily = "ForcedSquare, Arial, sans-serif";
        loadingText.style.lineHeight = "1";
        const loadingBarOuter = document.createElement("div");
        loadingBarOuter.style.margin = "0 auto";
        loadingBarOuter.style.padding = "0";
        loadingBarOuter.style.width = "600px";
        loadingBarOuter.style.height = "50px";
        loadingBarOuter.style.backgroundColor = "#28346a";
        loadingBarOuter.style.clipPath = "polygon(9px 0, 100% 0, calc(100% - 9px) 100%, 0 100%)";
        loadingBarOuter.style.overflow = "hidden";
        const loadingBarInner = document.createElement("div");
        loadingBarInner.style.margin = "15px 20px";
        loadingBarInner.style.padding = "0";
        loadingBarInner.style.width = "560px";
        loadingBarInner.style.height = "20px";
        loadingBarInner.style.clipPath = "polygon(3px 0, 100% 0, calc(100% - 3px) 100%, 0 100%)";
        loadingBarInner.style.backgroundColor = "#222244";
        loadingBarInner.style.boxShadow = "inset 0 0 6px #000000";
        const loadingBarFill = document.createElement("div");
        loadingBarFill.style.margin = "0";
        loadingBarFill.style.padding = "0";
        loadingBarFill.style.width = "0";
        loadingBarFill.style.height = "100%";
        loadingBarFill.style.clipPath = "polygon(2px 0, 100% 0, calc(100% - 2px) 100%, 0 100%)";
        loadingBarFill.style.backgroundColor = "#ffffff";
        loadingBarFill.style.boxShadow = "inset 0 0 6px #000000";
        loadingBarFill.style.transition = "width 0.1s ease-in-out";
        const progressDiv = document.createElement("div");
        progressDiv.style.textAlign = "left";
        progressDiv.style.width = "1000px";
        progressDiv.style.margin = "50px auto";
        loadingBarOuter.appendChild(loadingBarInner);
        loadingBarInner.appendChild(loadingBarFill);
        loadingUI.appendChild(loadingText);
        loadingUI.appendChild(loadingBarOuter);
        loadingUI.appendChild(progressDiv);
        loadingDiv.appendChild(loadingUI);
        ui.appendChild(loadingDiv);
        const total = __classPrivateFieldGet(this, _PolyModLoaderImpl_polyModUrls, "f") ? __classPrivateFieldGet(this, _PolyModLoaderImpl_polyModUrls, "f").length : 0;
        const current = {
            num: 0,
            text: undefined,
            url: "",
            version: "",
            totalParts: 0,
            part: 0,
        };
        function updateBar(num) {
            current.num = num;
            loadingBarFill.style.width = `${(current.num / total) * 100}%`;
        }
        function nextPart() {
            updateBar(current.num + current.part / current.totalParts);
            current.part += 1;
        }
        function currPartStr() {
            return `[${current.part}/${current.totalParts}]`;
        }
        function startImportMod(url, version) {
            current.url = url;
            current.version = version;
            progressDiv.innerHTML = "";
            const modP = document.createElement("p");
            modP.innerText = "[PML] Loading Mods...";
            modP.style.color = "#ffffff";
            modP.style.fontSize = "18px";
            modP.style.fontStyle = "italic";
            modP.style.fontFamily = "ForcedSquare, Arial, sans-serif";
            modP.style.lineHeight = "1";
            modP.innerText = `Importing mod from URL: ${current.url} @ version ${current.version}`;
            progressDiv.appendChild(modP);
            // @ts-ignore
            current.text = modP;
        }
        function startFetchLatest() {
            nextPart();
            const latestP = document.createElement("p");
            latestP.style.color = "#ffffff";
            latestP.style.fontSize = "18px";
            latestP.style.fontStyle = "italic";
            latestP.style.fontFamily = "ForcedSquare, Arial, sans-serif";
            latestP.style.lineHeight = "1";
            latestP.innerText = `${currPartStr()} Fetching global manifest from ${current.url}/manifest.json`;
            progressDiv.appendChild(latestP);
            // @ts-ignore
            current.text = latestP;
        }
        function finishFetchLatest(version) {
            current.version = version;
            // @ts-ignore
            current.text.innerText = `${currPartStr()} Fetched global manifest for mod: ${current.url} @ version ${current.version}`;
        }
        function startFetchManifest() {
            nextPart();
            const manifestP = document.createElement("p");
            manifestP.style.color = "#ffffff";
            manifestP.style.fontSize = "18px";
            manifestP.style.fontStyle = "italic";
            manifestP.style.fontFamily = "ForcedSquare, Arial, sans-serif";
            manifestP.style.lineHeight = "1";
            manifestP.innerText = `${currPartStr()} Fetching mod version manifest from ${current.url}/${current.version}/version.json`;
            progressDiv.appendChild(manifestP);
            // @ts-ignore
            current.text = manifestP;
        }
        function startFetchModMain(js) {
            nextPart();
            const mainP = document.createElement("p");
            mainP.style.color = "#ffffff";
            mainP.style.fontSize = "18px";
            mainP.style.fontStyle = "italic";
            mainP.style.fontFamily = "ForcedSquare, Arial, sans-serif";
            mainP.style.lineHeight = "1";
            mainP.innerText = `${currPartStr()} Fetching mod js from ${current.url}/${current.version}/${js}`;
            progressDiv.appendChild(mainP);
            // @ts-ignore
            current.text = mainP;
        }
        function errorCurrent() {
            // @ts-ignore
            current.text.style.color = "red";
        }
        function finishImportMod() {
            current.totalParts = 0;
            current.part = 0;
            updateBar(Math.floor(current.num) + 1);
        }
        // Actual mod importing
        for (let polyModObject of __classPrivateFieldGet(this, _PolyModLoaderImpl_polyModUrls, "f") ?? []) {
            startImportMod(polyModObject.base, polyModObject.version);
            const dbMod = await this.polyDb.getMod(polyModObject.base);
            let latest = false;
            let importFromDB = false;
            current.totalParts = 2;
            let mainManifestFile;
            try {
                startFetchLatest();
                mainManifestFile = await fetch(`${polyModObject.base}/manifest.json`).then(r => r.json());
                if (polyModObject.version === "latest") {
                    current.totalParts = 3;
                    polyModObject.version = mainManifestFile["latest"][__classPrivateFieldGet(this, _PolyModLoaderImpl_polyVersion, "f")];
                    latest = true;
                }
            }
            catch (err) {
                errorCurrent();
                importFromDB = this.polyDb.cacheMods && !isLocalPmlLibraryBase(polyModObject.base);
                alert(`Couldn't find global manifest for ${polyModObject.base}`);
                console.error("Error in fetching global manifest json:", err);
                if (!dbMod)
                    return alert(`Mod with URL ${polyModObject.base} failed to load and isn't in the cache.`);
                mainManifestFile = { ...dbMod.manifest, latest: { [__classPrivateFieldGet(this, _PolyModLoaderImpl_polyVersion, "f")]: dbMod.version } };
            }
            finishFetchLatest(polyModObject.version);
            if (this.polyDb.cacheMods && !isLocalPmlLibraryBase(polyModObject.base) && dbMod && polyModObject.version === dbMod.version) {
                console.log("Mod version in DB, skipping import");
                importFromDB = true;
            }
            const polyModUrl = `${polyModObject.base}/${polyModObject.version}`;
            startFetchManifest();
            try {
                let manifestFile;
                if (importFromDB && dbMod) {
                    manifestFile = dbMod.manifest;
                }
                else {
                    let versionFile = await fetch(`${polyModUrl}/version.json`).then(r => r.json());
                    manifestFile = {
                        name: mainManifestFile.name,
                        author: mainManifestFile.author,
                        id: mainManifestFile.id,
                        version: polyModObject.version,
                        ...versionFile
                    };
                }
                startFetchModMain(manifestFile.main);
                try {
                    const modImport = await import(importFromDB && dbMod ? URL.createObjectURL(new Blob([dbMod.codeStr], { type: "application/javascript" })) : getPmlModMainImportUrl(polyModUrl, manifestFile.main, polyModObject.base));
                    let newMod = modImport.polyMod;
                    if (this.getMod(manifestFile.id))
                        alert(`Duplicate mod detected: ${manifestFile.name}`);
                    if (!__classPrivateFieldGet(this, _PolyModLoaderImpl_applyManifestToMod, "f").call(this, newMod, manifestFile))
                        continue;
                    newMod.manifest = manifestFile;
                    newMod.offlineMode = importFromDB;
                    newMod.baseUrl = polyModObject.base;
                    newMod.savedLatest = latest;
                    newMod.iconSrc = `${polyModUrl}/icon.png`;
                    if (polyModObject.loaded) {
                        newMod.setLoaded = true;
                    }
                    __classPrivateFieldGet(this, _PolyModLoaderImpl_allMods, "f").push(newMod);
                }
                catch (err) {
                    errorCurrent();
                    alert(`Mod ${manifestFile.name} failed to load.`);
                    console.error("Error in loading mod:", err);
                }
            }
            catch (err) {
                errorCurrent();
                alert(`Couldn't load mod with URL ${polyModUrl}.`);
                console.error("Error in loading mod URL:", err);
            }
            finishImportMod();
        }
        loadingDiv.remove();
        this.saveModsToLocalStorage(); // Really just to initiate DB sync
    }
    async loadModsFromLauncher() {
        // @ts-ignore
        const port = typeof window.electron !== "undefined"
            // @ts-ignore
            ? window.electron?.getHelperPort()
            : null;
        if (!port)
            return;
        const res = await fetch(`http://localhost:${port}/mods`);
        const modUrls = await res.json();
        for (const url of modUrls) {
            await this.addMod({ base: url, version: "latest", loaded: true }, false);
        }
    }
    getPolyModsStorage() {
        const polyModsStorage = this.localStorage?.getItem("polyMods");
        if (polyModsStorage) {
            const { mods, migrated } = migratePolyModsToLocalLibrary(JSON.parse(polyModsStorage));
            __classPrivateFieldSet(this, _PolyModLoaderImpl_polyModUrls, mods, "f");
            if (migrated) {
                this.localStorage?.setItem("polyMods", JSON.stringify(mods));
                this.localStorage?.removeItem("polylibrary_list_cache");
                this.localStorage?.removeItem("polylibrary_local_list_cache");
            }
        }
        else {
            __classPrivateFieldSet(this, _PolyModLoaderImpl_polyModUrls, defaultPolyMods(), "f");
            this.localStorage?.setItem("polyMods", JSON.stringify(__classPrivateFieldGet(this, _PolyModLoaderImpl_polyModUrls, "f")));
        }
        return __classPrivateFieldGet(this, _PolyModLoaderImpl_polyModUrls, "f");
    }
    serializeMod(mod) {
        return { "base": mod.baseUrl ? mod.baseUrl : "", "version": mod.savedLatest ? "latest" : mod.modVersion ? mod.modVersion : "latest", "loaded": mod.isLoaded || false };
    }
    saveModsToLocalStorage() {
        let savedMods = [];
        for (let mod of __classPrivateFieldGet(this, _PolyModLoaderImpl_allMods, "f")) {
            const modSerialized = this.serializeMod(mod);
            savedMods.push(modSerialized);
        }
        this.polyDb.syncMods(savedMods, __classPrivateFieldGet(this, _PolyModLoaderImpl_allMods, "f"));
        __classPrivateFieldSet(this, _PolyModLoaderImpl_polyModUrls, savedMods, "f");
        this.localStorage?.setItem("polyMods", JSON.stringify(__classPrivateFieldGet(this, _PolyModLoaderImpl_polyModUrls, "f")));
    }
    /**
     * Reorder a mod in the internal list to change its priority in mod loading.
     *
     * @param {PolyMod} mod  - The mod to reorder.
     * @param {number} delta - The amount to reorder it by. Positive numbers decrease priority, negative numbers increase priority.
     */
    reorderMod(mod, delta) {
        if (!mod)
            return;
        if (mod.modID === "pmlcore") {
            return;
        }
        const currentIndex = __classPrivateFieldGet(this, _PolyModLoaderImpl_allMods, "f").indexOf(mod);
        if ((currentIndex === 0) && delta > 0)
            return;
        if (!currentIndex || currentIndex === -1) {
            alert("This mod isn't loaded");
            return;
        }
        const temp = __classPrivateFieldGet(this, _PolyModLoaderImpl_allMods, "f")[currentIndex + delta];
        __classPrivateFieldGet(this, _PolyModLoaderImpl_allMods, "f")[currentIndex + delta] = __classPrivateFieldGet(this, _PolyModLoaderImpl_allMods, "f")[currentIndex];
        __classPrivateFieldGet(this, _PolyModLoaderImpl_allMods, "f")[currentIndex] = temp;
        this.saveModsToLocalStorage();
    }
    /**
     * Add a mod to the internal mod list. Added mod is given least priority.
     *
     * @param {{base: string, version: string, loaded: bool}} polyModObject - The mod's JSON representation to add.
     */
    async addMod(polyModObject, autoUpdate) {
        try {
            const manifestFile = await fetch(`${polyModObject.base}/manifest.json`).then(r => r.json());
            let latest = false;
            if (polyModObject.version === "latest") {
                polyModObject.version = manifestFile["latest"][__classPrivateFieldGet(this, _PolyModLoaderImpl_polyVersion, "f")];
                if (autoUpdate) {
                    latest = true;
                }
                if (polyModObject.version === "latest" || !polyModObject.version)
                    alert(`Mod with URL ${polyModObject.base} does not have a version which supports PolyTrack v${__classPrivateFieldGet(this, _PolyModLoaderImpl_polyVersion, "f")}.`);
            }
            const polyModUrl = `${polyModObject.base}/${polyModObject.version}`;
            const versionFile = await fetch(`${polyModUrl}/version.json`).then(r => r.json());
            const mod = { ...manifestFile, ...versionFile, version: polyModObject.version };
            if (this.getMod(mod.id)) {
                alert("This mod is already present!");
                return;
            }
            if (mod.targets.indexOf(__classPrivateFieldGet(this, _PolyModLoaderImpl_polyVersion, "f")) === -1) {
                alert(`Mod target version does not match polytrack version!
                    Note: ${mod.name} version ${polyModObject.version} targets polytrack versions ${mod.targets.join(', ')}, but current polytrack version is ${__classPrivateFieldGet(this, _PolyModLoaderImpl_polyVersion, "f")}.`);
                return;
            }
            try {
                const modImport = await import(getPmlModMainImportUrl(polyModUrl, mod.main, polyModObject.base));
                let newMod = modImport.polyMod;
                newMod.iconSrc = `${polyModUrl}/icon.png`;
                mod.version = polyModObject.version;
                __classPrivateFieldGet(this, _PolyModLoaderImpl_applyManifestToMod, "f").call(this, newMod, mod);
                newMod.manifest = mod;
                newMod.baseUrl = polyModObject.base;
                newMod.loaded = polyModObject.loaded;
                newMod.savedLatest = latest;
                __classPrivateFieldGet(this, _PolyModLoaderImpl_allMods, "f").push(newMod);
                console.log(mod);
                this.saveModsToLocalStorage();
                return this.getMod(newMod.modID);
            }
            catch (err) {
                alert("Something went wrong importing this mod!");
                console.error("Error in importing mod:", err);
                return;
            }
        }
        catch (err) {
            alert(`Couldn't find mod manifest or version json for "${polyModObject.base}".`);
            console.error("Error in getting mod manifest:", err);
        }
    }
    registerSettingCategory(name) {
        __classPrivateFieldGet(this, _PolyModLoaderImpl_settings, "f").push(`(0, R.gn)(this, qs, "m", go).call(
              this,
              Ks.getFromLanguage((0, R.gn)(this, so, "f"), "${name}"),
            ),`);
    }
    registerBindCategory(name) {
        __classPrivateFieldGet(this, _PolyModLoaderImpl_keybindings, "f").push(`(0, R.gn)(this, qs, "m", mo).call(
              this,
              Ks.getFromLanguage((0, R.gn)(this, so, "f"), "${name}"),
            ),`);
    }
    registerSetting(name, id, type, defaultOption, optionsOptional) {
        var _a;
        __classPrivateFieldSet(this, _PolyModLoaderImpl_latestSetting, (_a = __classPrivateFieldGet(this, _PolyModLoaderImpl_latestSetting, "f"), _a++, _a), "f");
        __classPrivateFieldGet(this, _PolyModLoaderImpl_settingConstructor, "f").push(`${Variables.SettingEnum}[${Variables.SettingEnum}.${id} = ${__classPrivateFieldGet(this, _PolyModLoaderImpl_latestSetting, "f")}] = "${id}";`);
        if (type === "boolean") {
            __classPrivateFieldGet(this, _PolyModLoaderImpl_defaultSettings, "f").push(`[${Variables.SettingEnum}.${id}, "${defaultOption === true ? "true" : "false"}"],`);
            __classPrivateFieldGet(this, _PolyModLoaderImpl_settings, "f").push(`(0, R.gn)(this, qs, "m", vo).call(
              this,
              Ks.getFromLanguage((0, R.gn)(this, so, "f"), "${name}"),
              [
                {
                  title: Ks.getFromLanguage((0, R.gn)(this, so, "f"), "Off"),
                  value: "false",
                },
                {
                  title: Ks.getFromLanguage((0, R.gn)(this, so, "f"), "On"),
                  value: "true",
                },
              ],
              ${Variables.SettingEnum}.${id},
            ),`);
        }
        else if (type === "slider") {
            __classPrivateFieldGet(this, _PolyModLoaderImpl_defaultSettings, "f").push(`[${Variables.SettingEnum}.${id}, "${defaultOption}"],`);
            __classPrivateFieldGet(this, _PolyModLoaderImpl_settings, "f").push(`(0, R.gn)(this, qs, "m", Ao).call(
              this,
              Ks.getFromLanguage((0, R.gn)(this, so, "f"), "${name}"),
              ${Variables.SettingEnum}.${id},
            ),`);
        }
        else if (type === "custom") {
            __classPrivateFieldGet(this, _PolyModLoaderImpl_defaultSettings, "f").push(`[${Variables.SettingEnum}.${id}, "${defaultOption}"],`);
            __classPrivateFieldGet(this, _PolyModLoaderImpl_settings, "f").push(`(0, R.gn)(this, qs, "m", vo).call(
              this,
              Ks.getFromLanguage((0, R.gn)(this, so, "f"), "${name}"),
              ${JSON.stringify(optionsOptional)},
              ${Variables.SettingEnum}.${id},
            ),`);
        }
    }
    registerKeybind(name, id, event, defaultBind, secondBindOptional, callback) {
        var _a;
        __classPrivateFieldSet(this, _PolyModLoaderImpl_latestBinding, (_a = __classPrivateFieldGet(this, _PolyModLoaderImpl_latestBinding, "f"), _a++, _a), "f");
        __classPrivateFieldGet(this, _PolyModLoaderImpl_keybindings, "f").push(`(0, R.gn)(this, qs, "m", yo).call(
              this,
              Ks.getFromLanguage(
                (0, R.gn)(this, so, "f"),
                "${name}",
              ),
              ${Variables.KeybindEnum}.${id},
            ),`);
        __classPrivateFieldGet(this, _PolyModLoaderImpl_bindConstructor, "f").push(`${Variables.KeybindEnum}[${Variables.KeybindEnum}.${id} = ${__classPrivateFieldGet(this, _PolyModLoaderImpl_latestBinding, "f")}] = "${id}";`);
        __classPrivateFieldGet(this, _PolyModLoaderImpl_defaultBinds, "f").push(`[${Variables.KeybindEnum}.${id}, ["${defaultBind}", ${secondBindOptional ? `"${secondBindOptional}"` : "null"}]],`);
        window.addEventListener(event, (e) => {
            const settingClass = this.settingClass;
            if (!settingClass || typeof settingClass.checkKeyBinding !== "function")
                return;
            let keybind;
            try {
                keybind = this.getFromPolyTrack(`${Variables.KeybindEnum}.${id}`);
            }
            catch {
                return;
            }
            if (settingClass.checkKeyBinding(e, keybind)) {
                callback(e);
            }
        });
    }
    getSetting(id) {
        return this.getFromPolyTrack(`ActivePolyModLoader.settingClass.getSetting(${Variables.SettingEnum}.${id})`);
    }
    /**
     * Remove a mod from the internal list.
     *
     * @param {PolyMod} mod - The mod to remove.
     */
    removeMod(mod) {
        if (!mod)
            return;
        if (mod.modID === "pmlcore") {
            return;
        }
        const index = __classPrivateFieldGet(this, _PolyModLoaderImpl_allMods, "f").indexOf(mod);
        if (index > -1) {
            __classPrivateFieldGet(this, _PolyModLoaderImpl_allMods, "f").splice(index, 1);
        }
        this.saveModsToLocalStorage();
    }
    /**
     * Set the loaded state of a mod.
     *
     * @param {PolyMod} mod   - The mod to set the state of.
     * @param {boolean} state - The state to set. `true` is loaded, `false` is unloaded.
     */
    setModLoaded(mod, state) {
        if (!mod)
            return;
        if (mod.modID === "pmlcore") {
            return;
        }
        mod.loaded = state;
        this.saveModsToLocalStorage();
    }
    initMods() {
        __classPrivateFieldGet(this, _PolyModLoaderImpl_instances, "m", _PolyModLoaderImpl_preInitPML).call(this);
        let initList = [];
        for (let polyMod of __classPrivateFieldGet(this, _PolyModLoaderImpl_allMods, "f")) {
            if (polyMod.modID && polyMod.isLoaded)
                initList.push(polyMod.modID);
        }
        let allModsInit = false;
        if (initList.length === 0)
            allModsInit = true; // no mods to initialize lol
        while (!allModsInit) {
            let currentMod = this.getMod(initList[0]);
            if (!currentMod)
                continue;
            console.log(initList[0]);
            let initCheck = true;
            for (let dependency of currentMod.modDependencies || []) {
                let curDependency = this.getMod(dependency.id);
                if (!curDependency) {
                    initCheck = false;
                    initList.splice(0, 1);
                    alert(`Mod ${currentMod.modName} is missing mod ${dependency.id} ${dependency.version} and will not be initialized.`);
                    console.warn(`Mod ${currentMod.modName} is missing mod ${dependency.id} ${dependency.version} and will not be initialized.`);
                    this.setModLoaded(currentMod, false);
                    break;
                }
                if (!curDependency.isLoaded) {
                    initCheck = false;
                    initList.splice(0, 1);
                    alert(`Mod ${currentMod.modName} depends on mod ${dependency.id} ${dependency.version} but the dependency isn't loaded. Mod will not be initialized.`);
                    console.warn(`Mod ${currentMod.modName} depends on mod ${dependency.id} ${dependency.version} but the dependency isn't loaded. Mod will not be initialized.`);
                    this.setModLoaded(currentMod, false);
                    break;
                }
                if (!semver.satisfies(curDependency.modVersion || "0.0.0", dependency.version)) {
                    initCheck = false;
                    initList.splice(0, 1);
                    alert(`Mod ${currentMod.modName} needs version ${dependency.version} of ${curDependency.modName} but ${curDependency.modVersion} is present.`);
                    console.warn(`Mod ${currentMod.modName} needs version ${dependency.version} of ${curDependency.modName} but ${curDependency.modVersion} is present.`);
                    this.setModLoaded(currentMod, false);
                    break;
                }
                if (!curDependency.initialized) {
                    initCheck = false;
                    initList.splice(0, 1);
                    initList.push(currentMod.modID || "");
                    break;
                }
            }
            if (initCheck) {
                try {
                    currentMod.init(this);
                    currentMod.initialized = true;
                    initList.splice(0, 1);
                }
                catch (err) {
                    alert(`Mod ${currentMod.modName} failed to initialize and will be unloaded.`);
                    console.error("Error in initializing mod:", err);
                    this.setModLoaded(currentMod, false);
                    initList.splice(0, 1);
                }
            }
            if (initList.length === 0)
                allModsInit = true;
        }
        __classPrivateFieldGet(this, _PolyModLoaderImpl_instances, "m", _PolyModLoaderImpl_applySettings).call(this);
        __classPrivateFieldGet(this, _PolyModLoaderImpl_instances, "m", _PolyModLoaderImpl_applyKeybinds).call(this);
    }
    postInitMods() {
        for (let polyMod of __classPrivateFieldGet(this, _PolyModLoaderImpl_allMods, "f")) {
            if (polyMod.isLoaded) {
                try {
                    polyMod.postInit();
                }
                catch (err) {
                    alert(`Mod ${polyMod.modName} failed to post initialize and will be unloaded.`);
                    console.error("Error in post initializing mod:", err);
                    this.setModLoaded(polyMod, false);
                }
            }
        }
    }
    gameLoad() {
        if (!this.gameLoadCalled) {
            this.gameLoadCalled = true;
        }
        else {
            return;
        }
        for (let polyMod of __classPrivateFieldGet(this, _PolyModLoaderImpl_allMods, "f")) {
            if (polyMod.isLoaded) {
                try {
                    polyMod.onGameLoad();
                }
                catch (err) {
                    alert(`Mod ${polyMod.modName} failed on game load and will be unloaded.`);
                    console.error("Error on game load for mod:", err);
                    this.setModLoaded(polyMod, false);
                }
            }
        }
    }
    preInitMods() {
        __classPrivateFieldGet(this, _PolyModLoaderImpl_instances, "m", _PolyModLoaderImpl_prePreInitPML).call(this);
        for (let polyMod of __classPrivateFieldGet(this, _PolyModLoaderImpl_allMods, "f")) {
            if (polyMod.isLoaded) {
                try {
                    polyMod.preInit(this);
                }
                catch (err) {
                    alert(`Mod ${polyMod.modName} failed on pre init and will be unloaded.`);
                    console.error("Error on pre init for mod:", err);
                    this.setModLoaded(polyMod, false);
                }
            }
        }
    }
    /**
     * Access a mod by its mod ID.
     *
     * @param   {string} id - The ID of the mod to get
     * @returns {PolyMod}   - The requested mod's object.
     */
    getMod(id) {
        for (let polyMod of __classPrivateFieldGet(this, _PolyModLoaderImpl_allMods, "f")) {
            if (polyMod.modID == id)
                return polyMod;
        }
    }
    /**
     * Get the list of all mods.
     *
     * @type {PolyMod[]}
     */
    getAllMods() {
        return __classPrivateFieldGet(this, _PolyModLoaderImpl_allMods, "f");
    }
    get simWorkerMixins() {
        return [...__classPrivateFieldGet(this, _PolyModLoaderImpl_simWorkerMixins, "f")];
    }
    get pmlVersion() {
        return __classPrivateFieldGet(this, _PolyModLoaderImpl_pmlVersion, "f");
    }
    isVanillaCompatible() {
        for (let polyMod of __classPrivateFieldGet(this, _PolyModLoaderImpl_allMods, "f")) {
            if (polyMod.isLoaded && polyMod.touchingPhysics === true) {
                return false;
            }
        }
        return true;
    }
    /**
     * Inject mixin under scope {@link scope} with target function name defined by {@link path}.
     * This only injects functions in `main.bundle.js`.
     *
     * @param {string} scope        - The scope under which mixin is injected.
     * @param {string} path         - The path under the {@link scope} which the mixin targets.
     * @param {MixinType} mixinType - The type of injection.
     * @param {string[]} accessors  - A list of strings to evaluate to access private variables.
     * @param {function} func       - The new function to be injected.
     */
    registerClassMixin(scope, path, mixinArg, legacyArg1, legacyArg2, legacyArg3) {
        try {
            mixinArg = normalizeLegacyMixinArg(mixinArg, legacyArg1, legacyArg2, legacyArg3);
            let originalFunc = this.getFromPolyTrack(scope)?.[path];
            if (!originalFunc || typeof originalFunc.toString !== "function") {
                console.warn(`[PML] Skipped class mixin for ${scope}.${path}: target function not found.`);
                return false;
            }
            const mixinType = mixinArg.type;
            let token;
            let tokenStart;
            let tokenEnd;
            let func;
            switch (mixinType) {
            case MixinType.INSERT:
                token = mixinArg.token;
                func = mixinArg.func;
                const funcStr = originalFunc.toString();
                const tokenIndex = typeof token === 'string' ? funcStr.indexOf(token) : findNthOccurrence(funcStr, token.token, token.occ);
                if (tokenIndex === -1) {
                    throw new Error(`Token "${token}" not found in function "${path}".`);
                }
                let injectedCode = typeof func == "function"
                    ? func
                        .toString()
                        .replace(/^.*?{([\s\S]*)}$/, "$1")
                        .trim()
                    : func;
                let newFuncStr = funcStr.slice(0, tokenIndex + (typeof token === 'string' ? token.length : token.token.length)) +
                    injectedCode +
                    funcStr.slice(tokenIndex + (typeof token === 'string' ? token.length : token.token.length));
                const match1 = newFuncStr.match(/^\s*(async\s+)?([\w$]+)\s*\(([^)]*)\)\s*{([\s\S]*)}$/);
                if (!match1) {
                    console.error("No match found in function!");
                }
                else if (match1[1] === "async ") {
                    this.getFromPolyTrack(`eval("${scope}")["${path}"] = (async function(${match1[3]}) {${match1[4]}});`);
                }
                else {
                    const args1 = match1[3].trim();
                    const body1 = match1[4].trim();
                    this.getFromPolyTrack(`eval("${scope}")["${path}"] = (function(${args1}) {${body1}});;`);
                }
                break;
            case MixinType.REMOVEBETWEEN:
                tokenStart = mixinArg.tokenStart;
                tokenEnd = mixinArg.tokenEnd;
                const funcStr2 = originalFunc.toString();
                const firstTokenIndex = typeof tokenStart === 'string' ? funcStr2.indexOf(tokenStart) : findNthOccurrence(funcStr2, tokenStart.token, tokenStart.occ);
                const secondTokenIndex = typeof tokenEnd === 'string' ? funcStr2.indexOf(tokenEnd) : findNthOccurrence(funcStr2, tokenEnd.token, tokenEnd.occ);
                if (firstTokenIndex === -1) {
                    throw new Error(`Token "${tokenStart}" not found in function "${path}".`);
                }
                if (secondTokenIndex === -1) {
                    throw new Error(`Token "${tokenEnd}" not found in function "${path}".`);
                }
                let newFuncStr2 = funcStr2
                    .split(funcStr2.substring(firstTokenIndex, secondTokenIndex + (typeof tokenEnd === 'string' ? tokenEnd.length : tokenEnd.token.length)))
                    .join("");
                const match2 = newFuncStr2.match(/^\s*(async\s+)?([\w$]+)\s*\(([^)]*)\)\s*{([\s\S]*)}$/);
                if (match2[1] === "async ") {
                    this.getFromPolyTrack(`eval("${scope}")["${path}"] = (async function(${match2[3]}) {${match2[4]}})`);
                }
                else {
                    const args2 = match2[3].trim();
                    const body2 = match2[4].trim();
                    this.getFromPolyTrack(`eval("${scope}")["${path}"] = (function(${args2}) {${body2}})`);
                }
                break;
            case MixinType.REPLACEBETWEEN:
                tokenStart = mixinArg.tokenStart;
                tokenEnd = mixinArg.tokenEnd;
                func = mixinArg.func;
                const funcStr3 = originalFunc.toString();
                const firstTokenIndex1 = typeof tokenStart === 'string' ? funcStr3.indexOf(tokenStart) : findNthOccurrence(funcStr3, tokenStart.token, tokenStart.occ);
                const secondTokenIndex1 = typeof tokenEnd === 'string' ? funcStr3.indexOf(tokenEnd) : findNthOccurrence(funcStr3, tokenEnd.token, tokenEnd.occ);
                if (firstTokenIndex1 === -1) {
                    throw new Error(`Token "${tokenStart}" not found in function "${path}".`);
                }
                if (secondTokenIndex1 === -1) {
                    throw new Error(`Token "${tokenEnd}" not found in function "${path}".`);
                }
                let injectedCode2 = typeof func == "function"
                    ? func
                        .toString()
                        .replace(/^.*?{([\s\S]*)}$/, "$1")
                        .trim()
                    : func;
                let newFuncStr3 = funcStr3
                    .split(funcStr3.substring(firstTokenIndex1, secondTokenIndex1 + (typeof tokenEnd === 'string' ? tokenEnd.length : tokenEnd.token.length)))
                    .join(injectedCode2);
                const match = newFuncStr3.match(/^\s*(async\s+)?([\w$]+)\s*\(([^)]*)\)\s*{([\s\S]*)}$/);
                if (match[1] === "async ") {
                    this.getFromPolyTrack(`eval("${scope}")["${path}"] = (async function(${match[3]}) {${match[4]}})`);
                }
                else {
                    const args = match[3].trim();
                    const body = match[4].trim();
                    this.getFromPolyTrack(`eval("${scope}")["${path}"] = (function(${args}) {${body}})`);
                }
                break;
            case MixinType.OVERRIDE:
                func = mixinArg.func;
                this.getFromPolyTrack(`eval("${scope}")["${path}"] = (${typeof func === "function" ? func.toString() : func});`);
                break;
            }
            return true;
        }
        catch (err) {
            console.warn(`[PML] Skipped class mixin for ${scope}.${path}:`, err);
            return false;
        }
    }
    ;
    /**
     * Inject mixin with target function name defined by {@link path}.
     * This only injects functions in `main.bundle.js`.
     *
     * @param {string} path         - The path of the function which the mixin targets.
     * @param {MixinType} mixinType - The type of injection.
     * @param {string[]} accessors  - A list of strings to evaluate to access private variables.
     * @param {function} func       - The new function to be injected.
     */
    registerFuncMixin(path, mixinArg, legacyArg1, legacyArg2, legacyArg3) {
        try {
            mixinArg = normalizeLegacyMixinArg(mixinArg, legacyArg1, legacyArg2, legacyArg3);
            var originalFunc = this.getFromPolyTrack(path);
            if (!originalFunc || typeof originalFunc.toString !== "function") {
                console.warn(`[PML] Skipped function mixin for ${path}: target function not found.`);
                return false;
            }
            const mixinType = mixinArg.type;
            let token;
            let tokenStart;
            let tokenEnd;
            let func;
            switch (mixinType) {
            case MixinType.INSERT:
                ({ token, func } = mixinArg);
                const funcStr = originalFunc.toString();
                const tokenIndex = typeof token === 'string' ? funcStr.indexOf(token) : findNthOccurrence(funcStr, token.token, token.occ);
                if (tokenIndex === -1) {
                    throw new Error(`Token "${token}" not found in function "${path}".`);
                }
                const injectedCode = typeof func === "function"
                    ? func
                        .toString()
                        .replace(/^.*?{([\\s\\S]*)}$/, "$1")
                        .trim()
                    : func;
                const newFuncStr = funcStr.slice(0, tokenIndex + (typeof token === 'string' ? token.length : token.token.length)) +
                    injectedCode +
                    funcStr.slice(tokenIndex + (typeof token === 'string' ? token.length : token.token.length));
                this.getFromPolyTrack(`${path} = (${newFuncStr});`);
                break;
            case MixinType.REMOVEBETWEEN:
                ({ tokenStart, tokenEnd } = mixinArg);
                const funcStr2 = originalFunc.toString();
                const firstTokenIndex = typeof tokenStart === 'string' ? funcStr2.indexOf(tokenStart) : findNthOccurrence(funcStr2, tokenStart.token, tokenStart.occ);
                const secondTokenIndex = typeof tokenEnd === 'string' ? funcStr2.indexOf(tokenEnd) : findNthOccurrence(funcStr2, tokenEnd.token, tokenEnd.occ);
                ;
                if (firstTokenIndex === -1) {
                    throw new Error(`Token "${tokenStart}" not found in function "${path}".`);
                }
                if (secondTokenIndex === -1) {
                    throw new Error(`Token "${tokenEnd}" not found in function "${path}".`);
                }
                let newFuncStr2 = funcStr2
                    .split(funcStr2.substring(firstTokenIndex, secondTokenIndex + (typeof tokenEnd === 'string' ? tokenEnd.length : tokenEnd.token.length)))
                    .join("");
                this.getFromPolyTrack(`${path} = (${newFuncStr2});`);
                break;
            case MixinType.REPLACEBETWEEN:
                ({ tokenStart, tokenEnd, func } = mixinArg);
                const funcStr3 = originalFunc.toString();
                const firstTokenIndex1 = typeof tokenStart === 'string' ? funcStr3.indexOf(tokenStart) : findNthOccurrence(funcStr3, tokenStart.token, tokenStart.occ);
                const secondTokenIndex1 = typeof tokenEnd === 'string' ? funcStr3.indexOf(tokenEnd) : findNthOccurrence(funcStr3, tokenEnd.token, tokenEnd.occ);
                if (firstTokenIndex1 === -1) {
                    throw new Error(`Token "${tokenStart}" not found in function "${path}".`);
                }
                if (secondTokenIndex1 === -1) {
                    throw new Error(`Token "${tokenEnd}" not found in function "${path}".`);
                }
                let injectedCode2 = null;
                if (typeof func === "function") {
                    injectedCode2 = func.toString();
                    injectedCode2 = injectedCode2
                        .replace(/^.*?{([\\s\\S]*)}$/, "$1")
                        .trim();
                }
                else {
                    injectedCode2 = func;
                }
                let newFuncStr3 = funcStr3
                    .split(funcStr3.substring(firstTokenIndex1, secondTokenIndex1 + (typeof tokenEnd === 'string' ? tokenEnd.length : tokenEnd.token.length)))
                    .join(injectedCode2);
                this.getFromPolyTrack(`${path} = (${newFuncStr3});`);
                break;
            case MixinType.OVERRIDE:
                func = mixinArg.func;
                this.getFromPolyTrack(`${path} = (${typeof func === "function" ? func.toString() : func});`);
                break;
            }
            return true;
        }
        catch (err) {
            console.warn(`[PML] Skipped function mixin for ${path}:`, err);
            return false;
        }
    }
    ;
    registerClassWideMixin(path, mixinArg, legacyArg1, legacyArg2, legacyArg3) {
        mixinArg = normalizeLegacyMixinArg(mixinArg, legacyArg1, legacyArg2, legacyArg3);
        let originalClassStr = this.getFromPolyTrack(path).toString();
        let newClassStr = originalClassStr;
        const mixinType = mixinArg.type;
        let token;
        let tokenStart;
        let tokenEnd;
        let func;
        switch (mixinType) {
            case MixinType.INSERT:
                token = mixinArg.token;
                func = mixinArg.func;
                const tokenIndex = typeof token === 'string' ? originalClassStr.indexOf(token) : findNthOccurrence(originalClassStr, token.token, token.occ);
                if (tokenIndex === -1) {
                    throw new Error(`Token "${token}" not found in class "${path}".`);
                }
                const injectedCode = func
                    .toString()
                    .replace(/^.*?{([\s\S]*)}$/, "$1")
                    .trim();
                newClassStr.slice(0, tokenIndex + (typeof token === 'string' ? token.length : token.token.length)) +
                    injectedCode +
                    newClassStr.slice(tokenIndex + (typeof token === 'string' ? token.length : token.token.length));
                break;
            case MixinType.REMOVEBETWEEN:
                tokenStart = mixinArg.tokenStart;
                tokenEnd = mixinArg.tokenEnd;
                const firstTokenIndex = typeof tokenStart === 'string' ? originalClassStr.indexOf(tokenStart) : findNthOccurrence(originalClassStr, tokenStart.token, tokenStart.occ);
                const secondTokenIndex = typeof tokenEnd === 'string' ? originalClassStr.indexOf(tokenEnd) : findNthOccurrence(originalClassStr, tokenEnd.token, tokenEnd.occ);
                if (firstTokenIndex === -1) {
                    throw new Error(`Token "${tokenStart}" not found in function "${path}".`);
                }
                if (secondTokenIndex === -1) {
                    throw new Error(`Token "${tokenEnd}" not found in function "${path}".`);
                }
                newClassStr = originalClassStr
                    .split(originalClassStr.substring(firstTokenIndex, secondTokenIndex + (typeof tokenEnd === 'string' ? tokenEnd.length : tokenEnd.token.length)))
                    .join("");
                break;
            case MixinType.REPLACEBETWEEN:
                tokenStart = mixinArg.tokenStart;
                tokenEnd = mixinArg.tokenEnd;
                func = mixinArg.func;
                const firstTokenIndex1 = typeof tokenStart === 'string' ? originalClassStr.indexOf(tokenStart) : findNthOccurrence(originalClassStr, tokenStart.token, tokenStart.occ);
                const secondTokenIndex1 = typeof tokenEnd === 'string' ? originalClassStr.indexOf(tokenEnd) : findNthOccurrence(originalClassStr, tokenEnd.token, tokenEnd.occ);
                if (firstTokenIndex1 === -1) {
                    throw new Error(`Token "${tokenStart}" not found in function "${path}".`);
                }
                if (secondTokenIndex1 === -1) {
                    throw new Error(`Token "${tokenEnd}" not found in function "${path}".`);
                }
                let injectedCode2 = null;
                if (typeof func === "function") {
                    injectedCode2 = func.toString();
                    injectedCode2 = injectedCode2
                        .replace(/^.*?{([\s\S]*)}$/, "$1")
                        .trim();
                }
                else {
                    injectedCode2 = func;
                }
                newClassStr = originalClassStr
                    .split(originalClassStr.substring(firstTokenIndex1, secondTokenIndex1 + (typeof tokenEnd === 'string' ? tokenEnd.length : tokenEnd.token.length)))
                    .join(injectedCode2);
        }
        this.getFromPolyTrack(`${path} = ${newClassStr}`);
    }
    registerPhysicsLibMixin(mixinArg, legacyArg1, legacyArg2, legacyArg3) {
        mixinArg = normalizeLegacyMixinArg(mixinArg, legacyArg1, legacyArg2, legacyArg3);
        __classPrivateFieldGet(this, _PolyModLoaderImpl_physicsMixins, "f").push({ mixinArg });
    }
    registerSimWorkerMixin(mixinArg, legacyArg1, legacyArg2, legacyArg3) {
        mixinArg = normalizeLegacyMixinArg(mixinArg, legacyArg1, legacyArg2, legacyArg3);
        __classPrivateFieldGet(this, _PolyModLoaderImpl_simWorkerMixins, "f").push({ mixinArg });
    }
    registerPhysicsFuncMixin(_path, mixinArg, legacyArg1, legacyArg2, legacyArg3) {
        this.registerPhysicsLibMixin(mixinArg, legacyArg1, legacyArg2, legacyArg3);
    }
    registerSimWorkerFuncMixin(_path, mixinArg, legacyArg1, legacyArg2, legacyArg3) {
        this.registerSimWorkerMixin(mixinArg, legacyArg1, legacyArg2, legacyArg3);
    }
    getPhysicsLibURL() {
        const mixins = __classPrivateFieldGet(this, _PolyModLoaderImpl_physicsMixins, "f");
        let originalPhysicsString;
        let req = new XMLHttpRequest();
        req.open("GET", "lib/polytrack_physics.js", false);
        req.send();
        originalPhysicsString = req.responseText;
        for (let mixin of mixins) {
            try {
                const mixinArg = mixin.mixinArg;
                const mixinType = mixinArg.type;
                let token;
                let tokenStart;
                let tokenEnd;
                let func;
                switch (mixinType) {
                case MixinType.INSERT:
                    ({ token, func } = mixinArg);
                    if (!originalPhysicsString) {
                        console.error("Error fetching physics lib file.");
                        return "lib/polytrack_physics.js";
                    }
                    const funcStr = originalPhysicsString;
                    const tokenIndex = typeof token === 'string' ? funcStr.indexOf(token) : findNthOccurrence(funcStr, token.token, token.occ);
                    if (tokenIndex === -1) {
                        throw new Error(`Token "${token}" not found in physics lib file.`);
                    }
                    const injectedCode = typeof func === "function"
                        ? func
                            .toString()
                            .replace(/^.*?{([\s\S]*)}$/, "$1")
                            .trim()
                        : func;
                    const newFuncStr = funcStr.slice(0, tokenIndex + (typeof token === 'string' ? token.length : token.token.length)) +
                        injectedCode +
                        funcStr.slice(tokenIndex + (typeof token === 'string' ? token.length : token.token.length));
                    originalPhysicsString = newFuncStr;
                    break;
                case MixinType.REMOVEBETWEEN:
                    ({ tokenStart, tokenEnd } = mixinArg);
                    if (!originalPhysicsString) {
                        console.error("Error fetching simulation worker.");
                        return "lib/polytrack_physics.js";
                    }
                    const funcStr2 = originalPhysicsString;
                    const firstTokenIndex = typeof tokenStart === 'string' ? funcStr2.indexOf(tokenStart) : findNthOccurrence(funcStr2, tokenStart.token, tokenStart.occ);
                    const secondTokenIndex = typeof tokenEnd === 'string' ? funcStr2.indexOf(tokenEnd) : findNthOccurrence(funcStr2, tokenEnd.token, tokenEnd.occ);
                    if (firstTokenIndex === -1) {
                        throw new Error(`Token "${tokenStart}" not found in physics lib file.`);
                    }
                    if (secondTokenIndex === -1) {
                        throw new Error(`Token "${tokenEnd}" not found in physics lib file.`);
                    }
                    let newFuncStr2 = funcStr2
                        .split(funcStr2.substring(firstTokenIndex, secondTokenIndex + (typeof tokenEnd === 'string' ? tokenEnd.length : tokenEnd.token.length)))
                        .join("");
                    originalPhysicsString = newFuncStr2;
                    break;
                case MixinType.REPLACEBETWEEN:
                    ({ tokenStart, tokenEnd, func } = mixinArg);
                    if (!originalPhysicsString) {
                        console.error("Error fetching physics lib file.");
                        return "lib/polytrack_physics.js";
                    }
                    const funcStr3 = originalPhysicsString;
                    const firstTokenIndex1 = typeof tokenStart === 'string' ? funcStr3.indexOf(tokenStart) : findNthOccurrence(funcStr3, tokenStart.token, tokenStart.occ);
                    const secondTokenIndex1 = typeof tokenEnd === 'string' ? funcStr3.indexOf(tokenEnd) : findNthOccurrence(funcStr3, tokenEnd.token, tokenEnd.occ);
                    if (firstTokenIndex1 === -1) {
                        throw new Error(`Token "${tokenStart}" not found in physics lib file.`);
                    }
                    if (secondTokenIndex1 === -1) {
                        throw new Error(`Token "${tokenEnd}" not found in physics lib file.`);
                    }
                    let injectedCode2 = null;
                    if (typeof func === "function") {
                        injectedCode2 = func.toString();
                        injectedCode2 = injectedCode2
                            .replace(/^.*?{([\s\S]*)}$/, "$1")
                            .trim();
                    }
                    else {
                        injectedCode2 = func;
                    }
                    let newFuncStr3 = funcStr3
                        .split(funcStr3.substring(firstTokenIndex1, secondTokenIndex1 + (typeof tokenEnd === 'string' ? tokenEnd.length : tokenEnd.token.length)))
                        .join(injectedCode2);
                    originalPhysicsString = newFuncStr3;
                    break;
            }
            }
            catch (err) {
                console.warn("[PML] Skipped physics lib mixin:", err);
            }
        }
        if (!originalPhysicsString)
            return "lib/polytrack_physics.js";
        return URL.createObjectURL(new Blob([originalPhysicsString], { type: "application/javascript" }));
    }
    getPhysicsWasmURL() {
        const req = new XMLHttpRequest();
        req.overrideMimeType("text/plain; charset=x-user-defined");
        req.open("GET", "polytrack_physics.wasm", false);
        req.send();
        if (!req.response)
            return "polytrack_physics.wasm";
        const raw = req.response;
        const wasmData = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) {
            wasmData[i] = raw.charCodeAt(i) & 0xff; // mask to get raw byte value
        }
        console.log(`WASM state: ${WebAssembly.validate(wasmData)}`);
        return URL.createObjectURL(new Blob([wasmData], { type: "application/wasm" }));
    }
    getSimURL() {
        const mixins = __classPrivateFieldGet(this, _PolyModLoaderImpl_simWorkerMixins, "f");
        let originalSimString;
        let req = new XMLHttpRequest();
        req.open("GET", "simulation_worker.bundle.js", false);
        req.send();
        originalSimString = req.responseText;
        for (let mixin of mixins) {
            try {
                const mixinArg = mixin.mixinArg;
                const mixinType = mixinArg.type;
                let token;
                let tokenStart;
                let tokenEnd;
                let func;
                switch (mixinType) {
                case MixinType.INSERT:
                    ({ token, func } = mixinArg);
                    if (!originalSimString) {
                        console.error("Error fetching simulation worker.");
                        return "simulation_worker.bundle.js";
                    }
                    const funcStr = originalSimString;
                    const tokenIndex = typeof token === 'string' ? funcStr.indexOf(token) : findNthOccurrence(funcStr, token.token, token.occ);
                    if (tokenIndex === -1) {
                        throw new Error(`Token "${token}" not found in simulation bundle.`);
                    }
                    const injectedCode = typeof func === "function"
                        ? func
                            .toString()
                            .replace(/^.*?{([\s\S]*)}$/, "$1")
                            .trim()
                        : func;
                    const newFuncStr = funcStr.slice(0, tokenIndex + (typeof token === 'string' ? token.length : token.token.length)) +
                        injectedCode +
                        funcStr.slice(tokenIndex + (typeof token === 'string' ? token.length : token.token.length));
                    originalSimString = newFuncStr;
                    break;
                case MixinType.REMOVEBETWEEN:
                    ({ tokenStart, tokenEnd } = mixinArg);
                    if (!originalSimString) {
                        console.error("Error fetching simulation worker.");
                        return "simulation_worker.bundle.js";
                    }
                    const funcStr2 = originalSimString;
                    const firstTokenIndex = typeof tokenStart === 'string' ? funcStr2.indexOf(tokenStart) : findNthOccurrence(funcStr2, tokenStart.token, tokenStart.occ);
                    const secondTokenIndex = typeof tokenEnd === 'string' ? funcStr2.indexOf(tokenEnd) : findNthOccurrence(funcStr2, tokenEnd.token, tokenEnd.occ);
                    if (firstTokenIndex === -1) {
                        throw new Error(`Token "${tokenStart}" not found in simulation bundle.`);
                    }
                    if (secondTokenIndex === -1) {
                        throw new Error(`Token "${tokenEnd}" not found in simulation bundle.`);
                    }
                    let newFuncStr2 = funcStr2
                        .split(funcStr2.substring(firstTokenIndex, secondTokenIndex + (typeof tokenEnd === 'string' ? tokenEnd.length : tokenEnd.token.length)))
                        .join("");
                    originalSimString = newFuncStr2;
                    break;
                case MixinType.REPLACEBETWEEN:
                    ({ tokenStart, tokenEnd, func } = mixinArg);
                    if (!originalSimString) {
                        console.error("Error fetching simulation worker.");
                        return "simulation_worker.bundle.js";
                    }
                    const funcStr3 = originalSimString;
                    const firstTokenIndex1 = typeof tokenStart === 'string' ? funcStr3.indexOf(tokenStart) : findNthOccurrence(funcStr3, tokenStart.token, tokenStart.occ);
                    const secondTokenIndex1 = typeof tokenEnd === 'string' ? funcStr3.indexOf(tokenEnd) : findNthOccurrence(funcStr3, tokenEnd.token, tokenEnd.occ);
                    if (firstTokenIndex1 === -1) {
                        throw new Error(`Token "${tokenStart}" not found in simulation bundle.`);
                    }
                    if (secondTokenIndex1 === -1) {
                        throw new Error(`Token "${tokenEnd}" not found in simulation bundle.`);
                    }
                    let injectedCode2 = null;
                    if (typeof func === "function") {
                        injectedCode2 = func.toString();
                        injectedCode2 = injectedCode2
                            .replace(/^.*?{([\s\S]*)}$/, "$1")
                            .trim();
                    }
                    else {
                        injectedCode2 = func;
                    }
                    let newFuncStr3 = funcStr3
                        .split(funcStr3.substring(firstTokenIndex1, secondTokenIndex1 + (typeof tokenEnd === 'string' ? tokenEnd.length : tokenEnd.token.length)))
                        .join(injectedCode2);
                    originalSimString = newFuncStr3;
                    break;
            }
            }
            catch (err) {
                console.warn("[PML] Skipped simulation worker mixin:", err);
            }
        }
        if (!originalSimString)
            return "simulation_worker.bundle.js";
        if (originalSimString.includes("\"lib/polytrack_physics.js\"")) {
            originalSimString = originalSimString
                .split("\"lib/polytrack_physics.js\"")
                .join(JSON.stringify(this.getPhysicsLibURL()));
        }
        return URL.createObjectURL(new Blob([originalSimString], { type: "application/javascript" }));
    }
    registerGlobalMixin(mixinArg, legacyArg1, legacyArg2, legacyArg3) {
        try {
            mixinArg = normalizeLegacyMixinArg(mixinArg, legacyArg1, legacyArg2, legacyArg3);
            let path = "globalFunc";
            var originalFunc = this.getFromPolyTrackGlobal(path);
            if (!originalFunc || typeof originalFunc.toString !== "function") {
                console.warn("[PML] Skipped global mixin: target function not found.");
                return false;
            }
            const mixinType = mixinArg.type;
            let token;
            let tokenStart;
            let tokenEnd;
            let func;
            switch (mixinType) {
            case MixinType.INSERT:
                ({ token, func } = mixinArg);
                const funcStr = originalFunc.toString();
                const tokenIndex = typeof token === 'string' ? funcStr.indexOf(token) : findNthOccurrence(funcStr, token.token, token.occ);
                if (tokenIndex === -1) {
                    throw new Error(`Token "${token}" not found in function "${path}".`);
                }
                const injectedCode = typeof func === "function"
                    ? func
                        .toString()
                        .replace(/^.*?{([\s\S]*)}$/, "$1")
                        .trim()
                    : func;
                const newFuncStr = funcStr.slice(0, tokenIndex + (typeof token === 'string' ? token.length : token.token.length)) +
                    injectedCode +
                    funcStr.slice(tokenIndex + (typeof token === 'string' ? token.length : token.token.length));
                this.newFunc = this.getFromPolyTrackGlobal(`(${newFuncStr})`);
                break;
            case MixinType.REMOVEBETWEEN:
                ({ tokenStart, tokenEnd } = mixinArg);
                const funcStr2 = originalFunc.toString();
                const firstTokenIndex = typeof tokenStart === 'string' ? funcStr2.indexOf(tokenStart) : findNthOccurrence(funcStr2, tokenStart.token, tokenStart.occ);
                const secondTokenIndex = typeof tokenEnd === 'string' ? funcStr2.indexOf(tokenEnd) : findNthOccurrence(funcStr2, tokenEnd.token, tokenEnd.occ);
                if (firstTokenIndex === -1) {
                    throw new Error(`Token "${tokenStart}" not found in function "${path}".`);
                }
                if (secondTokenIndex === -1) {
                    throw new Error(`Token "${tokenEnd}" not found in function "${path}".`);
                }
                let newFuncStr2 = funcStr2
                    .split(funcStr2.substring(firstTokenIndex, secondTokenIndex + (typeof tokenEnd === 'string' ? tokenEnd.length : tokenEnd.token.length)))
                    .join("");
                this.newFunc = this.getFromPolyTrackGlobal(`(${newFuncStr2})`);
                break;
            case MixinType.REPLACEBETWEEN:
                ({ tokenStart, tokenEnd, func } = mixinArg);
                const funcStr3 = originalFunc.toString();
                const firstTokenIndex1 = typeof tokenStart === 'string' ? funcStr3.indexOf(tokenStart) : findNthOccurrence(funcStr3, tokenStart.token, tokenStart.occ);
                const secondTokenIndex1 = typeof tokenEnd === 'string' ? funcStr3.indexOf(tokenEnd) : findNthOccurrence(funcStr3, tokenEnd.token, tokenEnd.occ);
                if (firstTokenIndex1 === -1) {
                    throw new Error(`Token "${tokenStart}" not found in function "${path}".`);
                }
                if (secondTokenIndex1 === -1) {
                    throw new Error(`Token "${tokenEnd}" not found in function "${path}".`);
                }
                let injectedCode2 = null;
                if (typeof func === "function") {
                    injectedCode2 = func.toString();
                    injectedCode2 = injectedCode2
                        .replace(/^.*?{([\s\S]*)}$/, "$1")
                        .trim();
                }
                else {
                    injectedCode2 = func;
                }
                let newFuncStr3 = funcStr3
                    .split(funcStr3.substring(firstTokenIndex1, secondTokenIndex1 + (typeof tokenEnd === 'string' ? tokenEnd.length : tokenEnd.token.length)))
                    .join(injectedCode2);
                this.newFunc = this.getFromPolyTrackGlobal(`(${newFuncStr3})`);
                break;
            case MixinType.OVERRIDE:
                func = mixinArg.func;
                this.newFunc = this.getFromPolyTrackGlobal(`(${typeof func === "function" ? func.toString() : func})`);
                break;
            }
            this.getFromPolyTrackGlobal(`${path} = ActivePolyModLoader.newFunc;`);
            return true;
        }
        catch (err) {
            console.warn("[PML] Skipped global mixin:", err);
            return false;
        }
    }
    ;
    registerChunkMixin(bundleName, mixinArg, legacyArg1, legacyArg2, legacyArg3) {
        mixinArg = normalizeLegacyMixinArg(mixinArg, legacyArg1, legacyArg2, legacyArg3);
        __classPrivateFieldGet(this, _PolyModLoaderImpl_chunkMixins, "f").push({ chunk: bundleName, mixinArg });
    }
    applyChunkMixin(url) {
        const mixins = __classPrivateFieldGet(this, _PolyModLoaderImpl_chunkMixins, "f").filter(e => url.includes(e.chunk));
        let originalChunkString;
        for (let mixin of mixins) {
            if (url.indexOf(mixin.chunk) === -1)
                continue;
            const mixinArg = mixin.mixinArg;
            let req = new XMLHttpRequest();
            req.open("GET", url, false);
            req.send();
            originalChunkString = req.responseText;
            const mixinType = mixinArg.type;
            let token;
            let tokenStart;
            let tokenEnd;
            let func;
            switch (mixinType) {
                case MixinType.INSERT:
                    ({ token, func } = mixinArg);
                    const funcStr = originalChunkString;
                    const tokenIndex = typeof token === 'string' ? funcStr.indexOf(token) : findNthOccurrence(funcStr, token.token, token.occ);
                    if (tokenIndex === -1) {
                        throw new Error(`Token "${token}" not found in bundle "${url}".`);
                    }
                    const injectedCode = typeof func === "function"
                        ? func
                            .toString()
                            .replace(/^.*?{([\s\S]*)}$/, "$1")
                            .trim()
                        : func;
                    const newFuncStr = funcStr.slice(0, tokenIndex + (typeof token === 'string' ? token.length : token.token.length)) +
                        injectedCode +
                        funcStr.slice(tokenIndex + (typeof token === 'string' ? token.length : token.token.length));
                    originalChunkString = newFuncStr;
                    break;
                case MixinType.REMOVEBETWEEN:
                    ({ tokenStart, tokenEnd } = mixinArg);
                    const funcStr2 = originalChunkString;
                    const firstTokenIndex = typeof tokenStart === 'string' ? funcStr2.indexOf(tokenStart) : findNthOccurrence(funcStr2, tokenStart.token, tokenStart.occ);
                    const secondTokenIndex = typeof tokenEnd === 'string' ? funcStr2.indexOf(tokenEnd) : findNthOccurrence(funcStr2, tokenEnd.token, tokenEnd.occ);
                    if (firstTokenIndex === -1) {
                        throw new Error(`Token "${tokenStart}" not found in bundle "${url}".`);
                    }
                    if (secondTokenIndex === -1) {
                        throw new Error(`Token "${tokenEnd}" not found in bundle "${url}".`);
                    }
                    let newFuncStr2 = funcStr2
                        .split(funcStr2.substring(firstTokenIndex, secondTokenIndex + (typeof tokenEnd === 'string' ? tokenEnd.length : tokenEnd.token.length)))
                        .join("");
                    originalChunkString = newFuncStr2;
                    break;
                case MixinType.REPLACEBETWEEN:
                    ({ tokenStart, tokenEnd, func } = mixinArg);
                    const funcStr3 = originalChunkString;
                    const firstTokenIndex1 = typeof tokenStart === 'string' ? funcStr3.indexOf(tokenStart) : findNthOccurrence(funcStr3, tokenStart.token, tokenStart.occ);
                    const secondTokenIndex1 = typeof tokenEnd === 'string' ? funcStr3.indexOf(tokenEnd) : findNthOccurrence(funcStr3, tokenEnd.token, tokenEnd.occ);
                    if (firstTokenIndex1 === -1) {
                        throw new Error(`Token "${tokenStart}" not found in bundle "${url}".`);
                    }
                    if (secondTokenIndex1 === -1) {
                        throw new Error(`Token "${tokenEnd}" not found in bundle "${url}".`);
                    }
                    let injectedCode2 = null;
                    if (typeof func === "function") {
                        injectedCode2 = func.toString();
                        injectedCode2 = injectedCode2
                            .replace(/^.*?{([\s\S]*)}$/, "$1")
                            .trim();
                    }
                    else {
                        injectedCode2 = func;
                    }
                    let newFuncStr3 = funcStr3
                        .split(funcStr3.substring(firstTokenIndex1, secondTokenIndex1 + (typeof tokenEnd === 'string' ? tokenEnd.length : tokenEnd.token.length)))
                        .join(injectedCode2);
                    originalChunkString = newFuncStr3;
                    break;
            }
        }
        if (!originalChunkString)
            return;
        return URL.createObjectURL(new Blob([originalChunkString], { type: "application/javascript" }));
    }
}
_PolyModLoaderImpl_polyVersion = new WeakMap(), _PolyModLoaderImpl_allMods = new WeakMap(), _PolyModLoaderImpl_simWorkerMixins = new WeakMap(), _PolyModLoaderImpl_physicsMixins = new WeakMap(), _PolyModLoaderImpl_chunkMixins = new WeakMap(), _PolyModLoaderImpl_settings = new WeakMap(), _PolyModLoaderImpl_settingConstructor = new WeakMap(), _PolyModLoaderImpl_defaultSettings = new WeakMap(), _PolyModLoaderImpl_latestSetting = new WeakMap(), _PolyModLoaderImpl_keybindings = new WeakMap(), _PolyModLoaderImpl_defaultBinds = new WeakMap(), _PolyModLoaderImpl_bindConstructor = new WeakMap(), _PolyModLoaderImpl_latestBinding = new WeakMap(), _PolyModLoaderImpl_pmlVersion = new WeakMap(), _PolyModLoaderImpl_polyModUrls = new WeakMap(), _PolyModLoaderImpl_applyManifestToMod = new WeakMap(), _PolyModLoaderImpl_instances = new WeakSet(), _PolyModLoaderImpl_applySettings = function _PolyModLoaderImpl_applySettings() {
    this.getFromPolyTrack(`${__classPrivateFieldGet(this, _PolyModLoaderImpl_settingConstructor, "f").join("")}`);
    this.registerClassMixin(`${Variables.SettingsClass}.prototype`, "defaultSettings", {
        type: MixinType.INSERT,
        token: `(){`,
        func: `ActivePolyModLoader.settingClass = this;`
    });
    console.log(__classPrivateFieldGet(this, _PolyModLoaderImpl_defaultSettings, "f").join(""));
    this.registerClassMixin(`${Variables.SettingsClass}.prototype`, "defaultSettings", { type: MixinType.INSERT, token: `return new Map([`, func: __classPrivateFieldGet(this, _PolyModLoaderImpl_defaultSettings, "f").join("") });
    this.registerFuncMixin(Variables.SettingUIFunction, {
        type: MixinType.INSERT,
        token: `P.A.GhostCarSoundsEnabled),`,
        func: `${__classPrivateFieldGet(this, _PolyModLoaderImpl_settings, "f").join("")}`
    });
}, _PolyModLoaderImpl_applyKeybinds = function _PolyModLoaderImpl_applyKeybinds() {
    this.registerClassMixin(`${Variables.SettingsClass}.prototype`, "defaultKeyBindings", { type: MixinType.INSERT, token: `(){`, func: `${__classPrivateFieldGet(this, _PolyModLoaderImpl_bindConstructor, "f").join("")};` });
    this.registerClassMixin(`${Variables.SettingsClass}.prototype`, "defaultKeyBindings", { type: MixinType.INSERT, token: `return new Map([`, func: __classPrivateFieldGet(this, _PolyModLoaderImpl_defaultBinds, "f").join("") });
    this.registerFuncMixin(Variables.SettingUIFunction, { type: MixinType.INSERT, token: `ge.A.ToggleSpectatorCamera)`, func: `,${__classPrivateFieldGet(this, _PolyModLoaderImpl_keybindings, "f").join("")}null` });
}, _PolyModLoaderImpl_preInitPML = function _PolyModLoaderImpl_preInitPML() {
    this.registerFuncMixin("Yh", {
        type: MixinType.INSERT, token: `(0,R.gn)(this,_h,"f").appendChild(n);`, func: `
            const text = document.createElement("a");
            text.href = "https://polymodloader.com";
            text.target = "_blank";
            text.textContent = "polymodloader.com - " + e.get("Version") + " " + "${__classPrivateFieldGet(this, _PolyModLoaderImpl_pmlVersion, "f")}";
            (0, R.gn)(this, _h, "f").appendChild(text);
        `
    });
    for (const [scope, method] of [["vc.prototype", "joinInvite"], ["ii.prototype", "renewInvite"]]) {
        this.registerClassMixin(scope, method, { type: MixinType.REPLACEBETWEEN, tokenStart: `mods:[],`, tokenEnd: `mods:[],`, func: `mods: ActivePolyModLoader.getAllMods().filter(m => m.isLoaded).map(m => \`\${m.modID}:\${m.modVersion}\`),` });
        this.registerClassMixin(scope, method, { type: MixinType.REPLACEBETWEEN, tokenStart: `isModsVanillaCompatible:!0,`, tokenEnd: `isModsVanillaCompatible:!0,`, func: `isModsVanillaCompatible: ActivePolyModLoader.isVanillaCompatible(),` });
    }
    // register PML settings
    this.registerSettingCategory("PolyModLoader");
    this.registerSetting("Cache mods (requires reload)", "pmlCacheMods", SettingType.BOOL, true);
    this.registerSetting("Debug Mode (Reload TWICE to apply)", "debugmode", SettingType.BOOL, false);
    this.registerSetting("Clear polyMods", "clearmods", SettingType.BOOL, false);
    this.registerSimWorkerMixin({
        type: MixinType.REPLACEBETWEEN,
        tokenStart: `"lib/polytrack_physics.js"`,
        tokenEnd: `"lib/polytrack_physics.js"`,
        func: `"${this.getPhysicsLibURL()}"`
    });
}, _PolyModLoaderImpl_prePreInitPML = function _PolyModLoaderImpl_prePreInitPML() {
    this.registerGlobalMixin({
        type: MixinType.INSERT,
        token: `M.ppV.enabled=!1,`,
        func: `ActivePolyModLoader.getFromPolyTrack = (path) => eval(path),`
    });
    this.registerGlobalMixin({
        type: MixinType.INSERT,
        token: `await async function(){}();`,
        func: `ActivePolyModLoader.initMods();`
    });
    this.registerGlobalMixin({
        type: MixinType.INSERT,
        token: `M.toggle()}))`,
        func: `,ActivePolyModLoader.postInitMods(),ActivePolyModLoader.gameLoad()`
    });
    this.registerGlobalMixin({
        type: MixinType.INSERT, token: `i.l=(t,n,r,a)=>{`, func: `
      let newUrl = ActivePolyModLoader.applyChunkMixin(t);
      if(newUrl) {
        console.log("chunk mixin:", newUrl);
        return i.l(newUrl, n, r, a);
      };
      `
    });
    this.registerGlobalMixin({
        type: MixinType.REPLACEBETWEEN,
        tokenStart: `"simulation_worker.bundle.js"`,
        tokenEnd: `"simulation_worker.bundle.js"`,
        func: `ActivePolyModLoader.getSimURL()`
    });
    this.registerPhysicsLibMixin({
        type: MixinType.REPLACEBETWEEN,
        tokenStart: `"polytrack_physics.wasm"`,
        tokenEnd: `"polytrack_physics.wasm"`,
        func: `"${this.getPhysicsWasmURL()}"`
    });
};
// @ts-ignore
const ActivePolyModLoader = new PolyModLoaderImpl("0.6.3", window.pmlversion);
// @ts-ignore
window.polytrackModConfiguration = {
    modName: "PolyModLoader",
    author: "The PolyModLoader Team"
};
export { ActivePolyModLoader };
