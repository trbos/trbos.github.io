const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const directory=path.resolve(__dirname,'../../games/archers'),manifest=JSON.parse(fs.readFileSync(path.join(directory,'player.json'))),bytes=fs.readFileSync(path.join(directory,manifest.assets.framework.path)),source=bytes.toString();
const start=source.indexOf('function _emscripten_sample_gamepad_data(){'),end=source.indexOf('function registerFocusEventCallback',start),sampler=source.slice(start,end);
function sample(navigator){const context={navigator,JSEvents:{}};vm.createContext(context);vm.runInContext(sampler,context);return{run:()=>context._emscripten_sample_gamepad_data(),state:context.JSEvents};}
test('allowed controllers retain their exact native snapshot and null slots',()=>{
  const pads=[null,{id:'Controller',axes:[0,0],buttons:[]}],navigator={getGamepads(){assert.equal(this,navigator);return pads;}},f=sample(navigator);assert.equal(f.run(),0);assert.equal(f.state.lastGamepadState,pads);
});
for(const name of['SecurityError','NotAllowedError'])test(name+' makes optional controllers unavailable without throwing',()=>{
  const f=sample({getGamepads(){throw new DOMException('Controller access denied',name);}});assert.equal(f.run(),-1);assert(Array.isArray(f.state.lastGamepadState));assert.equal(f.state.lastGamepadState.length,0);
});
test('older prefixed controllers and browsers without the API remain supported',()=>{
  const pads=[],f=sample({webkitGetGamepads:()=>pads});assert.equal(f.run(),0);assert.equal(f.state.lastGamepadState,pads);const missing=sample({});assert.equal(missing.run(),-1);assert.equal(missing.state.lastGamepadState.length,0);
});
test('unrelated controller failures remain real errors',()=>{
  const error=new TypeError('Unexpected controller bug'),f=sample({getGamepads(){throw error;}});assert.throws(f.run,e=>e===error);
});
test('the shipped manifest verifies the exact patched engine bytes',()=>{
  assert(start>=0&&end>start);assert.equal(bytes.length,manifest.assets.framework.bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),manifest.assets.framework.sha256);
});
