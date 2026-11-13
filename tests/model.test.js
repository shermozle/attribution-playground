import test from 'node:test';
import assert from 'node:assert/strict';
import { makeJourney, buildDataset, costEvents, purchaseOutcomes, persistedValue, attributionWeights, DAY } from '../model.js';
import { notebookPrompt } from '../guide.js';
const now = Date.UTC(2026,10,13,0);
test('one impression has multiple objects; click and purchase preserve item identity without copying promo context',()=>{
 const events=makeJourney('click','test',0,now);
 const impression=events.find(e=>e.event_type==='Promotion Impression');
 const click=events.find(e=>e.event_type==='Promotion Clicked');
 const purchase=events.at(-1);
 assert.equal(events.filter(e=>e.event_type==='Promotion Impression').length,1);
 assert.equal(impression.event_properties.products.length,3);
 assert.equal(click.event_properties.products.length,1);
 assert.equal(click.event_properties.products[0].item_id,purchase.event_properties.products[0].item_id);
 assert.equal(purchase.event_properties.products[0].campaign_code,undefined);
 assert.equal(purchase.event_properties.products[0].click_campaign,undefined);
 assert.equal(purchase.event_properties.utm_campaign,undefined);
 assert.equal(purchase.user_properties.utm_campaign,'summer_mobile_social');
 assert.equal(purchaseOutcomes(events)[0].outcome,'Click-through');
});
test('view-through requires a matching product and no eligible click',()=>{
 assert.equal(purchaseOutcomes(makeJourney('view','test',0,now))[0].outcome,'View-through only');
 const mismatch=purchaseOutcomes(makeJourney('mismatch','test',0,now))[0];
 assert.equal(mismatch.outcome,'Unattributed'); assert.equal(mismatch.impression,null);
});
test('two-item purchase keeps separate campaign sources while user profile contains only the last click',()=>{
 const outcomes=purchaseOutcomes(makeJourney('multi','test',0,now));
 assert.equal(outcomes.length,2);
 assert.equal(outcomes[0].click,'INT-PHONE-HERO');assert.equal(outcomes[1].click,'INT-BUDS-RAIL');
 assert.equal(outcomes[0].profile,'INT-BUDS-RAIL');
 assert.equal(outcomes.reduce((n,o)=>n+o.revenue,0),1398);
});
test('15-day return expires at 14 days and at session boundary but retains profile state',()=>{
 const events=makeJourney('expired','test',0,now);
 assert.equal(purchaseOutcomes(events)[0].click,null);
 assert.equal(purchaseOutcomes(events,'session')[0].click,null);
 assert.equal(purchaseOutcomes(events,'30d')[0].click,'INT-PHONE-HERO');
 assert.equal(purchaseOutcomes(events)[0].profile,'INT-PHONE-HERO');
});
test('allocation respects event time, session, user, expiration, and later-arriving session values',()=>{
 const events=[
  {user_id:'one',time:now,event_id:0,session_id:now,event_properties:{}},
  {user_id:'one',time:now+100,event_id:1,session_id:now,event_properties:{source:'a'}},
  {user_id:'one',time:now+200,event_id:2,session_id:now,event_properties:{source:'b'}},
  {user_id:'other',time:now+210,event_id:0,session_id:now,event_properties:{source:'wrong'}},
 ];
 assert.equal(persistedValue(events,events[0],{property:'source',window:'session'}),null);
 assert.equal(persistedValue(events,events[0],{property:'source',window:'session',allocation:'First known'}),'a');
 assert.equal(persistedValue(events,events[0],{property:'source',window:'session',allocation:'Last known'}),'b');
 assert.equal(persistedValue(events,events[2],{property:'source',window:'session',allocation:'Original'}),'a');
 assert.equal(persistedValue(events,events[2],{property:'source',window:'session'}),'b');
 assert.throws(()=>persistedValue(events,events[0],{property:'source',window:'14d',allocation:'Last known'}));
 assert.equal(persistedValue(events,{...events[2],time:now+15*DAY},{property:'source',window:'14d'}),null);
});
test('repeatable population includes nonconverters, controls and isolated aggregate costs',()=>{
 const events=buildDataset('repeat',48,now);
 assert.deepEqual(events,buildDataset('repeat',48,now));
 assert.equal(new Set(events.map(e=>e.user_id)).size,48);
 assert.equal(new Set(events.map(e=>e.insert_id)).size,events.length);
 assert.equal(events.filter(e=>e.event_type==='Purchase').length,40);
 const outcomes=purchaseOutcomes(events);
 assert.equal(outcomes.length,48);
 assert.equal(outcomes.filter(o=>o.outcome==='Click-through').length,24);
 assert.equal(outcomes.filter(o=>o.outcome==='View-through only').length,8);
 assert.equal(outcomes.filter(o=>o.outcome==='Unattributed').length,16);
 assert.ok(events.every(e=>e.time<now));
 assert.ok(events.every(e=>e.session_id<=e.time));
 const costs=costEvents('repeat',events);
 assert.ok(costs.every(e=>!e.user_id&&e.session_id===-1&&e.event_properties.synthetic_cost));
 assert.equal(costs.reduce((s,e)=>s+e.event_properties['ad_metrics.clicks'],0),events.filter(e=>e.event_type==='Campaign Landed').length);
 assert.ok(costs.every(e=>e.user_properties.utm_campaign===e.event_properties.utm_campaign));
});
test('teaching attribution conserves credit except participation',()=>{
 for(const model of ['First touch','Last touch','Linear','U-shaped']) assert.equal(attributionWeights(['a','b','c'],model).reduce((s,w)=>s+w.weight,0),1);
 assert.equal(attributionWeights(['a','b','c'],'Participation').reduce((s,w)=>s+w.weight,0),3);
 assert.deepEqual(attributionWeights(['a','b'],'U-shaped').map(w=>w.weight),[.5,.5]);
});
test('notebook prompt scopes exact run and names manual setup without claiming results',()=>{
 const text=notebookPrompt({project:'Demo',runId:'one-run',events:makeJourney('view','one-run',0,now),expected:{viewThroughOnly:1}});
 assert.match(text,/demo_run_id = "one-run"/); assert.match(text,/manual setup/);assert.match(text,/predictions to verify/);
 assert.match(text,/2026-11-/);assert.doesNotMatch(text,/api_key/);
});
test('notebook prompt rejects missing and placeholder run IDs',()=>{
 for(const runId of ['',undefined,'[PREPARE A DATASET FIRST]']){
  assert.throws(()=>notebookPrompt({runId,events:[],expected:{purchases:0}}),/enter an existing run ID/);
 }
});
test('existing-run prompt discovers dates and counts instead of exporting placeholders or zeros',()=>{
 const text=notebookPrompt({project:'Campaign Lab (906764)',runId:'2026-11-13-c81533b9'});
 assert.match(text,/demo_run_id = "2026-11-13-c81533b9"/);
 assert.match(text,/Campaign Lab \(906764\)/);
 assert.match(text,/Discover the earliest and latest event timestamps/);
 assert.match(text,/Do not substitute ingestion time/);
 assert.match(text,/Expected counts are not supplied/);
 assert.doesNotMatch(text,/PREPARE A DATASET FIRST|SELECT MY DEMO PROJECT|"purchases":0|undefined/);
});
test('an existing run never inherits another dataset dates or expected counts',()=>{
 const text=notebookPrompt({runId:'existing-run',events:makeJourney('view','different-run',0,now),expected:{purchases:999}});
 assert.match(text,/currently selected Amplitude project/);
 assert.match(text,/Expected counts are not supplied/);
 assert.doesNotMatch(text,/999|2026-11-13T/);
});
test('notebook prompt specifies a compact visual tour and keeps setup out of the notebook',()=>{
 const text=notebookPrompt({runId:'visual-run'});
 assert.match(text,/Maximum 220 words/);
 assert.match(text,/Maximum six chart\/table blocks plus one KPI row/);
 assert.match(text,/use only these four sections/);
 assert.match(text,/manual setup and tool limitations in your final CHAT response/);
 assert.match(text,/do not embed the result as if it worked/);
 assert.match(text,/Do not use raw string-contains/);
});
