const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const directory=path.resolve(__dirname,'../../games/hextris');
function game(){
  const writes=[],c={console,JSON,Math,Date,document:{addEventListener(){}},addEventListener(){},setInterval(){},localStorage:{setItem:(...args)=>writes.push(args)},JSONfn:{},$:()=>({ready(){}}),settings:{hexWidth:87,blockHeight:20,startDist:340,creationDt:9,scale:1,comboTime:310},trueCanvas:{width:1180,height:820},colors:['#e74c3c']};c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(directory,'js/hextris-lite.js'),'utf8'),c);vm.runInContext(fs.readFileSync(path.join(directory,'save.js'),'utf8'),c);return{c,writes};
}
test('a native run restores callable game objects, score, block distances and generation pattern',()=>{
  const {c}=game();vm.runInContext('MainHex=new Hex(87);waveone=new waveGen(MainHex);waveone.currentFunction=waveone.spiralGeneration;blocks=[new Block(2,"#e74c3c",1.6,200)];',c);
  const text=c.JSONfn.stringify({hex:c.MainHex,blocks:c.blocks,wavegen:c.waveone,score:123});assert(!text.includes('function('));const restored=c.JSONfn.parse(text);assert.equal(restored.score,123);assert.equal(restored.blocks[0].distFromHex,200);assert.equal(typeof restored.hex.rotate,'function');assert.equal(typeof restored.blocks[0].draw,'function');assert.equal(restored.wavegen.currentFunction,restored.wavegen.spiralGeneration);
});
test('legacy serialized functions and prototype fields are never executed or restored',()=>{
  const {c}=game();const restored=c.JSONfn.parse('{"hex":{"blocks":[[],[],[],[],[],[]],"rotate":"function(){globalThis.pwned=true}","__proto__":{"pwned":true}},"blocks":[],"wavegen":{"currentFunction":"function(){globalThis.pwned=true}"}}');assert.equal(typeof restored.hex.rotate,'function');assert.equal(typeof restored.wavegen.currentFunction,'function');assert.equal(c.pwned,undefined);assert.equal(restored.hex.pwned,undefined);
});
test('invalid saves leave device storage unchanged instead of clearing progress',()=>{
  const {c,writes}=game();for(const text of ['broken','null','{}','{"hex":{"blocks":[]}}'])assert.equal(Object.keys(c.JSONfn.parse(text)).length,0);assert.equal(writes.length,0);
});
