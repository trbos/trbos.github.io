import { PolyMod, MixinType } from "../../../../PolyTypes.js";

(() => {
  if (globalThis.__polyprocessingInstalled) return;
  globalThis.__polyprocessingInstalled = true;

  console.log("[PolyProcessing] Runtime installed (clean rewrite)");

  // ============================================================
  // Settings
  // ============================================================
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

    // NEW:
    lutSpace: "afterGamma", // "afterGamma" | "beforeGamma" | "srgb"
    lutSampling: "fast", // "fast" | "hq"

    bloomEnabled: false,
    bloomStrength: 0.35,
    bloomThreshold: 1.0,
    bloomRadius: 1.0,

    tonemapper: "none",

    grayscale: false,
    bw: false,
    bwThreshold: 0.5,
  };

  globalThis.__ppSettingsVersion = globalThis.__ppSettingsVersion || 0;

  function clamp01(x) {
    x = +x;
    if (!Number.isFinite(x)) return 0;
    return Math.max(0, Math.min(1, x));
  }

  function safeNum(x, fallback) {
    const n = typeof x === "string" ? Number(x) : +x;
    return Number.isFinite(n) ? n : fallback;
  }

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

    // NEW:
    s.lutSpace = String(s.lutSpace || "afterGamma");
    if (!["afterGamma", "beforeGamma", "srgb"].includes(s.lutSpace)) {
      s.lutSpace = "afterGamma";
    }

    s.lutSampling = String(s.lutSampling || "fast");
    if (!["fast", "hq"].includes(s.lutSampling)) {
      s.lutSampling = "fast";
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

  function loadFromLocalStorage() {
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

  function getSettings() {
    if (
      globalThis.__ppSettings &&
      typeof globalThis.__ppSettings === "object"
    ) {
      return sanitizeSettings(globalThis.__ppSettings);
    }
    return loadFromLocalStorage();
  }

  // Legacy globals for console tweaking compatibility
  globalThis.__ppMirrorSettingsToLegacyGlobals = function (s) {
    const x = sanitizeSettings(s);

    globalThis.__ppFxEnabled = !!x.fxEnabled;

    globalThis.__ppFxExposure = x.exposure;
    globalThis.__ppFxContrast = x.contrast;
    globalThis.__ppFxSaturation = x.saturation;
    globalThis.__ppFxGamma = x.gamma;

    globalThis.__ppFxInvert = x.invert ? 1.0 : 0.0;

    globalThis.__ppFxTint = x.tint;
    globalThis.__ppFxTintStrength = x.tintStrength;

    globalThis.__ppFxUseLUT = !!x.useLUT;
    globalThis.__ppFxLUTStrength = x.lutStrength;

    // NEW:
    globalThis.__ppFxLUTSpace = String(x.lutSpace || "afterGamma");
    globalThis.__ppFxLUTSampling = String(x.lutSampling || "fast");

    globalThis.__ppFxTonemapper = String(x.tonemapper || "aces");

    globalThis.__ppFxBloomEnabled = !!x.bloomEnabled;
    globalThis.__ppFxBloomStrength = x.bloomStrength;
    globalThis.__ppFxBloomThreshold = x.bloomThreshold;
    globalThis.__ppFxBloomRadius = x.bloomRadius;

    globalThis.__ppFxGrayscale = !!x.grayscale;
    globalThis.__ppFxBW = !!x.bw;
    globalThis.__ppFxBWThreshold = x.bwThreshold;

    globalThis.__ppFxDebugCorner = !!x.debugCorner;

    return x;
  };

  // Apply once
  {
    const s = getSettings();
    globalThis.__ppSettings = s;
    globalThis.__ppMirrorSettingsToLegacyGlobals(s);
  }

  // Allow GUI to request a forced apply/draw
  globalThis.__ppRequestOneFrame = function () {
    const gl = globalThis.__ppGL;
    if (!gl) return false;
    gl.__ppForceDrawOnce = true;
    return true;
  };

  // ============================================================
  // GL capture
  // ============================================================
  globalThis.__ppGL = globalThis.__ppGL || null;
  globalThis.__ppGLSource = globalThis.__ppGLSource || null;

  function isWebGL2(gl) {
    return (
      typeof WebGL2RenderingContext !== "undefined" &&
      gl instanceof WebGL2RenderingContext
    );
  }

  function scoreCanvas(canvas) {
    if (!canvas) return 0;

    let score = 0;

    const w = canvas.width || 0;
    const h = canvas.height || 0;
    const area = w * h;

    score += Math.min(area / 5000, 5000);

    if (canvas.id === "screen") score += 100000;

    try {
      const style = getComputedStyle(canvas);
      if (style.display === "none") score -= 50000;
      if (style.visibility === "hidden") score -= 30000;
    } catch {}

    if (document.contains(canvas)) score += 5000;

    return score;
  }

  function pickBetterGL(newGL, source) {
    const oldGL = globalThis.__ppGL;

    if (!newGL) return false;

    if (newGL.drawingBufferWidth < 500 || newGL.drawingBufferHeight < 300) {
      return false;
    }

    const newCanvas = newGL.canvas || null;
    const oldCanvas = oldGL?.canvas || null;

    const newScore = scoreCanvas(newCanvas);
    const oldScore = scoreCanvas(oldCanvas);

    const shouldSwitch = !oldGL || newScore > oldScore + 2000;

    if (shouldSwitch) {
      globalThis.__ppGL = newGL;
      globalThis.__ppGLSource = source;

      console.log("[PolyProcessing] Active GL switched:", {
        from: oldGL
          ? [oldGL.drawingBufferWidth, oldGL.drawingBufferHeight]
          : null,
        to: [newGL.drawingBufferWidth, newGL.drawingBufferHeight],
        source,
        newScore,
        oldScore,
      });

      newGL.__ppFxReady = false;
      newGL.__ppBloomReady = false;

      setTimeout(() => {
        tryLoadLUTFromIDB();
      }, 0);

      return true;
    }

    return false;
  }

  function hookGL(gl, source) {
    if (!gl) return gl;
    if (gl.__ppGLHooked) {
      pickBetterGL(gl, source);
      return gl;
    }

    gl.__ppGLHooked = true;
    console.log("[PolyProcessing] Captured WebGL context:", source, gl);

    pickBetterGL(gl, source);
    return gl;
  }

  const canvasProto = HTMLCanvasElement.prototype;
  if (!canvasProto.__ppHookedGetContext) {
    canvasProto.__ppHookedGetContext = true;

    const orig = canvasProto.getContext;
    canvasProto.getContext = function (type, ...rest) {
      const ctx = orig.call(this, type, ...rest);
      if (
        ctx &&
        (type === "webgl" || type === "webgl2" || type === "experimental-webgl")
      ) {
        hookGL(ctx, `HTMLCanvasElement.getContext(${type})`);
      }
      return ctx;
    };

    console.log("[PolyProcessing] Hooked HTMLCanvasElement.getContext");
  }

  if (typeof OffscreenCanvas !== "undefined") {
    const offProto = OffscreenCanvas.prototype;
    if (offProto && !offProto.__ppHookedGetContext) {
      offProto.__ppHookedGetContext = true;

      const orig = offProto.getContext;
      offProto.getContext = function (type, ...rest) {
        const ctx = orig.call(this, type, ...rest);
        if (
          ctx &&
          (type === "webgl" ||
            type === "webgl2" ||
            type === "experimental-webgl")
        ) {
          hookGL(ctx, `OffscreenCanvas.getContext(${type})`);
        }
        return ctx;
      };

      console.log("[PolyProcessing] Hooked OffscreenCanvas.getContext");
    }
  }

  // Late scan if needed
  {
    let tries = 0;
    const maxTries = 200;

    const timer = setInterval(() => {
      tries++;

      const canvases = Array.from(document.querySelectorAll("canvas"));

      for (const canvas of canvases) {
        try {
          const gl2 = canvas.getContext("webgl2");
          if (gl2) hookGL(gl2, "late-scan canvas.getContext(webgl2)");
        } catch {}
      }

      if (tries >= maxTries) {
        clearInterval(timer);
      }
    }, 250);
  }

  // ============================================================
  // IndexedDB (LUT)
  // ============================================================
  const PP_DB = "polyprocessing_db";
  const PP_DB_VERSION = 3;

  const LUT_STORE = "lut";
  const LUT_KEY_PNG = "active_lut_png";
  const LUT_KEY_BIN = "active_lut_bin_v1";

  function idbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(PP_DB, PP_DB_VERSION);

      req.onupgradeneeded = () => {
        const db = req.result;

        if (!db.objectStoreNames.contains(LUT_STORE)) {
          db.createObjectStore(LUT_STORE);
        }

        if (!db.objectStoreNames.contains("preset")) {
          db.createObjectStore("preset");
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbPut(key, value) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(LUT_STORE, "readwrite");
      tx.objectStore(LUT_STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function idbGet(key) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(LUT_STORE, "readonly");
      const req = tx.objectStore(LUT_STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbDel(key) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(LUT_STORE, "readwrite");
      tx.objectStore(LUT_STORE).delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  function makeImageFromBytes(bytes, mime = "image/png") {
    return new Promise((resolve, reject) => {
      const blob = new Blob([bytes], { type: mime });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(e);
      };
      img.src = url;
    });
  }

  function uploadLUTTexture(gl, img) {
    if (!gl) return false;
    if (!gl.__ppLutTex) gl.__ppLutTex = gl.createTexture();

    gl.bindTexture(gl.TEXTURE_2D, gl.__ppLutTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

    gl.__ppLutW = img.width | 0;
    gl.__ppLutH = img.height | 0;
    gl.__ppLutReady = true;

    gl.bindTexture(gl.TEXTURE_2D, null);

    console.log("[PolyProcessing] LUT uploaded:", {
      w: gl.__ppLutW,
      h: gl.__ppLutH,
    });
    return true;
  }

  function uploadLUTTextureFromRGBABytes(gl, width, height, bytes) {
    if (!gl) return false;
    if (!gl.__ppLutTex) gl.__ppLutTex = gl.createTexture();

    gl.bindTexture(gl.TEXTURE_2D, gl.__ppLutTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      bytes,
    );

    gl.__ppLutW = width | 0;
    gl.__ppLutH = height | 0;
    gl.__ppLutReady = true;

    gl.bindTexture(gl.TEXTURE_2D, null);
    return true;
  }

  function setActiveLUTMeta(gl, meta) {
    gl.__ppLutMeta = meta || null;
  }

  function guessLUTFromImageSize(w, h) {
    if (w === 256 && h === 16) {
      return { kind: "strip256x16", size: 16, quality: "low" };
    }

    const nPacked = h;
    if (nPacked > 1 && w === nPacked * nPacked) {
      const N = nPacked;
      return {
        kind: "packed2d",
        size: N,
        quality: N >= 33 ? "high" : "medium",
      };
    }

    if (w === h) {
      const root = Math.round(Math.sqrt(w));
      if (root * root === w) {
        const N = root;
        return { kind: "hald", size: N, quality: N >= 16 ? "high" : "medium" };
      }
    }

    return null;
  }

  async function tryLoadLUTFromIDB() {
    try {
      const gl = globalThis.__ppGL;
      if (!gl) return false;

      const bin = await idbGet(LUT_KEY_BIN);
      if (bin && bin instanceof Uint8Array && bin.byteLength >= 16) {
        const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
        const m0 = String.fromCharCode(
          dv.getUint8(0),
          dv.getUint8(1),
          dv.getUint8(2),
          dv.getUint8(3),
        );
        if (m0 === "MLUT") {
          const ver = dv.getUint16(4, true);
          const size = dv.getUint16(6, true);
          const w = dv.getUint16(8, true);
          const h = dv.getUint16(10, true);

          const headerBytes = 16;
          const expected = w * h * 4;
          if (bin.byteLength >= headerBytes + expected && ver === 1) {
            const bytes = new Uint8Array(
              bin.buffer,
              bin.byteOffset + headerBytes,
              expected,
            );
            uploadLUTTextureFromRGBABytes(gl, w, h, bytes);
            setActiveLUTMeta(gl, {
              kind: "packed2d",
              size,
              quality: size >= 33 ? "high" : "medium",
              source: "cube/bin",
            });
            console.log("[PolyProcessing] LUT loaded from IndexedDB (binary)", {
              size,
              w,
              h,
            });
            return true;
          }
        }
      }

      const pngBytes = await idbGet(LUT_KEY_PNG);
      if (!pngBytes) return false;

      const img = await makeImageFromBytes(pngBytes);
      uploadLUTTexture(gl, img);

      const info = guessLUTFromImageSize(img.width, img.height);
      setActiveLUTMeta(
        gl,
        info
          ? { ...info, source: "png" }
          : { kind: "unknown", size: 0, quality: "unknown", source: "png" },
      );

      console.log("[PolyProcessing] LUT loaded from IndexedDB (image)", info);
      return true;
    } catch (e) {
      console.warn("[PolyProcessing] Failed to load LUT from IndexedDB:", e);
      return false;
    }
  }

  // Parse .cube 3D LUT into float array [r,g,b] in [0..1]
  function parseCubeText(text) {
    const lines = text
      .split(/\r?\n/g)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));

    let size = 0;
    const table = [];

    for (const line of lines) {
      const up = line.toUpperCase();
      if (up.startsWith("LUT_3D_SIZE")) {
        const parts = line.split(/\s+/g);
        size = Number(parts[1] || 0) | 0;
        continue;
      }
      if (
        up.startsWith("TITLE") ||
        up.startsWith("DOMAIN_MIN") ||
        up.startsWith("DOMAIN_MAX") ||
        up.startsWith("LUT_1D_SIZE")
      ) {
        continue;
      }

      const m = line.split(/\s+/g);
      if (m.length >= 3) {
        const r = Number(m[0]);
        const g = Number(m[1]);
        const b = Number(m[2]);
        if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
          table.push(r, g, b);
        }
      }
    }

    if (!size || size < 2) {
      throw new Error("Invalid .cube: missing LUT_3D_SIZE");
    }

    const expected = size * size * size * 3;
    if (table.length < expected) {
      throw new Error(
        `Invalid .cube: not enough entries (got ${table.length / 3}, expected ${size ** 3})`,
      );
    }

    return { size, table: table.slice(0, expected) };
  }

  // Convert a 3D LUT table into packed2d RGBA8 bytes
  // Layout: width = N*N, height = N
  // Assumption: index = r + g*N + b*N*N (R fastest)
  function cubeToPacked2D_RGBA8(cube) {
    const N = cube.size | 0;
    const width = N * N;
    const height = N;
    const out = new Uint8Array(width * height * 4);

    function getIndex(r, g, b) {
      return (r + g * N + b * N * N) * 3;
    }

    for (let g = 0; g < N; g++) {
      for (let b = 0; b < N; b++) {
        for (let r = 0; r < N; r++) {
          const src = getIndex(r, g, b);
          const rf = cube.table[src + 0];
          const gf = cube.table[src + 1];
          const bf = cube.table[src + 2];

          const x = r + b * N;
          const y = g;
          const idx = (y * width + x) * 4;

          out[idx + 0] = Math.max(0, Math.min(255, (rf * 255) | 0));
          out[idx + 1] = Math.max(0, Math.min(255, (gf * 255) | 0));
          out[idx + 2] = Math.max(0, Math.min(255, (bf * 255) | 0));
          out[idx + 3] = 255;
        }
      }
    }

    return { width, height, bytes: out, size: N };
  }

  globalThis.__ppPickLUT = async function () {
    const gl = globalThis.__ppGL;
    if (!gl) {
      console.warn("[PolyProcessing] No GL captured yet.");
      return false;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".cube,image/png,image/jpeg,image/webp";
    input.style.display = "none";
    document.body.appendChild(input);

    const file = await new Promise((resolve) => {
      input.onchange = () => resolve(input.files?.[0] || null);
      input.click();
    });

    document.body.removeChild(input);
    if (!file) return false;

    const name = String(file.name || "").toLowerCase();
    const bytes = new Uint8Array(await file.arrayBuffer());

    if (name.endsWith(".cube")) {
      const text = new TextDecoder().decode(bytes);
      const cube = parseCubeText(text);

      const packed = cubeToPacked2D_RGBA8(cube);

      const headerBytes = 16;
      const out = new Uint8Array(headerBytes + packed.bytes.byteLength);
      out[0] = "M".charCodeAt(0);
      out[1] = "L".charCodeAt(0);
      out[2] = "U".charCodeAt(0);
      out[3] = "T".charCodeAt(0);

      const dv = new DataView(out.buffer);
      dv.setUint16(4, 1, true);
      dv.setUint16(6, packed.size, true);
      dv.setUint16(8, packed.width, true);
      dv.setUint16(10, packed.height, true);
      dv.setUint32(12, packed.bytes.byteLength, true);

      out.set(packed.bytes, headerBytes);

      await idbPut(LUT_KEY_BIN, out);
      await idbDel(LUT_KEY_PNG);

      uploadLUTTextureFromRGBABytes(gl, packed.width, packed.height, packed.bytes);
      setActiveLUTMeta(gl, {
        kind: "packed2d",
        size: packed.size,
        quality: packed.size >= 33 ? "high" : "medium",
        source: "cube",
      });

      console.log("[PolyProcessing] LUT loaded (.cube):", {
        size: packed.size,
        w: packed.width,
        h: packed.height,
      });
      return true;
    }

    const mime = file.type || "image/png";
    const img = await makeImageFromBytes(bytes, mime);
    const info = guessLUTFromImageSize(img.width, img.height);

    await idbPut(LUT_KEY_PNG, bytes);
    await idbDel(LUT_KEY_BIN);

    uploadLUTTexture(gl, img);

    setActiveLUTMeta(
      gl,
      info
        ? { ...info, source: "png" }
        : { kind: "unknown", size: 0, quality: "unknown", source: "png" },
    );

    console.log("[PolyProcessing] LUT loaded (image):", {
      w: img.width,
      h: img.height,
      info,
    });
    return true;
  };

  globalThis.__ppClearLUT = async function () {
    await idbDel(LUT_KEY_PNG);
    await idbDel(LUT_KEY_BIN);
    const gl = globalThis.__ppGL;
    if (gl) {
      gl.__ppLutReady = false;
      gl.__ppLutMeta = null;
    }
    return true;
  };

  // Export current LUT for presets (supports bin or png)
  globalThis.__ppExportLUTBytes = async function () {
    const bin = await idbGet(LUT_KEY_BIN);
    if (bin && bin instanceof Uint8Array && bin.byteLength > 0) {
      return { type: "bin", bytes: bin };
    }

    const png = await idbGet(LUT_KEY_PNG);
    if (png && png instanceof Uint8Array && png.byteLength > 0) {
      return { type: "png", bytes: png };
    }

    return null;
  };

  // Import current LUT for presets (supports bin or png)
  globalThis.__ppImportLUTBytes = async function (bytes, kind = "png") {
    try {
      if (!bytes || !(bytes instanceof Uint8Array)) return false;

      if (kind === "bin") {
        await idbPut(LUT_KEY_BIN, bytes);
        await idbDel(LUT_KEY_PNG);
        await tryLoadLUTFromIDB();
        return true;
      }

      await idbPut(LUT_KEY_PNG, bytes);
      await idbDel(LUT_KEY_BIN);

      const gl = globalThis.__ppGL;
      if (gl) {
        const img = await makeImageFromBytes(bytes);
        uploadLUTTexture(gl, img);
      }
      return true;
    } catch (e) {
      console.warn("[PolyProcessing] Failed to import LUT bytes:", e);
      return false;
    }
  };

  // ============================================================
  // FX pipeline
  // ============================================================
  function ensurePostFx(gl) {
    if (gl.__ppFxReady) return true;
    if (!isWebGL2(gl)) return false;

    const vsSrc = `#version 300 es
precision highp float;
out vec2 vUV;
const vec2 pos[3] = vec2[](
  vec2(-1.0, -1.0),
  vec2( 3.0, -1.0),
  vec2(-1.0,  3.0)
);
void main() {
  vec2 p = pos[gl_VertexID];
  gl_Position = vec4(p, 0.0, 1.0);
  vUV = (p * 0.5) + 0.5;
}
`;

    const fsSrc = `#version 300 es
precision highp float;

in vec2 vUV;
uniform sampler2D uTex;

// grading
uniform float uExposure;
uniform float uContrast;
uniform float uSaturation;
uniform float uGamma;
uniform int   uTonemapper;
uniform float uInvert;
uniform vec3  uTint;
uniform float uTintStrength;
uniform int   uDebugCorner;

// LUT
uniform int   uUseLUT;
uniform sampler2D uLUT;
uniform float uLUTStrength;
uniform int   uLUTKind;       // 0=strip256x16, 1=packed2d
uniform float uLUTSize;       // N for packed2d
uniform vec2  uLUTTexSize;    // actual lut tex size

uniform int   uLUTSpace;      // 0=afterGamma, 1=beforeGamma, 2=srgb
uniform int   uLUTSampling;   // 0=fast, 1=hq

// bloom
uniform int   uBloomEnabled;
uniform sampler2D uBloomTex;
uniform float uBloomStrength;

// Grayscale
uniform int   uGrayscale;
uniform int   uBW;
uniform float uBWThreshold;

out vec4 outColor;

vec3 tmReinhard(vec3 x) { return x / (1.0 + x); }

vec3 tmACES(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x*(a*x+b)) / (x*(c*x+d)+e), 0.0, 1.0);
}

vec3 tmHable(vec3 x) {
  const float A = 0.15;
  const float B = 0.50;
  const float C = 0.10;
  const float D = 0.20;
  const float E = 0.02;
  const float F = 0.30;
  vec3 num = x * (A*x + C*B) + D*E;
  vec3 den = x * (A*x + B) + D*F;
  return clamp(num / den - E / F, 0.0, 1.0);
}

vec3 applyTonemap(vec3 c, int mode) {
  if (mode == 1) return tmReinhard(c);
  if (mode == 2) return tmACES(c);
  if (mode == 3) return tmHable(c);
  return c;
}

vec3 applySaturation(vec3 c, float sat) {
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  return mix(vec3(l), c, sat);
}

// Approx helpers for LUT space
vec3 linearToSRGB(vec3 x) {
  x = clamp(x, 0.0, 1.0);
  return pow(x, vec3(1.0 / 2.2));
}

vec3 srgbToLinear(vec3 x) {
  x = clamp(x, 0.0, 1.0);
  return pow(x, vec3(2.2));
}

// 256x16 strip LUT
vec3 sampleLUT_strip256x16(vec3 rgb) {
  rgb = clamp(rgb, 0.0, 1.0);

  float size = 16.0;
  vec3 scaled = rgb * (size - 1.0);

  float r = scaled.r;
  float g = scaled.g;
  float b = scaled.b;

  float b0 = floor(b);
  float b1 = min(b0 + 1.0, size - 1.0);
  float fb = b - b0;

  float x0 = r + b0 * size;
  float x1 = r + b1 * size;

  float u0 = (x0 + 0.5) / 256.0;
  float u1 = (x1 + 0.5) / 256.0;
  float v  = (g  + 0.5) / 16.0;

  vec3 c0 = texture(uLUT, vec2(u0, v)).rgb;
  vec3 c1 = texture(uLUT, vec2(u1, v)).rgb;

  return mix(c0, c1, fb);
}

// Packed 3D LUT in 2D: width=N*N, height=N
// Layout: x = r + b*N, y = g

vec3 lutFetch(float rI, float gI, float bI, float N, vec2 texSize) {
  float x = rI + bI * N;
  float y = gI;
  vec2 uv = (vec2(x, y) + 0.5) / texSize;
  return texture(uLUT, uv).rgb;
}

vec3 sampleLUT_packed2d_hq(vec3 rgb, float N, vec2 texSize) {
  rgb = clamp(rgb, 0.0, 1.0);

  float n = max(2.0, N);
  vec3 p = rgb * (n - 1.0);

  float r0 = floor(p.r);
  float g0 = floor(p.g);
  float b0 = floor(p.b);

  float r1 = min(r0 + 1.0, n - 1.0);
  float g1 = min(g0 + 1.0, n - 1.0);
  float b1 = min(b0 + 1.0, n - 1.0);

  float fr = p.r - r0;
  float fg = p.g - g0;
  float fb = p.b - b0;

  vec3 c000 = lutFetch(r0, g0, b0, n, texSize);
  vec3 c100 = lutFetch(r1, g0, b0, n, texSize);
  vec3 c010 = lutFetch(r0, g1, b0, n, texSize);
  vec3 c110 = lutFetch(r1, g1, b0, n, texSize);

  vec3 c001 = lutFetch(r0, g0, b1, n, texSize);
  vec3 c101 = lutFetch(r1, g0, b1, n, texSize);
  vec3 c011 = lutFetch(r0, g1, b1, n, texSize);
  vec3 c111 = lutFetch(r1, g1, b1, n, texSize);

  vec3 c00 = mix(c000, c100, fr);
  vec3 c10 = mix(c010, c110, fr);
  vec3 c01 = mix(c001, c101, fr);
  vec3 c11 = mix(c011, c111, fr);

  vec3 c0 = mix(c00, c10, fg);
  vec3 c1 = mix(c01, c11, fg);

  return mix(c0, c1, fb);
}

vec3 sampleLUT_packed2d_fast(vec3 rgb, float N, vec2 texSize) {
  rgb = clamp(rgb, 0.0, 1.0);

  float n = max(2.0, N);
  vec3 scaled = rgb * (n - 1.0);

  float r = scaled.r;
  float g = scaled.g;
  float b = scaled.b;

  float b0 = floor(b);
  float b1 = min(b0 + 1.0, n - 1.0);
  float fb = b - b0;

  float x0 = r + b0 * n;
  float x1 = r + b1 * n;

  float u0 = (x0 + 0.5) / texSize.x;
  float u1 = (x1 + 0.5) / texSize.x;
  float v  = (g  + 0.5) / texSize.y;

  vec3 c0 = texture(uLUT, vec2(u0, v)).rgb;
  vec3 c1 = texture(uLUT, vec2(u1, v)).rgb;

  return mix(c0, c1, fb);
}

vec3 sampleLUT_auto(vec3 rgb) {
  if (uLUTKind == 0) return sampleLUT_strip256x16(rgb);
  if (uLUTSampling == 1) return sampleLUT_packed2d_hq(rgb, uLUTSize, uLUTTexSize);
  return sampleLUT_packed2d_fast(rgb, uLUTSize, uLUTTexSize);
}

void main() {
  vec3 c = texture(uTex, vUV).rgb;

  // grading
  c *= uExposure;
  c = (c - 0.5) * uContrast + 0.5;
  c = applySaturation(c, uSaturation);
  c = mix(c, c * uTint, uTintStrength);
  c = mix(c, 1.0 - c, clamp(uInvert, 0.0, 1.0));

  c = applyTonemap(max(c, 0.0), uTonemapper);

  float g = max(0.0001, uGamma);
  c = pow(max(c, 0.0), vec3(1.0 / g));

  if (uUseLUT == 1) {
    vec3 lutIn = c;

    // LUT Space:
    // 0 = afterGamma (use c as-is)
    // 1 = beforeGamma (undo gamma)
    // 2 = sRGB LUT (Photoshop) => convert to approx sRGB before sampling, then back
    if (uLUTSpace == 1) {
      lutIn = pow(clamp(lutIn, 0.0, 1.0), vec3(g));
    } else if (uLUTSpace == 2) {
      lutIn = linearToSRGB(lutIn);
    }

    vec3 lut = sampleLUT_auto(lutIn);

    if (uLUTSpace == 2) {
      lut = srgbToLinear(lut);
    }

    c = mix(c, lut, clamp(uLUTStrength, 0.0, 1.0));
  }

  if (uBloomEnabled == 1) {
    vec3 bloom = texture(uBloomTex, vUV).rgb;
    c += bloom * clamp(uBloomStrength, 0.0, 3.0);
  }

  float luma = dot(c, vec3(0.299, 0.587, 0.114));

  if (uGrayscale == 1) {
    c = vec3(luma);
  }

  if (uBW == 1) {
    float t = step(uBWThreshold, luma);
    c = vec3(t);
  }

  if (uDebugCorner == 1) {
    if (vUV.x < 0.02 && vUV.y > 0.98) c = vec3(1.0, 0.0, 1.0);
  }

  outColor = vec4(c, 1.0);
}
`;

    function compile(type, src) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error("[PolyProcessing] Shader error:", gl.getShaderInfoLog(sh));
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    }

    const vs = compile(gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return false;

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("[PolyProcessing] Link error:", gl.getProgramInfoLog(prog));
      gl.deleteProgram(prog);
      return false;
    }

    const vao = gl.createVertexArray();

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);

    gl.__ppFxProg = prog;
    gl.__ppFxVAO = vao;
    gl.__ppFxTex = tex;
    gl.__ppFxTexW = 0;
    gl.__ppFxTexH = 0;

    gl.__ppFxReady = true;
    console.log("[PolyProcessing] FX pipeline ready");
    return true;
  }

  // ============================================================
  // Bloom pipeline
  // ============================================================
  function ensureBloom(gl) {
    if (gl.__ppBloomReady) return true;
    if (!isWebGL2(gl)) return false;

    const vs = `#version 300 es
precision highp float;
out vec2 vUV;
const vec2 pos[3] = vec2[](
  vec2(-1.0, -1.0),
  vec2( 3.0, -1.0),
  vec2(-1.0,  3.0)
);
void main() {
  vec2 p = pos[gl_VertexID];
  gl_Position = vec4(p, 0.0, 1.0);
  vUV = (p * 0.5) + 0.5;
}
`;

    const fsPrefilter = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform float uThreshold;
out vec4 outColor;

void main() {
  vec3 c = texture(uTex, vUV).rgb;
  float br = max(max(c.r, c.g), c.b);
  float w = smoothstep(uThreshold, uThreshold + 0.2, br);
  outColor = vec4(c * w, 1.0);
}
`;

    const fsBlur = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform vec2 uDir;
uniform float uRadius;
out vec4 outColor;

vec3 sampleAt(vec2 uv) { return texture(uTex, uv).rgb; }

void main() {
  float r = max(0.0, uRadius);
  vec2 stepv = uDir * uTexel * r;

  vec3 c0 = sampleAt(vUV);
  vec3 c1 = sampleAt(vUV + stepv * 1.0);
  vec3 c2 = sampleAt(vUV - stepv * 1.0);
  vec3 c3 = sampleAt(vUV + stepv * 2.0);
  vec3 c4 = sampleAt(vUV - stepv * 2.0);

  vec3 outc =
      c0 * 0.35 +
      (c1 + c2) * 0.25 +
      (c3 + c4) * 0.075;

  outColor = vec4(outc, 1.0);
}
`;

    function compile(type, src) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error("[PolyProcessing] Bloom shader error:", gl.getShaderInfoLog(sh));
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    }

    function link(vsSrc, fsSrc) {
      const v = compile(gl.VERTEX_SHADER, vsSrc);
      const f = compile(gl.FRAGMENT_SHADER, fsSrc);
      if (!v || !f) return null;

      const p = gl.createProgram();
      gl.attachShader(p, v);
      gl.attachShader(p, f);
      gl.linkProgram(p);
      gl.deleteShader(v);
      gl.deleteShader(f);

      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        console.error("[PolyProcessing] Bloom link error:", gl.getProgramInfoLog(p));
        gl.deleteProgram(p);
        return null;
      }
      return p;
    }

    gl.__ppBloomPrefilterProg = link(vs, fsPrefilter);
    gl.__ppBloomBlurProg = link(vs, fsBlur);

    gl.__ppBloomVAO = gl.createVertexArray();

    gl.__ppBloomTexA = gl.createTexture();
    gl.__ppBloomTexB = gl.createTexture();
    gl.__ppBloomFboA = gl.createFramebuffer();
    gl.__ppBloomFboB = gl.createFramebuffer();

    gl.__ppBloomW = 0;
    gl.__ppBloomH = 0;

    gl.__ppBloomReady = !!gl.__ppBloomPrefilterProg && !!gl.__ppBloomBlurProg;

    console.log("[PolyProcessing] Bloom ready:", gl.__ppBloomReady);
    return gl.__ppBloomReady;
  }

  function ensureBloomTargets(gl) {
    const w = (gl.drawingBufferWidth / 2) | 0;
    const h = (gl.drawingBufferHeight / 2) | 0;
    if (w <= 0 || h <= 0) return false;

    if (gl.__ppBloomW === w && gl.__ppBloomH === h) return true;

    gl.__ppBloomW = w;
    gl.__ppBloomH = h;

    function setupTex(tex, fbo) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    }

    setupTex(gl.__ppBloomTexA, gl.__ppBloomFboA);
    setupTex(gl.__ppBloomTexB, gl.__ppBloomFboB);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    console.log("[PolyProcessing] Bloom targets resized:", { w, h });
    return true;
  }

  function renderBloom(gl) {
    if (!ensureBloom(gl)) return false;
    if (!ensureBloomTargets(gl)) return false;

    const threshold = safeNum(globalThis.__ppFxBloomThreshold, 1.0);
    const radius = safeNum(globalThis.__ppFxBloomRadius, 1.0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, gl.__ppBloomFboA);
    gl.viewport(0, 0, gl.__ppBloomW, gl.__ppBloomH);

    gl.useProgram(gl.__ppBloomPrefilterProg);
    gl.bindVertexArray(gl.__ppBloomVAO);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, gl.__ppFxTex);
    gl.uniform1i(gl.getUniformLocation(gl.__ppBloomPrefilterProg, "uTex"), 0);
    gl.uniform1f(gl.getUniformLocation(gl.__ppBloomPrefilterProg, "uThreshold"), threshold);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, gl.__ppBloomFboB);
    gl.useProgram(gl.__ppBloomBlurProg);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, gl.__ppBloomTexA);
    gl.uniform1i(gl.getUniformLocation(gl.__ppBloomBlurProg, "uTex"), 0);

    gl.uniform2f(
      gl.getUniformLocation(gl.__ppBloomBlurProg, "uTexel"),
      1.0 / gl.__ppBloomW,
      1.0 / gl.__ppBloomH,
    );
    gl.uniform2f(gl.getUniformLocation(gl.__ppBloomBlurProg, "uDir"), 1.0, 0.0);
    gl.uniform1f(gl.getUniformLocation(gl.__ppBloomBlurProg, "uRadius"), radius);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, gl.__ppBloomFboA);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, gl.__ppBloomTexB);
    gl.uniform2f(gl.getUniformLocation(gl.__ppBloomBlurProg, "uDir"), 0.0, 1.0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return true;
  }

  function grabScreen(gl) {
    const w = gl.drawingBufferWidth | 0;
    const h = gl.drawingBufferHeight | 0;
    if (w <= 0 || h <= 0) return false;

    gl.bindTexture(gl.TEXTURE_2D, gl.__ppFxTex);

    if (gl.__ppFxTexW !== w || gl.__ppFxTexH !== h) {
      gl.__ppFxTexW = w;
      gl.__ppFxTexH = h;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, w, h);

    gl.bindTexture(gl.TEXTURE_2D, null);
    return true;
  }

  function drawPostFx(gl) {
    const s = getSettings();
    globalThis.__ppMirrorSettingsToLegacyGlobals(s);

    if (!globalThis.__ppFxEnabled) return;
    if (!ensurePostFx(gl)) return;
    if (gl.__ppFxDrawing) return;

    gl.__ppFxDrawing = true;
    try {
      if (!grabScreen(gl)) return;

      if (globalThis.__ppFxBloomEnabled) {
        renderBloom(gl);
      }

      const oldProg = gl.getParameter(gl.CURRENT_PROGRAM);
      const oldVAO = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
      const oldFB = gl.getParameter(gl.FRAMEBUFFER_BINDING);

      const oldBlend = gl.isEnabled(gl.BLEND);
      const oldDepth = gl.isEnabled(gl.DEPTH_TEST);
      const oldCull = gl.isEnabled(gl.CULL_FACE);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      if (oldBlend) gl.disable(gl.BLEND);

      gl.useProgram(gl.__ppFxProg);
      gl.bindVertexArray(gl.__ppFxVAO);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, gl.__ppFxTex);
      gl.uniform1i(gl.getUniformLocation(gl.__ppFxProg, "uTex"), 0);

      const exposure = safeNum(globalThis.__ppFxExposure, s.exposure);
      const contrast = safeNum(globalThis.__ppFxContrast, s.contrast);
      const saturation = safeNum(globalThis.__ppFxSaturation, s.saturation);
      const gamma = safeNum(globalThis.__ppFxGamma, s.gamma);
      const invert = clamp01(safeNum(globalThis.__ppFxInvert, s.invert ? 1.0 : 0.0));

      const tintArr = Array.isArray(globalThis.__ppFxTint) ? globalThis.__ppFxTint : s.tint;
      const tintStrength = clamp01(safeNum(globalThis.__ppFxTintStrength, s.tintStrength));
      const tint = [
        safeNum(tintArr[0], 1.0),
        safeNum(tintArr[1], 1.0),
        safeNum(tintArr[2], 1.0),
      ];

      const grayscale = !!globalThis.__ppFxGrayscale;
      const bw = !!globalThis.__ppFxBW;
      const bwThreshold = clamp01(safeNum(globalThis.__ppFxBWThreshold, s.bwThreshold ?? 0.5));

      gl.uniform1i(gl.getUniformLocation(gl.__ppFxProg, "uGrayscale"), grayscale ? 1 : 0);
      gl.uniform1i(gl.getUniformLocation(gl.__ppFxProg, "uBW"), bw ? 1 : 0);
      gl.uniform1f(gl.getUniformLocation(gl.__ppFxProg, "uBWThreshold"), bwThreshold);

      gl.uniform1f(gl.getUniformLocation(gl.__ppFxProg, "uExposure"), exposure);
      gl.uniform1f(gl.getUniformLocation(gl.__ppFxProg, "uContrast"), contrast);
      gl.uniform1f(gl.getUniformLocation(gl.__ppFxProg, "uSaturation"), saturation);
      gl.uniform1f(gl.getUniformLocation(gl.__ppFxProg, "uGamma"), gamma);
      gl.uniform1f(gl.getUniformLocation(gl.__ppFxProg, "uInvert"), invert);

      gl.uniform3f(gl.getUniformLocation(gl.__ppFxProg, "uTint"), tint[0], tint[1], tint[2]);
      gl.uniform1f(gl.getUniformLocation(gl.__ppFxProg, "uTintStrength"), tintStrength);

      gl.uniform1i(
        gl.getUniformLocation(gl.__ppFxProg, "uDebugCorner"),
        globalThis.__ppFxDebugCorner ? 1 : 0,
      );

      // tonemapper
      const tmStr = String(globalThis.__ppFxTonemapper || s.tonemapper || "aces");
      let tmMode = 2;
      if (tmStr === "none") tmMode = 0;
      else if (tmStr === "reinhard") tmMode = 1;
      else if (tmStr === "aces") tmMode = 2;
      else if (tmStr === "hable") tmMode = 3;
      gl.uniform1i(gl.getUniformLocation(gl.__ppFxProg, "uTonemapper"), tmMode);

      // LUT
      const useLUT = !!globalThis.__ppFxUseLUT;
      const lutStrength = clamp01(safeNum(globalThis.__ppFxLUTStrength, s.lutStrength));
      const canUseLUT =
        useLUT &&
        gl.__ppLutReady &&
        gl.__ppLutTex &&
        gl.__ppLutW > 0 &&
        gl.__ppLutH > 0;

      gl.uniform1i(gl.getUniformLocation(gl.__ppFxProg, "uUseLUT"), canUseLUT ? 1 : 0);

      if (canUseLUT) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, gl.__ppLutTex);
        gl.uniform1i(gl.getUniformLocation(gl.__ppFxProg, "uLUT"), 1);
        gl.uniform1f(gl.getUniformLocation(gl.__ppFxProg, "uLUTStrength"), lutStrength);
      } else {
        gl.uniform1f(gl.getUniformLocation(gl.__ppFxProg, "uLUTStrength"), 0.0);
      }

      // LUT kind auto-detect
      const meta = gl.__ppLutMeta || null;

      let kind = 0;
      let lutSize = 16;

      if (meta && meta.kind === "packed2d") {
        kind = 1;
        lutSize = meta.size | 0;
      } else if (meta && meta.kind === "strip256x16") {
        kind = 0;
        lutSize = 16;
      } else {
        kind = 0;
        lutSize = 16;
      }

      gl.uniform1i(gl.getUniformLocation(gl.__ppFxProg, "uLUTKind"), kind);
      gl.uniform1f(gl.getUniformLocation(gl.__ppFxProg, "uLUTSize"), lutSize);
      gl.uniform2f(
        gl.getUniformLocation(gl.__ppFxProg, "uLUTTexSize"),
        gl.__ppLutW || 256,
        gl.__ppLutH || 16,
      );

      // NEW: LUT Space + Sampling
      const lutSpaceStr = String(globalThis.__ppFxLUTSpace || s.lutSpace || "afterGamma");
      let lutSpace = 0;
      if (lutSpaceStr === "beforeGamma") lutSpace = 1;
      else if (lutSpaceStr === "srgb") lutSpace = 2;
      gl.uniform1i(gl.getUniformLocation(gl.__ppFxProg, "uLUTSpace"), lutSpace);

      const lutSamplingStr = String(globalThis.__ppFxLUTSampling || s.lutSampling || "fast");
      const lutSampling = lutSamplingStr === "hq" ? 1 : 0;
      gl.uniform1i(gl.getUniformLocation(gl.__ppFxProg, "uLUTSampling"), lutSampling);

      // Bloom uniforms
      const bloomEnabled =
        !!globalThis.__ppFxBloomEnabled && !!gl.__ppBloomReady && !!gl.__ppBloomTexA;

      gl.uniform1i(gl.getUniformLocation(gl.__ppFxProg, "uBloomEnabled"), bloomEnabled ? 1 : 0);

      if (bloomEnabled) {
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, gl.__ppBloomTexA);
        gl.uniform1i(gl.getUniformLocation(gl.__ppFxProg, "uBloomTex"), 2);

        gl.uniform1f(
          gl.getUniformLocation(gl.__ppFxProg, "uBloomStrength"),
          clamp01(s.bloomStrength),
        );
      } else {
        gl.uniform1f(gl.getUniformLocation(gl.__ppFxProg, "uBloomStrength"), 0.0);
      }

      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // restore
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);

      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, null);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, null);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, null);

      gl.bindVertexArray(oldVAO);
      gl.useProgram(oldProg);
      gl.bindFramebuffer(gl.FRAMEBUFFER, oldFB);

      if (oldBlend) gl.enable(gl.BLEND);
      if (oldDepth) gl.enable(gl.DEPTH_TEST);
      if (oldCull) gl.enable(gl.CULL_FACE);
    } finally {
      gl.__ppFxDrawing = false;
    }
  }

  // ============================================================
  // RAF Hook (end-of-frame) - RUN FX ONLY ONCE PER RAF TICK
  // ============================================================
  const origRAF = globalThis.requestAnimationFrame.bind(globalThis);
  globalThis.__ppRafTick = globalThis.__ppRafTick || 0;

  globalThis.requestAnimationFrame = function (cb) {
    return origRAF(function (t) {
      globalThis.__ppRafTick++;

      cb(t);

      const gl = globalThis.__ppGL;
      if (!gl) return;

      if (gl.__ppLastAppliedTick === globalThis.__ppRafTick) return;
      gl.__ppLastAppliedTick = globalThis.__ppRafTick;

      drawPostFx(gl);

      if (gl.__ppForceDrawOnce) {
        gl.__ppForceDrawOnce = false;
        drawPostFx(gl);
      }
    });
  };

  console.log("[PolyProcessing] Hooked requestAnimationFrame (guarded)");
})();
// ============================================================
// PolyProcessing PolyMod Class
// ============================================================

class PolyProcessing extends PolyMod {
  preInit = () => {
    // Runtime initialized above by postfx_probe.js
  };

  init = (pml) => {
    this.pml = pml;

    // Xenon Integration
    const glFromXenon = globalThis.__xenonGetGL?.();
    if (glFromXenon) {
      globalThis.__ppGL = glFromXenon;
      console.log('[PolyProcessing] GL from Xenon');
    }

    if (globalThis.__xenonRegisterContextCallback) {
      globalThis.__xenonRegisterContextCallback((newGL) => {
        globalThis.__ppGL = newGL;
      });
    }

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