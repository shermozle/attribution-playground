import { PRODUCTS, CAMPAIGNS, SCENARIOS, makeJourney, buildDataset, costEvents, purchaseOutcomes, attributionWeights } from './model.js';
import { RECIPES, SOURCES, notebookPrompt } from './guide.js';
import { sendEvents } from './transport.js';

const $ = id => document.getElementById(id);
const money = value => new Intl.NumberFormat('en-AU', { style:'currency', currency:'AUD', maximumFractionDigits:0 }).format(value);
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let storageAvailable = true;
function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { storageAvailable = false; toast('Browser storage is unavailable or full. Keep this tab open; changes are only in memory.'); } }
const newId = () => `${new Date().toISOString().slice(0,10)}-${crypto.randomUUID().slice(0,8)}`;
// Keep connection credentials, but start with generic project labels and sample data.
const previousConnection = read('campaignlab.connection', {});
let config = read('campaignlab.connection.v2', { key:previousConnection?.key || '', region:previousConnection?.region || 'US', project:'' });
if (!config || typeof config.key !== 'string' || !['US','EU'].includes(config.region)) config = {key:'',region:'US',project:''};
let dataset = read('campaignlab.dataset.v2', { runId:'', events:[], accepted:{}, status:'' });
if (!Array.isArray(dataset.events) || !dataset.accepted) dataset = {runId:'',events:[],accepted:{},status:''};
let journey, shown = [], selectedIndex = 0, sending = false, toastTimer;
const query = new URLSearchParams(location.search);
const urlCampaign = query.has('utm_campaign') ? Object.fromEntries(Object.keys(CAMPAIGNS.google).map(k => [k, (query.get(k) || '').slice(0,200)])) : null;

function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 5000); }
function download(name, content, type = 'application/json') { const url = URL.createObjectURL(new Blob([content],{type})); const a = document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); }
async function copy(text) { try { await navigator.clipboard.writeText(text); toast('Copied to clipboard.'); } catch { toast('Clipboard unavailable. Use the download button or select the text to copy.'); } }
function route() { const id = ['journey','properties','reporting','data','notebook'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'journey'; document.querySelectorAll('.panel').forEach(p=>p.hidden = p.id!==id); document.querySelectorAll('[data-tab]').forEach(a=>{a.classList.toggle('active',a.dataset.tab===id); if(a.dataset.tab===id) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current');}); if(id==='notebook') renderPrompt(); }
window.addEventListener('hashchange',route);

function initJourney() {
  const scenario = $('scenario').value;
  const source = $('entry-source').value;
  journey = makeJourney(scenario, newId(), 0, Date.now()-60000, source==='url' ? urlCampaign : CAMPAIGNS[source]);
  shown = []; selectedIndex=0;
  $('scenario-description').textContent=SCENARIOS[scenario].detail;
  $('scenario-question').textContent=SCENARIOS[scenario].question;
  $('property-scenario').value=scenario;
  renderJourney(); renderProperties();
}
function nextLabel(event) {
  if (!event) return 'Journey complete ✓';
  const p=event.event_properties;
  return ({'Campaign Landed':`Arrive from ${p.utm_source} ↗`,'Page Viewed':'Browse phones →','Promotion Impression':'Display the banner rail →','Promotion Clicked':`Click ${p.products?.[0]?.item_name} →`,'Product Viewed':'Open product via '+(p.navigation_method==='promotion'?'promotion →':'navigation →'),'Product Added':'Add to bag →','Purchase':'Complete purchase →'})[event.event_type] || event.event_type;
}
function advance(all=false) {
  if(shown.length===journey.length)return;
  shown=journey.slice(0,all?journey.length:shown.length+1);selectedIndex=shown.length-1;renderJourney();
}
function renderJourney() {
  const last=shown.at(-1); const next=journey[shown.length];
  $('step-count').textContent=`${shown.length} / ${journey.length}`;
  $('step-progress').style.width=`${shown.length/journey.length*100}%`;
  $('next-step').textContent=nextLabel(next); $('next-step').disabled=!next; $('finish-journey').disabled=!next;
  $('event-count').textContent=`${shown.length} events`;
  const selected=shown.filter(e=>e.event_type==='Promotion Clicked').flatMap(e=>e.event_properties.products.map(p=>p.item_id));
  const art=['<div class="mini-phone"></div>','<div class="buds"></div>','<div class="router"></div>'];
  const exposed=journey.find(e=>e.event_type==='Promotion Impression').event_properties.products.map(p=>p.item_id);
  $('products').innerHTML=PRODUCTS.filter(p=>exposed.includes(p.item_id)).map((p,i)=>`<article class="product ${selected.includes(p.item_id)?'selected':''}"><div class="product-art ${p.colour}" aria-hidden="true">${art[i]}</div><div class="product-copy"><small>${p.category}</small><h4>${p.item_name}</h4><div class="product-price"><span>${money(p.price)}</span><button data-product="${p.item_id}" aria-label="Click promotion for ${p.item_name}" ${next?.event_type==='Promotion Clicked'&&next.event_properties.products[0].item_id===p.item_id?'':'disabled'}>↗</button></div></div></article>`).join('');
  $('products').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>advance()));
  $('cart-count').textContent=`Bag ${shown.find(e=>e.event_type==='Product Added')?.event_properties.products.length||0}`;
  let status='Start a journey to arrive from a campaign.';
  if(last) status=`${new Date(last.time).toLocaleString('en-AU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})} · ${last.event_type}`;
  if(last?.event_type==='Promotion Impression') status+=' · One rail event. '+last.event_properties.products.length+' product objects.';
  if(last?.event_type==='Purchase') status+=` · ${money(last.event_properties.revenue)} · No promotion codes in the purchase payload.`;
  $('store-status').textContent=status;
  $('event-list').innerHTML=shown.length?shown.map((e,i)=>`<button class="event-row ${i===selectedIndex?'active':''}" data-index="${i}"><span class="event-index">${String(i+1).padStart(2,'0')}</span><span>${e.event_type}<small>${escape(e.event_properties.utm_campaign||e.event_properties.products?.map(p=>p.item_id).join(', ')||e.event_properties.page_path||'')}</small></span>${e.event_properties.products?`<span class="event-tag">[${e.event_properties.products.length}]</span>`:''}</button>`).join(''):'<p class="empty">Your journey will appear here.</p>';
  $('event-list').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{selectedIndex=Number(b.dataset.index);renderJourney();}));
  $('event-payload').textContent=shown.length?JSON.stringify(shown[selectedIndex],null,2):'Start the journey to inspect its first event.';
}

