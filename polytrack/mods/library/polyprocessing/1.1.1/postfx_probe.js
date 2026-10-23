(() => {
  // Prevent double install
  if (globalThis.__polyprocessingInstalled) return;
  globalThis.__polyprocessingInstalled = true;

  console.log(
    "[PolyProcessing] Installed (ColorGrading + LUT + Bloom + settings via __ppSettings)",
  );

  const SETTINGS_KEY = "polyprocessing_settings";

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

    useLUT: true,
    lutStrength: 1.0,

    bloomEnabled: true,
    bloomStrength: 0.35,
    bloomThreshold: 1.0,
    bloomRadius: 1.0,

    tonemapper: "aces",
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
    s.debugCorner = !!s.debugCorner;

    s.exposure = safeNum(s.exposure, DEFAULT_SETTINGS.exposure);
    s.contrast = safeNum(s.contrast, DEFAULT_SETTINGS.contrast);
    s.saturation = safeNum(s.saturation, DEFAULT_SETTINGS.saturation);
    s.gamma = safeNum(s.gamma, DEFAULT_SETTINGS.gamma);

    if (typeof s.invert === "boolean") {
      // ok
    } else {
      s.invert = clamp01(safeNum(s.invert, 0.0)) >= 0.5;
    }

    if (!Array.isArray(s.tint) || s.tint.length !== 3) {
      s.tint = [...DEFAULT_SETTINGS.tint];
    }
    s.tint = [
      safeNum(s.tint[0], DEFAULT_SETTINGS.tint[0]),
      safeNum(s.tint[1], DEFAULT_SETTINGS.tint[1]),
      safeNum(s.tint[2], DEFAULT_SETTINGS.tint[2]),
    ];

    s.tintStrength = clamp01(
      safeNum(s.tintStrength, DEFAULT_SETTINGS.tintStrength),
    );

    s.useLUT = !!s.useLUT;
    s.lutStrength = clamp01(
      safeNum(s.lutStrength, DEFAULT_SETTINGS.lutStrength),
    );

    s.bloomEnabled = !!s.bloomEnabled;
    s.bloomStrength = clamp01(
      safeNum(s.bloomStrength, DEFAULT_SETTINGS.bloomStrength),
    );
    s.bloomThreshold = safeNum(
      s.bloomThreshold,
      DEFAULT_SETTINGS.bloomThreshold,
    );
    s.bloomRadius = safeNum(s.bloomRadius, DEFAULT_SETTINGS.bloomRadius);

    const tm = String(s.tonemapper || DEFAULT_SETTINGS.tonemapper);
    s.tonemapper = tm;

    return s;
  }

  function loadFallbackSettings() {
    try {
      const txt = localStorage.getItem(SETTINGS_KEY);
      if (!txt) return { ...DEFAULT_SETTINGS };

      const parsed = JSON.parse(txt);

      // IMPORTANT: parsed must be an object, not a string
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { ...DEFAULT_SETTINGS };
      }

      return sanitizeSettings(parsed);
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveFallbackSettings(obj) {
    const s = sanitizeSettings(obj);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch {}
    return s;
  }

  function getSettings() {
    if (
      globalThis.__ppSettings &&
      typeof globalThis.__ppSettings === "object"
    ) {
      return sanitizeSettings(globalThis.__ppSettings);
    }
    return loadFallbackSettings();
  }

  function mirrorSettingsToLegacyGlobals(s) {
    globalThis.__ppFxEnabled = !!s.fxEnabled;

    globalThis.__ppFxExposure = s.exposure;
    globalThis.__ppFxContrast = s.contrast;
    globalThis.__ppFxSaturation = s.saturation;
    globalThis.__ppFxGamma = s.gamma;

    globalThis.__ppFxInvert = s.invert ? 1.0 : 0.0;

    globalThis.__ppFxTint = s.tint;
    globalThis.__ppFxTintStrength = s.tintStrength;

    globalThis.__ppFxDebugCorner = !!s.debugCorner;

    globalThis.__ppFxUseLUT = !!s.useLUT;
    globalThis.__ppFxLUTStrength = s.lutStrength;

    globalThis.__ppFxBloomEnabled = !!s.bloomEnabled;
    globalThis.__ppFxBloomStrength = s.bloomStrength;
    globalThis.__ppFxBloomThreshold = s.bloomThreshold;
    globalThis.__ppFxBloomRadius = s.bloomRadius;

    globalThis.__ppFxTonemapper = String(s.tonemapper || "aces");
  }

  globalThis.__ppLoadSettings = function () {
    const s = loadFallbackSettings();
    globalThis.__ppSettings = s;
    mirrorSettingsToLegacyGlobals(s);
    console.log(
      "[PolyProcessing] Loaded fallback settings from LocalStorage:",
      s,
    );
    return s;
  };

  globalThis.__ppSaveSettings = function () {
    const s = getSettings();
    const hash = JSON.stringify(s);
    saveFallbackSettings(s);

    // Only mirror if settings changed (keeps __ppFx overrides alive)
    if (hash !== __ppLastMirroredHash) {
      __ppLastMirroredHash = hash;
      mirrorSettingsToLegacyGlobals(s);
    }

    console.log("[PolyProcessing] Saved settings to LocalStorage:", s);
    return s;
  };

  globalThis.__ppResetSettings = function () {
    const s = saveFallbackSettings(DEFAULT_SETTINGS);
    globalThis.__ppSettings = s;
    mirrorSettingsToLegacyGlobals(s);
    console.log("[PolyProcessing] Reset settings to defaults:", s);
    return s;
  };

  // Apply once
  {
    const s = getSettings();
    globalThis.__ppSettings = s;
    mirrorSettingsToLegacyGlobals(s);
  }

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

  function hookGL(gl, source) {
    if (!gl) return gl;
    if (gl.__ppGLHooked) return gl;

    gl.__ppGLHooked = true;
    globalThis.__ppGL = gl;
    globalThis.__ppGLSource = source;

    console.log("[PolyProcessing] Captured WebGL context:", source, gl);

    setTimeout(() => {
      tryLoadLUTFromIDB();
    }, 0);

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

  {
    let tries = 0;
    const maxTries = 120;
    const timer = setInterval(() => {
      tries++;

      if (globalThis.__ppGL) {
        clearInterval(timer);
        return;
      }

      const canvases = Array.from(document.querySelectorAll("canvas"));
      for (const canvas of canvases) {
        try {
          const gl2 = canvas.getContext("webgl2");
          if (gl2) {
            hookGL(gl2, "late-scan canvas.getContext(webgl2)");
            clearInterval(timer);
            return;
          }

          const gl =
            canvas.getContext("webgl") ||
            canvas.getContext("experimental-webgl");
          if (gl) {
            hookGL(gl, "late-scan canvas.getContext(webgl)");
            clearInterval(timer);
            return;
          }
        } catch {}
      }

      if (tries >= maxTries) {
        clearInterval(timer);
        console.warn(
          "[PolyProcessing] Failed to capture WebGL context (late-scan timed out).",
        );
      }
    }, 100);
  }

  // ============================================================
  // LUT persistence (IndexedDB)
  // ============================================================
  const LUT_DB = "polyprocessing_db";
  const LUT_STORE = "lut";
  const LUT_KEY = "active_lut_png";

  function idbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(LUT_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(LUT_STORE)) {
          db.createObjectStore(LUT_STORE);
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

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
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

  async function tryLoadLUTFromIDB() {
    try {
      const bytes = await idbGet(LUT_KEY);
      if (!bytes) return false;

      const gl = globalThis.__ppGL;
      if (!gl) return false;

      const img = await makeImageFromBytes(bytes);
      uploadLUTTexture(gl, img);

      console.log("[PolyProcessing] LUT loaded from IndexedDB");
      return true;
    } catch (e) {
      console.warn("[PolyProcessing] Failed to load LUT from IndexedDB:", e);
      return false;
    }
  }

  globalThis.__ppPickLUT = async function () {
    const gl = globalThis.__ppGL;
    if (!gl) {
      console.warn(
        "[PolyProcessing] No GL captured yet. Open the game first, then run __ppPickLUT().",
      );
      return false;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp";
    input.style.display = "none";
    document.body.appendChild(input);

    const file = await new Promise((resolve) => {
      input.onchange = () => resolve(input.files?.[0] || null);
      input.click();
    });

    document.body.removeChild(input);
    if (!file) return false;

    const bytes = new Uint8Array(await file.arrayBuffer());
    await idbPut(LUT_KEY, bytes);

    const img = await makeImageFromBytes(bytes, file.type || "image/png");
    uploadLUTTexture(gl, img);

    console.log("[PolyProcessing] LUT picked + saved:", file.name);
    return true;
  };

  globalThis.__ppClearLUT = async function () {
    await idbDel(LUT_KEY);
    const gl = globalThis.__ppGL;
    if (gl) gl.__ppLutReady = false;
    console.log("[PolyProcessing] LUT cleared from IndexedDB");
    return true;
  };

  globalThis.__ppExportLUTBytes = async function () {
    try {
      const bytes = await idbGet(LUT_KEY);
      if (!bytes) return null;
      return bytes;
    } catch {
      return null;
    }
  };

  globalThis.__ppImportLUTBytes = async function (bytes) {
    try {
      if (!bytes || !(bytes instanceof Uint8Array)) return false;

      await idbPut(LUT_KEY, bytes);

      const gl = globalThis.__ppGL;
      if (gl) {
        const img = await makeImageFromBytes(bytes);
        uploadLUTTexture(gl, img);
      }

      console.log("[PolyProcessing] LUT imported from preset");
      return true;
    } catch (e) {
      console.warn("[PolyProcessing] Failed to import LUT:", e);
      return false;
    }
  };

  // ============================================================
  // FX pipeline (grading + LUT + bloom composite)
  // ============================================================
  function ensurePostFx(gl) {
    if (gl.__ppFxReady) return true;
    if (!isWebGL2(gl)) {
      console.warn("[PolyProcessing] Not WebGL2 - cannot run FX.");
      return false;
    }

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
uniform int uTonemapper;
uniform float uInvert;
uniform vec3  uTint;
uniform float uTintStrength;
uniform int   uDebugCorner;

// LUT
uniform int   uUseLUT;
uniform sampler2D uLUT;
uniform float uLUTStrength;

// bloom
uniform int   uBloomEnabled;
uniform sampler2D uBloomTex;
uniform float uBloomStrength;

out vec4 outColor;

vec3 tmReinhard(vec3 x) { return x / (1.0 + x); }

vec3 tmACES(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

vec3 tmHable(vec3 x) {
  const float A = 0.15;
  const float B = 0.50;
  const float C = 0.10;
  const float D = 0.20;
  const float E = 0.02;
  const float F = 0.30;
  vec3 num = x * (A * x + C * B) + D * E;
  vec3 den = x * (A * x + B) + D * F;
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

vec3 sampleLUT(vec3 rgb) {
  rgb = clamp(rgb, 0.0, 1.0);

  float r = rgb.r * 15.0;
  float g = rgb.g * 15.0;
  float b = rgb.b * 15.0;

  float tile = floor(b + 0.5);
  float x = tile * 16.0 + r;
  float y = g;

  float u = (x + 0.5) / 256.0;
  float v = (y + 0.5) / 16.0;

  return texture(uLUT, vec2(u, v)).rgb;
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
    vec3 lut = sampleLUT(c);
    c = mix(c, lut, clamp(uLUTStrength, 0.0, 1.0));
  }

  if (uBloomEnabled == 1) {
    vec3 bloom = texture(uBloomTex, vUV).rgb;
    c += bloom * clamp(uBloomStrength, 0.0, 3.0);
  }

  if (uDebugCorner == 1) {
    if (vUV.x < 0.02 && vUV.y > 0.98) {
      c = vec3(1.0, 0.0, 1.0);
    }
  }

  outColor = vec4(c, 1.0);
}
`;

    function compile(type, src) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error(
          "[PolyProcessing] Shader error:",
          gl.getShaderInfoLog(sh),
        );
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

    console.log("[PolyProcessing] FX pipeline created");
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
        console.error(
          "[PolyProcessing] Bloom shader error:",
          gl.getShaderInfoLog(sh),
        );
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
        console.error(
          "[PolyProcessing] Bloom program link error:",
          gl.getProgramInfoLog(p),
        );
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

      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        w,
        h,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );

      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        tex,
        0,
      );
    }

    setupTex(gl.__ppBloomTexA, gl.__ppBloomFboA);
    setupTex(gl.__ppBloomTexB, gl.__ppBloomFboB);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    console.log("[PolyProcessing] Bloom targets resized:", { w, h });
    return true;
  }

  function renderBloom(gl) {
    if (!globalThis.__ppFxBloomEnabled) return false;
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
    gl.uniform1f(
      gl.getUniformLocation(gl.__ppBloomPrefilterProg, "uThreshold"),
      threshold,
    );

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
    gl.uniform1f(
      gl.getUniformLocation(gl.__ppBloomBlurProg, "uRadius"),
      radius,
    );

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, gl.__ppBloomFboA);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, gl.__ppBloomTexB);

    gl.uniform2f(gl.getUniformLocation(gl.__ppBloomBlurProg, "uDir"), 0.0, 1.0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return true;
  }

  // ============================================================
  // Capture screen texture
  // ============================================================
  function grabScreen(gl) {
    const w = gl.drawingBufferWidth | 0;
    const h = gl.drawingBufferHeight | 0;
    if (w <= 0 || h <= 0) return false;

    gl.bindTexture(gl.TEXTURE_2D, gl.__ppFxTex);

    if (gl.__ppFxTexW !== w || gl.__ppFxTexH !== h) {
      gl.__ppFxTexW = w;
      gl.__ppFxTexH = h;
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        w,
        h,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );
      console.log("[PolyProcessing] FX grab texture resized:", { w, h });
    }

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, w, h);

    gl.bindTexture(gl.TEXTURE_2D, null);
    return true;
  }

  // ============================================================
  // Draw full postFX pass
  // ============================================================
  function drawPostFx(gl) {
    const s = getSettings();
    mirrorSettingsToLegacyGlobals(s);

    if (!s.fxEnabled) return;
    if (!ensurePostFx(gl)) return;
    if (gl.__ppFxDrawing) return;

    gl.__ppFxDrawing = true;
    try {
      if (!grabScreen(gl)) return;

      renderBloom(gl);

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

      const exposure = safeNum(
        globalThis.__ppFxExposure,
        safeNum(s.exposure, 1.0),
      );
      const contrast = safeNum(
        globalThis.__ppFxContrast,
        safeNum(s.contrast, 1.0),
      );
      const saturation = safeNum(
        globalThis.__ppFxSaturation,
        safeNum(s.saturation, 1.0),
      );
      const gamma = safeNum(globalThis.__ppFxGamma, safeNum(s.gamma, 1.0));
      const invert = clamp01(
        safeNum(globalThis.__ppFxInvert, s.invert ? 1.0 : 0.0),
      );

      const tintArr = Array.isArray(globalThis.__ppFxTint)
        ? globalThis.__ppFxTint
        : Array.isArray(s.tint)
          ? s.tint
          : [1, 1, 1];

      const tintStrength = clamp01(
        safeNum(globalThis.__ppFxTintStrength, s.tintStrength),
      );

      const tint = [
        safeNum(tintArr[0], 1.0),
        safeNum(tintArr[1], 1.0),
        safeNum(tintArr[2], 1.0),
      ];
      const debugCorner = !!s.debugCorner;

      gl.uniform1f(gl.getUniformLocation(gl.__ppFxProg, "uExposure"), exposure);
      gl.uniform1f(gl.getUniformLocation(gl.__ppFxProg, "uContrast"), contrast);
      gl.uniform1f(
        gl.getUniformLocation(gl.__ppFxProg, "uSaturation"),
        saturation,
      );
      gl.uniform1f(gl.getUniformLocation(gl.__ppFxProg, "uGamma"), gamma);
      gl.uniform1f(gl.getUniformLocation(gl.__ppFxProg, "uInvert"), invert);

      gl.uniform3f(
        gl.getUniformLocation(gl.__ppFxProg, "uTint"),
        tint[0],
        tint[1],
        tint[2],
      );
      gl.uniform1f(
        gl.getUniformLocation(gl.__ppFxProg, "uTintStrength"),
        tintStrength,
      );

      gl.uniform1i(
        gl.getUniformLocation(gl.__ppFxProg, "uDebugCorner"),
        debugCorner ? 1 : 0,
      );

      const useLUT = !!globalThis.__ppFxUseLUT;
      const lutStrength = clamp01(
        safeNum(globalThis.__ppFxLUTStrength, s.lutStrength),
      );

      const canUseLUT =
        useLUT &&
        gl.__ppLutReady &&
        gl.__ppLutTex &&
        gl.__ppLutW > 0 &&
        gl.__ppLutH > 0;

      gl.uniform1i(
        gl.getUniformLocation(gl.__ppFxProg, "uUseLUT"),
        canUseLUT ? 1 : 0,
      );

      if (canUseLUT) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, gl.__ppLutTex);
        gl.uniform1i(gl.getUniformLocation(gl.__ppFxProg, "uLUT"), 1);
        gl.uniform1f(
          gl.getUniformLocation(gl.__ppFxProg, "uLUTStrength"),
          lutStrength,
        );
      } else {
        gl.uniform1f(gl.getUniformLocation(gl.__ppFxProg, "uLUTStrength"), 0.0);
      }

      const tmStr = String(s.tonemapper || "aces");
      let tmMode = 2;
      if (tmStr === "none") tmMode = 0;
      else if (tmStr === "reinhard") tmMode = 1;
      else if (tmStr === "aces") tmMode = 2;
      else if (tmStr === "hable") tmMode = 3;
      gl.uniform1i(gl.getUniformLocation(gl.__ppFxProg, "uTonemapper"), tmMode);

      const bloomEnabled =
        !!globalThis.__ppFxBloomEnabled && !!gl.__ppBloomReady;
      const bloomStrength = clamp01(
        safeNum(globalThis.__ppFxBloomStrength, s.bloomStrength),
      );

      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);

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
  // RAF Hook: run postfx AFTER the game draws each frame
  // ============================================================
  const origRAF = globalThis.requestAnimationFrame.bind(globalThis);
  globalThis.requestAnimationFrame = function (cb) {
    return origRAF(function (t) {
      cb(t);
      const gl = globalThis.__ppGL;
      if (gl) drawPostFx(gl);
    });
  };

  console.log(
    "[PolyProcessing] Hooked requestAnimationFrame for end-of-frame FX",
  );

  // ============================================================
  // Status
  // ============================================================
  globalThis.__ppStatus = function () {
    const gl = globalThis.__ppGL;
    const out = {
      glCaptured: !!gl,
      glSource: globalThis.__ppGLSource || null,

      fxReady: !!gl?.__ppFxReady,
      fxTexSize: gl?.__ppFxReady ? [gl.__ppFxTexW, gl.__ppFxTexH] : null,

      bloomReady: !!gl?.__ppBloomReady,
      bloomSize: gl?.__ppBloomReady ? [gl.__ppBloomW, gl.__ppBloomH] : null,

      lutLoaded: !!gl?.__ppLutReady,
      lutSize: !!gl?.__ppLutReady ? [gl.__ppLutW, gl.__ppLutH] : null,

      settings: globalThis.__ppSettings || null,
    };
    console.log("[PolyProcessing] Status:", out);
    return out;
  };

  console.log(
    "[PolyProcessing] Public API: __ppStatus(), __ppSaveSettings(), __ppLoadSettings(), __ppResetSettings(), __ppPickLUT(), __ppClearLUT()",
  );
})();
