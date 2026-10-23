// after (identical to carswitcher):
import { PolyMod } from "../../../../PolyTypes.js";

class goofycars extends PolyMod {
    init = (pml) => {
        pml.getMod("carswitcher").addCars(
            {
                "name": "Dababy Car",
                "url": `${this.modBaseUrl}/${this.modVersion}/assets/dababy.glb`
            }
        )
    }
}

export let polyMod = new goofycars();
