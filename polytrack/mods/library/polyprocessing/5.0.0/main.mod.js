import { PolyMod } from "../../../../PolyTypes.js";
import { PolymGUI } from "https://cdn.polymodloader.com/cb/GameBuilder202/Polymgui/dev/0.1.0/main.mod.js";
// ============================================================
// Constants
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
    lutSpace: "afterGamma",
    lutSampling: "fast",
    bloomEnabled: false,
    bloomStrength: 0.35,
    bloomThreshold: 1.0,
    bloomRadius: 1.0,
    dofEnabled: false,
    dofRadius: 5.0,
    dofFocalDistance: 20.0,
    dofAperture: 1.0,
    dofNear: 0.5,
    dofFar: 500.0,
    tonemapper: "none",
    grayscale: false,
    bw: false,
    bwThreshold: 0.5,
};
const DEFAULT_WINDOWS_STATE = {
    hub: { name: "hub", position: { left: 10, top: 10 }, size: { width: 260, height: 400 }, collapsed: false },
    colorGrading: { name: "colorGrading", position: { left: 280, top: 10 }, size: { width: 400, height: 500 }, collapsed: false },
    bloom: { name: "bloom", position: { left: 10, top: 420 }, size: { width: 380, height: 300 }, collapsed: false },
    dof: { name: "dof", position: { left: 400, top: 320 }, size: { width: 400, height: 400 }, collapsed: false },
    lut: { name: "lut", position: { left: 10, top: 740 }, size: { width: 360, height: 280 }, collapsed: false },
    bw: { name: "bw", position: { left: 810, top: 420 }, size: { width: 360, height: 250 }, collapsed: false },
};
const WINDOWS_STATE_KEY = "polyprocessing_windows_state_v1";
// ============================================================
// Shaders
// ============================================================
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
const FS_DOF_BLUR = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform sampler2D uDepth;
uniform vec2 uTexel;
uniform float uBlurRadius;
uniform float uFocalDistance;
uniform float uAperture;
uniform float uNear;
uniform float uFar;
out vec4 outColor;

// Poisson disk samples for circular bokeh (16 samples)
const vec2 poissonDisk[16] = vec2[](
  vec2(-0.326, -0.406), vec2(-0.840, -0.074),
  vec2(-0.696,  0.457), vec2(-0.203,  0.621),
  vec2( 0.962, -0.195), vec2( 0.473, -0.480),
  vec2( 0.519,  0.767), vec2( 0.740, -0.555),
  vec2( 0.280,  0.200), vec2( 0.353,  0.814),
  vec2( 0.119, -0.945), vec2( 0.957,  0.838),
  vec2(-0.500, -0.800), vec2( 0.200,  0.900),
  vec2(-0.900,  0.400), vec2( 0.600, -0.300)
);

// Properly linearize NDC depth to scene units using near/far planes
float linearizeDepth(float ndcDepth) {
  return (2.0 * uNear * uFar) / (uFar + uNear - (ndcDepth * 2.0 - 1.0) * (uFar - uNear));
}

