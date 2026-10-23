(() => {
  'use strict';
  const target = new URL('https://p01--wordbuilder--675vggg6lnyg.code.run/polytrack/play/');
  target.search = location.search;
  target.hash = /^#[a-f0-9]{64}$/.test(location.hash) ? '' : location.hash;
  location.replace(target.href);
})();
