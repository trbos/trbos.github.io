import {
  PolyMod,
  SettingType,
  MixinType,
} from "../../../../PolyTypes.js";

/* =========================
   INPUT STATE
========================= */

let forward = false;
let left = false;
let right = false;
let brake = false;

const keyState = Object.create(null);

window.addEventListener(
  "keydown",
  (e) => {
    keyState[e.code] = true;
  },
  true,
);

window.addEventListener(
  "keyup",
  (e) => {
    keyState[e.code] = false;
  },
  true,
);

function clearAllKeys() {
  for (const k in keyState) keyState[k] = false;
}

addEventListener("blur", clearAllKeys);
addEventListener("visibilitychange", () => {
  if (document.hidden) clearAllKeys();
});

/* =========================
   INPUT RESOLUTION
========================= */

function updateInputs(vehicleKeys) {
  if (!vehicleKeys) return;

  forward = (vehicleKeys.VehicleAccelerate || []).some((k) => keyState[k]);
  brake = (vehicleKeys.VehicleBrake || []).some((k) => keyState[k]);
  left = (vehicleKeys.VehicleTurnLeft || []).some((k) => keyState[k]);
  right = (vehicleKeys.VehicleTurnRight || []).some((k) => keyState[k]);
}

function getVehicleKeys() {
  const raw = localStorage.getItem("polytrack_v4_prod_key_bindings");
  if (!raw) return null;

  let bindings;
  try {
    bindings = JSON.parse(raw);
  } catch {
    return null;
  }

  const wanted = new Set([
    "VehicleAccelerate",
    "VehicleBrake",
    "VehicleTurnLeft",
    "VehicleTurnRight",
  ]);

  const out = {};
  for (const [action, keys] of bindings) {
    if (wanted.has(action)) out[action] = (keys || []).filter(Boolean);
  }
  return out;
}

/* =========================
   OVERLAY STYLES
========================= */

function lerp(min, max, t) {
  return min + (max - min) * t;
}

function injectOverlayStyles() {
  if (document.getElementById("input-overlay-styles")) return;

  const style = document.createElement("style");
  style.id = "input-overlay-styles";
  style.textContent = `
    .input-overlay {
      position: fixed;
      display: grid;
      grid-template-columns: repeat(3, var(--tile));
      grid-template-rows: repeat(2, var(--tile));
      gap: 0;
      pointer-events: none;
      z-index: 2147483647;
    }

    .input-key,
    .input-spacer {
      width: var(--tile);
      height: var(--tile);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .input-key {
      position: relative;
    }

    .input-key-bg {
      position: absolute;
      inset: 0;
      background-color: rgb(40, 52, 106);
      opacity: var(--idle-alpha, 1);
    }

    .input-key.active .input-key-bg {
      background-color: rgb(17, 32, 82);
      opacity: var(--active-alpha, 1);
    }

    .input-key img {
      position: relative;
      z-index: 1;
    }

    .input-spacer {
      background: transparent;
    }
  `;
  document.head.appendChild(style);
}

/* =========================
   MOD CLASS
========================= */

class InputOverlayMod extends PolyMod {
  overlayVisible = false;
  ticking = false;
  rafId = null;

  hudObserver = null;

  isElementVisible(sel) {
    const el = document.querySelector(sel);
    if (!el) return false;

    const cs = getComputedStyle(el);
    return (
      cs.display !== "none" && cs.visibility !== "hidden" && cs.opacity !== "0"
    );
  }

  isHudVisible() {
    const hasSpeedometer = !!document.querySelector(".speedometer");

    // hide overlay if time bar is present AND visible
    const timeBarVisible = this.isElementVisible(".time-bar");

    return hasSpeedometer && !timeBarVisible;
  }

  updateOverlayVisibility() {
    const visible = this.isHudVisible();

    if (visible) {
      this.showOverlay();
      this.startInputLoop();
    } else {
      this.hideOverlay();
      this.stopInputLoop();
    }
  }

