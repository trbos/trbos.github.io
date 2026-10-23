import {
  PolyMod,
  SettingType,
} from "../../../../PolyTypes.js";
import JSZip from "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm";

class PolyProcessing extends PolyMod {
  preInit = () => {
    const runtimeUrl = `${this.modBaseUrl}/${this.modVersion}/postfx_probe.js`;

    if (!document.querySelector(`script[data-polyprocessing="runtime"]`)) {
      const s = document.createElement("script");
      s.type = "module";
      s.dataset.polyprocessing = "runtime";
      s.textContent = `import "${runtimeUrl}";`;
      (document.head || document.documentElement).appendChild(s);
    }
  };

  init = (pml) => {
    this.pml = pml;

    const ID = (this.ID = {
      enabled: "PolyProcessing_Enabled",

      exposure: "PolyProcessing_Exposure",
      contrast: "PolyProcessing_Contrast",
      saturation: "PolyProcessing_Saturation",
      gamma: "PolyProcessing_Gamma",
      invert: "PolyProcessing_Invert",

      tintStrength: "PolyProcessing_TintStrength",
      tintPreset: "PolyProcessing_TintPreset",

      useLUT: "PolyProcessing_UseLUT",
      lutStrength: "PolyProcessing_LUTStrength",
      lutAction: "PolyProcessing_LUTAction",

      tonemapper: "PolyProcessing_Tonemapper",

      bloomEnabled: "PolyProcessing_BloomEnabled",
      bloomStrength: "PolyProcessing_BloomStrength",
      bloomThreshold: "PolyProcessing_BloomThreshold",
      bloomRadius: "PolyProcessing_BloomRadius",

      // NEW: preset buttons
      presetAction: "PolyProcessing_PresetAction",

      debugCorner: "PolyProcessing_DebugCorner",
    });

    pml.registerSettingCategory("PolyProcessing");

    pml.registerSetting("Enabled", ID.enabled, SettingType.BOOL, true);

    pml.registerSetting("Exposure", ID.exposure, SettingType.SLIDER, 0.5);
    pml.registerSetting("Contrast", ID.contrast, SettingType.SLIDER, 0.5);
    pml.registerSetting("Saturation", ID.saturation, SettingType.SLIDER, 0.5);
    pml.registerSetting("Gamma", ID.gamma, SettingType.SLIDER, 0.2);

    pml.registerSetting("Invert", ID.invert, SettingType.BOOL, false);

    pml.registerSetting(
      "Tint Strength",
      ID.tintStrength,
      SettingType.SLIDER,
      0.0,
    );

    pml.registerSetting(
      "Tint Preset",
      ID.tintPreset,
      SettingType.CUSTOM,
      "[1,1,1]",
      [
        { title: "None", value: "[1,1,1]" },
        { title: "Warm", value: "[1.1,1.0,0.9]" },
        { title: "Cool", value: "[0.9,1.0,1.1]" },
        { title: "Purple", value: "[0.6,0.0,1.0]" },
        { title: "Green", value: "[0.9,1.1,0.9]" },
      ],
    );

    pml.registerSetting("Use LUT", ID.useLUT, SettingType.BOOL, true);
    pml.registerSetting(
      "LUT Strength",
      ID.lutStrength,
      SettingType.SLIDER,
      1.0,
    );

    pml.registerSetting(
      "LUT Action",
      ID.lutAction,
      SettingType.CUSTOM,
      "none",
      [
        { title: "None", value: "none" },
        { title: "Pick LUT…", value: "pick" },
        { title: "Clear LUT", value: "clear" },
      ],
    );

    pml.registerSetting(
      "Tonemapper",
      ID.tonemapper,
      SettingType.CUSTOM,
      "none",
      [
        { title: "ACES", value: "aces" },
        { title: "Hable (Uncharted 2)", value: "hable" },
        { title: "Reinhard", value: "reinhard" },
        { title: "None", value: "none" },
      ],
    );

    pml.registerSetting(
      "Bloom Enabled",
      ID.bloomEnabled,
      SettingType.BOOL,
      false,
    );
    pml.registerSetting(
      "Bloom Strength",
      ID.bloomStrength,
      SettingType.SLIDER,
      0.7,
    );
    pml.registerSetting(
      "Bloom Threshold",
      ID.bloomThreshold,
      SettingType.SLIDER,
      0.3,
    );
    pml.registerSetting(
      "Bloom Radius",
      ID.bloomRadius,
      SettingType.SLIDER,
      0.65,
    );

    // NEW: Preset import/export "buttons" via CUSTOM
    // This uses the same "action setting" technique as LUT Action.
    pml.registerSetting(
      "Preset Action",
      ID.presetAction,
      SettingType.CUSTOM,
      "none",
      [
        { title: "None", value: "none" },
        { title: "Import preset…", value: "import" },
        { title: "Export preset…", value: "export" },
        { title: "Clear saved preset", value: "clear" },
      ],
    );

    pml.registerSetting(
      "Debug Corner",
      ID.debugCorner,
      SettingType.BOOL,
      false,
    );
  };

