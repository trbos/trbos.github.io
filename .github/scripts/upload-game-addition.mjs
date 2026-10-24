import fs from'node:fs';
import path from'node:path';
import{execFileSync}from'node:child_process';
export async function uploadGameAddition(id,base,{cwd=process.cwd(),fetcher=fetch,token=process.env.GAME_REQUEST_UPLOAD_KEY||fs.readFileSync(process.env.GAME_REQUEST_UPLOAD_KEY_FILE||'/tmp/game-addition-upload.key','utf8').trim()}={}){
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id||'')||!/^[a-f0-9]{40}$/.test(base||'')||!/^[a-f0-9]{64}$/.test(token))throw Error('Invalid upload configuration');
  const ancestor=execFileSync('git',['merge-base',base,'HEAD'],{cwd,encoding:'utf8'}).trim();
  const paths=execFileSync('git',['diff','--name-only','--diff-filter=ACM',ancestor,'HEAD'],{cwd,encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
  if(!paths.includes('.game-requests/'+id+'.json')||paths.length>=100)throw Error('Invalid game addition scope');
  const report=JSON.parse(fs.readFileSync(path.join(cwd,'.game-requests/'+id+'.json'),'utf8'));
  const files=[];let bytes=0;
  for(const name of paths){
    if(name!=='.game-requests/'+id+'.json'&&name!=='assets/games.js'&&name!=='index.html'&&!(report.gameId&&name.startsWith('games/'+report.gameId+'/')))throw Error('Invalid game addition path');
    const file=path.resolve(cwd,name);if(!file.startsWith(path.resolve(cwd)+path.sep)||!fs.lstatSync(file).isFile())throw Error('Invalid game addition file');
    const content=fs.readFileSync(file);bytes+=content.length;if(bytes>25*1024*1024)throw Error('Game addition is too large');files.push({path:name,content:content.toString('base64')});
  }
  const body=JSON.stringify({requestId:id,files});
  for(let attempt=0;attempt<5;attempt++){
    const response=await fetcher('https://bawybmihvidtmpfpyajg.supabase.co/functions/v1/game-requests',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body,signal:AbortSignal.timeout(45000)});
    if([409,503].includes(response.status)&&attempt<4){await new Promise(r=>setTimeout(r,3000));continue;}
    if(!response.ok)throw Error('Game result upload failed: '+response.status);
    const result=await response.json();if(!/^[a-f0-9]{40}$/.test(result.sha||''))throw Error('Upload did not confirm a commit');
    return{sha:result.sha,stage:result.stage,files:files.length,bytes};
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'))){
  try{console.log(JSON.stringify(await uploadGameAddition(process.argv[2],process.argv[3])));}catch(error){console.error(error.message);process.exitCode=1;}
}
