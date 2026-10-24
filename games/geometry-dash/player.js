(() => {
  'use strict';
  const id='geometry-dash', directory=new URL('./',document.currentScript.src), saveKey='trbos.geometryDash.save.v1';
  const host=document.getElementById('host'),loading=document.getElementById('loading'),error=document.getElementById('error');
  const allowedKey=k=>typeof k==='string'&&k.length<=180&&/^(?:gd_[A-Za-z0-9_]+|icon(?:MainColor|SecondaryColor|Current(?:Player|Ship|Ball|Wave|Spider|Bird|Robot))|userMusicVol|userSfxVol|menuMusicEnabled|playerName|created_levels|bestPercent_[A-Za-z0-9_-]+|practiceBestPercent_[A-Za-z0-9_-]+|viewedLevel_[A-Za-z0-9_-]+)$/.test(k);
  const escape=s=>String(s).replace(/[&"<>]/g,c=>({'&':'&amp;','"':'&quot;','<':'&lt;','>':'&gt;'}[c]));
  const digest=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),n=>n.toString(16).padStart(2,'0')).join('');
  let frame,port,timer,epoch=0,dbPromise,manifest,run,writeTail=Promise.resolve(),disconnect=()=>{},save={};
  let parentOrigin=location.origin;try{parentOrigin=new URL(document.referrer).origin;}catch{}
  // Only this game's values enter the opaque frame; launcher auth/storage never does.
  try{const data=JSON.parse(localStorage.getItem(saveKey)||'{}');if(data&&typeof data==='object')for(const [k,v] of Object.entries(data))if(allowedKey(k)&&typeof v==='string'&&v.length<=1048576)save[k]=v;}catch{}
  function notify(type){if(parent!==window&&parentOrigin===location.origin)parent.postMessage({type,id},parentOrigin);}
  function fail(version){if(version!==epoch||window.GeometryPlayerStatus.phase==='error')return;clearTimeout(timer);disconnect();run?.controller.abort();port?.close();frame?.remove();loading.hidden=true;error.hidden=false;window.GeometryPlayerStatus.phase='error';notify('game:error');}
  function disk(){if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{let settled=false;const t=setTimeout(()=>{settled=true;reject(Error('cache_timeout'));},1500);try{const r=indexedDB.open('trbosGeometryAssets',1);r.onupgradeneeded=()=>r.result.createObjectStore('assets');r.onsuccess=()=>{if(settled){r.result.close();return;}settled=true;clearTimeout(t);r.result.onversionchange=()=>r.result.close();resolve(r.result);};r.onerror=r.onblocked=()=>{settled=true;clearTimeout(t);reject(Error('cache_unavailable'));};}catch{clearTimeout(t);reject(Error('cache_unavailable'));}});return dbPromise;}
  async function diskEntry(key,bytes){const db=await disk();return new Promise((resolve,reject)=>{const tx=db.transaction('assets',bytes?'readwrite':'readonly'),store=tx.objectStore('assets');let result;const t=setTimeout(()=>{try{tx.abort();}catch{}reject(Error('cache_timeout'));},5000);const r=bytes?store.put(bytes,key):store.get(key);r.onsuccess=()=>result=r.result;tx.oncomplete=()=>{clearTimeout(t);resolve(result);};tx.onerror=tx.onabort=()=>{clearTimeout(t);reject(Error('cache_unavailable'));};});}
  // Queue writes before creating their transactions. Large atlas reads must not
  // leave dozens of write transactions timing out behind the same IDB lock.
  function entry(key,bytes){if(!bytes)return diskEntry(key);const task=writeTail.catch(()=>{}).then(()=>diskEntry(key,bytes));writeTail=task;return task;}
  function validate(value){if(!value||value.version!==1||value.revision!=='84b123b20bca82066350fefe8b49849a24da701c'||!value.assets||typeof value.assets!=='object'||Array.isArray(value.assets))throw Error('manifest');const entries=Object.entries(value.assets);if(!entries.length||entries.length>400)throw Error('manifest');let total=0;for(const [path,spec] of entries){if(!/^assets\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+$/.test(path)||path.includes('..')||!spec||!Number.isSafeInteger(spec.bytes)||spec.bytes<1||spec.bytes>16777216||!/^[a-f0-9]{64}$/.test(spec.sha256))throw Error('manifest');total+=spec.bytes;}if(total>125829120)throw Error('manifest');return value;}
  async function read(response,size){if(!response.ok||Number(response.headers.get('content-length'))>size)throw Error('asset_http');if(!response.body){const bytes=await response.arrayBuffer();if(bytes.byteLength!==size)throw Error('asset_size');return bytes;}const reader=response.body.getReader(),parts=[];let count=0;try{while(true){const item=await reader.read();if(item.done)break;count+=item.value.byteLength;if(count>size)throw Error('asset_size');parts.push(item.value);}if(count!==size)throw Error('asset_size');}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}const joined=new Uint8Array(count);let offset=0;for(const part of parts){joined.set(part,offset);offset+=part.length;}return joined.buffer;}
  async function asset(path,state){
    const spec=Object.hasOwn(manifest.assets,path)&&manifest.assets[path];if(!spec)throw Error('unknown_asset');
    if(state.pending.has(path))return (await state.pending.get(path)).slice(0);
    const task=(async()=>{const key=spec.sha256;let bytes,miss='not-cached';try{bytes=await entry(key);if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==spec.bytes||await digest(bytes)!==key)bytes=null;}catch{miss='cache-unavailable';}
      if(state.controller.signal.aborted)throw Error('aborted');
      if(bytes)state.status.cacheHits++;
      else{if(state.status.cacheMisses.length<8)state.status.cacheMisses.push({path,reason:miss});const url=new URL(path,directory);if(url.origin!==location.origin||!url.pathname.startsWith(directory.pathname+'assets/'))throw Error('asset_path');const response=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer',signal:state.controller.signal});bytes=await read(response,spec.bytes);if(await digest(bytes)!==key)throw Error('asset_integrity');if(state.controller.signal.aborted)throw Error('aborted');try{await entry(key,bytes);}catch{state.status.cacheWriteFailures++;}state.status.downloads++;}
      return bytes;
    })();state.pending.set(path,task);try{return (await task).slice(0);}catch(e){state.pending.delete(path);throw e;}
  }
  async function start(){
    const version=++epoch;clearTimeout(timer);disconnect();run?.controller.abort();port?.close();frame?.remove();port=null;loading.hidden=false;error.hidden=true;
    window.GeometryPlayerStatus={phase:'loading',startedAt:performance.now(),cacheHits:0,downloads:0,cacheMisses:[],assetErrors:[],cacheWriteFailures:0};const state=run={controller:new AbortController(),pending:new Map(),status:window.GeometryPlayerStatus};timer=setTimeout(()=>fail(version),45000);
    try{const response=await fetch(new URL('assets-manifest.json',directory),{credentials:'omit',cache:'no-cache',signal:state.controller.signal});if(!response.ok)throw Error();const text=await response.text();if(text.length>100000)throw Error();manifest=validate(JSON.parse(text));if(version!==epoch)return;
      const nonce=crypto.randomUUID();
      const policy="default-src 'none'; script-src "+directory.href+" blob: 'unsafe-eval'; style-src 'unsafe-inline'; img-src "+directory.href+" blob: data:; media-src "+directory.href+" blob: data:; connect-src "+directory.href+" blob: https://www.boomlings.com https://gd-proxy.webdashers.workers.dev https://gdbrowser.com https://geometrydashfiles.b-cdn.net; worker-src blob:; font-src blob: data:; frame-src 'none'; base-uri "+directory.href+"; form-action 'none'; object-src 'none'";
      frame=document.createElement('iframe');frame.title='Geometry Dash';frame.sandbox='allow-scripts allow-pointer-lock';frame.allow='autoplay; fullscreen *; gamepad';frame.referrerPolicy='no-referrer';
      frame.srcdoc='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover"><meta http-equiv="Content-Security-Policy" content="'+escape(policy)+'"><base href="'+escape(directory.href)+'"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000;touch-action:none}canvas{display:block;margin:auto;touch-action:none}</style><script src="'+escape(new URL('runtime.js',directory))+'" data-nonce="'+nonce+'" data-origin="'+escape(location.origin)+'"><\/script></head><body></body></html>';
      const channel=new MessageChannel();port=channel.port1;
      port.onmessage=async event=>{const data=event.data;if(version!==epoch||!data||data.nonce!==nonce)return;
        if(data.type==='asset'&&Number.isSafeInteger(data.request)&&typeof data.path==='string'){
          try{const bytes=await asset(data.path,state);if(version===epoch)port.postMessage({type:'asset',request:data.request,bytes},[bytes]);}catch(e){if(version===epoch){if(state.status.assetErrors.length<8)state.status.assetErrors.push({path:data.path,reason:e.message});port.postMessage({type:'asset',request:data.request,error:true});}}
        }else if(data.type==='save'&&allowedKey(data.key)&&(data.value===null||typeof data.value==='string'&&data.value.length<=1048576)){
          const next={...save};if(data.value===null)delete next[data.key];else next[data.key]=data.value;const encoded=JSON.stringify(next);if(encoded.length<=4194304){save=next;try{localStorage.setItem(saveKey,encoded);}catch{}}
        }else if(data.type==='ready'){clearTimeout(timer);loading.hidden=true;error.hidden=true;window.GeometryPlayerStatus.phase='ready';window.GeometryPlayerStatus.readyAt=performance.now();notify('game:ready');}
        else if(data.type==='error')fail(version);
      };
      const connect=event=>{if(version!==epoch){window.removeEventListener('message',connect);return;}if(event.source===frame.contentWindow&&event.origin==='null'&&event.data?.type==='geometry:connect'&&event.data?.nonce===nonce){window.removeEventListener('message',connect);frame.contentWindow.postMessage({type:'geometry:port',nonce,save},'*',[channel.port2]);}};
      disconnect=()=>window.removeEventListener('message',connect);window.addEventListener('message',connect);host.replaceChildren(frame);
    }catch{fail(version);}
  }
  document.getElementById('retry').onclick=start;window.addEventListener('pagehide',()=>{++epoch;clearTimeout(timer);disconnect();run?.controller.abort();port?.close();frame?.remove();});start();
})();
