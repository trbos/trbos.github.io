import { PolyMod } from "../../../../PolyTypes.js";
const SETTINGS_KEY = "polyprocessing_settings_v2";
const DEFAULT_SETTINGS = {
  fxEnabled: true,
  exposure: 1,
  contrast: 1,
  saturation: 1,
  gamma: 1,
  invert: false,
  tint: [1, 1, 1],
  tintStrength: 0,
  debugCorner: false,
  useLUT: false,
  lutStrength: 1,
  lutSpace: "afterGamma",
  lutSampling: "fast",
  bloomEnabled: false,
  bloomStrength: 0.35,
  bloomThreshold: 1,
  bloomRadius: 1,
  tonemapper: "none",
  grayscale: false,
  bw: false,
  bwThreshold: 0.5
};
const VS_FULLSCREEN = `#version 300 es
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
const FS_FX = `#version 300 es
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

// Greyscale / B&W
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

// Packed 3D LUT in 2D: width=N*N, height=N, layout: x = r + b*N, y = g
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
  float r0 = floor(p.r); float g0 = floor(p.g); float b0 = floor(p.b);
  float r1 = min(r0 + 1.0, n - 1.0);
  float g1 = min(g0 + 1.0, n - 1.0);
  float b1 = min(b0 + 1.0, n - 1.0);
  float fr = p.r - r0; float fg = p.g - g0; float fb = p.b - b0;
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
  vec3 c0  = mix(c00,  c10,  fg);
  vec3 c1  = mix(c01,  c11,  fg);
  return mix(c0, c1, fb);
}

