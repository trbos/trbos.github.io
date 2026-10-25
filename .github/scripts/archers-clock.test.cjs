const {test}=require('node:test'),assert=require('node:assert/strict');
const install=require('../../games/archers/animation-clock.js');
function fixture(){
  let time=0,serial=0,shown=true;const timers=new Map(),frames=new Map(),stats={native:0,timer:0};
  const scope={document:new EventTarget(),performance:{now:()=>time},setTimeout(fn,delay){const id=++serial;timers.set(id,{fn,due:time+delay});return id;},clearTimeout:id=>timers.delete(id),requestAnimationFrame(fn){const id=++serial;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id)};
  const original=scope.requestAnimationFrame,clock=install({scope,visible:()=>shown,stats});
  function advance(ms){const target=time+ms;for(;;){const next=[...timers].sort((a,b)=>a[1].due-b[1].due)[0];if(!next||next[1].due>target)break;time=next[1].due;timers.delete(next[0]);next[1].fn();}time=target;}
  return{scope,clock,stats,frames,timers,advance,original,show(value){shown=value;scope.document.dispatchEvent(new Event('visibilitychange'));},native(stamp=time){const batch=[...frames.values()];frames.clear();for(const fn of batch)fn(stamp);}};
}
test('normal native timing wins and cancels its fallback',()=>{
  const f=fixture(),calls=[];f.scope.requestAnimationFrame(t=>calls.push(t));f.advance(16);f.native();f.advance(1000);assert.deepEqual(calls,[16]);assert.deepEqual(f.stats,{native:1,timer:0});assert.equal(f.timers.size,0);f.clock.dispose();
});
test('a stalled native clock drives real callbacks, once each, with monotonic time',()=>{
  const f=fixture(),calls=[];function frame(t){calls.push(t);if(calls.length<4)f.scope.requestAnimationFrame(frame);}f.scope.requestAnimationFrame(frame);const late=[...f.frames.values()][0];f.advance(550);assert.equal(calls.length,4);assert.equal(f.stats.timer,4);assert(calls.every((t,i)=>!i||t>calls[i-1]));late(551);assert.equal(calls.length,4);assert.equal(f.frames.size,0);f.clock.dispose();
});
test('hidden tabs receive no timer frames; returning resumes the pending callback',()=>{
  const f=fixture();let count=0;f.scope.requestAnimationFrame(()=>count++);f.show(false);f.advance(10000);assert.equal(count,0);assert.equal(f.timers.size,0);f.show(true);f.advance(500);assert.equal(count,1);f.clock.dispose();
});
test('cancellation and disposal remove native requests, timers and the wrapper',()=>{
  const f=fixture();let count=0;const id=f.scope.requestAnimationFrame(()=>count++);f.scope.cancelAnimationFrame(id);f.advance(2000);f.native();assert.equal(count,0);f.scope.requestAnimationFrame(()=>count++);f.clock.dispose();f.clock.dispose();f.advance(2000);f.native();assert.equal(count,0);assert.equal(f.frames.size,0);assert.equal(f.timers.size,0);assert.equal(f.scope.requestAnimationFrame,f.original);
});
test('native frames can take over again after a stalled request recovers',()=>{
  const f=fixture();f.scope.requestAnimationFrame(()=>{});f.advance(500);f.scope.requestAnimationFrame(()=>{});f.advance(5);f.native();assert.deepEqual(f.stats,{native:1,timer:1});let count=0;f.scope.requestAnimationFrame(()=>count++);f.advance(40);assert.equal(count,0);f.native();assert.equal(count,1);f.clock.dispose();
});
test('clock recovery never moves a game timestamp backwards',()=>{
  const f=fixture(),calls=[];f.scope.requestAnimationFrame(t=>calls.push(t));f.advance(500);f.scope.requestAnimationFrame(t=>calls.push(t));f.native(490);assert.deepEqual(calls,[500,500]);f.clock.dispose();
});
