import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {findExistingGame} from './game-request-catalog.ts';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:4*1024*1024});
const ID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const slug=/^[a-z0-9][a-z0-9-]{0,79}$/;
export function catalog(text){
  const entries=[...text.matchAll(/Object\.freeze\((\{"id":[^\r\n]+?\})\)/g)].map(m=>JSON.parse(m[1]));
  assert.ok(entries.length>0,'Catalog missing');assert.equal(new Set(entries.map(g=>g.id)).size,entries.length,'Duplicate catalog IDs');return entries;
}
export function validateReport(report,id){
  assert.equal(report.requestId,id);assert.equal(report.stage,'ready','Game is not ready for verification');assert.ok(slug.test(report.gameId));
  assert.equal(typeof report.name,'string');assert.ok(report.name.length>=2&&report.name.length<=100);
  for(const key of ['passed','adFree','contentAppropriate','played','retried','controls'])assert.equal(report.quality?.[key],true,'Missing verified '+key);
  assert.ok(Array.isArray(report.quality.sourcesCompared)&&new Set(report.quality.sourcesCompared).size>=2,'Compare two credible versions');
  for(const url of report.quality.sourcesCompared){const u=new URL(url);assert.equal(u.protocol,'https:');assert.ok(!u.username&&!u.password);}
  assert.ok(Number.isFinite(report.quality.coldMs)&&report.quality.coldMs>0&&report.quality.coldMs<=20000,'Cold start is too slow');
  assert.ok(Number.isFinite(report.quality.warmMs)&&report.quality.warmMs>0&&report.quality.warmMs<=10000,'Warm start is too slow');
  assert.ok(typeof report.quality.evidence==='string'&&report.quality.evidence.length>=40,'Native session evidence missing');
  if(!report.alreadyAvailable){assert.ok(typeof report.license?.name==='string'&&report.license.name.length>0,'Redistribution permission missing');assert.equal(new URL(report.license.url).protocol,'https:');}
  assert.ok(Array.isArray(report.qaSteps)&&report.qaSteps.length>=1&&report.qaSteps.length<=20,'Reproducible play steps missing');
  for(const step of report.qaSteps){
    assert.ok(['tap','key','button','wait'].includes(step.type),'Unknown test action');
    if(step.type==='tap')for(const k of ['x','y'])assert.ok(Number.isFinite(step[k])&&step[k]>=0&&step[k]<=1);
    if(step.type==='key')assert.ok(['Space','ArrowLeft','ArrowRight','Enter'].includes(step.key));
    if(step.type==='button')assert.ok(typeof step.text==='string'&&step.text.length>0&&step.text.length<=60);
    if(step.type==='wait')assert.ok(Number.isInteger(step.ms)&&step.ms>=0&&step.ms<=3000);
  }
}
export function validateCatalog(before,after,report){
  for(const old of before)assert.deepEqual(after.find(g=>g.id===old.id),old,'Existing games must remain unchanged');
  assert.equal(after.length,before.length+(report.alreadyAvailable?0:1));
  const game=after.find(g=>g.id===report.gameId);assert.ok(game);assert.equal(game.url,'games/'+report.gameId+'/');assert.equal(game.trustedPlayer,true);
  if(!report.alreadyAvailable){assert.equal(before.some(g=>g.id===report.gameId),false);assert.equal(findExistingGame(before,game.name,game.url),null,'This game is already added');assert.ok(Object.keys(game).every(k=>['id','name','url','trustedPlayer'].includes(k)));}
  return game;
}
export function validateScope(files,report,id){
  assert.ok(files.length>0&&files.length<100,'Too many files');
  for(const file of files){assert.ok(!file.includes('\\')&&!file.split('/').includes('..'));
    assert.ok(file==='.game-requests/'+id+'.json'||!report.alreadyAvailable&&(file==='assets/games.js'||file==='index.html'||file.startsWith('games/'+report.gameId+'/')),'Out-of-scope file: '+file);
  }
}
export async function run(branch,base,head='HEAD'){
  assert.ok(/^add-game\//.test(branch));const id=branch.slice('add-game/'.length);assert.ok(ID.test(id));assert.match(base,/^[a-f0-9]{40}$/);
  const report=JSON.parse(fs.readFileSync('.game-requests/'+id+'.json','utf8'));validateReport(report,id);
  const files=git('diff','--name-only',base,head).trim().split(/\r?\n/).filter(Boolean);validateScope(files,report,id);
  const game=validateCatalog(catalog(git('show',base+':assets/games.js')),catalog(fs.readFileSync('assets/games.js','utf8')),report);
  const stripVersion=s=>s.replace(/assets\/games\.js\?v=[A-Za-z0-9_.-]+/g,'assets/games.js?v=VERSION');
  assert.equal(stripVersion(fs.readFileSync('index.html','utf8')),stripVersion(git('show',base+':index.html')),'Only catalog cache version may change');
  for(const file of files){
    assert.ok(!git('ls-files','--stage','--',file).startsWith('120000'),'Symlinks are not permitted');
    if(file.startsWith('games/'+report.gameId+'/'))assert.match(file,/\.(?:html|js|json|css|wasm|data|unityweb|br|gz|png|jpe?g|webp|svg|gif|ogg|wav|mp3|mp4|ttf|woff2?|txt|md)$|\/(?:LICENSE|COPYING)(?:\.[A-Za-z]+)?$/i,'Unexpected game file');
  }
  const tracked=git('ls-files','-z').split('\0').filter(Boolean);let bytes=0;for(const file of tracked)if(!file.split('/').some(p=>p.startsWith('.')))bytes+=fs.statSync(file).size;
  assert.ok(bytes<950*1024*1024,'Site storage limit reached');
  assert.ok(fs.existsSync(game.url+'index.html'),'Game entry missing');
  for(const file of files.filter(f=>f.endsWith('.html')&&f.startsWith('games/'))){
    const html=fs.readFileSync(file,'utf8');assert.ok(!/<iframe\b[^>]*\bsrc\s*=\s*["']https?:/i.test(html),'Remote iframe game copies are not permitted');
    assert.ok(!/<script\b[^>]*\bsrc\s*=\s*["']https?:/i.test(html),'Runtime scripts must be hosted locally');
  }
  const require=createRequire(import.meta.url);
  const {chromium}=process.env.PLAYWRIGHT_MODULE?require(process.env.PLAYWRIGHT_MODULE):require('../game-tools/node_modules/playwright');
  const root=process.cwd(),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
  const server=http.createServer((req,res)=>{try{const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+decodeURIComponent(url.pathname)+(url.pathname.endsWith('/')?'index.html':''));if(!file.startsWith(root+path.sep)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-cache'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  let browser;const results=[];fs.mkdirSync('.game-addition-qa',{recursive:true});
  try{
    browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{}),args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const context=await browser.newContext();
    await context.route('https://bawybmihvidtmpfpyajg.supabase.co/functions/v1/site-control',route=>route.fulfill({json:{runtimeOrigin:'https://browse--wordbuilder--675vggg6lnyg.code.run',polytrackOrigin:'https://launch--wordbuilder--675vggg6lnyg.code.run',configRevision:1}}));
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    for(const [label,size]of[['landscape',{width:1180,height:820}],['portrait',{width:820,height:1180}],['warm-landscape',{width:1180,height:820}]]){
      await page.setViewportSize(size);const start=Date.now();await page.goto(origin+'/#/games/'+report.gameId);if(label!=='landscape')await page.reload();
      await page.waitForFunction(()=>document.getElementById('game-player')?.getAttribute('aria-busy')==='false'&&document.getElementById('game-error')?.hidden,null,{timeout:30000});
      const startupMs=Date.now()-start;assert.ok(startupMs<=(label==='landscape'?25000:12000),'Runtime starts too slowly: '+startupMs);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Horizontal clipping');
      let canvas;for(const frame of page.frames())for(const candidate of await frame.locator('canvas').all()){const box=await candidate.boundingBox();if(box?.width>=160&&box.height>=120){canvas=candidate;break;}}
      assert.ok(canvas,'A visible native game canvas is required');
      for(const step of report.qaSteps){
        if(step.type==='tap'){const box=await canvas.boundingBox();assert.ok(box);await canvas.click({position:{x:box.width*step.x,y:box.height*step.y}});}
        else if(step.type==='key')await page.keyboard.press(step.key);
        else if(step.type==='wait')await page.waitForTimeout(step.ms);
        else {let clicked=false;for(const frame of page.frames()){const button=frame.getByRole('button',{name:step.text,exact:true});if(await button.isVisible()){await button.click();clicked=true;break;}}assert.ok(clicked,'Native button missing: '+step.text);}
      }
      await page.screenshot({path:'.game-addition-qa/'+label+'.png'});results.push({label,startupMs,size});
    }
    assert.deepEqual(errors,[],'Game runtime errors');await context.close();
    fs.writeFileSync('.game-addition-qa/report.json',JSON.stringify({requestId:id,gameId:report.gameId,passed:true,sourceScopeVerified:true,viewportEmulation:true,physicalIPadTested:false,results,errors},null,2));console.log(JSON.stringify({passed:true,gameId:report.gameId,results}));
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await run(process.argv[2],process.argv[3],process.argv[4]);
