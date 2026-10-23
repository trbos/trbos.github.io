import { PolyMod, MixinType } from "../../../../PolyTypes.js"

class GhostToggleMod extends PolyMod {
    init = (pml) => {
        this.pml = pml;
        this.ghostEnabled = true;
        pml.registerBindCategory("Ghost Toggle Mod");
        pml.registerKeybind("Toggle Ghost", "ghostToggle", "keydown", "KeyO", null, (e) => { this.ghostEnabled = !this.ghostEnabled; });
        pml.registerClassMixin("Is.prototype", "update", {type: MixinType.INSERT, token: `if(null!=e.car){`, func: `const ghostEnabled = ActivePolyModLoader.getMod("${this.modID}").ghostEnabled;e.car.setVisible(ghostEnabled && !e.hasEnded);if(!ghostEnabled)continue;`})
    }
}

export let polyMod = new GhostToggleMod();
