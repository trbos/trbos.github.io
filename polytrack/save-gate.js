(() => {
  'use strict';
  if (location.origin !== 'https://trbos.github.io') { window.polytrackSaveTransferReady = true; return; }
  function later() {
    window.polytrackSaveTransferReady = true;
    window.polytrackSaveTransferSkipped = true;
    const add = () => {
      const link = document.createElement('a');
      link.href = '/polytrack/transfer/'; link.textContent = 'Import saves';
      link.style.cssText = 'position:fixed;right:12px;top:12px;z-index:9999;min-height:44px;display:flex;align-items:center;padding:8px 12px;background:#101722;color:#eef3ff;border-radius:8px;font:14px system-ui;text-decoration:none';
      document.body.append(link);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add, { once: true });
    else add();
  }
  if (new URLSearchParams(location.search).get('import') === 'later') { later(); return; }
  try {
    const marker = localStorage.getItem('github:polytrack:import:v1');
    if (marker === 'done') { window.polytrackSaveTransferReady = true; return; }
    if (marker === 'skipped') { later(); return; }
  } catch {}
  window.polytrackSaveTransferRedirected = true;
  location.replace('/polytrack/transfer/');
})();
