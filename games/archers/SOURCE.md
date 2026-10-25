# Ragdoll Archers

Developer: Ericetto. Published WebGL build 42 from [CrazyGames](https://www.crazygames.com/game/ragdoll-archers), also present in the owner-provided [standalone package](https://github.com/maplehe7/edu/tree/main/Ragdoll%20Archers). Original Unity source project is not included.

The data and Wasm were decoded by the browser and recompressed as gzip for the existing verified asset player. The framework adapts SDK initialization, mounts native PlayerPrefs on the per-game save bridge, and handles optional denied gamepad access. The standalone package's application URL metadata is scoped to its opaque game document; the real browser origin, local asset base and sandbox stay intact. The adapter implements the compiled platform ABI with a local player and real device saves. No provider account, ad impression, cloud session, score or purchase is sent. Game logic, data and Wasm are otherwise unchanged.

New native progress uses its own `archers-crazygames-42` save slot. Previous Archers saves are preserved under their original key; the formats are not converted.

Original downloaded byte hashes:

- `76f034cff49013ce85bd6945ebf32347.loader.js`: `441455412293faf048b6b02e4dbd6e8690477dbeeed6f6b943417fd6654bd4bf` (20437 decoded bytes)
- `eb8d005d31d7319e73a2be6cf35778c9.framework.js.br`: `8f213ab3daeebb6b223c793b83743e48d6f23a9e9db373c8cbfb9e5e88a123fe` (354890 decoded bytes)
- `b78e2f19aeeb36e72ad0c25ba1389c0c.data.br`: `ecea7d82f5f8e07cf3b52a4f912066b2f4d7ee551c3f9fc9bb22ea0ff7ea6e77` (5796999 decoded bytes)
- `d47cbbbcaabab6b66593391aec42e135.wasm.br`: `385197d83e01941d5ecd45a0985ca2607e65640359e6d6c21367de5e0d54f2c4` (21347382 decoded bytes)
