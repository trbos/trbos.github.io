const{test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const download=require('../../assets/game-download.js');
async function server(handler,run){const s=http.createServer(handler);await new Promise(r=>s.listen(0,'127.0.0.1',r));try{await run('http://127.0.0.1:'+s.address().port+'/asset');}finally{s.closeAllConnections();await new Promise(r=>s.close(r));}}
const body=Buffer.from('a verified native game asset');
test('a stalled asset resumes with Range and the completed bytes stay exact',async()=>{
 let calls=0;const retried=[];
 await server((req,res)=>{calls++;if(calls===1){res.writeHead(200,{'content-length':body.length,etag:'"v1"'});res.write(body.subarray(0,8));}else{assert.equal(req.headers.range,'bytes=8-');assert.equal(req.headers['if-range'],'"v1"');res.writeHead(206,{'content-range':`bytes 8-${body.length-1}/${body.length}`});res.end(body.subarray(8));}},async url=>assert.deepEqual(Buffer.from(await download(url,{expected:body.length,stallMs:60,onRetry:r=>retried.push(r)})),body));
 assert.equal(calls,2);assert.equal(retried[0].bytes,8);
});
test('a server ignoring Range replaces partial bytes rather than duplicating them',async()=>{
 let calls=0;const progress=[];await server((req,res)=>{calls++;res.writeHead(200,{'content-length':body.length});if(calls===1)res.write(body.subarray(0,6));else res.end(body);},async url=>assert.deepEqual(Buffer.from(await download(url,{expected:body.length,stallMs:60,onProgress:n=>progress.push(n)})),body));assert.equal(calls,2);assert.ok(progress.slice(2).includes(0));
});
test('explicit access denial is surfaced immediately without attempts to evade it',async()=>{
 let calls=0;await server((req,res)=>{calls++;res.writeHead(403);res.end('denied');},async url=>assert.rejects(download(url,{expected:body.length}),/asset_http_403/));assert.equal(calls,1);
});
test('transient HTTP errors retry but repeated stalls terminate after a bounded attempt count',async()=>{
 let calls=0;await server((req,res)=>{calls++;res.writeHead(503);res.end();},async url=>assert.rejects(download(url,{expected:body.length}),/asset_http_503/));assert.equal(calls,3);
 calls=0;await server((req,res)=>{calls++;res.writeHead(200);res.write(body.subarray(0,2));},async url=>assert.rejects(download(url,{expected:body.length,stallMs:30}),/download_stalled|aborted/));assert.equal(calls,3);
});
test('leaving aborts a pending request without starting another attempt',async()=>{
 let calls=0;const controller=new AbortController();await server((req,res)=>{calls++;res.writeHead(200);res.write(body.subarray(0,2));setTimeout(()=>controller.abort(Error('left_game')),20);},async url=>assert.rejects(download(url,{expected:body.length,signal:controller.signal}),/left_game/));assert.equal(calls,1);
});
test('invalid resumed offsets and oversized payloads cannot enter the verified cache',async()=>{
 let calls=0;await server((req,res)=>{calls++;if(calls===1){res.writeHead(200);res.write(body.subarray(0,2));}else{res.writeHead(206,{'content-range':`bytes 0-${body.length-1}/${body.length}`});res.end(body);}},async url=>assert.rejects(download(url,{expected:body.length,stallMs:30}),/invalid_asset_range/));assert.equal(calls,2);
 await server((req,res)=>res.end(Buffer.alloc(body.length+1)),async url=>assert.rejects(download(url,{expected:body.length}),/asset_too_large/));
});
