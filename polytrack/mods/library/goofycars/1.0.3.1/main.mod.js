// after (identical to carswitcher):
import { PolyMod } from "../../../../PolyTypes.js";

class goofycars extends PolyMod {
    init = (pml) => {
        pml.getMod("carswitcher").addCars(
            {
                "name": "Dababy Car",
                "url": `${this.modBaseUrl}/${this.modVersion}/assets/dababy.glb`
            },
            {
                "name": "Hitbox Car",
                "url": `${this.modBaseUrl}/${this.modVersion}/assets/hitbox.glb`
            }
        )
    }
}

export let polyMod = new goofycars();
