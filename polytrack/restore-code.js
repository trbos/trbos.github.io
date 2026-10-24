(function(root,factory){'use strict';if(typeof module==='object'&&module.exports)module.exports=factory;else if(root.document&&['https://trbos.github.io','https://p01--wordbuilder--675vggg6lnyg.code.run'].includes(root.location.origin)){
  root.PolyTrackRestore=factory(root);root.PolyTrackRestoreReady=root.PolyTrackRestore.start();
}})(globalThis,function createPolyTrackRestore(env,options){
  'use strict';
  options=options||{};
  const API='https://bawybmihvidtmpfpyajg.supabase.co/functions/v1/polytrack-restore';
  const PENDING='polytrackRestorePending';
  const HEX=/^[a-f0-9]{64}$/,PROFILE=/^polytrack_v5_prod_user_([0-2])$/,RECORD=/^polytrack_v5_prod_record_([0-2])_(default|undeterministic)_.+$/;
  const encoder=new env.TextEncoder();let dbPromise,busy=false,dialog,unlocked=false,started;
  const hash=async value=>Array.from(new Uint8Array(await env.crypto.subtle.digest('SHA-256',encoder.encode(value))),v=>v.toString(16).padStart(2,'0')).join('');
  const random=()=>Array.from(env.crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const parse=value=>{try{return JSON.parse(value);}catch{return null;}};
  const progressKey=key=>PROFILE.test(key)||RECORD.test(key)||/^polytrack_v5_prod_track_.+$/.test(key)||key==='polytrack_v5_prod_unlocked_car_styles'||key==='polytrack_v5_prod_user_slot';
  function validate(entries){
    if(!Array.isArray(entries)||entries.length>20000||encoder.encode(JSON.stringify(entries)).length>8388608)throw Error('invalid_snapshot');
    const seen=new Set();
    return entries.map(e=>{
      if(!Array.isArray(e)||e.length!==2||typeof e[0]!=='string'||typeof e[1]!=='string'||seen.has(e[0]))throw Error('invalid_snapshot');seen.add(e[0]);
      const [key,value]=e;
      if(PROFILE.test(key)){
        const p=parse(value);if(!object(p)||Object.keys(p).some(k=>!['nickname','countryCode','carStyle'].includes(k))||typeof p.nickname!=='string'||typeof p.carStyle!=='string'||!(p.countryCode===null||typeof p.countryCode==='string'))throw Error('invalid_snapshot');
      }else if(RECORD.test(key)){
        const p=parse(value);if(!object(p)||Object.keys(p).some(k=>!['frames','recording'].includes(k))||!Number.isSafeInteger(p.frames)||p.frames<1||typeof p.recording!=='string')throw Error('invalid_snapshot');
      }else if(!progressKey(key)||(key==='polytrack_v5_prod_user_slot'&&!/^[0-2]$/.test(value)))throw Error('invalid_snapshot');
      return e.slice();
    });
  }
  function database(){
    if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{
      let settled=false;const timer=env.setTimeout(()=>finish(null),5000);
      function finish(db){if(settled){db?.close();return;}settled=true;env.clearTimeout(timer);db?resolve(db):reject(Error('storage_unavailable'));}
      try{const r=env.indexedDB.open('PolyTrackCodeRestores',1);r.onupgradeneeded=()=>r.result.createObjectStore('journals');r.onsuccess=()=>{r.result.onversionchange=()=>r.result.close();finish(r.result);};r.onerror=r.onblocked=()=>finish(null);}catch{finish(null);}
    });return dbPromise.catch(error=>{dbPromise=null;throw error;});
  }
  async function stored(key,value){
    const db=await database();return new Promise((resolve,reject)=>{
      let tx,answer;const timer=env.setTimeout(()=>{try{tx.abort();}catch{}reject(Error('storage_unavailable'));},5000);
      try{tx=db.transaction('journals',value===undefined?'readonly':'readwrite');const store=tx.objectStore('journals');
        const r=value===undefined?store.get(key):store.put(value,key);r.onsuccess=()=>{answer=r.result;};
        tx.oncomplete=()=>{env.clearTimeout(timer);resolve(answer);};tx.onerror=tx.onabort=()=>{env.clearTimeout(timer);reject(Error('storage_unavailable'));};
      }catch{env.clearTimeout(timer);reject(Error('storage_unavailable'));}
    });
  }
  async function plan(entries){
    const out=new Map(validate(entries)),tokens=new Map();
    for(const [key,value] of out)if(PROFILE.test(key)){
      const old=parse(env.localStorage.getItem(key));const token=HEX.test(old?.token)?old.token:random();
      tokens.set(PROFILE.exec(key)[1],token);
      out.set(key,JSON.stringify({...parse(value),token,isVerifier:old?.isVerifier===true}));
    }
    for(const [key,value] of out)if(RECORD.test(key)){
      const slot=RECORD.exec(key)[1];let token=tokens.get(slot);
      if(!token){token=parse(env.localStorage.getItem('polytrack_v5_prod_user_'+slot))?.token;if(!HEX.test(token)){out.delete(key);continue;}}
      out.set(key,JSON.stringify({...parse(value),uploadId:null,tokenHash:await hash(token)}));
    }
    // Keep the recipient's selected online profile when it already exists.
    if(/^[0-2]$/.test(env.localStorage.getItem('polytrack_v5_prod_user_slot')||''))out.delete('polytrack_v5_prod_user_slot');
    return [...out];
  }
  const before=entries=>entries.map(([key])=>[key,env.localStorage.getItem(key)]);
  function rollback(entries){let okay=true;for(const [key,value] of entries){try{value===null?env.localStorage.removeItem(key):env.localStorage.setItem(key,value);}catch{okay=false;}}return okay;}
  function unchanged(entries){return entries.every(([key,value])=>env.localStorage.getItem(key)===value);}
  async function apply(journal,key){
    const backup=env.PolyTrackCloudBackup;
    if(backup&&typeof backup.restoreBarrier!=='function')throw Error('reload_required');
    const prepare=async()=>{
      const incoming=await plan(journal.entries),old=before(incoming);
      const pending={...journal,phase:'prepared',before:old,incoming};
      await stored('safety:'+random(),pending);await stored(key,pending);env.localStorage.setItem(PENDING,key);
      // Nothing may change between safety snapshot and synchronous commit.
      if(!unchanged(old))throw Error('progress_changed');
      return {apply(){
        try{for(const [name,value] of incoming)env.localStorage.setItem(name,value);return true;}
        catch(error){if(!rollback(old))throw Error('rollback_failed');throw error;}
      },rollback:()=>rollback(old),async finish(){
        const waiting=await stored('unconfirmed')||[];
        await stored('unconfirmed',[...new Set([...waiting,key])]);
        await stored(key,{...journal,phase:'complete'});env.localStorage.removeItem(PENDING);
      }};
    };
    try{
      if(backup)await backup.restoreBarrier(prepare);
      else{const p=await prepare();try{p.apply();await p.finish();}catch(error){if(!p.rollback())throw Error('rollback_failed');throw error;}}
    }catch(error){
      if(!['rollback_failed','restore-rollback-failed'].includes(error.message)){await stored(key,{...journal,phase:'received'});env.localStorage.removeItem(PENDING);}
      throw error;
    }
    await confirmCompleted();
    return {restored:true};
  }
  async function confirmCompleted(){
    if(env.location?.origin!=='https://trbos.github.io')return;
    try{
      const waiting=await stored('unconfirmed')||[];
      for(const key of waiting){
        const journal=await stored(key);if(journal?.phase!=='complete'||!HEX.test(journal.code)||!HEX.test(journal.receipt))continue;
        const controller=new env.AbortController(),timer=env.setTimeout(()=>controller.abort(),3500);
        try{
          const response=await env.fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'confirm',code:journal.code,receipt:journal.receipt}),credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal});
          if(response.ok&&(await response.json()).confirmed===true){
            const latest=await stored('unconfirmed')||[];await stored('unconfirmed',latest.filter(value=>value!==key));
          }
        }catch{}finally{env.clearTimeout(timer);}
      }
    }catch{}
  }
  async function restore(rawCode){
    const code=String(rawCode||'').trim().toLowerCase();if(!HEX.test(code))throw Error('invalid_code');if(busy)throw Error('busy');busy=true;
    try{
      await recover();const key=await hash(code);let journal=await stored(key);
      if(journal?.phase==='complete'){await confirmCompleted();return {restored:false,alreadyRestored:true};}
      if(!journal){journal={version:1,phase:'waiting',code,receipt:random(),createdAt:Date.now()};await stored(key,journal);}
      if(!HEX.test(journal.receipt)||journal.code!==code)throw Error('storage_unavailable');
      if(!journal.entries){
        const controller=new env.AbortController(),timer=env.setTimeout(()=>controller.abort(),20000);
        try{
          const response=await env.fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'redeem',code,receipt:journal.receipt}),credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal});
          const result=await response.json();if(!response.ok)throw Error(result?.error==='code_used'?'code_used':result?.error==='code_not_found'?'invalid_code':'unavailable');
          journal={...journal,entries:validate(result.entries),phase:'received'};await stored(key,journal);
        }finally{env.clearTimeout(timer);}
      }
      return await apply(journal,key);
    }finally{busy=false;}
  }
  async function recover(){
    const key=env.localStorage.getItem(PENDING);if(!key)return true;if(!HEX.test(key))throw Error('storage_unavailable');const journal=await stored(key);
    if(!journal)throw Error('storage_unavailable');
    if(journal.phase==='prepared'){
      if(!Array.isArray(journal.before)||journal.before.length>20000||!journal.before.every(e=>Array.isArray(e)&&e.length===2&&typeof e[0]==='string'&&progressKey(e[0])&&(typeof e[1]==='string'||e[1]===null))||!rollback(journal.before))throw Error('rollback_failed');
      await stored(key,{...journal,phase:'received'});
    }
    env.localStorage.removeItem(PENDING);return true;
  }
  function message(error){return ({invalid_code:'Invalid code.',code_used:'Code already used.',invalid_snapshot:'Invalid backup.',reload_required:'Reload before restoring.',progress_changed:'Progress changed. Retry.',storage_unavailable:'Storage unavailable. Nothing restored.',rollback_failed:'Restore interrupted. Reload to recover.'})[error?.message]||'Restore failed. Retry.';}
  function open(){
    if(dialog?.open)return;
    dialog=env.document.createElement('dialog');dialog.className='polytrack-restore-dialog';
    dialog.innerHTML='<form><label>Restore code<input name="code" autocomplete="off" autocapitalize="none" spellcheck="false" required maxlength="64"></label><p>Replaces saved progress. Keeps your login.</p><div><button type="button">Cancel</button><button type="submit">Restore</button></div><p role="status" aria-live="polite"></p></form>';
    const form=dialog.querySelector('form'),cancel=form.querySelector('[type=button]'),status=form.querySelector('[role=status]');
    cancel.addEventListener('click',()=>{dialog.close();dialog.remove();});dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
    form.addEventListener('submit',async event=>{event.preventDefault();const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);status.textContent='Restoring…';
      try{const result=await restore(form.elements.code.value);if(result.alreadyRestored){status.textContent='Already restored.';return;}status.textContent='Restored.';(options.reload||(()=>env.location.reload()))();}
      catch(error){status.textContent=message(error);}finally{buttons.forEach(b=>b.disabled=false);}
    });env.document.body.append(dialog);dialog.showModal();form.elements.code.focus();
  }
  function install(){
    const style=env.document.createElement('style');style.textContent='.polytrack-restore-dialog{width:min(420px,calc(100vw - 32px));box-sizing:border-box;border:1px solid #40516c;border-radius:20px;background:#192331;color:#eef3ff;padding:24px;font:16px system-ui;max-height:calc(100dvh - 24px);overflow:auto}.polytrack-restore-dialog::backdrop{background:#000b}.polytrack-restore-dialog form,.polytrack-restore-dialog label{display:grid;gap:14px}.polytrack-restore-dialog p{margin:0;font-size:14px}.polytrack-restore-dialog input{box-sizing:border-box;min-width:0;width:100%;border:1px solid #40516c;border-radius:12px;background:#101722;color:inherit;min-height:48px;padding:12px;font:16px monospace}.polytrack-restore-dialog form>div{display:flex;gap:12px}.polytrack-restore-dialog button{flex:1;min-height:48px;border:0;border-radius:12px;padding:10px;color:#17233e;background:#b7c5ff;font:inherit}.polytrack-restore-dialog :focus-visible{outline:2px solid white;outline-offset:3px}.polytrack-restore-entry{min-height:44px}.settings-menu-ui>h2.polytrack-restore-trigger{pointer-events:auto;touch-action:manipulation;cursor:pointer}.settings-menu-ui>h2.polytrack-restore-trigger:focus-visible{outline:2px solid #eef3ff;outline-offset:4px;border-radius:4px}';env.document.head.append(style);
    const headings=new WeakMap();
    const scan=()=>{for(const title of env.document.querySelectorAll('.settings-menu-ui > h2')){
      if(headings.has(title))continue;headings.set(title,{taps:0,last:0});title.tabIndex=0;title.setAttribute('role','button');title.classList.add('polytrack-restore-trigger');
      const tap=()=>{const state=headings.get(title),now=Date.now();state.taps=now-state.last<3000?state.taps+1:1;state.last=now;if(state.taps>=5){unlocked=true;reveal(title.parentElement);}};
      title.addEventListener('click',tap);title.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();tap();}});
      if(unlocked)reveal(title.parentElement);
    }};
    function reveal(settings){if(settings.querySelector('.polytrack-restore-entry'))return;const button=env.document.createElement('button');button.type='button';button.className='button polytrack-restore-entry';button.textContent='Restore code';button.addEventListener('click',open);const wrapper=settings.querySelector(':scope > .button-wrapper')||settings;wrapper.style.flexWrap='wrap';wrapper.append(button);}
    const observer=new env.MutationObserver(scan);observer.observe(env.document.body,{childList:true,subtree:true});scan();
  }
  function start(){if(!started)started=(async()=>{
    let recovered=true;try{await recover();void confirmCompleted();}catch{recovered=false;}
    const mount=()=>{
      install();
      if(!recovered){
        const alert=env.document.createElement('div');alert.className='polytrack-restore-dialog';alert.setAttribute('role','alert');
        Object.assign(alert.style,{position:'fixed',zIndex:'2147483647',left:'50%',top:'50%',transform:'translate(-50%,-50%)'});
        const text=env.document.createElement('p');text.textContent='Restore recovery failed.';
        const retry=env.document.createElement('button');retry.type='button';retry.textContent='Retry';retry.addEventListener('click',async()=>{retry.disabled=true;try{await recover();(options.reload||(()=>env.location.reload()))();}catch{text.textContent='Restore recovery failed.';retry.disabled=false;}});
        alert.append(text,retry);env.document.body.append(alert);
      }
    };
    if(env.document.body)mount();else env.document.addEventListener('DOMContentLoaded',mount,{once:true});
    return recovered;
  })();return started;}
  return Object.freeze({start,restore,recover,open});
});
