(() => {
  'use strict';
  const script = document.currentScript;
  const configUrl = new URL('./player.json',location.href);
  const directory = new URL('./',configUrl);
  const gameId = directory.pathname.match(/\/games\/([a-z0-9][a-z0-9-]{0,50})\/$/)?.[1];
  const helperUrl = new URL('./unity-assets.js',script.src);
  helperUrl.searchParams.set('v','startup-2');
  const host = document.getElementById('unity-frame-host');
  const loading = document.getElementById('unity-loading');
  const progress = document.getElementById('unity-progress');
  const error = document.getElementById('unity-error');
  const names = ['loader','framework','data','code'];
  const kinds = {loader:'application/javascript',framework:'application/javascript',data:'application/octet-stream',code:'application/wasm'};
  const LIMIT = 25*1024*1024;
  let epoch = 0, controller = null, frame = null, channel = null, timer = null, current = null, diskPromise = null, viewport = null;
  const attr = value => String(value).replace(/[&"<>]/g,c=>({'&':'&amp;','"':'&quot;','<':'&lt;','>':'&gt;'}[c]));
  const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  const notify = type => {if (parent !== window && gameId) parent.postMessage({type,id:gameId},location.origin);};
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
  function fail(version){if(version!==epoch)return;loading.hidden=true;error.hidden=false;window.UnityPlayerStatus.phase='error';notify('game:error');dispose();}
  function validate(value){
    if(!value||value.version!==1||value.id!==gameId||typeof value.title!=='string'||value.title.length>80||typeof value.runtimeHtml!=='string'||value.runtimeHtml.length>65536||!/<head(?:\s[^>]*)?>/i.test(value.runtimeHtml))throw Error();
    if(!value.assets||Object.keys(value.assets).length!==names.length)throw Error();
    if(value.viewport!==undefined&&(!value.viewport||Object.keys(value.viewport).length!==2||value.viewport.width!==600||value.viewport.height!==1000))throw Error();
    if(value.startupTimeoutMs!==undefined&&(!Number.isSafeInteger(value.startupTimeoutMs)||value.startupTimeoutMs<30000||value.startupTimeoutMs>120000))throw Error();
    let total=0;
    for(const name of names){const a=value.assets[name];if(!a||!/^Build\/[A-Za-z0-9_.-]+$/.test(a.path)||!Number.isSafeInteger(a.bytes)||a.bytes<1||!/^[a-f0-9]{64}$/.test(a.sha256))throw Error();total+=a.bytes;if(total>LIMIT)throw Error();}
    return {...value,total};
  }
  async function read(response,expected,update){
    if(!response.ok)throw Error();const length=response.headers.get('content-length');if(length&&Number(length)>expected)throw Error();
    const reader=response.body?.getReader();
    if(!reader){const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length!==expected)throw Error();update(bytes.length);return bytes;}
    const parts=[];let size=0;
    try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>expected)throw Error();parts.push(chunk.value);update(chunk.value.length);}if(size!==expected)throw Error();}
    finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}return bytes;
  }
  async function assets(config,signal,version){
    const values={};let received=0;
    const update=n=>{received+=n;if(version===epoch){progress.value=Math.min(1,received/config.total);window.UnityPlayerStatus.bytes=received;}};
    await Promise.all(names.map(async name=>{
      const spec=config.assets[name],url=new URL(spec.path,directory);url.searchParams.set('v',spec.sha256);
      if(url.origin!==location.origin||!url.pathname.startsWith(directory.pathname+'Build/'))throw Error();
      let bytes,hit=false;
      try{const body=await diskEntry(url.href);if(body instanceof Uint8Array&&body.length===spec.bytes&&await digest(body)===spec.sha256){bytes=body;hit=true;}else window.UnityPlayerStatus.cacheMissReasons.push(name+':missing-or-changed');}catch{window.UnityPlayerStatus.cacheMissReasons.push(name+':unavailable');}
      if(hit){update(bytes.length);window.UnityPlayerStatus.cacheHits++;window.UnityPlayerStatus.cacheBackend='indexeddb';}
      else{
        const response=await fetch(url,{credentials:'omit',cache:'reload',referrerPolicy:'no-referrer',signal});
        bytes=await read(response,spec.bytes,update);if(await digest(bytes)!==spec.sha256)throw Error();
        try{await diskEntry(url.href,bytes);window.UnityPlayerStatus.cacheBackend='indexeddb';}catch{window.UnityPlayerStatus.cacheBackend='unavailable';}
      }
      if(signal.aborted||version!==epoch)throw Error();values[name]={buffer:bytes.buffer,type:kinds[name]};
    }));
    return values;
  }
  async function start(){
    const version=++epoch;dispose();current=null;controller=new AbortController();const signal=controller.signal;
    loading.hidden=false;error.hidden=true;progress.value=0;
    window.UnityPlayerStatus={phase:'loading',cacheHits:0,cacheMissReasons:[],bytes:0,startedAt:performance.now()};
    timer=setTimeout(()=>fail(version),30000);
    try{
      const response=await fetch(configUrl,{credentials:'omit',cache:'no-cache',referrerPolicy:'no-referrer',signal});if(!response.ok)throw Error();
      const text=await response.text();if(text.length>100000)throw Error();const config=validate(JSON.parse(text));if(version!==epoch)return;current=config;document.title=config.title;window.UnityPlayerStatus.id=config.id;
      const startupTimeout=config.startupTimeoutMs||30000;
      clearTimeout(timer);timer=setTimeout(()=>fail(version),startupTimeout);
      const policy="default-src 'none'; script-src "+directory.href+' '+helperUrl.origin+helperUrl.pathname+" blob: 'unsafe-eval' 'wasm-unsafe-eval'; style-src "+directory.href+" 'unsafe-inline'; img-src "+directory.href+" blob: data:; connect-src "+directory.href+" blob:; worker-src "+directory.href+" blob:; media-src "+directory.href+" blob: data:; font-src "+directory.href+"; frame-src 'none'; base-uri "+directory.href+"; form-action 'none'; object-src 'none'";
      const prefix='<meta http-equiv="Content-Security-Policy" content="'+attr(policy)+'"><base href="'+attr(directory.href)+'"><script src="'+attr(helperUrl.href)+'" data-game="'+config.id+'" data-timeout="'+startupTimeout+'"></script>';
      frame=document.createElement('iframe');frame.title=config.title;frame.setAttribute('sandbox','allow-scripts allow-pointer-lock');frame.allow='autoplay; fullscreen *; gamepad';frame.allowFullscreen=true;frame.referrerPolicy='no-referrer';
      frame.srcdoc=config.runtimeHtml.replace(/<head(?:\s[^>]*)?>/i,match=>match+prefix);
      if(config.viewport){viewport=config.viewport;frame.style.cssText='inset:auto;left:50%;top:50%;width:'+viewport.width+'px;height:'+viewport.height+'px;transform-origin:center';}
      host.replaceChildren(frame);fit();
    }catch{fail(version);}
  }
  window.addEventListener('message',async event=>{
    if(!current||!frame||event.source!==frame.contentWindow||event.origin!=='null'||event.data?.id!==current.id)return;
    const version=epoch;
    if(event.data.type==='game:assets'){
      if(channel||event.ports.length!==1)return;channel=event.ports[0];const port=channel;
      try{const values=await assets(current,controller.signal,version);if(version!==epoch)return;port.postMessage({ok:true,values},names.map(name=>values[name].buffer));port.close();}
      catch{try{port.postMessage({ok:false});port.close();}catch{}fail(version);}
    }else if(event.data.type==='game:ready'){
      clearTimeout(timer);loading.hidden=true;error.hidden=true;window.UnityPlayerStatus.phase='ready';window.UnityPlayerStatus.readyAt=performance.now();notify('game:ready');
    }else if(event.data.type==='game:error')fail(version);
  });
  document.getElementById('unity-retry').addEventListener('click',()=>void start());
  window.addEventListener('resize',fit);
  window.addEventListener('pagehide',()=>{epoch++;dispose();});
  void start();
})();
