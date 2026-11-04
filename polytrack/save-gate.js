(() => {
  'use strict';
  // A failed launch probe skips only this visit's old-origin recovery. Keep
  // the ordinary encrypted handoff and all local/cloud saves intact.
  let unavailable=false;
  try {
    const key='polytrack:launch:unreachable:v1',value=sessionStorage.getItem(key);
    sessionStorage.removeItem(key);
    const age=Date.now()-Number(value);
    unavailable=value!==null&&age>=0&&age<15000;
  } catch {}
  const returning=location.hash.startsWith('#ptreturn=')||new URLSearchParams(location.search).get('recover')==='old';
  window.polytrackSaveReady=unavailable&&!returning?Promise.resolve(true):window.PolyTrackSaveHandoff.destination().catch(()=>true);
})();
