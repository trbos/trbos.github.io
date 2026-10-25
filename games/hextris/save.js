(() => {
  'use strict';
  // Rebuild known game objects instead of evaluating serialized functions.
  const patterns = ['randomGeneration','doubleGeneration','crosswiseGeneration','spiralGeneration','circleGeneration','halfCircleGeneration'];
  const scalar = value => typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value);
  function fields(target, source) {
    for (const key of Object.keys(target)) {
      if (typeof target[key] === typeof source?.[key] && scalar(source?.[key])) target[key] = source[key];
    }
    return target;
  }
  function parse(text) {
    let state;
    try {state = JSON.parse(text);} catch {return {};}
    if (!state?.hex || !Array.isArray(state.hex.blocks) || state.hex.blocks.length !== 6) return {};
    const hex = fields(new Hex(settings.hexWidth),state.hex), previous = window.MainHex;
    window.MainHex = hex;
    function block(value) {
      const result = fields(new Block(0,'#e74c3c',1.6),value);
      result.distFromHex *= settings.scale;
      result.height = settings.blockHeight;
      return result;
    }
    try {
      hex.blocks = state.hex.blocks.map(lane => Array.isArray(lane) ? lane.slice(0,100).map(block) : []);
      hex.shakes = [];hex.texts = [];
      const wave = fields(new waveGen(hex),state.wavegen);
      if (patterns.includes(state.pattern)) wave.currentFunction = wave[state.pattern];
      return {hex,blocks:Array.isArray(state.blocks)?state.blocks.slice(0,100).map(block):[],wavegen:wave,
        score:Number.isFinite(state.score)?state.score:0,gdx:0,gdy:0,comboTime:Number.isFinite(state.comboTime)?state.comboTime:0};
    } finally {window.MainHex = previous;}
  }
  // The normal export makes a copy; omit the duplicate wave reference explicitly.
  JSONfn.parse = parse;
  JSONfn.stringify = state => {
    const wave = {};
    for (const [key,value] of Object.entries(state.wavegen || {})) if (key !== 'hex' && typeof value !== 'function') wave[key] = value;
    return JSON.stringify({...state,wavegen:wave,pattern:patterns.find(name=>state.wavegen?.currentFunction===state.wavegen?.[name])},(key,value)=>typeof value==='function'||key==='texts'||key==='shakes'?undefined:value);
  };
  function flush() {
    if (!window.MainHex || !window.waveone || ![1,-1,0].includes(window.gameState)) return;
    try {localStorage.setItem('saveState',exportSaveState());} catch {}
  }
  window.SiteGameSave = Object.freeze({flush});
  addEventListener('pagehide',flush);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)flush();});
  setInterval(flush,1000);
})();
