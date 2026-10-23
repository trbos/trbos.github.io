import { PolyMod, MixinType } from "../../../../PolyTypes.js";

class coolcars extends PolyMod {
    init = (pml) => {
        pml.getMod("carswitcher").addCars(
            {
                "name": "Audi R8",
                "url": `${this.modBaseUrl}/${this.modVersion}/assets/audir8.glb`
            },
            {
                "name": "Countach",
                "url": `${this.modBaseUrl}/${this.modVersion}/assets/countach.glb`
            },
            {
                "name": "Koenigsegg",
                "url": `${this.modBaseUrl}/${this.modVersion}/assets/koenigsegg.glb`
            },
            {
                "name": "SVJ",
                "url": `${this.modBaseUrl}/${this.modVersion}/assets/svj.glb`
            },
            {
                "name": "Mclaren F1 GT",
                "url": `${this.modBaseUrl}/${this.modVersion}/assets/mclaren.glb`
            },
            {
                "name": "Nissan Skyline GTR",
                "url": `${this.modBaseUrl}/${this.modVersion}/assets/nissan.glb`
            },

        )
    }
}

export let polyMod = new coolcars();
