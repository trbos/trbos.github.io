import { PolyMod, MixinType } from "../../../../PolyTypes.js";

class coolcars extends PolyMod {
    init = (pml) => {
        pml.getMod("carswitcher").addCars(
            {
                "name": "Audi R8",
                "url": `${this.modBaseUrl}/${this.modVersion}/assets/audir8.glb`,
                "modelUrl": `${this.modBaseUrl}/${this.modVersion}/assets/optimized/audir8.glb`,
                "sound": "audio/engine.flac"
            },
            {
                "name": "Countach",
                "url": `${this.modBaseUrl}/${this.modVersion}/assets/countach.glb`,
                "modelUrl": `${this.modBaseUrl}/${this.modVersion}/assets/optimized/countach.glb`,
                "sound": "audio/engine.flac"
            },
            {
                "name": "Koenigsegg",
                "url": `${this.modBaseUrl}/${this.modVersion}/assets/koenigsegg.glb`,
                "modelUrl": `${this.modBaseUrl}/${this.modVersion}/assets/optimized/koenigsegg.glb`,
                "sound": "audio/engine.flac"
            },
            {
                "name": "SVJ",
                "url": `${this.modBaseUrl}/${this.modVersion}/assets/svj.glb`,
                "modelUrl": `${this.modBaseUrl}/${this.modVersion}/assets/optimized/svj.glb`,
                "sound": "audio/engine.flac"
            },
            {
                "name": "Mclaren F1 GT",
                "url": `${this.modBaseUrl}/${this.modVersion}/assets/mclaren.glb`,
                "modelUrl": `${this.modBaseUrl}/${this.modVersion}/assets/optimized/mclaren.glb`,
                "sound": "audio/engine.flac"
            },
            {
                "name": "Nissan Skyline GTR",
                "url": `${this.modBaseUrl}/${this.modVersion}/assets/nissan.glb`,
                "modelUrl": `${this.modBaseUrl}/${this.modVersion}/assets/optimized/nissan.glb`,
                "sound": "audio/engine.flac"
            },
            {
                "name": "AE86",
                "url": `${this.modBaseUrl}/${this.modVersion}/assets/driftcar.glb`,
                "modelUrl": `${this.modBaseUrl}/${this.modVersion}/assets/optimized/driftcar.glb`,
                "sound": "audio/engine.flac"
            },
            {
                "name": "Cybertruck",
                "url": `${this.modBaseUrl}/${this.modVersion}/assets/cybertruck.glb`,
                "modelUrl": `${this.modBaseUrl}/${this.modVersion}/assets/optimized/cybertruck.glb`,
                "sound": "audio/engine.flac"
            },
            {
                "name": "Mclaren F1",
                "url": `${this.modBaseUrl}/${this.modVersion}/assets/mclarenmp4_5.glb`,
                "modelUrl": `${this.modBaseUrl}/${this.modVersion}/assets/optimized/mclarenmp4_5.glb`,
                "sound": "audio/engine.flac"
            }
        )
    }
}

export let polyMod = new coolcars();
