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
