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
    pml.registerSetting("Gamma", ID.gamma, SettingType.SLIDER, 0.5);

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
    pml.registerSetting("Preset", ID.presetAction, SettingType.CUSTOM, "none", [
      { title: "None", value: "none" },
      { title: "Export preset…", value: "export" },
      { title: "Import preset…", value: "import" },
    ]);

    pml.registerSetting(
      "Debug Corner",
      ID.debugCorner,
      SettingType.BOOL,
      false,
    );
  };

  postInit = () => {
    const ID = this.ID;

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

    // ------------------------------------------------------------
    // Preset import/export helpers
    // Format: .polypreset (zip)
    // - settings.json  (sanitized settings object)
    // - lut.png        (optional, only if LUT exists)
    // ------------------------------------------------------------
    async function exportPreset() {
      try {
        const zip = new JSZip();

        // settings are already computed by the sync loop below
        // but we grab the last known __ppSettings
        const settings = globalThis.__ppSettings || {};

        // Basic metadata
        const preset = {
          format: "polypreset",
          version: 1,
          mod: "PolyProcessing",
          exportedAt: new Date().toISOString(),
          settings,
        };

        zip.file("settings.json", JSON.stringify(preset, null, 2));

        // If LUT exists, ask runtime for bytes
        // runtime provides __ppExportLUTBytes() -> Uint8Array|null
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

    async function importPreset() {
      try {
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
        if (!file) return false;

        const buf = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(buf);

        const settingsTxt = await zip.file("settings.json")?.async("string");
        if (!settingsTxt) {
          console.warn(
            "[PolyProcessing] Invalid preset: missing settings.json",
          );
          return false;
        }

        const parsed = safeJsonParse(settingsTxt, null);
        const payload = parsed?.settings;
        if (!payload || typeof payload !== "object") {
          console.warn("[PolyProcessing] Invalid preset: bad settings");
          return false;
        }

        // Apply settings by writing into PolyTrack's settings store
        // so UI updates immediately.
        // NOTE: sliders in the menu are 0..1 values.
        // Our runtime settings are mapped values.
        // So we convert back to UI-space using inverse mapping.

        const inv = {
          exposure: (v) => clamp01((Number(v) - 0.5) / 1.0),
          contrast: (v) => clamp01((Number(v) - 0.5) / 1.3),
          saturation: (v) => clamp01(Number(v) / 2.0),
          gamma: (v) => clamp01((Number(v) - 0.5) / 2.0),
          bloomStrength: (v) => clamp01(Number(v)),
          bloomThreshold: (v) => clamp01((Number(v) - 0.6) / 1.0),
          bloomRadius: (v) => clamp01((Number(v) - 0.5) / 2.5),
        };

        // Helper to stringify booleans as PolyTrack does
        const wBool = (id, b) => writeSetting(id, b ? "true" : "false");
        const wNum = (id, n) => writeSetting(id, String(n));
        const wStr = (id, s) => writeSetting(id, String(s));

        wBool(ID.enabled, !!payload.fxEnabled);

        wNum(ID.exposure, inv.exposure(payload.exposure ?? 1.0));
        wNum(ID.contrast, inv.contrast(payload.contrast ?? 1.0));
        wNum(ID.saturation, inv.saturation(payload.saturation ?? 1.0));
        wNum(ID.gamma, inv.gamma(payload.gamma ?? 1.0));

        wBool(ID.invert, !!payload.invert);

        wNum(ID.tintStrength, clamp01(payload.tintStrength ?? 0.0));

        // Tint preset stores JSON string
        const tint = Array.isArray(payload.tint) ? payload.tint : [1, 1, 1];
        wStr(ID.tintPreset, JSON.stringify(tint));

        wBool(ID.useLUT, !!payload.useLUT);
        wNum(ID.lutStrength, clamp01(payload.lutStrength ?? 1.0));

        wBool(ID.bloomEnabled, !!payload.bloomEnabled);
        wNum(
          ID.bloomStrength,
          inv.bloomStrength(payload.bloomStrength ?? 0.35),
        );
        wNum(
          ID.bloomThreshold,
          inv.bloomThreshold(payload.bloomThreshold ?? 1.0),
        );
        wNum(ID.bloomRadius, inv.bloomRadius(payload.bloomRadius ?? 1.0));

        wBool(ID.debugCorner, !!payload.debugCorner);

        // LUT import (optional)
        const lutFile = zip.file("lut.png");
        if (lutFile) {
          const lutBytes = await lutFile.async("uint8array");
          // runtime provides __ppImportLUTBytes(bytes)
          await globalThis.__ppImportLUTBytes?.(lutBytes);
        }

        console.log("[PolyProcessing] Preset imported:", file.name);
        return true;
      } catch (e) {
        console.warn("[PolyProcessing] Preset import failed:", e);
        return false;
      }
    }

    let lastLutAction = "none";
    let lastPresetAction = "none";

    setInterval(async () => {
      const map = readSettingsMap();

      const get = (id, d) => (map.has(id) ? map.get(id) : d);
      const getBool = (id, d) => String(get(id, d)) === "true";
      const getSlider = (id, d) => clamp01(get(id, d));

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

      // Preset buttons
      {
        const action = String(get(ID.presetAction, "none"));
        if (action !== lastPresetAction) {
          lastPresetAction = action;

          if (action === "export") {
            await exportPreset();
          }
          if (action === "import") {
            await importPreset();
          }

          writeSetting(ID.presetAction, "none");
          lastPresetAction = "none";
        }
      }

      globalThis.__ppSettings = {
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

        bloomEnabled: getBool(ID.bloomEnabled, true),
        bloomStrength: getSlider(ID.bloomStrength, 0.35),
        bloomThreshold: 0.6 + getSlider(ID.bloomThreshold, 0.5) * 1.0,
        bloomRadius: 0.5 + getSlider(ID.bloomRadius, 0.35) * 2.5,

        debugCorner: getBool(ID.debugCorner, false),
      };
    }, 200);

    console.log("[PolyProcessing] Preset import/export installed");
  };
}

export let polyMod = new PolyProcessing();