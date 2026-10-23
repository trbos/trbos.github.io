import { PolyMod, MixinType } from "../../../../PolyTypes.js";

const STORAGE_KEY = "polytrack_selected_car";
const LEGACY_STORAGE_KEY = "MyCar";
const STORAGE_NAME_KEY = "polytrack_selected_car_name";
const DEFAULT_CAR = "models/car.glb";
const LEGACY_TEST_CARS = new Set([
  `${DEFAULT_CAR}?carswitcher-test=2x`,
  "./mods/library/carswitcher/1.0.5/assets/spookycar2.glb?carswitcher-test=2x",
  "./mods/library/carswitcher/1.0.5/assets/tm2020.glb?carswitcher-test=2x",
]);
const COLLISION_PART_RE = /collision/i;
const WHEEL_PART_RE = /wheel|tire|tyre/i;
const STOCK_WHEEL_CENTER_Y = 0.27;
const STOCK_WHEEL_RADIUS = 0.33065855503082275;
const STOCK_MASS_OFFSET = 0.6;
const STOCK_SUSPENSION_FRONT = 0.07809501004219055;
const STOCK_SUSPENSION_REAR = 0.0781289680480957;
const CUSTOM_WHEEL_EXTRA_LOWER_Y = 0.04;

function normalizeSelectedUrl(url) {
  return LEGACY_TEST_CARS.has(url) ? DEFAULT_CAR : url;
}

function normalizeCar(car) {
  if (!car || !car.url) return null;
  const name = car.name || car.url.split("/").pop() || car.url;
  const url = normalizeSelectedUrl(car.url);
  return {
    name,
    url,
    modelUrl: normalizeSelectedUrl(car.modelUrl || car.model || car.url),
    sound: car.sound || "",
  };
}

function uniqueCars(cars) {
  const seen = new Set();
  const out = [];
  for (const rawCar of cars) {
    const car = normalizeCar(rawCar);
    if (!car || seen.has(car.url)) continue;
    seen.add(car.url);
    out.push(car);
  }
  return out;
}

class CarSwitcher extends PolyMod {
  pmlInstance = null;
  touchingPhysics = false;
  panel = null;
  stockModelsByClass = new WeakMap();
  stockModelEntries = [];
  ghostModelSwapStack = [];
  carModels = [{ name: "PolyTrack Car", url: DEFAULT_CAR, sound: "" }];
  carApi = {
    setNewCarTemplateModel: async (url, sound) => this.selectCar(url, sound),
    reloadAllCarModels: () => window.location.reload(),
    registerCar: (car) => this.addCar(car),
  };

  preInit = (pml) => {
    this.pmlInstance = pml;
    pml.registerGlobalMixin({
      type: MixinType.REPLACEBETWEEN,
      tokenStart: "return ((F.patterns = await Promise.all(t)), e);",
      tokenEnd: "return ((F.patterns = await Promise.all(t)), e);",
      func: 'await ActivePolyModLoader.getMod("carswitcher").applySelectedCarModel(F, d, h, c, u); return ((F.patterns = await Promise.all(t)), e);',
    });
    pml.registerGlobalMixin({
      type: MixinType.REPLACEBETWEEN,
      tokenStart: "F.models.chassis.clone()",
      tokenEnd: "F.models.chassis.clone()",
      func: '(ActivePolyModLoader.getMod("carswitcher").useStockModelsForGhost(F, n), F.models.chassis.clone())',
    });
    pml.registerGlobalMixin({
      type: MixinType.INSERT,
      token: '(0, l.gn)(this, we, "f").add((0, l.gn)(this, Se, "f")));',
      func: '\n              ActivePolyModLoader.getMod("carswitcher").restoreModelsAfterGhost(F);',
    });
    pml.registerGlobalMixin({
      type: MixinType.REPLACEBETWEEN,
      tokenStart: "(o = new r.A(",
      tokenEnd: "o.update(0)),",
      func: `ActivePolyModLoader.getMod("carswitcher").runWithStockModelsForThumbnail(() => (
                    (o = new r.A(
                      null,
                      { position: new i.Pq0(), quaternion: new i.PTz() },
                      null,
                      null,
                      c,
                      null,
                      null,
                      null,
                      null,
                      null,
                      null,
                    )),
                    o.update(0)
                  )),`,
    });
  };