  startHudWatcher() {
    if (this.hudObserver) return;

    this.hudObserver = new MutationObserver(() => {
      this.updateOverlayVisibility();
    });

    this.hudObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true, // NEW
      attributeFilter: ["class", "style", "hidden"], // NEW (keeps it cheap)
    });

    // run once immediately
    this.updateOverlayVisibility();
  }

  stopHudWatcher() {
    if (!this.hudObserver) return;
    this.hudObserver.disconnect();
    this.hudObserver = null;
  }

  showOverlay() {
    if (!this.overlayRoot) this.createOverlay();
    this.overlayRoot.style.display = "";
    this.overlayVisible = true;
  }

  hideOverlay() {
    if (!this.overlayRoot) return;
    this.overlayRoot.style.display = "none";
    this.overlayVisible = false;
  }

  startInputLoop() {
    if (this.ticking) return;
    this.ticking = true;

    let vehicleKeys = null;

    const tick = () => {
      if (!this.ticking) return;

      if (!vehicleKeys) vehicleKeys = getVehicleKeys();
      if (vehicleKeys) updateInputs(vehicleKeys);

      this.renderOverlay();
      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  stopInputLoop() {
    this.ticking = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /* ---- Public config (external API) ---- */
  overlayConfig = {
    margin: 16,
    position: "0", // "0" | "1" | "2" | "3"
    tileSize: 64,
    iconSize: 28,
    idleOpacity: 1,
    activeOpacity: 1,
  };

  /* ---- Internal state ---- */
  overlayRoot = null;
  overlayKeys = null;

  /* ---- Overlay creation ---- */
  createOverlay() {
    // Remove old overlay if it exists
    if (this.overlayRoot) {
      this.overlayRoot.remove();
      this.overlayRoot = null;
      this.overlayKeys = null;
    }
    injectOverlayStyles();

    const root = document.createElement("div");
    root.className = "input-overlay";

    const key = (src) => {
      const el = document.createElement("div");
      el.className = "input-key";

      const bg = document.createElement("div");
      bg.className = "input-key-bg";

      const img = document.createElement("img");
      img.src = src;
      img.draggable = false;

      el.appendChild(bg);
      el.appendChild(img);
      return el;
    };

    const spacer = () => {
      const el = document.createElement("div");
      el.className = "input-spacer";
      return el;
    };

    this.overlayKeys = {
      forward: key("images/arrow_up.svg"),
      left: key("images/arrow_left.svg"),
      brake: key("images/arrow_down.svg"),
      right: key("images/arrow_right.svg"),
    };

    // Layout:
    root.appendChild(spacer());
    root.appendChild(this.overlayKeys.forward);
    root.appendChild(spacer());

    root.appendChild(this.overlayKeys.left);
    root.appendChild(this.overlayKeys.brake);
    root.appendChild(this.overlayKeys.right);

    document.body.appendChild(root);
    this.overlayRoot = root;

    this.applyOverlayConfig();
  }

  /* ---- Apply config to DOM ---- */
  applyOverlayConfig() {
    if (!this.overlayRoot) return;

    const c = this.overlayConfig;
    const el = this.overlayRoot;

    // Clear all edges first (IMPORTANT)
    el.style.top = "";
    el.style.bottom = "";
    el.style.left = "";
    el.style.right = "";

    const m = `${c.margin}px`;

    switch (c.position) {
      case "0": // top right
        el.style.top = m;
        el.style.right = m;
        break;

      case "1": // top left
        el.style.top = m;
        el.style.left = m;
        break;

      case "2": // bottom right
        el.style.bottom = m;
        el.style.right = m;
        break;

      case "3": // bottom left
        el.style.bottom = m;
        el.style.left = m;
        break;
    }

    el.style.setProperty("--tile", `${c.tileSize}px`);
    el.style.setProperty("--icon", `${c.iconSize}px`);
    el.style.setProperty("--idle-alpha", c.idleOpacity);
    el.style.setProperty("--active-alpha", c.activeOpacity);
  }

  /* ---- Render visual state ---- */
  renderOverlay() {
    const k = this.overlayKeys;
    if (!k) return;

    k.forward.classList.toggle("active", forward);
    k.left.classList.toggle("active", left);
    k.right.classList.toggle("active", right);
    k.brake.classList.toggle("active", brake);
  }

  /* ---- Mod entry ---- */
  init = (pml) => {
    this.pml = pml;

    pml.registerClassMixin(
      "vz.prototype",
      "createCar",
      MixinType.INSERT,
      `var s, o;`,
      `
      const mod = window.polyModLoader?.getMod("inputoverlay");
      if (mod) {
        mod.startHudWatcher();
        mod.updateOverlayVisibility();
      }
      `,
    );
    pml.registerClassMixin(
      "yP.prototype",
      "dispose",
      MixinType.INSERT,
      `window.removeEventListener('keyup', wP(this, mP, 'f'));`,
      `
      const mod = window.polyModLoader?.getMod("inputoverlay");
      if (mod) {
        mod.hideOverlay();
        mod.stopInputLoop();
        mod.stopHudWatcher(); // NEW
      }
      `,
    );

    pml.registerSettingCategory("Input overlay");

    pml.registerSetting(
      "Inactive key transparency",
      "inactiveKeyTransparency",
      SettingType.SLIDER,
      0.8,
    );
    pml.registerSetting(
      "Active key transparency",
      "activeKeyTransparency",
      SettingType.SLIDER,
      0.95,
    );
    pml.registerSetting(
      "Overlay size",
      "inputOverlaySize",
      SettingType.SLIDER,
      0.5,
    );
    pml.registerSetting(
      "Overlay position",
      "inputOverlayPosition",
      SettingType.CUSTOM,
      0,
      [
        {
          title: "Top right",
          value: "0",
        },
        {
          title: "Top left",
          value: "1",
        },
        {
          title: "Bottom right",
          value: "2",
        },
        {
          title: "Bottom left",
          value: "3",
        },
      ],
    );
  };

  onGameLoad = () => {
    this.overlayConfig.idleOpacity =
      Number.parseFloat(this.pml.getSetting("inactiveKeyTransparency")) || 0.8;

    this.overlayConfig.activeOpacity =
      Number.parseFloat(this.pml.getSetting("activeKeyTransparency")) || 0.95;

    const rawSize = Number.parseFloat(this.pml.getSetting("inputOverlaySize"));

    // slider is already snapped to 21 steps
    const t = Number.isFinite(rawSize) ? rawSize : 0.5;

    this.overlayConfig.tileSize = Math.round(lerp(40, 96, t));

    this.overlayConfig.iconSize = Math.round(
      this.overlayConfig.tileSize * lerp(0.45, 0.55, t),
    );

    this.overlayConfig.position =
      this.pml.getSetting("inputOverlayPosition") ?? "0";

    this.createOverlay();
    this.applyOverlayConfig();

    // IMPORTANT: start hidden and paused
    this.hideOverlay();
    this.stopInputLoop();

    // NEW: automatically follow HUD state
    this.startHudWatcher();
  };
}

/* =========================
   EXPORT
========================= */

export let polyMod = new InputOverlayMod();
