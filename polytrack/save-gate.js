(() => {
  'use strict';
  // Recover an old save once before the permanent GitHub game creates defaults.
  window.polytrackSaveReady = window.PolyTrackSaveHandoff.destination().catch(() => true);
})();