  init = (pml) => {
    this.pmlInstance = pml;
  };

  addCars = (...cars) => {
    for (const car of cars) this.addCar(car);
  };

  addCar = (car) => {
    const normalized = normalizeCar(car);
    if (!normalized) return;
    if (!this.carModels.some((existing) => existing.url === normalized.url)) {
      this.carModels.push(normalized);
    }
    this.syncPanel();
  };

  selectCar = async (carOrUrl, sound) => {
    const car = normalizeCar(typeof carOrUrl === "string" ? { url: carOrUrl, sound } : carOrUrl);
    if (!car?.url) return;
    window.localStorage.setItem(STORAGE_KEY, car.url);
    window.localStorage.setItem(LEGACY_STORAGE_KEY, car.url);
    if (car.name) window.localStorage.setItem(STORAGE_NAME_KEY, car.name);
    if (car.sound) window.localStorage.setItem("carSound", car.sound);
    console.log(`[CarSwitcher] Selected car: ${car.name || car.url}`);
    this.syncPanel();
  };

  selectedUrl = () =>
    normalizeSelectedUrl(
      window.localStorage.getItem(STORAGE_KEY) ||
        window.localStorage.getItem(LEGACY_STORAGE_KEY) ||
        DEFAULT_CAR,
    );

  selectedCar = () => {
    const url = this.selectedUrl();
    return uniqueCars(this.carModels).find((entry) => entry.url === url) || {
      name: window.localStorage.getItem(STORAGE_NAME_KEY) || url,
      url,
      modelUrl: normalizeSelectedUrl(url),
      sound: window.localStorage.getItem("carSound") || "",
    };
  };

  cloneModelSet = (models) => ({
    ...models,
    chassis: models.chassis,
    suspension: models.suspension,
    rims: new Map(models.rims),
    exhausts: new Map(models.exhausts),
  });

  rememberStockModels = (carClass) => {
    if (!carClass?.models || this.stockModelsByClass.has(carClass)) return;
    const stockModels = this.cloneModelSet(carClass.models);
    this.stockModelsByClass.set(carClass, stockModels);
    this.stockModelEntries.push({ carClass, stockModels });
  };

  useModelSet = (carClass, models) => {
    carClass.models = this.cloneModelSet(models);
  };

  useStockModelsForGhost = (carClass, recording) => {
    if (recording == null || !carClass?.models) return;
    const stockModels = this.stockModelsByClass.get(carClass);
    if (!stockModels) return;
    this.ghostModelSwapStack.push({ carClass, models: carClass.models });
    this.useModelSet(carClass, stockModels);
  };

  restoreModelsAfterGhost = (carClass) => {
    for (let index = this.ghostModelSwapStack.length - 1; index >= 0; index--) {
      const swap = this.ghostModelSwapStack[index];
      if (swap.carClass !== carClass) continue;
      this.ghostModelSwapStack.splice(index, 1);
      swap.carClass.models = swap.models;
      return;
    }
  };

  runWithStockModelsForThumbnail = (callback) => {
    if (this.stockModelEntries.length === 0) return callback();
    const swaps = [];

    for (const { carClass, stockModels } of this.stockModelEntries) {
      if (!carClass?.models) continue;
      swaps.push({ carClass, models: carClass.models });
      this.useModelSet(carClass, stockModels);
    }

    try {
      return callback();
    } finally {
      for (let index = swaps.length - 1; index >= 0; index--) {
        swaps[index].carClass.models = swaps[index].models;
      }
    }
  };

  isMeshObject = (object, threeModule) => object instanceof threeModule.eaF || object.isMesh;

  findNamedAncestor = (object, root, pattern) => {
    let current = object;
    while (current) {
      if (pattern.test(current.name || "")) return current;
      if (current === root) break;
      current = current.parent;
    }
    return null;
  };

