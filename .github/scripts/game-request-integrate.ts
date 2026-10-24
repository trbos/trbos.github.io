import{readGameCatalog,findExistingGame}from'./game-request-catalog.ts';
type Value=Record<string,any>;
const block=/(\bconst games = Object\.freeze\(\[)[\s\S]*?(\]\);)/;
const version=/assets\/games\.js\?v=[A-Za-z0-9_.-]+/g;
const lf=(s:string)=>s.replace(/\r\n/g,'\n');
// Only merge the two predictable shared edits. Never guess about game code,
// owner controls, existing games, or arbitrary overlapping source changes.
export function mergeGameShared(base:Value,worker:Value,main:Value,report:Value){
  const before=readGameCatalog(base.catalog),after=readGameCatalog(worker.catalog),current=readGameCatalog(main.catalog);
  if(after.length!==before.length+1||before.some(g=>JSON.stringify(after.find(n=>n.id===g.id))!==JSON.stringify(g)))throw Error('integration_conflict');
  const candidate=after.find(g=>g.id===report.gameId) as Value|undefined;
  if(!candidate||candidate.url!=='games/'+report.gameId+'/'||candidate.trustedPlayer!==true||before.some(g=>g.id===candidate.id)||findExistingGame(current,candidate.name,candidate.url))throw Error('integration_conflict');
  const skeleton=(s:string)=>{const normalized=lf(s);if(!block.test(normalized))throw Error('integration_conflict');return normalized.replace(block,'CATALOG');};
  if(skeleton(base.catalog)!==skeleton(worker.catalog))throw Error('integration_conflict');
  const strip=(s:string)=>lf(s).replace(version,'assets/games.js?v=VERSION');
  if(strip(base.index)!==strip(worker.index)||[...worker.index.matchAll(version)].length!==1||[...main.index.matchAll(version)].length!==1)throw Error('integration_conflict');
  const catalog=lf(main.catalog).replace(block,(_match,prefix,suffix)=>prefix+'\n'+[...current,candidate].map(g=>'    Object.freeze('+JSON.stringify(g)+')').join(',\n')+'\n  '+suffix);
  if(skeleton(catalog)!==skeleton(main.catalog))throw Error('integration_conflict');
  return{catalog,index:lf(main.index).replace(version,worker.index.match(version)![0])};
}
export async function integrateGame(gh:(path:string,method?:string,body?:unknown)=>Promise<any>,content:(path:string,ref:string)=>Promise<string>,job:Value,pr:Value,mainSha:string,comparison:Value,report:Value){
  const files=comparison.files,ancestor=comparison.merge_base_commit?.sha;
  if(!/^[a-f0-9]{40}$/.test(ancestor||'')||!Array.isArray(files)||!files.length||files.length>=100||report.alreadyAvailable)throw Error('integration_conflict');
  for(const file of files)if(!['assets/games.js','index.html','.game-requests/'+job.id+'.json'].includes(file.filename)&&!(file.status==='added'&&file.filename.startsWith('games/'+report.gameId+'/')))throw Error('integration_conflict');
  const refs=[ancestor,pr.head.sha,mainSha];
  const sources=await Promise.all(refs.map(async ref=>{const [catalog,index]=await Promise.all([content('assets/games.js',ref),content('index.html',ref)]);return{catalog,index};}));
  const merged=mergeGameShared(sources[0],sources[1],sources[2],report);
  const tree=[];
  for(const file of files){
    if(file.filename==='assets/games.js'||file.filename==='index.html')continue;
    if(file.status!=='added'||!/^[a-f0-9]{40}$/.test(file.sha||''))throw Error('integration_conflict');
    try{await content(file.filename,mainSha);throw Error('integration_conflict');}catch(error:any){if(error.status!==404)throw error;}
    tree.push({path:file.filename,mode:'100644',type:'blob',sha:file.sha});
  }
  tree.push({path:'assets/games.js',mode:'100644',type:'blob',content:merged.catalog},{path:'index.html',mode:'100644',type:'blob',content:merged.index});
  const main=await gh('/git/commits/'+mainSha);
  const nextTree=await gh('/git/trees','POST',{base_tree:main.tree.sha,tree});
  const commit=await gh('/git/commits','POST',{message:'Integrate completed game with current launcher',tree:nextTree.sha,parents:[pr.head.sha,mainSha]});
  // A live worker/new upload must win over this repair. Fast-forward only.
  const latest=await gh('/git/ref/heads/'+pr.head.ref);
  if(latest.object.sha!==pr.head.sha)throw Error('branch_changed');
  await gh('/git/refs/heads/'+pr.head.ref,'PATCH',{sha:commit.sha,force:false});
  return commit.sha;
}
