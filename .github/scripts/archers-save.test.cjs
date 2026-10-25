const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function bridge(initial={}){
 const values=new Map(Object.entries(initial)),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k),clear:()=>values.clear(),key:i=>[...values.keys()][i]??null,get length(){return values.size;}};
 const c={document:{addEventListener(){}},navigator:{maxTouchPoints:0},queueMicrotask,Uint8Array,atob,btoa,addEventListener(){}};c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../games/archers/local-sdk.js'),'utf8'),c);const sdk=c.createArchersPlatform({storage,markReady(){}});return{c,sdk,values};
}
function filesystem(initial={}){const files=new Map(Object.entries(initial).map(([key,value])=>[key,Uint8Array.from(value)])),reads=[];return{files,reads,mkdirTree(){},writeFile:(p,b)=>files.set(p,Uint8Array.from(b)),readFile:p=>{reads.push(p);return files.get(p);},readdir:p=>['.','..',...[...files.keys()].filter(k=>k.startsWith(p+'/')).map(k=>k.slice(p.length+1).split('/')[0])].filter((v,i,a)=>a.indexOf(v)===i),stat:p=>({mode:files.has(p)?'file':'directory',size:files.get(p)?.length||0}),isDir:m=>m==='directory',isFile:m=>m==='file'};}
test('native PlayerPrefs binary bytes survive a fresh local platform instance',()=>{
 const a=bridge(),native=filesystem({'/idbfs/test/PlayerPrefs':[0,255,10,13,128]});a.c.ArchersLocalFiles.sync(native,false);const b=bridge(Object.fromEntries(a.values)),restored=filesystem();b.c.ArchersLocalFiles.sync(restored,true);assert.deepEqual([...restored.files.get('/idbfs/test/PlayerPrefs')],[0,255,10,13,128]);
});
test('restoring malformed paths never reads or writes another game or launcher data',()=>{
 const a=bridge({'unity:file:/idbfs/../ownerToken':'YQ==','unity:file:/other-game/PlayerPrefs':'Yg==','data_v1':'{"Skulls":90}'}),native=filesystem();a.c.ArchersLocalFiles.sync(native,true);assert.equal(native.files.size,0);assert.equal(a.sdk.data.getItem('data_v1'),'{"Skulls":90}');
});
test('deleted native files are removed while unrelated game data is preserved',()=>{
 const a=bridge({'unity:file:/idbfs/test/PlayerPrefs':'YQ==','data_v1':'{"ArmorUpgrade":1}'});a.c.ArchersLocalFiles.sync(filesystem(),false);assert(!a.values.has('unity:file:/idbfs/test/PlayerPrefs'));assert.equal(a.sdk.data.getItem('data_v1'),'{"ArmorUpgrade":1}');
});
test('oversize native files are not copied into launcher storage',()=>{
 const a=bridge(),native=filesystem({'/idbfs/test/oversize':new Uint8Array(393217)});a.c.ArchersLocalFiles.sync(native,false);assert.equal(native.reads.length,0);assert.equal(a.values.size,0);
});
