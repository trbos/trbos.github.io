(() => {
  'use strict';
  const script = document.currentScript;
  const configUrl = new URL('./player.json',location.href);
  const directory = new URL('./',configUrl);
  const gameId = directory.pathname.match(/\/games\/([a-z0-9][a-z0-9-]{0,50})\/$/)?.[1];
  const helperUrl = new URL('./unity-assets.js',script.src);
  const host = document.getElementById('unity-frame-host');
  const loading = document.getElementById('unity-loading');
  const progress = document.getElementById('unity-progress');
  const error = document.getElementById('unity-error');
  const names = ['loader','framework','data','code'];
  const kinds = {loader:'application/javascript',framework:'application/javascript',data:'application/octet-stream',code:'application/wasm'};
  const LIMIT = 25*1024*1024;
  const startupLabels = {assets:'Receiving game files',decode:'Preparing game files',loader:'Starting game loader','engine-assets':'Reading engine files','engine-init':'Starting game engine',render:'Rendering game'};
  let epoch = 0, controller = null, frame = null, channel = null, timer = null, current = null, diskPromise = null, viewport = null;
  const attr = value => String(value).replace(/[&"<>]/g,c=>({'&':'&amp;','"':'&quot;','<':'&lt;','>':'&gt;'}[c]));
  const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  const validSave=value=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>2000)return false;for(const [k,v]of Object.entries(value))if(k.length>200||typeof v!=='string'||v.length>524288)return false;return JSON.stringify(value).length<=1048576;};
  const notify = type => {if (parent !== window && gameId) parent.postMessage({type,id:gameId,...(type==='game:error'?{reason:window.UnityPlayerStatus.displayError}:{})},location.origin);};
  function disk(){
    if(!diskPromise)diskPromise=new Promise((resolve,reject)=>{
      let done=false;const t=setTimeout(()=>{done=true;reject(Error('cache_timeout'));},1500);
      try{const r=indexedDB.open('trbosGameAssets',1);r.onupgradeneeded=()=>r.result.createObjectStore('assets');r.onsuccess=()=>{if(done){r.result.close();return;}done=true;clearTimeout(t);r.result.onversionchange=()=>r.result.close();resolve(r.result);};r.onerror=r.onblocked=()=>{done=true;clearTimeout(t);reject(Error('cache_unavailable'));};}
      catch{done=true;clearTimeout(t);reject(Error('cache_unavailable'));}
    });return diskPromise;
  }
  async function diskEntry(key,bytes){
    const db=await disk();return new Promise((resolve,reject)=>{
      const tx=db.transaction('assets',bytes?'readwrite':'readonly'),store=tx.objectStore('assets');let result;
      const t=setTimeout(()=>{try{tx.abort();}catch{}reject(Error('cache_timeout'));},1500);
      const r=bytes?store.put(bytes.buffer.slice(0),key):store.get(key);r.onsuccess=()=>{result=r.result;};
      tx.oncomplete=()=>{clearTimeout(t);resolve(result instanceof ArrayBuffer?new Uint8Array(result):result);};tx.onerror=tx.onabort=()=>{clearTimeout(t);reject(Error('cache_unavailable'));};
    });
  }
  function dispose(){clearTimeout(timer);controller?.abort();channel?.close();channel=null;frame?.remove();frame=null;viewport=null;}
  function fit(){
    if(!frame||!viewport)return;
    const scale=Math.min(host.clientWidth/viewport.width,host.clientHeight/viewport.height);
    frame.style.transform='translate(-50%,-50%) scale('+scale+')';
  }
  function timeout(version){
    const status=window.UnityPlayerStatus,label=startupLabels[status.startupStep],r=status.render;
    const detail=status.startupStep==='render'&&r?' (frames '+r.frames+'; pixels '+r.visible+'/'+r.colored+'; '+(r.lost?'context lost':r.width+'x'+r.height)+')':'';
    fail(version,(label?label+' timed out':'Loading timed out')+detail+'.');
  }
  function fail(version,reason){
    if(version!==epoch)return;
    const message=String(reason?.message||reason||'');
    let label=message?message.replace(/\s+/g,' ').slice(0,140):'Unable to load game.';
    const http=/asset_http_(\d{3})/.exec(message);
    if(http)label='Download failed ('+http[1]+').';
    else if(/asset_integrity|asset_truncated|asset_too_large/.test(message))label='Game download was incomplete.';
    else if(/download_stalled|Failed to fetch|Load failed|NetworkError/.test(message))label='Connection failed.';
    else if(/WebGL 2|WebGL2/.test(message))label='WebGL 2 is unavailable.';
    else if(/WebGL/.test(message))label='WebGL is unavailable.';
    else if(/WebAssembly/.test(message))label='WebAssembly is unavailable.';
    loading.hidden=true;error.hidden=false;error.querySelector('p').textContent=label;
    Object.assign(window.UnityPlayerStatus,{phase:'error',reason:message.slice(0,240),displayError:label});
    notify('game:error');dispose();
  }
  function validate(value){
    if(!value||value.version!==1||value.id!==gameId||typeof value.title!=='string'||value.title.length>80||typeof value.runtimeHtml!=='string'||value.runtimeHtml.length>65536||!/<head(?:\s[^>]*)?>/i.test(value.runtimeHtml))throw Error();
    if(!value.assets||Object.keys(value.assets).length!==names.length)throw Error();
    if(value.viewport!==undefined&&(!value.viewport||Object.keys(value.viewport).length!==2||value.viewport.width!==600||value.viewport.height!==1000))throw Error();
    let total=0;
    for(const name of names){const a=value.assets[name];if(!a||!/^Build\/[A-Za-z0-9_.-]+$/.test(a.path)||!Number.isSafeInteger(a.bytes)||a.bytes<1||!/^[a-f0-9]{64}$/.test(a.sha256))throw Error();total+=a.bytes;if(total>LIMIT)throw Error();}
    return {...value,total};
  }
  async function manifest(signal){
    for(let attempt=0;attempt<3;attempt++)try{
      const response=await fetch(configUrl,{credentials:'omit',cache:'no-cache',referrerPolicy:'no-referrer',signal});
      if(!response.ok)throw Object.assign(Error('asset_http_'+response.status),{permanent:![408,429,500,502,503,504].includes(response.status)});
      const text=await response.text();if(text.length>100000)throw Object.assign(Error('asset_too_large'),{permanent:true});return text;
    }catch(error){if(signal.aborted||error.permanent||attempt===2)throw error;window.UnityPlayerStatus.networkRetries++;}
  }
  async function assets(config,signal,version){
    const values={},counts={};let lastSignal=0;
    const update=(name,n)=>{counts[name]=n;if(version===epoch){
      const received=Object.values(counts).reduce((a,b)=>a+b,0);
      if(performance.now()-lastSignal>500){lastSignal=performance.now();clearTimeout(timer);timer=setTimeout(()=>timeout(version),60000);if(channel)channel.postMessage({progress:true});notify('game:progress');}
      progress.value=Math.min(1,received/config.total);window.UnityPlayerStatus.bytes=received;
    }};
    await Promise.all(names.map(async name=>{
      const spec=config.assets[name],url=new URL(spec.path,directory);url.searchParams.set('v',spec.sha256);
      if(url.origin!==location.origin||!url.pathname.startsWith(directory.pathname+'Build/'))throw Error();
      let bytes,hit=false;
      try{const body=await diskEntry(url.href);if(body instanceof Uint8Array&&body.length===spec.bytes&&await digest(body)===spec.sha256){bytes=body;hit=true;}else window.UnityPlayerStatus.cacheMissReasons.push(name+':missing-or-changed');}catch{window.UnityPlayerStatus.cacheMissReasons.push(name+':unavailable');}
      if(hit){update(name,bytes.length);window.UnityPlayerStatus.cacheHits++;window.UnityPlayerStatus.cacheBackend='indexeddb';}
      else{
        bytes=await window.downloadGameAsset(url,{expected:spec.bytes,signal,onProgress:n=>update(name,n),onRetry:()=>{if(version===epoch)window.UnityPlayerStatus.networkRetries++;}});
        if(await digest(bytes)!==spec.sha256)throw Error('asset_integrity');
        try{await diskEntry(url.href,bytes);window.UnityPlayerStatus.cacheBackend='indexeddb';}catch{window.UnityPlayerStatus.cacheBackend='unavailable';}
      }
      if(signal.aborted||version!==epoch)throw Error();values[name]={buffer:bytes.buffer,type:kinds[name]};
    }));
    return values;
  }
  async function start(){
    const version=++epoch;dispose();current=null;controller=new AbortController();const signal=controller.signal;
    document.body.dataset.phase='loading';loading.hidden=false;error.hidden=true;progress.value=0;
    window.UnityPlayerStatus={phase:'loading',cacheHits:0,cacheMissReasons:[],networkRetries:0,bytes:0,startedAt:performance.now()};
    timer=setTimeout(()=>timeout(version),60000);
    try{
      const text=await manifest(signal);const config=validate(JSON.parse(text));if(version!==epoch)return;current=config;document.title=config.title;window.UnityPlayerStatus.id=config.id;
      const policy="default-src 'none'; script-src "+directory.href+' '+helperUrl.href+' '+new URL('./local-platform.js',script.src).href+' '+new URL('./other-platform.js',script.src).href+" blob: 'unsafe-eval' 'wasm-unsafe-eval'; style-src "+directory.href+" 'unsafe-inline'; img-src "+directory.href+" blob: data:; connect-src "+directory.href+" blob:; worker-src "+directory.href+" blob:; media-src "+directory.href+" blob: data:; font-src "+directory.href+"; frame-src 'none'; base-uri "+directory.href+"; form-action 'none'; object-src 'none'";
      const prefix='<meta http-equiv="Content-Security-Policy" content="'+attr(policy)+'"><base href="'+attr(directory.href)+'"><script src="'+attr(helperUrl.href)+'" data-game="'+config.id+'"></script>';
      frame=document.createElement('iframe');frame.title=config.title;frame.setAttribute('sandbox','allow-scripts allow-pointer-lock');frame.allow='autoplay; fullscreen *; gamepad';frame.allowFullscreen=true;frame.referrerPolicy='no-referrer';
      frame.srcdoc=config.runtimeHtml.replace(/<head(?:\s[^>]*)?>/i,match=>match+prefix);
      if(config.viewport){viewport=config.viewport;frame.style.cssText='inset:auto;left:50%;top:50%;width:'+viewport.width+'px;height:'+viewport.height+'px;transform-origin:center';}
      host.replaceChildren(frame);fit();
    }catch(reason){fail(version,reason);}
  }
  window.addEventListener('message',async event=>{
    if(!current||!frame||event.source!==frame.contentWindow||event.origin!=='null'||event.data?.id!==current.id)return;
    const version=epoch;
    if(event.data.type==='game:save-load'){
      let values={};try{const text=localStorage.getItem('trbosGameSave:'+current.id)||'{}';if(text.length<=1048576){const saved=JSON.parse(text);if(validSave(saved))values=saved;}}catch{}if(event.ports.length===1){event.ports[0].postMessage(values);event.ports[0].close();}
    }else if(event.data.type==='game:save-write'){
      try{const values=event.data.values;if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).length>2000)return;for(const [k,v]of Object.entries(values))if(k.length>200||typeof v!=='string'||v.length>524288)return;const text=JSON.stringify(values);if(text.length<=1048576)localStorage.setItem('trbosGameSave:'+current.id,text);}catch{}
    }else if(event.data.type==='game:assets'){
      if(channel||event.ports.length!==1)return;channel=event.ports[0];const port=channel;
      try{const values=await assets(current,controller.signal,version);if(version!==epoch)return;document.body.dataset.phase='engine';port.postMessage({ok:true,values},names.map(name=>values[name].buffer));port.close();}
      catch(reason){try{port.postMessage({ok:false});port.close();}catch{}fail(version,reason);}
    }else if(event.data.type==='game:startup'){
      if(Object.hasOwn(startupLabels,event.data.step))window.UnityPlayerStatus.startupStep=event.data.step;
    }else if(event.data.type==='game:render'){
      const r=event.data.render;
      if(r&&['frames','visible','colored','width','height'].every(key=>Number.isSafeInteger(r[key])&&r[key]>=0&&r[key]<=10000000)&&typeof r.lost==='boolean')window.UnityPlayerStatus.render={frames:r.frames,visible:r.visible,colored:r.colored,width:r.width,height:r.height,lost:r.lost};
    }else if(event.data.type==='game:ready'){
      clearTimeout(timer);loading.hidden=true;error.hidden=true;window.UnityPlayerStatus.phase='ready';window.UnityPlayerStatus.readyAt=performance.now();notify('game:ready');
    }else if(event.data.type==='game:error')fail(version,event.data.reason);
  });
  document.getElementById('unity-retry').addEventListener('click',()=>void start());
  window.addEventListener('resize',fit);
  window.addEventListener('pagehide',()=>{epoch++;dispose();});
  void start();
})();
