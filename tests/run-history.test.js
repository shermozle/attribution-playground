import test from 'node:test';
import assert from 'node:assert/strict';
import { makeJourney } from '../model.js';
import { completedRunRecord, rememberRun, runsForDestination } from '../run-history.js';
import { notebookPrompt } from '../guide.js';
const end=Date.UTC(2026,10,13);
function fixture(runId='run-one') {
  const events=makeJourney('multi',runId,0,end);
  return {runId,events,accepted:{projectA:events.map(e=>e.insert_id)}};
}
test('only fully confirmed sends enter recent history',()=>{
 const dataset=fixture();
 assert.equal(completedRunRecord({...dataset,accepted:{}},'projectA'),null);
 assert.equal(completedRunRecord({...dataset,accepted:{projectA:dataset.accepted.projectA.slice(1)}},'projectA'),null);
 assert.equal(completedRunRecord(dataset,'projectB'),null);
 const record=completedRunRecord(dataset,'projectA',{region:'US',sentAt:100});
 assert.equal(record.runId,'run-one');assert.equal(record.eventCount,dataset.events.length);
 assert.deepEqual(record.expected,{purchases:1,items:2,clickThrough:2,viewThroughOnly:0,unattributed:0});
 assert.equal(record.events,undefined);assert.equal(record.apiKey,undefined);
});
test('latest sent run survives replacement of the prepared dataset, scoped to destination',()=>{
 const first=completedRunRecord(fixture(),'projectA',{region:'US',sentAt:100});
 const second=completedRunRecord(fixture('run-two'),'projectA',{region:'US',sentAt:200});
 const other={...first,runId:'other-project',destination:'projectB',sentAt:300};
 const history=rememberRun(rememberRun(rememberRun([],first),second),other);
 assert.equal(runsForDestination(history,'projectA')[0].runId,'run-two');
 assert.equal(runsForDestination(history,'projectB')[0].runId,'other-project');
 assert.equal(runsForDestination(history,'projectC').length,0);
 assert.equal(runsForDestination(history,null).length,3);
});
test('recover confirmed legacy sends without inventing a send time or duplicating retries',()=>{
 const recovered=completedRunRecord(fixture(),'projectA',{region:'Unknown region'});
 assert.equal(recovered.sentAt,null);
 const sent={...recovered,region:'US',sentAt:100};
 let history=rememberRun([recovered],sent);
 history=rememberRun(history,{...sent,sentAt:200});
 assert.equal(history.length,1);assert.equal(history[0].sentAt,100);assert.equal(history[0].region,'US');
});
test('selected history metadata supplies dates and predictions without retaining raw events',()=>{
 const record=completedRunRecord(fixture(),'projectA',{region:'US',sentAt:100});
 const prompt=notebookPrompt({runId:record.runId,runMetadata:record,expected:record.expected});
 assert.match(prompt,/2026-11-13T00:00:00.000Z/);assert.match(prompt,/"items":2/);
 const unrelated=notebookPrompt({runId:'another-run',runMetadata:record,expected:record.expected});
 assert.match(unrelated,/Expected counts are not supplied/);assert.doesNotMatch(unrelated,/"items":2/);
});
