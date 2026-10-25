(()=>{
  const storage=window.localStorage,prefix='trbos.crossy-road.v2.';
  const names=()=>Object.keys(storage).filter(k=>k.startsWith(prefix)).map(k=>k.slice(prefix.length));
  const methods={getItem:k=>storage.getItem(prefix+k),setItem:(k,v)=>storage.setItem(prefix+k,String(v)),removeItem:k=>storage.removeItem(prefix+k),clear:()=>names().forEach(k=>storage.removeItem(prefix+k)),key:i=>names()[i]??null};
  Object.defineProperty(window,'localStorage',{configurable:true,value:new Proxy(Object.create(null),{get:(_,k)=>k==='length'?names().length:Object.hasOwn(methods,k)?methods[k]:typeof k==='string'?storage.getItem(prefix+k):undefined,set:(_,k,v)=>{storage.setItem(prefix+String(k),String(v));return true;},deleteProperty:(_,k)=>{storage.removeItem(prefix+String(k));return true;},ownKeys:names,getOwnPropertyDescriptor:(_,k)=>names().includes(k)?{configurable:true,enumerable:true,value:storage.getItem(prefix+k),writable:true}:undefined})});

  const base=new URL('.',location.href),pack=window.CrossyAudioPack||{},urls=new Map();
  function local(value){
    if(typeof value!=='string')return value;
    if(/^https:\/\/s3-eu-west-1\.amazonaws\.com\/hipster-whale\/upsell-text\.txt/.test(value))return new URL('upsell-text.txt',base).href;
    if(/^https:\/\/s3-eu-west-1\.amazonaws\.com\/hipster-whale\/upsell-phone\.png/.test(value))return new URL('sprites/chicken.png',base).href;
    let url;try{url=new URL(value,base);}catch{return value;}
    if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname))return value;
    const key=decodeURIComponent(url.pathname.slice(base.pathname.length));if(urls.has(key))return urls.get(key);
    if(!Object.hasOwn(pack,key))return value;
    const binary=atob(pack[key]),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));const blob=URL.createObjectURL(new Blob([bytes],{type:'audio/mpeg'}));urls.set(key,blob);delete pack[key];return blob;
  }
  if(localStorage.getItem('selectedChar')===null){localStorage.setItem('currentWorld','original_cast');localStorage.setItem('selectedChar','0');}
  const open=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(method,url,...args){return open.call(this,method,local(url),...args);};
  for(const proto of[HTMLMediaElement.prototype,HTMLImageElement.prototype]){const descriptor=Object.getOwnPropertyDescriptor(proto,'src');if(descriptor?.set)Object.defineProperty(proto,'src',{...descriptor,set(value){return descriptor.set.call(this,local(value));}});}
  const AudioNative=window.Audio;window.Audio=function(src){return new AudioNative(src===undefined?undefined:local(src));};window.Audio.prototype=AudioNative.prototype;
  window.ga=()=>{};
  const create=document.createElement.bind(document),src=Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype,'src');
  document.createElement=function(tag,...args){const el=create(tag,...args);if(String(tag).toLowerCase()==='script'){const old=Object.getOwnPropertyDescriptor(el,'src')||src;Object.defineProperty(el,'src',{configurable:true,get(){return old.get.call(this);},set(value){
    if(/google-analytics|googletagmanager|cloudflareinsights/.test(String(value))||/scripts\/three\.min\.js/.test(String(value))&&window.THREE||/scripts\/tween\.min\.js/.test(String(value))&&window.TWEEN){setTimeout(()=>this.onload?.(),0);return;}if(/scripts\/game\.min\.js/.test(String(value))&&window.AssetLoader&&!window.CrossyWorldsPreloaded){
      window.CrossyWorldsPreloaded=true;const loader=window.AssetLoader;
      const selected=localStorage.getItem('currentWorld');
      for(const world of[['original_cast','space','dinosaur'].includes(selected)?selected:'original_cast']){if(!loader.isWorldLoaded(world)){loader.add('models/'+world+'-world.json');if(loader.worlds[world])loader.worlds[world].loading=true;}if(!loader.areCharactersLoaded(world)){loader.add('models/'+world+'-char.json');if(loader.characters[world])loader.characters[world].loading=true;}}
      loader.load(()=>old.set.call(this,value));return;
    }old.set.call(this,value);
  }});}return el;};
})();
(()=>{let ready=false,started=performance.now();const post=type=>parent.postMessage({type,id:'crossy-road'},location.origin);const timer=setInterval(()=>{const loader=window.AssetLoader,canvas=document.querySelector('canvas');if(loader&&loader.getProgress()===1&&Object.values(loader.worlds||{}).some(w=>w.loaded)&&canvas?.width>0&&canvas?.height>0&&canvas.id!=='hipster-whale'&&!document.getElementById('loading-bar')){clearInterval(timer);requestAnimationFrame(()=>requestAnimationFrame(()=>{ready=true;post('game:ready');}));}else{post('game:progress');if(performance.now()-started>55000){clearInterval(timer);post('game:error');}}},250);window.addEventListener('error',e=>{if(e.error||e.target instanceof HTMLScriptElement)post('game:error');},true);window.addEventListener('unhandledrejection',()=>post('game:error'));})();
