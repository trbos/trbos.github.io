import { PolyMod, MixinType } from "../../../../PolyTypes.js";

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

    // Category in PML keybind UI
    pml.registerBindCategory("PolyProcessing");

    // Keybind callback (always fires, you decide when to act)
    pml.registerKeybind(
      "Toggle PolyProcessing GUI while holding shift",
      "PolyProcessing_ToggleGUI",
      "keydown",
      "KeyP",
      null,
      (event) => {
        // require shift to be held
        if (!event.shiftKey) return;

        event.preventDefault();
        globalThis.__ppToggleGUI?.();
      },
    );
  };

  postInit = () => {
    // Install GUI + Presets + Settings bridge
    this.installGUI();
    console.log("[PolyProcessing] Custom GUI installed");
  };

  installGUI() {
    if (globalThis.__ppGUIInstalled) return;
    globalThis.__ppGUIInstalled = true;

    const SETTINGS_KEY = "polyprocessing_settings_v2";

    const DEFAULT_SETTINGS = {
      fxEnabled: true,

      exposure: 1.0,
      contrast: 1.0,
      saturation: 1.0,
      gamma: 1.0,

      invert: false,

      tint: [1.0, 1.0, 1.0],
      tintStrength: 0.0,

      debugCorner: false,

      useLUT: false,
      lutStrength: 1.0,

      // LUT color space
      lutSpace: "afterGamma", // "afterGamma" | "beforeGamma" | "srgb"
      lutSampling: "fast", // will be presented as "auto"/"hardware"/"manual" in GUI

      bloomEnabled: false,
      bloomStrength: 0.35,
      bloomThreshold: 1.0,
      bloomRadius: 1.0,

      tonemapper: "none",

      grayscale: false,
      bw: false,
      bwThreshold: 0.5,
    };

    // Shared version counter used by runtime to detect updates
    globalThis.__ppSettingsVersion = globalThis.__ppSettingsVersion || 0;

    function injectCSS() {
      if (document.querySelector("style[data-polyprocessing-gui]")) return;

      const style = document.createElement("style");
      style.dataset.polyprocessingGui = "1";
      style.textContent = `
    .pp-root {
      position: fixed;
      left: 0;
      top: 0;
      z-index: 2147483647;
      width: 100vw;
      height: 100vh;
      display: none;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,0.45);
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    }

    .pp-panel {
      width: min(860px, calc(100vw - 32px));
      max-height: min(92vh, 900px);
      overflow: auto;
      background: rgba(20,20,24,0.98);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 14px;
      box-shadow: 0 20px 80px rgba(0,0,0,0.55);
      padding: 16px;
      color: rgba(255,255,255,0.92);
    }

    .pp-section-title {
      margin-top: 14px;
      margin-bottom: 8px;
      font-size: 13px;
      font-weight: 650;
      opacity: 0.9;
      letter-spacing: 0.2px;
    }

    .pp-row {
      display: grid;
      grid-template-columns: 180px 1fr 88px;
      align-items: center;
      gap: 14px;
      height: 30px;
      margin: 6px 0;
    }

    .pp-label {
      font-size: 13px;
      opacity: 0.88;
    }

    .pp-value {
      font-size: 12px;
      opacity: 0.75;
      text-align: right;
      user-select: none;
    }

    .pp-slider {
      width: 100%;
      height: 18px;
      margin: 0;
    }

    .pp-toggle {
      justify-self: start;
      margin: 0;
      transform: translateY(1px);
    }

    .pp-select {
      width: 100%;
      height: 26px;
      padding: 2px 8px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.14);
      background: rgba(0,0,0,0.25);
      color: rgba(255,255,255,0.92);
      outline: none;
      font-size: 13px;
    }

    .pp-buttonrow {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .pp-btn {
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.14);
      background: rgba(255,255,255,0.06);
      color: rgba(255,255,255,0.92);
      cursor: pointer;
      font-size: 13px;
    }

    .pp-btn:hover {
      background: rgba(255,255,255,0.10);
    }
  `;
      document.head.appendChild(style);
    }

    injectCSS();

    const clamp01 = (x) => Math.max(0, Math.min(1, Number(x) || 0));
    const safeNum = (x, fb) => {
      const n = typeof x === "string" ? Number(x) : +x;
      return Number.isFinite(n) ? n : fb;
    };

    function sanitizeSettings(raw) {
      const s = { ...DEFAULT_SETTINGS, ...(raw || {}) };

      s.fxEnabled = !!s.fxEnabled;
      s.invert = !!s.invert;
      s.debugCorner = !!s.debugCorner;

      s.exposure = safeNum(s.exposure, 1.0);
      s.contrast = safeNum(s.contrast, 1.0);
      s.saturation = safeNum(s.saturation, 1.0);
      s.gamma = safeNum(s.gamma, 1.0);

      if (!Array.isArray(s.tint) || s.tint.length !== 3) s.tint = [1, 1, 1];
      s.tint = [
        safeNum(s.tint[0], 1.0),
        safeNum(s.tint[1], 1.0),
        safeNum(s.tint[2], 1.0),
      ];
      s.tintStrength = clamp01(safeNum(s.tintStrength, 0.0));

      s.useLUT = !!s.useLUT;
      s.lutStrength = clamp01(safeNum(s.lutStrength, 1.0));

      // LUT color space
      s.lutSpace = String(s.lutSpace || "afterGamma");
      if (!["afterGamma", "beforeGamma", "srgb"].includes(s.lutSpace)) {
        s.lutSpace = "afterGamma";
      }

      // LUT sampling: GUI presents "auto"/"hardware"/"manual", runtime uses "fast"/"hq"
      const ls = String(s.lutSampling || "auto");
      if (ls === "auto" || ls === "hardware") {
        s.lutSampling = "fast";
      } else if (ls === "manual") {
        s.lutSampling = "hq";
      } else if (!["fast", "hq"].includes(ls)) {
        s.lutSampling = "fast";
      } else {
        s.lutSampling = ls;
      }

      s.tonemapper = String(s.tonemapper || "aces");

      s.bloomEnabled = !!s.bloomEnabled;
      s.bloomStrength = clamp01(safeNum(s.bloomStrength, 0.35));
      s.bloomThreshold = safeNum(s.bloomThreshold, 1.0);
      s.bloomRadius = safeNum(s.bloomRadius, 1.0);

      s.grayscale = !!s.grayscale;
      s.bw = !!s.bw;
      s.bwThreshold = clamp01(safeNum(s.bwThreshold, 0.5));
      return s;
    }

    function loadSettings() {
      try {
        const txt = localStorage.getItem(SETTINGS_KEY);
        if (!txt) return { ...DEFAULT_SETTINGS };
        const obj = JSON.parse(txt);
        if (!obj || typeof obj !== "object" || Array.isArray(obj))
          return { ...DEFAULT_SETTINGS };
        return sanitizeSettings(obj);
      } catch {
        return { ...DEFAULT_SETTINGS };
      }
    }

    function saveSettings(obj) {
      const s = sanitizeSettings(obj);
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
      } catch {}
      return s;
    }

    function applySettingsPermanently(obj) {
      const s = saveSettings(obj);
      globalThis.__ppSettings = s;
      globalThis.__ppSettingsVersion =
        (globalThis.__ppSettingsVersion || 0) + 1;

      // Mirror into runtime legacy globals
      globalThis.__ppMirrorSettingsToLegacyGlobals?.(s);

      // NEW: also mirror LUT sampling to a legacy global (runtime can read this)
      globalThis.__ppFxLUTSamplingMode = s.lutSampling;

      // Force one draw on next RAF if runtime exposed it
      globalThis.__ppRequestOneFrame?.();

      return s;
    }

    // Expose API for runtime/mod dev console
    globalThis.__ppGetSavedSettings = () => loadSettings();
    globalThis.__ppSetSavedSettings = (s) => applySettingsPermanently(s);
    globalThis.__ppResetSavedSettings = () =>
      applySettingsPermanently(DEFAULT_SETTINGS);

    // ------------------------------------------------------------
    // ============================================================
    // Binary Preset Format Functions
    // ============================================================
    // Format: Header + Name + Author + Settings + LUT (optional)
    
    function encodeString(str) {
      const encoder = new TextEncoder();
      const bytes = encoder.encode(str);
      return { length: bytes.length, bytes };
    }

    function decodeString(view, offset) {
      const length = view.getUint16(offset, true);
      offset += 2;
      const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, length);
      const str = new TextDecoder().decode(bytes);
      return { str, newOffset: offset + length };
    }

    async function exportPresetBinary() {
      const settings = loadSettings();
      const presetName = prompt("Preset Name:", "My Preset");
      if (presetName === null) return;
      
      const author = prompt("Author:", "");
      if (author === null) return;

      const settingsJson = JSON.stringify(settings);
      const lutData = await globalThis.__ppExportLUTBytes?.();

      // Build binary buffer
      const buffers = [];

      // Header: "PPST" + version (2 bytes) + reserved (10 bytes) = 16 bytes
      const header = new ArrayBuffer(16);
      const headerView = new Uint8Array(header);
      headerView[0] = 80; // P
      headerView[1] = 80; // P
      headerView[2] = 83; // S
      headerView[3] = 84; // T
      const headerDV = new DataView(header);
      headerDV.setUint16(4, 1, true); // version 1
      buffers.push(header);

      // Preset Name (length as uint16 + string bytes)
      const nameEncoded = encodeString(presetName);
      const nameLengthBuf = new ArrayBuffer(2);
      new DataView(nameLengthBuf).setUint16(0, nameEncoded.length, true);
      buffers.push(nameLengthBuf);
      buffers.push(nameEncoded.bytes);

      // Author (length as uint16 + string bytes)
      const authorEncoded = encodeString(author);
      const authorLengthBuf = new ArrayBuffer(2);
      new DataView(authorLengthBuf).setUint16(0, authorEncoded.length, true);
      buffers.push(authorLengthBuf);
      buffers.push(authorEncoded.bytes);

      // Settings JSON (length as uint32 + bytes)
      const settingsBytes = new TextEncoder().encode(settingsJson);
      const settingsLengthBuf = new ArrayBuffer(4);
      new DataView(settingsLengthBuf).setUint32(0, settingsBytes.length, true);
      buffers.push(settingsLengthBuf);
      buffers.push(settingsBytes);

      // LUT section
      if (lutData && lutData.bytes && lutData.bytes.byteLength > 0) {
        const hasLutBuf = new ArrayBuffer(1);
        new Uint8Array(hasLutBuf)[0] = 1;
        buffers.push(hasLutBuf);

        const lutType = lutData.type === "bin" ? 1 : (lutData.type === "png" ? 0 : 2);
        const lutTypeBuf = new ArrayBuffer(1);
        new Uint8Array(lutTypeBuf)[0] = lutType;
        buffers.push(lutTypeBuf);

        const lutLengthBuf = new ArrayBuffer(4);
        new DataView(lutLengthBuf).setUint32(0, lutData.bytes.byteLength, true);
        buffers.push(lutLengthBuf);
        buffers.push(lutData.bytes);
      } else {
        const noLutBuf = new ArrayBuffer(1);
        new Uint8Array(noLutBuf)[0] = 0;
        buffers.push(noLutBuf);
      }

      // Combine all buffers
      const totalLength = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const buf of buffers) {
        combined.set(new Uint8Array(buf), offset);
        offset += buf.byteLength;
      }

      const blob = new Blob([combined], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      const ts = new Date()
        .toISOString()
        .replaceAll(":", "-")
        .replaceAll(".", "-");
      a.download = `${presetName.replace(/\s+/g, "_")}_${ts}.polypreset`;

      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => URL.revokeObjectURL(url), 1000);
      console.log("[PolyProcessing] Binary preset exported:", presetName, "by", author);
    }

    async function importPresetBinary() {
      const file = await pickFile(".polypreset");
      if (!file) return;

      const buf = await file.arrayBuffer();
      const view = new DataView(buf);
      let offset = 0;

      // Check header
      const magic =
        String.fromCharCode(view.getUint8(0)) +
        String.fromCharCode(view.getUint8(1)) +
        String.fromCharCode(view.getUint8(2)) +
        String.fromCharCode(view.getUint8(3));

      if (magic !== "PPST") {
        throw new Error("Invalid preset file: bad magic number");
      }

      const version = view.getUint16(4, true);
      if (version !== 1) {
        throw new Error("Invalid preset version: " + version);
      }
      offset = 16;

      // Read preset name
      const nameResult = decodeString(view, offset);
      const presetName = nameResult.str;
      offset = nameResult.newOffset;

      // Read author
      const authorResult = decodeString(view, offset);
      const author = authorResult.str;
      offset = authorResult.newOffset;

      // Read settings JSON
      const settingsLength = view.getUint32(offset, true);
      offset += 4;
      const settingsBytes = new Uint8Array(buf, offset, settingsLength);
      const settingsJson = new TextDecoder().decode(settingsBytes);
      const settings = JSON.parse(settingsJson);
      offset += settingsLength;

      // Apply settings
      const applied = applySettingsPermanently(settings);

      // Store preset metadata
      globalThis.__ppCurrentPresetName = presetName;
      globalThis.__ppCurrentPresetAuthor = author;

      // Read LUT section
      if (offset < buf.byteLength) {
        const hasLut = view.getUint8(offset);
        offset += 1;

        if (hasLut) {
          const lutType = view.getUint8(offset);
          offset += 1;
          const lutLength = view.getUint32(offset, true);
          offset += 4;

          const lutBytes = new Uint8Array(buf, offset, lutLength);
          const lutTypeStr = lutType === 0 ? "png" : lutType === 1 ? "bin" : "cube";
          await globalThis.__ppImportLUTBytes?.(lutBytes, lutTypeStr);
        }
      }

      console.log(
        "[PolyProcessing] Imported preset:",
        presetName,
        "by",
        author
      );
      
      // Store the preset info for display
      globalThis.__ppCurrentPresetName = presetName;
      globalThis.__ppCurrentPresetAuthor = author;
      
      refreshUIFromSettings();
    }

    async function exportPreset() {
      try {
        await exportPresetBinary();
      } catch (e) {
        console.warn("[PolyProcessing] Export failed:", e);
        alert(`Preset export failed:\n${String(e?.message || e)}`);
      }
    }

    async function pickFile(accept) {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = accept;
      input.style.display = "none";
      document.body.appendChild(input);

      const file = await new Promise((resolve) => {
        input.onchange = () => resolve(input.files?.[0] || null);
        input.click();
      });

      document.body.removeChild(input);
      return file;
    }

    async function importPreset() {
      try {
        await importPresetBinary();
      } catch (e) {
        console.warn("[PolyProcessing] Import failed:", e);
        alert(`Preset import failed:\n${String(e?.message || e)}`);
      }
    }

    async function clearPresetAndReset() {
      applySettingsPermanently(DEFAULT_SETTINGS);
      await globalThis.__ppClearLUT?.();
      globalThis.__ppCurrentPresetName = null;
      globalThis.__ppCurrentPresetAuthor = null;
      refreshUIFromSettings();
      console.log("[PolyProcessing] Cleared preset (reset to defaults)");
    }

    // ------------------------------------------------------------
    // Build GUI
    // ------------------------------------------------------------
    const root = document.createElement("div");
    root.id = "polyprocessing_gui_root";
    root.className = "pp-root";

    const panel = document.createElement("div");
    panel.className = "pp-panel";

    root.appendChild(panel);
    document.body.appendChild(root);

    function hRow(title, subtitle) {
      const wrap = document.createElement("div");
      wrap.style.cssText = `
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      `;

      const left = document.createElement("div");
      left.innerHTML = `
        <div style="font-size: 18px; font-weight: 650;">${title}</div>
        <div style="opacity: 0.75; font-size: 13px; margin-top: 2px;">${subtitle || ""}</div>
      `;

      const right = document.createElement("div");
      right.style.cssText = "display:flex; gap:8px; align-items:center;";

      wrap.appendChild(left);
      wrap.appendChild(right);
      return { wrap, right };
    }

    function btn(label, onClick) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.className = "pp-btn";
      b.onmouseenter = () => (b.style.background = "rgba(255,255,255,0.10)");
      b.onmouseleave = () => (b.style.background = "rgba(255,255,255,0.06)");
      b.onclick = onClick;
      return b;
    }

    function sectionTitle(text) {
      const d = document.createElement("div");
      d.textContent = text;
      d.style.cssText = `
        margin-top: 14px;
        margin-bottom: 8px;
        font-size: 13px;
        font-weight: 650;
        opacity: 0.9;
        letter-spacing: 0.2px;
      `;
      return d;
    }

    function row() {
      const d = document.createElement("div");
      d.className = "pp-row";
      return d;
    }

    function labelCell(text) {
      const d = document.createElement("div");
      d.className = "pp-label";
      d.textContent = text;
      return d;
    }

    function valueCell() {
      const d = document.createElement("div");
      d.className = "pp-value";
      return d;
    }

    function mkCheckbox(get, set) {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.className = "pp-toggle";
      input.checked = !!get();

      input.onchange = () => {
        set(!!input.checked);
        flush();
      };
      return input;
    }

    function mkSelect(options, get, set) {
      const sel = document.createElement("select");
      sel.className = "pp-select";

      for (const { title, value } of options) {
        const o = document.createElement("option");
        o.value = value;
        o.textContent = title;
        sel.appendChild(o);
      }

      sel.value = String(get());
      sel.onchange = () => {
        set(sel.value);
        flush();
      };
      return sel;
    }

    function mkSlider(min, max, step, get, set) {
      const input = document.createElement("input");
      input.type = "range";
      input.className = "pp-slider";
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(get());
      input.style.width = "100%";
      input.oninput = () => {
        set(Number(input.value));
        flush(false);
        refreshValueReadout();
      };
      input.onchange = () => {
        flush(true);
      };
      return input;
    }

    // live-edit buffer
    let current = loadSettings();
    let saveTimer = null;

    function flush(save = true) {
      // Apply in runtime immediately
      globalThis.__ppSettings = sanitizeSettings(current);
      globalThis.__ppSettingsVersion =
        (globalThis.__ppSettingsVersion || 0) + 1;

      globalThis.__ppMirrorSettingsToLegacyGlobals?.(globalThis.__ppSettings);

      // NEW: mirror LUT sampling mode too
      globalThis.__ppFxLUTSamplingMode = globalThis.__ppSettings.lutSampling;

      globalThis.__ppRequestOneFrame?.();

      if (!save) return;

      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        applySettingsPermanently(current);
      }, 120);
    }

    function refreshValueReadout() {
      for (const fn of valueRefreshFns) fn();
    }

    function refreshUIFromSettings() {
      current = loadSettings();
      for (const fn of uiRefreshFns) fn();
      flush(false);
      refreshValueReadout();
    }

    const uiRefreshFns = [];
    const valueRefreshFns = [];

    // Header
    {
      const { wrap, right } = hRow(
        "PolyProcessing",
        "Shift+P to open/close • Presets permanently apply",
      );

      right.appendChild(
        btn("Import Preset", async () => {
          try {
            await importPreset();
          } catch (e) {
            console.warn("[PolyProcessing] Import failed:", e);
            alert(`Preset import failed:\n${String(e?.message || e)}`);
          }
        }),
      );

      right.appendChild(
        btn("Export Preset", async () => {
          try {
            await exportPreset();
          } catch (e) {
            console.warn("[PolyProcessing] Export failed:", e);
            alert(`Preset export failed:\n${String(e?.message || e)}`);
          }
        }),
      );

      right.appendChild(
        btn("Reset Defaults", async () => {
          await clearPresetAndReset();
        }),
      );

      right.appendChild(
        btn("Close", () => {
          root.style.display = "none";
        }),
      );

      panel.appendChild(wrap);
    }

    panel.appendChild(document.createElement("hr")).style.cssText =
      "border:0;border-top:1px solid rgba(255,255,255,0.10);margin:10px 0;";

    // Section: General
    panel.appendChild(sectionTitle("General"));

    // Enabled
    {
      const r = row();
      r.appendChild(labelCell("Enabled"));
      const c = mkCheckbox(
        () => current.fxEnabled,
        (v) => (current.fxEnabled = v),
      );
      r.appendChild(c);
      const v = valueCell();
      v.textContent = "";
      r.appendChild(v);
      uiRefreshFns.push(() => (c.checked = !!current.fxEnabled));
      panel.appendChild(r);
    }

    // Tonemapper
    {
      const r = row();
      r.appendChild(labelCell("Tonemapper"));
      const sel = mkSelect(
        [
          { title: "ACES", value: "aces" },
          { title: "Hable (Uncharted 2)", value: "hable" },
          { title: "Reinhard", value: "reinhard" },
          { title: "None", value: "none" },
        ],
        () => current.tonemapper,
        (v) => (current.tonemapper = v),
      );
      r.appendChild(sel);
      const v = valueCell();
      v.textContent = String(current.tonemapper);
      r.appendChild(v);

      uiRefreshFns.push(() => (sel.value = String(current.tonemapper)));
      valueRefreshFns.push(() => (v.textContent = String(current.tonemapper)));

      panel.appendChild(r);
    }

    // Exposure/Contrast/Saturation/Gamma
    function addFloatSlider(name, min, max, step, get, set) {
      const r = row();
      r.appendChild(labelCell(name));
      const slider = mkSlider(min, max, step, get, set);
      r.appendChild(slider);
      const v = valueCell();
      r.appendChild(v);

      const refresh = () => {
        slider.value = String(get());
        v.textContent = String(get().toFixed(3));
      };
      uiRefreshFns.push(refresh);
      valueRefreshFns.push(() => (v.textContent = String(get().toFixed(3))));
      refresh();

      panel.appendChild(r);
    }

    addFloatSlider(
      "Exposure",
      0.0,
      3.0,
      0.01,
      () => current.exposure,
      (x) => (current.exposure = x),
    );

    addFloatSlider(
      "Contrast",
      0.0,
      3.0,
      0.01,
      () => current.contrast,
      (x) => (current.contrast = x),
    );

    addFloatSlider(
      "Saturation",
      0.0,
      3.0,
      0.01,
      () => current.saturation,
      (x) => (current.saturation = x),
    );

    addFloatSlider(
      "Gamma",
      0.1,
      4.0,
      0.01,
      () => current.gamma,
      (x) => (current.gamma = x),
    );

    // Invert
    {
      const r = row();
      r.appendChild(labelCell("Invert"));
      const c = mkCheckbox(
        () => current.invert,
        (v) => (current.invert = v),
      );
      r.appendChild(c);
      const v = valueCell();
      v.textContent = current.invert ? "On" : "Off";
      r.appendChild(v);

      uiRefreshFns.push(() => (c.checked = !!current.invert));
      valueRefreshFns.push(
        () => (v.textContent = current.invert ? "On" : "Off"),
      );
      panel.appendChild(r);
    }

    // Section: Tint
    panel.appendChild(sectionTitle("Tint"));

    addFloatSlider(
      "Tint Strength",
      0.0,
      1.0,
      0.01,
      () => current.tintStrength,
      (x) => (current.tintStrength = x),
    );

    // Tint preset select
    {
      const presets = [
        { title: "None", value: "[1,1,1]" },
        { title: "Warm", value: "[1.1,1.0,0.9]" },
        { title: "Cool", value: "[0.9,1.0,1.1]" },
        { title: "Purple", value: "[0.6,0.0,1.0]" },
        { title: "Green", value: "[0.9,1.1,0.9]" },
      ];

      const r = row();
      r.appendChild(labelCell("Tint Preset"));

      const sel = mkSelect(
        presets,
        () => JSON.stringify(current.tint),
        (val) => {
          try {
            const arr = JSON.parse(val);
            if (Array.isArray(arr) && arr.length === 3) current.tint = arr;
          } catch {}
        },
      );

      r.appendChild(sel);

      const v = valueCell();
      v.textContent = JSON.stringify(current.tint);
      r.appendChild(v);

      uiRefreshFns.push(() => (sel.value = JSON.stringify(current.tint)));
      valueRefreshFns.push(
        () => (v.textContent = JSON.stringify(current.tint)),
      );

      panel.appendChild(r);
    }

    // Section: LUT
    panel.appendChild(sectionTitle("LUT"));

    {
      const r = row();
      r.appendChild(labelCell("Use LUT"));
      const c = mkCheckbox(
        () => current.useLUT,
        (v) => (current.useLUT = v),
      );
      r.appendChild(c);
      const v = valueCell();
      v.textContent = current.useLUT ? "On" : "Off";
      r.appendChild(v);

      uiRefreshFns.push(() => (c.checked = !!current.useLUT));
      valueRefreshFns.push(
        () => (v.textContent = current.useLUT ? "On" : "Off"),
      );
      panel.appendChild(r);
    }

    addFloatSlider(
      "LUT Strength",
      0.0,
      1.0,
      0.01,
      () => current.lutStrength,
      (x) => (current.lutStrength = x),
    );

    // NEW: LUT Sampling dropdown
    {
      const r = row();
      r.appendChild(labelCell("LUT Sampling"));

      const sel = mkSelect(
        [
          { title: "Auto (recommended)", value: "auto" },
          { title: "Hardware Linear", value: "hardware" },
          { title: "Manual Trilinear", value: "manual" },
        ],
        () => current.lutSampling,
        (v) => (current.lutSampling = v),
      );

      r.appendChild(sel);

      const v = valueCell();
      v.textContent = String(current.lutSampling);
      r.appendChild(v);

      uiRefreshFns.push(() => (sel.value = String(current.lutSampling)));
      valueRefreshFns.push(() => (v.textContent = String(current.lutSampling)));

      panel.appendChild(r);
    }

    // NEW: LUT Color Space dropdown
    {
      const r = row();
      r.appendChild(labelCell("LUT Color Space"));

      const sel = mkSelect(
        [
          { title: "After Gamma (linear)", value: "afterGamma" },
          { title: "Before Gamma (sRGB)", value: "beforeGamma" },
          { title: "sRGB (Photoshop)", value: "srgb" },
        ],
        () => current.lutSpace,
        (v) => (current.lutSpace = v),
      );

      r.appendChild(sel);

      const v = valueCell();
      v.textContent = String(current.lutSpace);
      r.appendChild(v);

      uiRefreshFns.push(() => (sel.value = String(current.lutSpace)));
      valueRefreshFns.push(() => (v.textContent = String(current.lutSpace)));

      panel.appendChild(r);
    }

    {
      const r = row();
      r.appendChild(labelCell("LUT File"));
      const wrap = document.createElement("div");
      wrap.style.cssText = "display:flex; gap:8px; align-items:center;";

      wrap.appendChild(
        btn("Pick LUT", async () => {
          await globalThis.__ppPickLUT?.();
          globalThis.__ppRequestOneFrame?.();
        }),
      );

      wrap.appendChild(
        btn("Clear LUT", async () => {
          await globalThis.__ppClearLUT?.();
          globalThis.__ppRequestOneFrame?.();
        }),
      );

      r.appendChild(wrap);

      const v = valueCell();
      v.textContent = "";
      r.appendChild(v);

      panel.appendChild(r);
    }

    // Section: Bloom
    panel.appendChild(sectionTitle("Bloom"));

    {
      const r = row();
      r.appendChild(labelCell("Bloom Enabled"));
      const c = mkCheckbox(
        () => current.bloomEnabled,
        (v) => (current.bloomEnabled = v),
      );
      r.appendChild(c);
      const v = valueCell();
      v.textContent = current.bloomEnabled ? "On" : "Off";
      r.appendChild(v);

      uiRefreshFns.push(() => (c.checked = !!current.bloomEnabled));
      valueRefreshFns.push(
        () => (v.textContent = current.bloomEnabled ? "On" : "Off"),
      );
      panel.appendChild(r);
    }

    addFloatSlider(
      "Bloom Strength",
      0.0,
      1.0,
      0.01,
      () => current.bloomStrength,
      (x) => (current.bloomStrength = x),
    );

    addFloatSlider(
      "Bloom Threshold",
      0.0,
      3.0,
      0.01,
      () => current.bloomThreshold,
      (x) => (current.bloomThreshold = x),
    );

    addFloatSlider(
      "Bloom Radius",
      0.0,
      3.0,
      0.01,
      () => current.bloomRadius,
      (x) => (current.bloomRadius = x),
    );

    panel.appendChild(sectionTitle("B&W / Greyscale"));

    // Greyscale toggle
    {
      const r = row();
      r.appendChild(labelCell("Greyscale"));
      const c = mkCheckbox(
        () => current.grayscale,
        (v) => {
          current.grayscale = v;
          if (v) current.bw = false;
        },
      );
      r.appendChild(c);

      const v = valueCell();
      v.textContent = current.grayscale ? "On" : "Off";
      r.appendChild(v);

      uiRefreshFns.push(() => (c.checked = !!current.grayscale));
      valueRefreshFns.push(
        () => (v.textContent = current.grayscale ? "On" : "Off"),
      );
      panel.appendChild(r);
    }

    // B&W toggle
    {
      const r = row();
      r.appendChild(labelCell("B&W (Threshold)"));
      const c = mkCheckbox(
        () => current.bw,
        (v) => {
          current.bw = v;
          if (v) current.grayscale = false;
        },
      );
      r.appendChild(c);

      const v = valueCell();
      v.textContent = current.bw ? "On" : "Off";
      r.appendChild(v);

      uiRefreshFns.push(() => (c.checked = !!current.bw));
      valueRefreshFns.push(() => (v.textContent = current.bw ? "On" : "Off"));
      panel.appendChild(r);
    }

    // Threshold slider
    addFloatSlider(
      "B&W Threshold",
      0.0,
      1.0,
      0.01,
      () => current.bwThreshold,
      (x) => (current.bwThreshold = x),
    );

    // Section: Shadow & Artifacts
    panel.appendChild(sectionTitle("Active Preset"));

    {
      const r = row();
      r.appendChild(labelCell("Name"));
      const nameVal = valueCell();
      nameVal.textContent = globalThis.__ppCurrentPresetName || "None";
      r.appendChild(nameVal);
      r.appendChild(document.createElement("div")); // spacer
      
      uiRefreshFns.push(() => {
        nameVal.textContent = globalThis.__ppCurrentPresetName || "None";
      });
      panel.appendChild(r);
    }

    {
      const r = row();
      r.appendChild(labelCell("Author"));
      const authorVal = valueCell();
      authorVal.textContent = globalThis.__ppCurrentPresetAuthor || "None";
      r.appendChild(authorVal);
      r.appendChild(document.createElement("div")); // spacer
      
      uiRefreshFns.push(() => {
        authorVal.textContent = globalThis.__ppCurrentPresetAuthor || "None";
      });
      panel.appendChild(r);
    }

    // closing behavior
    root.addEventListener("click", (e) => {
      if (e.target === root) root.style.display = "none";
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && root.style.display !== "none") {
        root.style.display = "none";
      }
    });

    // Public open/close
    globalThis.__ppToggleGUI = () => {
      if (root.style.display === "none") {
        refreshUIFromSettings();
        root.style.display = "flex";
      } else {
        root.style.display = "none";
      }
    };

    // initial apply on load
    applySettingsPermanently(loadSettings());
  }
}

export let polyMod = new PolyProcessing();