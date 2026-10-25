(function(root,factory){'use strict';if(typeof module==='object'&&module.exports)module.exports=factory;else root.createSiteOwnerGameRequests=factory;})(globalThis,function createSiteOwnerGameRequests(env,host,request){
  'use strict';
  const section=env.document.createElement('section');section.className='owner-game-requests';section.hidden=true;
  section.innerHTML='<div class="owner-game-request-heading"><h2>Game requests</h2><button type="button" class="owner-game-request-pause">Pause requests</button><button type="button" class="owner-game-request-refresh">Refresh</button></div><p role="status" aria-live="polite"></p><div class="owner-game-request-list"></div>';
  host.append(section);
  const pause=section.querySelector('.owner-game-request-pause'),refresh=section.querySelector('.owner-game-request-refresh'),status=section.querySelector('[role=status]'),list=section.querySelector('.owner-game-request-list');
  const stages={waiting:'Queued',queued:'Starting',finding:'Finding a version',testing:'Testing',adding:'Adding',publishing:'Publishing',added:'Added',unavailable:'Unavailable',failed:'Failed',cancelled:'Cancelled',deleting:'Removing',deleted:'Removed'};
  const active=new Set(['waiting','queued','finding','testing','adding','publishing']);
  const drafts=new Map();let enabled=false,busy=false,paused=false,ticket=0,timer=null;
  const visible=()=>enabled&&env.document.visibilityState!=='hidden'&&env.location.hash.split('?')[0]==='#/owner';
  function controls(){pause.disabled=busy;refresh.disabled=busy;pause.textContent=paused?'Resume requests':'Pause requests';for(const field of list.querySelectorAll('button,input'))field.disabled=busy;}
  function schedule(){env.clearTimeout(timer);timer=null;if(visible())timer=env.setTimeout(()=>void load(),5000);}
  function render(data){
    if(!data||typeof data.paused!=='boolean'||!Array.isArray(data.entries))throw Error('invalid_response');
    paused=data.paused;const rows=[];
    for(const job of data.entries.slice(0,50)){
      if(!job||typeof job.id!=='string'||!/^[a-f0-9-]{36}$/.test(job.id)||typeof job.name!=='string'||!Object.hasOwn(stages,job.stage))continue;
      const row=env.document.createElement('article'),name=env.document.createElement('strong'),state=env.document.createElement('span');
      row.dataset.requestId=job.id;name.textContent=job.name;state.textContent=stages[job.stage];row.append(name,state);
      if(active.has(job.stage)||job.stage==='failed'){
        const reason=env.document.createElement('input');reason.type='text';reason.maxLength=180;reason.placeholder='Reason (optional)';reason.setAttribute('aria-label','Unavailable reason for '+job.name);reason.value=drafts.get(job.id)||'';
        reason.addEventListener('input',()=>drafts.set(job.id,reason.value));
        const stop=env.document.createElement('button');stop.type='button';stop.textContent='Mark unavailable';stop.addEventListener('click',()=>void act({action:'game-request-unavailable',requestId:job.id,detail:reason.value.trim()}));row.append(reason,stop);
      }
      if(active.has(job.stage)){
        const cancel=env.document.createElement('button');cancel.type='button';cancel.textContent='Cancel generation';cancel.addEventListener('click',()=>void act({action:'game-request-cancel',requestId:job.id}));row.append(cancel);
      }
      if(job.stage==='added'||job.stage==='deleting'){
        const remove=env.document.createElement('button');remove.type='button';remove.textContent=job.stage==='deleting'?'Retry removal':'Delete game';remove.addEventListener('click',()=>{
          if(env.confirm('Delete '+job.name+' from Games?'))void act({action:'game-request-delete',requestId:job.id});
        });row.append(remove);
      }
      if(job.detail){const detail=env.document.createElement('p');detail.textContent=job.detail;row.append(detail);}
      rows.push(row);
    }
    if(!rows.length){const empty=env.document.createElement('p');empty.textContent='No requests.';rows.push(empty);}
    list.replaceChildren(...rows);controls();
  }
  function errorText(error){return error?.status===401||error?.status===403?'Sign in again.':error?.code==='request_busy'?'Worker busy. Retry.':error?.code==='already_published'?'Already published.':error?.code==='request_not_found'?'Request not found.':'Unable to connect. Retry.';}
  async function load(){
    if(!visible()||busy)return;
    if(list.contains(env.document.activeElement)&&env.document.activeElement?.tagName==='INPUT'){schedule();return;}
    const version=ticket;busy=true;controls();
    try{const data=await request({action:'game-requests'});if(version===ticket&&enabled){render(data);status.textContent=paused?'New requests paused.':'';}}
    catch(error){if(version===ticket&&enabled)status.textContent=errorText(error);}
    finally{if(version===ticket){busy=false;controls();schedule();}}
  }
  async function act(body){
    if(!enabled||busy)return;const version=ticket;busy=true;controls();status.textContent=body.action==='game-request-unavailable'?'Marking unavailable…':body.action==='game-request-delete'?'Removing…':body.action==='game-request-cancel'?'Cancelling…':'Saving…';
    try{
      let data;
      for(let attempt=0;attempt<6;attempt++){
        try{data=await request(body);break;}
        catch(error){if(error?.code!=='request_busy'||attempt===5)throw error;await new Promise(resolve=>env.setTimeout(resolve,2000));if(version!==ticket||!enabled)return;}
      }
      if(version===ticket&&enabled){render(data);status.textContent=paused?'New requests paused.':'';}
    }catch(error){if(version===ticket&&enabled)status.textContent=errorText(error);}
    finally{if(version===ticket){busy=false;controls();schedule();}}
  }
  pause.addEventListener('click',()=>void act({action:'game-requests-pause',paused:!paused}));refresh.addEventListener('click',()=>void load());
  env.document.addEventListener('visibilitychange',schedule);env.addEventListener('hashchange',()=>{schedule();if(visible())void load();});
  return Object.freeze({setOwner(value){value=value===true;if(enabled===value)return;enabled=value;ticket++;busy=false;section.hidden=!enabled;env.clearTimeout(timer);timer=null;list.replaceChildren();drafts.clear();status.textContent='';controls();if(enabled)void load();}});
});