const valueCell = v=>v?`<code>${escape(v)}</code>`:'<span class="value-null">— missing</span>';
function renderProperties() {
  const allocation=$('allocation').value;
  const whole=['First known','Last known'].includes(allocation);
  if(whole)$('expiration').value='session';
  [...$('expiration').options].forEach(o=>o.disabled=whole&&o.value!=='session');
  const scenario=$('property-scenario').value;
  const events=makeJourney(scenario,'property-preview');
  const outcomes=purchaseOutcomes(events,$('expiration').value,allocation);
  $('property-results').innerHTML=outcomes.length?`<div class="table-scroll"><table><thead><tr><th>Purchased item</th><th>Raw campaign</th><th>User property<br>last_clicked_promo</th><th>Persisted click</th><th>Persisted impression</th><th>Outcome</th></tr></thead><tbody>${outcomes.map(o=>`<tr><td><strong>${o.name}</strong><small>${o.item} · ${money(o.revenue)}</small></td><td>${valueCell(o.raw)}</td><td>${valueCell(o.profile)}</td><td>${valueCell(o.click)}</td><td>${valueCell(o.impression)}</td><td><span class="outcome ${o.outcome==='Unattributed'?'none':o.outcome.startsWith('View')?'view':''}">${o.outcome}</span></td></tr>`).join('')}</tbody></table></div>`:'<p class="empty">This visitor never purchases. Keep them in the funnel denominator.</p>';
  const explanations={click:'The raw purchase has no campaign code. Its clicked product can still receive the earlier promotion context.',view:'There is no promo click. A matching item exposure can supply viewed context; this is an association, not evidence of lift.',mismatch:'CASE-04 was never in the impression. User identity alone would incorrectly connect this purchase to the phone or buds.',multi:'The last-click profile field says BUDS for the whole user. Item binding keeps PHONE and BUDS attached to their own sources.',expired:'The profile still remembers the click. The 15-day gap exceeds a 14-day expiration; try 30 days to recover the earlier item context.',abandon:'An impression or click is not a purchase. The non-converter is intentional.'};
  $('property-explanation').textContent=explanations[scenario]+(whole?' First known / Last known can fill earlier events in a session; this particular journey has no late signal after purchase.':'');
}
function renderCredit() {
  const model=$('attribution-model').value;
  const weights=attributionWeights(['Google','Facebook','Email'],model);
  $('credit-bars').innerHTML=weights.map(w=>`<div class="credit-row"><span>${w.campaign}</span><div class="credit-track"><div class="credit-fill" style="width:${w.weight*100}%"></div></div><strong>${money(w.weight*1200)} <span class="muted">${Math.round(w.weight*100)}%</span></strong></div>`).join('');
  $('credit-note').textContent=model==='Participation'?'Participation gives every eligible campaign full credit: $3,600 across rows from a $1,200 conversion. Do not sum those rows as incremental revenue.':'These weights illustrate credit for one simple conversion. Actual Amplitude results depend on metric type, eligibility, lookback, property values and query rules.';
}

