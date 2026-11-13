import test from 'node:test';
import assert from 'node:assert/strict';
import {sendEvents} from '../transport.js';
const events=Array.from({length:85},(_,i)=>({insert_id:`stable-${i}`,event_type:'Test'}));
const response=(status,body)=>({status,ok:status>=200&&status<300,json:async()=>body});
test('sends to selected region in bounded batches and skips already accepted IDs',async()=>{
 const calls=[],accepted=new Set(['stable-0']);
 await sendEvents({apiKey:'demo',region:'EU',events,accepted,fetchImpl:async(url,opts)=>{const body=JSON.parse(opts.body);calls.push({url,body});return response(200,{code:200,events_ingested:body.events.length});}});
 assert.deepEqual(calls.map(c=>c.body.events.length),[40,40,4]);assert.ok(calls.every(c=>c.url==='https://api.eu.amplitude.com/2/httpapi'));assert.equal(accepted.size,85);
 await sendEvents({apiKey:'demo',region:'EU',events,accepted,fetchImpl:async()=>assert.fail('must not resend')});
});
test('retries transient failures with stable payload IDs',async()=>{
 const payloads=[],waits=[];let i=0;
 await sendEvents({apiKey:'demo',region:'US',events:events.slice(0,2),sleep:async ms=>waits.push(ms),fetchImpl:async(_,opts)=>{payloads.push(opts.body);return ++i<3?response(429,{}):response(200,{code:200,events_ingested:2});}});
 assert.equal(new Set(payloads).size,1);assert.deepEqual(waits,[1000,2000]);
});
test('partial and invalid-key responses do not mark a batch fully accepted',async()=>{
 for(const [status,body] of [[400,{error:'bad key'}],[200,{code:200,events_ingested:1}]]){
  const accepted=new Set();await assert.rejects(sendEvents({apiKey:'demo',region:'US',events:events.slice(0,2),accepted,fetchImpl:async()=>response(status,body)}));assert.equal(accepted.size,0);
 }
});
test('preserves accepted batches on later failure and stops repeated network errors',async()=>{
 const accepted=new Set();let i=0;
 await assert.rejects(sendEvents({apiKey:'demo',region:'US',events,accepted,fetchImpl:async()=>++i===1?response(200,{code:200,events_ingested:40}):response(400,{code:400})}));
 assert.equal(accepted.size,40);
 let attempts=0;await assert.rejects(sendEvents({apiKey:'demo',region:'US',events:events.slice(0,1),sleep:async()=>{},fetchImpl:async()=>{attempts++;throw new Error('offline');}}));assert.equal(attempts,4);
});
test('missing key and invalid region do not transmit',async()=>{
 for(const config of [{apiKey:'',region:'US'},{apiKey:'demo',region:'INVALID'}]) await assert.rejects(sendEvents({...config,events,fetchImpl:async()=>assert.fail('must not send')}));
});