  postInit = () => {
    let __ppLastUiHash = "";
    const ID = this.ID;
    globalThis.__ppSettingsVersion = globalThis.__ppSettingsVersion || 0;
    let __ppLastMirroredHash = "";

    const clamp01 = (x) => Math.max(0, Math.min(1, Number(x) || 0));

    function readSettingsMap() {
      try {
        return new Map(
          JSON.parse(
            localStorage.getItem("polytrack_v4_prod_settings") || "[]",
          ),
        );
      } catch {
        return new Map();
      }
    }

    function writeSetting(id, value) {
      const map = readSettingsMap();
      map.set(id, value);
      localStorage.setItem(
        "polytrack_v4_prod_settings",
        JSON.stringify([...map]),
      );
    }

    function safeJsonParse(s, fallback) {
      try {
        return JSON.parse(s);
      } catch {
        return fallback;
      }
    }

    // ============================================================
    // Preset persistence (IndexedDB) - LUT style
    // ============================================================
    const PRESET_DB = "polyprocessing_db";
    const PRESET_STORE = "preset";
    const PRESET_KEY = "active_polypreset_zip";

    // IDB helpers (same pattern as runtime LUT, just different store/key)
    function presetIdbOpen() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(PRESET_DB, 2);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(PRESET_STORE)) {
            db.createObjectStore(PRESET_STORE);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }

    async function presetIdbPut(key, value) {
      const db = await presetIdbOpen();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(PRESET_STORE, "readwrite");
        tx.objectStore(PRESET_STORE).put(value, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    }

    async function presetIdbGet(key) {
      const db = await presetIdbOpen();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(PRESET_STORE, "readonly");
        const req = tx.objectStore(PRESET_STORE).get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      });
    }

    async function presetIdbDel(key) {
      const db = await presetIdbOpen();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(PRESET_STORE, "readwrite");
        tx.objectStore(PRESET_STORE).delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    }

    async function pickPresetFile() {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".polypreset,application/zip";
      input.style.display = "none";
      document.body.appendChild(input);

      const file = await new Promise((resolve) => {
        input.onchange = () => resolve(input.files?.[0] || null);
        input.click();
      });

      document.body.removeChild(input);
      return file;
    }

    async function exportPresetToFile() {
      try {
        const zip = new JSZip();

        const settings = globalThis.__ppSettings || {};
        const preset = {
          format: "polypreset",
          version: 1,
          mod: "PolyProcessing",
          exportedAt: new Date().toISOString(),
          settings,
        };

        zip.file("settings.json", JSON.stringify(preset, null, 2));

        const lutBytes = await globalThis.__ppExportLUTBytes?.();
        if (lutBytes && lutBytes.byteLength > 0) {
          zip.file("lut.png", lutBytes);
        }

        const blob = await zip.generateAsync({ type: "blob" });

        const a = document.createElement("a");
        const url = URL.createObjectURL(blob);
        a.href = url;

        const ts = new Date()
          .toISOString()
          .replaceAll(":", "-")
          .replaceAll(".", "-");

        a.download = `PolyProcessing_${ts}.polypreset`;
        document.body.appendChild(a);
        a.click();
        a.remove();

        setTimeout(() => URL.revokeObjectURL(url), 1000);

        console.log("[PolyProcessing] Preset exported");
        return true;
      } catch (e) {
        console.warn("[PolyProcessing] Preset export failed:", e);
        return false;
      }
    }

    async function applyPresetZipBytes(bytes) {
      try {
        const zip = await JSZip.loadAsync(bytes);

        const settingsTxt = await zip.file("settings.json")?.async("string");
        if (!settingsTxt) throw new Error("missing settings.json");

        const parsed = safeJsonParse(settingsTxt, null);
        const payload = parsed?.settings;
        if (!payload || typeof payload !== "object")
          throw new Error("bad settings");

        // 1) write into runtime storage (this is what survives reload)
        try {
          localStorage.setItem(
            "polyprocessing_settings",
            JSON.stringify(payload),
          );
        } catch {}

        // 2) also update runtime immediately
        globalThis.__ppSettings = payload;

        // 3) LUT import if included
        const lutFile = zip.file("lut.png");
        if (lutFile) {
          const lutBytes = await lutFile.async("uint8array");
          await globalThis.__ppImportLUTBytes?.(lutBytes);
        }

        console.log("[PolyProcessing] Preset applied from bytes");
        return true;
      } catch (e) {
        console.warn("[PolyProcessing] Failed applying preset bytes:", e);
        return false;
      }
    }

    async function importPresetFromFileAndSave() {
      const file = await pickPresetFile();
      if (!file) return false; // user canceled

      const bytes = new Uint8Array(await file.arrayBuffer());

      // Save preset bytes to IDB (this is the actual "current preset")
      await presetIdbPut(PRESET_KEY, bytes);

      // Apply it right away
      const ok = await applyPresetZipBytes(bytes);
      console.log("[PolyProcessing] Preset imported:", file.name, "ok=", ok);
      return ok;
    }

    async function clearSavedPreset() {
      await presetIdbDel(PRESET_KEY);

      // Clear LUT too (preset may have brought one)
      await globalThis.__ppClearLUT?.();

      // Remove the runtime fallback settings (so it doesn't reload them)
      try {
        localStorage.removeItem("polyprocessing_settings");
      } catch {}

      // Force runtime to re-read values from UI (nextSettings loop will overwrite anyway)
      globalThis.__ppSettingsVersion =
        (globalThis.__ppSettingsVersion || 0) + 1;

      console.log("[PolyProcessing] Saved preset cleared (and runtime reset)");
      return true;
    }

    // Auto-apply saved preset on reload
    (async () => {
      try {
        const bytes = await presetIdbGet(PRESET_KEY);
        if (bytes) {
          await applyPresetZipBytes(bytes);
          console.log("[PolyProcessing] Auto-applied saved preset from IDB");
        }
      } catch (e) {
        console.warn("[PolyProcessing] Failed auto-apply preset:", e);
      }
    })();

    let lastLutAction = "none";
    let lastPresetAction = "none";

    setInterval(async () => {
      const map = readSettingsMap();

      const get = (id, d) => (map.has(id) ? map.get(id) : d);
      const getBool = (id, d) => String(get(id, d)) === "true";
      const getSlider = (id, d) => clamp01(get(id, d));
      const getStr = (id, d) => String(get(id, d));

      // LUT buttons
      {
        const action = String(get(ID.lutAction, "none"));
        if (action !== lastLutAction) {
          lastLutAction = action;
          if (action === "pick") globalThis.__ppPickLUT?.();
          if (action === "clear") globalThis.__ppClearLUT?.();
          writeSetting(ID.lutAction, "none");
          lastLutAction = "none";
        }
      }

      // Preset action (LUT-style)
      {
        const action = String(get(ID.presetAction, "none"));
        if (action !== lastPresetAction) {
          lastPresetAction = action;

          if (action === "import") {
            await importPresetFromFileAndSave();
          } else if (action === "export") {
            await exportPresetToFile();
          } else if (action === "clear") {
            await clearSavedPreset();
          }

          // Always reset action so it never re-triggers
          writeSetting(ID.presetAction, "none");
          lastPresetAction = "none";
        }
      }

      const nextSettings = {
        fxEnabled: getBool(ID.enabled, true),

        exposure: 0.5 + getSlider(ID.exposure, 0.5) * 1.0,
        contrast: 0.5 + getSlider(ID.contrast, 0.5) * 1.3,
        saturation: getSlider(ID.saturation, 0.5) * 2.0,
        gamma: 0.5 + getSlider(ID.gamma, 0.5) * 2.0,

        invert: getBool(ID.invert, false),

        tintStrength: getSlider(ID.tintStrength, 0.0),
        tint: safeJsonParse(String(get(ID.tintPreset, "[1,1,1]")), [1, 1, 1]),

        useLUT: getBool(ID.useLUT, true),
        lutStrength: getSlider(ID.lutStrength, 1.0),

        tonemapper: getStr(ID.tonemapper, "aces"),

        bloomEnabled: getBool(ID.bloomEnabled, true),
        bloomStrength: getSlider(ID.bloomStrength, 0.35),
        bloomThreshold: 0.6 + getSlider(ID.bloomThreshold, 0.5) * 1.0,
        bloomRadius: 0.5 + getSlider(ID.bloomRadius, 0.35) * 2.5,

        debugCorner: getBool(ID.debugCorner, false),
      };

      const uiHash = JSON.stringify(nextSettings);
      if (uiHash !== __ppLastUiHash) {
        __ppLastUiHash = uiHash;

        globalThis.__ppSettings = nextSettings;
        globalThis.__ppSettingsVersion =
          (globalThis.__ppSettingsVersion || 0) + 1;

        try {
          localStorage.setItem(
            "polyprocessing_settings",
            JSON.stringify(nextSettings),
          );
        } catch {}
      }
    }, 200);

    console.log("[PolyProcessing] Preset import/export installed");
  };
}

export let polyMod = new PolyProcessing();
