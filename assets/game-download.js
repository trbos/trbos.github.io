(function(root,factory){'use strict';if(typeof module==='object'&&module.exports)module.exports=factory;else root.downloadGameAsset=factory;})(globalThis,async function downloadGameAsset(url,options){
 'use strict';
 const {expected,signal,onProgress=()=>{},onRetry=()=>{},fetcher=fetch,stallMs=15000,attempts=3}=options;
 if(!Number.isSafeInteger(expected)||expected<1||expected>25*1024*1024)throw Error('invalid_asset');
 const bytes=new Uint8Array(expected);let offset=0,etag=null;
 const permanent=message=>Object.assign(Error(message),{permanent:true});
 for(let attempt=0;attempt<attempts;attempt++){
  signal?.throwIfAborted();
  const controller=new AbortController();let timer,reader;
  const abort=()=>controller.abort(signal.reason);
  signal?.addEventListener('abort',abort,{once:true});
  const arm=()=>{clearTimeout(timer);timer=setTimeout(()=>controller.abort(Error('download_stalled')),stallMs);};
  try{
   const start=offset,headers={};
   if(start){headers.Range='bytes='+start+'-';if(etag)headers['If-Range']=etag;}
   arm();
   const response=await fetcher(url,{headers,credentials:'omit',cache:'no-cache',referrerPolicy:'no-referrer',signal:controller.signal});
   if(!response.ok){if(![408,429,500,502,503,504].includes(response.status))throw permanent('asset_http_'+response.status);throw Error('asset_http_'+response.status);}
   if(response.status===206){
    const range=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range')||'');
    if(!range||Number(range[1])!==start||Number(range[2])!==expected-1||Number(range[3])!==expected)throw permanent('invalid_asset_range');
   }else{
    // Servers may ignore Range or change ETag. A full response replaces the
    // partial buffer; it must never be appended to it.
    offset=0;onProgress(0);
   }
   const tag=response.headers.get('etag');etag=tag&&!tag.startsWith('W/')?tag:null;
   const length=response.headers.get('content-length');
   if(length&&Number(length)>expected-offset)throw permanent('asset_too_large');
   reader=response.body?.getReader();
   if(!reader)throw permanent('asset_stream_unavailable');
   while(true){
    arm();const chunk=await reader.read();
    if(chunk.done)break;
    if(offset+chunk.value.length>expected)throw permanent('asset_too_large');
    bytes.set(chunk.value,offset);offset+=chunk.value.length;onProgress(offset);
   }
   if(offset!==expected)throw Error('asset_truncated');
   return bytes;
  }catch(error){
   if(signal?.aborted)throw signal.reason;
   if(error.permanent||attempt===attempts-1)throw error;
   onRetry({attempt:attempt+1,bytes:offset});
  }finally{
   clearTimeout(timer);signal?.removeEventListener('abort',abort);
   controller.abort();if(reader){void reader.cancel().catch(()=>{});try{reader.releaseLock();}catch{}}
  }
 }
});
