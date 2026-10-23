import { PolyMod, MixinType } from "../../../../PolyTypes.js";

class goofycars extends PolyMod {
    init = (pml) => {
        pml.getMod("carswitcher").addCars(
            {
                "name": "Dababy Car",
                "url": `${this.modBaseUrl}/${this.modVersion}/assets/dababy.glb`,
                "modelUrl": `${this.modBaseUrl}/${this.modVersion}/assets/optimized/dababy.glb`,
                "sound": "audio/engine.flac"
            },
            {
                "name": "Hitbox Car",
                "url": `${this.modBaseUrl}/${this.modVersion}/assets/hitbox.glb`,
                "modelUrl": `${this.modBaseUrl}/${this.modVersion}/assets/optimized/hitbox.glb`,
                "sound": "audio/engine.flac"
            },
            {
                "name": "Octane",
                "url": `${this.modBaseUrl}/${this.modVersion}/assets/octane.glb`,
                "modelUrl": `${this.modBaseUrl}/${this.modVersion}/assets/optimized/octane.glb`,
                "sound": "audio/engine.flac"
            },
            {
                "name": "Wireframe",
                "url": `${this.modBaseUrl}/${this.modVersion}/assets/wireframe.glb`,
                "modelUrl": `${this.modBaseUrl}/${this.modVersion}/assets/optimized/wireframe.glb`,
                "sound": "audio/engine.flac"
            },
            {
                "name": "Lego F1 Car",
                "url": `${this.modBaseUrl}/${this.modVersion}/assets/legocar.glb`,
                "modelUrl": `${this.modBaseUrl}/${this.modVersion}/assets/optimized/legocar.glb`,
                "sound": "audio/engine.flac"
            },
            {
                "name": "Checkpoint",
                "url": `${this.modBaseUrl}/${this.modVersion}/assets/checkpoint.glb`,
                "modelUrl": `${this.modBaseUrl}/${this.modVersion}/assets/optimized/checkpoint.glb`,
                "sound": "audio/engine.flac"
            },
            {
                "name": "Golf Cart",
                "url": `${this.modBaseUrl}/${this.modVersion}/assets/golfcart.glb`,
                "modelUrl": `${this.modBaseUrl}/${this.modVersion}/assets/optimized/golfcart.glb`,
                "sound": "audio/engine.flac"
            },
            {
                "name": "Minecart",
                "url": `${this.modBaseUrl}/${this.modVersion}/assets/minecart.glb`,
                "modelUrl": `${this.modBaseUrl}/${this.modVersion}/assets/optimized/minecart.glb`,
                "sound": `${this.modBaseUrl}/${this.modVersion}/assets/minecart.flac`
            }
        )
    }
}

export let polyMod = new goofycars();
