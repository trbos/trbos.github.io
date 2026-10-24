(function(root,factory){'use strict';if(typeof module==='object'&&module.exports)module.exports=factory;else if(root.document)root.SiteGameRequests=factory(root);})(globalThis,function createGameRequests(env){
  'use strict';
  const API='https://bawybmihvidtmpfpyajg.supabase.co/functions/v1/game-requests',COOKIE='trbos_game_requests',PENDING='trbos.game-request.pending.v1';
  const HEX=/^[a-f0-9]{64}$/,ID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
  const STAGES={waiting:'Queued',queued:'Queued',finding:'Finding a version',testing:'Testing',adding:'Adding',publishing:'Publishing',added:'Added',unavailable:'Unavailable',failed:'Failed',cancelled:'Cancelled',deleting:'Removing',deleted:'Removed'};
  const terminal=new Set(['added','unavailable','failed','cancelled','deleting','deleted']);
  const grid=env.document.getElementById('games');if(!grid)return;
  const button=env.document.createElement('button');button.type='button';button.hidden=true;button.className='game-card game-request-card';button.setAttribute('aria-labelledby','game-request-button-title');button.setAttribute('aria-describedby','game-request-wait');button.innerHTML='<span class="game-request-card-heading"><span id="game-request-button-title">Add a game!</span><span id="game-request-wait" class="game-request-wait" aria-live="polite">Estimating…</span></span>';grid.prepend(button);
  const banner=env.document.createElement('button');banner.type='button';banner.className='container game-request-banner';banner.hidden=true;
  banner.innerHTML='<span class="game-request-banner-name"></span><span class="game-request-banner-stage"></span><progress max="100" aria-label="Active game request progress"></progress>';grid.before(banner);
  const dialog=env.document.createElement('dialog');dialog.className='game-request-dialog';dialog.setAttribute('aria-labelledby','game-request-title');
  dialog.innerHTML='<div class="game-request-heading"><h2 id="game-request-title">Add a game!</h2><button type="button" class="game-request-close" aria-label="Close">×</button></div><form><label>Game name<input name="game" required minlength="2" maxlength="100" autocomplete="off"></label><label>Link (optional)<input name="url" type="url" maxlength="800" placeholder="https://" autocomplete="off"></label><button type="submit">Request game</button><p class="game-request-estimate"></p></form><p class="game-request-notice" role="status" aria-live="polite"></p><div class="game-request-result" hidden><h3></h3><p class="game-request-stage" role="status" aria-live="polite"></p><progress max="100" value="0" aria-label="Game request progress"></progress><p class="game-request-remaining" hidden></p><p class="game-request-detail"></p><a class="game-request-play" hidden>Play</a></div><button type="button" class="game-request-retry" hidden>Retry</button>';
  env.document.body.append(dialog);
  const form=dialog.querySelector('form'),submit=form.querySelector('[type=submit]'),notice=dialog.querySelector('.game-request-notice'),result=dialog.querySelector('.game-request-result'),stage=dialog.querySelector('.game-request-stage'),bar=result.querySelector('progress'),detail=result.querySelector('.game-request-detail'),play=result.querySelector('a'),retry=dialog.querySelector('.game-request-retry');
  const waitLabel=button.querySelector('.game-request-wait');
  submit.disabled=true;
  let key=null,snapshot=null,pending=null,existing=null,busy=false,timer=null,controller=null,ticket=0;
  let statusFailed=false,owner=Boolean(env.SiteOwner?.isOwner?.());
  const watching=()=>String(env.location.hash||'').split('?')[0]==='#/games'&&env.document.visibilityState!=='hidden';
  function cookie(){
    const value=env.document.cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
    if(HEX.test(value||''))return value;
    const fresh=Array.from(env.crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
    env.document.cookie=COOKIE+'='+fresh+'; Path=/; Max-Age=31536000; SameSite=Strict; Secure';
    if(!env.document.cookie.split(';').some(v=>v.trim()===COOKIE+'='+fresh))throw Error('cookies_required');return fresh;
  }
  function storedPending(value){
    if(value!==undefined){try{value?env.localStorage.setItem(PENDING,JSON.stringify({...value,tag:key.slice(0,12)})):env.localStorage.removeItem(PENDING);}catch{throw Error('storage_unavailable');}return value;}
    try{const saved=JSON.parse(env.localStorage.getItem(PENDING)||'null');return saved?.tag===key.slice(0,12)&&ID.test(saved.id)&&typeof saved.name==='string'&&typeof saved.url==='string'?saved:null;}catch{return null;}
  }
  function validJob(job){return job===null||job&&ID.test(job.id)&&typeof job.name==='string'&&job.name.length<=100&&Object.hasOwn(STAGES,job.stage)&&
    (job.progress===null||Number.isInteger(job.progress)&&job.progress>=0&&job.progress<=100)&&typeof job.detail==='string'&&job.detail.length<=180&&
    (job.gameId===null||typeof job.gameId==='string'&&/^[a-z0-9][a-z0-9-]{0,79}$/.test(job.gameId));}
  function accept(value){
    statusFailed=false;
    if(value?.alreadyAdded){
      const game=value.alreadyAdded;if(typeof game.id!=='string'||!/^[a-z0-9][a-z0-9-]{0,79}$/.test(game.id)||typeof game.name!=='string'||game.name.length>100)throw Error('unavailable');
      existing=game;pending=null;storedPending(null);render();return;
    }
    if(!value||typeof value.ready!=='boolean'||!validJob(value.request)||!validJob(value.active)||value.paused!==undefined&&typeof value.paused!=='boolean')throw Error('unavailable');
    snapshot=value;
    if(pending&&value.request?.id===pending.id){pending=null;storedPending(null);}
    render();
  }
  function timeText(range,elapsed=0,active=false){
    const lo=Math.max(0,range[0]-elapsed),hi=range[1]-elapsed;
    if(hi<=0)return "Taking longer than estimated";
    const lower=Math.max(1,Math.ceil(lo/60)),upper=Math.max(1,Math.ceil(hi/60));
    return "Est. "+(lo>60&&lower!==upper?lower+"–"+upper:upper===1?"under 1":"up to "+upper)+" min"+(active?" left":"");
  }
  function validEstimate(value){return Array.isArray(value)&&value.length===2&&value.every(v=>Number.isFinite(v)&&v>=0&&v<=86400)&&value[1]>=value[0]&&value[1]>0;}
  function activeWait(job){
    if(!job)return 'No wait';
    const reliable=Number.isInteger(job.estimateSamples)&&job.estimateSamples>=3&&Number.isFinite(Date.parse(job.estimatedAt));
    if(!reliable)return 'Estimating…';
    if(job.estimateOverrun===true)return 'Taking longer';
    return validEstimate(job.remainingSeconds)?timeText(job.remainingSeconds,0,true):'Estimating…';
  }
  function render(keepNotice=false){
    const own=snapshot?.request,active=snapshot?.active,other=active&&active.id!==own?.id,job=other?active:own;
    button.hidden=!owner&&(!snapshot||snapshot.paused===true);
    waitLabel.textContent=statusFailed?'Estimating…':activeWait(active);
    banner.hidden=!active;
    if(active){
      const name=banner.querySelector('.game-request-banner-name'),label=banner.querySelector('.game-request-banner-stage'),progress=banner.querySelector('progress');
      if(name.textContent!==active.name)name.textContent=active.name;
      const text=STAGES[active.stage]+(active.progress===null?'':' · '+active.progress+'%');if(label.textContent!==text)label.textContent=text;
      progress.hidden=active.progress===null;if(active.progress!==null)progress.value=active.progress;
      banner.setAttribute('aria-label',active.name+' · '+text);
    }
    submit.disabled=busy||!snapshot?.ready||(!owner&&(Boolean(active)||snapshot?.paused===true));
    form.hidden=owner?!snapshot?.ready:Boolean(active)||snapshot?.paused===true||!snapshot?.ready;
    form.elements.game.disabled=busy;form.elements.url.disabled=busy;
    result.hidden=!job&&!existing;
    if(existing){
      result.querySelector('h3').textContent=existing.name;stage.textContent='Already added';detail.hidden=true;bar.hidden=true;play.hidden=false;
      play.href=env.location.pathname+'?game='+encodeURIComponent(existing.id)+'#/games/'+existing.id;
    }else if(job){
      result.querySelector('h3').textContent=job.name;stage.textContent=STAGES[job.stage];
      detail.textContent=job.stage==='unavailable'&&/^No legally hostable version (?:was found|exists)[:.]/i.test(job.detail)?'Could not verify permission for the versions checked.':job.detail;
      detail.hidden=!job.detail;bar.hidden=job.progress===null;if(job.progress!==null)bar.value=job.progress;
      play.hidden=job.stage!=='added'||!job.gameId;
      if(!play.hidden)play.href=env.location.pathname+'?game='+encodeURIComponent(job.gameId)+'#/games/'+job.gameId;
    }
    // Estimates belong to the current attempt and stage. Old creation dates
    // include retries, research and idle time, so never subtract from them.
    const estimate=form.querySelector(".game-request-estimate");estimate.hidden=true;estimate.textContent='';
    const remaining=result.querySelector(".game-request-remaining");remaining.hidden=!job||terminal.has(job.stage)||Boolean(existing);
    if(!remaining.hidden){
      const reliable=Number.isInteger(job.estimateSamples)&&job.estimateSamples>=3&&Number.isFinite(Date.parse(job.estimatedAt));
      remaining.textContent=reliable&&job.estimateOverrun===true?'Taking longer than estimated':
        reliable&&validEstimate(job.remainingSeconds)?timeText(job.remainingSeconds,0,true):'Estimating…';
    }
    if(keepNotice)return;
    if(existing)notice.textContent='';
    else if(!snapshot?.ready&&!active)notice.textContent='Automatic additions need setup.';
    else if(snapshot?.paused&&!owner)notice.textContent='New requests paused.';
    else if(other&&!owner)notice.textContent='Another game is being added.';
    else if(active)notice.textContent='';
    else notice.textContent='';
  }
  async function request(body){
    if(owner&&body.action==='submit'){if(!env.SiteOwner?.isOwner?.())throw Error('owner_required');return env.SiteOwner.submitGame({id:body.id,name:body.name,url:body.url,clientKey:key});}
    const abort=new env.AbortController();controller=abort;const timeout=env.setTimeout(()=>abort.abort(),12000);
    try{
      const response=await env.fetch(API,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:abort.signal,body:JSON.stringify(body)});
      const data=await response.json();if(!response.ok){const error=Error(data?.error||'unavailable');error.status=response.status;throw error;}return data;
    }finally{env.clearTimeout(timeout);if(controller===abort)controller=null;}
  }
  const errors={cookies_required:'Enable cookies to request a game.',storage_unavailable:'Storage unavailable. Retry.',invalid_name:'Enter a game name.',invalid_url:'Use a public HTTPS game link.',filtered:'That request isn’t allowed.',paused:'New requests paused.',busy:'Another game is being added.',worker_unavailable:'Automatic additions need setup.',request_changed:'Request changed. Retry.'};
  function fail(error){statusFailed=true;waitLabel.textContent='Estimating…';if(dialog.open){notice.textContent=[401,403].includes(error?.status)?'Sign in again.':errors[error?.code||error?.message]||'Connection lost. Retry.';retry.hidden=false;}}
  function schedule(){env.clearTimeout(timer);timer=null;if(env.document.visibilityState!=='hidden'&&(dialog.open||watching()))timer=env.setTimeout(()=>void refresh(),snapshot?.active||dialog.open?5000:15000);}
  async function refresh(){
    if(busy||!dialog.open&&!watching())return;const version=ticket;busy=true;retry.hidden=true;
    try{if(!key)key=cookie();pending=storedPending();const value=await request(dialog.open&&pending?{action:'submit',id:pending.id,name:pending.name,url:pending.url}:{action:'status'});if(version!==ticket)return;accept(value);}
    catch(error){if(version===ticket)fail(error);}finally{if(version===ticket){busy=false;if(snapshot)render(true);schedule();}}
  }
  async function send(event){
    event.preventDefault();if(busy||submit.disabled)return;const version=ticket;busy=true;retry.hidden=true;
    try{
      const name=form.elements.game.value.trim(),url=form.elements.url.value.trim();existing=null;
      if(!pending)pending=storedPending({id:env.crypto.randomUUID(),name,url});
      submit.disabled=true;notice.textContent='Sending…';
      const value=await request({action:'submit',id:pending.id,name:pending.name,url:pending.url});if(version!==ticket)return;
      accept(value);if(!existing)form.reset();
    }catch(error){
      if(error?.status&&error.status<500){pending=null;try{storedPending(null);}catch{}if(['paused','busy'].includes(error.message))try{accept(await request({action:'status'}));}catch{}}
      if(version===ticket)fail(error);
    }finally{if(version===ticket){busy=false;if(snapshot)render(true);schedule();}}
  }
  function close(){ticket++;busy=false;env.clearTimeout(timer);timer=null;controller?.abort();dialog.close();schedule();}
  function open(){if(dialog.open)return;ticket++;busy=false;controller?.abort();dialog.showModal();notice.textContent='Checking…';void refresh();}
  button.addEventListener('click',open);form.addEventListener('submit',send);dialog.querySelector('.game-request-close').addEventListener('click',close);
  banner.addEventListener('click',open);
  env.addEventListener('site:owner',event=>{owner=event.detail?.owner===true&&Boolean(env.SiteOwner?.isOwner?.());render();});
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});retry.addEventListener('click',()=>void refresh());
  env.document.addEventListener('visibilitychange',()=>{if(env.document.visibilityState==='hidden'){env.clearTimeout(timer);timer=null;}else if(dialog.open||watching())void refresh();});
  env.addEventListener('hashchange',()=>{if(!watching()){if(dialog.open)close();schedule();}else void refresh();});
  if(watching())void refresh();
  return Object.freeze({open,close,refresh});
});
