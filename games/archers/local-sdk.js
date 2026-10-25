(() => {
  'use strict';
  // Retain the standalone package's application-URL metadata in this opaque
  // game document. Its actual browser origin and local asset base stay intact.
  Object.defineProperty(document,'URL',{configurable:true,get:()=> 'https://ragdoll-archers.game-files.crazygames.com/ragdoll-archers/41/index.html'});
  window.createArchersPlatform = ({storage,markReady}) => {
    const localPlayer=Object.freeze({userId:'local-player',username:'Player',profilePictureUrl:null});
    const status=window.ArchersSaveStatus={reads:0,writes:0,syncs:0,files:[]};
    const prefix='unity:file:',validPath=value=>typeof value==='string'&&/^\/idbfs\/(?:[a-zA-Z0-9_.-]+\/){0,10}[a-zA-Z0-9_.-]+$/.test(value)&&!value.split('/').some(part=>part==='.'||part==='..');
    let files;
    function sync(fs,populate) {
      files=fs;
      status.syncs++;
      if(populate){
        for(let i=0;i<storage.length;i++){
          const key=storage.key(i),file=key?.startsWith(prefix)?key.slice(prefix.length):null;
          if(!validPath(file))continue;
          const encoded=storage.getItem(key);if(typeof encoded!=='string'||encoded.length>524288)continue;
          try{const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));fs.mkdirTree(file.slice(0,file.lastIndexOf('/')));fs.writeFile(file,bytes);}catch{}
        }
      }else{
        const found=new Set();
        function visit(directory){for(const name of fs.readdir(directory)){if(name==='.'||name==='..')continue;const file=directory+'/'+name,stat=fs.stat(file);if(fs.isDir(stat.mode)){visit(file);continue;}if(!fs.isFile(stat.mode)||!validPath(file)||stat.size>393216)continue;const bytes=fs.readFile(file);let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));const key=prefix+file;found.add(key);storage.setItem(key,btoa(text));}}
        visit('/idbfs');
        status.files=[...found];
        for(const key of Array.from({length:storage.length},(_,i)=>storage.key(i)))if(key?.startsWith(prefix)&&!found.has(key))storage.removeItem(key);
      }
    }
    const flush=()=>{if(files)sync(files,false);};
    window.ArchersLocalFiles=Object.freeze({sync,flush});
    const sdk={environment:'crazygames',isQaTool:false,init:async()=>{},
      data:{getItem:key=>{status.reads++;return storage.getItem(key);},setItem:(key,value)=>{status.writes++;storage.setItem(key,value);},removeItem:key=>storage.removeItem(key),clear:()=>storage.clear(),syncUnityGameData:flush},
      game:{loadingStart(){},loadingStop(){markReady();},gameplayStart(){},gameplayStop(){},happytime(){},hideInviteButton(){},showInviteButton:()=>'',inviteLink:()=>''},
      user:{systemInfo:{countryCode:null,os:{},browser:{},device:{type:navigator.maxTouchPoints>1?'tablet':'desktop'}},isUserAccountAvailable:true,
        getUser:async()=>localPlayer,getUserToken:async()=>'',getXsollaUserToken:async()=>'',showAuthPrompt:async()=>localPlayer,showAccountLinkPrompt:async()=>localPlayer,addAuthListener:callback=>queueMicrotask(()=>callback(localPlayer)),addScore(){}},
      ad:{hasAdblock:async()=>false,requestAd(type,callbacks={}){queueMicrotask(()=>{callbacks.adStarted?.();callbacks.adFinished?.();});}},
      banner:{requestOverlayBanners(){},clearAllBanners(){}},localBridge:{flush,dispose:flush}};
    addEventListener('pagehide',flush);document.addEventListener('visibilitychange',()=>{if(document.hidden)flush();});
    // The exported package's SDK ABI identifies the compiled platform flavor.
    // No remote identity, provider session, ad view, score or purchase is sent.
    window.CrazyGames={SDK:sdk};return sdk;
  };
})();