  matchesNamedPart = (object, root, pattern) => Boolean(this.findNamedAncestor(object, root, pattern));

  normalizeGeometryForMerge = (geometry, hasUv) => {
    const position = geometry.getAttribute("position");
    if (!position) return;
    geometry.morphAttributes = {};
    geometry.morphTargetsRelative = false;
    if (!geometry.getAttribute("normal")) {
      geometry.setAttribute("normal", new position.constructor(new Float32Array(position.count * 3), 3));
    }
    if (hasUv && !geometry.getAttribute("uv")) {
      geometry.setAttribute("uv", new position.constructor(new Float32Array(position.count * 2), 2));
    }
    for (const attributeName of Object.keys(geometry.attributes)) {
      if (attributeName === "position" || attributeName === "normal" || (hasUv && attributeName === "uv")) continue;
      geometry.deleteAttribute(attributeName);
    }
  };

  cloneGeometryGroups = (geometry, materialBase, materialCount) => {
    const position = geometry.getAttribute("position");
    const vertexCount = position?.count || 0;
    const sourceGroups =
      geometry.groups?.length > 0 ? geometry.groups : [{ start: 0, count: vertexCount, materialIndex: 0 }];

    return sourceGroups
      .map((group) => {
        const start = Math.max(0, group.start || 0);
        const count = Math.min(group.count || 0, Math.max(vertexCount - start, 0));
        const materialIndex = Math.min(Math.max(Number(group.materialIndex) || 0, 0), materialCount - 1);
        return { start, count, materialIndex: materialBase + materialIndex };
      })
      .filter((group) => group.count > 0);
  };

  buildMergedMesh = (parts, materials, threeModule, bufferUtils, name) => {
    const geometries = parts.map((part) => part.geometry);
    const hasUv = geometries.some((geometry) => Boolean(geometry.getAttribute("uv")));
    for (const geometry of geometries) this.normalizeGeometryForMerge(geometry, hasUv);
    let geometry = geometries[0];
    if (geometries.length > 1) {
      geometry = bufferUtils.pP(geometries, false);
      if (!geometry) throw new Error("Failed to merge selected car meshes.");
    }
    geometry.morphAttributes = geometry.morphAttributes || {};
    geometry.morphTargetsRelative = false;
    geometry.clearGroups?.();
    let vertexOffset = 0;
    for (const part of parts) {
      for (const group of part.groups) {
        geometry.addGroup?.(vertexOffset + group.start, group.count, group.materialIndex);
      }
      vertexOffset += part.geometry.getAttribute("position")?.count || 0;
    }
    geometry.computeBoundingBox?.();
    geometry.computeBoundingSphere?.();
    const material = materials.length === 1 ? materials[0] : materials;
    const mesh = new threeModule.eaF(geometry, material);
    mesh.name = name;
    mesh.frustumCulled = false;
    return mesh;
  };