function counts(events) {const outcomes=purchaseOutcomes(events);return {purchases:events.filter(e=>e.event_type==='Purchase').length,items:outcomes.length,clickThrough:outcomes.filter(o=>o.outcome==='Click-through').length,viewThroughOnly:outcomes.filter(o=>o.outcome==='View-through only').length,unattributed:outcomes.filter(o=>o.outcome==='Unattributed').length};}
function persistDataset(){save('campaignlab.dataset.v2',dataset);}
function setDataset(events) {dataset={runId:events[0]?.event_properties.demo_run_id||'',events,accepted:{},status:'Prepared locally. Not sent.'};persistDataset();renderDataset();toast(`Prepared ${events.length} events. Review, then send when ready.`);}
function renderDataset() {
  const ready=dataset.events.length>0;
  $('dataset-badge').textContent=ready?dataset.runId:'No dataset prepared';
  const visitors=new Set(dataset.events.map(e=>e.user_id).filter(Boolean)).size;
  const summary=counts(dataset.events);
  $('dataset-stats').innerHTML=`<div class="stat"><strong>${dataset.events.length}</strong><small>events</small></div><div class="stat"><strong>${visitors}</strong><small>visitors</small></div><div class="stat"><strong>${summary.purchases}</strong><small>purchases</small></div>`;
  $('send-data').disabled=!ready||!config.key||sending;
  $('export-data').disabled=!ready;
  $('send-status').textContent=dataset.status||'No events have been sent.';
  $('dataset-json').textContent=JSON.stringify(dataset.events,null,2);
  const rows=Object.entries(SCENARIOS).map(([id,s])=>{const events=dataset.events.filter(e=>e.event_properties.demo_scenario===id);const c=counts(events);return `<tr><td><strong>${s.title}</strong></td><td>${new Set(events.map(e=>e.user_id)).size}</td><td>${c.purchases}</td><td>${c.clickThrough}</td><td>${c.viewThroughOnly}</td><td>${c.unattributed}</td></tr>`;});
  $('expected-results').className=ready?'':'empty';
  $('expected-results').innerHTML=ready?`<div class="table-scroll"><table><thead><tr><th>Story</th><th>Visitors</th><th>Orders</th><th>Click items</th><th>View-only items</th><th>Unattributed items</th></tr></thead><tbody>${rows.join('')}</tbody></table></div><p class="micro-note">Run filter: <code>${escape(dataset.runId)}</code> · ${new Date(Math.min(...dataset.events.map(e=>e.time))).toLocaleDateString('en-AU')} – ${new Date(Math.max(...dataset.events.map(e=>e.time))).toLocaleDateString('en-AU')} · ${summary.items} purchased items. Item totals exceed orders when a basket has multiple products.</p>`:'Prepare a dataset to see its acceptance checks.';
  renderPrompt();
}
function renderPrompt(){const runId=dataset.runId||'[PREPARE A DATASET FIRST]';$('notebook-prompt').value=notebookPrompt({project:config.project,runId,events:dataset.events,expected:counts(dataset.events)});$('prompt-run').textContent=runId;}
function renderConnection(){const connected=!!config.key;$('connection-badge').innerHTML=`<i></i> ${connected?'Key saved · '+escape(config.region):'Preview mode'}`;$('connection-badge').classList.toggle('connected',connected);$('connect-open').textContent=connected?'Project settings ↗':'Connect project ↗';$('destination').textContent=connected?`Destination: ${config.region} data region${config.project?' · '+config.project:''}. API key saved; connection is verified only when events are accepted.`:'Connect a project API key to send.';$('project-name').value=config.project||'';renderDataset();}
async function sendDataset(){
  if(sending||!dataset.events.length||!config.key)return;
  sending=true;
  ['generate-data','use-journey','include-costs','visitor-count','connect-open'].forEach(id=>$(id).disabled=true);
  const frozen={key:config.key,region:config.region};
  try{
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(frozen.region+':'+frozen.key));
    const destination=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
    const accepted=new Set(dataset.accepted[destination]||[]);
    dataset.status=`Sending to ${frozen.region}… ${accepted.size}/${dataset.events.length} already accepted.`;renderDataset();
    await sendEvents({apiKey:frozen.key,region:frozen.region,events:dataset.events,accepted,onProgress:(n,total)=>{dataset.accepted[destination]=[...accepted];dataset.status=`${n}/${total} events accepted by Amplitude (${frozen.region}).`;persistDataset();$('send-status').textContent=dataset.status;}});
    dataset.status=`All ${dataset.events.length} events accepted by Amplitude (${frozen.region}). Ingestion acceptance is not chart verification; allow processing time and check Data → Events with run ${dataset.runId}.`;
    toast('Events accepted. Open the reporting guide to configure your charts.');
  }catch(error){dataset.status=error.message;toast(error.message);}
  finally{sending=false;persistDataset();['generate-data','use-journey','include-costs','visitor-count','connect-open'].forEach(id=>$(id).disabled=false);renderDataset();}
}

