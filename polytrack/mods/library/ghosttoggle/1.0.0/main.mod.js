import { PolyMod, MixinType } from "../../../../PolyTypes.js"

class GhostToggleMod extends PolyMod {
    init = (pml) => {
        this.pml = pml;
        this.ghostEnabled = true;
        pml.registerBindCategory("Ghost Toggle Mod");
        pml.registerKeybind("Toggle Ghost", "ghostToggle", "keydown", "KeyO", null, (e) => { this.ghostEnabled = !this.ghostEnabled; });
        pml.registerClassMixin("AP.prototype", "update",MixinType.REPLACEBETWEEN, `e.car.getTime().numberOfFrames`, `e.car.getTime().numberOfFrames`, `(ActivePolyModLoader.getMod("${this.id}").ghostEnabled ? e.car.getTime().numberOfFrames : 0)`)
        pml.registerClassMixin("AP.prototype", "update",MixinType.INSERT, `e.car.setCarState(t)`, `;if(!ActivePolyModLoader.getMod("${this.id}").ghostEnabled) break;`)
    }
}

export let polyMod = new GhostToggleMod();