  setDoubleSided = (mesh, threeModule) => {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      material.side = threeModule.hB5;
      material.shadowSide = threeModule.hB5;
    }
  };

  translateGeometryY = (geometry, yOffset) => {
    if (!Number.isFinite(yOffset) || Math.abs(yOffset) < 1e-6) return;
    if (typeof geometry.translate === "function") {
      geometry.translate(0, yOffset, 0);
      return;
    }
    const position = geometry.getAttribute("position");
    if (!position) return;
    for (let index = 0; index < position.count; index++) {
      position.setY(index, position.getY(index) + yOffset);
    }
    position.needsUpdate = true;
  };

  getStockWheelGroundY = (carClass) => {
    const front = Number(carClass?.suspensionResetLengthFront);
    const rear = Number(carClass?.suspensionResetLengthRear);
    const suspension =
      (Number.isFinite(front) ? front : STOCK_SUSPENSION_FRONT) / 2 +
      (Number.isFinite(rear) ? rear : STOCK_SUSPENSION_REAR) / 2;
    return STOCK_WHEEL_CENTER_Y - suspension - STOCK_WHEEL_RADIUS;
  };

  measureWheelBottomY = (scene, threeModule) => {
    scene.updateMatrixWorld(true);
    const point = new threeModule.Pq0();
    let minY = Infinity;

    scene.traverse((child) => {
      if (this.matchesNamedPart(child, scene, COLLISION_PART_RE)) return;
      if (!this.matchesNamedPart(child, scene, WHEEL_PART_RE)) return;
      if (!this.isMeshObject(child, threeModule) || !child.geometry) return;

      const position = child.geometry.getAttribute("position");
      if (!position) return;
      for (let index = 0; index < position.count; index++) {
        point.set(position.getX(index), position.getY(index), position.getZ(index));
        point.applyMatrix4(child.matrixWorld);
        minY = Math.min(minY, point.y);
      }
    });

    return Number.isFinite(minY) ? minY : null;
  };

  getCustomWheelOffsetY = (scene, carClass, threeModule) => {
    const wheelBottomY = this.measureWheelBottomY(scene, threeModule);
    if (wheelBottomY == null) return 0;
    const massOffset = Number.isFinite(Number(carClass?.massOffset)) ? Number(carClass.massOffset) : STOCK_MASS_OFFSET;
    return this.getStockWheelGroundY(carClass) - (massOffset + wheelBottomY) - CUSTOM_WHEEL_EXTRA_LOWER_Y;
  };

  buildMeshPartsFromObject = (object, transformMatrix, yOffset = 0) => {
    const childMaterials = (Array.isArray(object.material) ? object.material : [object.material]).filter(Boolean);
    if (childMaterials.length === 0) return null;

    let geometry = object.geometry.clone();
    if (geometry.index) geometry = geometry.toNonIndexed();
    geometry.applyMatrix4(transformMatrix);
    this.translateGeometryY(geometry, yOffset);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox?.();
    geometry.computeBoundingSphere?.();

    return { geometry, childMaterials };
  };

  addMeshPart = (parts, materials, meshPart) => {
    if (!meshPart) return;
    const materialBase = materials.length;
    materials.push(...meshPart.childMaterials);
    parts.push({
      geometry: meshPart.geometry,
      groups: this.cloneGeometryGroups(meshPart.geometry, materialBase, meshPart.childMaterials.length),
    });
  };

  buildCustomChassis = (scene, threeModule, bufferUtils, wheelOffsetY = 0) => {
    scene.updateMatrixWorld(true);
    const parts = [];
    const materials = [];

    scene.traverse((child) => {
      if (this.matchesNamedPart(child, scene, COLLISION_PART_RE)) return;
      if (!this.isMeshObject(child, threeModule) || !child.geometry || !child.material) return;
      const yOffset = this.matchesNamedPart(child, scene, WHEEL_PART_RE) ? wheelOffsetY : 0;
      this.addMeshPart(parts, materials, this.buildMeshPartsFromObject(child, child.matrixWorld, yOffset));
    });

    if (parts.length === 0) {
      throw new Error("Selected car GLB has no visible meshes.");
    }

    return this.buildMergedMesh(parts, materials, threeModule, bufferUtils, "CustomCarChassis");
  };

  applySelectedCarModel = async (carClass, gltfModule, dracoModule, threeModule, bufferUtils) => {
    const selected = this.selectedCar();
    if (!selected?.url || selected.url === DEFAULT_CAR) return;

    try {
      this.rememberStockModels(carClass);
      const modelUrl = selected.modelUrl || normalizeSelectedUrl(selected.url);
      if (!modelUrl || modelUrl === DEFAULT_CAR) {
        console.log(`[CarSwitcher] Using stock car model for: ${selected.name || selected.url}`);
        return;
      }

      const gltf = await new Promise((resolve, reject) => {
        const loader = new gltfModule.B();
        const dracoLoader = new dracoModule.Z();
        dracoLoader.setDecoderPath("lib/draco/");
        loader.setDRACOLoader(dracoLoader);
        loader.load(modelUrl, resolve, undefined, reject);
      });

      const wheelOffsetY = this.getCustomWheelOffsetY(gltf.scene, carClass, threeModule);
      const model = this.buildCustomChassis(gltf.scene, threeModule, bufferUtils, wheelOffsetY);
      model.name = selected.name || "Custom Car";
      this.setDoubleSided(model, threeModule);

      const hideClone = (source) => {
        const clone = source.clone(true);
        clone.visible = false;
        return clone;
      };

      carClass.models.chassis = model;
      carClass.models.suspension = hideClone(carClass.models.suspension);
      for (const [key, rim] of carClass.models.rims.entries()) {
        carClass.models.rims.set(key, hideClone(rim));
      }
      for (const [key, exhaust] of carClass.models.exhausts.entries()) {
        carClass.models.exhausts.set(key, hideClone(exhaust));
      }
      console.log(`[CarSwitcher] Applied custom car model: ${selected.name || selected.url}`);
    } catch (error) {
      console.warn("[CarSwitcher] Failed to apply custom car model; falling back to the stock car.", error);
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      window.localStorage.removeItem(STORAGE_NAME_KEY);
      window.localStorage.removeItem("carSound");
    }
  };

  onGameLoad = () => {
    window.setTimeout(() => this.installPanel(), 1000);
  };

  injectStyles = () => {
    if (document.getElementById("poly-car-switcher-style")) return;
    const style = document.createElement("style");
    style.id = "poly-car-switcher-style";
    style.textContent =
      ".poly-car-switcher-panel{position:fixed;left:12px;bottom:12px;z-index:2147483646;display:flex;gap:6px;align-items:center;padding:6px;background:rgba(17,32,82,.92);color:#fff;font-family:ForcedSquare,Arial,sans-serif;pointer-events:auto;clip-path:polygon(0 0,100% 0,calc(100% - 8px) 100%,0 100%)}" +
      ".poly-car-switcher-panel select,.poly-car-switcher-panel button{height:34px;border:0;background:#28346a;color:#fff;font-family:inherit;font-size:16px;padding:0 10px}" +
      ".poly-car-switcher-panel select{max-width:220px}" +
      ".poly-car-switcher-panel:not(.open) select,.poly-car-switcher-panel:not(.open) .poly-car-switcher-apply{display:none}";
    document.head.appendChild(style);
  };

  installPanel = () => {
    if (this.panel || document.getElementById("poly-car-switcher-panel")) return;
    this.injectStyles();
    const panel = document.createElement("div");
    panel.id = "poly-car-switcher-panel";
    panel.className = "poly-car-switcher-panel";
    panel.innerHTML =
      '<button class="poly-car-switcher-toggle" type="button">Car</button>' +
      '<select class="poly-car-switcher-select" aria-label="Car"></select>' +
      '<button class="poly-car-switcher-apply" type="button">Apply</button>';
    document.body.appendChild(panel);
    this.panel = panel;
    panel.querySelector(".poly-car-switcher-toggle").addEventListener("click", () => {
      panel.classList.toggle("open");
      this.syncPanel();
    });
    const selectCurrentCar = async () => {
      const select = panel.querySelector(".poly-car-switcher-select");
      const car = uniqueCars(this.carModels).find((entry) => entry.url === select.value);
      const label = select.options[select.selectedIndex]?.textContent || select.value;
      await this.selectCar(car || { name: label, url: select.value });
    };
    panel.querySelector(".poly-car-switcher-select").addEventListener("change", () => {
      void selectCurrentCar();
    });
    panel.querySelector(".poly-car-switcher-apply").addEventListener("click", async () => {
      await selectCurrentCar();
      window.location.reload();
    });
    this.syncPanel();
  };

  syncPanel = () => {
    if (!this.panel) return;
    const select = this.panel.querySelector(".poly-car-switcher-select");
    const selected = this.selectedUrl();
    select.innerHTML = "";
    for (const car of uniqueCars(this.carModels)) {
      const option = document.createElement("option");
      option.value = car.url;
      option.textContent = car.name;
      option.selected = car.url === selected;
      select.appendChild(option);
    }
    if ([...select.options].some((option) => option.value === selected)) {
      select.value = selected;
    } else {
      select.value = DEFAULT_CAR;
    }
  };
}

export let polyMod = new CarSwitcher();
