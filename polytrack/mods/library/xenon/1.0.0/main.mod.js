import { PolyMod } from "../../../../PolyTypes.js";

/**
 * Xenon - GL Capture + RAF Hooks Library
 * 
 * Standalone library that:
 * - Detects and manages WebGL contexts
 * - Hooks requestAnimationFrame for end-of-frame effects
 * - Provides public API for other mods to use
 * 
 * Does NOT depend on or know about postfx_probe.js
 */

class Xenon extends PolyMod {
  preInit = () => {
    this.initGLCapture();
  };

  init = (pml) => {
    console.log("[Xenon] Initialized with PolyModLoader");
  };

  postInit = () => {
    console.log("[Xenon] Ready");
  };

  initGLCapture = () => {
    if (globalThis.__xenonInstalled) return;
    globalThis.__xenonInstalled = true;

    console.log("[Xenon] Starting GL capture");

    // GL context management
    globalThis.__xenonGL = globalThis.__xenonGL || null;
    globalThis.__xenonGLSource = globalThis.__xenonGLSource || null;
    globalThis.__xenonContextCallbacks = globalThis.__xenonContextCallbacks || [];

    const isWebGL2 = (gl) => {
      return (
        typeof WebGL2RenderingContext !== "undefined" &&
        gl instanceof WebGL2RenderingContext
      );
    };

    const scoreCanvas = (canvas) => {
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
    };

    const pickBetterGL = (newGL, source) => {
      const oldGL = globalThis.__xenonGL;

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
        globalThis.__xenonGL = newGL;
        globalThis.__xenonGLSource = source;

        console.log("[Xenon] GL context:", {
          size: [newGL.drawingBufferWidth, newGL.drawingBufferHeight],
          source,
        });

        // Notify callbacks
        for (const callback of globalThis.__xenonContextCallbacks) {
          try {
            callback(newGL, oldGL, source);
          } catch (e) {
            console.warn("[Xenon] Callback error:", e);
          }
        }

        return true;
      }

      return false;
    };

    const hookGL = (gl, source) => {
      if (!gl) return gl;
      if (gl.__xenonHooked) {
        pickBetterGL(gl, source);
        return gl;
      }

      gl.__xenonHooked = true;
      pickBetterGL(gl, source);
      return gl;
    };

    // Hook HTMLCanvasElement.getContext
    const canvasProto = HTMLCanvasElement.prototype;
    if (!canvasProto.__xenonHookedGetContext) {
      canvasProto.__xenonHookedGetContext = true;

      const orig = canvasProto.getContext;
      canvasProto.getContext = function (type, ...rest) {
        const ctx = orig.call(this, type, ...rest);
        if (ctx && (type === "webgl" || type === "webgl2" || type === "experimental-webgl")) {
          hookGL(ctx, `canvas.getContext(${type})`);
        }
        return ctx;
      };
    }

    // Hook OffscreenCanvas.getContext if available
    if (typeof OffscreenCanvas !== "undefined") {
      const offProto = OffscreenCanvas.prototype;
      if (offProto && !offProto.__xenonHookedGetContext) {
        offProto.__xenonHookedGetContext = true;

        const orig = offProto.getContext;
        offProto.getContext = function (type, ...rest) {
          const ctx = orig.call(this, type, ...rest);
          if (ctx && (type === "webgl" || type === "webgl2" || type === "experimental-webgl")) {
            hookGL(ctx, `OffscreenCanvas.getContext(${type})`);
          }
          return ctx;
        };
      }
    }

    // Late scan for canvases
    {
      let tries = 0;
      const maxTries = 200;

      const timer = setInterval(() => {
        tries++;

        const canvases = Array.from(document.querySelectorAll("canvas"));
        for (const canvas of canvases) {
          try {
            const gl2 = canvas.getContext("webgl2");
            if (gl2) hookGL(gl2, "late-scan");
          } catch {}
        }

        if (tries >= maxTries) clearInterval(timer);
      }, 250);
    }

    console.log("[Xenon] GL capture ready");
  };
}

// Public API
globalThis.__xenonGetGL = () => globalThis.__xenonGL;
globalThis.__xenonGetGLSource = () => globalThis.__xenonGLSource;
globalThis.__xenonRegisterContextCallback = (cb) => {
  if (typeof cb === "function") {
    globalThis.__xenonContextCallbacks.push(cb);
  }
};
globalThis.__xenonIsWebGL2 = (gl) => {
  return typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
};

export let polyMod = new Xenon();