void main() {
  vec3 col = texture(uTex, vUV).rgb;

  // Read NDC depth and convert to true linear scene distance (in scene units)
  float ndcDepth = texture(uDepth, vUV).r;
  float sceneDepth = linearizeDepth(ndcDepth);

  // Circle of confusion: blur based on distance from focal plane (in scene units)
  // Aperture controls how quickly blur grows away from the focal plane
  float depthDiff = abs(sceneDepth - uFocalDistance);
  float coc = (depthDiff / uFocalDistance) * uAperture;
  coc = max(0.0, min(coc, uBlurRadius));

  // Early exit if no blur needed
  if (coc < 0.01) {
    outColor = vec4(col, 1.0);
    return;
  }

  vec3 acc = col * 0.2;
  float weight = 0.2;

  // Circular bokeh blur sampling
  for (int i = 0; i < 16; i++) {
    vec2 offset = poissonDisk[i] * uTexel * coc * 3.0;
    vec3 samp = texture(uTex, vUV + offset).rgb;
    acc += samp;
    weight += 1.0;
  }

  outColor = vec4(acc / weight, 1.0);
}
`;
// Depth map visualisation — linearises NDC depth and outputs greyscale.
// near=white (1.0), far=black (0.0) — standard depth-map convention.
// Depth textures require highp precision; TEXTURE_COMPARE_MODE must be NONE so
// the texture is treated as sampler2D rather than sampler2DShadow.
// ============================================================
// Utility
// ============================================================
function clamp01(x) {
    const n = +x;
    if (!Number.isFinite(n))
        return 0;
    return Math.max(0, Math.min(1, n));
}
function safeNum(x, fallback) {
    const n = typeof x === "string" ? Number(x) : +x;
    return Number.isFinite(n) ? n : fallback;
}
function sanitizeSettings(raw) {
    const s = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
    s.fxEnabled = !!s.fxEnabled;
    s.invert = !!s.invert;
    s.debugCorner = !!s.debugCorner;
    s.exposure = safeNum(s.exposure, 1.0);
    s.contrast = safeNum(s.contrast, 1.0);
    s.saturation = safeNum(s.saturation, 1.0);
    s.gamma = safeNum(s.gamma, 1.0);
    if (!Array.isArray(s.tint) || s.tint.length !== 3)
        s.tint = [1, 1, 1];
    s.tint = [safeNum(s.tint[0], 1.0), safeNum(s.tint[1], 1.0), safeNum(s.tint[2], 1.0)];
    s.tintStrength = clamp01(safeNum(s.tintStrength, 0.0));
    s.useLUT = !!s.useLUT;
    s.lutStrength = clamp01(safeNum(s.lutStrength, 1.0));
    const ls = String(s.lutSpace ?? "afterGamma");
    s.lutSpace = ["afterGamma", "beforeGamma", "srgb"].includes(ls)
        ? ls
        : "afterGamma";
    // GUI uses "auto" | "hardware" | "manual"; runtime uses "fast" | "hq"
    const sampStr = String(s.lutSampling ?? "fast");
    if (sampStr === "auto" || sampStr === "hardware" || sampStr === "fast") {
        s.lutSampling = "fast";
    }
    else if (sampStr === "manual" || sampStr === "hq") {
        s.lutSampling = "hq";
    }
    else {
        s.lutSampling = "fast";
    }
    const tm = String(s.tonemapper ?? "none");
    s.tonemapper = ["none", "reinhard", "aces", "hable"].includes(tm)
        ? tm
        : "none";
    s.bloomEnabled = !!s.bloomEnabled;
    s.bloomStrength = clamp01(safeNum(s.bloomStrength, 0.35));
    s.bloomThreshold = safeNum(s.bloomThreshold, 1.0);
    s.bloomRadius = safeNum(s.bloomRadius, 1.0);
    s.dofEnabled = !!s.dofEnabled;
    s.dofRadius = Math.max(0.0, safeNum(s.dofRadius, 5.0));
    s.dofFocalDistance = Math.max(0.0, safeNum(s.dofFocalDistance, 20.0));
    s.dofAperture = Math.max(0.0, safeNum(s.dofAperture, 1.0));
    s.dofNear = Math.max(0.01, safeNum(s.dofNear, 0.5));
    s.dofFar = Math.max(s.dofNear + 1.0, safeNum(s.dofFar, 500.0));
    s.grayscale = !!s.grayscale;
    s.bw = !!s.bw;
    s.bwThreshold = clamp01(safeNum(s.bwThreshold, 0.5));
    return s;
}
// ============================================================
// Settings Storage
// ============================================================
function loadSettings() {
    try {
        const txt = localStorage.getItem(SETTINGS_KEY);
        if (!txt)
            return { ...DEFAULT_SETTINGS };
        const obj = JSON.parse(txt);
        if (!obj || typeof obj !== "object" || Array.isArray(obj))
            return { ...DEFAULT_SETTINGS };
        return sanitizeSettings(obj);
    }
    catch {
        return { ...DEFAULT_SETTINGS };
    }
}
function saveSettings(obj) {
    const s = sanitizeSettings(obj);
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    }
    catch { /* storage full or unavailable */ }
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
// ============================================================
// Global API bootstrap
// ============================================================
if (!globalThis.__polyprocessingInstalled) {
    globalThis.__polyprocessingInstalled = true;
    console.log("[PolyProcessing] Runtime installed");
    globalThis.__ppSettingsVersion = globalThis.__ppSettingsVersion ?? 0;
    // Initialise settings from storage on first load
    globalThis.__ppSettings = loadSettings();
    // Legacy globals mirror — kept for console-tweaking convenience
    globalThis.__ppMirrorSettingsToLegacyGlobals = (s) => {
        return sanitizeSettings(s);
    };
    globalThis.__ppRequestOneFrame = () => {
        const gl = globalThis.__xenonGetGL?.();
        if (!gl)
            return false;
        gl.__ppForceDrawOnce = true;
        return true;
    };
    globalThis.__ppGetSavedSettings = () => loadSettings();
    globalThis.__ppSetSavedSettings = (s) => applySettingsPermanently(s);
    globalThis.__ppResetSavedSettings = () => applySettingsPermanently(DEFAULT_SETTINGS);
}
// ============================================================
// IndexedDB — LUT storage
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
            if (!db.objectStoreNames.contains(LUT_STORE))
                db.createObjectStore(LUT_STORE);
            if (!db.objectStoreNames.contains("preset"))
                db.createObjectStore("preset");
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
// ============================================================
// LUT Utilities
// ============================================================
function makeImageFromBytes(bytes, mime = "image/png") {
    return new Promise((resolve, reject) => {
        const blob = new Blob([bytes], { type: mime });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
        img.src = url;
    });
}
function uploadLUTTexture(gl, img) {
    if (!gl.__ppLutTex)
        gl.__ppLutTex = gl.createTexture();
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
    if (!gl.__ppLutTex)
        gl.__ppLutTex = gl.createTexture();
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
    if (w === 256 && h === 16)
        return { kind: "strip256x16", size: 16, quality: "low", source: "png" };
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
        if (!gl)
            return false;
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
        if (!pngBytes)
            return false;
        const img = await makeImageFromBytes(pngBytes);
        uploadLUTTexture(gl, img);
        const meta = guessLUTFromImageSize(img.width, img.height);
        gl.__ppLutMeta = meta ?? { kind: "unknown", size: 0, quality: "unknown", source: "png" };
        console.log("[PolyProcessing] LUT loaded from IndexedDB (image)", meta);
        return true;
    }
    catch (e) {
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
    if (!size || size < 2)
        throw new Error("Invalid .cube: missing LUT_3D_SIZE");
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
                out[idx + 0] = Math.max(0, Math.min(255, (cube.table[src + 0] * 255) | 0));
                out[idx + 1] = Math.max(0, Math.min(255, (cube.table[src + 1] * 255) | 0));
                out[idx + 2] = Math.max(0, Math.min(255, (cube.table[src + 2] * 255) | 0));
                out[idx + 3] = 255;
            }
        }
    }
    return { width, height, bytes: out, size: N };
}
// Public LUT API
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
    if (!file)
        return false;
    const name = file.name.toLowerCase();
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (name.endsWith(".cube")) {
        const cube = parseCubeText(new TextDecoder().decode(bytes));
        const packed = cubeToPacked2D_RGBA8(cube);
        const header = new Uint8Array(16);
        header.set([77, 76, 85, 84]); // "MLUT"
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
    if (bin && bin.byteLength > 0)
        return { type: "bin", bytes: bin };
    const png = await idbGet(LUT_KEY_PNG);
    if (png && png.byteLength > 0)
        return { type: "png", bytes: png };
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
    }
    catch (e) {
        console.warn("[PolyProcessing] Failed to import LUT bytes:", e);
        return false;
    }
};
// ============================================================
// WebGL shader helpers
// ============================================================
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
    if (!vs || !fs)
        return null;
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
// ============================================================
// FX Pipeline
// ============================================================
function ensurePostFx(gl) {
    if (gl.__ppFxReady)
        return true;
    const prog = linkProgram(gl, VS_FULLSCREEN, FS_FX);
    if (!prog)
        return false;
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
// Bloom Pipeline
// ============================================================
function ensureBloom(gl) {
    if (gl.__ppBloomReady)
        return true;
    const prefilterProg = linkProgram(gl, VS_FULLSCREEN, FS_BLOOM_PREFILTER);
    const blurProg = linkProgram(gl, VS_FULLSCREEN, FS_BLOOM_BLUR);
    if (!prefilterProg || !blurProg)
        return false;
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
    const w = (gl.drawingBufferWidth / 2) | 0;
    const h = (gl.drawingBufferHeight / 2) | 0;
    if (w <= 0 || h <= 0)
        return false;
    if (gl.__ppBloomW === w && gl.__ppBloomH === h)
        return true;
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
    if (!ensureBloom(gl) || !ensureBloomTargets(gl))
        return false;
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
    // Horizontal blur
    gl.bindFramebuffer(gl.FRAMEBUFFER, gl.__ppBloomFboB);
    gl.useProgram(blur);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, gl.__ppBloomTexA);
    gl.uniform1i(uloc(gl, blur, "uTex"), 0);
    gl.uniform2f(uloc(gl, blur, "uTexel"), 1.0 / gl.__ppBloomW, 1.0 / gl.__ppBloomH);
    gl.uniform2f(uloc(gl, blur, "uDir"), 1.0, 0.0);
    gl.uniform1f(uloc(gl, blur, "uRadius"), radius);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // Vertical blur
    gl.bindFramebuffer(gl.FRAMEBUFFER, gl.__ppBloomFboA);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, gl.__ppBloomTexB);
    gl.uniform2f(uloc(gl, blur, "uDir"), 0.0, 1.0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return true;
}
// ============================================================
// DOF Pipeline
// ============================================================
function ensureDOF(gl) {
    if (gl.__ppDOFReady)
        return true;
    const dofProg = linkProgram(gl, VS_FULLSCREEN, FS_DOF_BLUR);
    if (!dofProg)
        return false;
    gl.__ppDOFProg = dofProg;
    gl.__ppDOFVAO = gl.createVertexArray();
    gl.__ppDOFTexA = gl.createTexture();
    gl.__ppDOFFboA = gl.createFramebuffer();
    gl.__ppDOFDepthTex = gl.createTexture();
    gl.__ppDOFDepthFbo = gl.createFramebuffer();
    gl.__ppDOFW = 0;
    gl.__ppDOFH = 0;
    gl.__ppDOFReady = true;
    console.log("[PolyProcessing] DOF pipeline ready");
    return true;
}
function ensureDOFTargets(gl) {
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    if (w <= 0 || h <= 0)
        return false;
    if (gl.__ppDOFW === w && gl.__ppDOFH === h)
        return true;
    gl.__ppDOFW = w;
    gl.__ppDOFH = h;
    // Output color texture
    gl.bindTexture(gl.TEXTURE_2D, gl.__ppDOFTexA);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, gl.__ppDOFFboA);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, gl.__ppDOFTexA, 0);
    // Depth texture for reading game depth
    gl.bindTexture(gl.TEXTURE_2D, gl.__ppDOFDepthTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, gl.__ppDOFDepthFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, gl.__ppDOFDepthTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    console.log("[PolyProcessing] DOF targets resized:", { w, h });
    return true;
}
function captureDepthForDOF(gl) {
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    if (w <= 0 || h <= 0)
        return false;
    if (!ensureDOFTargets(gl))
        return false;
    // Blit depth from default framebuffer to our depth texture
    const savedReadFb = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
    const savedDrawFb = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, gl.__ppDOFDepthFbo);
    gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, savedReadFb);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, savedDrawFb);
    return true;
}
function renderDOF(gl) {
    if (!ensureDOF(gl) || !ensureDOFTargets(gl))
        return false;
    const s = getSettings();
    // Capture depth from the game's framebuffer
    captureDepthForDOF(gl);
    const prog = gl.__ppDOFProg;
    // Bind output framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, gl.__ppDOFFboA);
    gl.viewport(0, 0, gl.__ppDOFW, gl.__ppDOFH);
    gl.useProgram(prog);
    gl.bindVertexArray(gl.__ppDOFVAO);
    // Bind source color texture (unit 0)
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, gl.__ppFxTex);
    gl.uniform1i(uloc(gl, prog, "uTex"), 0);
    // Bind depth texture (unit 1)
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, gl.__ppDOFDepthTex);
    gl.uniform1i(uloc(gl, prog, "uDepth"), 1);
    // Set parameters
    gl.uniform2f(uloc(gl, prog, "uTexel"), 1.0 / gl.__ppDOFW, 1.0 / gl.__ppDOFH);
    gl.uniform1f(uloc(gl, prog, "uBlurRadius"), Math.max(0.0, s.dofRadius));
    gl.uniform1f(uloc(gl, prog, "uFocalDistance"), Math.max(0.01, s.dofFocalDistance));
    gl.uniform1f(uloc(gl, prog, "uAperture"), Math.max(0.0, s.dofAperture));
    gl.uniform1f(uloc(gl, prog, "uNear"), Math.max(0.01, s.dofNear));
    gl.uniform1f(uloc(gl, prog, "uFar"), Math.max(s.dofNear + 1.0, s.dofFar));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return true;
}
// ============================================================
// Screen Capture
// ============================================================
function grabScreen(gl) {
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    if (w <= 0 || h <= 0)
        return false;
    gl.bindTexture(gl.TEXTURE_2D, gl.__ppFxTex);
    if (gl.__ppFxTexW !== w || gl.__ppFxTexH !== h) {
        gl.__ppFxTexW = w;
        gl.__ppFxTexH = h;
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, w, h);
    // NOTE: texture left bound on TEXTURE0 — the caller (drawPostFx) will restore the
    // original binding on the way out, so no unbind needed here.
    return true;
}
// ============================================================
// Post-FX Draw
// ============================================================
function drawPostFx(gl) {
    const s = getSettings();
    if (!s.fxEnabled)
        return;
    if (!ensurePostFx(gl))
        return;
    if (gl.__ppFxDrawing)
        return;
    gl.__ppFxDrawing = true;
    try {
        // Save the full WebGL texture state BEFORE any of our operations.
        // Three.js maintains its own internal state cache for texture bindings —
        // if we null-unbind textures that Three.js thinks are still bound, it will
        // skip the actual gl.bindTexture calls next frame (cache hit), leaving
        // those units pointing at null. CSM shadow map cascades are especially
        // vulnerable because each cascade uses a distinct texture unit; nulling
        // units 0-2 breaks shadow lookups on the next frame, producing the
        // "everything in shadow past the first cascade" artifact.
        // Fix: restore exact bindings on the way out instead of unbinding to null.
        const savedActiveTexture = gl.getParameter(gl.ACTIVE_TEXTURE);
        gl.activeTexture(gl.TEXTURE0);
        const savedTex0 = gl.getParameter(gl.TEXTURE_BINDING_2D);
        gl.activeTexture(gl.TEXTURE1);
        const savedTex1 = gl.getParameter(gl.TEXTURE_BINDING_2D);
        gl.activeTexture(gl.TEXTURE2);
        const savedTex2 = gl.getParameter(gl.TEXTURE_BINDING_2D);
        gl.activeTexture(savedActiveTexture);
        const savedViewport = gl.getParameter(gl.VIEWPORT);
        if (!grabScreen(gl))
            return;
        if (s.bloomEnabled)
            renderBloom(gl);
        if (s.dofEnabled) {
            renderDOF(gl);
            // Swap textures: DOF output becomes input for next stage
            const temp = gl.__ppFxTex;
            gl.__ppFxTex = gl.__ppDOFTexA;
            gl.__ppDOFTexA = temp;
            gl.__ppDOFTextureSwapped = true;
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
        if (oldBlend)
            gl.disable(gl.BLEND);
        const prog = gl.__ppFxProg;
        gl.useProgram(prog);
        gl.bindVertexArray(gl.__ppFxVAO);
        // Screen texture — unit 0
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, gl.__ppFxTex);
        gl.uniform1i(uloc(gl, prog, "uTex"), 0);
        // Grading uniforms
        gl.uniform1f(uloc(gl, prog, "uExposure"), s.exposure);
        gl.uniform1f(uloc(gl, prog, "uContrast"), s.contrast);
        gl.uniform1f(uloc(gl, prog, "uSaturation"), s.saturation);
        gl.uniform1f(uloc(gl, prog, "uGamma"), s.gamma);
        gl.uniform1f(uloc(gl, prog, "uInvert"), s.invert ? 1.0 : 0.0);
        gl.uniform3f(uloc(gl, prog, "uTint"), s.tint[0], s.tint[1], s.tint[2]);
        gl.uniform1f(uloc(gl, prog, "uTintStrength"), s.tintStrength);
        gl.uniform1i(uloc(gl, prog, "uDebugCorner"), s.debugCorner ? 1 : 0);
        // Tonemapper
        const tmMode = { none: 0, reinhard: 1, aces: 2, hable: 3 }[s.tonemapper] ?? 0;
        gl.uniform1i(uloc(gl, prog, "uTonemapper"), tmMode);
        // LUT — unit 1
        const canUseLUT = s.useLUT && !!gl.__ppLutReady && !!gl.__ppLutTex && (gl.__ppLutW ?? 0) > 0 && (gl.__ppLutH ?? 0) > 0;
        gl.uniform1i(uloc(gl, prog, "uUseLUT"), canUseLUT ? 1 : 0);
        if (canUseLUT) {
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, gl.__ppLutTex);
            gl.uniform1i(uloc(gl, prog, "uLUT"), 1);
            gl.uniform1f(uloc(gl, prog, "uLUTStrength"), s.lutStrength);
        }
        else {
            gl.uniform1f(uloc(gl, prog, "uLUTStrength"), 0.0);
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
        // Bloom — unit 2
        const bloomActive = s.bloomEnabled && !!gl.__ppBloomReady && !!gl.__ppBloomTexA;
        gl.uniform1i(uloc(gl, prog, "uBloomEnabled"), bloomActive ? 1 : 0);
        if (bloomActive) {
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, gl.__ppBloomTexA);
            gl.uniform1i(uloc(gl, prog, "uBloomTex"), 2);
            gl.uniform1f(uloc(gl, prog, "uBloomStrength"), clamp01(s.bloomStrength));
        }
        else {
            gl.uniform1f(uloc(gl, prog, "uBloomStrength"), 0.0);
        }
        // Greyscale / B&W
        gl.uniform1i(uloc(gl, prog, "uGrayscale"), s.grayscale ? 1 : 0);
        gl.uniform1i(uloc(gl, prog, "uBW"), s.bw ? 1 : 0);
        gl.uniform1f(uloc(gl, prog, "uBWThreshold"), s.bwThreshold);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        // Restore render pipeline state
        gl.bindVertexArray(oldVAO);
        gl.useProgram(oldProg);
        gl.bindFramebuffer(gl.FRAMEBUFFER, oldFB);
        if (oldBlend)
            gl.enable(gl.BLEND);
        if (oldDepth)
            gl.enable(gl.DEPTH_TEST);
        if (oldCull)
            gl.enable(gl.CULL_FACE);
        // Restore texture bindings exactly — do NOT unbind to null.
        // Three.js caches which texture is bound to each unit and skips redundant
        // gl.bindTexture calls. If we null them out, Three.js will believe the original
        // textures are still bound and will not rebind them next frame, causing shadow
        // maps and other textures to read from null samplers.
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, savedTex2);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, savedTex1);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, savedTex0);
        gl.activeTexture(savedActiveTexture);
        // Restore viewport (Three.js sets per-target viewports; leaving ours active
        // can confuse its state cache on the next render target switch).
        gl.viewport(savedViewport[0], savedViewport[1], savedViewport[2], savedViewport[3]);
    }
    finally {
        gl.__ppFxDrawing = false;
        // Swap back DOF textures if they were swapped for this frame
        // This ensures __ppFxTex is always the screen capture buffer for the next frame
        if (gl.__ppDOFTextureSwapped) {
            const temp = gl.__ppFxTex;
            gl.__ppFxTex = gl.__ppDOFTexA;
            gl.__ppDOFTexA = temp;
            gl.__ppDOFTextureSwapped = false;
        }
    }
}
// ============================================================
// RAF Hook — end-of-frame, runs once per tick
// ============================================================
const origRAF = globalThis.requestAnimationFrame.bind(globalThis);
globalThis.__ppRafTick = globalThis.__ppRafTick ?? 0;
globalThis.requestAnimationFrame = function (cb) {
    return origRAF(function (t) {
        globalThis.__ppRafTick++;
        cb(t);
        const gl = globalThis.__xenonGetGL?.();
        if (!gl)
            return;
        // Guard: only apply FX once per tick even if multiple RAF callbacks fire
        if (gl.__ppLastAppliedTick === globalThis.__ppRafTick)
            return;
        gl.__ppLastAppliedTick = globalThis.__ppRafTick;
        drawPostFx(gl);
        // Allows GUI and console tweaks to force an immediate redraw
        if (gl.__ppForceDrawOnce) {
            gl.__ppForceDrawOnce = false;
            drawPostFx(gl);
        }
    });
};
console.log("[PolyProcessing] Hooked requestAnimationFrame");
// ============================================================
// GUI CSS — custom slider/select rows injected into Polymgui windows
// ============================================================
function injectCSS() {
    if (document.querySelector("style[data-polyprocessing-gui]"))
        return;
    const style = document.createElement("style");
    style.dataset.polyprocessingGui = "1";
    style.textContent = `
    .pp-win-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 0;
      margin: 2px 0;
    }
    .pp-win-label {
      font-size: 12px;
      opacity: 0.9;
      flex: 0 0 auto;
      min-width: 120px;
    }
    .pp-win-slider-group {
      display: flex;
      align-items: center;
      gap: 6px;
      flex: 1;
    }
    .pp-win-slider {
      flex: 1;
      height: 6px;
      margin: 0;
      cursor: pointer;
      appearance: none;
      -webkit-appearance: none;
      background: linear-gradient(to right, #1a1a2e, #16213e);
      border: 1px solid #0f3460;
      border-radius: 3px;
      outline: none;
    }
    .pp-win-slider::-webkit-slider-thumb {
      appearance: none;
      -webkit-appearance: none;
      width: 12px;
      height: 12px;
      border-radius: 2px;
      background: linear-gradient(135deg, #00d4ff, #0099cc);
      cursor: pointer;
      border: 1px solid #0066aa;
      box-shadow: 0 0 4px rgba(0, 212, 255, 0.5);
    }
    .pp-win-slider::-moz-range-thumb {
      width: 12px;
      height: 12px;
      border-radius: 2px;
      background: linear-gradient(135deg, #00d4ff, #0099cc);
      cursor: pointer;
      border: 1px solid #0066aa;
      box-shadow: 0 0 4px rgba(0, 212, 255, 0.5);
    }
    .pp-win-slider::-moz-range-track {
      background: transparent;
      border: none;
    }
    .pp-win-input {
      width: 50px;
      padding: 2px 4px;
      font-size: 11px;
      background: #1a1a2e;
      color: #00d4ff;
      border: 1px solid #0f3460;
      border-radius: 3px;
      text-align: right;
      font-family: monospace;
    }
    .pp-win-input:focus {
      outline: none;
      border-color: #00d4ff;
      box-shadow: 0 0 4px rgba(0, 212, 255, 0.3);
    }
    .pp-win-select {
      width: 100%; padding: 2px 6px; font-size: 12px;
      border-radius: 4px; background: #1a1a2e;
      color: #00d4ff;
      border: 1px solid #0f3460;
    }
  `;
    document.head.appendChild(style);
}
// ============================================================
// Window state persistence
// ============================================================
function getWindowsState() {
    try {
        const stored = localStorage.getItem(WINDOWS_STATE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            // Merge with defaults to handle missing windows
            return { ...DEFAULT_WINDOWS_STATE, ...parsed };
        }
    }
    catch (e) {
        console.warn("[PolyProcessing] Failed to load window state:", e);
    }
    return { ...DEFAULT_WINDOWS_STATE };
}
function saveWindowsState(state) {
    try {
        localStorage.setItem(WINDOWS_STATE_KEY, JSON.stringify(state));
    }
    catch (e) {
        console.warn("[PolyProcessing] Failed to save window state:", e);
    }
}
function debounce(fn, delay) {
    let timeoutId = null;
    return ((...args) => {
        if (timeoutId !== null)
            clearTimeout(timeoutId);
        timeoutId = window.setTimeout(() => fn(...args), delay);
    });
}
function applyWindowState(element, state) {
    const el = element;
    el.style.left = `${state.position.left}px`;
    el.style.top = `${state.position.top}px`;
    el.style.width = `${state.size.width}px`;
    el.style.height = `${state.size.height}px`;
}
function captureWindowState(element) {
    const el = element;
    const style = window.getComputedStyle(el);
    const name = el.dataset.windowName || "unknown";
    return {
        name,
        position: {
            left: parseInt(style.left) || 0,
            top: parseInt(style.top) || 0,
        },
        size: {
            width: parseInt(style.width) || 400,
            height: parseInt(style.height) || 400,
        },
        collapsed: el.dataset.collapsed === "true",
    };
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
// ============================================================
// GUI State
// ============================================================
let current = loadSettings();
let saveTimer = null;
function flush(save = true) {
    globalThis.__ppSettings = sanitizeSettings(current);
    globalThis.__ppSettingsVersion = (globalThis.__ppSettingsVersion ?? 0) + 1;
    globalThis.__ppRequestOneFrame?.();
    if (!save)
        return;
    if (saveTimer)
        clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { applySettingsPermanently(current); }, 120);
}
function refreshUIFromSettings() {
    current = loadSettings();
    flush(false);
}
// ============================================================
// Preset actions
// ============================================================
async function exportPreset() {
    const settings = loadSettings();
    const presetName = prompt("Preset Name:", "My Preset");
    if (presetName === null)
        return;
    const author = prompt("Author:", "");
    if (author === null)
        return;
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
    }
    else {
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
    a.download = `${presetName.replace(/\s+/g, "_")}_${new Date().toISOString().replace(/[:.]/g, "-")}.polypreset`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    console.log("[PolyProcessing] Preset exported:", presetName, "by", author);
}
async function importPreset() {
    const file = await pickFile(".polypreset");
    if (!file)
        return;
    const buf = await file.arrayBuffer();
    const view = new DataView(buf);
    const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    if (magic !== "PPST")
        throw new Error("Invalid preset file: bad magic number");
    if (view.getUint16(4, true) !== 1)
        throw new Error("Unsupported preset version");
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
}
async function clearAndReset() {
    applySettingsPermanently(DEFAULT_SETTINGS);
    await globalThis.__ppClearLUT?.();
    globalThis.__ppCurrentPresetName = null;
    globalThis.__ppCurrentPresetAuthor = null;
    refreshUIFromSettings();
}
// ============================================================
// Polymgui widget helpers
// These inject custom HTML into a PolymGUI window body (ui.root)
// because Polymgui does not have built-in slider or select widgets.
// ============================================================
function ppSlider(ui, label, min, max, step, get, set) {
    const row = document.createElement("div");
    row.className = "pp-win-row";
    const lbl = document.createElement("span");
    lbl.className = "pp-win-label";
    lbl.textContent = label;
    const sliderGroup = document.createElement("div");
    sliderGroup.className = "pp-win-slider-group";
    const range = document.createElement("input");
    range.type = "range";
    range.className = "pp-win-slider";
    range.min = String(min);
    range.max = String(max);
    range.step = String(step);
    range.value = String(get());
    const input = document.createElement("input");
    input.type = "text";
    input.className = "pp-win-input";
    input.value = get().toFixed(2);
    const updateValue = (v) => {
        const clamped = Math.max(min, Math.min(max, v));
        set(clamped);
        range.value = String(clamped);
        input.value = clamped.toFixed(2);
    };
    range.oninput = () => {
        const v = Number(range.value);
        updateValue(v);
        flush(false);
    };
    range.onchange = () => flush(true);
    input.onchange = () => {
        const v = Number(input.value);
        if (!isNaN(v)) {
            updateValue(v);
            flush(true);
        }
        else {
            input.value = get().toFixed(2);
        }
    };
    input.onfocus = () => input.select();
    sliderGroup.appendChild(range);
    sliderGroup.appendChild(input);
    row.appendChild(lbl);
    row.appendChild(sliderGroup);
    ui.root.appendChild(row);
}
function ppSelect(ui, label, options, get, set) {
    const row = document.createElement("div");
    row.className = "pp-win-row";
    const lbl = document.createElement("span");
    lbl.className = "pp-win-label";
    lbl.textContent = label;
    const sel = document.createElement("select");
    sel.className = "pp-win-select";
    for (const { title, value } of options) {
        const o = document.createElement("option");
        o.value = value;
        o.textContent = title;
        sel.appendChild(o);
    }
    sel.value = get();
    sel.onchange = () => { set(sel.value); flush(); };
    row.appendChild(lbl);
    row.appendChild(sel);
    row.appendChild(document.createElement("span")); // value column spacer
    ui.root.appendChild(row);
}
function ppCheckbox(ui, label, get, set) {
    const cb = ui.checkbox(label, "end");
    cb.target.checked = get();
    cb.target.addEventListener("change", () => {
        set(cb.target.checked);
        flush();
    });
}
// ============================================================
// PolyProcessing windows
// ============================================================
function openHubWindow(guiRoot, savedState) {
    const node = guiRoot.window("PolyProcessing");
    const el = node.root;
    el.dataset.windowName = "hub";
    applyWindowState(el, savedState);
    return node.then((ui) => {
        ui.label("Shift+P · toggle panels");
        ui.space("4px");
        ppCheckbox(ui, "FX Enabled", () => current.fxEnabled, (v) => { current.fxEnabled = v; });
        ui.separator();
        ui.heading(2, "Effects");
        ui.space("4px");
        ppCheckbox(ui, "Bloom", () => current.bloomEnabled, (v) => { current.bloomEnabled = v; });
        ppCheckbox(ui, "Depth of Field", () => current.dofEnabled, (v) => { current.dofEnabled = v; });
        ppCheckbox(ui, "Use LUT", () => current.useLUT, (v) => { current.useLUT = v; });
        ppCheckbox(ui, "Grayscale", () => current.grayscale, (v) => { current.grayscale = v; });
        ui.separator();
        ui.heading(2, "Presets");
        ui.space("4px");
        const name = globalThis.__ppCurrentPresetName;
        const author = globalThis.__ppCurrentPresetAuthor;
        ui.label(name ? `Active: ${name}${author ? ` by ${author}` : ""}` : "No preset active");
        ui.space("4px");
        ui.button("Import Preset").clicked(() => void importPreset().catch((e) => alert(`Import failed:\n${e}`)));
        ui.button("Export Preset").clicked(() => void exportPreset().catch((e) => alert(`Export failed:\n${e}`)));
        ui.button("Reset to Defaults").clicked(() => void clearAndReset());
    });
}
function openColorGradingWindow(guiRoot, savedState) {
    const node = guiRoot.window("Color Grading");
    const el = node.root;
    el.dataset.windowName = "colorGrading";
    applyWindowState(el, savedState);
    return node.then((ui) => {
        ppSelect(ui, "Tonemapper", [{ title: "None", value: "none" },
            { title: "ACES", value: "aces" },
            { title: "Hable", value: "hable" },
            { title: "Reinhard", value: "reinhard" }], () => current.tonemapper, (v) => { current.tonemapper = v; });
        ppSlider(ui, "Exposure", 0.0, 3.0, 0.01, () => current.exposure, (v) => { current.exposure = v; });
        ppSlider(ui, "Contrast", 0.0, 3.0, 0.01, () => current.contrast, (v) => { current.contrast = v; });
        ppSlider(ui, "Saturation", 0.0, 3.0, 0.01, () => current.saturation, (v) => { current.saturation = v; });
        ppSlider(ui, "Gamma", 0.1, 4.0, 0.01, () => current.gamma, (v) => { current.gamma = v; });
        ppCheckbox(ui, "Invert", () => current.invert, (v) => { current.invert = v; });
        ui.separator();
        ui.heading(3, "Tint");
        ppSlider(ui, "Tint Strength", 0.0, 1.0, 0.01, () => current.tintStrength, (v) => { current.tintStrength = v; });
        ppSelect(ui, "Tint Preset", [{ title: "None", value: "[1,1,1]" },
            { title: "Warm", value: "[1.1,1.0,0.9]" },
            { title: "Cool", value: "[0.9,1.0,1.1]" },
            { title: "Purple", value: "[0.6,0.0,1.0]" },
            { title: "Green", value: "[0.9,1.1,0.9]" }], () => JSON.stringify(current.tint), (v) => {
            try {
                const arr = JSON.parse(v);
                if (Array.isArray(arr) && arr.length === 3)
                    current.tint = arr;
            }
            catch { /* bad JSON */ }
        });
    });
}
function openBloomWindow(guiRoot, savedState) {
    const node = guiRoot.window("Bloom");
    const el = node.root;
    el.dataset.windowName = "bloom";
    applyWindowState(el, savedState);
    return node.then((ui) => {
        ppCheckbox(ui, "Enabled", () => current.bloomEnabled, (v) => { current.bloomEnabled = v; });
        ppSlider(ui, "Strength", 0.0, 1.0, 0.01, () => current.bloomStrength, (v) => { current.bloomStrength = v; });
        ppSlider(ui, "Threshold", 0.0, 3.0, 0.01, () => current.bloomThreshold, (v) => { current.bloomThreshold = v; });
        ppSlider(ui, "Radius", 0.0, 3.0, 0.01, () => current.bloomRadius, (v) => { current.bloomRadius = v; });
    });
}
function openDOFWindow(guiRoot, savedState) {
    const node = guiRoot.window("Depth of Field");
    const el = node.root;
    el.dataset.windowName = "dof";
    applyWindowState(el, savedState);
    return node.then((ui) => {
        ppCheckbox(ui, "Enabled", () => current.dofEnabled, (v) => { current.dofEnabled = v; });
        ppSlider(ui, "Blur Radius", 0.0, 20.0, 0.5, () => current.dofRadius, (v) => { current.dofRadius = v; });
        ppSlider(ui, "Focal Distance", 0.1, 200.0, 0.5, () => current.dofFocalDistance, (v) => { current.dofFocalDistance = v; });
        ppSlider(ui, "Aperture", 0.0, 5.0, 0.1, () => current.dofAperture, (v) => { current.dofAperture = v; });
        ppSlider(ui, "Near Plane", 0.01, 10.0, 0.01, () => current.dofNear, (v) => { current.dofNear = v; });
        ppSlider(ui, "Far Plane", 10.0, 2000.0, 10.0, () => current.dofFar, (v) => { current.dofFar = v; });
    });
}
function openLUTWindow(guiRoot, savedState) {
    const node = guiRoot.window("LUT");
    const el = node.root;
    el.dataset.windowName = "lut";
    applyWindowState(el, savedState);
    return node.then((ui) => {
        ppCheckbox(ui, "Use LUT", () => current.useLUT, (v) => { current.useLUT = v; });
        ppSlider(ui, "Strength", 0.0, 1.0, 0.01, () => current.lutStrength, (v) => { current.lutStrength = v; });
        ppSelect(ui, "Sampling", [{ title: "Auto", value: "fast" },
            { title: "Hardware", value: "hardware" },
            { title: "Trilinear", value: "manual" }], () => current.lutSampling, (v) => { current.lutSampling = v; });
        ppSelect(ui, "LUT Space", [{ title: "After Gamma", value: "afterGamma" },
            { title: "Before Gamma", value: "beforeGamma" },
            { title: "sRGB", value: "srgb" }], () => current.lutSpace, (v) => { current.lutSpace = v; });
        ui.space("4px");
        ui.button("Pick LUT File").clicked(() => void globalThis.__ppPickLUT?.().then(() => globalThis.__ppRequestOneFrame?.()));
        ui.button("Clear LUT").clicked(() => void globalThis.__ppClearLUT?.().then(() => globalThis.__ppRequestOneFrame?.()));
    });
}
function openBWWindow(guiRoot, savedState) {
    const node = guiRoot.window("B&W / Greyscale");
    const el = node.root;
    el.dataset.windowName = "bw";
    applyWindowState(el, savedState);
    return node.then((ui) => {
        ppCheckbox(ui, "Greyscale", () => current.grayscale, (v) => { current.grayscale = v; if (v)
            current.bw = false; });
        ppCheckbox(ui, "B&W (Threshold)", () => current.bw, (v) => { current.bw = v; if (v)
            current.grayscale = false; });
        ppSlider(ui, "B&W Threshold", 0.0, 1.0, 0.01, () => current.bwThreshold, (v) => { current.bwThreshold = v; });
    });
}
// ============================================================
// PolyMod
// ============================================================
class PolyProcessing extends PolyMod {
    guiRoot = null;
    windows = { hub: null, colorGrading: null, bloom: null, dof: null, lut: null, bw: null };
    windowObserver = null;
    init = (pml) => {
        // Sync GL from Xenon; re-sync whenever Xenon detects a new context
        globalThis.__xenonRegisterContextCallback?.(() => {
            void tryLoadLUTFromIDB();
        });
        // Trigger LUT load if GL is already available
        if (globalThis.__xenonGetGL?.())
            void tryLoadLUTFromIDB();
        pml.registerBindCategory("PolyProcessing");
        pml.registerKeybind("Toggle PolyProcessing GUI while holding shift", "PolyProcessing_ToggleGUI", "keydown", "KeyP", null, (event) => {
            if (!event.shiftKey)
                return;
            event.preventDefault();
            globalThis.__ppToggleGUI?.();
        });
    };
    postInit = () => {
        this.guiRoot = new PolymGUI(document.body);
        this.installGUI();
        console.log("[PolyProcessing] GUI installed");
    };
    installGUI() {
        if (globalThis.__ppGUIInstalled)
            return;
        globalThis.__ppGUIInstalled = true;
        injectCSS();
        const guiRoot = this.guiRoot;
        // Toggle: open all windows, or close them if already open
        globalThis.__ppToggleGUI = () => {
            if (this.windows.hub && document.body.contains(this.windows.hub.el)) {
                // Close all windows
                [this.windows.hub, this.windows.colorGrading, this.windows.bloom,
                    this.windows.dof, this.windows.lut, this.windows.bw].forEach((w) => {
                    if (w?.el)
                        w.el.remove();
                });
                this.windows = { hub: null, colorGrading: null, bloom: null, dof: null, lut: null, bw: null };
                if (this.windowObserver) {
                    this.windowObserver.disconnect();
                    this.windowObserver = null;
                }
            }
            else {
                // Open all windows
                const currentState = getWindowsState();
                const hubNode = openHubWindow(guiRoot, currentState.hub);
                this.windows.hub = { node: hubNode, el: hubNode.root };
                const cgNode = openColorGradingWindow(guiRoot, currentState.colorGrading);
                this.windows.colorGrading = { node: cgNode, el: cgNode.root };
                const bloomNode = openBloomWindow(guiRoot, currentState.bloom);
                this.windows.bloom = { node: bloomNode, el: bloomNode.root };
                const dofNode = openDOFWindow(guiRoot, currentState.dof);
                this.windows.dof = { node: dofNode, el: dofNode.root };
                const lutNode = openLUTWindow(guiRoot, currentState.lut);
                this.windows.lut = { node: lutNode, el: lutNode.root };
                const bwNode = openBWWindow(guiRoot, currentState.bw);
                this.windows.bw = { node: bwNode, el: bwNode.root };
                this.observeWindowState();
            }
        };
        applySettingsPermanently(loadSettings());
    }
    observeWindowState() {
        const saveStateDebounced = debounce(() => {
            const newState = {};
            const windowEntries = [
                ["hub", this.windows.hub],
                ["colorGrading", this.windows.colorGrading],
                ["bloom", this.windows.bloom],
                ["dof", this.windows.dof],
                ["lut", this.windows.lut],
                ["bw", this.windows.bw],
            ];
            for (const [name, w] of windowEntries) {
                if (w?.el) {
                    newState[name] = captureWindowState(w.el);
                }
            }
            saveWindowsState(newState);
        }, 500);
        const observer = new MutationObserver(saveStateDebounced);
        const windowEntries = Object.values(this.windows).filter((w) => w?.el);
        for (const w of windowEntries) {
            if (w?.el) {
                observer.observe(w.el, { attributes: true, attributeFilter: ["style"] });
            }
        }
        this.windowObserver = observer;
    }
}
export const polyMod = new PolyProcessing();
