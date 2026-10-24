(() => {
  'use strict';
  const gameId = 'eaglercraft';
  let ready = false;
  const send = (type, extra = {}) => {
    if (window.parent === window) return;
    window.parent.postMessage({id: gameId, type, ...extra}, location.origin);
  };

  send('game:progress', {stage: 'browser-runtime-loaded'});
  window.addEventListener('error', event => {
    if (event.message || event.error) send('game:error', {message: String(event.message || event.error).slice(0, 160)});
  });
  window.addEventListener('unhandledrejection', event => {
    send('game:error', {message: String(event.reason || 'Unhandled runtime rejection').slice(0, 160)});
  });

  const checkCanvas = () => {
    if (ready) return;
    const canvas = [...document.querySelectorAll('canvas')].find(node => node.width >= 640 && node.height >= 360);
    if (canvas && canvas.isConnected) {
      ready = true;
      send('game:ready', {stage: 'interactive-canvas'});
    }
  };
  const observer = new MutationObserver(checkCanvas);
  observer.observe(document.documentElement, {childList: true, subtree: true, attributes: true, attributeFilter: ['width', 'height']});
  const timer = window.setInterval(() => {
    checkCanvas();
    if (ready) {
      window.clearInterval(timer);
      observer.disconnect();
    }
  }, 250);
})();
