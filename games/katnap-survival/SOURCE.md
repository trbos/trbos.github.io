# Katnap Survival

Original Unity build from https://github.com/maplehe7/edu/tree/7c5042c8247d0d5f96f347f54dff36f711901b67/katnap-survival

Pinned source revision: `7c5042c8247d0d5f96f347f54dff36f711901b67`. Native company/product metadata is retained. The build files are unmodified and verified by SHA-256 in player.json. Local boot, save, and ad-skip adapters are separate from the binaries. Ad completion grants only the local game reward; no real advertisement, ad-network impression, purchase, online account, or account credential is used.

The original StreamingAssets media and their SHA-256/byte counts are listed in `streaming-assets.json`. These media use browser HTTP caching, separately from the four hash-checked IndexedDB Build assets. The native game also requests `StreamingAssets/futag_2.mp4`, which is absent from this pinned upstream tree. No replacement is invented; active survival gameplay is verified, while that optional cutscene remains unavailable.
