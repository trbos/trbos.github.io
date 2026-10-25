# Source and integration

This is the three-world browser build distributed at https://crossyroad.me/play/,
retrieved 2026-10-24. It contains Hipster Whale and Poki branding/credits.
The original game is described at https://poki.com/en/g/crossy-road.
Redistribution permission was not independently verified; owner review remains
required. This notice does not assert an open-source license for this build.

Local integration preserves gameplay and assets. It loads the selected world before game initialization, preloads the existing
Three.js/Tween libraries in dependency order, includes all three worlds locally,
packs 137 unchanged MP3 clips into one local payload, removes distributor
Cloudflare markup and analytics loading, disables the store promotion, sizes
the world buttons for touch, and reports real asset readiness to the host. A small Restart control reloads
only this game while preserving its namespaced progress.
Local persistence is isolated under trbos.crossy-road.v2. Existing origin keys
are neither cleared nor overwritten. The previous SepraDC game had no game
storage keys in a clean complete session; its source notice remains below.

Previous build: SepraDC/crossy-js commit 73f680678b144e3b34e653c05e8f9a32bf3f9202,
https://github.com/SepraDC/crossy-js . Upstream README claimed MIT but its
referenced LICENSE.txt was not present. Bundled Three.js is MIT licensed:
https://github.com/mrdoob/three.js/blob/dev/LICENSE .
