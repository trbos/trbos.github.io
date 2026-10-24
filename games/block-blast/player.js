(() => {
  'use strict';
  const id='block-blast',canvas=document.getElementById('game'),status=document.getElementById('status');
  const urls=[];let stopped=false,instance=null,scanBoard=null;
  const manifest=Object.freeze({
    loader:{file:'BlockBlast1.1-8.loader.js',type:'application/javascript',hash:'e400a2b78588508cdd1c1db75fb50180e44534240401c03e082d8658a833cfa9'},
    framework:{file:'BlockBlast1.1-8.framework.js.unityweb',type:'application/javascript',hash:'238e9b814415d6a8173eef953a4634401c445c9c58cc9f71f120ce6eae0960bf'},
    data:{file:'BlockBlast1.1-8.data.unityweb',type:'application/octet-stream',hash:'2bbfb0be0c1248a24d43693d18b315f14a319923173720368d8bf28d1af105b2'},
    code:{file:'BlockBlast1.1-8.wasm.unityweb',type:'application/wasm',hash:'dfd00b9fae4bc5d71b1a4ed7be90fb2926df73173e371a14803e8e088597f7cc'}
  });
  const mark=name=>performance.mark('block-blast:'+name);
  const post=type=>parent.postMessage({type,id},'*');
  function fail(message){if(stopped)return;stopped=true;document.body.dataset.state='error';status.hidden=false;status.textContent=message||'Unable to load Block Blast.';status.setAttribute('role','alert');post('game:error');}
  async function hash(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
  function blob(bytes,type){const url=URL.createObjectURL(new Blob([bytes],{type}));urls.push(url);return url;}
  async function localAssets(){
    const build=new URL('Build/',document.baseURI),buffers={};
    await Promise.all(Object.entries(manifest).map(async([name,item])=>{const response=await fetch(new URL(item.file,build),{credentials:'omit',cache:'force-cache'});if(!response.ok)throw Error('asset');buffers[name]=await response.arrayBuffer();}));
    return{buffers};
  }
  async function assets(){
    const supplied=window.GameAssets?await window.GameAssets.ready:await localAssets();
    if(!supplied?.buffers)throw Error('asset');mark('assets');const result={};
    await Promise.all(Object.entries(manifest).map(async([name,item])=>{
      const input=supplied.buffers[name];if(!(input instanceof ArrayBuffer))throw Error('asset');
      const header=new Uint8Array(input,0,Math.min(2,input.byteLength));let decoded=input;
      if(header[0]===31&&header[1]===139){if(typeof DecompressionStream!=='function')throw Error('unsupported');decoded=await new Response(new Blob([input]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();}
      if(await hash(decoded)!==item.hash)throw Error('asset');result[name]=blob(decoded,item.type);
    }));mark('decoded');return result;
  }
  function loadScript(url){return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=url;script.onload=resolve;script.onerror=reject;document.head.append(script);});}
  function firstBoard(){
    const boardStarted=performance.now();
    const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');if(!gl)return fail('This browser can’t run Block Blast.');
    let pixels=null,width=0,height=0,since=0,last=0;
    function scan(){
      if(stopped){scanBoard=null;return;}const now=performance.now();if(now-last<180)return;last=now;if(now-boardStarted>30000)return fail();
      if(canvas.width!==width||canvas.height!==height){width=canvas.width;height=canvas.height;pixels=new Uint8Array(width*height*4);since=0;}
      gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let board=0,hand=0;
      for(let y=0;y<height;y+=8)for(let x=0;x<width;x+=8){const i=(y*width+x)*4,r=pixels[i],g=pixels[i+1],b=pixels[i+2];const colored=b>205&&b>1.8*g||b>150&&r>115&&b>1.65*g||r>160&&r>1.5*b&&r>1.1*g||g>140&&g>1.5*b&&g>1.2*r;if(colored){const screenY=1-y/height;if(screenY>.18&&screenY<.75)board++;if(screenY>.76&&screenY<.94)hand++;}}
      if(board>120&&hand>8){if(!since)since=now;if(now-since>250){scanBoard=null;document.body.dataset.state='ready';status.hidden=true;mark('ready');post('game:ready');canvas.focus();return;}}else since=0;
    }scanBoard=scan;
  }
  (async()=>{
    if(!window.WebAssembly||!window.crypto?.subtle)throw Error('unsupported');const values=await assets();await loadScript(values.loader);if(typeof createUnityInstance!=='function')throw Error('asset');
    // The trusted wrapper contains a fixed portrait viewport through rotation.
    // Keep this drawing buffer and Unity's logical coordinates stable too.
    canvas.width=600;canvas.height=1000;
    instance=await createUnityInstance(canvas,{
      dataUrl:values.data,frameworkUrl:values.framework,codeUrl:values.code,streamingAssetsUrl:new URL('StreamingAssets/',document.baseURI).href,
      companyName:'Qaza@main',productName:'Block Blast',productVersion:'1.1.8',matchWebGLToCanvasSize:false,
      postMainLoop:function(){if(scanBoard)scanBoard();if(!scanBoard&&document.body.dataset.state==='ready')this.postMainLoop=null;},
      // This loader touches Cache API state even for Blob URLs. Its cache policy
      // selects ordinary fetch when cache-key metadata is absent. No storage is relayed.
      cacheControl:function(){this.companyName=null;this.productName=null;return 'no-store';}
    });mark('engine');document.body.dataset.state='initialized';firstBoard();
  })().catch(error=>fail(error?.message==='unsupported'?'This browser can’t run Block Blast.':undefined));
  window.addEventListener('pagehide',()=>{stopped=true;for(const url of urls)URL.revokeObjectURL(url);if(instance)instance.Quit().catch(()=>{});});
})();
