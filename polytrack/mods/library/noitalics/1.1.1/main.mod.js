import { PolyMod, MixinType } from "../../../../PolyTypes.js";

class PolyProxyMod extends PolyMod {
    preInit = (pml) => {
        pml.registerGlobalMixin(MixinType.REPLACEBETWEEN, `font-style: italic;`, `font-style: italic;`, `font-style: normal;`);
    }
}
export let polyMod = new PolyProxyMod();