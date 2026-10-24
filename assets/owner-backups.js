(function(root,factory){'use strict';if(typeof module==='object'&&module.exports)module.exports=factory;else root.createSiteOwnerBackups=factory;})(globalThis,function createSiteOwnerBackups(env,host,request){
  'use strict';
  const section=env.document.createElement('section');section.className='owner-backups';section.hidden=true;
  section.innerHTML='<h2>Backups</h2><button type="button" class="backup-refresh">Refresh</button><div class="backup-list" role="list"></div><button type="button" class="backup-more" hidden>More</button><p role="status" aria-live="polite"></p><div class="backup-code" hidden><label>Restore code<textarea readonly rows="3" spellcheck="false"></textarea></label><button type="button">Copy code</button></div>';
  host.append(section);
  const list=section.querySelector('.backup-list'),more=section.querySelector('.backup-more'),status=section.querySelector('[role=status]'),codeBox=section.querySelector('.backup-code'),codeField=codeBox.querySelector('textarea'),copy=codeBox.querySelector('button'),refresh=section.querySelector('.backup-refresh');
  let enabled=false,ticket=0,busy=false,cursor=null;
  const errorText=error=>error?.status===409?'Backup changed. Refresh and try again.':error?.status===401||error?.status===403?'Sign in again.':'Backups unavailable. Retry.';
  function controls(){refresh.disabled=busy;more.disabled=busy;for(const button of list.querySelectorAll('button'))button.disabled=busy;}
  async function issue(entry){
    if(!enabled||busy)return;const version=ticket;busy=true;status.textContent='';controls();
    try{const result=await request({action:'issue',deviceId:entry.deviceId,revision:entry.revision});if(version!==ticket||!enabled)return;
      if(!/^[a-f0-9]{64}$/.test(result?.code))throw Error();codeField.value=result.code;codeBox.hidden=false;codeField.focus();codeField.select();
    }catch(error){if(version===ticket)status.textContent=errorText(error);}finally{if(version===ticket){busy=false;controls();}}
  }
  async function load(append=false){
    if(!enabled||busy)return;const version=ticket;busy=true;status.textContent='';controls();
    try{const result=await request({action:'list',...(append&&cursor?{cursor}: {})});if(version!==ticket||!enabled)return;
      if(!Array.isArray(result?.entries)||result.entries.length>25)throw Error();if(!append)list.replaceChildren();
      for(const entry of result.entries){
        if(typeof entry.deviceId!=='string'||!Number.isSafeInteger(entry.revision)||!Array.isArray(entry.names))throw Error();
        const row=env.document.createElement('button');row.type='button';row.setAttribute('role','listitem');
        const names=env.document.createElement('span');names.textContent=entry.names.filter(v=>typeof v==='string').slice(0,3).join(' · ')||'Unnamed backup';
        const time=env.document.createElement('time');const date=new Date(entry.updatedAt);time.textContent=Number.isFinite(date.getTime())?date.toLocaleString():'';
        row.append(names,time);row.addEventListener('click',()=>void issue(entry));list.append(row);
      }
      cursor=result.next||null;more.hidden=!cursor;if(!list.children.length)status.textContent='No backups.';
    }catch(error){if(version===ticket)status.textContent=errorText(error);}finally{if(version===ticket){busy=false;controls();}}
  }
  refresh.addEventListener('click',()=>void load());more.addEventListener('click',()=>void load(true));
  copy.addEventListener('click',async()=>{try{await env.navigator.clipboard.writeText(codeField.value);status.textContent='Copied.';}catch{codeField.focus();codeField.select();status.textContent='Select and copy the code.';}});
  return Object.freeze({setOwner(value){value=value===true;if(value===enabled)return;enabled=value;ticket++;busy=false;cursor=null;section.hidden=!enabled;list.replaceChildren();codeField.value='';codeBox.hidden=true;status.textContent='';controls();if(enabled)void load();}});
});