for(const id of ['scenario','property-scenario']) $(id).innerHTML=Object.entries(SCENARIOS).map(([k,v])=>`<option value="${k}">${v.title}</option>`).join('');
if(urlCampaign){$('entry-source').querySelector('[value="url"]').hidden=false;$('entry-source').value='url';}
$('scenario').addEventListener('change',initJourney);$('entry-source').addEventListener('change',initJourney);
$('next-step').addEventListener('click',()=>advance());$('finish-journey').addEventListener('click',()=>advance(true));$('restart-journey').addEventListener('click',initJourney);
$('copy-campaign-url').addEventListener('click',()=>{const url=new URL(location.href);url.hash='journey';url.search='';Object.entries($('entry-source').value==='url'?urlCampaign:CAMPAIGNS[$('entry-source').value]).forEach(([k,v])=>url.searchParams.set(k,v));copy(url.href);});
$('export-journey').addEventListener('click',()=>{if(!shown.length)return toast('Play a journey first.');download(`journey-${journey[0].event_properties.demo_run_id}.json`,JSON.stringify(shown,null,2));});
['property-scenario','allocation','expiration'].forEach(id=>$(id).addEventListener('change',renderProperties));$('attribution-model').addEventListener('change',renderCredit);
$('recipes').innerHTML=RECIPES.map((r,i)=>`<details class="recipe card" ${i===0?'open':''}><summary><small>${r.time}</small>${r.title}</summary><div class="recipe-body">${r.body}</div></details>`).join('');
$('source-links').innerHTML=SOURCES.map(([label,url])=>`<a href="${url}" target="_blank" rel="noreferrer">${label} ↗</a>`).join('');
$('guide-download').addEventListener('click',()=>{const text=RECIPES.map(r=>{const div=document.createElement('div');div.innerHTML=r.body.replaceAll('</p>','</p>\n\n');return `## ${r.title}\n\n${div.textContent}`;}).join('\n\n');download('campaign-lab-walkthrough.md','# Campaign lab walkthrough\n\n'+text+'\n\n## Sources\n'+SOURCES.map(([l,u])=>`- [${l}](${u})`).join('\n'),'text/markdown');});
$('generate-data').addEventListener('click',()=>{let events=buildDataset(newId(),Number($('visitor-count').value));if($('include-costs').checked)events=[...events,...costEvents(events[0].event_properties.demo_run_id,events)];setDataset(events);});
$('use-journey').addEventListener('click',()=>{if(!shown.length)return toast('Play a journey first.');setDataset(structuredClone(shown));});
$('send-data').addEventListener('click',sendDataset);$('export-data').addEventListener('click',()=>download(`events-${dataset.runId}.json`,JSON.stringify(dataset.events,null,2)));
$('open-notebook').addEventListener('click',()=>location.hash='notebook');
$('connect-open').addEventListener('click',()=>{$('api-key').value=config.key;$('region').value=config.region;$('connect-dialog').showModal();});
$('connect-close').addEventListener('click',()=>$('connect-dialog').close());
$('connection-form').addEventListener('submit',event=>{event.preventDefault();config.key=$('api-key').value.trim();config.region=$('region').value;save('campaignlab.connection.v2',config);$('connect-dialog').close();renderConnection();toast(storageAvailable?'Connection settings saved locally.':'Settings are available for this tab only.');});
$('forget-key').addEventListener('click',()=>{config.key='';save('campaignlab.connection.v2',config);$('api-key').value='';$('connect-dialog').close();renderConnection();toast('Project key removed from this browser.');});
$('project-name').addEventListener('input',()=>{config.project=$('project-name').value.slice(0,200);save('campaignlab.connection.v2',config);renderPrompt();});
$('copy-prompt').addEventListener('click',()=>copy($('notebook-prompt').value));$('download-prompt').addEventListener('click',()=>download(`notebook-${dataset.runId||'template'}.txt`,$('notebook-prompt').value,'text/plain'));
initJourney();renderCredit();renderConnection();route();
