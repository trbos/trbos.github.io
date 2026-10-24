import {test}from'node:test';import assert from'node:assert/strict';
import{catalog,validateReport,validateCatalog,validateScope}from'../scripts/check-game-addition.mjs';
const id='fdcb6250-9479-4a18-9c08-c308ca39af49';
const report=()=>({requestId:id,name:'Example game',stage:'ready',gameId:'new-game',license:{name:'MIT',url:'https://example.com/LICENSE'},quality:{passed:true,adFree:true,contentAppropriate:true,played:true,retried:true,controls:true,sourcesCompared:['https://example.com/source','https://github.com/example/game'],coldMs:3000,warmMs:2000,evidence:'Native play, loss and retry inspected in landscape and portrait screenshots.'},qaSteps:[{type:'tap',x:.5,y:.5},{type:'key',key:'Space'}]});
const old={id:'existing',name:'Existing game',url:'games/existing/',trustedPlayer:true},fresh={id:'new-game',name:'New game',url:'games/new-game/',trustedPlayer:true};
test('quality requires content, native play/retry, two sources, permission, startup evidence and safe CI actions',()=>{
  assert.doesNotThrow(()=>validateReport(report(),id));
  for(const change of [r=>r.stage='testing',r=>r.quality.played=false,r=>r.quality.adFree=false,r=>r.quality.sourcesCompared=['https://example.com'],r=>delete r.license,r=>r.quality.warmMs=50000,r=>r.qaSteps=[{type:'shell',command:'anything'}],r=>r.qaSteps=[{type:'wait',ms:50000}]]){const r=report();change(r);assert.throws(()=>validateReport(r,id));}
});
test('catalog append preserves every existing game, route and trust setting',()=>{
  assert.deepEqual(validateCatalog([old],[old,fresh],report()),fresh);
  assert.throws(()=>validateCatalog([old],[{...old,url:'https://evil.invalid'},fresh],report()));
  assert.throws(()=>validateCatalog([old],[old,{...fresh,url:'https://evil.invalid/'}],report()));
  assert.throws(()=>validateCatalog([old],[old,fresh,{...fresh,id:'another'}],report()));
  assert.throws(()=>validateCatalog([old],[old,{...fresh,name:'EXISTING-game'}],report()),/already added/);
  assert.equal(catalog('const games=[Object.freeze('+JSON.stringify(old)+'),Object.freeze('+JSON.stringify(fresh)+')];').length,2);
});
test('patch cannot rewrite owner controls, other games, authentication, workflows, quality rules or paths outside its game',()=>{
  const r=report();validateScope(['assets/games.js','index.html','games/new-game/index.html','.game-requests/'+id+'.json'],r,id);
  for(const file of ['assets/owner.js','polytrack/cloud-backup.js','.github/workflows/game-additions-check.yml','GAME_ADDITIONS.md','games/existing/index.html','games/new-game/../existing.js'])assert.throws(()=>validateScope([file],r,id));
  assert.throws(()=>validateScope(['assets/games.js'],{...r,alreadyAvailable:true},id));
});