vec3 sampleLUT_packed2d_fast(vec3 rgb, float N, vec2 texSize) {
  rgb = clamp(rgb, 0.0, 1.0);
  float n = max(2.0, N);
  vec3 scaled = rgb * (n - 1.0);
  float r = scaled.r; float g = scaled.g; float b = scaled.b;
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
    if (uLUTSpace == 1) {
      lutIn = pow(clamp(lutIn, 0.0, 1.0), vec3(g));
    } else if (uLUTSpace == 2) {
      lutIn = linearToSRGB(lutIn);
    }
    vec3 lut = sampleLUT_auto(lutIn);
    if (uLUTSpace == 2) lut = srgbToLinear(lut);
    c = mix(c, lut, clamp(uLUTStrength, 0.0, 1.0));
  }

  if (uBloomEnabled == 1) {
    vec3 bloom = texture(uBloomTex, vUV).rgb;
    c += bloom * clamp(uBloomStrength, 0.0, 3.0);
  }

  float luma = dot(c, vec3(0.299, 0.587, 0.114));
  if (uGrayscale == 1) c = vec3(luma);
  if (uBW == 1) c = vec3(step(uBWThreshold, luma));

  if (uDebugCorner == 1) {
    if (vUV.x < 0.02 && vUV.y > 0.98) c = vec3(1.0, 0.0, 1.0);
  }

  outColor = vec4(c, 1.0);
}
`;
const FS_BLOOM_PREFILTER = `#version 300 es
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
const FS_BLOOM_BLUR = `#version 300 es
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
  outColor = vec4(c0 * 0.35 + (c1 + c2) * 0.25 + (c3 + c4) * 0.075, 1.0);
}
`;
const FS_DEPTH_VIZ = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUV;
uniform sampler2D uDepth;
uniform float uNear;
uniform float uFar;
out vec4 outColor;
void main() {
  float d   = texture(uDepth, vUV).r;
  float z   = d * 2.0 - 1.0;
  float eye = (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
  float g   = 1.0 - clamp((eye - uNear) / (uFar - uNear), 0.0, 1.0);
  outColor  = vec4(g, g, g, 1.0);
}
`;
function clamp01(x) {
  const n = +x;
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
function safeNum(x, fallback) {
  const n = typeof x === "string" ? Number(x) : +x;
  return Number.isFinite(n) ? n : fallback;
}
function sanitizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS, ...raw ?? {} };
  s.fxEnabled = !!s.fxEnabled;
  s.invert = !!s.invert;
  s.debugCorner = !!s.debugCorner;
  s.exposure = safeNum(s.exposure, 1);
  s.contrast = safeNum(s.contrast, 1);
  s.saturation = safeNum(s.saturation, 1);
  s.gamma = safeNum(s.gamma, 1);
  if (!Array.isArray(s.tint) || s.tint.length !== 3) s.tint = [1, 1, 1];
  s.tint = [safeNum(s.tint[0], 1), safeNum(s.tint[1], 1), safeNum(s.tint[2], 1)];
  s.tintStrength = clamp01(safeNum(s.tintStrength, 0));
  s.useLUT = !!s.useLUT;
  s.lutStrength = clamp01(safeNum(s.lutStrength, 1));
  const ls = String(s.lutSpace ?? "afterGamma");
  s.lutSpace = ["afterGamma", "beforeGamma", "srgb"].includes(ls) ? ls : "afterGamma";
  const sampStr = String(s.lutSampling ?? "fast");
  if (sampStr === "auto" || sampStr === "hardware" || sampStr === "fast") {
    s.lutSampling = "fast";
  } else if (sampStr === "manual" || sampStr === "hq") {
    s.lutSampling = "hq";
  } else {
    s.lutSampling = "fast";
  }
  const tm = String(s.tonemapper ?? "none");
  s.tonemapper = ["none", "reinhard", "aces", "hable"].includes(tm) ? tm : "none";
  s.bloomEnabled = !!s.bloomEnabled;
  s.bloomStrength = clamp01(safeNum(s.bloomStrength, 0.35));
  s.bloomThreshold = safeNum(s.bloomThreshold, 1);
  s.bloomRadius = safeNum(s.bloomRadius, 1);
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
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { ...DEFAULT_SETTINGS };
    return sanitizeSettings(obj);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
function saveSettings(obj) {
  const s = sanitizeSettings(obj);
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
  }
  return s;
}
function getSettings() {
  if (globalThis.__ppSettings && typeof globalThis.__ppSettings === "object") {
    return sanitizeSettings(globalThis.__ppSettings);
  }
  return loadSettings();
}
function applySettingsPermanently(obj) {
  const s = saveSettings(obj);
  globalThis.__ppSettings = s;
  globalThis.__ppSettingsVersion = (globalThis.__ppSettingsVersion ?? 0) + 1;
  globalThis.__ppMirrorSettingsToLegacyGlobals?.(s);
  globalThis.__ppRequestOneFrame?.();
  return s;
}
if (!globalThis.__polyprocessingInstalled) {
  globalThis.__polyprocessingInstalled = true;
  console.log("[PolyProcessing] Runtime installed");
  globalThis.__ppSettingsVersion = globalThis.__ppSettingsVersion ?? 0;
  globalThis.__ppSettings = loadSettings();
  globalThis.__ppMirrorSettingsToLegacyGlobals = (s) => {
    return sanitizeSettings(s);
  };
  globalThis.__ppRequestOneFrame = () => {
    const gl = globalThis.__xenonGetGL?.();
    if (!gl) return false;
    gl.__ppForceDrawOnce = true;
    return true;
  };
  globalThis.__ppGetSavedSettings = () => loadSettings();
  globalThis.__ppSetSavedSettings = (s) => applySettingsPermanently(s);
  globalThis.__ppResetSavedSettings = () => applySettingsPermanently(DEFAULT_SETTINGS);
  globalThis.__ppCaptureDepthMap = (near = 0.5, far = 500) => {
    const gl = globalThis.__xenonGetGL?.();
    if (!gl) {
      console.warn("[PolyProcessing] No GL captured yet.");
      return;
    }
    globalThis.__ppDepthCapNear = near;
    globalThis.__ppDepthCapFar = far;
    globalThis.__ppDepthCapturePending = true;
    console.log("[PolyProcessing] Depth capture queued (near=" + near + ", far=" + far + ")");
  };
}
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
      if (!db.objectStoreNames.contains(LUT_STORE)) db.createObjectStore(LUT_STORE);
      if (!db.objectStoreNames.contains("preset")) db.createObjectStore("preset");
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
  if (!gl.__ppLutTex) gl.__ppLutTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, gl.__ppLutTex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.__ppLutW = img.width;
  gl.__ppLutH = img.height;
  gl.__ppLutReady = true;
  gl.bindTexture(gl.TEXTURE_2D, null);
  console.log("[PolyProcessing] LUT uploaded:", { w: img.width, h: img.height });
  return true;
}
function uploadLUTTextureFromRGBABytes(gl, width, height, bytes) {
  if (!gl.__ppLutTex) gl.__ppLutTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, gl.__ppLutTex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  gl.__ppLutW = width;
  gl.__ppLutH = height;
  gl.__ppLutReady = true;
  gl.bindTexture(gl.TEXTURE_2D, null);
  return true;
}
function guessLUTFromImageSize(w, h) {
  if (w === 256 && h === 16) return { kind: "strip256x16", size: 16, quality: "low", source: "png" };
  if (h > 1 && w === h * h) {
    const N = h;
    return { kind: "packed2d", size: N, quality: N >= 33 ? "high" : "medium", source: "png" };
  }
  if (w === h) {
    const root = Math.round(Math.sqrt(w));
    if (root * root === w) {
      return { kind: "hald", size: root, quality: root >= 16 ? "high" : "medium", source: "png" };
    }
  }
  return null;
}
async function tryLoadLUTFromIDB() {
  try {
    const gl = globalThis.__xenonGetGL?.();
    if (!gl) return false;
    const bin = await idbGet(LUT_KEY_BIN);
    if (bin && bin.byteLength >= 16) {
      const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
      const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
      if (magic === "MLUT") {
        const ver = dv.getUint16(4, true);
        const size = dv.getUint16(6, true);
        const w = dv.getUint16(8, true);
        const h = dv.getUint16(10, true);
        const headerBytes = 16;
        const expected = w * h * 4;
        if (bin.byteLength >= headerBytes + expected && ver === 1) {
          const bytes = new Uint8Array(bin.buffer, bin.byteOffset + headerBytes, expected);
          uploadLUTTextureFromRGBABytes(gl, w, h, bytes);
          gl.__ppLutMeta = { kind: "packed2d", size, quality: size >= 33 ? "high" : "medium", source: "cube/bin" };
          console.log("[PolyProcessing] LUT loaded from IndexedDB (binary)", { size, w, h });
          return true;
        }
      }
    }
    const pngBytes = await idbGet(LUT_KEY_PNG);
    if (!pngBytes) return false;
    const img = await makeImageFromBytes(pngBytes);
    uploadLUTTexture(gl, img);
    const meta = guessLUTFromImageSize(img.width, img.height);
    gl.__ppLutMeta = meta ?? { kind: "unknown", size: 0, quality: "unknown", source: "png" };
    console.log("[PolyProcessing] LUT loaded from IndexedDB (image)", meta);
    return true;
  } catch (e) {
    console.warn("[PolyProcessing] Failed to load LUT from IndexedDB:", e);
    return false;
  }
}
function parseCubeText(text) {
  const lines = text.split(/\r?\n/g).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  let size = 0;
  const table = [];
  for (const line of lines) {
    const up = line.toUpperCase();
    if (up.startsWith("LUT_3D_SIZE")) {
      size = Number(line.split(/\s+/g)[1] ?? 0) | 0;
      continue;
    }
    if (up.startsWith("TITLE") || up.startsWith("DOMAIN_MIN") || up.startsWith("DOMAIN_MAX") || up.startsWith("LUT_1D_SIZE")) {
      continue;
    }
    const parts = line.split(/\s+/g);
    if (parts.length >= 3) {
      const r = Number(parts[0]);
      const g = Number(parts[1]);
      const b = Number(parts[2]);
      if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
        table.push(r, g, b);
      }
    }
  }
  if (!size || size < 2) throw new Error("Invalid .cube: missing LUT_3D_SIZE");
  const expected = size * size * size * 3;
  if (table.length < expected) {
    throw new Error(`Invalid .cube: not enough entries (got ${table.length / 3}, expected ${size ** 3})`);
  }
  return { size, table: table.slice(0, expected) };
}
function cubeToPacked2D_RGBA8(cube) {
  const N = cube.size;
  const width = N * N;
  const height = N;
  const out = new Uint8Array(width * height * 4);
  for (let g = 0; g < N; g++) {
    for (let b = 0; b < N; b++) {
      for (let r = 0; r < N; r++) {
        const src = (r + g * N + b * N * N) * 3;
        const x = r + b * N;
        const y = g;
        const idx = (y * width + x) * 4;
        out[idx + 0] = Math.max(0, Math.min(255, cube.table[src + 0] * 255 | 0));
        out[idx + 1] = Math.max(0, Math.min(255, cube.table[src + 1] * 255 | 0));
        out[idx + 2] = Math.max(0, Math.min(255, cube.table[src + 2] * 255 | 0));
        out[idx + 3] = 255;
      }
    }
  }
  return { width, height, bytes: out, size: N };
}
globalThis.__ppPickLUT = async () => {
  const gl = globalThis.__xenonGetGL?.();
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
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
  document.body.removeChild(input);
  if (!file) return false;
  const name = file.name.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (name.endsWith(".cube")) {
    const cube = parseCubeText(new TextDecoder().decode(bytes));
    const packed = cubeToPacked2D_RGBA8(cube);
    const header = new Uint8Array(16);
    header.set([77, 76, 85, 84]);
    const dv = new DataView(header.buffer);
    dv.setUint16(4, 1, true);
    dv.setUint16(6, packed.size, true);
    dv.setUint16(8, packed.width, true);
    dv.setUint16(10, packed.height, true);
    dv.setUint32(12, packed.bytes.byteLength, true);
    const out = new Uint8Array(16 + packed.bytes.byteLength);
    out.set(header);
    out.set(packed.bytes, 16);
    await idbPut(LUT_KEY_BIN, out);
    await idbDel(LUT_KEY_PNG);
    uploadLUTTextureFromRGBABytes(gl, packed.width, packed.height, packed.bytes);
    gl.__ppLutMeta = { kind: "packed2d", size: packed.size, quality: packed.size >= 33 ? "high" : "medium", source: "cube" };
    console.log("[PolyProcessing] LUT loaded (.cube):", { size: packed.size, w: packed.width, h: packed.height });
    return true;
  }
  const mime = file.type || "image/png";
  const img = await makeImageFromBytes(bytes, mime);
  const meta = guessLUTFromImageSize(img.width, img.height);
  await idbPut(LUT_KEY_PNG, bytes);
  await idbDel(LUT_KEY_BIN);
  uploadLUTTexture(gl, img);
  gl.__ppLutMeta = meta ?? { kind: "unknown", size: 0, quality: "unknown", source: "png" };
  console.log("[PolyProcessing] LUT loaded (image):", { w: img.width, h: img.height, meta });
  return true;
};
globalThis.__ppClearLUT = async () => {
  await idbDel(LUT_KEY_PNG);
  await idbDel(LUT_KEY_BIN);
  const gl = globalThis.__xenonGetGL?.();
  if (gl) {
    gl.__ppLutReady = false;
    gl.__ppLutMeta = null;
  }
  return true;
};
globalThis.__ppExportLUTBytes = async () => {
  const bin = await idbGet(LUT_KEY_BIN);
  if (bin && bin.byteLength > 0) return { type: "bin", bytes: bin };
  const png = await idbGet(LUT_KEY_PNG);
  if (png && png.byteLength > 0) return { type: "png", bytes: png };
  return null;
};
globalThis.__ppImportLUTBytes = async (bytes, kind = "png") => {
  try {
    if (kind === "bin") {
      await idbPut(LUT_KEY_BIN, bytes);
      await idbDel(LUT_KEY_PNG);
      await tryLoadLUTFromIDB();
      return true;
    }
    await idbPut(LUT_KEY_PNG, bytes);
    await idbDel(LUT_KEY_BIN);
    const gl = globalThis.__xenonGetGL?.();
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
function compileShader(gl, type, src) {
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
function linkProgram(gl, vsSrc, fsSrc) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("[PolyProcessing] Link error:", gl.getProgramInfoLog(prog));
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}
function uloc(gl, prog, name) {
  return gl.getUniformLocation(prog, name);
}
function ensurePostFx(gl) {
  if (gl.__ppFxReady) return true;
  const prog = linkProgram(gl, VS_FULLSCREEN, FS_FX);
  if (!prog) return false;
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
function ensureBloom(gl) {
  if (gl.__ppBloomReady) return true;
  const prefilterProg = linkProgram(gl, VS_FULLSCREEN, FS_BLOOM_PREFILTER);
  const blurProg = linkProgram(gl, VS_FULLSCREEN, FS_BLOOM_BLUR);
  if (!prefilterProg || !blurProg) return false;
  gl.__ppBloomPrefilterProg = prefilterProg;
  gl.__ppBloomBlurProg = blurProg;
  gl.__ppBloomVAO = gl.createVertexArray();
  gl.__ppBloomTexA = gl.createTexture();
  gl.__ppBloomTexB = gl.createTexture();
  gl.__ppBloomFboA = gl.createFramebuffer();
  gl.__ppBloomFboB = gl.createFramebuffer();
  gl.__ppBloomW = 0;
  gl.__ppBloomH = 0;
  gl.__ppBloomReady = true;
  console.log("[PolyProcessing] Bloom pipeline ready");
  return true;
}
function ensureBloomTargets(gl) {
  const w = gl.drawingBufferWidth / 2 | 0;
  const h = gl.drawingBufferHeight / 2 | 0;
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
  if (!ensureBloom(gl) || !ensureBloomTargets(gl)) return false;
  const s = getSettings();
  const threshold = s.bloomThreshold;
  const radius = s.bloomRadius;
  const prefilter = gl.__ppBloomPrefilterProg;
  const blur = gl.__ppBloomBlurProg;
  gl.bindFramebuffer(gl.FRAMEBUFFER, gl.__ppBloomFboA);
  gl.viewport(0, 0, gl.__ppBloomW, gl.__ppBloomH);
  gl.useProgram(prefilter);
  gl.bindVertexArray(gl.__ppBloomVAO);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, gl.__ppFxTex);
  gl.uniform1i(uloc(gl, prefilter, "uTex"), 0);
  gl.uniform1f(uloc(gl, prefilter, "uThreshold"), threshold);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindFramebuffer(gl.FRAMEBUFFER, gl.__ppBloomFboB);
  gl.useProgram(blur);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, gl.__ppBloomTexA);
  gl.uniform1i(uloc(gl, blur, "uTex"), 0);
  gl.uniform2f(uloc(gl, blur, "uTexel"), 1 / gl.__ppBloomW, 1 / gl.__ppBloomH);
  gl.uniform2f(uloc(gl, blur, "uDir"), 1, 0);
  gl.uniform1f(uloc(gl, blur, "uRadius"), radius);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindFramebuffer(gl.FRAMEBUFFER, gl.__ppBloomFboA);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, gl.__ppBloomTexB);
  gl.uniform2f(uloc(gl, blur, "uDir"), 0, 1);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return true;
}
function grabScreen(gl) {
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  if (w <= 0 || h <= 0) return false;
  gl.bindTexture(gl.TEXTURE_2D, gl.__ppFxTex);
  if (gl.__ppFxTexW !== w || gl.__ppFxTexH !== h) {
    gl.__ppFxTexW = w;
    gl.__ppFxTexH = h;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
  gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, w, h);
  return true;
}
async function captureDepthMap(gl, near, far) {
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  if (w <= 0 || h <= 0) return;
  const origDrawFB = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
  const sampleBuffers = gl.getParameter(gl.SAMPLE_BUFFERS);
  const samples = sampleBuffers > 0 ? gl.getParameter(gl.SAMPLES) : 1;
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, origDrawFB);
  const isMSAA = samples > 1;
  if (isMSAA) {
    console.error(
      `[PolyProcessing] Depth capture is not supported with antialiasing enabled. This is a WebGL2 limitation: depth cannot be blitted from multisampled framebuffers. Disable antialiasing (antialias: false) in the renderer config to use depth capture.`
    );
    return;
  }
  const attrs = gl.getContextAttributes();
  const tryStencilFirst = attrs?.stencil !== false;
  const tryFormats = tryStencilFirst ? [
    { fmt: gl.DEPTH24_STENCIL8, external: gl.DEPTH_STENCIL, type: gl.UNSIGNED_INT_24_8, attach: gl.DEPTH_STENCIL_ATTACHMENT, stenciled: true },
    { fmt: gl.DEPTH_COMPONENT24, external: gl.DEPTH_COMPONENT, type: gl.UNSIGNED_INT, attach: gl.DEPTH_ATTACHMENT, stenciled: false }
  ] : [
    { fmt: gl.DEPTH_COMPONENT24, external: gl.DEPTH_COMPONENT, type: gl.UNSIGNED_INT, attach: gl.DEPTH_ATTACHMENT, stenciled: false },
    { fmt: gl.DEPTH24_STENCIL8, external: gl.DEPTH_STENCIL, type: gl.UNSIGNED_INT_24_8, attach: gl.DEPTH_STENCIL_ATTACHMENT, stenciled: true }
  ];
  let selectedFormat = null;
  const savedActiveTexture = gl.getParameter(gl.ACTIVE_TEXTURE);
  gl.activeTexture(gl.TEXTURE0);
  const savedTex0 = gl.getParameter(gl.TEXTURE_BINDING_2D);
  gl.activeTexture(savedActiveTexture);
  const savedReadFB = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
  const savedDrawFB = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
  const savedProg = gl.getParameter(gl.CURRENT_PROGRAM);
  const savedVAO = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
  const savedVP = gl.getParameter(gl.VIEWPORT);
  const savedDepth = gl.isEnabled(gl.DEPTH_TEST);
  const savedCull = gl.isEnabled(gl.CULL_FACE);
  const savedBlend = gl.isEnabled(gl.BLEND);
  let depthTex = null;
  let depthFBO = null;
  let colorTex = null;
  let colorFBO = null;
  let vizProg = null;
  let vizVAO = null;
  try {
    for (const fmt of tryFormats) {
      depthTex = gl.createTexture();
      depthFBO = gl.createFramebuffer();
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, depthFBO);
      gl.bindTexture(gl.TEXTURE_2D, depthTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, fmt.fmt, w, h, 0, fmt.external, fmt.type, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.NONE);
      gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, fmt.attach, gl.TEXTURE_2D, depthTex, 0);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      const blitMaskForFmt = fmt.stenciled ? gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT : gl.DEPTH_BUFFER_BIT;
      gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, blitMaskForFmt, gl.NEAREST);
      const blitErr = gl.getError();
      if (blitErr === gl.NO_ERROR) {
        selectedFormat = fmt;
        break;
      }
      gl.deleteTexture(depthTex);
      gl.deleteFramebuffer(depthFBO);
      depthTex = null;
      depthFBO = null;
    }
    if (!selectedFormat) {
      console.error(`[PolyProcessing] Depth blit failed with all format combinations`);
      return;
    }
    colorTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, colorTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    colorFBO = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, colorFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTex, 0);
    vizProg = linkProgram(gl, VS_FULLSCREEN, FS_DEPTH_VIZ);
    if (!vizProg) return;
    vizVAO = gl.createVertexArray();
    gl.viewport(0, 0, w, h);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    if (savedBlend) gl.disable(gl.BLEND);
    gl.useProgram(vizProg);
    gl.bindVertexArray(vizVAO);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, depthTex);
    gl.uniform1i(uloc(gl, vizProg, "uDepth"), 0);
    gl.uniform1f(uloc(gl, vizProg, "uNear"), near);
    gl.uniform1f(uloc(gl, vizProg, "uFar"), far);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const rgba = new Uint8ClampedArray(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    const readErr = gl.getError();
    if (readErr !== gl.NO_ERROR) {
      console.error(`[PolyProcessing] Color readPixels failed (GL error 0x${readErr.toString(16)})`);
      return;
    }
    const flipped = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      const src = (h - 1 - y) * w * 4;
      flipped.set(rgba.subarray(src, src + w * 4), y * w * 4);
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").putImageData(new ImageData(flipped, w, h), 0, 0);
    const url = await new Promise((resolve) => {
      canvas.toBlob(
        (blob) => resolve(blob ? URL.createObjectURL(blob) : canvas.toDataURL("image/png")),
        "image/png"
      );
    });
    const a = document.createElement("a");
    a.href = url;
    a.download = `depthmap_${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}.png`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2e3);
    console.log("[PolyProcessing] Depth map captured:", { w, h, near, far });
  } finally {
    if (depthTex) gl.deleteTexture(depthTex);
    if (colorTex) gl.deleteTexture(colorTex);
    if (depthFBO) gl.deleteFramebuffer(depthFBO);
    if (colorFBO) gl.deleteFramebuffer(colorFBO);
    if (vizProg) gl.deleteProgram(vizProg);
    if (vizVAO) gl.deleteVertexArray(vizVAO);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, savedTex0);
    gl.activeTexture(savedActiveTexture);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, savedReadFB);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, savedDrawFB);
    gl.useProgram(savedProg);
    gl.bindVertexArray(savedVAO);
    gl.viewport(savedVP[0], savedVP[1], savedVP[2], savedVP[3]);
    if (savedDepth) gl.enable(gl.DEPTH_TEST);
    if (savedCull) gl.enable(gl.CULL_FACE);
    if (savedBlend) gl.enable(gl.BLEND);
  }
}
function drawPostFx(gl) {
  const s = getSettings();
  if (!s.fxEnabled) return;
  if (!ensurePostFx(gl)) return;
  if (gl.__ppFxDrawing) return;
  gl.__ppFxDrawing = true;
  try {
    const savedActiveTexture = gl.getParameter(gl.ACTIVE_TEXTURE);
    gl.activeTexture(gl.TEXTURE0);
    const savedTex0 = gl.getParameter(gl.TEXTURE_BINDING_2D);
    gl.activeTexture(gl.TEXTURE1);
    const savedTex1 = gl.getParameter(gl.TEXTURE_BINDING_2D);
    gl.activeTexture(gl.TEXTURE2);
    const savedTex2 = gl.getParameter(gl.TEXTURE_BINDING_2D);
    gl.activeTexture(savedActiveTexture);
    const savedViewport = gl.getParameter(gl.VIEWPORT);
    if (!grabScreen(gl)) return;
    if (s.bloomEnabled) renderBloom(gl);
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
    const prog = gl.__ppFxProg;
    gl.useProgram(prog);
    gl.bindVertexArray(gl.__ppFxVAO);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, gl.__ppFxTex);
    gl.uniform1i(uloc(gl, prog, "uTex"), 0);
    gl.uniform1f(uloc(gl, prog, "uExposure"), s.exposure);
    gl.uniform1f(uloc(gl, prog, "uContrast"), s.contrast);
    gl.uniform1f(uloc(gl, prog, "uSaturation"), s.saturation);
    gl.uniform1f(uloc(gl, prog, "uGamma"), s.gamma);
    gl.uniform1f(uloc(gl, prog, "uInvert"), s.invert ? 1 : 0);
    gl.uniform3f(uloc(gl, prog, "uTint"), s.tint[0], s.tint[1], s.tint[2]);
    gl.uniform1f(uloc(gl, prog, "uTintStrength"), s.tintStrength);
    gl.uniform1i(uloc(gl, prog, "uDebugCorner"), s.debugCorner ? 1 : 0);
    const tmMode = { none: 0, reinhard: 1, aces: 2, hable: 3 }[s.tonemapper] ?? 0;
    gl.uniform1i(uloc(gl, prog, "uTonemapper"), tmMode);
    const canUseLUT = s.useLUT && !!gl.__ppLutReady && !!gl.__ppLutTex && (gl.__ppLutW ?? 0) > 0 && (gl.__ppLutH ?? 0) > 0;
    gl.uniform1i(uloc(gl, prog, "uUseLUT"), canUseLUT ? 1 : 0);
    if (canUseLUT) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, gl.__ppLutTex);
      gl.uniform1i(uloc(gl, prog, "uLUT"), 1);
      gl.uniform1f(uloc(gl, prog, "uLUTStrength"), s.lutStrength);
    } else {
      gl.uniform1f(uloc(gl, prog, "uLUTStrength"), 0);
    }
    const meta = gl.__ppLutMeta ?? null;
    const lutKind = meta?.kind === "packed2d" ? 1 : 0;
    const lutSize = meta?.kind === "packed2d" ? meta.size : 16;
    gl.uniform1i(uloc(gl, prog, "uLUTKind"), lutKind);
    gl.uniform1f(uloc(gl, prog, "uLUTSize"), lutSize);
    gl.uniform2f(uloc(gl, prog, "uLUTTexSize"), gl.__ppLutW ?? 256, gl.__ppLutH ?? 16);
    const lutSpace = { afterGamma: 0, beforeGamma: 1, srgb: 2 }[s.lutSpace] ?? 0;
    gl.uniform1i(uloc(gl, prog, "uLUTSpace"), lutSpace);
    gl.uniform1i(uloc(gl, prog, "uLUTSampling"), s.lutSampling === "hq" ? 1 : 0);
    const bloomActive = s.bloomEnabled && !!gl.__ppBloomReady && !!gl.__ppBloomTexA;
    gl.uniform1i(uloc(gl, prog, "uBloomEnabled"), bloomActive ? 1 : 0);
    if (bloomActive) {
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, gl.__ppBloomTexA);
      gl.uniform1i(uloc(gl, prog, "uBloomTex"), 2);
      gl.uniform1f(uloc(gl, prog, "uBloomStrength"), clamp01(s.bloomStrength));
    } else {
      gl.uniform1f(uloc(gl, prog, "uBloomStrength"), 0);
    }
    gl.uniform1i(uloc(gl, prog, "uGrayscale"), s.grayscale ? 1 : 0);
    gl.uniform1i(uloc(gl, prog, "uBW"), s.bw ? 1 : 0);
    gl.uniform1f(uloc(gl, prog, "uBWThreshold"), s.bwThreshold);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(oldVAO);
    gl.useProgram(oldProg);
    gl.bindFramebuffer(gl.FRAMEBUFFER, oldFB);
    if (oldBlend) gl.enable(gl.BLEND);
    if (oldDepth) gl.enable(gl.DEPTH_TEST);
    if (oldCull) gl.enable(gl.CULL_FACE);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, savedTex2);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, savedTex1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, savedTex0);
    gl.activeTexture(savedActiveTexture);
    gl.viewport(savedViewport[0], savedViewport[1], savedViewport[2], savedViewport[3]);
  } finally {
    gl.__ppFxDrawing = false;
  }
}
const origRAF = globalThis.requestAnimationFrame.bind(globalThis);
globalThis.__ppRafTick = globalThis.__ppRafTick ?? 0;
globalThis.requestAnimationFrame = function(cb) {
  return origRAF(function(t) {
    globalThis.__ppRafTick++;
    cb(t);
    const gl = globalThis.__xenonGetGL?.();
    if (!gl) return;
    if (gl.__ppLastAppliedTick === globalThis.__ppRafTick) return;
    gl.__ppLastAppliedTick = globalThis.__ppRafTick;
    drawPostFx(gl);
    if (gl.__ppForceDrawOnce) {
      gl.__ppForceDrawOnce = false;
      drawPostFx(gl);
    }
    if (globalThis.__ppDepthCapturePending) {
      globalThis.__ppDepthCapturePending = false;
      void captureDepthMap(
        gl,
        globalThis.__ppDepthCapNear ?? 0.5,
        globalThis.__ppDepthCapFar ?? 500
      );
    }
  });
};
console.log("[PolyProcessing] Hooked requestAnimationFrame");
function injectCSS() {
  if (document.querySelector("style[data-polyprocessing-gui]")) return;
  const style = document.createElement("style");
  style.dataset.polyprocessingGui = "1";
  style.textContent = `
    .pp-root {
      position: fixed; left: 0; top: 0;
      z-index: 2147483647;
      width: 100vw; height: 100vh;
      display: none; align-items: center; justify-content: center;
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
    .pp-row {
      display: grid;
      grid-template-columns: 180px 1fr 88px;
      align-items: center;
      gap: 14px; height: 30px; margin: 6px 0;
    }
    .pp-label  { font-size: 13px; opacity: 0.88; }
    .pp-value  { font-size: 12px; opacity: 0.75; text-align: right; user-select: none; }
    .pp-slider { width: 100%; height: 18px; margin: 0; }
    .pp-toggle { justify-self: start; margin: 0; transform: translateY(1px); }
    .pp-select {
      width: 100%; height: 26px; padding: 2px 8px;
      border-radius: 10px; border: 1px solid rgba(255,255,255,0.14);
      background: rgba(0,0,0,0.25); color: rgba(255,255,255,0.92);
      outline: none; font-size: 13px;
    }
    .pp-btn {
      padding: 8px 10px; border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.14);
      background: rgba(255,255,255,0.06);
      color: rgba(255,255,255,0.92); cursor: pointer; font-size: 13px;
    }
    .pp-btn:hover { background: rgba(255,255,255,0.10); }
  `;
  document.head.appendChild(style);
}
function encodeString(str) {
  const bytes = new TextEncoder().encode(str);
  return { length: bytes.length, bytes };
}
function decodeString(view, offset) {
  const length = view.getUint16(offset, true);
  offset += 2;
  const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, length);
  return { str: new TextDecoder().decode(bytes), newOffset: offset + length };
}
async function pickFile(accept) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.style.display = "none";
  document.body.appendChild(input);
  const file = await new Promise((resolve) => {
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
  document.body.removeChild(input);
  return file;
}
function btn(label, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.className = "pp-btn";
  b.onclick = onClick;
  return b;
}
function sectionTitle(text) {
  const d = document.createElement("div");
  d.textContent = text;
  d.style.cssText = "margin-top:14px;margin-bottom:8px;font-size:13px;font-weight:650;opacity:0.9;letter-spacing:0.2px;";
  return d;
}
function mkRow() {
  const d = document.createElement("div");
  d.className = "pp-row";
  return d;
}
function mkLabel(text) {
  const d = document.createElement("div");
  d.className = "pp-label";
  d.textContent = text;
  return d;
}
function mkValue() {
  const d = document.createElement("div");
  d.className = "pp-value";
  return d;
}
function mkCheckbox(get, set) {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.className = "pp-toggle";
  input.checked = get();
  input.onchange = () => {
    set(input.checked);
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
  sel.value = get();
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
let current = loadSettings();
let saveTimer = null;
const uiRefreshFns = [];
const valueRefreshFns = [];
function flush(save = true) {
  globalThis.__ppSettings = sanitizeSettings(current);
  globalThis.__ppSettingsVersion = (globalThis.__ppSettingsVersion ?? 0) + 1;
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
class PolyProcessing extends PolyMod {
  init = (pml) => {
    globalThis.__xenonRegisterContextCallback?.(() => {
      void tryLoadLUTFromIDB();
    });
    if (globalThis.__xenonGetGL?.()) void tryLoadLUTFromIDB();
    pml.registerBindCategory("PolyProcessing");
    pml.registerKeybind(
      "Toggle PolyProcessing GUI while holding shift",
      "PolyProcessing_ToggleGUI",
      "keydown",
      "KeyP",
      null,
      (event) => {
        if (!event.shiftKey) return;
        event.preventDefault();
        globalThis.__ppToggleGUI?.();
      }
    );
  };
  postInit = () => {
    this.installGUI();
    console.log("[PolyProcessing] GUI installed");
  };
  installGUI() {
    if (globalThis.__ppGUIInstalled) return;
    globalThis.__ppGUIInstalled = true;
    injectCSS();
    const exportPreset = async () => {
      const settings = loadSettings();
      const presetName = prompt("Preset Name:", "My Preset");
      if (presetName === null) return;
      const author = prompt("Author:", "");
      if (author === null) return;
      const settingsBytes = new TextEncoder().encode(JSON.stringify(settings));
      const lutData = await globalThis.__ppExportLUTBytes?.();
      const buffers = [];
      const header = new Uint8Array(16);
      header.set([80, 80, 83, 84]);
      new DataView(header.buffer).setUint16(4, 1, true);
      buffers.push(header.buffer);
      const nameEnc = encodeString(presetName);
      const nameLenBuf = new ArrayBuffer(2);
      new DataView(nameLenBuf).setUint16(0, nameEnc.length, true);
      buffers.push(nameLenBuf, nameEnc.bytes.buffer);
      const authorEnc = encodeString(author);
      const authorLenBuf = new ArrayBuffer(2);
      new DataView(authorLenBuf).setUint16(0, authorEnc.length, true);
      buffers.push(authorLenBuf, authorEnc.bytes.buffer);
      const settingsLenBuf = new ArrayBuffer(4);
      new DataView(settingsLenBuf).setUint32(0, settingsBytes.length, true);
      buffers.push(settingsLenBuf, settingsBytes.buffer);
      if (lutData?.bytes.byteLength) {
        const hasLut = new Uint8Array([1]);
        const lutType = new Uint8Array([lutData.type === "bin" ? 1 : 0]);
        const lutLen = new ArrayBuffer(4);
        new DataView(lutLen).setUint32(0, lutData.bytes.byteLength, true);
        buffers.push(hasLut.buffer, lutType.buffer, lutLen, lutData.bytes.buffer);
      } else {
        buffers.push(new Uint8Array([0]).buffer);
      }
      const total = buffers.reduce((s, b) => s + b.byteLength, 0);
      const combined = new Uint8Array(total);
      let off = 0;
      for (const buf of buffers) {
        combined.set(new Uint8Array(buf), off);
        off += buf.byteLength;
      }
      const url = URL.createObjectURL(new Blob([combined], { type: "application/octet-stream" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${presetName.replace(/\s+/g, "_")}_${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}.polypreset`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1e3);
      console.log("[PolyProcessing] Preset exported:", presetName, "by", author);
    };
    const importPreset = async () => {
      const file = await pickFile(".polypreset");
      if (!file) return;
      const buf = await file.arrayBuffer();
      const view = new DataView(buf);
      const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
      if (magic !== "PPST") throw new Error("Invalid preset file: bad magic number");
      if (view.getUint16(4, true) !== 1) throw new Error("Unsupported preset version");
      let offset = 16;
      const { str: presetName, newOffset: o1 } = decodeString(view, offset);
      offset = o1;
      const { str: author, newOffset: o2 } = decodeString(view, offset);
      offset = o2;
      const settingsLen = view.getUint32(offset, true);
      offset += 4;
      const settings = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, offset, settingsLen)));
      offset += settingsLen;
      applySettingsPermanently(settings);
      globalThis.__ppCurrentPresetName = presetName;
      globalThis.__ppCurrentPresetAuthor = author;
      if (offset < buf.byteLength) {
        const hasLut = view.getUint8(offset);
        offset++;
        if (hasLut) {
          const lutTypeNum = view.getUint8(offset);
          offset++;
          const lutLen = view.getUint32(offset, true);
          offset += 4;
          const lutBytes = new Uint8Array(buf, offset, lutLen);
          const kind = lutTypeNum === 1 ? "bin" : "png";
          await globalThis.__ppImportLUTBytes?.(lutBytes, kind);
        }
      }
      console.log("[PolyProcessing] Preset imported:", presetName, "by", author);
      refreshUIFromSettings();
    };
    const clearAndReset = async () => {
      applySettingsPermanently(DEFAULT_SETTINGS);
      await globalThis.__ppClearLUT?.();
      globalThis.__ppCurrentPresetName = null;
      globalThis.__ppCurrentPresetAuthor = null;
      refreshUIFromSettings();
    };
    const root = document.createElement("div");
    root.id = "polyprocessing_gui_root";
    root.className = "pp-root";
    root.style.display = "none";
    const panel = document.createElement("div");
    panel.className = "pp-panel";
    root.appendChild(panel);
    document.body.appendChild(root);
    {
      const wrap = document.createElement("div");
      wrap.style.cssText = "display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px;";
      const left = document.createElement("div");
      left.innerHTML = `<div style="font-size:18px;font-weight:650;">PolyProcessing</div><div style="opacity:0.75;font-size:13px;margin-top:2px;">Shift+P to open/close \xB7 Presets permanently apply</div>`;
      const right = document.createElement("div");
      right.style.cssText = "display:flex;gap:8px;align-items:center;";
      right.appendChild(btn("Import Preset", () => void importPreset().catch((e) => alert(`Import failed:
${e}`))));
      right.appendChild(btn("Export Preset", () => void exportPreset().catch((e) => alert(`Export failed:
${e}`))));
      right.appendChild(btn("Reset Defaults", () => void clearAndReset()));
      right.appendChild(btn("Close", () => {
        root.style.display = "none";
      }));
      wrap.appendChild(left);
      wrap.appendChild(right);
      panel.appendChild(wrap);
    }
    panel.appendChild(document.createElement("hr")).style.cssText = "border:0;border-top:1px solid rgba(255,255,255,0.10);margin:10px 0;";
    const addFloatSlider = (name, min, max, step, get, set) => {
      const r = mkRow();
      r.appendChild(mkLabel(name));
      const slider = mkSlider(min, max, step, get, set);
      r.appendChild(slider);
      const v = mkValue();
      const refresh = () => {
        slider.value = String(get());
        v.textContent = get().toFixed(3);
      };
      uiRefreshFns.push(refresh);
      valueRefreshFns.push(() => {
        v.textContent = get().toFixed(3);
      });
      refresh();
      r.appendChild(v);
      panel.appendChild(r);
    };
    panel.appendChild(sectionTitle("General"));
    {
      const r = mkRow();
      r.appendChild(mkLabel("Enabled"));
      const c = mkCheckbox(() => current.fxEnabled, (v) => {
        current.fxEnabled = v;
      });
      r.appendChild(c);
      r.appendChild(mkValue());
      uiRefreshFns.push(() => {
        c.checked = current.fxEnabled;
      });
      panel.appendChild(r);
    }
    {
      const r = mkRow();
      r.appendChild(mkLabel("Tonemapper"));
      const sel = mkSelect(
        [
          { title: "ACES", value: "aces" },
          { title: "Hable (Uncharted 2)", value: "hable" },
          { title: "Reinhard", value: "reinhard" },
          { title: "None", value: "none" }
        ],
        () => current.tonemapper,
        (v2) => {
          current.tonemapper = v2;
        }
      );
      const v = mkValue();
      v.textContent = current.tonemapper;
      uiRefreshFns.push(() => {
        sel.value = current.tonemapper;
      });
      valueRefreshFns.push(() => {
        v.textContent = current.tonemapper;
      });
      r.appendChild(sel);
      r.appendChild(v);
      panel.appendChild(r);
    }
    addFloatSlider("Exposure", 0, 3, 0.01, () => current.exposure, (x) => {
      current.exposure = x;
    });
    addFloatSlider("Contrast", 0, 3, 0.01, () => current.contrast, (x) => {
      current.contrast = x;
    });
    addFloatSlider("Saturation", 0, 3, 0.01, () => current.saturation, (x) => {
      current.saturation = x;
    });
    addFloatSlider("Gamma", 0.1, 4, 0.01, () => current.gamma, (x) => {
      current.gamma = x;
    });
    {
      const r = mkRow();
      r.appendChild(mkLabel("Invert"));
      const c = mkCheckbox(() => current.invert, (v) => {
        current.invert = v;
      });
      const val = mkValue();
      val.textContent = current.invert ? "On" : "Off";
      uiRefreshFns.push(() => {
        c.checked = current.invert;
      });
      valueRefreshFns.push(() => {
        val.textContent = current.invert ? "On" : "Off";
      });
      r.appendChild(c);
      r.appendChild(val);
      panel.appendChild(r);
    }
    panel.appendChild(sectionTitle("Tint"));
    addFloatSlider("Tint Strength", 0, 1, 0.01, () => current.tintStrength, (x) => {
      current.tintStrength = x;
    });
    {
      const presets = [
        { title: "None", value: "[1,1,1]" },
        { title: "Warm", value: "[1.1,1.0,0.9]" },
        { title: "Cool", value: "[0.9,1.0,1.1]" },
        { title: "Purple", value: "[0.6,0.0,1.0]" },
        { title: "Green", value: "[0.9,1.1,0.9]" }
      ];
      const r = mkRow();
      r.appendChild(mkLabel("Tint Preset"));
      const sel = mkSelect(
        presets,
        () => JSON.stringify(current.tint),
        (val) => {
          try {
            const arr = JSON.parse(val);
            if (Array.isArray(arr) && arr.length === 3) current.tint = arr;
          } catch {
          }
        }
      );
      const v = mkValue();
      v.textContent = JSON.stringify(current.tint);
      uiRefreshFns.push(() => {
        sel.value = JSON.stringify(current.tint);
      });
      valueRefreshFns.push(() => {
        v.textContent = JSON.stringify(current.tint);
      });
      r.appendChild(sel);
      r.appendChild(v);
      panel.appendChild(r);
    }
    panel.appendChild(sectionTitle("LUT"));
    {
      const r = mkRow();
      r.appendChild(mkLabel("Use LUT"));
      const c = mkCheckbox(() => current.useLUT, (v) => {
        current.useLUT = v;
      });
      const val = mkValue();
      val.textContent = current.useLUT ? "On" : "Off";
      uiRefreshFns.push(() => {
        c.checked = current.useLUT;
      });
      valueRefreshFns.push(() => {
        val.textContent = current.useLUT ? "On" : "Off";
      });
      r.appendChild(c);
      r.appendChild(val);
      panel.appendChild(r);
    }
    addFloatSlider("LUT Strength", 0, 1, 0.01, () => current.lutStrength, (x) => {
      current.lutStrength = x;
    });
    {
      const r = mkRow();
      r.appendChild(mkLabel("LUT Sampling"));
      const sel = mkSelect(
        [
          { title: "Auto (recommended)", value: "auto" },
          { title: "Hardware Linear", value: "hardware" },
          { title: "Manual Trilinear", value: "manual" }
        ],
        () => current.lutSampling,
        (v2) => {
          current.lutSampling = v2;
        }
      );
      const v = mkValue();
      v.textContent = current.lutSampling;
      uiRefreshFns.push(() => {
        sel.value = current.lutSampling;
      });
      valueRefreshFns.push(() => {
        v.textContent = current.lutSampling;
      });
      r.appendChild(sel);
      r.appendChild(v);
      panel.appendChild(r);
    }
    {
      const r = mkRow();
      r.appendChild(mkLabel("LUT Color Space"));
      const sel = mkSelect(
        [
          { title: "After Gamma (linear)", value: "afterGamma" },
          { title: "Before Gamma (sRGB)", value: "beforeGamma" },
          { title: "sRGB (Photoshop)", value: "srgb" }
        ],
        () => current.lutSpace,
        (v2) => {
          current.lutSpace = v2;
        }
      );
      const v = mkValue();
      v.textContent = current.lutSpace;
      uiRefreshFns.push(() => {
        sel.value = current.lutSpace;
      });
      valueRefreshFns.push(() => {
        v.textContent = current.lutSpace;
      });
      r.appendChild(sel);
      r.appendChild(v);
      panel.appendChild(r);
    }
    {
      const r = mkRow();
      r.appendChild(mkLabel("LUT File"));
      const wrap = document.createElement("div");
      wrap.style.cssText = "display:flex;gap:8px;align-items:center;";
      wrap.appendChild(btn("Pick LUT", () => void globalThis.__ppPickLUT?.().then(() => globalThis.__ppRequestOneFrame?.())));
      wrap.appendChild(btn("Clear LUT", () => void globalThis.__ppClearLUT?.().then(() => globalThis.__ppRequestOneFrame?.())));
      r.appendChild(wrap);
      r.appendChild(mkValue());
      panel.appendChild(r);
    }
    panel.appendChild(sectionTitle("Bloom"));
    {
      const r = mkRow();
      r.appendChild(mkLabel("Bloom Enabled"));
      const c = mkCheckbox(() => current.bloomEnabled, (v) => {
        current.bloomEnabled = v;
      });
      const val = mkValue();
      val.textContent = current.bloomEnabled ? "On" : "Off";
      uiRefreshFns.push(() => {
        c.checked = current.bloomEnabled;
      });
      valueRefreshFns.push(() => {
        val.textContent = current.bloomEnabled ? "On" : "Off";
      });
      r.appendChild(c);
      r.appendChild(val);
      panel.appendChild(r);
    }
    addFloatSlider("Bloom Strength", 0, 1, 0.01, () => current.bloomStrength, (x) => {
      current.bloomStrength = x;
    });
    addFloatSlider("Bloom Threshold", 0, 3, 0.01, () => current.bloomThreshold, (x) => {
      current.bloomThreshold = x;
    });
    addFloatSlider("Bloom Radius", 0, 3, 0.01, () => current.bloomRadius, (x) => {
      current.bloomRadius = x;
    });
    panel.appendChild(sectionTitle("B&W / Greyscale"));
    {
      const r = mkRow();
      r.appendChild(mkLabel("Greyscale"));
      const c = mkCheckbox(() => current.grayscale, (v) => {
        current.grayscale = v;
        if (v) current.bw = false;
      });
      const val = mkValue();
      val.textContent = current.grayscale ? "On" : "Off";
      uiRefreshFns.push(() => {
        c.checked = current.grayscale;
      });
      valueRefreshFns.push(() => {
        val.textContent = current.grayscale ? "On" : "Off";
      });
      r.appendChild(c);
      r.appendChild(val);
      panel.appendChild(r);
    }
    {
      const r = mkRow();
      r.appendChild(mkLabel("B&W (Threshold)"));
      const c = mkCheckbox(() => current.bw, (v) => {
        current.bw = v;
        if (v) current.grayscale = false;
      });
      const val = mkValue();
      val.textContent = current.bw ? "On" : "Off";
      uiRefreshFns.push(() => {
        c.checked = current.bw;
      });
      valueRefreshFns.push(() => {
        val.textContent = current.bw ? "On" : "Off";
      });
      r.appendChild(c);
      r.appendChild(val);
      panel.appendChild(r);
    }
    addFloatSlider("B&W Threshold", 0, 1, 0.01, () => current.bwThreshold, (x) => {
      current.bwThreshold = x;
    });
    panel.appendChild(sectionTitle("Depth Map Capture"));
    const depthCap = { near: 0.5, far: 500 };
    addFloatSlider("Near Plane", 0.01, 10, 0.01, () => depthCap.near, (v) => {
      depthCap.near = v;
    });
    addFloatSlider("Far Plane", 10, 2e3, 5, () => depthCap.far, (v) => {
      depthCap.far = v;
    });
    {
      const r = mkRow();
      r.appendChild(mkLabel(""));
      const b = btn("Capture Depth Map", () => {
        globalThis.__ppCaptureDepthMap?.(depthCap.near, depthCap.far);
      });
      b.style.flexShrink = "0";
      r.appendChild(b);
      r.appendChild(document.createElement("div"));
      panel.appendChild(r);
    }
    panel.appendChild(sectionTitle("Active Preset"));
    {
      const r = mkRow();
      r.appendChild(mkLabel("Name"));
      const val = mkValue();
      val.textContent = globalThis.__ppCurrentPresetName ?? "None";
      uiRefreshFns.push(() => {
        val.textContent = globalThis.__ppCurrentPresetName ?? "None";
      });
      r.appendChild(val);
      r.appendChild(document.createElement("div"));
      panel.appendChild(r);
    }
    {
      const r = mkRow();
      r.appendChild(mkLabel("Author"));
      const val = mkValue();
      val.textContent = globalThis.__ppCurrentPresetAuthor ?? "None";
      uiRefreshFns.push(() => {
        val.textContent = globalThis.__ppCurrentPresetAuthor ?? "None";
      });
      r.appendChild(val);
      r.appendChild(document.createElement("div"));
      panel.appendChild(r);
    }
    root.addEventListener("click", (e) => {
      if (e.target === root) root.style.display = "none";
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && root.style.display !== "none") root.style.display = "none";
    });
    globalThis.__ppToggleGUI = () => {
      if (root.style.display === "none") {
        refreshUIFromSettings();
        root.style.display = "flex";
      } else {
        root.style.display = "none";
      }
    };
    applySettingsPermanently(loadSettings());
  }
}
const polyMod = new PolyProcessing();
export {
  polyMod
};
