(() => {
  'use strict';
  const script=document.currentScript,config=JSON.parse(script.dataset.config),id=config.id,canvas=document.getElementById('game');
  const state=window.NativeGameStatus={id,phase:'loading',errors:[],inputEvents:0,frames:0},urls=[];
  let saveValues=Object.create(null);
  const parentOrigin=new URL(document.baseURI).origin;
  const persist=()=>parent.postMessage({type:'game:save-write',id,values:saveValues},parentOrigin);
  const storage={};
  Object.defineProperties(storage,{getItem:{value:key=>Object.hasOwn(saveValues,String(key))?saveValues[String(key)]:null},setItem:{value:(key,value)=>{saveValues[String(key)]=String(value);persist();}},removeItem:{value:key=>{delete saveValues[String(key)];persist();}},clear:{value:()=>{saveValues=Object.create(null);persist();}},key:{value:index=>Object.keys(saveValues)[index]??null},length:{get:()=>Object.keys(saveValues).length}});
  Object.defineProperty(window,'localStorage',{value:storage});
  const saveReady=new Promise(resolve=>{const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();resolve();},1500);channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();if(event.data&&typeof event.data==='object')saveValues=Object.assign(Object.create(null),event.data);resolve();};parent.postMessage({type:'game:save-load',id},parentOrigin,[channel.port2]);});
  // These builds use the platform API for language and boot notifications. This
  // local adapter exposes browser facts, local saves and local ad-skip rewards.
  // It never contacts an ad service or reports purchases or an online identity.
  const language=(navigator.language||'en').split('-')[0];
  let instance,platform,scan=null,stopped=false;
  const notify=type=>parent.postMessage({type:'game:'+type,id,reason:state.errors.at(-1)},parentOrigin);
  // Native music may start before the browser has received a user gesture.
  // Keep that real play request pending and retry it on trusted input.
  const nativePlay=HTMLMediaElement.prototype.play,pendingAudio=new Map();
  HTMLMediaElement.prototype.play=function(...args){
    const media=this,result=nativePlay.apply(media,args);if(!result?.catch)return result;
    return result.catch(error=>{if(error?.name!=='NotAllowedError')throw error;state.audioDeferred=(state.audioDeferred||0)+1;return new Promise((resolve,reject)=>{const queue=pendingAudio.get(media)||[];queue.push({args,resolve,reject});pendingAudio.set(media,queue);});});
  };
  function resumeAudio(event){if(!event.isTrusted)return;for(const [media,queue]of pendingAudio){pendingAudio.delete(media);for(const request of queue)Promise.resolve(nativePlay.apply(media,request.args)).then(value=>{state.audioDeferred=Math.max(0,(state.audioDeferred||0)-1);request.resolve(value);},request.reject);}}
  addEventListener('pointerdown',resumeAudio,{capture:true});addEventListener('keydown',resumeAudio,{capture:true});
  const fail=e=>{if(stopped)return;state.errors.push(String(e?.message||e));state.phase='error';document.getElementById('status').textContent='Unable to load game.';notify('error');};
  const blob=(b,type)=>{const u=URL.createObjectURL(new Blob([b],{type}));urls.push(u);return u;};
  async function decode(b,type){const h=new Uint8Array(b,0,Math.min(2,b.byteLength));if(h[0]===31&&h[1]===139)b=await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();return blob(b,type);}
  addEventListener('error',e=>{fail(e.message);});
  for(const name of ['pointerdown','keydown','touchstart'])canvas.addEventListener(name,()=>state.inputEvents++,{passive:true});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  // Mobile browsers cannot lock the cursor. Native touch input continues through
  // the canvas; suppress only that unsupported request once touch is observed.
  canvas.addEventListener('pointerdown',event=>{if(event.pointerType==='touch')canvas.requestPointerLock=()=>Promise.resolve();},{capture:true,passive:true});
  (async()=>{await saveReady;const platformOptions={id,language,storage,getInstance:()=>instance,markReady:()=>{state.nativeReady=true;}};const sdk=platform=window.createLocalGamePlatform(platformOptions);window.createOtherGamePlatform?.({...platformOptions,sdk});const a=await GameAssets.ready,types={loader:'application/javascript',framework:'application/javascript',data:'application/octet-stream',code:'application/wasm'},u={};await Promise.all(Object.keys(types).map(async k=>u[k]=await decode(a.buffers[k],types[k])));
    await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=u.loader;s.onload=resolve;s.onerror=reject;document.head.append(s);});
    if(typeof createUnityInstance!=='function')throw Error('Invalid game loader');
    const native=config.native;
    instance=await createUnityInstance(canvas,{...native,dataUrl:u.data,frameworkUrl:u.framework,codeUrl:u.code,streamingAssetsUrl:new URL('StreamingAssets/',document.baseURI).href,
      cacheControl(){this.companyName=null;this.productName=null;return 'no-store';},
      postMainLoop(){state.frames++;if(scan)scan();},
      showBanner(message,type){if(type==='error')fail(message);}
    });window.unityInstance=instance;sdk.localBridge?.flush();state.phase='initialized';state.initializedAt=performance.now();
    const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');if(!gl)throw Error('WebGL unavailable');let last=0,passes=0,pixels=new Uint8Array(4);
    scan=()=>{if(stopped||performance.now()-last<200)return;last=performance.now();let visible=0,colored=0;
      // Unity versions finish their frame with different render targets bound.
      // Read the displayed canvas, then restore the engine's exact binding.
      const target=gl.READ_FRAMEBUFFER||gl.FRAMEBUFFER,binding=gl.getParameter(gl.READ_FRAMEBUFFER_BINDING||gl.FRAMEBUFFER_BINDING);
      try{gl.bindFramebuffer(target,null);for(const y of [.1,.3,.5,.7,.9])for(const x of [.1,.3,.5,.7,.9]){gl.readPixels(Math.floor(canvas.width*x),Math.floor(canvas.height*y),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixels);if(pixels[0]+pixels[1]+pixels[2]>40)visible++;if(Math.max(...pixels.subarray(0,3))-Math.min(...pixels.subarray(0,3))>25)colored++;}}
      finally{gl.bindFramebuffer(target,binding);}state.visibleSamples=visible;state.coloredSamples=colored;
      if(visible>3&&(colored>1||state.nativeReady)&&state.frames>=3)passes++;else passes=0;
      if(passes>=3){scan=null;state.phase='ready';state.readyAt=performance.now();document.getElementById('status').hidden=true;notify('ready');canvas.focus();}
    };
  })().catch(fail);
  addEventListener('pagehide',()=>{stopped=true;platform?.localBridge?.dispose();for(const u of urls)URL.revokeObjectURL(u);instance?.Quit().catch(()=>{});});
})();
