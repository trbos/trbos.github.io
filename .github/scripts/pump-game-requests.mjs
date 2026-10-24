import{createGameDispatcher}from'./game-request-dispatcher.ts';
const token=process.env.PUMP_TOKEN,commentToken=process.env.CODEX_COMMENT_TOKEN;
if(!token||!commentToken){console.log('Game requests are not enabled.');process.exit(0);}
const rpc=async args=>{
  const response=await fetch('https://bawybmihvidtmpfpyajg.supabase.co/functions/v1/game-requests',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(30000)});
  if(response.status===503){const error=Error('worker_not_ready');error.disabled=true;throw error;}
  if(!response.ok)throw Error('Queue request failed: '+response.status);return response.json();
};
try{console.log(JSON.stringify(await createGameDispatcher({token:process.env.GH_TOKEN,commentToken,rpc})()));}
catch(error){if(error.disabled){console.log('Game worker is not ready.');process.exit(0);}throw error;}
