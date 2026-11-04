(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports) module.exports=factory;
  else {
    void factory(root);
    root.addEventListener('pageshow',event=>{if(event.persisted)void factory(root);});
  }
})(globalThis,async function launchPolyTrack(env){
  'use strict';
  const oldGame='https://p01--wordbuilder--675vggg6lnyg.code.run/polytrack/play/?play=local';
  const fallback=env.location.origin+'/polytrack/';
  let active=true,reachable=false;
  const leave=()=>{active=false;};
  env.addEventListener('pagehide',leave,{once:true});
  try {reachable=await env.PolyTrackSaveHandoff.probe()===true;} catch {}
  if(!active)return;
  env.removeEventListener('pagehide',leave);
  if(!reachable){
    // One visit only. Do not retry a failed host during the game's save gate,
    // or mark an old save as permanently migrated just because it is offline.
    try {env.sessionStorage.setItem('polytrack:launch:unreachable:v1',String(Date.now()));} catch {}
  }
  env.location.replace(reachable?oldGame:fallback);
});
