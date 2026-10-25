(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory;
  else root.installGameAnimationClock=factory;
})(typeof window==='object'?window:globalThis,function(options){
  'use strict';
  const {scope,visible,stats}=options;
  const request=scope.requestAnimationFrame,cancel=scope.cancelAnimationFrame,pending=new Map();
  let serial=0,lastTime=0,timerMode=false,active=true;
  function arm(entry){
    if(!active||entry.timer!==null||!visible())return;
    entry.timer=scope.setTimeout(()=>{
      entry.timer=null;
      if(visible())deliver(entry,scope.performance.now(),'timer');
    },timerMode?1000/60:500);
  }
  function deliver(entry,time,source){
    if(!pending.delete(entry.id))return;
    if(entry.timer!==null)scope.clearTimeout(entry.timer);
    cancel.call(scope,entry.native);
    timerMode=source==='timer';stats[source]++;
    lastTime=Math.max(lastTime,Number.isFinite(time)?time:scope.performance.now());
    entry.callback(lastTime);
  }
  function schedule(callback){
    if(typeof callback!=='function')throw new TypeError('Animation callback must be a function');
    if(!active)return request.call(scope,callback);
    const entry={id:++serial,callback,native:null,timer:null};pending.set(entry.id,entry);
    entry.native=request.call(scope,time=>deliver(entry,time,'native'));arm(entry);
    return entry.id;
  }
  function unschedule(id){
    const entry=pending.get(id);
    if(!entry)return;
    pending.delete(id);if(entry.timer!==null)scope.clearTimeout(entry.timer);cancel.call(scope,entry.native);
  }
  function visibilityChanged(){
    for(const entry of pending.values()){
      if(entry.timer!==null){scope.clearTimeout(entry.timer);entry.timer=null;}
      arm(entry);
    }
  }
  scope.requestAnimationFrame=schedule;scope.cancelAnimationFrame=unschedule;
  scope.document.addEventListener('visibilitychange',visibilityChanged);
  return {dispose(){
    if(!active)return;active=false;
    for(const id of pending.keys())unschedule(id);
    scope.document.removeEventListener('visibilitychange',visibilityChanged);
    if(scope.requestAnimationFrame===schedule)scope.requestAnimationFrame=request;
    if(scope.cancelAnimationFrame===unschedule)scope.cancelAnimationFrame=cancel;
  }};
});
