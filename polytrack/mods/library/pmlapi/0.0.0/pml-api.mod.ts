import {
    PolyMod,
    MixinType,
    PolyModLoader,
} from "../../../../PolyTypes.js";

/**
 * PmlApiMod is a PolyMod that provides the core API for Polytrack modding.
 * It initializes the mod loader and provides hooks for mod lifecycle events.
 */
class PmlApiMod extends PolyMod {
    pml!: PolyModLoader;

    init = (pmlInstance: PolyModLoader) => {
        this.pml = pmlInstance;

        console.log("PmlApiMod initialized...");
    };

    postInit = () => {
        console.log("PmlApiMod post-initialization complete.");
    };

    simInit = () => {
        // ammoFunc is the first function that is called post-initialization.
        // we setup a central event bus immediately when the function is called.
        this.pml.registerSimWorkerFuncMixin(
            "ammoFunc",
            MixinType.INSERT,
            "{",
            "self.pmlApi = {}; self.pmlApi.eventBus = new EventTarget();"
        );

        console.log("PmlApiMod simulation initialization complete.");
    };
}

export let polyMod = new PmlApiMod();
