# Game cover sources

Each file in this folder is a local capture from the corresponding game build or source page, saved as a 1200 × 675 WebP at quality 78. The images are 16:9, use `object-fit: cover`, and have empty alt text because the adjacent card title names each game.

| Cover | Captured from | Source notes |
| --- | --- | --- |
| `hextris.webp` | Upstream Hextris cover art from `games/hextris/images/2-opengraph.png`, centered on a 16:9 white canvas | Bundled upstream source in `games/hextris/` |
| `geometry-dash.webp` | Local Geometry Dash build, game title menu | `games/geometry-dash/UPSTREAM.json` and bundled source in `games/geometry-dash/` |
| `jambling.webp` | Jambling 2.0 Packs and game-navigation surface from the local QA capture `outputs/jambling-packs-landscape.png`, cropped to the logo, navigation, and pack art | Existing external game URL in `assets/games.js`: `https://snoozingmax.github.io/Jambling/`; crop excludes the balance area |
| `block-blast.webp` | Local Block Blast build | Bundled build in `games/block-blast/` |
| `archers.webp` | Local Ragdoll Archers build | `games/archers/SOURCE.md` |
| `crossy-road.webp` | Current local Crossy Road build | `games/crossy-road/SOURCE.md`; this is the old build's capture and can be replaced at this path when the new build is ready |
| `eaglercraft.webp` | EaglercraftX 1.8 survival gameplay from `work/eaglercraft-luna-retry/.game-addition-qa/eagler-touch-survival-after.png`, cropped to a 16:9 frame | `games/eaglercraft/SOURCE.md`; prior local QA / iPad viewport-emulation screenshot |

Local builds were captured with Playwright at 1280 × 720. The Jambling and Eaglercraft covers use screenshots from prior local QA sessions, cropped to 16:9. Final covers are stored locally; cards do not hotlink game pages or artwork.



