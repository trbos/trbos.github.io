# PolyTrack Unofficial Local Reupload

This folder contains a non-commercial local reupload of PolyTrack 0.6.3.

Attribution and notices are included in `index.html`:

- Original game by [Kodub.com](https://www.kodub.com/).
- Official game page: [CrazyGames PolyTrack](https://www.crazygames.com/game/polytrack).
- This is an unofficial version and is not affiliated with, endorsed by, or sponsored by Kodub.com, CrazyGames, Poki, or itch.io.

The local page sets `window.polytrackModConfiguration = { unblocked: false }`.
The bundled game host check is disabled in `main.bundle.js`, so deployment URL
changes do not require editing a baked-in hostname allowlist. The PolyTrack API
and WebSocket proxy URLs are derived from `window.location.origin` in
`index.html`.

Mods are disabled by default. The main menu `Mods` toggle stores its state in
`localStorage` under `polytrack_mods_enabled`; changing it reloads the game so
PolyModLoader is either skipped entirely or loaded before startup.

PolyModLoader is bundled from the PolyTrack 0.6.0 branch of
<https://codeberg.org/polytrackmods/PolyModLoader/>, with local 0.6.3 adapters.

The in-game mod library is served from `mods/library/` in this folder.
Run this from the Word Builder repo root to refresh the local mirror from the
original PolyModLoader CDN:

```powershell
npm.cmd run sync:polymods
```

The sync downloads the upstream mod list and all discovered version folders so
the mirrored mods can be edited locally before deployment.
It overwrites local mod code, so do not run it over the 0.6.3 adapters without
porting and testing those changes again.

## Car Assets

Cool Cars and Goofy Cars load the `assets/optimized/` copies while retaining
the original files and saved selection URLs. Textures are limited to 1024 pixels;
the high-detail F1 GT geometry is simplified with glTF Transform 4.5.1.
`mods/library/car-model-optimizations.json` records the asset sizes.

Car loading checks GLB metadata before decoding. Devices reporting 4 GB RAM or
less, small JavaScript heaps, or `polytrack_low_ram_mode=true` use tighter limits.
Unsafe or failed models fall back to the stock car. Indexed geometry, vertex
colors, normals, and extra UV coordinates are preserved; ghosts and thumbnails
continue to use stock models, and physics is unchanged.

## Run From Word Builder

```powershell
cd C:\Users\hello\Downloads\wordBuilder
npm.cmd start
```

Then open <http://localhost:3000/polytrack/>.

The Word Builder server proxies PolyTrack API calls through `/polytrack/polytrack-api/`
so browser requests do not get blocked by CORS.
