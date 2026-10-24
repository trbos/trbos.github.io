(() => {
  'use strict';
  const currentScript=document.currentScript,seed={nonce:currentScript.dataset.nonce,origin:currentScript.dataset.origin},base=new URL('./',document.baseURI),pending=new Map(),blobs=new Map(),blobUrls=new Map();
  let port,serial=0;
  const connected=new Promise(resolve=>{const receive=e=>{if(e.source!==parent||e.origin!==seed.origin||e.data?.type!=='geometry:port'||e.data.nonce!==seed.nonce||e.ports.length!==1)return;window.removeEventListener('message',receive);seed.save=e.data.save;port=e.ports[0];port.onmessage=event=>{const d=event.data;if(d?.type!=='asset')return;const item=pending.get(d.request);if(!item)return;pending.delete(d.request);clearTimeout(item.timer);d.error?item.reject(Error('asset_unavailable')):item.resolve(d.bytes);};resolve();};window.addEventListener('message',receive);parent.postMessage({type:'geometry:connect',nonce:seed.nonce},seed.origin);});
  function tell(type,extra={}){port?.postMessage({type,nonce:seed.nonce,...extra});}
  function memoryStorage(initial,persist){const data=Object.assign(Object.create(null),initial),methods={getItem:k=>Object.hasOwn(data,String(k))?data[String(k)]:null,setItem:(k,v)=>{k=String(k);v=String(v);data[k]=v;if(persist)tell('save',{key:k,value:v});},removeItem:k=>{k=String(k);delete data[k];if(persist)tell('save',{key:k,value:null});},clear:()=>{for(const k of Object.keys(data))methods.removeItem(k);},key:i=>Object.keys(data)[i]??null};return new Proxy(methods,{get:(t,k)=>k==='length'?Object.keys(data).length:k in t?t[k]:data[k],set:(t,k,v)=>{methods.setItem(k,v);return true;},deleteProperty:(t,k)=>{methods.removeItem(k);return true;},ownKeys:()=>Object.keys(data),getOwnPropertyDescriptor:(t,k)=>Object.hasOwn(data,k)?{configurable:true,enumerable:true,value:data[k],writable:true}:undefined});}
  function pathFor(value){try{const url=new URL(value,base);return url.origin===base.origin&&url.pathname.startsWith(base.pathname+'assets/')?decodeURIComponent(url.pathname.slice(base.pathname.length)):null;}catch{return null;}}
  async function read(path){await connected;return new Promise((resolve,reject)=>{const request=++serial,timer=setTimeout(()=>{pending.delete(request);reject(Error('asset_timeout'));},30000);pending.set(request,{resolve,reject,timer});tell('asset',{path,request});});}
  function mime(path){return path.endsWith('.js')?'application/javascript':path.endsWith('.json')?'application/json':path.endsWith('.png')?'image/png':path.endsWith('.mp3')?'audio/mpeg':path.endsWith('.ogg')?'audio/ogg':path.endsWith('.wav')?'audio/wav':'text/plain';}
  async function blob(path){if(!blobs.has(path))blobs.set(path,read(path).then(bytes=>{const url=URL.createObjectURL(new Blob([bytes],{type:mime(path)}));blobUrls.set(path,url);return url;}).catch(error=>{tell('error');throw error;}));return blobs.get(path);}
  const mediaSrc=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'src'),nativeLoad=HTMLMediaElement.prototype.load;
  Object.defineProperty(HTMLMediaElement.prototype,'src',{...mediaSrc,set(value){const path=pathFor(value);if(!path){mediaSrc.set.call(this,value);return;}if(blobUrls.has(path)){mediaSrc.set.call(this,blobUrls.get(path));return;}const version=this._geometryMediaVersion=(this._geometryMediaVersion||0)+1;blob(path).then(url=>{if(this._geometryMediaVersion!==version)return;mediaSrc.set.call(this,url);nativeLoad.call(this);}).catch(()=>this.dispatchEvent(new Event('error')));}});
  const nativeFetch=window.fetch.bind(window);window.fetch=async(input,init)=>{const path=pathFor(typeof input==='string'?input:input.url);return path?new Response(await read(path),{status:200,headers:{'Content-Type':mime(path)}}):nativeFetch(input,init);};
  // Phaser's normal XHR/image/audio loaders consume verified public asset Blobs.
  const NativeXHR=window.XMLHttpRequest,open=NativeXHR.prototype.open,send=NativeXHR.prototype.send,abort=NativeXHR.prototype.abort;
  NativeXHR.prototype.open=function(method,url,async=true,...rest){this._geometryPath=method==='GET'?pathFor(url):null;this._geometryStopped=false;return open.call(this,method,url,async,...rest);};
  NativeXHR.prototype.send=function(body){if(!this._geometryPath)return send.call(this,body);const path=this._geometryPath,responseType=this.responseType,timeout=this.timeout;blob(path).then(url=>{if(this._geometryStopped)return;open.call(this,'GET',url,true);this.responseType=responseType;this.timeout=timeout;send.call(this);}).catch(()=>{if(!this._geometryStopped)this.dispatchEvent(new Event('error'));});};
  NativeXHR.prototype.abort=function(){this._geometryStopped=true;return abort.call(this);};
  const scripts=['game/allObjects.js','game/allLevels.js','libs/phaser.min.js','libs/pako.min.js','api/GDapiWrapper.js','utils/config.js','core/triggers.js','core/level.js','core/player.js','core/audio.js','core/loading-screen.js','core/level-editor.js','core/game-scene.js'];
  async function script(path){const element=document.createElement('script');element.src=await blob('assets/scripts/'+path);await new Promise((resolve,reject)=>{element.onload=resolve;element.onerror=reject;document.head.append(element);});}
  async function boot(){
    const timing=window.GeometryBootStatus={startedAt:performance.now()};
    await connected;Object.defineProperty(window,'localStorage',{value:memoryStorage(seed.save,true)});Object.defineProperty(window,'sessionStorage',{value:memoryStorage({},false)});window._gdProxyUrl='https://gd-proxy.webdashers.workers.dev';
    // Read independent public scripts concurrently, execute in upstream order.
    await Promise.all(scripts.map(path=>blob('assets/scripts/'+path)));
    timing.bytesReadyAt=performance.now();
    for(const path of scripts)await script(path);
    timing.scriptsReadyAt=performance.now();
    const preload=BootScene.prototype.preload;BootScene.prototype.preload=function(){timing.preloadAt=performance.now();this.load.on('complete',()=>{(timing.loadsCompleteAt??=[]).push(performance.now());});return preload.call(this);};
    // Song caching is optional in the opaque child; native music still loads normally.
    window.updateLogShown=true;
    let announced=false;
    const originalCreate=GameScene.prototype.create;GameScene.prototype.create=function(){timing.createStartedAt=performance.now();originalCreate.call(this);timing.createFinishedAt=performance.now();if(!announced)this.game.events.once('postrender',()=>{if(this._menuActive&&this._playBtn?.input?.enabled){announced=true;timing.readyAt=performance.now();tell('ready');}else tell('error');});};
    const originalGame=Phaser.Game;Phaser.Game=class extends originalGame{constructor(config){timing.phaserStartedAt=performance.now();super(config);window.GeometryGame=this;}};
    await script('core/main.js');
    window.addEventListener('resize',()=>window.GeometryGame?.scale?.refresh());
    document.addEventListener('contextmenu',e=>e.preventDefault());
  }
  boot().catch(error=>{console.error('Geometry Dash startup failed',error);tell('error');});
  window.addEventListener('pagehide',()=>{port?.close();for(const value of blobs.values())value.then(url=>URL.revokeObjectURL(url));});
})();
