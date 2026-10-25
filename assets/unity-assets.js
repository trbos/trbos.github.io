(() => {
  'use strict';
  const id=document.currentScript.dataset.game,channel=new MessageChannel(),urls=[];
  const ready=new Promise((resolve,reject)=>{
    const configured=Number(document.currentScript.dataset.timeout);
    const timeout=Number.isSafeInteger(configured)&&configured>=30000&&configured<=120000?configured:25000;
    const deadline=performance.now()+300000;
    const expire=()=>{channel.port1.close();reject(Error('Game assets unavailable.'));};
    let timer=setTimeout(expire,timeout);
    channel.port1.onmessage=event=>{
      if(event.data?.progress===true){clearTimeout(timer);timer=setTimeout(expire,Math.max(0,Math.min(timeout,deadline-performance.now())));return;}
      clearTimeout(timer);channel.port1.close();
      try{
        if(event.data?.ok!==true)throw Error();const values=event.data.values,result={},buffers={};
        for(const name of ['loader','framework','data','code']){
          const item=values?.[name];if(!(item?.buffer instanceof ArrayBuffer)||typeof item.type!=='string')throw Error();
          buffers[name]=item.buffer;const url=URL.createObjectURL(new Blob([item.buffer],{type:item.type}));urls.push(url);result[name]=url;
        }
        resolve(Object.freeze({...result,buffers:Object.freeze(buffers)}));
      }catch{reject(Error('Game assets unavailable.'));}
    };
    parent.postMessage({type:'game:assets',id},'*',[channel.port2]);
  });
  ready.catch(()=>{});
  window.GameAssets=Object.freeze({ready,id});
  window.addEventListener('pagehide',()=>{channel.port1.close();for(const url of urls)URL.revokeObjectURL(url);});
})();
