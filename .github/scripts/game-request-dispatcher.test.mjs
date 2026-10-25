import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameDispatcher} from './game-request-dispatcher.ts';
import {monitorGameRequest} from './game-request-monitor.ts';

test('deployed dispatcher imports its dependencies and checks an idle queue without GitHub calls',async()=>{
 const calls=[];
 const pump=createGameDispatcher({token:'test-only',rpc:async value=>{calls.push(value);return {idle:true};},fetch:async()=>{throw Error('Unexpected external call');}});
 assert.deepEqual(await monitorGameRequest({pump,sleep:async()=>{throw Error('Idle monitor should stop');}}),{idle:true,busy:false});
 assert.deepEqual(calls,[{p_action:'claim'}]);
});

test('a leased request stays busy without starting duplicate work',async()=>{
 const pump=createGameDispatcher({token:'test-only',rpc:async()=>({busy:true}),fetch:async()=>{throw Error('Unexpected duplicate worker');}});
 assert.deepEqual(await pump(),{idle:true,busy:true});
});
